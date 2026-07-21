import SwiftUI
import UserNotifications

struct ContentView: View {
    @Environment(ChartModel.self) private var model
    @State private var date = Self.isoDate.string(from: Date())
    @State private var cycleNumber = "1"
    @State private var reading = FfiMonitorReading.low
    @State private var note = ""
    @State private var bleeding = FfiBleedingIntensity.moderate
    @State private var mucus = FfiMucusCategory.high
    @State private var temperature = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Today") {
                    TextField("Date (YYYY-MM-DD)", text: $date)
                        .textInputAutocapitalization(.never)
                    Text("Saved locally first · \(model.pendingCount) changes awaiting sync")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Cycle start") {
                    TextField("Method cycle number", text: $cycleNumber)
                        .keyboardType(.numberPad)
                    Button("Record cycle start") {
                        model.recordCycleStart(date: date, number: UInt32(cycleNumber) ?? 1)
                    }
                }
                Section("Monitor") {
                    Picker("Reading", selection: $reading) {
                        Text("Low").tag(FfiMonitorReading.low)
                        Text("High").tag(FfiMonitorReading.high)
                        Text("Peak").tag(FfiMonitorReading.peak)
                        Text("Missed").tag(FfiMonitorReading.missed)
                        Text("Error").tag(FfiMonitorReading.error)
                    }
                    Button("Record monitor reading") { model.recordMonitor(date: date, reading: reading) }
                }
                Section("Supplemental observations") {
                    Picker("Bleeding", selection: $bleeding) {
                        Text("Spotting").tag(FfiBleedingIntensity.spotting)
                        Text("Light").tag(FfiBleedingIntensity.light)
                        Text("Moderate").tag(FfiBleedingIntensity.moderate)
                        Text("Heavy").tag(FfiBleedingIntensity.heavy)
                    }
                    Button("Record bleeding") { model.recordBleeding(date: date, intensity: bleeding) }
                    Picker("Mucus category", selection: $mucus) {
                        Text("Low").tag(FfiMucusCategory.low)
                        Text("High").tag(FfiMucusCategory.high)
                        Text("Peak").tag(FfiMucusCategory.peak)
                    }
                    Button("Record mucus") { model.recordMucus(date: date, category: mucus) }
                    TextField("Temperature", text: $temperature).keyboardType(.decimalPad)
                    Button("Record °F") {
                        if let value = Double(temperature) {
                            model.recordTemperature(date: date, value: value, unit: .fahrenheit)
                        }
                    }
                    TextField("Private note", text: $note, axis: .vertical)
                    Button("Record note") { model.recordNote(date: date, text: note) }
                    Button("Mark Peak") { model.recordPeak(date: date, source: .other) }
                }
                chartSection
                Section("Data and reminders") {
                    ShareLink(item: model.exportJSON(), preview: SharePreview("Verelle chart.json")) {
                        Label("Share JSON export", systemImage: "square.and.arrow.up")
                    }
                    ShareLink(item: model.exportCSV(), preview: SharePreview("Verelle chart.csv")) {
                        Label("Share CSV export", systemImage: "tablecells")
                    }
                    Button("Schedule a daily 8 PM reminder") { scheduleReminder() }
                }
                Section {
                    Text("Verelle records and displays observations. It does not interpret fertility status or replace instruction or medical care.")
                        .font(.caption)
                }
            }
            .navigationTitle("Verelle")
            .alert("Verelle", isPresented: Binding(
                get: { model.message != nil },
                set: { if !$0 { model.message = nil } }
            )) { Button("OK") { model.message = nil } } message: { Text(model.message ?? "") }
        }
    }

    @ViewBuilder
    private var chartSection: some View {
        Section("Chart") {
            if model.charts.isEmpty {
                Text("Record a cycle start to begin the chart").foregroundStyle(.secondary)
            }
            ForEach(Array(model.charts.enumerated()), id: \.offset) { _, chart in
                DisclosureGroup("Cycle \(chart.methodCycleNumber) · \(chart.startDate)") {
                    ForEach(chart.days, id: \.date) { day in
                        VStack(alignment: .leading) {
                            Text("Day \(day.cycleDay) · \(day.date)").font(.headline)
                            ForEach(day.entries, id: \.self) { entry in Text(entry.label) }
                            ForEach(day.annotations, id: \.self) { Text($0).foregroundStyle(.teal) }
                        }
                    }
                }
            }
        }
    }

    private func scheduleReminder() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            var components = DateComponents(); components.hour = 20
            let content = UNMutableNotificationContent()
            content.title = "Verelle"
            content.body = "Remember to record today's observations."
            let request = UNNotificationRequest(
                identifier: "verelle-daily-recording",
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            )
            UNUserNotificationCenter.current().add(request)
        }
    }

    private static let isoDate: DateFormatter = {
        let formatter = DateFormatter(); formatter.calendar = .init(identifier: .gregorian)
        formatter.locale = .init(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
