import SwiftUI

struct AppLogo: View {
    var size: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [Color(hex: 0x2563EB), Color(hex: 0x0D9488)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size, height: size)
            .overlay {
                Image(systemName: "cube.transparent")
                    .font(.system(size: size * 0.46, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: size * 0.26))
                    .foregroundStyle(.white, Color(hex: 0x0D9488))
                    .offset(x: size * 0.06, y: size * 0.06)
            }
            .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
            .accessibilityHidden(true)
    }
}
