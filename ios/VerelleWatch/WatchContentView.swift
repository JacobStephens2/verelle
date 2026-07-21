import SwiftUI
import WatchConnectivity

struct WatchContentView: View {
    @State private var status = "Open Verelle on iPhone"

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Verelle").font(.headline)
                Text(status).font(.caption2).multilineTextAlignment(.center)
                ForEach(["low", "high", "peak", "missed", "error"], id: \.self) { reading in
                    Button(reading.capitalized) { send(reading) }
                        .tint(color(reading))
                }
                Button("Recent") { recent() }
            }
        }
        .task { activate(); recent() }
    }

    private func activate() {
        guard WCSession.isSupported() else { status = "Pair with an iPhone"; return }
        WCSession.default.activate()
    }

    private func send(_ reading: String) {
        guard WCSession.default.isReachable else { status = "Open Verelle on iPhone"; return }
        status = "Saving \(reading)…"
        WCSession.default.sendMessage(
            ["date": Self.date.string(from: Date()), "reading": reading],
            replyHandler: { reply in
                DispatchQueue.main.async {
                    status = reply["saved"].map { "Saved \($0)" }
                        ?? (reply["error"] as? String ?? "No acknowledgement")
                }
            },
            errorHandler: { error in DispatchQueue.main.async { status = error.localizedDescription } }
        )
    }

    private func recent() {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["request": "recent"], replyHandler: { reply in
            let recent = reply["recent"] as? [[String: Any]]
            let last = recent?.last
            let day = last?["cycle_day"] as? Int
            let entry = (last?["entries"] as? [String])?.first
            DispatchQueue.main.async {
                status = day.map { "Day \($0) · \(entry ?? "No entry")" } ?? "No chart entries"
            }
        })
    }

    private func color(_ reading: String) -> Color {
        switch reading {
        case "peak": .purple
        case "high": .blue
        case "error": .red
        default: .teal
        }
    }

    private static let date: DateFormatter = {
        let value = DateFormatter(); value.locale = .init(identifier: "en_US_POSIX")
        value.calendar = .init(identifier: .gregorian); value.dateFormat = "yyyy-MM-dd"
        return value
    }()
}
