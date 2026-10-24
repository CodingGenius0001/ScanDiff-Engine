import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthService
    @Environment(AppModel.self) private var appModel

    var body: some View {
        Group {
            switch auth.phase {
            case .restoring:
                LaunchView()
            case .signedOut:
                LoginView()
            case .signedIn:
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
        .animation(.easeInOut(duration: 0.2), value: auth.phase)
        .onChange(of: auth.phase) { _, phase in
            switch phase {
            case .signedIn:
                appModel.resumePendingLink()
            case .signedOut:
                appModel.leaveScan()
            case .restoring:
                break
            }
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 20) {
            AppLogo(size: 64)
            ProgressView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }
}
