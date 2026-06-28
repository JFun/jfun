import Foundation
import Capacitor
import AVFoundation
import UIKit
import FirebaseCore
import FirebaseAnalytics

/// Native sample playback, ported intact from the pre-Capacitor shell:
/// pre-rendered files from web/sounds (bundled under public/sounds) preloaded
/// into AVAudioEngine buffers, played round-robin over a node pool so rapid
/// sounds overlap. Revives itself after backgrounding and interruptions —
/// the reason audio lives out here instead of in the webview.
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
            // bgm ships compressed (aac); SFX stay wav
            let url = Bundle.main.url(forResource: name, withExtension: "m4a",
                                      subdirectory: "public/sounds")
                   ?? Bundle.main.url(forResource: name, withExtension: "wav",
                                      subdirectory: "public/sounds")
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

/// Local Capacitor plugin: the web game calls NativeFX.sound({name}) and
/// NativeFX.haptic({kind}). Registered in MainViewController.capacitorDidLoad.
/// Haptics are gated by iOS Settings → Sounds & Haptics → System Haptics.
@objc(NativeFXPlugin)
public class NativeFXPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeFXPlugin"
    public let jsName = "NativeFX"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sound", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "track", returnType: CAPPluginReturnNone)
    ]

    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let notify = UINotificationFeedbackGenerator()

    override public func load() {
        rigid.prepare(); medium.prepare(); notify.prepare()
    }

    @objc func sound(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? ""
        DispatchQueue.main.async {
            switch name {
            case "bgm-on": SoundPlayer.shared.setBGM(true)
            case "bgm-off": SoundPlayer.shared.setBGM(false)
            default: SoundPlayer.shared.play(name)
            }
        }
        call.resolve()
    }

    @objc func track(_ call: CAPPluginCall) {
        guard FirebaseApp.app() != nil, let name = call.getString("name") else { call.resolve(); return }
        var params: [String: Any] = [:]
        for (k, v) in call.getObject("params") ?? [:] {
            switch v {
            case let n as NSNumber: params[k] = n
            case let s as String: params[k] = s
            default: break
            }
        }
        Analytics.logEvent(name, parameters: params.isEmpty ? nil : params)
        call.resolve()
    }

    @objc func haptic(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        DispatchQueue.main.async {
            switch kind {
            case "light": self.rigid.impactOccurred(intensity: 0.9); self.rigid.prepare()
            case "medium": self.medium.impactOccurred(intensity: 1.0); self.medium.prepare()
            case "success": self.notify.notificationOccurred(.success); self.notify.prepare()
            case "warning": self.notify.notificationOccurred(.warning); self.notify.prepare()
            default: break
            }
        }
        call.resolve()
    }
}
