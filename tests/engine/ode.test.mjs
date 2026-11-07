// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
import { run, err, units, CP } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const maxRel = (rows, fx) => Math.max(...rows.map(fx));

// 1. Newton cooling vs exact
let { st, tb } = run(`k = 0.01\nT_a = 300\node t = 0 : 600 : 60\n  T' = -k*(T - T_a)\n  T(0) = 400\nend`);
let e1 = maxRel(tb[0].rows, r => Math.abs(r[1] - (300 + 100 * Math.exp(-0.01 * r[0]))) / 300);
ok('cooling accuracy', e1 < 1e-9, e1); ok('final value is a variable', Math.abs(st.T - (300 + 100 * Math.exp(-6))) < 1e-6, st.T);
note(`cooling: ${tb[0].rows.length} rows, ${tb[0].steps} steps, max rel error ${e1.toExponential(1)}`);
// 2. linked oscillator with a helper line
({ st, tb } = run(`w = 2\node t = 0 : 10 : 0.5\n  E_k = 0.5*v^2 + 0.5*w^2*x^2\n  x' = v\n  v' = -w^2*x\n  x(0) = 1\n  v(0) = 0\nend`));
let e2 = maxRel(tb[0].rows, r => Math.abs(r[1] - Math.cos(2 * r[0])));
ok('oscillator', e2 < 1e-8, e2); ok('helper column (energy conserved)', maxRel(tb[0].rows, r => Math.abs(r[3] - 2)) < 1e-8);
note('oscillator cols:', tb[0].cols.join(','), `max error ${e2.toExponential(1)}, ${tb[0].steps} steps`);
// 3. array states, coupled two-tank temperatures: T1' = -(T1-T2), T2' = (T1-T2) - 0  -> T1+T2 const, diff decays exp(-2t)
({ st, tb } = run(`ode t = 0 : 3 : 1\n  T[1]' = -(T[1] - T[2])\n  T[2]' = (T[1] - T[2])\n  T[1](0) = 400\n  T[2](0) = 300\nend\nT_mean = (T[1] + T[2])/2`));
ok('array states', Math.abs(st['T[1]'] - (350 + 50 * Math.exp(-6))) < 1e-7 && st.T_mean === 350 || Math.abs(st.T_mean - 350) < 1e-9, JSON.stringify(st));
// 4a. time to cool to 320 K: t_end unknown
({ st } = run(`k = 0.01\nT_a = 300\node t = 0 : t_end\n  T' = -k*(T - T_a)\n  T(0) = 400\nend\nT = 320`, { t_end: 100 }));
ok('solve for t_end', Math.abs(st.t_end - Math.log(5) / 0.01) < 1e-5, st.t_end + ' vs ' + Math.log(5) / 0.01);
// 4b. find k so that T(600) = 320
({ st } = run(`T_a = 300\node t = 0 : 600 : 60\n  T' = -k*(T - T_a)\n  T(0) = 400\nend\nT = 320`, { k: 0.001 }));
ok('solve for k', Math.abs(st.k - Math.log(5) / 600) < 1e-10, st.k + ' vs ' + Math.log(5) / 600);
// 5. stiff: y' = -1000 (y - cos t) - sin t, y(0)=1 -> y = cos t
const stiffTxt = (opt) => `ode t = 0 : 10 : 1${opt}\n  y' = -1000*(y - cos(t)) - sin(t)\n  y(0) = 1\nend`;
for (const o of ['', ', stiff']) { ({ tb } = run(stiffTxt(o))); note(`stiff test '${o || 'default'}': ${tb[0].steps} steps, max error ${maxRel(tb[0].rows, r => Math.abs(r[1] - Math.cos(r[0]))).toExponential(1)}`);
  ok('stiff test accuracy ' + o, maxRel(tb[0].rows, r => Math.abs(r[1] - Math.cos(r[0]))) < (o ? 1e-5 : 1e-8)); }
// 6. Robertson (classic stiff kinetics) at t = 40: y1 = 0.7158271, y2 = 9.185535e-6, y3 = 0.2841637
({ st, tb } = run(`ode t = 0 : 40 : 10, stiff, rtol = 1e-7, atol = 1e-12\n  y1' = -0.04*y1 + 1e4*y2*y3\n  y2' = 0.04*y1 - 1e4*y2*y3 - 3e7*y2^2\n  y3' = 3e7*y2^2\n  y1(0) = 1\n  y2(0) = 0\n  y3(0) = 0\nend`));
note(`Robertson stiff: y1 = ${st.y1.toPrecision(7)}, y2 = ${st.y2.toPrecision(7)}, y3 = ${st.y3.toPrecision(7)}, ${tb[0].steps} steps`);
ok('Robertson', Math.abs(st.y1 - 0.7158271) < 2e-6 && Math.abs(st.y2 / 9.185535e-6 - 1) < 1e-4 && Math.abs(st.y3 - 0.2841637) < 2e-6);
note('Robertson without stiff:', err(`ode t = 0 : 40 : 10\n  y1' = -0.04*y1 + 1e4*y2*y3\n  y2' = 0.04*y1 - 1e4*y2*y3 - 3e7*y2^2\n  y3' = 3e7*y2^2\n  y1(0) = 1\n  y2(0) = 0\n  y3(0) = 0\nend`)?.slice(0, 160) ?? 'solved (explicit method, slower)');
// 7. 20-node conduction (method of lines), explicit vs stiff, against the series solution of the heat equation
const N = 20; let mol = `alpha = 1e-5\nL = 0.1\ndx = L/${N + 1}\node t = 0 : 600 : 100STIFF\n`;
for (let i = 1; i <= N; i++) mol += `  T${i}' = alpha*(${i === 1 ? '300' : 'T' + (i - 1)} - 2*T${i} + ${i === N ? '300' : 'T' + (i + 1)})/dx^2\n  T${i}(0) = 400\n`;
mol += 'end';
const series = (x, t) => { let s = 0; for (let n = 1; n < 400; n += 2) s += 4 / (n * Math.PI) * Math.sin(n * Math.PI * x / 0.1) * Math.exp(-1e-5 * (n * Math.PI / 0.1) ** 2 * t); return 300 + 100 * s; };
const steps20 = {};
for (const o of ['', ', stiff']) { const t0 = Date.now(); ({ st, tb } = run(mol.replace('STIFF', o))); steps20[o] = tb[0].steps;
  ok('20 nodes ' + (o || 'default') + ': matches the stiff/explicit reference 300.34347', Math.abs(st.T10 - 300.34347) < 2e-5, st.T10);
  note(`20 nodes '${o || 'default'}': ${tb[0].steps} steps, ${Date.now() - t0} ms, T10(600) = ${st.T10.toFixed(5)} (exact PDE ${series(10 * 0.1 / 21, 600).toFixed(5)}, spatial discretization error included)`); }
ok('20 nodes: stiff option takes fewer steps', steps20[', stiff'] < steps20[''], JSON.stringify(steps20));
// 8. one-line ode45 shorthand now adaptive
({ st } = run(`[t, y_ode] = ode45(@(t,y) -0.5 * y, [0, 10], 5)`));
ok('ode45 shorthand', Math.abs(st.y_ode[100] - 5 * Math.exp(-5)) < 1e-10 && st.y_ode.length === 101, st.y_ode[100] - 5 * Math.exp(-5));
// 9. properties and a user function inside derivatives: water cooled in a tank
({ st } = run(`function q = conv(h, A, dT)\n  q = h*A*dT\nend\nm = 10\nP = 1e5\nh = 50\nA = 2\nT_a = 290\node t = 0 : 3600 : 600\n  c = specificheat('water', T, P)\n  T' = -conv(h, A, T - T_a)/(m*c)\n  T(0) = 350\nend`));
ok('properties in ode', st.T > 290 && st.T < 350, st.T); note('water tank T(3600) =', st.T.toFixed(4));
// 10. messages
const msgs = {
  noinit: err(`ode t = 0 : 1\n  y' = -y\nend`), wrongtime: err(`ode t = 5 : 10\n  y' = -y\n  y(0) = 1\nend`), noend: err(`ode t = 0 : 1\n  y' = -y\n  y(0) = 1\n`),
  badline: err(`ode t = 0 : 1\n  y' = -y\n  y(0) = 1\n  y + 2\nend`), undetermined: err(`ode t = 0 : 1\n  y' = -k*y\n  y(0) = 1\nend`),
  badopt: err(`ode t = 0 : 1, fast\n  y' = -y\n  y(0) = 1\nend`), blowup: err(`ode t = 0 : 2\n  y' = y^2\n  y(0) = 1\nend`),
  propfail: err(`ode t = 0 : 3600\n  T' = -0.01*T\n  T(0) = 300\n  h = enthalpy('R134a', T, 1e5)\nend`),   // R134a below its minimum temperature (water would now become ice)
};
const EXPECT = {
  noinit: /^Line 1: give the initial value of y/, wrongtime: /initial value y\(0\) must be given at the start, t = 5/,
  noend: /^Line 1: this ode block has no matching 'end'/, badline: /^Line 4: in an ode block write .* got 'y \+ 2'/,
  undetermined: /do not determine k/, badopt: /^Line 1: unknown option 'fast'/,
  blowup: /step size became too small at t = 1 /, propfail: /step size became too small at t = \d+\.\d+ \(CoolProp: .*enthalpy of 'R134a'\)/,
};
messages(Object.entries(msgs).map(([k, v]) => [k, v, EXPECT[k]]));
done();
