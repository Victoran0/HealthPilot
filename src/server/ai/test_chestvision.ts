/**
 * test_chestvision.ts
 * ===================
 * Test the ChestVision Space in isolation and DUMP THE RAW RESPONSE, so you can see
 * exactly what shape it returns before any parsing logic touches it.
 *
 *   npx tsx --env-file=.env src/server/ai/test_chestvision.ts path/to/xray.png
 *
 * Env: CHESTVISION_ENDPOINT (Space root), INFERENCE_API_TOKEN
 *
 * Runs four checks:
 *   1. /health      — is the Space awake and the model loaded?
 *   2. /metadata    — what labels and tuned thresholds does it actually have?
 *   3. /predict     — RAW response dump (this is the one that answers your question)
 *   4. field-name probe — if "file" is rejected, try common alternatives
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const BASE = (process.env.CHESTVISION_ENDPOINT ?? "").replace(/\/$/, "");
const TOKEN = process.env.INFERENCE_API_TOKEN;
const imagePath = process.argv[2] || "";

if (!BASE) {
  console.error("Set CHESTVISION_ENDPOINT to the Space root (https://<user>-<space>.hf.space)");
  process.exit(1);
}
if (!imagePath) {
  console.error("Usage: npx tsx --env-file=.env src/server/ai/test_chestvision.ts <path-to-xray>");
  process.exit(1);
}

const authHeaders = (): Record<string, string> =>
  TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

/* ------------------------------------------------------------------ */
async function checkHealth() {
  console.log("\n=== 1. /health ===");
  try {
    const res = await fetch(`${BASE}/health`);
    const body = await res.text();
    console.log(`status ${res.status}`);
    console.log(body);
    if (!res.ok) console.log("⚠ Space may be asleep — hit it again in ~30s to wake it.");
  } catch (err) {
    console.error("Could not reach /health:", String(err));
  }
}

/* ------------------------------------------------------------------ */
async function checkMetadata() {
  console.log("\n=== 2. /metadata (labels + tuned thresholds) ===");
  try {
    const res = await fetch(`${BASE}/metadata`, { headers: authHeaders() });
    const text = await res.text();
    console.log(`status ${res.status}`);
    if (!res.ok) {
      console.log(text.slice(0, 400));
      if (res.status === 401) console.log("⚠ 401 — INFERENCE_API_TOKEN missing or wrong.");
      return;
    }
    console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 2000));
  } catch (err) {
    console.error("metadata failed:", String(err));
  }
}

/* ------------------------------------------------------------------ */
async function predictRaw(fieldName: string) {
  const bytes = await readFile(imagePath);
  const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });

  const form = new FormData();
  form.append(fieldName, blob, basename(imagePath));

  const res = await fetch(`${BASE}/predict`, {
    method: "POST",
    headers: authHeaders(), // no Content-Type — fetch sets the multipart boundary
    body: form,
  });

  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

async function checkPredict() {
  console.log(`\n=== 3. /predict — RAW RESPONSE (field: "file") ===`);
  const { status, ok, text } = await predictRaw("file");
  console.log(`status ${status}\n`);

  console.log("--- RAW BODY (verbatim, no parsing) ---");
  console.log(text.slice(0, 4000));
  console.log("--- END RAW BODY ---\n");

  if (!ok) {
    console.log("⚠ Non-200. If 422, the field name is probably wrong — see check 4.");
    return null;
  }

  // Now show the STRUCTURE, which is what your node's parser needs to match.
  try {
    const json = JSON.parse(text);
    console.log("Top-level keys:", Object.keys(json));
    for (const [k, v] of Object.entries(json)) {
      const type = Array.isArray(v) ? `array[${v.length}]` : typeof v;
      console.log(`  ${k}: ${type}`);
      if (Array.isArray(v) && v.length) {
        console.log(`    first element:`, JSON.stringify(v[0]));
      } else if (v && typeof v === "object") {
        console.log(`    keys:`, Object.keys(v as object).slice(0, 8));
      }
    }

    // What your current node looks for:
    console.log("\n--- What chestVisionNode expects ---");
    console.log("raw.findings present? ", "findings" in json, Array.isArray(json.findings) ? `(${json.findings.length})` : "");
    console.log("raw.labels   present? ", "labels" in json);
    if (!("findings" in json) && !("labels" in json)) {
      console.log("\n⚠ NEITHER key exists — this is why your node logged empty results.");
      console.log("  Align chestVisionNode's parser to the actual top-level keys above.");
    }

    // Show every numeric prediction found anywhere, pre-threshold — what you asked for.
    console.log("\n--- ALL PREDICTIONS FOUND (pre-threshold) ---");
    dumpPredictions(json);
    return json;
  } catch {
    console.log("Body is not JSON — check the Space's /predict return type.");
    return null;
  }
}

/** Walk the response and print any label/probability pairs, whatever the shape. */
function dumpPredictions(json: any) {
  const rows: Array<{ label: string; prob: number; extra?: string }> = [];

  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object") {
          const label = item.label ?? item.pathology ?? item.name ?? item.class;
          const prob = item.probability ?? item.score ?? item.prob ?? item.confidence;
          if (label != null && typeof prob === "number") {
            const thr = item.threshold != null ? ` thr=${item.threshold}` : "";
            const pred = item.predicted != null ? ` predicted=${item.predicted}` : "";
            rows.push({ label: String(label), prob, extra: thr + pred });
          } else visit(item);
        }
      }
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "number" && v >= 0 && v <= 1) rows.push({ label: k, prob: v });
      else visit(v);
    }
  };

  visit(json);

  if (!rows.length) {
    console.log("(none found — the response contains no label/probability pairs)");
    return;
  }
  rows.sort((a, b) => b.prob - a.prob);
  for (const r of rows) {
    const bar = "█".repeat(Math.round(r.prob * 30)).padEnd(30, "·");
    console.log(`${r.label.padEnd(22)} ${bar} ${(r.prob * 100).toFixed(1)}%${r.extra ?? ""}`);
  }
}

/* ------------------------------------------------------------------ */
async function probeFieldNames() {
  console.log("\n=== 4. field-name probe ===");
  console.log("Only needed if check 3 returned 422/400.\n");
  for (const name of ["file", "image", "img", "upload", "files"]) {
    try {
      const { status } = await predictRaw(name);
      console.log(`  field "${name}": status ${status}${status === 200 ? "  ← works" : ""}`);
    } catch (err) {
      console.log(`  field "${name}": error ${String(err).slice(0, 60)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
async function main() {
  console.log(`ChestVision test → ${BASE}`);
  console.log(`Image: ${imagePath}`);
  console.log(`Auth: ${TOKEN ? "Bearer token set" : "NO TOKEN (only works if ALLOW_NO_AUTH=1)"}`);

  await checkHealth();
  await checkMetadata();
  const json = await checkPredict();
  if (!json) await probeFieldNames();

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});