import QuickLook
import SwiftUI

struct ReviewView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let prepared = model.prepared {
                    ModelPreview(url: prepared.modelURL)
                        .frame(height: 280)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    Text(prepared.metadata.kind == ScanKind.baseline.rawValue ? "Baseline" : "Check")
                        .font(.headline)
                    Text("\(prepared.metadata.photos.count) key photos · \(model.shotCount) captured")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("SHA256 \(prepared.metadata.model_sha256.prefix(12))…")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                    Text(prepared.directory.path)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                if let poseWarning = model.poseWarning {
                    Text(poseWarning)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
                Button("Upload") {
                    Task { await model.upload() }
                }
                .buttonStyle(.borderedProminent)
                Button("Done") { onClose() }
                    .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle("Review")
    }
}

struct ModelPreview: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(url: url)
    }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {
        context.coordinator.url = url
        controller.reloadData()
    }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var url: URL

        init(url: URL) {
            self.url = url
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}
