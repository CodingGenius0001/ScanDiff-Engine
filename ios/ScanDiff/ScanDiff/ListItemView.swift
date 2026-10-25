import SwiftUI

/// The website's /sell step on the phone: name the item, get its id
/// (assigned by the database the same way, e.g. mug-002), then scan the baseline.
struct ListItemView: View {
    var onList: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var isListing = false
    @State private var listError: String?
    @FocusState private var focused: Bool

    private var slug: String { ItemIDAllocator.slugify(name) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Caption("Seller")
                        Text("List an item")
                            .font(Theme.display(36))
                            .displayTracking(36)
                            .foregroundStyle(Theme.ink)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Item").font(.subheadline).foregroundStyle(Theme.inkSoft)
                        TextField("Mug", text: $name)
                            .focused($focused)
                            .submitLabel(.go)
                            .onSubmit(list)
                            .padding(12)
                            .background(Theme.paper, in: RoundedRectangle(cornerRadius: Theme.radius))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.rule, lineWidth: 1))
                        idCaption
                    }
                    .panel()
                    if let listError {
                        Text(listError).font(.footnote).foregroundStyle(Theme.stamp)
                    }
                    Button(isListing ? "Listing…" : "Scan the baseline", action: list)
                        .buttonStyle(KeyButtonStyle())
                        .disabled(slug.isEmpty || isListing)
                    Caption("Scan the item before packing it, on the same mat and light you'll ask the buyer to use. The price and checkout live on the website.")
                }
                .padding(20)
            }
            .paperBackground()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .onAppear { focused = true }
        }
    }

    @ViewBuilder
    private var idCaption: some View {
        if !slug.isEmpty {
            (Text("Item ID ") + Text("\(slug)-001").font(.caption.monospaced()).foregroundStyle(Theme.ink)
                + Text(", or the next free number, assigned when you list it. It's registered to your account, and every scan of this item is filed under it."))
                .font(.caption)
                .foregroundStyle(Theme.inkSoft)
        } else if !name.trimmingCharacters(in: .whitespaces).isEmpty {
            Caption("Use letters or numbers in the name.")
        } else {
            Caption("The item ID is assigned from the name, for example mug-001.")
        }
    }

    private func list() {
        guard !slug.isEmpty, !isListing else { return }
        isListing = true
        listError = nil
        Task {
            defer { isListing = false }
            do {
                let itemID = try await ItemsService().createItem(slug: slug)
                Diagnostics.log("listed \(itemID)")
                onList(itemID)
                dismiss()
            } catch {
                listError = "Couldn't list the item: \(error.localizedDescription)"
            }
        }
    }
}
