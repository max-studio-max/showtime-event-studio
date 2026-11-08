/** Browser client for the local gateway. Never talks to providers directly and never holds keys. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderId } from '../domain/types';
import { useStore } from '../state/store';
import type { GatewayError, ProviderStatus } from './contracts';
import { PROVIDERS } from './providers';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: GatewayError };

/** Which user toggles a request needs (a search may also geocode through Nominatim). */
export function providersFor(p: ProviderId): ProviderId[] {
  return p === 'osm_overpass' ? ['osm_overpass', 'osm_nominatim'] : [p];
}

export async function api<T>(path: string, params: Record<string, string | number | null | undefined>, provider: ProviderId | null, signal?: AbortSignal): Promise<ApiResult<T>> {
  if (provider) {
    const toggles = useStore.getState().settings.providers;
    const off = providersFor(provider).filter((p) => !toggles[p]);
    if (off.length) return { ok: false, error: { code: 'disabled', message: `${off.map((p) => PROVIDERS[p].name).join(' and ')} ${off.length > 1 ? 'are' : 'is'} switched off in Settings → Live data providers.`, provider } };
  }
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${path}${q.size ? `?${q}` : ''}`, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, error: { code: 'timeout', message: 'Request cancelled' } };
    return { ok: false, error: { code: 'gateway_offline', message: 'The SHOWTIME gateway is not running. Start it with “npm run gateway” (or “npm run dev:all”).' } };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // Vite answers unknown /api paths with HTML when the proxy target is down.
    return { ok: false, error: { code: 'gateway_offline', message: 'The SHOWTIME gateway is not running. Start it with “npm run gateway” (or “npm run dev:all”).' } };
  }
  if (!res.ok) {
    const err = (body as { error?: GatewayError })?.error;
    return { ok: false, error: err ?? { code: res.status === 502 || res.status === 504 ? 'gateway_offline' : 'upstream_error', message: `Gateway returned ${res.status}` } };
  }
  return { ok: true, data: body as T };
}

/** Run one request at a time per hook; a new search cancels the previous one. */
export function useApi<T>() {
  const [state, setState] = useState<{ loading: boolean; result: ApiResult<T> | null }>({ loading: false, result: null });
  const ctrl = useRef<AbortController | null>(null);
  const run = useCallback(async (path: string, params: Record<string, string | number | null | undefined>, provider: ProviderId | null) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState((s) => ({ ...s, loading: true }));
    const result = await api<T>(path, params, provider, c.signal);
    if (!c.signal.aborted) setState({ loading: false, result });
    return result;
  }, []);
  useEffect(() => () => ctrl.current?.abort(), []);
  return { ...state, run, clear: () => setState({ loading: false, result: null }) };
}

export function useProviderStatus() {
  const [status, setStatus] = useState<ApiResult<ProviderStatus[]> | null>(null);
  const refresh = useCallback(async () => setStatus(await api<ProviderStatus[]>('/api/providers/status', {}, null)), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { status, refresh };
}
