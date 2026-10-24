import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        @Bindable var appModel = appModel
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Scan a physical object, save the model, and compare a later scan for damage.")
                    .foregroundStyle(.secondary)

                TextField("Item id", text: $appModel.itemID)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)

                Picker("Kind", selection: $appModel.kind) {
                    ForEach(ScanKind.allCases) { kind in
                        Text(kind.title).tag(kind)
                    }
                }
                .pickerStyle(.segmented)

                Button("Start scan") {
                    appModel.start()
                }
                .buttonStyle(.borderedProminent)
                .disabled(!ItemID.isValid(appModel.itemID.trimmingCharacters(in: .whitespacesAndNewlines)))

                if let homeMessage = appModel.homeMessage {
                    Text(homeMessage)
                        .foregroundStyle(.red)
                }

                ScanningTips()
            }
            .padding()
        }
        .navigationTitle("ScanDiff")
    }
}
