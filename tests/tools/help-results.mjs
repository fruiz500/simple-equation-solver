// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Computes result rows for help.html examples, so the published tables are computed, never typed.
// Usage (from the tests folder):  node tools/help-results.mjs ex-a1 'theta[101]' q_fin  [ex-o1 t_end ...]
// Prints, per example, the rows [name, value, unit] in the format of the results table, and any unit issues.
import { E, run, units } from '../lib/engine.mjs';
import { CODE, fmt } from '../lib/help.mjs';

const groups = {}; let cur = null;
for (const a of process.argv.slice(2)) { if (CODE[a]) groups[cur = a] = []; else if (cur) groups[cur].push(a); else throw new Error('start with an example id, e.g. ex-a1'); }
for (const [id, names] of Object.entries(groups)) {
  const u = units(CODE[id]); const { st, p } = run(CODE[id]);
  const rows = names.map(n => { const m = p.variables.get(n); if (!m) return [n, 'no such variable', ''];
    const unit = m.unit || ''; return [n, fmt(unit ? E.UnitConv.fromSI(st[n], unit) : st[n]), unit || u.p.variables.get(n).inferredUnit || '']; });
  console.log(id, JSON.stringify(rows)); if (u.issues.length) console.log('  unit issues:', u.issues.join(' | '));
}
