import Foundation
import Supabase

private struct ItemRow: Decodable {
    let item_id: String
}

/// The signed-in user's relation to an item (public.item_access in setup.sql).
enum ItemAccess: String, Decodable {
    case owner, member
    /// The item exists but belongs to other accounts.
    case others = "none"
    case missing
}

/// Items are owned by the account that scanned their first baseline (or listed
/// them on the website), and shared with others through the item's link.
/// Row-level security returns only the scans of the signed-in user's items.
struct ItemsService {
    /// The signed-in user's items, most recently scanned first.
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

    func access(itemID: String) async throws -> ItemAccess {
        try await makeClient()
            .rpc("item_access", params: ["p_item_id": itemID])
            .execute()
            .value
    }

    /// Creates the item owned by the signed-in user, or confirms they already
    /// belong to it. Throws when another account owns the id.
    func claim(itemID: String) async throws {
        try await makeClient()
            .rpc("claim_item", params: ["p_item_id": itemID])
            .execute()
    }

    /// A new item named <slug>-NNN, with the next free number across every
    /// account, owned by the signed-in user. Returns its id.
    func createItem(slug: String) async throws -> String {
        try await makeClient()
            .rpc("create_item", params: ["p_slug": slug])
            .execute()
            .value
    }

    /// The code the item's share links carry; nil unless the signed-in user belongs to the item.
    func inviteCode(itemID: String) async throws -> String? {
        struct Row: Decodable { let invite_code: String }
        let rows: [Row] = try await makeClient()
            .from("items")
            .select("invite_code")
            .eq("id", value: itemID)
            .limit(1)
            .execute()
            .value
        return rows.first?.invite_code
    }

    /// Joins the item with the invite code from its share link.
    func join(itemID: String, inviteCode: String) async throws {
        try await makeClient()
            .rpc("join_item", params: ["p_item_id": itemID, "p_invite_code": inviteCode])
            .execute()
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
