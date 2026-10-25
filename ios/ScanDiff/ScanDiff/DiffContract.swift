import Foundation

/// Plain-language result of a comparison (contract/README.md). A triage for a
/// person to act on, not a guarantee.
enum Triage: String, Codable, CaseIterable {
    case noChange = "no_change"
    case wear
    case damage
    case inconclusive

    var title: String {
        switch self {
        case .noChange: "Triage: looks unchanged"
        case .wear: "Triage: normal wear only"
        case .damage: "Triage: likely damage"
        case .inconclusive: "Needs human review"
        }
    }

    /// Maps the engine's `verdict` (accept | damage_likely | needs_review) or a
    /// triage value onto a triage, for responses that predate the `triage` field.
    static func from(verdict: String?, hasRegions: Bool) -> Triage {
        switch verdict {
        case "accept": hasRegions ? .wear : .noChange
        case "damage_likely": .damage
        case "needs_review": .inconclusive
        case let value?: Triage(rawValue: value) ?? .inconclusive
        case nil: .inconclusive
        }
    }
}

enum RegionTriage: String, Codable {
    case wear
    case damage
    case inconclusive
    case needsReview = "needs_review"

    /// Accepts the engine's region triage (`normal_wear` | `needs_review`) too.
    init?(engineValue: String) {
        if engineValue == "normal_wear" {
            self = .wear
        } else {
            self.init(rawValue: engineValue)
        }
    }

    var title: String {
        switch self {
        case .wear: "wear"
        case .damage: "damage"
        case .inconclusive: "inconclusive"
        case .needsReview: "needs review"
        }
    }
}

/// The engine's DiffResponse, decoded tolerantly: every field is optional or
/// has a fallback, and legacy names (`confidence`, `bins_mm`, `centroid`,
/// `max_mm`) are accepted alongside the engine's (`verdict_confidence`,
/// `bin_edges_mm`, `centroid_m`, `max_depth_mm`).
struct DiffResult: Equatable, Decodable {
    var triage: Triage
    var verdict: String?
    var confidence: Double
    var reason: String?
    var comparedFraction: Double?
    var changedFraction: Double?
    var maxChangeMM: Double?
    var heatmapURL: URL?
    var histogram: DiffHistogram
    var regions: [DiffRegion]
    var uncoveredCount: Int
    var diffID: String?
    /// True for the engine's fixed example (`is_mock`) or the app's offline mock.
    var isMock: Bool
    /// Which engine answered; set by the client, not part of the response.
    var engineHost: String?

    init(
        triage: Triage,
        verdict: String? = nil,
        confidence: Double,
        reason: String? = nil,
        comparedFraction: Double? = nil,
        changedFraction: Double? = nil,
        maxChangeMM: Double? = nil,
        heatmapURL: URL? = nil,
        histogram: DiffHistogram = DiffHistogram(edgesMM: [], counts: []),
        regions: [DiffRegion] = [],
        uncoveredCount: Int = 0,
        diffID: String? = nil,
        isMock: Bool
    ) {
        self.triage = triage
        self.verdict = verdict
        self.confidence = confidence
        self.reason = reason
        self.comparedFraction = comparedFraction
        self.changedFraction = changedFraction
        self.maxChangeMM = maxChangeMM
        self.heatmapURL = heatmapURL
        self.histogram = histogram
        self.regions = regions
        self.uncoveredCount = uncoveredCount
        self.diffID = diffID
        self.isMock = isMock
    }

    private enum Keys: String, CodingKey {
        case triage, verdict, confidence, verdict_confidence, reason, verdict_reason
        case compared_fraction, heatmap_url, histogram, histogram_edges_mm, regions, uncovered_regions, stats, diff_id, is_mock
    }

    private struct Stats: Decodable {
        var changed_fraction: Double?
        var max_change_mm: Double?
        var max_mm: Double?
    }

    private struct Ignored: Decodable {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        regions = try c.decodeIfPresent([DiffRegion].self, forKey: .regions) ?? []
        verdict = try c.decodeIfPresent(String.self, forKey: .verdict)
        let explicitTriage = (try? c.decodeIfPresent(String.self, forKey: .triage)).flatMap { $0 }.flatMap(Triage.init(rawValue:))
        triage = explicitTriage ?? Triage.from(verdict: verdict, hasRegions: !regions.isEmpty)
        let rawConfidence = try c.decodeIfPresent(Double.self, forKey: .confidence)
            ?? c.decodeIfPresent(Double.self, forKey: .verdict_confidence)
            ?? 0
        confidence = min(max(rawConfidence, 0), 1)
        reason = try c.decodeIfPresent(String.self, forKey: .reason)
            ?? c.decodeIfPresent(String.self, forKey: .verdict_reason)
        comparedFraction = try c.decodeIfPresent(Double.self, forKey: .compared_fraction)
        heatmapURL = (try c.decodeIfPresent(String.self, forKey: .heatmap_url)).flatMap(URL.init(string:))
        // Current engines send `histogram` as a list of shares with edges in
        // `histogram_edges_mm`; older ones sent an object with counts.
        if let shares = try? c.decodeIfPresent([Double].self, forKey: .histogram) {
            let edges = try? c.decodeIfPresent([Double].self, forKey: .histogram_edges_mm)
            histogram = DiffHistogram(edgesMM: edges ?? [], counts: [], shares: shares)
        } else {
            histogram = (try? c.decodeIfPresent(DiffHistogram.self, forKey: .histogram)) ?? DiffHistogram(edgesMM: [], counts: [])
        }
        uncoveredCount = (try? c.decodeIfPresent([Ignored].self, forKey: .uncovered_regions))?.count ?? 0
        let stats = try? c.decodeIfPresent(Stats.self, forKey: .stats)
        changedFraction = stats?.changed_fraction
        maxChangeMM = stats?.max_change_mm ?? stats?.max_mm
        diffID = try c.decodeIfPresent(String.self, forKey: .diff_id)
        isMock = try c.decodeIfPresent(Bool.self, forKey: .is_mock) ?? false
    }

    /// The engine's `inconclusive` (scans couldn't be compared reliably) is
    /// distinct from `needs_review`, although both triage as inconclusive.
    var headline: String {
        verdict == "inconclusive" ? "Inconclusive: couldn't compare reliably" : triage.title
    }

    static func decode(_ data: Data) throws -> DiffResult {
        do {
            return try JSONDecoder().decode(DiffResult.self, from: data)
        } catch {
            throw ScanError.engineFailed("The comparison result could not be read: \(error.localizedDescription)")
        }
    }
}

struct DiffHistogram: Equatable, Decodable {
    var edgesMM: [Double]
    var counts: [Int]
    /// Share of the compared surface per bin (current engines); sums to 1.
    var shares: [Double] = []

    init(edgesMM: [Double], counts: [Int], shares: [Double] = []) {
        self.edgesMM = edgesMM
        self.counts = counts
        self.shares = shares
    }

    private enum Keys: String, CodingKey { case bins_mm, bin_edges_mm, counts }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        edgesMM = try c.decodeIfPresent([Double].self, forKey: .bins_mm)
            ?? c.decodeIfPresent([Double].self, forKey: .bin_edges_mm)
            ?? []
        counts = try c.decodeIfPresent([Int].self, forKey: .counts) ?? []
    }
}

struct DiffRegion: Equatable, Identifiable, Decodable {
    var id: String
    var triage: RegionTriage
    var label: String?
    var damageType: String?
    var kind: String?
    var areaCM2: Double?
    var maxMM: Double?
    var meanMM: Double?
    var centroidM: [Double]?
    var confidence: Double?
    var reason: String?

    init(id: String, triage: RegionTriage, damageType: String? = nil, kind: String? = nil,
         areaCM2: Double? = nil, maxMM: Double? = nil, confidence: Double? = nil, reason: String? = nil) {
        self.id = id
        self.triage = triage
        self.damageType = damageType
        self.kind = kind
        self.areaCM2 = areaCM2
        self.maxMM = maxMM
        self.confidence = confidence
        self.reason = reason
    }

    private enum Keys: String, CodingKey {
        case id, triage, label, damage_type, kind, area_cm2, max_mm, max_depth_mm, mean_mm, mean_depth_mm
        case centroid, centroid_m, confidence, reason
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        label = try c.decodeIfPresent(String.self, forKey: .label)
        damageType = try c.decodeIfPresent(String.self, forKey: .damage_type)
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
        areaCM2 = try c.decodeIfPresent(Double.self, forKey: .area_cm2)
        maxMM = try c.decodeIfPresent(Double.self, forKey: .max_mm) ?? c.decodeIfPresent(Double.self, forKey: .max_depth_mm)
        meanMM = try c.decodeIfPresent(Double.self, forKey: .mean_mm) ?? c.decodeIfPresent(Double.self, forKey: .mean_depth_mm)
        centroidM = try c.decodeIfPresent([Double].self, forKey: .centroid_m) ?? c.decodeIfPresent([Double].self, forKey: .centroid)
        confidence = try c.decodeIfPresent(Double.self, forKey: .confidence)
        reason = try c.decodeIfPresent(String.self, forKey: .reason)
        let explicit = (try? c.decodeIfPresent(String.self, forKey: .triage)).flatMap { $0 }.flatMap(RegionTriage.init(engineValue:))
        triage = explicit ?? (label == "normal_wear" ? .wear : .inconclusive)
    }

    /// Human name for what changed, e.g. "Dent" or "Missing part".
    var title: String {
        // Current engines put the damage type in `label`.
        switch damageType ?? label {
        case "dent_damage": kind == "added" ? "Raised area" : "Dent"
        case "missing_part": "Missing part"
        case "scratch_scuff": "Scratch or scuff"
        case "normal_wear": "Normal wear"
        default: label?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Change"
        }
    }
}
