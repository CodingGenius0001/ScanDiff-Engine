import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var appModel
    @EnvironmentObject private var auth: AuthService

    var body: some View {
        @Bindable var appModel = appModel
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let user = auth.currentUser {
                    AccountHeader(user: user) {
                        Task { await auth.signOut() }
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("What are you scanning?")
                        .font(.headline)
                    TextField("Item id, e.g. mug-01", text: $appModel.itemID)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    Text("Use the same id every time you scan this object.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if !appModel.recentItemIDs.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(appModel.recentItemIDs, id: \.self) { id in
                                    Button(id) {
                                        appModel.itemID = id
                                        appModel.homeMessage = nil
                                    }
                                    .font(.footnote.weight(.medium))
                                    .buttonStyle(.bordered)
                                    .buttonBorderShape(.capsule)
                                    .tint(id == appModel.itemID ? .accentColor : .secondary)
                                }
                            }
                        }
                        .accessibilityLabel("Recent items")
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Picker("Kind", selection: $appModel.kind) {
                        ForEach(ScanKind.allCases) { kind in
                            Text(kind.title).tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)
                    Text(appModel.kind == .baseline
                         ? "Baseline: the reference scan, taken when the item is in known condition."
                         : "Check: a later scan, compared against the item's baseline to spot damage.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button {
                    Task { await appModel.start() }
                } label: {
                    ZStack {
                        Label("Start scan", systemImage: "viewfinder")
                            .font(.headline)
                            .opacity(appModel.isStarting ? 0 : 1)
                        if appModel.isStarting {
                            ProgressView()
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(appModel.isStarting || !ItemID.isValid(appModel.itemID.trimmingCharacters(in: .whitespacesAndNewlines)))

                if let homeMessage = appModel.homeMessage {
                    Text(homeMessage)
                        .foregroundStyle(.red)
                }

                ScanningTips()
            }
            .padding()
        }
        .navigationTitle("ScanDiff")
        .task { await appModel.loadRecentItems() }
        .refreshable { await appModel.loadRecentItems() }
    }
}

private struct AccountHeader: View {
    let user: UserSummary
    let onSignOut: () -> Void

    var body: some View {
        Menu {
            if let email = user.email {
                Text(email)
            }
            Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive, action: onSignOut)
        } label: {
            HStack(spacing: 12) {
                Avatar(user: user, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(user.displayName)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    if let email = user.email {
                        Text(email)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        }
        .accessibilityLabel("Account, \(user.displayName)")
    }
}

private struct Avatar: View {
    let user: UserSummary
    let size: CGFloat

    var body: some View {
        Group {
            if let url = user.avatarURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initials
                    }
                }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: some View {
        Circle()
            .fill(Color.accentColor.gradient)
            .overlay {
                Text(user.initials)
                    .font(.system(size: size * 0.4, weight: .semibold))
                    .foregroundStyle(.white)
            }
    }
}
