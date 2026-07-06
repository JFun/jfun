import UIKit
import Capacitor
import WebKit

/// Registers the app-local MotionNative plugin (Capacitor only auto-registers
/// packaged plugins). Main.storyboard points its view controller here.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MotionNativePlugin())
        bridge?.registerPluginInstance(SoundNativePlugin())
        #if DEBUG
        // Dev-only build flag: lets the web layer light up dev affordances (the
        // level-jump grid in game.js reads window.__DEV_BUILD). Injected at document
        // start so it's set before game.js runs. It is compiled OUT of Release builds,
        // so no dev hook ever ships to the App Store.
        let devFlag = WKUserScript(source: "window.__DEV_BUILD=true;",
                                   injectionTime: .atDocumentStart, forMainFrameOnly: true)
        bridge?.webView?.configuration.userContentController.addUserScript(devFlag)
        #endif
    }
}
