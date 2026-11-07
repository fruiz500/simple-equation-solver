// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// The help examples the browser test cannot reproduce by pressing Solve:
// two need a hand-set guess (as their text says), one shows matrices.
import { E, run } from '../lib/engine.mjs';
import { CODE, published, fmt } from '../lib/help.mjs';
import { ok, note, done } from '../lib/check.mjs';

const show = (p, st, n) => { const v = st[n], unit = p.variables.get(n)?.unit;
  if (math.isMatrix(v) || Array.isArray(v)) return JSON.stringify(math.round(math.isMatrix(v) ? v.toArray() : v, 10));
  return fmt(unit ? E.UnitConv.fromSI(v, unit) : v); };

for (const [id, guesses] of [['ex-t5', { T: 500 }], ['ex-c2', { T_ad: 2000 }], ['ex-m4', {}], ['ex-c6', { Q_2: 0.01, x_2: 0.61, T_2: 320 }]]) {
  let r; try { r = run(CODE[id], guesses); } catch (e) { ok(id + ' solves', false, e.message); continue; }
  for (const [n, val] of published(id)) {
    const got = show(r.p, r.st, n); note(`${id} ${n} = ${got} (published ${val})`);
    ok(`${id}: ${n} = ${val}`, got === val, got);
  }
}
done();
