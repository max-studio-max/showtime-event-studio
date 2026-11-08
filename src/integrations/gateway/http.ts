/**
 * Outbound provider traffic with the safeguards from LD spec §3.5 / §10:
 * host allowlist (no arbitrary URL fetches), https only, timeouts, response
 * size cap, retry only on retryable faults with exponential backoff + jitter
 * (honouring Retry-After), per-provider spacing, daily budgets, a circuit
 * breaker, in-flight request coalescing and a TTL cache. Fetch, clock and
 * sleep are injectable so the behaviour is unit-tested without network.
 */
import type { ProviderId } from '../../domain/types';
import type { GatewayError, GatewayErrorCode, ProviderStatus } from '../contracts';
import { ALLOWED_HOSTS, PROVIDERS, USER_AGENT } from '../providers';

export class ProviderError extends Error {
  constructor(public code: GatewayErrorCode, message: string, public status = 502, public retryAfterSec?: number, public provider?: ProviderId) {
    super(message);
  }
  toJSON(): GatewayError {
    return { code: this.code, message: this.message, retryAfterSec: this.retryAfterSec, provider: this.provider };
  }
}

export interface HttpDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  log: (line: string) => void;
}

export interface RequestOpts {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  /** Alternate hosts (same provider allowlist) to try when the primary is overloaded. */
  mirrors?: string[];
  cacheKey?: string;
}

const MAX_BYTES = 3_000_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Strip credentials and token-like query values before anything is logged. */
export function redact(url: string): string {
  return url.replace(/([?&](?:apikey|api_key|key|token|access_token|client_secret)=)[^&#]*/gi, '$1[REDACTED]');
}

export function assertAllowed(provider: ProviderId, url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ProviderError('invalid_params', 'Malformed upstream URL', 400, undefined, provider);
  }
  if (u.protocol !== 'https:') throw new ProviderError('forbidden', 'Only https upstreams are allowed', 400, undefined, provider);
  if (!ALLOWED_HOSTS[provider].includes(u.hostname)) throw new ProviderError('forbidden', `Host ${u.hostname} is not on the ${provider} allowlist`, 400, undefined, provider);
  if (u.username || u.password) throw new ProviderError('forbidden', 'Credentials in URL are not allowed', 400, undefined, provider);
  return u;
}

interface ProviderState {
  nextSlot: number;
  failures: number;
  openUntil: number;
  budgetDay: string;
  budgetUsed: number;
  lastSuccessAt: number | null;
  lastError: GatewayError | null;
  rateLimit: ProviderStatus['rateLimit'];
}

export class ProviderHttp {
  private state = new Map<ProviderId, ProviderState>();
  private cache = new Map<string, { at: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private deps: HttpDeps, private circuitThreshold = 4, private circuitCooldownMs = 60_000) {}

  private st(p: ProviderId): ProviderState {
    let s = this.state.get(p);
    if (!s) {
      s = { nextSlot: 0, failures: 0, openUntil: 0, budgetDay: '', budgetUsed: 0, lastSuccessAt: null, lastError: null, rateLimit: null };
      this.state.set(p, s);
    }
    const day = new Date(this.deps.now()).toISOString().slice(0, 10);
    if (s.budgetDay !== day) {
      s.budgetDay = day;
      s.budgetUsed = 0;
    }
    return s;
  }

  status(p: ProviderId, configured: boolean): ProviderStatus {
    const s = this.st(p);
    const now = this.deps.now();
    return {
      id: p,
      name: PROVIDERS[p].name,
      configured,
      circuit: s.openUntil > now ? 'open' : s.failures >= this.circuitThreshold ? 'half_open' : 'closed',
      lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : null,
      lastError: s.lastError,
      budgetUsedToday: s.budgetUsed,
      dailyBudget: PROVIDERS[p].dailyBudget,
      rateLimit: s.rateLimit,
      policy: PROVIDERS[p],
    };
  }

  /** Spacing per provider policy: reserve the next slot, then wait for it. */
  private async throttle(p: ProviderId) {
    const s = this.st(p);
    const now = this.deps.now();
    const slot = Math.max(now, s.nextSlot);
    s.nextSlot = slot + PROVIDERS[p].minIntervalMs;
    if (slot > now) await this.deps.sleep(slot - now);
  }

  async json<T = unknown>(provider: ProviderId, url: string, opts: RequestOpts = {}): Promise<{ data: T; cached: boolean }> {
    const key = opts.cacheKey ?? `${provider}|${opts.method ?? 'GET'}|${url}|${opts.body ?? ''}`;
    const ttl = PROVIDERS[provider].cacheTtlMs;
    const hit = this.cache.get(key);
    if (hit && this.deps.now() - hit.at < ttl) return { data: hit.value as T, cached: true };
    const running = this.inflight.get(key);
    if (running) return { data: (await running) as T, cached: false };
    const p = this.fetchWithPolicy(provider, url, opts).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    const data = await p;
    this.cache.set(key, { at: this.deps.now(), value: data });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string);
    return { data: data as T, cached: false };
  }

  private async fetchWithPolicy(provider: ProviderId, url: string, opts: RequestOpts): Promise<unknown> {
    const s = this.st(provider);
    const now = this.deps.now();
    if (s.openUntil > now) {
      throw new ProviderError('circuit_open', `${PROVIDERS[provider].name} is paused after repeated failures; retrying after ${Math.ceil((s.openUntil - now) / 1000)} s`, 503, Math.ceil((s.openUntil - now) / 1000), provider);
    }
    const budget = PROVIDERS[provider].dailyBudget;
    if (budget != null && s.budgetUsed >= budget) throw new ProviderError('budget_exhausted', `Daily request budget for ${PROVIDERS[provider].name} is used up`, 429, undefined, provider);

    const targets = [url, ...(opts.mirrors ?? [])];
    targets.forEach((t) => assertAllowed(provider, t));
    const maxRetries = opts.maxRetries ?? 2;
    let lastErr: ProviderError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const target = targets[Math.min(attempt, targets.length - 1)];
      await this.throttle(provider);
      s.budgetUsed++;
      try {
        const data = await this.once(provider, target, opts);
        s.failures = 0;
        s.lastSuccessAt = this.deps.now();
        s.lastError = null;
        return data;
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError('network', (e as Error).message ?? 'Network error', 502, undefined, provider);
        lastErr = err;
        const retryable = ['rate_limited', 'upstream_error', 'timeout', 'network'].includes(err.code);
        this.deps.log(`[${provider}] attempt ${attempt + 1} ${err.code} ${redact(target)}`);
        if (!retryable || attempt === maxRetries) break;
        const backoff = err.retryAfterSec != null ? err.retryAfterSec * 1000 : 500 * 2 ** attempt;
        await this.deps.sleep(Math.min(backoff, 15_000) + Math.floor(this.deps.random() * 250));
      }
    }
    // Only upstream/transport failures trip the breaker; caller errors (bad params, auth) do not.
    if (lastErr && ['upstream_error', 'timeout', 'network', 'bad_response'].includes(lastErr.code)) {
      s.failures++;
      if (s.failures >= this.circuitThreshold) s.openUntil = this.deps.now() + this.circuitCooldownMs;
    }
    s.lastError = lastErr?.toJSON() ?? null;
    throw lastErr;
  }

  private async once(provider: ProviderId, url: string, opts: RequestOpts): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
    let res: Response;
    try {
      res = await this.deps.fetch(url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(opts.headers ?? {}) },
        signal: ctrl.signal,
        redirect: 'error', // no redirect chains to unvetted hosts
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === 'AbortError') throw new ProviderError('timeout', `${PROVIDERS[provider].name} did not respond in time`, 504, undefined, provider);
      throw new ProviderError('network', `Could not reach ${PROVIDERS[provider].name}`, 502, undefined, provider);
    }
    clearTimeout(timer);
    const lim = res.headers.get('rate-limit');
    if (lim) {
      const reset = Number(res.headers.get('rate-limit-reset'));
      this.st(provider).rateLimit = { limit: Number(lim) || null, available: Number(res.headers.get('rate-limit-available')) || null, resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset).toISOString() : null };
    }
    if (!res.ok) {
      const ra = Number(res.headers.get('retry-after'));
      const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
      const name = PROVIDERS[provider].name;
      if (res.status === 401) throw new ProviderError('unauthorized', `${name} rejected the API key`, 502, undefined, provider);
      if (res.status === 403) throw new ProviderError('forbidden', `${name} refused this request (permissions or policy)`, 502, undefined, provider);
      if (res.status === 404) throw new ProviderError('not_found', `${name} has no such record`, 404, undefined, provider);
      if (res.status === 429) throw new ProviderError('rate_limited', `${name} rate limit reached`, 429, retryAfter, provider);
      if (RETRYABLE.has(res.status)) throw new ProviderError('upstream_error', `${name} returned ${res.status}`, 502, retryAfter, provider);
      throw new ProviderError('upstream_error', `${name} returned ${res.status}`, 502, undefined, provider);
    }
    const len = Number(res.headers.get('content-length'));
    if (len > MAX_BYTES) throw new ProviderError('bad_response', 'Upstream response too large', 502, undefined, provider);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new ProviderError('bad_response', 'Upstream response too large', 502, undefined, provider);
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError('bad_response', `${PROVIDERS[provider].name} returned malformed JSON`, 502, undefined, provider);
    }
  }
}
