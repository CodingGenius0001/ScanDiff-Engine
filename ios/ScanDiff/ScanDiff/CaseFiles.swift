import Foundation
import Supabase

/// One row of `public.scans` (ios/supabase/setup.sql), as the website reads it (web/lib/scans.ts).
struct ScanRecord: Identifiable, Equatable, Hashable, Decodable {
    let id: UUID
    let itemID: String
    let version: Int
    let kind: ScanKind
    let modelURL: URL?
    let sha256: String?
    let createdBy: String?
    let createdAt: Date?
    var decision: String?

    private enum Keys: String, CodingKey {
        case id, item_id, version, kind, model_url, sha256, created_by, created_at, decision
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(UUID.self, forKey: .id)
        itemID = try c.decode(String.self, forKey: .item_id)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 0
        kind = (try? c.decode(ScanKind.self, forKey: .kind)) ?? .baseline
        modelURL = (try c.decodeIfPresent(String.self, forKey: .model_url)).flatMap(URL.init(string:))
        sha256 = try c.decodeIfPresent(String.self, forKey: .sha256)
        createdBy = try c.decodeIfPresent(String.self, forKey: .created_by)
        createdAt = (try c.decodeIfPresent(String.self, forKey: .created_at)).flatMap(Self.parseDate)
        decision = try c.decodeIfPresent(String.self, forKey: .decision)
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// Postgres returns timestamps with or without fractional seconds.
    static func parseDate(_ raw: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
    }

    static let columns = "id,item_id,version,kind,model_url,sha256,created_by,created_at,decision"
}

/// Where a handoff stands, read from the scans alone. The website's payment
/// hold lives in the seller's browser, so the app cannot see it.
enum CaseStatus: Equatable {
    case awaitingCheckIn
    case awaitingDecision
    case released
    case disputed

    var label: String {
        switch self {
        case .awaitingCheckIn: "Awaiting check-in scan"
        case .awaitingDecision: "Scan uploaded: awaiting buyer review"
        case .released: "Released"
        case .disputed: "Disputed"
        }
    }

    /// Statuses waiting on someone light up orange, as on the site.
    var isLit: Bool { self == .awaitingCheckIn || self == .awaitingDecision }
}

/// An item built from its scans, the way the website builds it (itemFromRows):
/// the newest baseline, then every check scan uploaded after it.
struct CaseFile: Identifiable, Equatable, Hashable {
    let itemID: String
    let baseline: ScanRecord
    let checks: [ScanRecord]

    var id: String { itemID }
    var latestCheck: ScanRecord? { checks.last }

    var status: CaseStatus {
        switch latestCheck?.decision {
        case nil: latestCheck == nil ? .awaitingCheckIn : .awaitingDecision
        case "accept": .released
        default: .disputed
        }
    }

    var updatedAt: Date? { latestCheck?.createdAt ?? baseline.createdAt }

    static func from(itemID: String, rows: [ScanRecord]) -> CaseFile? {
        let sorted = rows.sorted { $0.version < $1.version }
        guard let baseline = sorted.last(where: { $0.kind == .baseline }) else { return nil }
        let checks = sorted.filter { $0.kind == .check && $0.version > baseline.version }
        return CaseFile(itemID: itemID, baseline: baseline, checks: checks)
    }
}

struct CaseFilesService {
    /// The signed-in user's items that have a baseline, newest activity first:
    /// items they own or joined. Row-level security leaves out everyone else's.
    func myCaseFiles() async throws -> [CaseFile] {
        let rows: [ScanRecord] = try await makeClient()
            .from("scans")
            .select(ScanRecord.columns)
            .order("created_at", ascending: false)
            .limit(1000)
            .execute()
            .value
        return Dictionary(grouping: rows.filter { !$0.itemID.hasPrefix("_") }, by: \.itemID)
            .compactMap { CaseFile.from(itemID: $0.key, rows: $0.value) }
            .sorted { ($0.updatedAt ?? .distantPast) > ($1.updatedAt ?? .distantPast) }
    }

    func caseFile(itemID: String) async throws -> CaseFile? {
        let client = try makeClient()
        let rows: [ScanRecord] = try await client
            .from("scans")
            .select(ScanRecord.columns)
            .eq("item_id", value: itemID)
            .execute()
            .value
        return CaseFile.from(itemID: itemID, rows: rows)
    }

    private func makeClient() throws -> SupabaseClient {
        guard let client = SupabaseProvider.client else { throw ScanError.missingSecrets }
        return client
    }
}

/// Item ids for new listings, with the website's rule (web/lib/itemId.ts):
/// "Coffee Maker!" becomes coffee-maker-001, or the next free number. The
/// database assigns the number (create_item), so two listings never collide.
enum ItemIDAllocator {
    static let maxLength = 64

    static func slugify(_ name: String) -> String {
        let folded = name.lowercased().folding(options: .diacriticInsensitive, locale: nil)
        var slug = ""
        var pendingDash = false
        for scalar in folded.unicodeScalars {
            if ("a"..."z").contains(scalar) || ("0"..."9").contains(scalar) {
                if pendingDash && !slug.isEmpty { slug.append("-") }
                slug.unicodeScalars.append(scalar)
                pendingDash = false
            } else {
                pendingDash = true
            }
        }
        return String(slug.prefix(maxLength - 4)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}
