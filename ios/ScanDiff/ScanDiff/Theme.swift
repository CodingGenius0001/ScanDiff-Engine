import SwiftUI

/// The website's "Instrument" look (web/app/globals.css): near-black paper,
/// off-white ink, hairline rules and one orange status light.
enum Theme {
    static let paper = Color(hex: 0x0B0B0B)
    static let paperDeep = Color(hex: 0x161616)
    static let plate = Color(hex: 0x1C1C1C)
    static let panel = Color(hex: 0x111111)
    static let ink = Color(hex: 0xEDEDEB)
    static let inkSoft = Color(hex: 0xA2A29E)
    static let inkFaint = Color(hex: 0x6C6C69)
    static let rule = Color(hex: 0x2A2A29)
    static let stamp = Color(hex: 0xFF6A1A)

    static let radius: CGFloat = 6

    /// Large, light, tightly set titles (`.display` on the site).
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .light)
    }

    static let mono = Font.system(.footnote, design: .monospaced)
}

extension View {
    /// A hardware panel: flat, hairline frame, slightly rounded corners (`.sheet`).
    func panel(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.rule, lineWidth: 1))
    }

    /// Tight tracking for display titles.
    func displayTracking(_ size: CGFloat) -> some View {
        tracking(-0.035 * size)
    }

    /// The whole screen on the site's paper.
    func paperBackground() -> some View {
        background(Theme.paper.ignoresSafeArea())
    }
}

/// Small caption, sentence case (`.caption`).
struct Caption: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Theme.inkSoft)
    }
}

/// A primary key: light cap with an orange status light (`.key`).
struct KeyButtonStyle: ButtonStyle {
    var prominent = true

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Theme.stamp)
                .frame(width: 7, height: 7)
                .shadow(color: Theme.stamp.opacity(0.7), radius: 3)
            configuration.label
        }
        .font(.body.weight(.medium))
        .frame(maxWidth: .infinity, minHeight: 50)
        .foregroundStyle(prominent ? Theme.paper : Theme.ink)
        .background(prominent ? Theme.ink : Color.clear, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(prominent ? Color.clear : Theme.rule, lineWidth: 1))
        .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

/// An outlined secondary action without the status light.
struct OutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(Theme.ink)
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.rule, lineWidth: 1))
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// Indeterminate progress: a short orange bar crossing a hairline (`.progress`).
struct HairlineProgress: View {
    @State private var phase: CGFloat = -0.3

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.rule)
                Rectangle()
                    .fill(Theme.stamp)
                    .frame(width: proxy.size.width * 0.3)
                    .offset(x: proxy.size.width * phase)
            }
        }
        .frame(height: 1)
        .clipped()
        .onAppear {
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) {
                phase = 1
            }
        }
        .accessibilityLabel("Waiting")
    }
}

/// A label, a dotted leader and a value, as on a spec sheet (`.leader`).
struct SpecRow: View {
    let label: String
    let value: String
    var mono = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Theme.inkSoft)
            Line()
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [1, 3]))
                .foregroundStyle(Theme.inkFaint)
                .frame(height: 1)
                .offset(y: -3)
            Text(value)
                .font(mono ? Theme.mono : .subheadline)
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
        }
    }

    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            Path { $0.move(to: CGPoint(x: 0, y: rect.midY)); $0.addLine(to: CGPoint(x: rect.maxX, y: rect.midY)) }
        }
    }
}
