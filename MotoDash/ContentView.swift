import CoreLocation
import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var telemetry: RideTelemetry
    @Environment(\.scenePhase) private var scenePhase
    @State private var now = Date()

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            DashboardBackground()

            VStack(spacing: 18) {
                TopBar(now: now, telemetry: telemetry)

                HStack(spacing: 18) {
                    SpeedPanel(speed: telemetry.speedKPH, maxSpeed: telemetry.maxSpeedKPH)
                        .frame(maxWidth: .infinity)

                    VStack(spacing: 18) {
                        LeanPanel(roll: telemetry.rollDegrees)
                        RideGrid(telemetry: telemetry)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(22)
        }
        .task {
            telemetry.start()
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .onReceive(clock) { value in
            now = value
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                telemetry.start()
            } else {
                telemetry.stop()
            }
        }
    }
}

private struct TopBar: View {
    let now: Date
    let telemetry: RideTelemetry

    var body: some View {
        HStack(spacing: 14) {
            Text(now.formatted(date: .omitted, time: .shortened))
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()

            Spacer()

            Button {
                telemetry.calibrateLean()
            } label: {
                Label("校准", systemImage: "scope")
            }
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .foregroundStyle(.white)
            .background(.white.opacity(0.11), in: Capsule())

            StatusPill(
                title: telemetry.locationStatus.isUsable ? "GPS" : "NO GPS",
                systemImage: telemetry.locationStatus.isUsable ? "location.fill" : "location.slash.fill",
                tint: telemetry.locationStatus.isUsable ? .green : .orange
            )

            StatusPill(
                title: telemetry.motionAvailable ? "IMU" : "NO IMU",
                systemImage: telemetry.motionAvailable ? "gyroscope" : "exclamationmark.triangle.fill",
                tint: telemetry.motionAvailable ? .cyan : .orange
            )
        }
        .padding(.horizontal, 2)
    }
}

private struct SpeedPanel: View {
    let speed: Double
    let maxSpeed: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("速度", systemImage: "speedometer")
                .font(.headline)
                .foregroundStyle(.secondary)

            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(speed.roundedInt)
                    .font(.system(size: 116, weight: .black, design: .rounded))
                    .contentTransition(.numericText())
                    .monospacedDigit()

                Text("km/h")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .minimumScaleFactor(0.78)

            HStack {
                MetricChip(title: "最高", value: maxSpeed.roundedInt, unit: "km/h")
                MetricChip(title: "模式", value: "骑行", unit: "")
            }
        }
        .padding(26)
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .dashboardPanel()
    }
}

private struct LeanPanel: View {
    let roll: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("倾角", systemImage: "angle")
                .font(.headline)
                .foregroundStyle(.secondary)

            HStack(spacing: 18) {
                LeanGauge(roll: roll)
                    .frame(width: 170, height: 124)

                VStack(alignment: .leading, spacing: 6) {
                    Text(abs(roll).roundedInt)
                        .font(.system(size: 62, weight: .black, design: .rounded))
                        .monospacedDigit()
                    Text(roll.directionText)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(roll.directionColor)
                }
            }
        }
        .padding(22)
        .dashboardPanel()
    }
}

private struct RideGrid: View {
    let telemetry: RideTelemetry

    var body: some View {
        Grid(horizontalSpacing: 12, verticalSpacing: 12) {
            GridRow {
                SmallMetric(
                    title: "航向",
                    value: telemetry.headingDegrees.map { "\($0.roundedInt)" } ?? "--",
                    unit: "deg",
                    image: "safari.fill"
                )
                SmallMetric(
                    title: "俯仰",
                    value: telemetry.pitchDegrees.roundedInt,
                    unit: "deg",
                    image: "arrow.up.and.down"
                )
            }
            GridRow {
                SmallMetric(
                    title: "海拔",
                    value: telemetry.altitudeMeters.map { "\($0.roundedInt)" } ?? "--",
                    unit: "m",
                    image: "mountain.2.fill"
                )
                SmallMetric(
                    title: "状态",
                    value: telemetry.locationStatus.isUsable ? "READY" : "WAIT",
                    unit: "",
                    image: "checkmark.seal.fill"
                )
            }
        }
    }
}

private struct LeanGauge: View {
    let roll: Double

    var body: some View {
        ZStack {
            GaugeArc()
                .stroke(.white.opacity(0.14), style: StrokeStyle(lineWidth: 14, lineCap: .round))

            GaugeArc()
                .trim(from: min(0.5, normalizedRoll), to: max(0.5, normalizedRoll))
                .stroke(roll.directionColor, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .shadow(color: roll.directionColor.opacity(0.45), radius: 16)

            Rectangle()
                .fill(.white)
                .frame(width: 88, height: 5)
                .clipShape(Capsule())
                .rotationEffect(.degrees(clampedRoll))
                .shadow(color: .white.opacity(0.35), radius: 8)

            Circle()
                .fill(.white.opacity(0.9))
                .frame(width: 12, height: 12)
        }
        .padding(.top, 20)
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: clampedRoll)
    }

    private var clampedRoll: Double {
        min(max(roll, -55), 55)
    }

    private var normalizedRoll: CGFloat {
        CGFloat((clampedRoll + 55) / 110)
    }
}

private struct GaugeArc: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addArc(
            center: CGPoint(x: rect.midX, y: rect.maxY - 8),
            radius: min(rect.width, rect.height * 2) / 2 - 12,
            startAngle: .degrees(200),
            endAngle: .degrees(340),
            clockwise: false
        )
        return path
    }
}

private struct SmallMetric: View {
    let title: String
    let value: String
    let unit: String
    let image: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: image)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.secondary)

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(value)
                    .font(.system(size: 32, weight: .black, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .monospacedDigit()

                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
        .dashboardPanel()
    }
}

private struct MetricChip: View {
    let title: String
    let value: String
    let unit: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 18, weight: .black, design: .rounded))
                .monospacedDigit()
            Text(unit)
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(.white.opacity(0.07), in: Capsule())
    }
}

private struct StatusPill: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

private struct DashboardBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.04, green: 0.05, blue: 0.06),
                Color(red: 0.07, green: 0.08, blue: 0.10),
                Color(red: 0.02, green: 0.02, blue: 0.03)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

private struct PanelModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(.white.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(.white.opacity(0.10), lineWidth: 1)
                    )
            )
    }
}

private extension View {
    func dashboardPanel() -> some View {
        modifier(PanelModifier())
    }
}

private extension Double {
    var roundedInt: String {
        formatted(.number.precision(.fractionLength(0)))
    }

    var directionText: String {
        if abs(self) < 2 { return "直立" }
        return self < 0 ? "左倾" : "右倾"
    }

    var directionColor: Color {
        if abs(self) < 12 { return .green }
        if abs(self) < 32 { return .yellow }
        return .red
    }
}

private extension CLAuthorizationStatus {
    var isUsable: Bool {
        self == .authorizedAlways || self == .authorizedWhenInUse
    }
}

#Preview {
    ContentView()
        .environmentObject(RideTelemetry())
}
