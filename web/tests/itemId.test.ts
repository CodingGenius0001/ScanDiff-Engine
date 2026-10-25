import { describe, expect, it } from "vitest";
import { closestItemId, itemIdProblem, normalizeItemId, scanLink, slugifyName } from "@/lib/itemId";

/** ItemID.normalize from ios/ScanDiff/ScanDiff/Models.swift, line for line: what the app files a scan under. */
function iosNormalize(value: string): string {
  let result = "";
  let pendingDash = false;
  for (const ch of value.toLowerCase()) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      if (pendingDash && result) result += "-";
      result += ch;
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return result;
}

/** The item a scandiff:// link opens in the app, as DeepLink.parse reads it. */
const appItem = (link: string) => iosNormalize(new URL(link.replace("scandiff://", "https://")).searchParams.get("item") ?? "");

describe("scan links open the same item in the app", () => {
  it.each(["mug-002", "coffee-maker-1", "coffe-maker-2", "charger-1", "a", "x-999"])("%s", (id) => {
    expect(appItem(scanLink(id, "check", { existing: true }))).toBe(id);
    expect(appItem(scanLink(id, "baseline"))).toBe(id);
  });

  it("every id /sell can hand out (slug + -NNN) survives the app's normalization", () => {
    for (const name of ["Mug", "Coffee Maker!", "  Bike   helmet ", "Ünïcödé lamp", "A".repeat(80), "x--y", "9 volt"]) {
      const slug = slugifyName(name);
      if (!slug) continue;
      const id = `${slug}-001`;
      expect(itemIdProblem(id)).toBeNull();
      expect(iosNormalize(id)).toBe(id);
    }
  });

  it.each(["shoe_01", "Coffee-Maker", "mug__2", "a_"])("refuses a QR code for %s, which the app would file elsewhere", (id) => {
    expect(() => scanLink(id, "check", { existing: true })).toThrow(/iPhone app/);
  });

  it("carries the invite code on check-ins only", () => {
    expect(scanLink("mug-002", "check", { invite: "ab cd" })).toBe("scandiff://scan?item=mug-002&kind=check&invite=ab%20cd");
    expect(scanLink("mug-002", "baseline", { invite: "abcd" })).toBe("scandiff://scan?item=mug-002&kind=baseline");
  });

  it("rejects ids a scan link cannot carry", () => {
    expect(() => scanLink("bad/id", "check", { existing: true })).toThrow();
    expect(() => scanLink("Mug 2", "check")).toThrow();
    expect(() => scanLink("", "check")).toThrow();
  });
});

describe("item id helpers", () => {
  it("normalizes and validates typed ids", () => {
    expect(normalizeItemId("  Mug 002 ")).toBe("mug-002");
    expect(itemIdProblem("")).toMatch(/Enter/);
    expect(itemIdProblem("_smoke")).toMatch(/reserved/);
    expect(itemIdProblem("a".repeat(65))).toMatch(/64/);
    expect(itemIdProblem("mug!")).toMatch(/Use only/);
  });

  it("suggests the near miss, like the app's 'did you mean'", () => {
    expect(closestItemId("coffe-maker-3", ["coffee-maker-3", "charger-1"])).toBe("coffee-maker-3");
    expect(closestItemId("coffee-maker-3", ["coffee-maker-3"])).toBeUndefined();
    expect(closestItemId("lamp", ["coffee-maker-3"])).toBeUndefined();
  });
});
