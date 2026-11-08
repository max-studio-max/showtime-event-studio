// Runs the gateway and the Vite dev server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';
const run = (args) => spawn(process.execPath, args, { stdio: 'inherit' });
const procs = [run(['node_modules/tsx/dist/cli.mjs', 'server/index.ts']), run(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5240', '--strictPort'])];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', stop));
