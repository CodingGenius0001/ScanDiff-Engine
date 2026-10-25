import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthService
    @Environment(AppModel.self) private var appModel

    var body: some View {
        @Bindable var appModel = appModel
        Group {
            switch auth.phase {
            case .restoring:
                LaunchView()
            case .signedOut:
                LoginView()
            case .signedIn:
                NavigationStack(path: $appModel.path) {
                    HomeView()
                        .navigationDestination(for: AppRoute.self) { route in
                            switch route {
                            case .caseFile(let itemID):
                                CaseFileView(itemID: itemID)
                            }
                        }
                }
                // Over whatever screen started it, so a scan can begin from Home, a case file or a QR code.
                .fullScreenCover(item: $appModel.activeScan, onDismiss: appModel.openFinishedCaseFile) { scan in
                    NavigationStack {
                        ScanFlowView(model: scan) {
                            appModel.leaveScan()
                        }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .tint(Theme.stamp)
        .animation(.easeInOut(duration: 0.2), value: auth.phase)
        .onChange(of: auth.phase) { _, phase in
            switch phase {
            case .signedIn:
                appModel.resumePendingLink()
            case .signedOut:
                appModel.signedOut()
            case .restoring:
                break
            }
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 20) {
            Wordmark(size: 34)
            HairlineProgress()
                .frame(width: 120)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .paperBackground()
    }
}

/// "ScanDiff" set like the website's header, with its status light.
struct Wordmark: View {
    var size: CGFloat = 22

    var body: some View {
        HStack(spacing: size * 0.3) {
            Circle()
                .fill(Theme.stamp)
                .frame(width: size * 0.28, height: size * 0.28)
                .shadow(color: Theme.stamp.opacity(0.7), radius: 3)
            Text("ScanDiff")
                .font(Theme.display(size))
                .displayTracking(size)
                .foregroundStyle(Theme.ink)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("ScanDiff")
    }
}
