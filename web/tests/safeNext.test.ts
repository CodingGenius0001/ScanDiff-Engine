import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safeNext";

const ORIGIN = "https://scandiff.us";

/** Where the browser really ends up when a route redirects to new URL(next, origin). */
const landing = (next: string) => new URL(safeNext(next), ORIGIN);

describe("safeNext", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNext("/checkout/mug-002")).toBe("/checkout/mug-002");
    expect(safeNext("/join/mug-002?code=abc&to=checkout")).toBe("/join/mug-002?code=abc&to=checkout");
  });

  it.each([null, undefined, "", "checkout", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"])(
    "sends %j home",
    (raw) => {
      expect(safeNext(raw)).toBe("/");
    },
  );

  // URL parsing drops tab, CR and LF anywhere, so "/\t/evil.com" becomes "//evil.com".
  it.each(["/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "/\t\\evil.com", "\t//evil.com"])(
    "never leaves the site for %j",
    (raw) => {
      expect(landing(raw).origin).toBe(ORIGIN);
    },
  );

  it("never leaves the site for any short mix of slashes, backslashes and whitespace", () => {
    const parts = ["/", "\\", "\t", "\n", "\r", " ", "evil.com", "%2F", "@"];
    const seen: string[] = [];
    const walk = (prefix: string, depth: number) => {
      if (depth === 0) return;
      for (const part of parts) {
        const raw = prefix + part;
        if (landing(raw).origin !== ORIGIN) seen.push(JSON.stringify(raw));
        walk(raw, depth - 1);
      }
    };
    walk("", 4);
    expect(seen).toEqual([]);
  });
});
