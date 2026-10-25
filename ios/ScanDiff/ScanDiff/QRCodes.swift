import CoreImage.CIFilterBuiltins
import SwiftUI
import VisionKit

/// Reads the website's QR codes inside the app. The Camera app opens the same
/// scandiff:// links too; this saves leaving the app.
struct QRScannerSheet: View {
    var onCode: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var rejected: String?

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    QRScannerView { code in
                        if Self.isScanDiffCode(code) {
                            onCode(code)
                            dismiss()
                        } else {
                            rejected = "That code isn't a ScanDiff link."
                        }
                    }
                    .ignoresSafeArea()
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "camera.badge.ellipsis")
                            .font(.largeTitle)
                        Text("The camera isn't available for scanning codes. Allow camera access in Settings, or use the Camera app on the QR code.")
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(Theme.inkSoft)
                    .padding(32)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                VStack(spacing: 6) {
                    Text(rejected ?? "Point at the baseline or check-in code on the website.")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(rejected == nil ? Theme.ink : Theme.stamp)
                    Caption("Codes from scandiff.us open the right item and scan.")
                }
                .padding(14)
                .frame(maxWidth: .infinity)
                .background(Theme.panel.opacity(0.92), in: RoundedRectangle(cornerRadius: Theme.radius))
                .padding()
            }
            .paperBackground()
            .navigationTitle("Scan a QR code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    static func isScanDiffCode(_ text: String) -> Bool {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return url.scheme?.lowercased() == "scandiff" || AppModel.caseFileID(in: url) != nil
    }
}

private struct QRScannerView: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        context.coordinator.onCode = onCode
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onCode: (String) -> Void
        private var lastCode: String?

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
        }

        func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in items {
                guard case .barcode(let barcode) = item, let code = barcode.payloadStringValue, code != lastCode else { continue }
                lastCode = code
                onCode(code)
                return
            }
        }
    }
}

/// The website's two codes for an item, so the seller can hand the buyer the
/// check-in code straight from the phone.
struct ScanCodesSheet: View {
    let itemID: String
    /// The item's invite code: the check-in code adds the buyer's account to the item.
    var invite: String?
    @Environment(\.dismiss) private var dismiss
    @State private var kind: ScanKind = .check

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Picker("Code", selection: $kind) {
                    Text("Check-in").tag(ScanKind.check)
                    Text("Baseline").tag(ScanKind.baseline)
                }
                .pickerStyle(.segmented)
                if let image = QRImage.make(for: ScanLink.url(itemID: itemID, kind: kind, invite: invite)) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .padding(16)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: Theme.radius))
                        .frame(maxWidth: 300)
                        .accessibilityLabel("QR code for the \(kind == .check ? "check-in" : "baseline") scan of \(itemID)")
                }
                VStack(spacing: 4) {
                    Text(kind == .check ? "Buyer: scan on arrival" : "Seller: scan before packing")
                        .font(.headline)
                        .foregroundStyle(Theme.ink)
                    Text(ScanLink.url(itemID: itemID, kind: kind, invite: invite).absoluteString)
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.inkSoft)
                        .textSelection(.enabled)
                }
                Caption("The iPhone Camera app opens this code in ScanDiff, on this item.")
                Spacer()
            }
            .padding(20)
            .paperBackground()
            .navigationTitle(itemID)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}

enum ScanLink {
    /// scandiff://scan?item=<id>&kind=<baseline|check>[&invite=<code>], the link
    /// the website encodes. Only check-in links carry the invite code.
    static func url(itemID: String, kind: ScanKind, invite: String? = nil) -> URL {
        var components = URLComponents()
        components.scheme = "scandiff"
        components.host = "scan"
        components.queryItems = [URLQueryItem(name: "item", value: itemID), URLQueryItem(name: "kind", value: kind.rawValue)]
        if kind == .check, let invite {
            components.queryItems?.append(URLQueryItem(name: "invite", value: invite))
        }
        return components.url ?? URL(fileURLWithPath: "/")
    }
}

enum QRImage {
    static func make(for url: URL) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
