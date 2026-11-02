// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Ammonia-water mixtures, PROVISIONAL model (Ibrahim-Klein structure, Ziegler-Trepp coefficients), against ten states
// computed with the NH3H2O procedure of EES (Ibrahim and Klein 1993) by F. Ruiz, 2 Nov 2026. The tolerances are those of
// the provisional model; with the coefficients of Ibrahim and Klein they should shrink to the digits EES prints.
import { run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';

const v = (out, ...a) => run(`z_ = nh3h2o('${out}', ${a.map(x => typeof x === 'string' ? `'${x}'` : x).join(', ')})`).st.z_;
const bar = 1e5;
// EES: T [K], P [bar], x, h [kJ/kg], s [kJ/(kg K)], v [m3/kg], q; the inputs of each call first
const EES = [
  [['T', 300, 'P', 10 * bar, 'x', 0.4], 300, 10, 0.4, -107.8, 0.2712, 0.001162, -0.001, 'subcooled liquid'],
  [['T', 450, 'P', 10 * bar, 'x', 0.9], 450, 10, 0.9, 1787, 5.661, 0.2125, 1.001, 'superheated vapor'],
  [['P', 10 * bar, 'x', 0.4, 'q', 0], 355.4, 10, 0.4, 138.2, 1.023, 0.001235, 0, 'bubble point, 10 bar'],
  [['P', 10 * bar, 'x', 0.4, 'q', 1], 433.2, 10, 0.4, 2292, 6.327, 0.192, 1, 'dew point, 10 bar'],
  [['P', 2 * bar, 'x', 0.5, 'q', 0], 286.5, 2, 0.5, -180.5, 0.03865, 0.001199, 0, 'bubble point, 2 bar'],
  [['P', 15 * bar, 'x', 0.95, 'q', 1], 377.7, 15, 0.95, 1535, 4.875, 0.1135, 1, 'dew point, 15 bar'],
  [['T', 350, 'x', 0.3, 'q', 0], 350, 5.005, 0.3, 142.7, 0.9906, 0.001171, 0, 'bubble pressure at 350 K'],
  [['P', 10 * bar, 'x', 0.6, 'q', 0.5], 378.8, 10, 0.6, 937.3, 3.279, 0.08774, 0.5, 'two-phase, q = 0.5'],
  [['T', 360, 'P', 10 * bar, 'q', 0], 360, 10, 0.3771, 163.7, 1.088, 0.001229, 0, 'liquid in equilibrium, 360 K, 10 bar'],
  [['T', 360, 'P', 10 * bar, 'q', 1], 360, 10, 0.9637, 1494, 4.951, 0.1653, 1, 'vapor in equilibrium with it'],
];
for (const [inp, T, P, x, h, s, vv, q, what] of EES) {
  const got = { T: v('T', ...inp), P: v('P', ...inp) / bar, x: v('x', ...inp), h: v('h', ...inp) / 1000, s: v('s', ...inp) / 1000, v: v('v', ...inp), q: v('q', ...inp) };
  ok(`${what}: T within 1.5 K, P within 4 %, x within 0.01, h within 8 kJ/kg, s within 0.02 kJ/(kg K), v within 0.5 %, q`,
    Math.abs(got.T - T) <= 1.5 && Math.abs(got.P / P - 1) <= 0.04 && Math.abs(got.x - x) <= 0.01 && Math.abs(got.h - h) <= 8 &&
    Math.abs(got.s - s) <= 0.02 && Math.abs(got.v / vv - 1) <= 0.005 && Math.abs(got.q - q) < 1e-9, JSON.stringify(got));
}
// single-phase states, where only the pure-component equations and the excess term at 300 K act, agree more closely
ok('subcooled liquid at 300 K: h -107.8 kJ/kg and s 0.2712 kJ/(kg K) as in EES', Math.abs(v('h', 'T', 300, 'P', 10 * bar, 'x', 0.4) / 1000 + 107.8) < 0.05 && Math.abs(v('s', 'T', 300, 'P', 10 * bar, 'x', 0.4) / 1000 - 0.2712) < 2e-4);

// ---- consistency
const hb = v('h', 'P', 10 * bar, 'x', 0.6, 'q', 0.5);
ok('P, x, h gives back the state of P, x, q (q = 0.5, the same T)', near(v('q', 'P', 10 * bar, 'x', 0.6, 'h', hb), 0.5, 1e-9) && near(v('T', 'P', 10 * bar, 'x', 0.6, 'h', hb), v('T', 'P', 10 * bar, 'x', 0.6, 'q', 0.5), 1e-9));
const Tb = v('T', 'P', 10 * bar, 'x', 0.4, 'q', 0);
ok('T, P, x just below the bubble point is liquid, just above is two-phase', v('q', 'T', Tb - 0.01, 'P', 10 * bar, 'x', 0.4) === -0.001 && v('q', 'T', Tb + 0.5, 'P', 10 * bar, 'x', 0.4) > 0);
ok('bubble point: its vapor yv, at the same T and P, is the equilibrium vapor', near(v('yv', 'P', 10 * bar, 'x', 0.4, 'q', 0), v('x', 'T', Tb, 'P', 10 * bar, 'q', 1), 1e-6));
ok('the bubble pressure at T gives back T', near(v('T', 'P', v('P', 'T', 350, 'x', 0.3, 'q', 0), 'x', 0.3, 'q', 0), 350, 1e-9));
ok('u = h - P v', near(v('u', 'T', 450, 'P', 10 * bar, 'x', 0.9), v('h', 'T', 450, 'P', 10 * bar, 'x', 0.9) - 10 * bar * v('v', 'T', 450, 'P', 10 * bar, 'x', 0.9), 1e-12));
messages([
  ['P range', err(`z_ = nh3h2o('h', 'T', 300, 'P', 1000, 'x', 0.4)`), /P = 1000 Pa is outside 0\.2 to 110 bar/],
  ['inputs', err(`z_ = nh3h2o('h', 'T', 300, 'h', 1000, 'x', 0.4)`), /the inputs must be T, P, x or P, x, q or T, x, q or T, P, q or P, x, h/],
  ['q with T,P', err(`z_ = nh3h2o('h', 'T', 360, 'P', 1e6, 'q', 0.5)`), /with T, P and q, q must be 0 \(the saturated liquid\) or 1/],
]);
const u = units(`T = 300 [K]\nP = 10 [bar]\nh = nh3h2o('h', 'T', T, 'P', P, 'x', 0.4)\nbad = nh3h2o('s', 'T', P, 'P', P, 'x', 0.4)`);
ok('Check: h in J/kg; a pressure given for T is flagged', u.p.variables.get('h').inferredUnit === 'J/kg' && u.issues.length === 1 && /nh3h2o\(\) expects \[K\]/.test(u.issues[0]), u.issues);
done();
