import SwiftUI

@main
struct ScanDiffApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
                .onOpenURL { url in
                    appModel.open(url)
                }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        NavigationStack {
            if let scan = appModel.activeScan {
                ScanFlowView(model: scan) {
                    appModel.leaveScan()
                }
            } else {
                HomeView()
            }
        }
    }
}
