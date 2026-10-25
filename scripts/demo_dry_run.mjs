#!/usr/bin/env node
/**
 * Marketplace demo dry run: diff two real scans, write the buyer's decision,
 * and check that the web app's realtime path (postgres_changes on `scans`)
 * fires. Prints a timeline.
 *
 * By default the decision is written to the `_smoke` test row and restored
 * afterwards, so real scans are not touched. Pass --row <scans.id> to target a
 * real check scan instead.
 *
 * Env (never printed): SUPABASE_URL, SUPABASE_KEY (publishable), ENGINE_URL,
 * and optionally DEMO_EMAIL + DEMO_PASSWORD to write as the demo user.
 * Defaults are read from web/.env.local and engine/.env when present.
 *
 *   node scripts/demo_dry_run.mjs [--base <id>] [--new <id>] [--row <id>] [--decision accept|dispute]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "web", "package.json"));
const { createClient } = require("@supabase/supabase-js");

function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(path.join(root, file), "utf8")
        .split("\n")
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const web = readEnv("web/.env.local");
const engine = readEnv("engine/.env");
const env = {
  url: process.env.SUPABASE_URL || web.NEXT_PUBLIC_SUPABASE_URL || engine.SUPABASE_URL,
  key: process.env.SUPABASE_KEY || web.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  engine: process.env.ENGINE_URL || web.NEXT_PUBLIC_DIFF_API_URL || "http://127.0.0.1:8000",
  email: process.env.DEMO_EMAIL,
  password: process.env.DEMO_PASSWORD,
};

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []),
);
const BASE = args.base ?? "4d4b567f-8b1a-4146-8f55-ef59ef8a3a07"; // coffee-maker-1
const NEW = args.new ?? "371735cf-77d6-4c1f-960d-725012a74b2b"; // coffe-maker-2, same physical item
const DECISION = args.decision ?? "accept";

const t0 = performance.now();
const stamp = () => `+${((performance.now() - t0) / 1000).toFixed(2)}s`.padStart(8);
const log = (step, detail = "") => console.log(`${stamp()}  ${step}${detail ? `  ${detail}` : ""}`);
const fail = (message) => {
  log("FAIL", message);
  process.exitCode = 1;
};

if (!env.url || !env.key) {
  console.error("Set SUPABASE_URL and SUPABASE_KEY, or create web/.env.local.");
  process.exit(2);
}

const supabase = createClient(env.url, env.key, { auth: { persistSession: false } });

// 1. Sign in as the demo user when credentials are provided.
if (env.email && env.password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: env.email, password: env.password });
  if (error) fail(`demo sign-in: ${error.message}`);
  else log("signed in", `as ${data.user.email} (${data.user.id.slice(0, 8)}…)`);
} else {
  log("auth", "no DEMO_EMAIL/DEMO_PASSWORD: writing with the publishable key (anon)");
}

// 2. Diff two real scans.
const diffStart = performance.now();
const response = await fetch(`${env.engine.replace(/\/+$/, "")}/diff`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ base_id: BASE, new_id: NEW }),
});
const diff = await response.json();
if (!response.ok) fail(`/diff ${response.status}: ${diff.detail ?? JSON.stringify(diff)}`);
else
  log(
    "diff",
    `${((performance.now() - diffStart) / 1000).toFixed(1)}s  triage=${diff.triage} verdict=${diff.verdict} ` +
      `confidence=${(diff.confidence ?? diff.verdict_confidence)?.toFixed(2)} regions=${diff.regions.length} mock=${diff.is_mock}`,
  );

// 3. Pick the row the decision goes on.
let rowId = args.row;
if (!rowId) {
  const { data, error } = await supabase.from("scans").select("id").eq("item_id", "_smoke").limit(1);
  if (error || !data?.length) {
    fail(`no _smoke row to write to (${error?.message ?? "not found"}); pass --row <scans.id>`);
    process.exit();
  }
  rowId = data[0].id;
}
const { data: before, error: readError } = await supabase.from("scans").select("id,item_id,decision").eq("id", rowId).maybeSingle();
if (readError || !before) {
  fail(`could not read row ${rowId}: ${readError?.message ?? "not found"}`);
  process.exit();
}
log("target row", `${before.item_id} ${rowId.slice(0, 8)}… decision=${before.decision}`);

// 4. Subscribe exactly as web/lib/liveScans.ts does, then write the decision.
const target = before.decision === DECISION ? (DECISION === "accept" ? "dispute" : "accept") : DECISION;
let writeAt = 0;
const event = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 10_000);
  supabase
    .channel(`dry-run:${before.item_id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "scans", filter: `item_id=eq.${before.item_id}` }, (payload) => {
      if (payload.new?.id === rowId && payload.new?.decision === target) {
        clearTimeout(timer);
        resolve(payload);
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") log("realtime", "subscribed to postgres_changes on public.scans");
    });
});
await new Promise((resolve) => setTimeout(resolve, 1500));

writeAt = performance.now();
const { data: written, error: writeError } = await supabase.from("scans").update({ decision: target }).eq("id", rowId).select("id,decision");
if (writeError || !written?.length) fail(`write decision=${target}: ${writeError?.message ?? "0 rows updated (RLS?)"}`);
else log("decision written", `decision=${target}`);

const received = await event;
if (received) log("realtime event", `received ${((performance.now() - writeAt) / 1000).toFixed(2)}s after the write`);
else fail("no realtime event within 10 s: is public.scans in the supabase_realtime publication?");

// 5. Restore the row and report.
if (target !== before.decision) {
  const { error } = await supabase.from("scans").update({ decision: before.decision }).eq("id", rowId);
  log("restored", error ? `FAILED: ${error.message}` : `decision=${before.decision}`);
}
await supabase.removeAllChannels();
log(process.exitCode ? "DRY RUN FAILED" : "DRY RUN PASSED");
process.exit();
