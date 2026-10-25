import SwiftUI
import WebKit

enum GLBViewerState: Equatable {
    case loading(Double)
    case loaded
    case failed(String)
}

/// Interactive GLB viewer (drag to orbit, pinch to zoom). iOS has no native
/// glTF loader, so this runs Google's <model-viewer> (Viewer/model-viewer.min.js,
/// bundled so it works without a CDN) in a web view. Shows vertex colors
/// (the engine's heat map) and textures.
struct GLBViewer: UIViewRepresentable {
    let url: URL
    var onState: (GLBViewerState) -> Void = { _ in }

    func makeCoordinator() -> Coordinator {
        Coordinator(onState: onState)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let controller = WKUserContentController()
        if let script = Self.viewerScript {
            controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        controller.add(context.coordinator, name: "viewer")
        configuration.userContentController = controller
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        load(url, into: webView, coordinator: context.coordinator)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onState = onState
        if context.coordinator.loadedURL != url {
            load(url, into: webView, coordinator: context.coordinator)
        }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "viewer")
    }

    private func load(_ url: URL, into webView: WKWebView, coordinator: Coordinator) {
        coordinator.loadedURL = url
        let report = onState
        guard Self.viewerScript != nil else {
            DispatchQueue.main.async { report(.failed("The 3D viewer is missing from this build.")) }
            return
        }
        DispatchQueue.main.async { report(.loading(0)) }
        // The page needs an https origin so the model's host can answer with CORS.
        webView.loadHTMLString(Self.page(for: url), baseURL: URL(string: "https://viewer.scandiff.app/"))
    }

    /// model-viewer ships as an ES module; its only module-only line is the
    /// trailing `export {…}`, so dropping it lets it run as a user script.
    /// It is wrapped in a strict function so its top-level names stay out of
    /// the page's global scope, as they would in a module.
    static let viewerScript: String? = {
        guard let url = Bundle.main.url(forResource: "model-viewer.min", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            return nil
        }
        let classic = source.replacingOccurrences(
            of: #"export\{[^}]*\};?"#,
            with: "",
            options: .regularExpression
        )
        return "(function () {\n\"use strict\";\n\(classic)\n}).call(undefined);"
    }()

    static func page(for url: URL) -> String {
        let source = url.absoluteString
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
        return """
        <!doctype html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          html, body { margin: 0; height: 100%; background: transparent; }
          model-viewer { width: 100%; height: 100%; --poster-color: transparent; --progress-bar-height: 0px; }
        </style>
        </head>
        <body>
        <model-viewer id="mv" src="\(source)" loading="eager" reveal="auto" camera-controls touch-action="none"
          interaction-prompt="none" shadow-intensity="0.6" exposure="0.85"
          environment-image="neutral" camera-orbit="35deg 70deg auto"></model-viewer>
        <script>
        (function () {
          const post = (message) => window.webkit.messageHandlers.viewer.postMessage(message);
          const viewer = document.getElementById("mv");
          viewer.addEventListener("progress", (e) => post({ type: "progress", value: e.detail.totalProgress }));
          viewer.addEventListener("load", () => post({ type: "loaded" }));
          viewer.addEventListener("error", (e) => post({ type: "error", value: String((e.detail && e.detail.sourceError) || "Could not load the model") }));
        })();
        </script>
        </body>
        </html>
        """
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        var onState: (GLBViewerState) -> Void
        var loadedURL: URL?

        init(onState: @escaping (GLBViewerState) -> Void) {
            self.onState = onState
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "progress":
                let value = (body["value"] as? Double) ?? 0
                if value < 1 { onState(.loading(value)) }
            case "loaded":
                onState(.loaded)
            case "error":
                Diagnostics.log("3D viewer error: \(body["value"] as? String ?? "unknown")")
                onState(.failed("The 3D model couldn't be loaded. Check the connection and try again."))
            default:
                break
            }
        }
    }
}
