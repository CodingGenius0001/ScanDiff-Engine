/**
 * Refunds through Capital One's Nessie sandbox, for route handlers only: the
 * key comes from NESSIE_API_KEY, which must never get a NEXT_PUBLIC_ prefix.
 *
 * Nessie has no refund type, so a refund is a completed deposit into the demo
 * buyer's checking account. Nessie does not change balances for deposits; the
 * deposit record is the evidence. No real money moves.
 */
const BASE_URL = "https://api.nessieisreal.com";
const TIMEOUT_MS = 10_000;

/** The demo buyer, created in Nessie the first time a refund is sent. */
const BUYER = { first_name: "ScanDiff", last_name: "Demo Buyer" };
const BUYER_ADDRESS = { street_number: "1", street_name: "Market St", city: "San Francisco", state: "CA", zip: "94105" };
const ACCOUNT_NICKNAME = "ScanDiff demo buyer checking";

export class NessieError extends Error {}

export const nessieConfigured = () => Boolean(process.env.NESSIE_API_KEY);

export interface NessieRefund {
  id: string;
  amountCents: number;
  description: string;
  status: string;
  /** Last four digits of the buyer's account number. */
  accountLast4: string;
}

interface Account {
  _id: string;
  nickname: string;
  account_number: string;
}

interface Deposit {
  _id: string;
  amount: number;
  description: string;
  status: string;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.NESSIE_API_KEY;
  if (!key) throw new NessieError("NESSIE_API_KEY is not set");
  const url = `${BASE_URL}${path}?key=${encodeURIComponent(key)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new NessieError(`Nessie did not answer: ${e instanceof Error ? e.message : e}`);
  }
  const data = await res.json().catch(() => null);
  // Nessie answers 404 with a message string when a list is empty.
  if (res.status === 404 && method === "GET") return [] as T;
  if (!res.ok) throw new NessieError(`Nessie ${method} ${path} failed with ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

let buyerAccount: Promise<Account> | null = null;

/** The demo buyer's checking account, found by name or created once. */
function demoBuyerAccount(): Promise<Account> {
  buyerAccount ??= (async () => {
    const customers = await call<{ _id: string; first_name: string; last_name: string }[]>("GET", "/customers");
    let customer = customers.find((c) => c.first_name === BUYER.first_name && c.last_name === BUYER.last_name);
    if (!customer) {
      const created = await call<{ objectCreated: { _id: string } }>("POST", "/customers", {
        ...BUYER,
        address: BUYER_ADDRESS,
      });
      customer = { ...BUYER, _id: created.objectCreated._id };
    }
    const accounts = await call<Account[]>("GET", `/customers/${customer._id}/accounts`);
    const account = accounts.find((a) => a.nickname === ACCOUNT_NICKNAME);
    if (account) return account;
    const created = await call<{ objectCreated: Account }>("POST", `/customers/${customer._id}/accounts`, {
      type: "Checking",
      nickname: ACCOUNT_NICKNAME,
      rewards: 0,
      balance: 500,
    });
    return created.objectCreated;
  })();
  // A failed lookup is retried on the next refund instead of being cached.
  buyerAccount.catch(() => (buyerAccount = null));
  return buyerAccount;
}

const inFlight = new Map<string, Promise<NessieRefund>>();

/**
 * Deposits `amountCents` back to the demo buyer. `description` identifies the
 * refund: sending the same one again returns the deposit already made, and
 * the same one sent twice at once makes one deposit.
 */
export function refundBuyer(amountCents: number, description: string): Promise<NessieRefund> {
  let refund = inFlight.get(description);
  if (!refund) {
    refund = sendRefund(amountCents, description).finally(() => inFlight.delete(description));
    inFlight.set(description, refund);
  }
  return refund;
}

async function sendRefund(amountCents: number, description: string): Promise<NessieRefund> {
  const account = await demoBuyerAccount();
  const path = `/accounts/${account._id}/deposits`;
  const existing = (await call<Deposit[]>("GET", path)).find((d) => d.description === description);
  const deposit =
    existing ??
    (
      await call<{ objectCreated: Deposit }>("POST", path, {
        medium: "balance",
        transaction_date: new Date().toISOString().slice(0, 10),
        status: "completed",
        amount: amountCents / 100,
        description,
      })
    ).objectCreated;
  return {
    id: deposit._id,
    amountCents: Math.round(deposit.amount * 100),
    description: deposit.description,
    status: deposit.status,
    accountLast4: account.account_number.slice(-4),
  };
}
