/**
 * SHOWTIME integration gateway. Holds provider credentials server-side and
 * proxies validated, rate-limited discovery requests. Read-only: it never
 * books, buys, posts or contacts anyone.
 *
 *   npm run gateway        (listens on 127.0.0.1:5241; Vite proxies /api)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProviderHttp, redact } from '../src/integrations/gateway/http';
import { Gateway } from '../src/integrations/gateway/routes';

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv(resolve(process.cwd(), '.env')), ...process.env } as Record<string, string | undefined>;
const PORT = Number(env.GATEWAY_PORT ?? 5241);
const HOST = '127.0.0.1'; // local only; not exposed to the network

const http = new ProviderHttp({
  fetch: globalThis.fetch,
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: Math.random,
  log: (l) => console.log(new Date().toISOString(), l),
});
const gateway = new Gateway(http, { ticketmasterKey: env.TICKETMASTER_API_KEY?.trim() || null });

const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:5240`, `http://localhost:5240`]);

createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const origin = req.headers.origin;
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  if (req.method !== 'GET') {
    res.writeHead(405, headers).end(JSON.stringify({ error: { code: 'invalid_params', message: 'Read-only gateway: GET only' } }));
    return;
  }
  const r = await gateway.handle(url.pathname, url.searchParams);
  res.writeHead(r.status, headers).end(JSON.stringify(r.body));
  console.log(new Date().toISOString(), r.status, redact(url.pathname + url.search), `${Date.now() - started}ms`);
}).listen(PORT, HOST, () => {
  console.log(`SHOWTIME gateway on http://${HOST}:${PORT}  (Ticketmaster ${env.TICKETMASTER_API_KEY ? 'configured' : 'NOT configured'})`);
});
