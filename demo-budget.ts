// Spending cap for the owner's SUBQ_API_KEY when the app runs as a hosted demo.
//
// Serverless instances do not share memory, so the spent amount lives in a shared store
// (Upstash Redis over its REST API, no SDK). Each request reserves an upper bound of its cost
// with one atomic INCRBY before the upstream call. If that takes the total over the cap, the
// reservation is given back and the request is refused. After a successful call, the
// reservation is corrected to the billed `usage.input_tokens`. In every other case the
// reservation is kept, because the SubQ docs do not say which failed requests are billed.

/** SubQ price for subq-snap-1.2 input tokens (docs.subq.ai, models page, 2026-11-19). */
export const DEFAULT_PRICE_USD_PER_MILLION_TOKENS = 0.04;
export const DEFAULT_DEMO_BUDGET_USD = 3;
export const DEMO_BUDGET_COUNTER_KEY = 'subq-demo-budget:input-tokens';
/** Added to each reservation to cover the model's own prompt overhead. */
export const RESERVATION_OVERHEAD_TOKENS = 4096;

export interface BudgetStore {
  /** Atomically adds `delta` (can be negative) and returns the new total. */
  incrBy(key: string, delta: number): Promise<number>;
  /** Returns the current total, or 0 when the key does not exist. */
  get(key: string): Promise<number>;
}

export interface DemoBudget {
  limitTokens: number;
  store: BudgetStore;
}

function parsePositiveNumber(raw: string | undefined, fallback: number, name: string): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} inválido: informe um número maior que zero.`);
  }
  return value;
}

/** Input-token limit that matches the dollar budget at the configured price. */
export function resolveBudgetLimitTokens(env: Record<string, string | undefined>): number {
  const budgetUsd = parsePositiveNumber(
    env.SUBQ_DEMO_BUDGET_USD,
    DEFAULT_DEMO_BUDGET_USD,
    'SUBQ_DEMO_BUDGET_USD',
  );
  const price = parsePositiveNumber(
    env.SUBQ_PRICE_USD_PER_MILLION_TOKENS,
    DEFAULT_PRICE_USD_PER_MILLION_TOKENS,
    'SUBQ_PRICE_USD_PER_MILLION_TOKENS',
  );
  return Math.floor((budgetUsd / price) * 1_000_000);
}

/**
 * Upper bound for the input tokens of one upstream body. A token covers at least one byte
 * of UTF-8 text, so the byte length bounds the token count.
 */
export function estimateMaxInputTokens(upstreamBody: string): number {
  return Buffer.byteLength(upstreamBody, 'utf8') + RESERVATION_OVERHEAD_TOKENS;
}

/**
 * Store from the env vars that the Upstash for Redis integration on the Vercel Marketplace
 * adds (KV_REST_API_* or UPSTASH_REDIS_REST_*). Returns null when they are missing.
 */
export function createUpstashBudgetStore(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): BudgetStore | null {
  const url = (env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  if (!url || !token) return null;
  if (new URL(url).protocol !== 'https:') {
    throw new Error('KV_REST_API_URL inválida: use uma URL HTTPS.');
  }

  async function command(args: Array<string | number>): Promise<unknown> {
    const res = await fetchImpl(url!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await res.json().catch(() => null)) as { result?: unknown } | null;
    if (!res.ok || !body || !('result' in body)) {
      throw new Error(`Budget store error (HTTP ${res.status}).`);
    }
    return body.result;
  }

  function toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('Budget store returned a non-numeric value.');
    return n;
  }

  return {
    async incrBy(key, delta) {
      return toNumber(await command(['INCRBY', key, Math.round(delta)]));
    },
    async get(key) {
      return toNumber(await command(['GET', key]));
    },
  };
}

/** In-memory store for tests and for local experiments. Not shared between instances. */
export function createMemoryBudgetStore(initial = 0): BudgetStore & { value: () => number } {
  let total = initial;
  return {
    async incrBy(_key, delta) {
      total += Math.round(delta);
      return total;
    },
    async get() {
      return total;
    },
    value: () => total,
  };
}
