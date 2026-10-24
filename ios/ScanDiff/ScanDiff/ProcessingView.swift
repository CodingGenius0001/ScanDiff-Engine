import SwiftUI

struct ProcessingView: View {
    @Bindable var model: ScanSessionModel

    var body: some View {
        VStack(spacing: 16) {
            ProgressView(value: model.progress) {
                Text(model.statusMessage)
            }
            Text("Reduced detail, on this iPhone. Keep the app open.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button("Cancel") {
                model.cancelProcessing()
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .navigationTitle("Processing")
        .task {
            await model.runProcessing()
        }
    }
}
