import UIKit
import Capacitor
import WebKit

/// App's bridge VC: registers the local NativeFX plugin and keeps the game
/// full-screen friendly (hidden home indicator, deliberate bottom-edge swipe
/// since the piece tray sits near the screen edge).
class MainViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeFXPlugin())
        #if DEBUG
        // Expose the on-device QA panel only in Debug builds — the #if DEBUG
        // guard means it is compiled out of any Release/App Store build.
        let script = WKUserScript(source: "window.__LANTHORN_DEBUG = true;",
                                  injectionTime: .atDocumentStart, forMainFrameOnly: true)
        bridge?.webView?.configuration.userContentController.addUserScript(script)
        #endif
    }

    // (prefersHomeIndicatorAutoHidden is sealed non-open by CAPBridgeViewController)
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom] }
}
