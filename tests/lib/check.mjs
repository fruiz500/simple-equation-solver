// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Minimal check helpers. Each test file prints FAIL lines, notes (shown with --verbose)
// and a last line "N passed, M failed"; the exit code is 1 if anything failed.
let pass = 0, fail = 0;
export function ok(name, cond, detail = '') {
  if (cond) pass++; else { fail++; console.log('FAIL', name, detail === '' ? '' : '| ' + detail); }
}
// |a - b| <= tol * max(1, |b|)
export const near = (a, b, tol = 1e-9) => typeof a === 'number' && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
export const note = (...x) => console.log('  ', ...x);
// Each entry: [name, actual message (or null), regex it must match].
export function messages(list) {
  for (const [name, msg, re] of list) { note(name.padEnd(12), '|', msg); ok('message: ' + name, msg != null && re.test(msg), msg); }
}
// an unexpected exception ends the file with a FAIL line instead of a stack trace
process.on('uncaughtException', (e) => { fail++; console.log('FAIL stopped early by an error |', String(e?.message ?? e).split('\n')[0]); done(); process.exit(1); });
export function done() { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; }
