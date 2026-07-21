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
    @State private var email = ""
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var enteredRecoveryCode = ""
    @State private var healthConsent = false
    @State private var inviteCode = ""
    @State private var accountDeletionConfirmation = ""
    @State private var cycleBasis = FfiCycleStartBasis.menses
    @State private var postpartumCycle = ""
    @State private var monitorSetupTime = "06:00"
    @State private var monitorModel = ""
    @State private var monitorReset = false
    @State private var e3g = ""
    @State private var lh = ""
    @State private var lhResult = FfiLhQualitative.negative
    @State private var lhRatio = ""
    @State private var intercourse = FfiIntercourseKind.intercourse
    @State private var protectedIntercourse = false
    @State private var markerToDelete = FfiEditableMarker.monitor

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                Section("Today") {
                    TextField("Date (YYYY-MM-DD)", text: $date)
                        .textInputAutocapitalization(.never)
                    Text("Saved locally first · \(model.pendingCount) changes awaiting sync")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Cycle start") {
                    Picker("Basis", selection: $cycleBasis) {
                        Text("Menses").tag(FfiCycleStartBasis.menses)
                        Text("Artificial postpartum").tag(FfiCycleStartBasis.artificialPostpartum)
                        Text("Return to cycles").tag(FfiCycleStartBasis.returnToCycles)
                    }
                    TextField("Method cycle number", text: $cycleNumber)
                        .keyboardType(.numberPad)
                    TextField("Postpartum cycle number (optional)", text: $postpartumCycle)
                        .keyboardType(.numberPad)
                    Button("Record cycle start") {
                        model.recordCycleStartDetails(
                            date: date,
                            basis: cycleBasis,
                            methodCycle: UInt32(cycleNumber),
                            postpartumCycle: UInt32(postpartumCycle)
                        )
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
                    TextField("m-button time (HH:MM)", text: $monitorSetupTime)
                    TextField("Monitor model (optional)", text: $monitorModel)
                    Toggle("Memory reset", isOn: $monitorReset)
                    Button("Record monitor setup") {
                        model.recordMonitorSetup(
                            date: date,
                            time: monitorSetupTime,
                            model: monitorModel.isEmpty ? nil : monitorModel,
                            reset: monitorReset
                        )
                    }
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
                    TextField("E3G value (optional)", text: $e3g).keyboardType(.decimalPad)
                    TextField("LH value (optional)", text: $lh).keyboardType(.decimalPad)
                    Button("Record quantitative hormones") {
                        model.recordHormones(
                            date: date,
                            e3g: Double(e3g),
                            lh: Double(lh),
                            e3gUnit: e3g.isEmpty ? nil : "ng/mL",
                            lhUnit: lh.isEmpty ? nil : "mIU/mL"
                        )
                    }
                    Picker("LH strip", selection: $lhResult) {
                        Text("Negative").tag(FfiLhQualitative.negative)
                        Text("Positive").tag(FfiLhQualitative.positive)
                        Text("Indeterminate").tag(FfiLhQualitative.indeterminate)
                        Text("Invalid").tag(FfiLhQualitative.invalid)
                    }
                    TextField("LH T/C ratio (optional)", text: $lhRatio).keyboardType(.decimalPad)
                    Button("Record LH strip") {
                        model.recordLHStrip(date: date, result: lhResult, ratio: Double(lhRatio), numericLH: nil)
                    }
                    Picker("Intercourse", selection: $intercourse) {
                        Text("Intercourse").tag(FfiIntercourseKind.intercourse)
                        Text("Withdrawal").tag(FfiIntercourseKind.withdrawal)
                        Text("Genital contact").tag(FfiIntercourseKind.genitalContact)
                    }
                    Toggle("Protected", isOn: $protectedIntercourse)
                    Button("Record intercourse") {
                        model.recordIntercourse(date: date, kind: intercourse, protected: protectedIntercourse)
                    }
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
                Section("Correct an entry") {
                    Picker("Marker", selection: $markerToDelete) {
                        Text("Monitor").tag(FfiEditableMarker.monitor)
                        Text("Bleeding").tag(FfiEditableMarker.bleeding)
                        Text("Mucus").tag(FfiEditableMarker.mucus)
                        Text("Temperature").tag(FfiEditableMarker.temperature)
                        Text("LH strip").tag(FfiEditableMarker.lhStrip)
                        Text("Intercourse").tag(FfiEditableMarker.intercourse)
                        Text("Note").tag(FfiEditableMarker.note)
                        Text("Peak mark").tag(FfiEditableMarker.userMarkedPeak)
                    }
                    Button("Delete selected observation", role: .destructive) {
                        model.deleteMarker(date: date, marker: markerToDelete)
                    }
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
    private var accountSection: some View {
        Section("Account and encrypted sync") {
            if let enrollment = model.enrollment {
                Text(enrollment.email)
                Text(enrollment.hasActiveSession ? "Signed in" : "Local only · sign in to resume sync")
                    .font(.caption).foregroundStyle(.secondary)
                if let last = model.lastSyncedAt {
                    Text("Last synced \(last.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption).foregroundStyle(.secondary)
                }
                SecureField("Password", text: $password)
                if enrollment.hasActiveSession {
                    Button("Sync now") { Task { await model.syncNow() } }
                    Button("Sign out") { Task { await model.signOut() } }
                    Button("Create couple invite") { Task { await model.createCoupleInvite() } }
                    TextField("Invite code to accept", text: $inviteCode, axis: .vertical)
                        .textInputAutocapitalization(.never)
                    Button("Accept invite") { Task { await model.acceptCoupleInvite(inviteCode) } }
                    TextField("Type DELETE ACCOUNT", text: $accountDeletionConfirmation)
                    Button("Delete server account", role: .destructive) {
                        guard accountDeletionConfirmation == "DELETE ACCOUNT" else {
                            model.message = "Type DELETE ACCOUNT to confirm"
                            return
                        }
                        Task { await model.deleteAccount() }
                    }
                } else {
                    Button("Sign in") { Task { await model.signIn(password: password) } }
                }
            } else {
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                SecureField("Password (12+ characters)", text: $password)
                SecureField("Confirm password", text: $passwordConfirmation)
                Toggle("I consent to the collection and processing described in the Consumer Health Data Privacy Policy", isOn: $healthConsent)
                Link("Read the privacy policy", destination: URL(string: "https://verelle.app/consumer-health-data-privacy.html")!)
                Button("Create encrypted account") {
                    guard healthConsent else { model.message = "Read and affirm the privacy consent first"; return }
                    guard password == passwordConfirmation else { model.message = "Passwords do not match"; return }
                    Task { await model.register(email: email, password: password) }
                }
                TextField("Existing recovery code", text: $enteredRecoveryCode, axis: .vertical)
                    .textInputAutocapitalization(.never)
                Button("Recover existing account") {
                    guard password == passwordConfirmation else { model.message = "Passwords do not match"; return }
                    Task {
                        await model.recover(
                            email: email,
                            recoveryCode: enteredRecoveryCode,
                            newPassword: password
                        )
                    }
                }
            }
            if model.accountBusy { ProgressView() }
            if let code = model.recoveryCode {
                Text("Recovery code — store offline").font(.headline)
                Text(code).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            }
            if let code = model.coupleInviteCode {
                Text("Couple invite code").font(.headline)
                Text(code).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
            }
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
