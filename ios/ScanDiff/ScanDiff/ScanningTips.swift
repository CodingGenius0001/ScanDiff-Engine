import SwiftUI

struct ScanningTips: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Scanning tips")
                .font(.headline)
            Label("Use a matte object. Glass and mirrors reconstruct poorly.", systemImage: "cube")
            Label("Use even light, and avoid hard shadows.", systemImage: "sun.max")
            Label("Walk slowly all the way around the object.", systemImage: "arrow.triangle.2.circlepath")
            Label("Fill the frame, then flip the object to capture the bottom.", systemImage: "arrow.up.and.down")
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
