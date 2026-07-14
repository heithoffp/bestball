// SampleHandler — the ReplayKit-specific shell of the live-capture path
// (ADR-020 fallback topology, running as v1 primary because the test device is
// on iOS 26). Deliberately thin: everything reusable lives in FrameProcessor,
// which is capture-source-agnostic so the future ScreenCaptureKit path
// (iOS 27, spike Q3) can feed it the same frames from inside the app process.
import ReplayKit

class SampleHandler: RPBroadcastSampleHandler {
  private let processor = FrameProcessor()

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    processor.onSessionEnded = { [weak self] in
      let error = NSError(
        domain: "com.bestballexposures.app.draftbroadcast",
        code: 0,
        userInfo: [NSLocalizedDescriptionKey: "BBE draft session ended"]
      )
      self?.finishBroadcastWithError(error)
    }
    processor.start()
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard sampleBufferType == .video else { return }
    processor.enqueue(sampleBuffer)
  }

  override func broadcastPaused() {
    processor.setPaused(true)
  }

  override func broadcastResumed() {
    processor.setPaused(false)
  }

  override func broadcastFinished() {
    processor.finish()
  }
}
