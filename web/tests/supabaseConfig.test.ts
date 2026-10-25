import { afterEach, describe, expect, it, vi } from "vitest";

/** A fake JWT-style key carrying `role`; not a real key. */
const fakeJwt = (role: string) =>
  ["e30", Buffer.from(JSON.stringify({ role })).toString("base64url"), "c2lnbmF0dXJl"].join(".");

async function load(key: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
  return import("@/lib/supabaseConfig");
}

afterEach(() => vi.unstubAllEnvs());

describe("the browser only ever gets the publishable key", () => {
  it.each([fakeJwt("service_role"), "sb_secret_fake0000000000"])("refuses to start with a secret key", async (key) => {
    await expect(load(key)).rejects.toThrow(/secret \(service role\) key/);
  });

  it.each([fakeJwt("anon"), "sb_publishable_fake0000000000", "not-a-jwt"])("accepts %s", async (key) => {
    const config = await load(key);
    expect(config.supabaseConfigured).toBe(true);
  });

  it("is off without a URL or key", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect((await import("@/lib/supabaseConfig")).supabaseConfigured).toBe(false);
  });
});
