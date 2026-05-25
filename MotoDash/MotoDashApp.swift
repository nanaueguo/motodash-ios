import SwiftUI

@main
struct MotoDashApp: App {
    @StateObject private var telemetry = RideTelemetry()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(telemetry)
                .preferredColorScheme(.dark)
        }
    }
}
