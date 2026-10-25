import SwiftUI

/// Mirrors the website's front page: list an item or scan a code, then
/// "Your case files", the items this user scanned as seller or buyer.
struct HomeView: View {
    @Environment(AppModel.self) private var appModel
    @EnvironmentObject private var auth: AuthService
    @State private var caseFiles: [CaseFile]?
    @State private var loadError: String?
    @State private var sheet: HomeSheet?
    /// A scanned code or new listing waits until its sheet is gone, so the scan cover isn't presented under it.
    @State private var afterSheet: (() -> Void)?

    private enum HomeSheet: String, Identifiable {
        case list, qr, manual
        var id: Self { self }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header
                actions
                if let message = appModel.homeMessage {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Theme.stamp)
                }
                caseFileIndex
                Button("Enter an item ID instead") { sheet = .manual }
                    .font(.footnote)
                    .foregroundStyle(Theme.inkSoft)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .paperBackground()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Wordmark()
            }
            ToolbarItem(placement: .topBarTrailing) {
                if let user = auth.currentUser {
                    AccountMenu(user: user) { Task { await auth.signOut() } }
                }
            }
        }
        .toolbarBackground(Theme.paper, for: .navigationBar)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $sheet, onDismiss: runAfterSheet) { sheet in
            switch sheet {
            case .list:
                ListItemView { itemID in
                    afterSheet = { Task { await appModel.startScan(itemID: itemID, kind: .baseline) } }
                }
            case .qr:
                QRScannerSheet { code in
                    afterSheet = { _ = appModel.openScannedCode(code) }
                }
            case .manual:
                ManualScanSheet { afterSheet = { Task { await appModel.start() } } }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            (Text("every handoff,\n").foregroundStyle(Theme.ink) + Text("measured.").foregroundStyle(Theme.inkSoft))
                .font(Theme.display(44))
                .displayTracking(44)
            Text("Scan an item before it changes hands and again after. ScanDiff shows exactly where its shape changed.")
                .font(.subheadline)
                .foregroundStyle(Theme.inkSoft)
        }
        .padding(.top, 8)
    }

    private var actions: some View {
        VStack(spacing: 10) {
            Button {
                sheet = .list
            } label: {
                Text("List an item")
            }
            .buttonStyle(KeyButtonStyle())
            Button {
                sheet = .qr
            } label: {
                Label("Scan a QR code", systemImage: "qrcode.viewfinder")
            }
            .buttonStyle(KeyButtonStyle(prominent: false))
            .disabled(appModel.isStarting)
            Caption("Seller: list the item, then scan it before packing. Buyer: scan the check-in code from the checkout page.")
        }
    }

    @ViewBuilder
    private var caseFileIndex: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Your case files")
                    .font(Theme.display(28))
                    .displayTracking(28)
                    .foregroundStyle(Theme.ink)
                Spacer()
                if caseFiles == nil && loadError == nil {
                    ProgressView().controlSize(.small)
                }
            }
            Caption("Items you scanned, as seller or buyer.")
            if let loadError {
                Text(loadError).font(.footnote).foregroundStyle(Theme.stamp)
            }
            if let caseFiles {
                if caseFiles.isEmpty {
                    Text("No case files yet. List an item or scan a QR code to start one.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.inkSoft)
                        .panel()
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(caseFiles.enumerated()), id: \.element.id) { index, caseFile in
                            NavigationLink(value: AppRoute.caseFile(caseFile.itemID)) {
                                CaseFileRow(number: index + 1, caseFile: caseFile)
                            }
                            .buttonStyle(.plain)
                            if index < caseFiles.count - 1 {
                                Rectangle().fill(Theme.rule).frame(height: 1)
                            }
                        }
                    }
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.rule, lineWidth: 1))
                }
            }
        }
    }

    private func load() async {
        await appModel.loadRecentItems()
        do {
            caseFiles = try await CaseFilesService().myCaseFiles()
            loadError = nil
        } catch {
            loadError = "Couldn't load your case files: \(error.localizedDescription)"
        }
    }

    private func runAfterSheet() {
        let action = afterSheet
        afterSheet = nil
        action?()
    }
}

private struct CaseFileRow: View {
    let number: Int
    let caseFile: CaseFile

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(String(format: "%03d", number))
                .font(.caption.monospaced())
                .foregroundStyle(Theme.inkFaint)
            VStack(alignment: .leading, spacing: 4) {
                Text(caseFile.itemID)
                    .font(.title3.weight(.light))
                    .foregroundStyle(Theme.ink)
                HStack(spacing: 6) {
                    StatusPill(status: caseFile.status)
                    if let date = caseFile.updatedAt {
                        Text(date, format: .relative(presentation: .named))
                            .font(.caption)
                            .foregroundStyle(Theme.inkFaint)
                    }
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote)
                .foregroundStyle(Theme.inkFaint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// Held and disputed light up orange; released is a lit key; as on the site.
struct StatusPill: View {
    let status: CaseStatus

    var body: some View {
        HStack(spacing: 5) {
            if status.isLit {
                Circle().fill(Theme.stamp).frame(width: 5, height: 5)
            }
            Text(status.label)
        }
        .font(.caption2.weight(.medium))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundStyle(foreground)
        .background(background, in: Capsule())
        .overlay(Capsule().strokeBorder(border, lineWidth: 1))
    }

    private var foreground: Color {
        switch status {
        case .awaitingCheckIn: Theme.stamp
        case .awaitingDecision: Theme.ink
        case .released: Theme.paper
        case .disputed: .black
        }
    }

    private var background: Color {
        switch status {
        case .released: Theme.ink
        case .disputed: Theme.stamp
        default: .clear
        }
    }

    private var border: Color {
        switch status {
        case .awaitingCheckIn: Theme.stamp.opacity(0.6)
        case .awaitingDecision: Theme.inkFaint
        case .released: Theme.ink
        case .disputed: Theme.stamp
        }
    }
}

private struct AccountMenu: View {
    let user: UserSummary
    let onSignOut: () -> Void

    var body: some View {
        Menu {
            if let email = user.email {
                Text(email)
            }
            Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive, action: onSignOut)
        } label: {
            Circle()
                .fill(Theme.plate)
                .overlay(Circle().strokeBorder(Theme.rule, lineWidth: 1))
                .overlay {
                    Text(user.initials)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                }
                .frame(width: 32, height: 32)
        }
        .accessibilityLabel("Account, \(user.displayName)")
    }
}

/// The fallback for testing: type any item id and pick the kind.
private struct ManualScanSheet: View {
    @Environment(AppModel.self) private var appModel
    @Environment(\.dismiss) private var dismiss
    var onStart: () -> Void

    var body: some View {
        @Bindable var appModel = appModel
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                TextField("Item ID, e.g. mug-002", text: $appModel.itemID)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.body.monospaced())
                    .padding(12)
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.rule, lineWidth: 1))
                if !appModel.recentItemIDs.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(appModel.recentItemIDs, id: \.self) { id in
                                Button(id) { appModel.itemID = id }
                                    .font(.caption.monospaced())
                                    .buttonStyle(.bordered)
                                    .buttonBorderShape(.capsule)
                                    .tint(id == appModel.itemID ? Theme.stamp : Theme.inkSoft)
                            }
                        }
                    }
                }
                Picker("Kind", selection: $appModel.kind) {
                    ForEach(ScanKind.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                Caption("Use the same ID every time you scan an object. Baseline: the reference scan. Check: compared against the baseline.")
                Button("Start scan") {
                    onStart()
                    dismiss()
                }
                .buttonStyle(KeyButtonStyle())
                .disabled(!ItemID.isValid(appModel.itemID.trimmingCharacters(in: .whitespacesAndNewlines)))
                Spacer()
            }
            .padding(20)
            .paperBackground()
            .navigationTitle("Enter an item ID")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
