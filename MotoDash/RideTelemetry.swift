import CoreLocation
import CoreMotion
import Foundation

@MainActor
final class RideTelemetry: NSObject, ObservableObject {
    @Published private(set) var speedKPH: Double = 0
    @Published private(set) var maxSpeedKPH: Double = 0
    @Published private(set) var rollDegrees: Double = 0
    @Published private(set) var pitchDegrees: Double = 0
    @Published private(set) var headingDegrees: Double?
    @Published private(set) var altitudeMeters: Double?
    @Published private(set) var locationStatus: CLAuthorizationStatus = .notDetermined
    @Published private(set) var motionAvailable = false

    private let locationManager = CLLocationManager()
    private let motionManager = CMMotionManager()
    private let motionQueue = OperationQueue()
    private var rawRollDegrees: Double = 0
    private var rollOffsetDegrees: Double = 0

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.activityType = .automotiveNavigation
        locationManager.distanceFilter = kCLDistanceFilterNone
        locationStatus = locationManager.authorizationStatus
        motionQueue.qualityOfService = .userInteractive
    }

    func start() {
        startLocation()
        startMotion()
    }

    func stop() {
        locationManager.stopUpdatingLocation()
        locationManager.stopUpdatingHeading()
        motionManager.stopDeviceMotionUpdates()
    }

    func calibrateLean() {
        rollOffsetDegrees = rawRollDegrees
        rollDegrees = 0
    }

    private func startLocation() {
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            locationManager.startUpdatingLocation()
            if CLLocationManager.headingAvailable() {
                locationManager.startUpdatingHeading()
            }
        case .denied, .restricted:
            speedKPH = 0
        @unknown default:
            break
        }
    }

    private func startMotion() {
        guard motionManager.isDeviceMotionAvailable else {
            motionAvailable = false
            return
        }

        motionAvailable = true
        motionManager.deviceMotionUpdateInterval = 1.0 / 30.0
        motionManager.startDeviceMotionUpdates(using: .xArbitraryCorrectedZVertical, to: motionQueue) { [weak self] motion, _ in
            guard let self, let attitude = motion?.attitude else { return }
            let roll = attitude.roll * 180.0 / .pi
            let pitch = attitude.pitch * 180.0 / .pi

            Task { @MainActor in
                self.rawRollDegrees = roll
                self.rollDegrees = roll - self.rollOffsetDegrees
                self.pitchDegrees = pitch
            }
        }
    }
}

extension RideTelemetry: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            locationStatus = manager.authorizationStatus
            startLocation()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let speed = max(location.speed, 0) * 3.6
        let altitude = location.verticalAccuracy >= 0 ? location.altitude : nil

        Task { @MainActor in
            speedKPH = speed
            maxSpeedKPH = max(maxSpeedKPH, speed)
            altitudeMeters = altitude
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading

        Task { @MainActor in
            headingDegrees = heading
        }
    }
}
