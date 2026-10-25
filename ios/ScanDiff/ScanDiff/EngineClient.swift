import Foundation

protocol EngineClient {
    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult
}

enum EngineClients {
    static func make() -> any EngineClient {
        let candidates = [AppSecrets.engineURL, AppSecrets.engineFallbackURL].compactMap { $0 }
        if !candidates.isEmpty {
            return FailoverEngineClient(candidates: candidates)
        }
        Diagnostics.log("⚠️ MOCK RESULT: ENGINE_URL is empty, so check scans get a fake diff, not the engine's.")
        return MockEngineClient()
    }
}

/// Sends the diff to the first engine whose /health answers: ENGINE_URL, then
/// ENGINE_URL_FALLBACK. Only an unreachable engine triggers the fallback; an
/// engine that answers with an error (404, 422) is reported as-is.
struct FailoverEngineClient: EngineClient {
    var candidates: [URL]

    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult {
        var unreachable: [String] = []
        for (index, url) in candidates.enumerated() {
            let role = index == 0 ? "primary" : "fallback"
            guard let health = await EngineHealth.check(url) else {
                Diagnostics.log("engine \(role) \(url.host() ?? "?") not healthy, trying next")
                unreachable.append(url.host() ?? url.absoluteString)
                continue
            }
            Diagnostics.log("engine \(role) \(url.host() ?? "?") answered /health session=\(health.sessionID == nil ? "none" : "yes")")
            var result = try await LiveEngineClient(baseURL: url, sessionID: health.sessionID).diff(baseID: baseID, newID: newID)
            result.engineHost = url.host()
            return result
        }
        throw ScanError.engineFailed("Couldn't reach the comparison engine (\(unreachable.joined(separator: ", "))). Check the connection and try again.")
    }
}

/// GET /health. Engines that require sessions return a `session_id` to send
/// as `X-Session-ID` on /diff; older engines return only `status`.
struct EngineHealth: Decodable {
    var sessionID: String?

    private enum Keys: String, CodingKey { case session_id }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        sessionID = try c.decodeIfPresent(String.self, forKey: .session_id)
    }

    static func check(_ baseURL: URL, timeout: TimeInterval = 4) async -> EngineHealth? {
        var request = URLRequest(url: baseURL.appendingPathComponent("health"))
        request.timeoutInterval = timeout
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse,
              http.statusCode == 200 else {
            return nil
        }
        return (try? JSONDecoder().decode(EngineHealth.self, from: data)) ?? EngineHealth(sessionID: nil)
    }

    init(sessionID: String?) {
        self.sessionID = sessionID
    }
}

struct LiveEngineClient: EngineClient {
    var baseURL: URL
    var sessionID: String?

    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult {
        var (data, status) = try await post(baseID: baseID, newID: newID, sessionID: sessionID)
        if status == 401 {
            // The session expired (engine restart or 12 h idle): get a new one and retry once.
            Diagnostics.log("engine 401 on /diff, refreshing session")
            guard let fresh = await EngineHealth.check(baseURL, timeout: 10) else {
                throw ScanError.engineFailed("The comparison engine stopped answering. Try again.")
            }
            (data, status) = try await post(baseID: baseID, newID: newID, sessionID: fresh.sessionID)
        }
        guard (200..<300).contains(status) else {
            throw ScanError.engineFailed(Self.message(status: status, body: data))
        }
        let result = try DiffResult.decode(data)
        if result.isMock {
            Diagnostics.log("⚠️ MOCK RESULT: the engine returned its fixed example (is_mock=true).")
        }
        return result
    }

    private func post(baseID: UUID, newID: UUID, sessionID: String?) async throws -> (Data, Int) {
        var request = URLRequest(url: baseURL.appendingPathComponent("diff"))
        request.httpMethod = "POST"
        // The engine downloads both scans, aligns them and uploads results: 5–30 s.
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let sessionID {
            request.setValue(sessionID, forHTTPHeaderField: "X-Session-ID")
        }
        request.httpBody = try JSONEncoder().encode(DiffBody(base_id: baseID.uuidString.lowercased(), new_id: newID.uuidString.lowercased()))
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw ScanError.engineFailed("The comparison engine did not respond.")
            }
            return (data, http.statusCode)
        } catch let error as ScanError {
            throw error
        } catch {
            throw ScanError.engineFailed("Couldn't reach the comparison engine: \(error.localizedDescription)")
        }
    }

    /// The engine's `{"detail": "..."}` is written for people, so show it as-is.
    static func message(status: Int, body: Data) -> String {
        struct Detail: Decodable { let detail: String }
        let detail = (try? JSONDecoder().decode(Detail.self, from: body))?.detail
        switch status {
        case 401: return "The comparison engine rejected the session. Try again."
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
