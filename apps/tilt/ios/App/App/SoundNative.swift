import Foundation
import Capacitor
import AVFoundation

/// Native game audio — the DEFINITIVE fix for "sound dies after backgrounding".
///
/// Why native: WKWebView renders WebAudio in a separate web process whose audio
/// unit iOS tears down on backgrounding; the JS-visible AudioContext can come
/// back claiming "running" while producing silence, and JS has neither a
/// trustworthy signal that this happened nor an API to reattach the session.
/// Three JS-side mitigation rounds (resume, verify+rebuild, unconditional
/// rebuild in-gesture) all failed on device. Natively we OWN the AVAudioSession,
/// we RECEIVE the interruption/foreground notifications, and we can restart the
/// engine deterministically.
///
/// The JS layer renders its existing synthesized SFX to WAV once (offline
/// rendering is session-independent) and loads them here; playback varies
/// rate (pitch) and volume per call. A looping noise buffer through a low-pass
/// EQ is the rolling rumble; JS streams gain/cutoff at a low rate.
@objc(SoundNativePlugin)
public class SoundNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SoundNativePlugin"
    public let jsName = "SoundNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadSample", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "setRoll", returnType: CAPPluginReturnNone),
    ]

    private let engine = AVAudioEngine()
    private var samples: [String: AVAudioPCMBuffer] = [:]
    private var pool: [(node: AVAudioPlayerNode, pitch: AVAudioUnitVarispeed)] = []
    private var poolIdx = 0
    private var rollNode: AVAudioPlayerNode?
    private var rollEQ: AVAudioUnitEQ?
    private var rollBuffer: AVAudioPCMBuffer?
    private var started = false

    override public func load() {
        // Foreground + interruption recovery — the part JS can never do reliably.
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.reviveEngine() }
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let info = note.userInfo,
                  let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            if type == .ended { self?.reviveEngine() }
        }
    }

    @objc func loadSample(_ call: CAPPluginCall) {
        guard let name = call.getString("name"),
              let b64 = call.getString("wav"),
              let data = Data(base64Encoded: b64) else {
            call.reject("bad args"); return
        }
        DispatchQueue.main.async {
            do {
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("tilt-\(name).wav")
                try data.write(to: url)
                let file = try AVAudioFile(forReading: url)
                guard let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                                 frameCapacity: AVAudioFrameCount(file.length)) else {
                    call.reject("buffer alloc failed"); return
                }
                try file.read(into: buf)
                self.samples[name] = buf
                NSLog("TILT-SOUND loaded %@ (%.2fs)", name,
                      Double(buf.frameLength) / buf.format.sampleRate)
                call.resolve()
            } catch {
                NSLog("TILT-SOUND load ERROR %@ %@", name, error.localizedDescription)
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.buildGraph()
            self.reviveEngine()
            self.started = true
            call.resolve()
        }
    }

    private func buildGraph() {
        guard pool.isEmpty, let anyBuf = samples.values.first else { return }
        let fmt = anyBuf.format
        for _ in 0..<10 {
            let node = AVAudioPlayerNode()
            let pitch = AVAudioUnitVarispeed()
            engine.attach(node); engine.attach(pitch)
            engine.connect(node, to: pitch, format: fmt)
            engine.connect(pitch, to: engine.mainMixerNode, format: fmt)
            pool.append((node, pitch))
        }
        if let roll = samples["roll"] {
            let node = AVAudioPlayerNode()
            let eq = AVAudioUnitEQ(numberOfBands: 1)
            eq.bands[0].filterType = .lowPass
            eq.bands[0].frequency = 350
            eq.bands[0].bypass = false
            engine.attach(node); engine.attach(eq)
            engine.connect(node, to: eq, format: roll.format)
            engine.connect(eq, to: engine.mainMixerNode, format: roll.format)
            node.volume = 0
            rollNode = node; rollEQ = eq; rollBuffer = roll
        }
        engine.prepare()
    }

    private func reviveEngine() {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playback, options: [.mixWithOthers])
            try s.setActive(true)
        } catch {
            NSLog("TILT-SOUND session ERROR %@", error.localizedDescription)
        }
        // CRASH GUARD: didBecomeActive fires at LAUNCH, before samples/graph
        // exist. Starting an AVAudioEngine with an EMPTY graph raises an ObjC
        // NSException that Swift try cannot catch → SIGABRT (shipped once).
        // Never start the engine until buildGraph() has attached nodes.
        guard !pool.isEmpty else { return }
        if !engine.isRunning {
            do { try engine.start() } catch {
                NSLog("TILT-SOUND engine ERROR %@", error.localizedDescription)
                return
            }
        }
        // a stopped engine drops scheduled buffers — re-arm the roll loop
        if let node = rollNode, let buf = rollBuffer {
            node.stop()
            node.scheduleBuffer(buf, at: nil, options: .loops)
            node.play()
        }
        NSLog("TILT-SOUND engine revived (running=%d)", engine.isRunning ? 1 : 0)
    }

    @objc func play(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? ""
        let rate = Float(call.getDouble("rate") ?? 1.0)
        let vol = Float(call.getDouble("vol") ?? 1.0)
        DispatchQueue.main.async {
            guard self.started, let buf = self.samples[name] else { return }
            if !self.engine.isRunning { self.reviveEngine() }
            let (node, pitch) = self.pool[self.poolIdx]
            self.poolIdx = (self.poolIdx + 1) % self.pool.count
            pitch.rate = max(0.5, min(2.0, rate))
            node.volume = max(0, min(1, vol))
            node.stop()
            node.scheduleBuffer(buf, at: nil)
            node.play()
        }
    }

    @objc func setRoll(_ call: CAPPluginCall) {
        let gain = Float(call.getDouble("gain") ?? 0)
        let freq = Float(call.getDouble("freq") ?? 350)
        DispatchQueue.main.async {
            self.rollNode?.volume = max(0, min(0.3, gain))
            self.rollEQ?.bands[0].frequency = max(100, min(4000, freq))
        }
    }
}
