// BBEDraftNativeModule.swift — the app-process native surface for the Live
// Draft Session (EPIC-08). Two responsibilities, kept deliberately thin
// (DEVELOPMENT_NOTES "native iteration is slow — put logic in JS"):
//   1. ActivityKit bridge: start/update/end the draft Live Activity. Payloads
//      cross the bridge as JSON strings and decode into ContentState, which
//      MUST stay field-for-field identical to the copy in
//      targets/draft-glance/index.swift (ActivityKit matches attribute types
//      by name across the app/extension boundary).
//   2. Vision OCR: recognizeText(uri) for Photos (ph://) and file:// images,
//      returning lines with normalized top-left-origin bounding boxes. All
//      frames stay on-device (ADR-019).
import ExpoModulesCore
import Photos
import ReplayKit
import UIKit
import Vision

let bbeAppGroup = "group.com.bestballexposures.app"

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
struct DraftActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var phase: String
    var headline: String
    var picksUntil: Int
    var currentPick: Int
    var round: Int
    var myNextPick: Int
    var rosterBar: String
    var targets: [String]
    var syncedAtEpoch: Double
  }

  var platform: String
  var sessionId: String
}

@available(iOS 16.2, *)
enum DraftActivityBridge {
  static var currentActivity: Activity<DraftActivityAttributes>?

  /// The activity we should be talking to: a live one wins over any lingering
  /// `.ended`/`.dismissed` card (a system-ended card can stay in `.activities`
  /// up to 4 h). Prefer the tracked handle, then the first `.active`, then any.
  static var liveActivity: Activity<DraftActivityAttributes>? {
    let all = Activity<DraftActivityAttributes>.activities
    return currentActivity ?? all.first { $0.activityState == .active } ?? all.first
  }

  /// True iff an activity is actually alive on screen. `.ended`/`.dismissed`
  /// cards linger in `.activities`, so non-emptiness is not liveness — this is
  /// the loss-detection signal the app polls (TASK-338).
  static func hasLiveActivity() -> Bool {
    Activity<DraftActivityAttributes>.activities.contains {
      $0.activityState == .active || $0.activityState == .stale
    }
  }

  /// Stream this activity's APNs push token to the App Group KV `bbe.pushToken`
  /// so the running broadcast extension always pushes to the current token
  /// (TASK-338). Self-maintaining: covers the initial token, iOS mid-activity
  /// rotation, and every recovery re-request (a new activity's observer
  /// overwrites the key). Only activities requested with `pushType: .token`
  /// ever yield here.
  static func observePushToken(_ activity: Activity<DraftActivityAttributes>) {
    Task {
      for await tokenData in activity.pushTokenUpdates {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        UserDefaults(suiteName: bbeAppGroup)?.set(hex, forKey: "bbe.pushToken")
      }
    }
  }

  static func decodeState(_ json: String) throws -> DraftActivityAttributes.ContentState {
    guard let data = json.data(using: .utf8) else {
      throw NSError(domain: "BBEDraftNative", code: 1, userInfo: [NSLocalizedDescriptionKey: "State JSON is not UTF-8"])
    }
    return try JSONDecoder().decode(DraftActivityAttributes.ContentState.self, from: data)
  }

  static func start(stateJson: String, withPushToken: Bool) throws -> String {
    let state = try decodeState(stateJson)
    // Snapshot orphans from a previous session before requesting the new one,
    // then end only those (a Task enumerating afterwards would kill the new
    // activity too).
    let orphans = Activity<DraftActivityAttributes>.activities
    if !orphans.isEmpty {
      Task {
        for activity in orphans {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
    }
    let attributes = DraftActivityAttributes(platform: "underdog", sessionId: UUID().uuidString)
    let content = ActivityContent(state: state, staleDate: nil)
    let activity: Activity<DraftActivityAttributes>
    if withPushToken {
      do {
        activity = try Activity.request(attributes: attributes, content: content, pushType: .token)
      } catch {
        // pushType .token throws ActivityInput error 0 when the aps-environment
        // entitlement is missing; a local-only activity still works, so degrade
        // instead of failing the session (JS surfaces "No push token").
        activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
      }
    } else {
      activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
    }
    currentActivity = activity
    observePushToken(activity)
    return activity.id
  }

  /// APNs push token for the running activity, hex-encoded. Arrives async
  /// after request — callers poll (see getActivityPushToken).
  static func currentPushTokenHex() -> String? {
    guard let activity = liveActivity, let token = activity.pushToken else { return nil }
    return token.map { String(format: "%02x", $0) }.joined()
  }

  static func update(stateJson: String) throws {
    let state = try decodeState(stateJson)
    guard let activity = liveActivity else {
      throw NSError(domain: "BBEDraftNative", code: 2, userInfo: [NSLocalizedDescriptionKey: "No draft Live Activity is running"])
    }
    Task {
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
  }

  static func end(stateJson: String?) {
    let finalState = stateJson.flatMap { try? decodeState($0) }
    let activities = Activity<DraftActivityAttributes>.activities
    currentActivity = nil
    Task {
      for activity in activities {
        if let finalState {
          // Leave the summary card visible for a few minutes, then dismiss.
          await activity.end(
            ActivityContent(state: finalState, staleDate: nil),
            dismissalPolicy: .after(Date().addingTimeInterval(10 * 60))
          )
        } else {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
    }
  }
}
#endif

enum TextRecognizerError: Error, LocalizedError {
  case assetNotFound(String)
  case imageDecodeFailed(String)

  var errorDescription: String? {
    switch self {
    case .assetNotFound(let uri): return "Photos asset not found: \(uri)"
    case .imageDecodeFailed(let uri): return "Could not decode image: \(uri)"
    }
  }
}

enum TextRecognizer {
  static func cgOrientation(from ui: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch ui {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }

  static func loadCGImage(uri: String) throws -> (CGImage, CGImagePropertyOrientation) {
    if uri.hasPrefix("ph://") {
      // expo-media-library asset uri = "ph://" + PHAsset.localIdentifier
      // (identifiers themselves contain slashes, e.g. "…/L0/001").
      let fullId = String(uri.dropFirst("ph://".count))
      var fetch = PHAsset.fetchAssets(withLocalIdentifiers: [fullId], options: nil)
      if fetch.firstObject == nil, let uuid = fullId.components(separatedBy: "/").first, uuid != fullId {
        fetch = PHAsset.fetchAssets(withLocalIdentifiers: [uuid], options: nil)
      }
      guard let asset = fetch.firstObject else {
        throw TextRecognizerError.assetNotFound(uri)
      }
      let options = PHImageRequestOptions()
      options.isSynchronous = true
      options.deliveryMode = .highQualityFormat
      options.isNetworkAccessAllowed = true
      options.resizeMode = .none
      var imageData: Data?
      var orientation = CGImagePropertyOrientation.up
      PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, orient, _ in
        imageData = data
        orientation = orient
      }
      guard let data = imageData, let image = UIImage(data: data), let cg = image.cgImage else {
        throw TextRecognizerError.imageDecodeFailed(uri)
      }
      return (cg, orientation)
    }

    let path: String
    if uri.hasPrefix("file://") {
      path = URL(string: uri)?.path ?? String(uri.dropFirst("file://".count))
    } else {
      path = uri
    }
    guard let image = UIImage(contentsOfFile: path), let cg = image.cgImage else {
      throw TextRecognizerError.imageDecodeFailed(uri)
    }
    return (cg, cgOrientation(from: image.imageOrientation))
  }

  static func recognize(uri: String) throws -> [[String: Any]] {
    let (cgImage, orientation) = try loadCGImage(uri: uri)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Player names are a closed vocabulary matched in JS; language correction
    // "fixes" them into dictionary words and hurts more than it helps.
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
    try handler.perform([request])
    let observations = request.results ?? []
    return observations.compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox // normalized, bottom-left origin
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "x": Double(box.minX),
        "y": Double(1.0 - box.maxY), // convert to top-left origin
        "w": Double(box.width),
        "h": Double(box.height),
      ]
    }
  }
}

/// Presents the system broadcast sheet by firing the hidden picker's internal
/// button — the standard workaround (Agora/Jitsi RN SDKs) for the hosted
/// RPSystemBroadcastPickerView not responding to taps inside an RN view tree.
/// The sheet itself (and its Start Broadcast confirmation) is still fully
/// system-controlled; this only replaces the tap on the system glyph.
enum BroadcastPickerLauncher {
  static var picker: RPSystemBroadcastPickerView?

  static func launch(preferredExtension: String?) {
    let picker = self.picker ?? RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
    if self.picker == nil {
      picker.showsMicrophoneButton = false
      picker.alpha = 0
      self.picker = picker
    }
    picker.preferredExtension = preferredExtension
    // Keep the picker in the window hierarchy so the sheet has a presenter.
    if picker.superview == nil {
      let window = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow }
      window?.addSubview(picker)
    }
    for case let button as UIButton in picker.subviews {
      button.sendActions(for: .allTouchEvents)
    }
  }
}

/// Hosts RPSystemBroadcastPickerView (the only sanctioned way to start a
/// broadcast). Preselecting our extension makes it a one-tap start.
class BroadcastPickerView: ExpoView {
  private let picker = RPSystemBroadcastPickerView(frame: .zero)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.showsMicrophoneButton = false
    addSubview(picker)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }

  var preferredExtension: String? {
    didSet { picker.preferredExtension = preferredExtension }
  }
}

public class BBEDraftNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BBEDraftNative")

    View(BroadcastPickerView.self) {
      Prop("preferredExtension") { (view: BroadcastPickerView, value: String?) in
        view.preferredExtension = value
      }
    }

    Function("launchBroadcastPicker") { (preferredExtension: String?) in
      DispatchQueue.main.async {
        BroadcastPickerLauncher.launch(preferredExtension: preferredExtension)
      }
    }

    Function("isLiveActivitySupported") { () -> Bool in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) { return true }
      #endif
      return false
    }

    // True iff a draft Live Activity is actually alive (state .active/.stale).
    // The app polls this to detect an activity iOS ended or the user dismissed,
    // then silently re-requests it (TASK-338).
    Function("hasLiveActivity") { () -> Bool in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return DraftActivityBridge.hasLiveActivity()
      }
      #endif
      return false
    }

    Function("areActivitiesEnabled") { () -> Bool in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      #endif
      return false
    }

    Function("frequentPushesEnabled") { () -> Bool in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().frequentPushesEnabled
      }
      #endif
      return false
    }

    // App Group KV store shared with the broadcast extension.
    Function("writeSharedValue") { (key: String, value: String?) in
      guard let defaults = UserDefaults(suiteName: bbeAppGroup) else { return }
      if let value {
        defaults.set(value, forKey: key)
      } else {
        defaults.removeObject(forKey: key)
      }
    }

    Function("readSharedValue") { (key: String) -> String? in
      return UserDefaults(suiteName: bbeAppGroup)?.string(forKey: key)
    }

    Function("readSharedDouble") { (key: String) -> Double in
      return UserDefaults(suiteName: bbeAppGroup)?.double(forKey: key) ?? 0
    }

    // App Group container file I/O — used to hand the parse engine to the
    // broadcast extension (ADR-023 hot-load). The engine text is ~50 KB, too
    // large to belong in the UserDefaults KV store alongside session config;
    // a container file matches how the frame-log recorder uses the container.
    // Writes go via a temp file + atomic replace so the extension can never
    // read a half-written engine (the sanity-eval would reject it, but atomic
    // write avoids the failure entirely).
    Function("writeSharedFile") { (name: String, contents: String?) -> Bool in
      guard let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: bbeAppGroup
      ) else { return false }
      let url = container.appendingPathComponent(name)
      if let contents {
        do {
          try contents.write(to: url, atomically: true, encoding: .utf8)
          return true
        } catch {
          return false
        }
      } else {
        try? FileManager.default.removeItem(at: url)
        return true
      }
    }

    Function("readSharedFile") { (name: String) -> String? in
      guard let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: bbeAppGroup
      ) else { return nil }
      return try? String(contentsOf: container.appendingPathComponent(name), encoding: .utf8)
    }

    // Newest session frame recording written by the broadcast extension
    // (frames-<epoch>.jsonl in the App Group container), or nil. Discovery
    // stays native so the JS side needs no filesystem dependency (TASK-331).
    Function("latestFrameLogPath") { () -> String? in
      guard let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: bbeAppGroup
      ) else { return nil }
      let files = (try? FileManager.default.contentsOfDirectory(
        at: container, includingPropertiesForKeys: [.contentModificationDateKey]
      )) ?? []
      let recordings = files.filter {
        $0.lastPathComponent.hasPrefix("frames-") && $0.pathExtension == "jsonl"
      }
      let newest = recordings.max { a, b in
        let da = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
        let db = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
        return da < db
      }
      return newest?.path
    }

    Function("startDraftActivity") { (stateJson: String, withPushToken: Bool) throws -> String in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return try DraftActivityBridge.start(stateJson: stateJson, withPushToken: withPushToken)
      }
      #endif
      throw NSError(domain: "BBEDraftNative", code: 3, userInfo: [NSLocalizedDescriptionKey: "Live Activities require iOS 16.2+"])
    }

    // The activity's APNs push token arrives asynchronously after request;
    // poll for up to ~8 s and resolve nil if it never lands (e.g. Low Power
    // Mode or entitlement issues) — the relay path then degrades gracefully.
    AsyncFunction("getActivityPushToken") { (promise: Promise) in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        Task {
          for _ in 0..<20 {
            if let hex = DraftActivityBridge.currentPushTokenHex() {
              promise.resolve(hex)
              return
            }
            try? await Task.sleep(nanoseconds: 400_000_000)
          }
          promise.resolve(nil)
        }
        return
      }
      #endif
      promise.resolve(nil)
    }

    Function("updateDraftActivity") { (stateJson: String) throws in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        try DraftActivityBridge.update(stateJson: stateJson)
        return
      }
      #endif
      throw NSError(domain: "BBEDraftNative", code: 3, userInfo: [NSLocalizedDescriptionKey: "Live Activities require iOS 16.2+"])
    }

    Function("endDraftActivity") { (stateJson: String?) in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        DraftActivityBridge.end(stateJson: stateJson)
      }
      #endif
    }

    AsyncFunction("recognizeText") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let results = try TextRecognizer.recognize(uri: uri)
          promise.resolve(results)
        } catch {
          promise.reject("ERR_OCR", error.localizedDescription)
        }
      }
    }
  }
}
