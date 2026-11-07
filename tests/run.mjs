// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Runs every test file and prints a summary; the exit code is 1 if anything failed.
//   node run.mjs              all tests (engine in Node, then the browser tests in Chromium)
//   node run.mjs --engine     engine tests only (no Chromium needed)
//   node run.mjs --verbose    also show each test's notes (messages, timings, values)
//   node run.mjs ode units    only the files whose names contain one of these words
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TESTS = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const verbose = args.includes('--verbose'), engineOnly = args.includes('--engine');
const filters = args.filter(a => !a.startsWith('--'));
const list = (dir) => fs.readdirSync(path.join(TESTS, dir)).filter(f => /\.test\.(mjs|cjs)$/.test(f)).sort().map(f => path.join(dir, f));
let files = [...list('engine'), ...(engineOnly ? [] : list('browser'))];
if (filters.length) files = files.filter(f => filters.some(w => f.includes(w)));

if (!fs.existsSync(path.join(TESTS, 'node_modules/mathjs'))) { console.log('Run  npm install  in the tests folder first.'); process.exit(1); }

let totalPass = 0, totalFail = 0; const rows = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(TESTS, f)], { cwd: TESTS, encoding: 'utf8', env: process.env, maxBuffer: 64 << 20 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) passed, (\d+) failed\s*$/);
  let p = m ? +m[1] : 0, fl = m ? +m[2] : 1;
  if (!m || r.status !== 0 && fl === 0) fl = Math.max(fl, 1);
  totalPass += p; totalFail += fl;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${fl ? 'FAIL' : 'ok  '}  ${f.padEnd(34)} ${String(p).padStart(3)} passed, ${fl} failed   ${secs} s`);
  const lines = out.split('\n').filter(l => l.trim() && !/^\d+ passed, \d+ failed/.test(l));
  // a file that crashed before its summary line: show the end of its output
  const show = verbose ? lines : !m ? lines.slice(-15) : lines.filter(l => /^FAIL/.test(l));
  show.forEach(l => console.log('      ' + l));
  if (/Executable doesn't exist|Cannot find module 'playwright'/.test(out))
    console.log('      Chromium for Playwright is missing: run  npx playwright install chromium  (or use --engine).');
  rows.push([f, p, fl]);
}
console.log(`\n${totalPass} checks passed, ${totalFail} failed, in ${files.length} files${engineOnly ? ' (browser tests not run)' : ''}`);
process.exitCode = totalFail ? 1 : 0;
