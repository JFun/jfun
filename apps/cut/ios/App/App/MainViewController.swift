import UIKit
import Capacitor
import WebKit
import AVFoundation

/// Main.storyboard points its view controller here.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // Game audio must survive the ringer/silent switch: WKWebView's default
        // "ambient" session is muted by it. "playback" ignores the switch;
        // mixWithOthers keeps the user's own podcast/music running alongside.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        // iOS DEACTIVATES the session on background/interruption; without an
        // explicit re-activation on foreground, WKWebView's AudioContext stays
        // dead ('interrupted') and the game returns SILENT. Recurring studio
        // gotcha — see docs/handbook/08-ios-webaudio.md.
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification,
                                               object: nil, queue: .main) { _ in
            try? AVAudioSession.sharedInstance().setActive(true)
        }
        #if DEBUG
        // Dev-only build flag: lets the web layer light up dev affordances (the
        // level-dot unlock in game.js reads window.__DEV_BUILD). Injected at document
        // start so it's set before game.js runs. It is compiled OUT of Release builds,
        // so no dev hook ever ships to the App Store.
        let devFlag = WKUserScript(source: "window.__DEV_BUILD=true;",
                                   injectionTime: .atDocumentStart, forMainFrameOnly: true)
        bridge?.webView?.configuration.userContentController.addUserScript(devFlag)
        #endif
    }
}
