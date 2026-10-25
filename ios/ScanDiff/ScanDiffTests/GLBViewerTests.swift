import WebKit
import XCTest
@testable import ScanDiff

final class GLBViewerTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/\(name).json")
        return try Data(contentsOf: url)
    }

    func testDecodesModelURLsAndLegend() throws {
        let result = try DiffResult.decode(fixture("engine_real_accept"))
        XCTAssertNotNil(result.heatmapURL)
        XCTAssertNotNil(result.baseModelURL)
        XCTAssertNotNil(result.newModelURL)
        XCTAssertEqual(result.legend?.minMM, -15)
        XCTAssertEqual(result.legend?.maxMM, 15)
        XCTAssertEqual(result.legend?.neutralBandMM, 3)
    }

    func testViewerScriptIsBundledAndRunsAsAClassicScript() throws {
        let script = try XCTUnwrap(GLBViewer.viewerScript)
        XCTAssertTrue(script.contains("customElements.define(\"model-viewer\""))
        XCTAssertFalse(script.contains("export{"))
    }

    /// Loads a real heat map from Supabase in a web view, the way the app does.
    /// Needs the network; skipped when the model can't be reached.
    @MainActor
    func testLoadsARealHeatmapInAWebView() async throws {
        let result = try DiffResult.decode(fixture("engine_real_accept"))
        let url = try XCTUnwrap(result.heatmapURL)
        let reachable = (try? await URLSession.shared.data(from: url)).map { ($0.1 as? HTTPURLResponse)?.statusCode == 200 } ?? false
        try XCTSkipUnless(reachable, "Heat map not reachable from this machine")

        let loaded = expectation(description: "model-viewer reports loaded")
        let handler = MessageSink { body in
            if body["type"] as? String == "loaded" { loaded.fulfill() }
            if body["type"] as? String == "error" { XCTFail("viewer error: \(body)") ; loaded.fulfill() }
        }
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: try XCTUnwrap(GLBViewer.viewerScript), injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        controller.add(handler, name: "viewer")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 500))
        let webView = WKWebView(frame: window.bounds, configuration: configuration)
        window.addSubview(webView)
        window.isHidden = false
        webView.loadHTMLString(GLBViewer.page(for: url), baseURL: URL(string: "https://viewer.scandiff.app/"))
        await fulfillment(of: [loaded], timeout: 45)
        controller.removeScriptMessageHandler(forName: "viewer")
    }
}

private final class MessageSink: NSObject, WKScriptMessageHandler {
    let onMessage: ([String: Any]) -> Void

    init(onMessage: @escaping ([String: Any]) -> Void) {
        self.onMessage = onMessage
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any] { onMessage(body) }
    }
}
