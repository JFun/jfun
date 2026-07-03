import Foundation
import Capacitor
import CoreMotion

/// Native accelerometer bridge. Unlike the WebKit DeviceMotionEvent API (which
/// gates on a per-session permission prompt in WKWebView), CMMotionManager needs
/// NO user permission for accelerometer data — the game gets gravity seamlessly.
/// Emits "accel" events: { x, y, z } in g-units, device coordinates (flat
/// face-up: z ≈ -1; upright portrait: y ≈ -1) — same convention as iOS
/// accelerationIncludingGravity, so the JS mapping is shared.
@objc(MotionNativePlugin)
public class MotionNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MotionNativePlugin"
    public let jsName = "MotionNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CMMotionManager()

    @objc func start(_ call: CAPPluginCall) {
        guard manager.isAccelerometerAvailable else {
            call.reject("accelerometer unavailable")
            return
        }
        if manager.isAccelerometerActive {
            call.resolve()
            return
        }
        manager.accelerometerUpdateInterval = 1.0 / 60.0
        manager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let a = data?.acceleration else { return }
            self?.notifyListeners("accel", data: ["x": a.x, "y": a.y, "z": a.z])
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        manager.stopAccelerometerUpdates()
        call.resolve()
    }

    deinit { manager.stopAccelerometerUpdates() }
}
