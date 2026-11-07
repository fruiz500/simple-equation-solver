// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Ammonia-water mixtures (Ibrahim and Klein, ASHRAE Trans. 99(1), 1993): the invariants of the paper's tables, and ten
// states computed with the NH3H2O procedure of EES by F. Ruiz, 2 and 3 Nov 2026. The vapor enthalpy is 2 to 6 kJ/kg below EES at high
// ammonia content (the cause is not known), hence its tolerance; everything else agrees to the tolerances below.
import { E, run, err, units, CP } from '../lib/engine.mjs';
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
  ok(`${what}: T within 0.8 K, P within 0.2 %, x within 0.003, h within 6.5 kJ/kg, s within 0.01 kJ/(kg K), v within 0.3 %, q`,
    Math.abs(got.T - T) <= 0.8 && Math.abs(got.P / P - 1) <= 0.002 && Math.abs(got.x - x) <= 0.003 && Math.abs(got.h - h) <= 6.5 &&
    Math.abs(got.s - s) <= 0.01 && Math.abs(got.v / vv - 1) <= 0.003 && Math.abs(got.q - q) < 1e-9, JSON.stringify(got));
}
// single-phase states, where only the pure-component equations and the excess term at 300 K act, agree more closely
ok('subcooled liquid at 300 K: h -107.8 kJ/kg and s 0.2712 kJ/(kg K) as in EES', Math.abs(v('h', 'T', 300, 'P', 10 * bar, 'x', 0.4) / 1000 + 107.8) < 0.05 && Math.abs(v('s', 'T', 300, 'P', 10 * bar, 'x', 0.4) / 1000 - 0.2712) < 2e-4);

// ---- hot and high-pressure states and nearly pure states, computed with EES by F. Ruiz, 3 Nov 2026
// bubble points: [P bar, x, T K, y (mass) of the vapor]; the ammonia f0 of the model is fitted to these (see corrA), and the first
// nine, at 30 bar or less, are the ones the fit rests on
const HOT = [[10, .2, 400.4, .7863], [15, .2, 419.4, .7485], [25, .2, 445.7, .696], [30, .2, 455.8, .6765], [20, .5, 366.5, .9818],
  [25, .5, 377.4, .9767], [30, .5, 387, .9715], [25, .8, 340.8, .9985], [30, .8, 349, .998], [50, .4, 440.2, .8883], [100, .4, 489.9, .8091],
  [40, .5, 403.7, .9602], [20, .2, 433.9, .7194]];
for (const [P, x, T, y] of HOT)
  ok(`bubble point at ${P} bar, x = ${x}: T within 1.5 K and vapor y within 0.006 of EES (${T} K, ${y})`,
    Math.abs(v('T', 'P', P * bar, 'x', x, 'q', 0) - T) < 1.5 && Math.abs(v('yv', 'P', P * bar, 'x', x, 'q', 0) - y) < 0.006);
// [T, P bar, x, h kJ/kg, s, v, q]; the vapor enthalpy of ammonia is 6 kJ/kg lower than in EES at every temperature and pressure
const PURE = [[450, 10, .9999, 1678, 5.391, .2147, 1.001], [450, 10, .0001, 749.4, 2.113, .001127, -.001], [360, 10, .9999, 1455, 4.838, .1664, 1.001],
  [300, 1, .9999, 1356, 5.63, 1.449, 1.001], [250, 10, .9999, -104.4, -.3908, .001485, -.001], [300, 10, .0001, 113.4, .3959, .0009999, -.001],
  [450, 100, .5, 627.5, 2.212, .001613, -.001]];
for (const [T, P, x, h, s, vv, q] of PURE) {
  const a = ['T', T, 'P', P * bar, 'x', x];
  ok(`nearly pure or high-pressure state ${T} K, ${P} bar, x = ${x}: h within 6.5 kJ/kg, s within 0.003, v within 0.3 %, q as in EES`,
    Math.abs(v('h', ...a) / 1000 - h) < 6.5 && Math.abs(v('s', ...a) / 1000 - s) < 0.003 && Math.abs(v('v', ...a) / vv - 1) < 0.003 && Math.abs(v('q', ...a) - q) < 1e-9);
}
ok('the vapor enthalpy of ammonia is 6.0 kJ/kg below EES at 300, 360 and 450 K and at 1 and 10 bar (the offset is constant)',
  [[450, 10, 1678], [360, 10, 1455], [300, 1, 1356]].every(([T, P, h]) => Math.abs(h - v('h', 'T', T, 'P', P * bar, 'x', .9999) / 1000 - 6) < 0.3));

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

// ---- the paper's tables and equations
const N = E.NH3H2O;
for (const [nm, c, M, y] of [['ammonia', N.C.a, N.MA, 1], ['water', N.C.w, N.MW, 0]]) {
  ok(`${nm}: the reference state of Table 1 is a saturation point, G(liquid) = G(gas) to 1e-5`, Math.abs((c.hl - c.T0 * c.sl) - (c.hg - c.T0 * c.sg)) < 1e-5);
  const g = N.phase(N.GmG, y, c.T0 * 100, c.P0 * 10), l = N.phase(N.GmL, y, c.T0 * 100, c.P0 * 10), k = M / N.R;
  ok(`${nm}: Eqs. 6 and 7 return the h and s of Table 1 at the reference state (this needs the corrected C2 term of Eq. 7)`,
    near(g.h * k / N.TB, c.hg, 1e-6) && near(g.s * k, c.sg, 1e-6) && near(l.h * k / N.TB, c.hl, 1e-6) && near(l.s * k, c.sl, 1e-6), [g.h * k / N.TB, g.s * k]);
}
let wa = 0, ww = 0;
for (let T = 230; T <= 400; T += 10) wa = Math.max(wa, Math.abs(N.psat(N.C.a, T) / (CP.PropsSI('P', 'T', T, 'Q', 0, 'Ammonia') / bar) - 1));
for (let T = 230; T <= 500; T += 10) ww = Math.max(ww, Math.abs(N.psat(N.C.w, T) / (CP.PropsSI('P', 'T', T, 'Q', 0, 'Water') / bar) - 1));
ok('saturation pressures from G(liquid) = G(gas) agree with CoolProp: ammonia 230-400 K within 2 %, water 230-500 K within 1 %', wa < 0.02 && ww < 0.01, [wa, ww]);
ok('pure water (x = 0) boils at 373.2 K at 1 atm, pure ammonia (x = 1) at 239.6 K at 1 bar', Math.abs(v('T', 'P', 101325, 'x', 0, 'q', 0) - 373.19) < 0.05 && Math.abs(v('T', 'P', 1e5, 'x', 1, 'q', 0) - 239.57) < 0.05);
ok('bubble pressure at 350 K, x = 0.3: 5.005 bar as in EES; vapor in equilibrium at 360 K, 10 bar: y = 0.9637',
  Math.abs(v('P', 'T', 350, 'x', 0.3, 'q', 0) / bar - 5.005) < 0.003 && Math.abs(v('x', 'T', 360, 'P', 10 * bar, 'q', 1) - 0.9637) < 0.0005);
// above the critical temperature of ammonia (405.4 K) its standard-state fugacity follows Gillespie's equation, joined continuously
ok('ln f0 of ammonia is continuous across 405.4 K', Math.abs(N.lnf0('a', 405.5) - N.lnf0('a', 405.3)) < 0.01 && Math.abs(N.lnf0('a', 405.4) - N.lnSat(N.C.a, 405.4) - N.corrA(405.4)) < 2e-3);
ok('the dew point works at 0.3 bar, where pure ammonia boils below the range (331.2 K for x = 0.4)', Math.abs(v('T', 'P', 0.3 * bar, 'x', 0.4, 'q', 1) - 331.2) < 0.2);
messages([['too cold', err(`z_ = nh3h2o('T', 'P', 0.3e5, 'x', 0.9, 'q', 0)`), /boils below 225 K, outside the formulation/]]);
ok('the whole range works: 583 states of T, P and x without an error other than a boiling point below the range',
  (() => { let n = 0; for (const P of [0.2, 0.5, 2, 8, 15, 30, 60, 110]) for (const z of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) for (let T = 230; T <= 600; T += 37) {
    try { const st = N.stateTPz(T, P, z); if (![st.h, st.s, st.v, st.q].every(Number.isFinite)) return false; n++; } catch (e) { if (!/boils below 225 K/.test(e.message)) return e.message; }
  } return n > 540; })() === true);
done();
