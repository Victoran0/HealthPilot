/**
 * lib/wakeSpaces.ts
 *
 * Wakes up HuggingFace Spaces before the first chat turn.
 * Call this in your page's useEffect (client) or in a server action / route handler
 * that runs on initial page load.
 *
 * Direct port of the Python wait_until_ready(), with two additions:
 *  - Runs all spaces concurrently (Promise.allSettled) rather than sequentially.
 *  - Returns a per-space result so the UI can show individual status if needed.
 */

export interface SpaceStatus {
  url: string;
  ok: boolean;
  reason: string;
}

interface WakeOptions {
  /** Total seconds to wait before giving up. Default 300 (5 min). */
  timeout?: number;
  /** Seconds between poll attempts. Default 8. */
  interval?: number;
  /** How many consecutive 404/405s before treating it as a config error. Default 3. */
  misrouteLimit?: number;
}

/**
 * Polls a single Space's /health endpoint until the model reports loaded,
 * the timeout expires, or a configuration error is detected.
 *
 * Mirrors the Python logic exactly:
 *   200 + { loaded: true }  -> resolve (ready)
 *   200 + { loaded: false } -> keep polling (warming up)
 *   503                     -> keep polling (still starting)
 *   404 / 405 x N           -> throw (wrong URL or Space not Running)
 *   timeout                 -> throw
 *   network error           -> keep polling (connection not ready yet)
 */
async function waitForSpace(
  baseUrl: string,
  {
    timeout = 300,
    interval = 8,
    misrouteLimit = 3,
  }: WakeOptions = {},
): Promise<SpaceStatus> {
  const deadline = Date.now() + timeout * 1000;
  let misroutes = 0;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000); // 20s per-request timeout

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) {
        // Parse carefully — some Spaces return 200 before the model is loaded.
        let body: Record<string, unknown> = {};
        try {
          body = await res.json();
        } catch {
          // Non-JSON 200 — treat as not yet loaded.
        }

        if (body.loaded === true) {
          console.log(`[wake] ${baseUrl} — awake and model loaded.`);
          return { url: baseUrl, ok: true, reason: "ready" };
        }

        console.log(`[wake] ${baseUrl} — 200 but not loaded yet, warming up…`);

      } else if (res.status === 503) {
        console.log(`[wake] ${baseUrl} — 503, still starting…`);

      } else if (res.status === 404 || res.status === 405) {
        misroutes += 1;
        console.warn(`[wake] ${baseUrl} — ${res.status} at /health (${misroutes}/${misrouteLimit})`);

        if (misroutes >= misrouteLimit) {
          const reason =
            `Persistent ${res.status}: verify BASE_URL is the exact *.hf.space URL, ` +
            `the Space status is 'Running', and check the Space logs for a boot error.`;
          console.error(`[wake] ${baseUrl} — ${reason}`);
          return { url: baseUrl, ok: false, reason };
        }

      } else {
        const snippet = (await res.text().catch(() => "")).slice(0, 120);
        console.log(`[wake] ${baseUrl} — ${res.status}: ${snippet}`);
      }

    } catch (err) {
      // Network-level errors (DNS, connection refused, AbortError from timeout).
      // Same as Python's requests.RequestException — keep polling.
      const name = err instanceof Error ? err.name : String(err);
      console.log(`[wake] ${baseUrl} — connection not ready… (${name})`);
    }

    await sleep(interval * 1000);
  }

  const reason = `Space did not become ready within ${timeout}s.`;
  console.error(`[wake] ${baseUrl} — ${reason}`);
  return { url: baseUrl, ok: false, reason };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wake ALL configured Spaces concurrently.
 * Returns once every Space has either reported ready or timed out — it never throws,
 * so a single slow/dead Space doesn't block the others or crash the page load.
 *
 * Usage:
 *   const results = await wakeSpaces();
 *   const allReady = results.every(r => r.ok);
 */
export default async function wakeSpaces(opts?: WakeOptions): Promise<SpaceStatus[]> {
  const urls = [`${process.env.CHESTVISION_ENDPOINT}`, `${process.env.EHR_ENDPOINT}`];

  if (urls.length === 0) {
    console.warn("[wake] No HF_SPACE_* env vars found — nothing to wake.");
    return [];
  }

  console.log(`[wake] Waking ${urls.length} Space(s) concurrently…`);

  // allSettled so a rejection in one doesn't cancel the others.
  const settled = await Promise.allSettled(
    urls.map((url) => waitForSpace(url, opts)),
  );

  return settled.map((r, i) =>
    r!.status === "fulfilled"
      ? r.value
      : { url: urls[i] ?? 'unknown', ok: false, reason: String(r.reason) },
  );
}

/**
 * Reads Space base URLs from env vars.
 * Add one env var per Space:
 *   HF_SPACE_CHESTVISION=https://your-user-chestvision.hf.space
 *   HF_SPACE_EHR=https://your-user-ehr.hf.space
 *   HF_SPACE_MEDGEMMA=https://your-user-medgemma.hf.space
 *
 * Works in both Next.js server context (process.env) and client context
 * (NEXT_PUBLIC_ prefix — see note below).
 */
