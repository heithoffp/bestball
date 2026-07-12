import ExpoModulesCore
import UIKit

public class SpikeNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpikeNative")

    // Q4 round-trip proof: JS calls into Swift, Swift returns device-derived state
    // that JS could not have fabricated.
    Function("hello") { () -> String in
      let device = UIDevice.current
      return "Hello from Swift on \(device.systemName) \(device.systemVersion) (\(device.model))"
    }

    // Part C will extend this module with SCContentSharingPicker / SCStream once the
    // Q4 toolchain verdict is in. Keep this file the only native surface of the spike.
    Function("isCaptured") { () -> Bool in
      return UIScreen.main.isCaptured
    }
  }
}
