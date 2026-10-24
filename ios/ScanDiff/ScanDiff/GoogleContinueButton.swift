import SwiftUI

/// "Continue with Google" drawn to Google's sign-in branding spec:
/// official G mark, 14pt medium label, neutral fill and outline per scheme.
struct GoogleContinueButton: View {
    var isLoading: Bool
    var action: () -> Void
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .frame(width: 20, height: 20)
                } else {
                    Image("GoogleG")
                        .resizable()
                        .interpolation(.high)
                        .frame(width: 20, height: 20)
                        .accessibilityHidden(true)
                }
                Text("Continue with Google")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(labelColor)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, 12)
            .background(fillColor, in: Capsule())
            .overlay(Capsule().strokeBorder(strokeColor, lineWidth: 1))
            .opacity(isEnabled ? 1 : 0.6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Continue with Google")
    }

    private var isDark: Bool { colorScheme == .dark }
    private var fillColor: Color { isDark ? Color(hex: 0x131314) : .white }
    private var strokeColor: Color { isDark ? Color(hex: 0x8E918F) : Color(hex: 0x747775) }
    private var labelColor: Color { isDark ? Color(hex: 0xE3E3E3) : Color(hex: 0x1F1F1F) }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
