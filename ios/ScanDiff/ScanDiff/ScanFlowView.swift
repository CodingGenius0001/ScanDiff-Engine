import SwiftUI

struct ScanFlowView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void

    var body: some View {
        Group {
            switch model.stage {
            case .capture:
                CaptureView(model: model, onClose: onClose)
            case .processing:
                ProcessingView(model: model)
            case .review, .uploading:
                ReviewView(model: model, onClose: onClose)
                    .overlay {
                        if case .uploading = model.stage {
                            ZStack {
                                Color.black.opacity(0.25).ignoresSafeArea()
                                ProgressView("Uploading…")
                                    .padding()
                                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
            case .saved:
                SavedScanView(model: model, onClose: onClose)
            case .result:
                DiffResultView(model: model, onClose: onClose)
            case .rejected(let message):
                MessageScreen(title: "Re-scan", message: message, showsTips: true, onClose: onClose)
            case .failed(let message):
                MessageScreen(title: "Scan failed", message: message, showsTips: false, onClose: onClose)
            }
        }
        .navigationTitle(model.request.itemID)
        .navigationBarTitleDisplayMode(.inline)
    }
}
