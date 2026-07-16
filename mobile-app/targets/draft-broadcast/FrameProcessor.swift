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
// - Event-driven push policy (ADR-024): a priority-10 push on each detected pick
//   (currentPick advance) or "significant" transition, floored to 3 s; nothing
//   pushed while idle. Priority 5 is not used — iOS defers it ("opportunistic"),
//   which froze the card whenever the user was more than a few picks away.
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
  private var lastPushedPick = 0   // highest currentPick already pushed (ADR-024)
  private var lastPushedTargets: [String] = []  // target list last pushed (TASK-336)
  private var lastIngestAt: CFAbsoluteTime = 0  // last frame that reached the engine
  private var lastTickAt: CFAbsoluteTime = 0    // last presence tick (TASK-336)
  private var configEpoch: Double = 0           // app-stamped; changes on board reset
  private var lastThumb: [UInt8]?

  // Session frame recorder (TASK-331): every ingested frame's OCR items are
  // appended as one JSONL line so the whole draft can be replayed through the
  // engine offline. Append-only file I/O on the processing queue — nothing
  // accumulates in memory.
  private var frameLog: FileHandle?
  private var frameLogBytes = 0
  private static let frameLogCap = 20 * 1024 * 1024

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
      try? self.frameLog?.close()
      self.frameLog = nil
    }
  }

  // MARK: frame recorder (TASK-331)

  /// One recording retained at a time: stale frames-*.jsonl are deleted on
  /// every session start; a new file is created only when recording is on.
  private func setUpFrameLog(enabled: Bool) {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: Self.appGroup
    ) else { return }
    let old = (try? FileManager.default.contentsOfDirectory(at: container, includingPropertiesForKeys: nil)) ?? []
    for url in old where url.lastPathComponent.hasPrefix("frames-") && url.pathExtension == "jsonl" {
      try? FileManager.default.removeItem(at: url)
    }
    guard enabled else { return }
    let url = container.appendingPathComponent("frames-\(Int(Date().timeIntervalSince1970)).jsonl")
    FileManager.default.createFile(atPath: url.path, contents: nil)
    frameLog = try? FileHandle(forWritingTo: url)
    frameLogBytes = 0
    if frameLog == nil {
      os_log("frame recorder unavailable (file create failed)", log: log, type: .error)
    }
  }

  private func recordFrame(_ items: [[String: Any]]) {
    guard let handle = frameLog, frameLogBytes < Self.frameLogCap else { return }
    let line: [String: Any] = ["t": Int(Date().timeIntervalSince1970), "items": items]
    guard var data = try? JSONSerialization.data(withJSONObject: line) else { return }
    data.append(0x0A) // newline
    do {
      try handle.write(contentsOf: data)
      frameLogBytes += data.count
      if frameLogBytes >= Self.frameLogCap {
        os_log("frame recorder cap reached — recording stopped", log: log, type: .info)
      }
    } catch {
      frameLog = nil
    }
  }

  private func setUp() {
    guard let configJson = defaults?.string(forKey: "bbe.sessionConfig"), !configJson.isEmpty else {
      os_log("no bbe.sessionConfig — start a Live Session in BBE first", log: log, type: .error)
      defaults?.set(false, forKey: "bbe.extensionCapturing")
      onSessionEnded?()
      return
    }
    var recordFrames = false
    if let data = configJson.data(using: .utf8),
       let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
      relayUrl = obj["relayUrl"] as? String
      anonKey = obj["anonKey"] as? String
      pushToken = obj["pushToken"] as? String
      recordFrames = (obj["recordFrames"] as? Bool) ?? false
    }
    setUpFrameLog(enabled: recordFrames)

    guard let ctx = JSContext() else {
      os_log("JSContext creation failed", log: log, type: .fault)
      return
    }
    ctx.exceptionHandler = { [weak self] _, exception in
      guard let self else { return }
      os_log("engine JS exception: %{public}@", log: self.log, type: .error,
             exception?.toString() ?? "unknown")
    }
    guard let source = resolveEngineSource() else {
      os_log("no usable parse engine (bundled asset missing)", log: log, type: .fault)
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
    configEpoch = defaults?.double(forKey: "bbe.configEpoch") ?? 0
    defaults?.set(true, forKey: "bbe.extensionCapturing")
    defaults?.set(Date().timeIntervalSince1970, forKey: "bbe.extensionHeartbeat")
    os_log("live capture started (config epoch %f)", log: log, type: .info, configEpoch)
  }

  /// Board reset (TASK-336): the app bumped bbe.configEpoch after rewriting
  /// the session config with a clean state, telling us to re-init the engine
  /// for the next draft room WITHOUT ending the broadcast. Push bookkeeping
  /// resets too — a prior draft's pick 89 must not suppress the next draft's
  /// pick 5, and its target list must not mask the first corrected push.
  private func reinitForNewEpoch() {
    os_log("config epoch changed — reinitializing engine for a new draft", log: log, type: .info)
    try? frameLog?.close()
    frameLog = nil
    jsContext = nil
    sessionActive = false
    lastPushedPick = 0
    lastPushedTargets = []
    lastPushAt = 0
    lastIngestAt = 0
    lastTickAt = 0
    lastThumb = nil
    setUp()
  }

  // MARK: engine resolution (ADR-023)

  /// The parse engine baked into this extension bundle, or nil if missing.
  private func bundledEngineSource() -> String? {
    guard
      let url = Bundle(for: FrameProcessor.self).url(forResource: "engine", withExtension: "js"),
      let source = try? String(contentsOf: url, encoding: .utf8)
    else { return nil }
    return source
  }

  /// Evaluate `source` in a throwaway context and return its declared build
  /// number iff it exposes a well-formed engine (a `version` string, an integer
  /// `build`, and a callable `init`). This is the integrity gate: a partial or
  /// corrupt engine fails to expose these and is rejected (returns nil).
  private func engineBuildIfValid(_ source: String) -> Int? {
    guard let probe = JSContext() else { return nil }
    var threw = false
    probe.exceptionHandler = { _, _ in threw = true }
    probe.evaluateScript(source)
    if threw { return nil }
    guard let engine = probe.objectForKeyedSubscript("BBEEngine"),
          !engine.isUndefined, !engine.isNull,
          let version = engine.objectForKeyedSubscript("version"), version.isString,
          let build = engine.objectForKeyedSubscript("build"), build.isNumber,
          let initFn = engine.objectForKeyedSubscript("init"), !initFn.isUndefined
    else { return nil }
    return Int(build.toInt32())
  }

  /// Choose between the App Group hot-loaded engine (written by the app) and
  /// the bundled asset. Prefer the App Group copy ONLY when it is strictly
  /// newer than the bundled build AND passes the integrity eval; otherwise the
  /// bundled asset is the always-safe floor (ADR-023 higher-build-wins).
  private func resolveEngineSource() -> String? {
    let bundled = bundledEngineSource()
    let bundledBuild = bundled.flatMap(engineBuildIfValid) ?? -1

    // Cheap pre-check: the app stamps the hot-load build into the App Group KV
    // store, so we only read + evaluate the (~50 KB) engine file when the
    // marker claims it is newer than what we ship.
    let markerBuild = defaults.flatMap { Int($0.string(forKey: "bbe.engineBuild") ?? "") } ?? -1
    if markerBuild > bundledBuild,
       let container = FileManager.default.containerURL(
         forSecurityApplicationGroupIdentifier: Self.appGroup
       ) {
      let url = container.appendingPathComponent("engine-hotload.js")
      if let hot = try? String(contentsOf: url, encoding: .utf8),
         let hotBuild = engineBuildIfValid(hot),
         hotBuild > bundledBuild {
        os_log("engine: hot-loaded from App Group (build %d > bundled %d)",
               log: log, type: .info, hotBuild, bundledBuild)
        return hot
      }
      os_log("engine: hot-load marker %d but file missing/invalid — using bundled %d",
             log: log, type: .info, markerBuild, bundledBuild)
    }
    if bundled == nil {
      os_log("engine.js missing from extension bundle", log: log, type: .fault)
    }
    return bundled
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
    if (defaults?.double(forKey: "bbe.configEpoch") ?? 0) != configEpoch {
      reinitForNewEpoch()
      return
    }
    defaults?.set(Date().timeIntervalSince1970, forKey: "bbe.extensionHeartbeat")

    let tight = Int(os_proc_available_memory()) < 25 * 1024 * 1024
    let scale: CGFloat = tight ? 0.4 : 0.6
    let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    guard let cgImage = ciContext.createCGImage(scaled, from: scaled.extent) else { return }
    if isDuplicate(cgImage) {
      maybeTick()
      return
    }

    let items = recognize(cgImage: cgImage, orientation: orientation, fast: tight)
    guard items.count >= 4 else { return } // not a text-dense screen
    recordFrame(items)
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
    lastIngestAt = CFAbsoluteTimeGetCurrent()
    maybePush(result)
  }

  /// Event-driven push policy (ADR-024, triggers extended by TASK-336):
  /// priority-10 on a "significant" transition (crunch, my pick, room
  /// presence — bypasses the floors), a newly-detected pick (3 s floor), or a
  /// changed target list (15 s floor). The target trigger is what un-freezes
  /// a mid-draft resume: availability inference reshapes the targets without
  /// advancing currentPick, and before TASK-336 those corrections never
  /// pushed (the card sat on stale top-of-pool names all draft). All floors
  /// are measured against the last PUSH, so a players-tab scroll burst
  /// coalesces into one corrected update. Nothing changed -> no push, so an
  /// idle slow draft still costs zero ActivityKit budget. Priority 5 remains
  /// unused — iOS defers it, which froze the card far from the pick.
  private func maybePush(_ result: [String: Any]) {
    guard let glance = result["glance"] as? [String: Any] else { return }
    let significant = result["significant"] as? Bool ?? false
    let pick = glance["currentPick"] as? Int ?? 0
    let targets = glance["targets"] as? [String] ?? []
    let newPick = pick > lastPushedPick
    let targetsDiffer = targets != lastPushedTargets
    let now = CFAbsoluteTimeGetCurrent()
    guard significant
      || (newPick && now - lastPushAt >= 3.0)
      || (targetsDiffer && now - lastPushAt >= 15.0) else { return }
    lastPushAt = now
    lastPushedPick = max(lastPushedPick, pick)
    lastPushedTargets = targets
    pushGlance(glance, priority: 10)
  }

  /// Presence clock nudge (TASK-336): static screens never reach the engine
  /// (the duplicate gate above), but a NON-room screen left static must still
  /// flip the Live Activity to "away". Once frames have been quiet for 10 s,
  /// ask the engine to re-evaluate its presence timeout at most every 5 s;
  /// an actual flip comes back `significant` and pushes like any transition.
  private func maybeTick() {
    let now = CFAbsoluteTimeGetCurrent()
    guard lastIngestAt > 0, now - lastIngestAt >= 10.0, now - lastTickAt >= 5.0,
          let ctx = jsContext else { return }
    lastTickAt = now
    guard
      let raw = ctx.objectForKeyedSubscript("BBEEngine")?
        .invokeMethod("tick", withArguments: [])?.toString(),
      let data = raw.data(using: .utf8),
      let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      (result["ok"] as? Bool) == true
    else { return } // engines older than task336.1 have no tick — fine
    if result["significant"] as? Bool == true {
      defaults?.set(raw, forKey: "bbe.extensionResult")
      maybePush(result)
    }
  }

  private func pushGlance(_ glance: [String: Any], priority: Int) {
    // Read the token fresh each push (TASK-338): when the app detects a dead
    // activity and re-requests it, the new APNs token lands in the App Group KV
    // `bbe.pushToken` — this running extension captured only the setUp-time
    // token into `self.pushToken`, so it must prefer the live KV value and fall
    // back to the captured one (stale-app-build mismatch). Reads are cheap at
    // ≤1 push per 3 s.
    let token = defaults?.string(forKey: "bbe.pushToken") ?? pushToken
    guard
      let relayUrl, let url = URL(string: relayUrl),
      let token, !token.isEmpty,
      let body = try? JSONSerialization.data(withJSONObject: [
        "token": token,
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
