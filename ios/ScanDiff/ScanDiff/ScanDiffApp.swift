import SwiftUI

@main
struct ScanDiffApp: App {
    @StateObject private var auth = AuthService()
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environment(appModel)
                .task {
                    Diagnostics.start()
                    auth.start()
                }
                .onOpenURL(perform: route)
        }
    }

    private func route(_ url: URL) {
        if GoogleNativeSignIn.handle(url) {
            return
        }
        if SupabaseProvider.isLoginCallback(url) {
            auth.handleCallback(url)
            return
        }
        appModel.open(url, isSignedIn: auth.phase == .signedIn)
    }
}
