import XCTest
@testable import ScanDiff

/// Responses recorded from engine.scandiff.us (Oct 24) and the session handshake.
final class EngineSessionTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/\(name).json")
        return try Data(contentsOf: url)
    }

    func testDecodesCurrentEngineMockWithRegions() throws {
        let result = try DiffResult.decode(fixture("engine_mock_needs_review"))
        XCTAssertEqual(result.verdict, "needs_review")
        XCTAssertEqual(result.triage, .inconclusive)
        XCTAssertTrue(result.isMock)
        XCTAssertEqual(result.comparedFraction ?? 0, 0.94, accuracy: 1e-9)
        XCTAssertFalse(result.regions.isEmpty)
        XCTAssertEqual(result.regions.first?.triage, .wear)
        XCTAssertEqual(result.regions.first?.title, "Normal wear")
        XCTAssertTrue(result.regions.contains { $0.triage == .needsReview })
        XCTAssertEqual(result.histogram.edgesMM.count, result.histogram.shares.count + 1)
        XCTAssertEqual(result.maxChangeMM ?? 0, 4.87, accuracy: 1e-9)
        XCTAssertGreaterThan(result.uncoveredCount, 0)
    }

    func testDecodesCurrentEngineRealAccept() throws {
        let result = try DiffResult.decode(fixture("engine_real_accept"))
        XCTAssertEqual(result.triage, .noChange)
        XCTAssertFalse(result.isMock)
        XCTAssertEqual(result.confidence, 1)
        XCTAssertNotNil(result.reason)
        XCTAssertEqual(result.comparedFraction ?? 0, 0.8652, accuracy: 1e-9)
        XCTAssertTrue(result.regions.isEmpty)
    }

    func testInconclusiveVerdictHasItsOwnHeadline() throws {
        var json = try JSONSerialization.jsonObject(with: fixture("engine_real_accept")) as? [String: Any] ?? [:]
        json["verdict"] = "inconclusive"
        json["reason"] = "Only 31% of the surface was seen in both scans."
        let result = try DiffResult.decode(JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(result.triage, .inconclusive)
        XCTAssertEqual(result.headline, "Inconclusive: couldn't compare reliably")
        XCTAssertEqual(result.reason, "Only 31% of the surface was seen in both scans.")
    }

    func testExpiredSessionRefreshesOnceAndRetries() async throws {
        StubEngine.diffBody = try fixture("engine_real_accept")
        StubEngine.reset()
        URLProtocol.registerClass(StubEngine.self)
        defer { URLProtocol.unregisterClass(StubEngine.self) }

        let client = LiveEngineClient(baseURL: URL(string: "https://stub.engine.test")!, sessionID: "expired")
        let result = try await client.diff(baseID: UUID(), newID: UUID())

        XCTAssertEqual(result.triage, .noChange)
        XCTAssertEqual(StubEngine.sessionsSentToDiff, ["expired", "fresh"])
        XCTAssertEqual(StubEngine.healthCalls, 1)
    }
}

/// Fake engine: /health hands out "fresh"; /diff answers 401 for any other session.
final class StubEngine: URLProtocol {
    nonisolated(unsafe) static var diffBody = Data()
    nonisolated(unsafe) static var sessionsSentToDiff: [String] = []
    nonisolated(unsafe) static var healthCalls = 0

    static func reset() {
        sessionsSentToDiff = []
        healthCalls = 0
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host() == "stub.engine.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        let status: Int
        let body: Data
        if url.path().hasSuffix("/health") {
            Self.healthCalls += 1
            status = 200
            body = Data(#"{"status":"ok","session_id":"fresh"}"#.utf8)
        } else {
            let session = request.value(forHTTPHeaderField: "X-Session-ID") ?? ""
            Self.sessionsSentToDiff.append(session)
            status = session == "fresh" ? 200 : 401
            body = status == 200 ? Self.diffBody : Data(#"{"detail":"Missing or expired session."}"#.utf8)
        }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
