import SwiftUI

struct ScanningTips: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Scanning tips")
                .font(.headline)
            Label("Use a matte object. Glass and mirrors reconstruct poorly.", systemImage: "cube")
            Label("Use even light, and avoid hard shadows.", systemImage: "sun.max")
            Label("Walk slowly all the way around the object.", systemImage: "arrow.triangle.2.circlepath")
            Label("Keep the object still. You move, not the object. Turning it mid-scan breaks tracking.", systemImage: "hand.raised")
            Label("Only flip it between orbits, when the app pauses and asks.", systemImage: "arrow.up.and.down")
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
