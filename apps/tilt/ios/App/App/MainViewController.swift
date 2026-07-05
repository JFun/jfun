import UIKit
import Capacitor

/// Registers the app-local MotionNative plugin (Capacitor only auto-registers
/// packaged plugins). Main.storyboard points its view controller here.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MotionNativePlugin())
        bridge?.registerPluginInstance(SoundNativePlugin())
    }
}
