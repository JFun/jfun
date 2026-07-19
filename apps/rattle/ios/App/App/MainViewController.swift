import UIKit
import Capacitor
import WebKit

/// Main.storyboard points its view controller here. (Audio-session hardening
/// lives in AppDelegate.swift; this subclass exists only for the dev flag.)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        #if DEBUG
        // Dev-only build flag: lets the web layer light up dev affordances (the
        // level-jump prompt in game.js reads window.__DEV_BUILD). Injected at
        // document start so it's set before game.js runs. Compiled OUT of Release
        // builds, so no dev hook ever ships to the App Store. Same pattern as Cut.
        let devFlag = WKUserScript(source: "window.__DEV_BUILD=true;",
                                   injectionTime: .atDocumentStart, forMainFrameOnly: true)
        bridge?.webView?.configuration.userContentController.addUserScript(devFlag)
        #endif
    }
}
