import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "fake-nessie-key-for-tests";
const DISPUTED_AT = "2026-10-24T18:00:00.000Z";

/** A fake Nessie sandbox: customers, accounts and deposits in memory. */
function fakeNessie({ failDeposits = false } = {}) {
  const customers: { _id: string; first_name: string; last_name: string }[] = [];
  const accounts: Record<string, { _id: string; nickname: string; account_number: string }[]> = {};
  const deposits: Record<string, { _id: string; amount: number; description: string; status: string }[]> = {};
  const posts: string[] = [];
  let next = 0;
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    expect(url.origin).toBe("https://api.nessieisreal.com");
    expect(url.searchParams.get("key")).toBe(KEY);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const method = init?.method ?? "GET";
    const path = url.pathname;
    // Lets concurrent requests interleave the way they would over the network.
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (method === "POST") posts.push(path);
    let m: RegExpMatchArray | null;
    if (path === "/customers") {
      if (method === "GET") return customers.length ? Response.json(customers) : Response.json("not found", { status: 404 });
      const created = { _id: `c${++next}`, ...body };
      customers.push(created);
      return Response.json({ objectCreated: created }, { status: 201 });
    }
    if ((m = path.match(/^\/customers\/(\w+)\/accounts$/))) {
      const list = (accounts[m[1]] ??= []);
      if (method === "GET") return Response.json(list);
      const created = { _id: `a${++next}`, nickname: body.nickname, account_number: "0000111122223333" };
      list.push(created);
      return Response.json({ objectCreated: created }, { status: 201 });
    }
    if ((m = path.match(/^\/accounts\/(\w+)\/deposits$/))) {
      const list = (deposits[m[1]] ??= []);
      if (method === "GET") return Response.json(list);
      if (failDeposits) return Response.json({ message: "boom" }, { status: 500 });
      const created = { _id: `d${++next}`, amount: body.amount, description: body.description, status: body.status };
      list.push(created);
      return Response.json({ objectCreated: created }, { status: 201 });
    }
    throw new Error(`unexpected Nessie call ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { posts, deposits: () => Object.values(deposits).flat() };
}

async function route() {
  vi.resetModules();
  return import("@/app/api/refunds/route");
}

const request = (body: unknown) =>
  new Request("http://localhost/api/refunds", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => vi.stubEnv("NESSIE_API_KEY", KEY));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/refunds", () => {
  it.each([
    [{ itemId: "nope", disputedAt: DISPUTED_AT }, 404],
    [{ itemId: "car-001", disputedAt: DISPUTED_AT }, 404],
    [{ itemId: "mug-001", disputedAt: "yesterday" }, 400],
    [{ itemId: "mug-001" }, 400],
    ["not json", 404],
    [null, 404],
  ])("rejects %j with %i before calling Nessie", async (body, code) => {
    const nessie = fakeNessie();
    const { POST } = await route();

    const res = await POST(request(body));

    expect(res.status).toBe(code);
    expect(nessie.posts).toEqual([]);
  });

  it("answers 503 when the server has no Nessie key", async () => {
    vi.stubEnv("NESSIE_API_KEY", "");
    const { POST } = await route();

    expect((await POST(request({ itemId: "mug-001", disputedAt: DISPUTED_AT }))).status).toBe(503);
  });

  it("deposits the catalog price, never an amount from the browser", async () => {
    const nessie = fakeNessie();
    const { POST } = await route();
    const { MOCK_ITEMS } = await import("@/lib/mock/catalog");
    const price = MOCK_ITEMS.find((i) => i.id === "mug-001")!.priceCents!;

    const res = await POST(request({ itemId: "mug-001", disputedAt: DISPUTED_AT, amountCents: 1 }));
    const receipt = await res.json();

    expect(res.status).toBe(200);
    expect(receipt.amountCents).toBe(price);
    expect(receipt.accountLast4).toBe("3333");
    expect(receipt.description).toContain(DISPUTED_AT);
    expect(JSON.stringify(receipt)).not.toContain(KEY);
    expect(nessie.posts).toEqual(["/customers", "/customers/c1/accounts", "/accounts/a2/deposits"]);
  });

  it("returns the same deposit when the same dispute is refunded again", async () => {
    const nessie = fakeNessie();
    const { POST } = await route();

    const first = await (await POST(request({ itemId: "mug-001", disputedAt: DISPUTED_AT }))).json();
    const again = await (await POST(request({ itemId: "mug-001", disputedAt: DISPUTED_AT }))).json();

    expect(again.id).toBe(first.id);
    expect(nessie.deposits()).toHaveLength(1);
  });

  it("makes one deposit when the same dispute is refunded twice at once (double click, two tabs)", async () => {
    const nessie = fakeNessie();
    const { POST } = await route();
    const body = { itemId: "mug-001", disputedAt: DISPUTED_AT };

    const [a, b] = await Promise.all([POST(request(body)), POST(request(body))]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(nessie.deposits()).toHaveLength(1);
    expect((await a.json()).id).toBe((await b.json()).id);
  });

  it("answers 502 without Nessie's details or the key when the sandbox refuses", async () => {
    fakeNessie({ failDeposits: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await route();

    const res = await POST(request({ itemId: "mug-001", disputedAt: DISPUTED_AT }));
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("boom");
    expect(error.mock.calls.flat().join(" ")).not.toContain(KEY);
  });

  it("retries the buyer lookup after a failed one instead of caching the failure", async () => {
    const { POST } = await route();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request({ itemId: "mug-001", disputedAt: DISPUTED_AT }))).status).toBe(502);

    fakeNessie();
    expect((await POST(request({ itemId: "mug-001", disputedAt: DISPUTED_AT }))).status).toBe(200);
  });
});
