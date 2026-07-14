// FrameProcessor — the capture-agnostic core of live draft capture:
// frame gating → Vision OCR → the bundled JS parse engine (JavaScriptCore,
// assets/engine.js — the SAME tested engine the app runs) → App Group state
// handoff → Live Activity push via the live-activity-relay Edge Function.
//
// Constraints designed around (DEVELOPMENT_NOTES / ADR-019/020):
// - ~50 MB jetsam limit: one frame in flight, downscaled, autoreleasepool,
//   os_proc_available_memory() guard degrades scale + recognition level.
// - ActivityKit is unreachable from extensions: pushes go through the relay.
// - Raw frames never leave the process; only derived glance JSON is sent.
// - Priority-10 APNs budget: p10 only for "significant" transitions (engine
//   decides), p5 otherwise, paced to one push per 3 s.
import CoreImage
import CoreMedia
import Darwin
import Foundation
import JavaScriptCore
import ReplayKit
import Vision
import os.log

final class FrameProcessor {
  static let appGroup = "group.com.bestballexposures.app"

  private let log = OSLog(subsystem: "com.bestballexposures.app.draftbroadcast", category: "capture")
  private let queue = DispatchQueue(label: "bbe.frameprocessor", qos: .userInitiated)
  private let ciContext = CIContext(options: [.cacheIntermediates: false])

  private var jsContext: JSContext?
  private var relayUrl: String?
  private var anonKey: String?
  private var pushToken: String?

  private var sessionActive = false
  private var paused = false
  private var busy = false
  private var lastProcessedAt: CFAbsoluteTime = 0
  private var lastPushAt: CFAbsoluteTime = 0
  private var lastThumb: [UInt8]?

  var onSessionEnded: (() -> Void)?

  private var defaults: UserDefaults? { UserDefaults(suiteName: Self.appGroup) }

  // MARK: lifecycle

  func start() {
    queue.async { self.setUp() }
  }

  func setPaused(_ value: Bool) {
    queue.async { self.paused = value }
  }

  func finish() {
    queue.async {
      self.sessionActive = false
      self.defaults?.set(false, forKey: "bbe.extensionCapturing")
    }
  }

  private func setUp() {
    guard let configJson = defaults?.string(forKey: "bbe.sessionConfig"), !configJson.isEmpty else {
      os_log("no bbe.sessionConfig — start a Live Session in BBE first", log: log, type: .error)
      defaults?.set(false, forKey: "bbe.extensionCapturing")
      onSessionEnded?()
      return
    }
    if let data = configJson.data(using: .utf8),
       let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
      relayUrl = obj["relayUrl"] as? String
      anonKey = obj["anonKey"] as? String
      pushToken = obj["pushToken"] as? String
    }

    guard let ctx = JSContext() else {
      os_log("JSContext creation failed", log: log, type: .fault)
      return
    }
    ctx.exceptionHandler = { [weak self] _, exception in
      guard let self else { return }
      os_log("engine JS exception: %{public}@", log: self.log, type: .error,
             exception?.toString() ?? "unknown")
    }
    guard
      let engineUrl = Bundle(for: FrameProcessor.self).url(forResource: "engine", withExtension: "js"),
      let source = try? String(contentsOf: engineUrl, encoding: .utf8)
    else {
      os_log("engine.js missing from extension bundle", log: log, type: .fault)
      return
    }
    ctx.evaluateScript(source)
    let initResult = ctx.objectForKeyedSubscript("BBEEngine")?
      .invokeMethod("init", withArguments: [configJson])?
      .toString() ?? "error: no engine"
    guard initResult == "ok" else {
      os_log("engine init failed: %{public}@", log: log, type: .fault, initResult)
      return
    }
    jsContext = ctx
    sessionActive = true
    defaults?.set(true, forKey: "bbe.extensionCapturing")
    defaults?.set(Date().timeIntervalSince1970, forKey: "bbe.extensionHeartbeat")
    os_log("live capture started", log: log, type: .info)
  }

  // MARK: frames

  func enqueue(_ sampleBuffer: CMSampleBuffer) {
    // Cheap main-path gate: one frame in flight, ~0.8 fps ceiling.
    guard sessionActive, !paused, !busy,
          CFAbsoluteTimeGetCurrent() - lastProcessedAt >= 1.2,
          let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    busy = true
    lastProcessedAt = CFAbsoluteTimeGetCurrent()

    var orientation = CGImagePropertyOrientation.up
    if let attachment = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
       let parsed = CGImagePropertyOrientation(rawValue: attachment.uint32Value) {
      orientation = parsed
    }
    let image = CIImage(cvPixelBuffer: pixelBuffer)
    queue.async { [weak self] in
      autoreleasepool { self?.process(image, orientation: orientation) }
      self?.busy = false
    }
  }

  private func stillActive() -> Bool {
    guard let configJson = defaults?.string(forKey: "bbe.sessionConfig"), !configJson.isEmpty else {
      return false
    }
    return true
  }

  private func process(_ image: CIImage, orientation: CGImagePropertyOrientation) {
    guard sessionActive else { return }
    guard stillActive() else {
      sessionActive = false
      defaults?.set(false, forKey: "bbe.extensionCapturing")
      onSessionEnded?()
      return
    }
    defaults?.set(Date().timeIntervalSince1970, forKey: "bbe.extensionHeartbeat")

    let tight = Int(os_proc_available_memory()) < 25 * 1024 * 1024
    let scale: CGFloat = tight ? 0.4 : 0.6
    let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    guard let cgImage = ciContext.createCGImage(scaled, from: scaled.extent) else { return }
    if isDuplicate(cgImage) { return }

    let items = recognize(cgImage: cgImage, orientation: orientation, fast: tight)
    guard items.count >= 4 else { return } // not a text-dense screen
    ingest(items)
  }

  /// 24×24 grayscale thumbnail diff. Clock-only ticks stay under the
  /// threshold (good — they don't change draft state); a new pick, scroll, or
  /// app switch blows well past it.
  private func isDuplicate(_ cgImage: CGImage) -> Bool {
    let side = 24
    var pixels = [UInt8](repeating: 0, count: side * side)
    let ok = pixels.withUnsafeMutableBytes { buffer -> Bool in
      guard let ctx = CGContext(
        data: buffer.baseAddress, width: side, height: side,
        bitsPerComponent: 8, bytesPerRow: side,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
      ) else { return false }
      ctx.interpolationQuality = .low
      ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
      return true
    }
    guard ok else { return false }
    defer { lastThumb = pixels }
    guard let last = lastThumb, last.count == pixels.count else { return false }
    var delta = 0
    for i in 0..<pixels.count {
      delta += abs(Int(pixels[i]) - Int(last[i]))
      if delta >= 900 { return false }
    }
    return true
  }

  private func recognize(cgImage: CGImage, orientation: CGImagePropertyOrientation, fast: Bool) -> [[String: Any]] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = fast ? .fast : .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      os_log("Vision failed: %{public}@", log: log, type: .error, error.localizedDescription)
      return []
    }
    return (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "x": Double(box.minX),
        "y": Double(1.0 - box.maxY),
        "w": Double(box.width),
        "h": Double(box.height),
      ]
    }
  }

  // MARK: engine + outputs

  private func ingest(_ items: [[String: Any]]) {
    guard
      let ctx = jsContext,
      let itemsData = try? JSONSerialization.data(withJSONObject: items),
      let itemsJson = String(data: itemsData, encoding: .utf8),
      let raw = ctx.objectForKeyedSubscript("BBEEngine")?
        .invokeMethod("ingest", withArguments: [itemsJson])?.toString(),
      let data = raw.data(using: .utf8),
      let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      (result["ok"] as? Bool) == true
    else { return }

    // Hand the full result to the app (it hydrates its session on foreground).
    defaults?.set(raw, forKey: "bbe.extensionResult")

    let changed = result["changed"] as? Bool ?? false
    let significant = result["significant"] as? Bool ?? false
    guard changed, let glance = result["glance"] as? [String: Any] else { return }

    let now = CFAbsoluteTimeGetCurrent()
    guard significant || now - lastPushAt >= 3.0 else { return }
    lastPushAt = now
    pushGlance(glance, priority: significant ? 10 : 5)
  }

  private func pushGlance(_ glance: [String: Any], priority: Int) {
    guard
      let relayUrl, let url = URL(string: relayUrl),
      let pushToken, !pushToken.isEmpty,
      let body = try? JSONSerialization.data(withJSONObject: [
        "token": pushToken,
        "contentState": glance,
        "priority": priority,
      ] as [String: Any])
    else { return }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 8
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let anonKey {
      request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
      request.setValue(anonKey, forHTTPHeaderField: "apikey")
    }
    request.httpBody = body
    let taskLog = log
    URLSession.shared.dataTask(with: request) { _, response, error in
      if let error {
        os_log("relay push failed: %{public}@", log: taskLog, type: .error, error.localizedDescription)
      } else if let http = response as? HTTPURLResponse, http.statusCode >= 300 {
        os_log("relay push HTTP %d", log: taskLog, type: .error, http.statusCode)
      }
    }.resume()
  }
}
