import SwiftUI

@main
struct VerelleApp: App {
    @State private var model = ChartModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .task { await model.open() }
        }
    }
}
