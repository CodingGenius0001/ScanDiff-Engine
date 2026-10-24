import Foundation

protocol EngineClient {
    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult
}

enum EngineClients {
    static func make() -> any EngineClient {
        if let url = AppSecrets.engineURL {
            return LiveEngineClient(baseURL: url)
        }
        Diagnostics.log("⚠️ MOCK RESULT: ENGINE_URL is empty, so check scans get a fake diff, not the engine's.")
        return MockEngineClient()
    }
}

struct LiveEngineClient: EngineClient {
    var baseURL: URL

    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult {
        var request = URLRequest(url: baseURL.appendingPathComponent("diff"))
        request.httpMethod = "POST"
        // The engine downloads both scans, aligns them and uploads results: 5–30 s.
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(DiffBody(base_id: baseID.uuidString.lowercased(), new_id: newID.uuidString.lowercased()))
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw ScanError.engineFailed("Couldn't reach the comparison engine: \(error.localizedDescription)")
        }
        guard let http = response as? HTTPURLResponse else {
            throw ScanError.engineFailed("The comparison engine did not respond.")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw ScanError.engineFailed(Self.message(status: http.statusCode, body: data))
        }
        let result = try DiffResult.decode(data)
        if result.isMock {
            Diagnostics.log("⚠️ MOCK RESULT: the engine returned its fixed example (is_mock=true).")
        }
        return result
    }

    /// The engine's `{"detail": "..."}` is written for people, so show it as-is.
    static func message(status: Int, body: Data) -> String {
        struct Detail: Decodable { let detail: String }
        let detail = (try? JSONDecoder().decode(Detail.self, from: body))?.detail
        switch status {
        case 404: return "The engine couldn't find one of the scans. \(detail ?? "")"
        case 422: return "These scans can't be compared: \(detail ?? "the engine rejected them"). Re-scan the item."
        case 503: return "The comparison engine isn't connected to storage. \(detail ?? "")"
        default: return "The comparison engine returned an error (\(status)). \(detail ?? "")"
        }
    }
}

struct MockEngineClient: EngineClient {
    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult {
        try await Task.sleep(for: .milliseconds(800))
        return DiffResult(
            triage: .inconclusive,
            verdict: "needs_review",
            confidence: 0.66,
            reason: "Mock result: one region looks like a dent; a person should confirm it.",
            changedFraction: 0.04,
            maxChangeMM: 3.1,
            regions: [
                DiffRegion(id: "r1", triage: .inconclusive, damageType: "dent_damage", kind: "dent", areaCM2: 4.2, maxMM: 3.1, confidence: 0.55),
                DiffRegion(id: "r2", triage: .wear, damageType: "normal_wear", kind: "dent", areaCM2: 2.6, maxMM: 1.4, confidence: 0.8)
            ],
            isMock: true
        )
    }
}

private struct DiffBody: Encodable {
    let base_id: String
    let new_id: String
}
