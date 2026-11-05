// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Convergence from a 9 x 9 grid of starting guesses. The floors are the counts measured on 31 Oct 2026;
// a drop means a solver change made it less robust. Raise them when the solver improves.
import fs from 'fs';
import path from 'path';
import { TESTS, run } from '../lib/engine.mjs';
import { ok, note, done } from '../lib/check.mjs';

const pipe = fs.readFileSync(path.join(TESTS, 'data/functions-example.ses'), 'utf8').replace('V = 1.5 [m/s]', '// V').replace('// h = 8000', 'h = 8000');
const probs = [
  ['circle/exp', `x^2 + y^2 = 4\nexp(x) + y = 1`, (g) => ({ x: g[0], y: g[1] }), 80],
  ['pipe solved backward', pipe, (g) => ({ Re: Math.abs(g[0]) * 2e4 + 3000, f: 0.01 + Math.abs(g[1]) * 0.01 }), 72],
  ['energy balance 0 = ...', `T1 = 300\nP = 2e5\nm = 2\nQ = 100000\n0 = m*(h1 - enthalpy('water', T2, P)) + Q\nh1 = enthalpy('water', T1, P)`, (g) => ({ T2: 300 + 40 * g[0] }), 54],
  ['Colebrook implicit', `Re = 1e5\nrr = 0.001\n1/sqrt(f) = -2*log10(rr/3.7 + 2.51/(Re*sqrt(f)))`, (g) => ({ f: 0.005 + 0.02 * Math.abs(g[0]) }), 81],
];
const grid = []; for (let a = -2; a <= 2; a += 0.5) for (let b = -2; b <= 2; b += 0.5) grid.push([a, b]);
for (const [name, txt, guesses, floor] of probs) {
  let n = 0; const t0 = Date.now();
  for (const g of grid) { try { run(txt, guesses(g)); n++; } catch (e) { } }
  note(`${name.padEnd(24)} ${n}/${grid.length} converged, ${Date.now() - t0} ms`);
  ok(`${name}: at least ${floor}/${grid.length} converge`, n >= floor, n);
}
// ---- regression: a block that fails from the default guess of 1 is retried from typical values (here the quality, from 0.5)
{
  const base = `P_5 = 8 [MPa]\nT_5 = 500 [degC]\nP_6 = 10 [kPa]\neta = 0.85\nh_5 = enthalpy('water', T_5, P_5)\ns_5 = entropy('water', T_5, P_5)\nh_6s = enthalpy('water', 'P', P_6, 'S', s_5)\neta = (h_6s - h_5)/(h_6 - h_5)\nh_6 = enthalpy('water', 'P', P_6, 'Q', x_6)`;
  const st = run(base).st;
  ok('turbine exit quality found although Newton from x_6 = 1 steps past 1: x_6 = 0.717', Math.abs(st.x_6 - 0.7167) < 1e-3 && Math.abs(st.h_6 - 1906240.45) < 1, [st.x_6, st.h_6]);
}
done();
