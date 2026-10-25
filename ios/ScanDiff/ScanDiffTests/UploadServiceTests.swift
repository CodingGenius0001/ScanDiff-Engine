import Supabase
import XCTest
@testable import ScanDiff

/// Upload retries, and the Accept/Dispute write against a stubbed Supabase (no network).
final class UploadRetryTests: XCTestCase {
    private struct Flaky: Error {}

    func testSucceedsOnTheLastAttempt() async throws {
        var calls = 0
        try await UploadService.withRetry(backoff: { _ in .zero }) {
            calls += 1
            if calls < 3 { throw Flaky() }
        }
        XCTAssertEqual(calls, 3)
    }

    func testGivesUpAfterThreeAttemptsWithTheLastError() async {
        var calls = 0
        do {
            try await UploadService.withRetry(backoff: { _ in .zero }) {
                calls += 1
                throw Flaky()
            }
            XCTFail("Expected the error")
        } catch {
            XCTAssertTrue(error is Flaky)
        }
        XCTAssertEqual(calls, 3)
    }

    func testDoesNotRetryOnceCancelled() async {
        var calls = 0
        let task = Task {
            try await UploadService.withRetry(backoff: { _ in .seconds(5) }) {
                calls += 1
                withUnsafeCurrentTask { $0?.cancel() }
                throw Flaky()
            }
        }
        let result = await task.result
        XCTAssertThrowsError(try result.get())
        XCTAssertEqual(calls, 1)
    }

    func testBacksOffAfterEachFailedTryButNotTheLast() async throws {
        var backedOffAfter: [Int] = []
        do {
            try await UploadService.withRetry(backoff: { attempt in
                backedOffAfter.append(attempt)
                return .zero
            }) {
                throw Flaky()
            }
        } catch {}
        XCTAssertEqual(backedOffAfter, [1, 2])
    }

    func testDefaultBackoffWaitsOneThenTwoSeconds() {
        XCTAssertEqual(UploadService.uploadBackoff(after: 1), .seconds(1))
        XCTAssertEqual(UploadService.uploadBackoff(after: 2), .seconds(2))
    }
}

final class DecisionWriteTests: XCTestCase {
    private let scanID = UUID(uuidString: "BBBBBBBB-0000-0000-0000-000000000002")!

    override func setUp() {
        StubPostgREST.reset()
    }

    private func service() -> UploadService {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubPostgREST.self]
        let client = SupabaseClient(
            supabaseURL: URL(string: "https://stub.supabase.test")!,
            supabaseKey: "anon-key-for-tests",
            options: SupabaseClientOptions(
                auth: .init(storage: MemoryAuthStorage(), emitLocalSessionAsInitialSession: true),
                global: .init(session: URLSession(configuration: configuration))
            )
        )
        return UploadService(client: client)
    }

    func testAcceptIsWrittenToTheCheckScanRow() async throws {
        StubPostgREST.rows = #"[{"id":"bbbbbbbb-0000-0000-0000-000000000002"}]"#

        try await service().writeDecision(scanID: scanID, decision: "accept")

        let request = try XCTUnwrap(StubPostgREST.requests.first)
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.url?.path(), "/rest/v1/scans")
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertTrue(query.contains(URLQueryItem(name: "id", value: "eq.\(scanID.uuidString)")))
        XCTAssertTrue(query.contains(URLQueryItem(name: "select", value: "id")))
        XCTAssertEqual(StubPostgREST.bodies.first, #"{"decision":"accept"}"#)
    }

    func testAnUpdateThatMatchedNoRowIsAnError() async {
        // What PostgREST answers when row-level security filters the row out.
        StubPostgREST.rows = "[]"

        do {
            try await service().writeDecision(scanID: scanID, decision: "dispute")
            XCTFail("A decision that changed no row must not look saved")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("not saved"), error.localizedDescription)
        }
    }

    func testServerErrorsAreReported() async {
        StubPostgREST.status = 403
        StubPostgREST.rows = #"{"code":"42501","message":"permission denied for table scans"}"#

        do {
            try await service().writeDecision(scanID: scanID, decision: "accept")
            XCTFail("Expected an error")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
    }
}

private final class MemoryAuthStorage: AuthLocalStorage, @unchecked Sendable {
    private var values: [String: Data] = [:]
    func store(key: String, value: Data) throws { values[key] = value }
    func retrieve(key: String) throws -> Data? { values[key] }
    func remove(key: String) throws { values[key] = nil }
}

/// Fake PostgREST for stub.supabase.test: answers every request with `status` and `rows`.
final class StubPostgREST: URLProtocol {
    nonisolated(unsafe) static var rows = "[]"
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var requests: [URLRequest] = []
    nonisolated(unsafe) static var bodies: [String] = []

    static func reset() {
        rows = "[]"
        status = 200
        requests = []
        bodies = []
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host() == "stub.supabase.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests.append(request)
        Self.bodies.append(Self.body(of: request))
        let response = HTTPURLResponse(
            url: request.url!, statusCode: Self.status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(Self.rows.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func body(of request: URLRequest) -> String {
        if let data = request.httpBody { return String(decoding: data, as: UTF8.self) }
        guard let stream = request.httpBodyStream else { return "" }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return String(decoding: data, as: UTF8.self)
    }
}
