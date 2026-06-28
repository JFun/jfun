import UIKit
import WebKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // WKWebView WebAudio defaults to the "ambient" session, which the
        // hardware silent switch mutes. .playback keeps game audio audible
        // (mixWithOthers: don't kill the user's podcast/music).
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        SoundPlayer.shared.start()

        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = GameViewController()
        w.makeKeyAndVisible()
        window = w
        return true
    }
}

/// Native sample playback: the pre-rendered WAVs from web/sounds/ preloaded
/// into AVAudioEngine buffers, played round-robin over a small node pool so
/// rapid sounds overlap instead of cutting each other. Revives itself after
/// backgrounding and audio-session interruptions — WKWebView's own WebAudio
/// can't be trusted to come back, which is exactly why playback is out here.
final class SoundPlayer {
    static let shared = SoundPlayer()
    private let engine = AVAudioEngine()
    private var buffers: [String: AVAudioPCMBuffer] = [:]
    private var nodes: [AVAudioPlayerNode] = []
    private let bgmNode = AVAudioPlayerNode()
    private var bgmOn = false
    private var next = 0

    func start() {
        for name in ["tap", "ui", "clear", "clear2", "lantern", "win", "fail", "bgm"] {
            // bgm ships compressed (aac); SFX stay wav for zero-decode-cost starts
            let url = Bundle.main.url(forResource: name, withExtension: "m4a",
                                      subdirectory: "web/sounds")
                   ?? Bundle.main.url(forResource: name, withExtension: "wav",
                                      subdirectory: "web/sounds")
            guard let url,
                  let file = try? AVAudioFile(forReading: url),
                  let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                             frameCapacity: AVAudioFrameCount(file.length)),
                  (try? file.read(into: buf)) != nil else { continue }
            buffers[name] = buf
        }
        guard let format = buffers.values.first?.format else { return }
        for _ in 0..<6 {
            let node = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: format)
            nodes.append(node)
        }
        engine.attach(bgmNode)
        engine.connect(bgmNode, to: engine.mainMixerNode, format: buffers["bgm"]?.format ?? format)
        bgmNode.volume = 0.7
        engine.prepare()
        try? engine.start()

        let nc = NotificationCenter.default
        nc.addObserver(forName: UIApplication.didBecomeActiveNotification,
                       object: nil, queue: .main) { [weak self] _ in self?.revive() }
        nc.addObserver(forName: AVAudioSession.interruptionNotification,
                       object: nil, queue: .main) { [weak self] note in
            let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            if raw.flatMap(AVAudioSession.InterruptionType.init) == .ended { self?.revive() }
        }
    }

    /// re-arm after backgrounding/interruption; restart the music if it was on
    private func revive() {
        try? AVAudioSession.sharedInstance().setActive(true)
        if !engine.isRunning {
            engine.prepare()
            try? engine.start()
        }
        if bgmOn && !bgmNode.isPlaying { scheduleBGM() }
    }

    private func scheduleBGM() {
        guard let buf = buffers["bgm"] else { return }
        bgmNode.stop()
        bgmNode.scheduleBuffer(buf, at: nil, options: .loops)
        bgmNode.play()
    }

    func setBGM(_ on: Bool) {
        bgmOn = on
        if on {
            if !engine.isRunning { revive() } else { scheduleBGM() }
        } else {
            bgmNode.stop()
        }
    }

    func play(_ name: String) {
        guard let buf = buffers[name], !nodes.isEmpty else { return }
        if !engine.isRunning { revive() }
        let node = nodes[next]
        next = (next + 1) % nodes.count
        node.stop()
        node.scheduleBuffer(buf, at: nil)
        node.play()
    }
}

/// JS → native sound bridge: sample names, plus "bgm-on" / "bgm-off".
final class SoundHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let name = message.body as? String else { return }
        switch name {
        case "bgm-on": SoundPlayer.shared.setBGM(true)
        case "bgm-off": SoundPlayer.shared.setBGM(false)
        default: SoundPlayer.shared.play(name)
        }
    }
}

/// JS → Taptic bridge: web audio calls webkit.messageHandlers.haptic with
/// "light" / "medium" / "success" / "warning" so game feedback has body.
/// Note: all of this is gated by iOS Settings → Sounds & Haptics →
/// System Haptics; when that's off, every game's haptics are silent.
final class HapticHandler: NSObject, WKScriptMessageHandler {
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)   // crisp piece-drop tick
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let notify = UINotificationFeedbackGenerator()

    override init() {
        super.init()
        rigid.prepare(); medium.prepare(); notify.prepare()
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.body as? String {
        case "light": rigid.impactOccurred(intensity: 0.9); rigid.prepare()
        case "medium": medium.impactOccurred(intensity: 1.0); medium.prepare()
        case "success": notify.notificationOccurred(.success); notify.prepare()
        case "warning": notify.notificationOccurred(.warning); notify.prepare()
        default: break
        }
    }
}

/// Full-screen WKWebView hosting the bundled web build (web/ folder reference).
/// The game handles its own input (pointer events, touch-action: none) and
/// safe areas (viewport-fit=cover + env() padding), so the shell stays dumb.
final class GameViewController: UIViewController {
    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        let night = UIColor(red: 0.039, green: 0.055, blue: 0.141, alpha: 1) // #0a0e24
        view.backgroundColor = night

        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.userContentController.add(HapticHandler(), name: "haptic")
        cfg.userContentController.add(SoundHandler(), name: "sound")

        webView = WKWebView(frame: view.bounds, configuration: cfg)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = night
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)

        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }

    override var prefersHomeIndicatorAutoHidden: Bool { true }
    // Tray sits near the bottom edge; require a deliberate swipe to leave the app.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom] }
}
