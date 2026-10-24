import Foundation
import Supabase

private struct ItemRow: Decodable {
    let item_id: String
}

struct ItemsService {
    /// Distinct item ids, most recently scanned first.
    func recentItemIDs(limit: Int = 12) async throws -> [String] {
        let client = try makeClient()
        let rows: [ItemRow] = try await client
            .from("scans")
            .select("item_id")
            .order("created_at", ascending: false)
            .limit(200)
            .execute()
            .value
        var seen = Set<String>()
        var ids: [String] = []
        for row in rows where !row.item_id.hasPrefix("_") && seen.insert(row.item_id).inserted {
            ids.append(row.item_id)
            if ids.count == limit { break }
        }
        return ids
    }

    func hasBaseline(itemID: String) async throws -> Bool {
        let client = try makeClient()
        let rows: [ItemRow] = try await client
            .from("scans")
            .select("item_id")
            .eq("item_id", value: itemID)
            .eq("kind", value: ScanKind.baseline.rawValue)
            .limit(1)
            .execute()
            .value
        return !rows.isEmpty
    }

    /// The closest known id, for "did you mean" on typos like coffe-maker-2.
    static func closest(to itemID: String, in candidates: [String]) -> String? {
        let target = itemID.lowercased()
        return candidates
            .filter { $0.lowercased() != target }
            .map { ($0, editDistance(target, $0.lowercased())) }
            .filter { $0.1 <= max(2, target.count / 4) }
            .min { $0.1 < $1.1 }?
            .0
    }

    private static func editDistance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        guard !a.isEmpty else { return b.count }
        guard !b.isEmpty else { return a.count }
        var previous = Array(0...b.count)
        var current = [Int](repeating: 0, count: b.count + 1)
        for i in 1...a.count {
            current[0] = i
            for j in 1...b.count {
                let cost = a[i - 1] == b[j - 1] ? 0 : 1
                current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            }
            swap(&previous, &current)
        }
        return previous[b.count]
    }

    private func makeClient() throws -> SupabaseClient {
        guard let client = SupabaseProvider.client else { throw ScanError.missingSecrets }
        return client
    }
}
