// Security gate (LD-11): the built browser bundle must not contain provider secrets.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const env = existsSync('.env') ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])) : {};
const secrets = Object.entries({ ...env, ...process.env }).filter(([k, v]) => /KEY|TOKEN|SECRET/.test(k) && typeof v === 'string' && v.length >= 8).map(([, v]) => v);
const files = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name))));
walk('dist');
let bad = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  if (secrets.some((v) => s.includes(v))) { console.error(`SECRET FOUND in ${f}`); bad++; }
  if (/apikey=[A-Za-z0-9]{16,}/.test(s)) { console.error(`API key literal in ${f}`); bad++; }
}
if (bad) process.exit(1);
console.log(`check-bundle: ${files.length} files clean (${secrets.length} configured secret(s) checked)`);
