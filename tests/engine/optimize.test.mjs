// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Multivariable Min/Max (OptimizerND): BFGS and Nelder-Mead against exact optima, optima on a bound, a region where
// the equations do not solve, multistart on a function with two minima, an ode block inside, guesses restored.
import { E } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';

// opt(text, free vars, lower, upper, target, 'max'|'min', method, { guesses, multistart })
function opt(text, free, lo, hi, target, dir, method, o = {}) {
  const p = new E.EESParser(); p.parse(text);
  Object.entries(o.guesses || {}).forEach(([k, v]) => p.variables.get(k).guess = v);
  const O = new E.OptimizerND(p, E.BoundedSolver, text, free, lo, hi, target, dir === 'max');
  const x0 = free.map((v, k) => { const g = p.variables.get(v).guess; return g >= lo[k] && g <= hi[k] ? g : (lo[k] + hi[k]) / 2; });
  const t0 = Date.now(); const r = O.run(method, x0, !!o.multistart); r.ms = Date.now() - t0;
  r.st = O.finish(r.x); r.p = p;
  return r;
}
const show = (name, r) => note(`${name}: ${r.x.map(v => +v.toPrecision(8)).join(', ')} -> ${+r.value.toPrecision(10)}; ${r.iter} iterations, ${r.nSolves} solves, ${r.ms} ms${r.converged ? '' : ' (not converged)'}`);

// 1. Three-stage compression with intercooling (ideal gas, equal inlet temperatures): minimum work at the
//    geometric progression P_2 = 300, P_3 = 900 for P_1 = 100, P_4 = 2700
const comp3 = `P_1 = 100\nP_4 = 2700\nk = 0.4/1.4\nw = (P_2/P_1)^k + (P_3/P_2)^k + (P_4/P_3)^k - 3`;
for (const m of ['bfgs', 'nm']) {
  const r = opt(comp3, ['P_2', 'P_3'], [100, 100], [2700, 2700], 'w', 'min', m); show('3-stage ' + m, r);
  ok(`3-stage compression (${m}): P_2 = 300, P_3 = 900`, near(r.x[0], 300, 1e-6) && near(r.x[1], 900, 1e-6), r.x);
  ok(`3-stage compression (${m}): minimum work`, near(r.value, 3 * (3 ** (0.4 / 1.4) - 1), 1e-10), r.value);
}
// 2. Four stages: three free pressures, P = 300, 900, 2700 for an overall ratio 81
const comp4 = `P_1 = 100\nP_5 = 8100\nk = 0.4/1.4\nw = (P_2/P_1)^k + (P_3/P_2)^k + (P_4/P_3)^k + (P_5/P_4)^k - 4`;
for (const m of ['bfgs', 'nm']) {
  const r = opt(comp4, ['P_2', 'P_3', 'P_4'], [100, 100, 100], [8100, 8100, 8100], 'w', 'min', m); show('4-stage ' + m, r);
  ok(`4-stage compression (${m}): 300, 900, 2700`, near(r.x[0], 300, 1e-6) && near(r.x[1], 900, 1e-6) && near(r.x[2], 2700, 1e-6), r.x);
}
// 3. Rosenbrock from the classic start (-1.2, 1): minimum 0 at (1, 1)
const rosen = `f = (1 - x)^2 + 100*(y - x^2)^2`;
for (const m of ['bfgs', 'nm']) {
  const r = opt(rosen, ['x', 'y'], [-2, -2], [2, 2], 'f', 'min', m, { guesses: { x: -1.2, y: 1 } }); show('Rosenbrock ' + m, r);
  ok(`Rosenbrock (${m}): (1, 1)`, near(r.x[0], 1, 1e-6) && near(r.x[1], 1, 1e-6) && r.value < 1e-12, r.x);
}
// 4. Maximum on a corner of the bounds, reported as such
let r = opt(`A = x*y`, ['x', 'y'], [0, 0], [2, 3], 'A', 'max', 'bfgs');
ok('optimum at the bounds: (2, 3), both at a bound', r.x[0] === 2 && r.x[1] === 3 && r.atBound.join() === 'x,y', [r.x, r.atBound]);
r = opt(`A = x*(3 - x) + y`, ['x', 'y'], [0, 0], [2, 1], 'A', 'max', 'bfgs');
ok('one variable inside, one at its bound', near(r.x[0], 1.5, 1e-5) && r.x[1] === 1 && r.atBound.join() === 'y', [r.x, r.atBound]);
// 5. A region where the equations have no real solution (x < 1): the search backs away; maximum at x = 2, y = 1
const holey = `s = sqrt(x - 1)\nz = s*exp(-x/2) - (y - 1)^2`;
for (const m of ['bfgs', 'nm']) {
  r = opt(holey, ['x', 'y'], [0, 0], [5, 3], 'z', 'max', m, { guesses: { x: 4, y: 2.5 } }); show('no solution below x = 1 ' + m, r);
  ok(`region without solutions (${m}): (2, 1)`, near(r.x[0], 2, 1e-4) && near(r.x[1], 1, 1e-4), r.x);
}
// 6. Two minima: f = (x^2 - 1)^2 + 0.3 x + y^2 has a local minimum near x = +0.96 and the global one near x = -1.04.
//    From x = 1 a single run stays local; multistart finds the global minimum and reports both.
const two = `f = (x^2 - 1)^2 + 0.3*x + y^2`;
const xg = (() => { let x = -1; for (let i = 0; i < 50; i++) x -= (4 * x ** 3 - 4 * x + 0.3) / (12 * x ** 2 - 4); return x; })();
r = opt(two, ['x', 'y'], [-2, -2], [2, 2], 'f', 'min', 'bfgs', { guesses: { x: 1, y: 0.5 } });
ok('single run from x = 1 stays at the local minimum', r.x[0] > 0.9 && r.optima.length === 1, r.x);
for (const m of ['bfgs', 'nm']) {
  r = opt(two, ['x', 'y'], [-2, -2], [2, 2], 'f', 'min', m, { guesses: { x: 1, y: 0.5 }, multistart: true }); show('multistart ' + m, r);
  ok(`multistart (${m}): global minimum x = ${xg.toFixed(6)}`, near(r.x[0], xg, 1e-4) && Math.abs(r.x[1]) < 1e-4, r.x);
  ok(`multistart (${m}): 8 starts, 2 distinct optima, best first`, r.starts === 8 && r.optima.length === 2 && r.optima[0].value < r.optima[1].value, r.optima.map(o => [o.x, o.count]));
}
// 7. Through the solver and CoolProp: maximum of a two-variable function of a property, and an ode block inside
//    the cooling time to reach 320 K is t = ln(5)/k; choose k (and an unrelated y) to make t closest to 100 s
r = opt(`ode t = 0 : t_end\n  T' = -k*(T - 300)\n  T(0) = 400\nend\nT = 320\nJ = (t_end - 100)^2 + (y - 2)^2`, ['k', 'y'], [0.005, 0], [0.1, 5], 'J', 'min', 'bfgs', { guesses: { t_end: 100, k: 0.05 } });
show('ode inside', r);
ok('ode block inside: k = ln(5)/100', near(r.x[0], Math.log(5) / 100, 1e-5) && near(r.x[1], 2, 1e-5), r.x);
// 7b. One variable through this optimizer (the dialog does this when Multistart is ticked): Curzon-Ahlborn engine,
//     efficiency at maximum power 1 - sqrt(T_L/T_H); T_cw is found by Newton inside every solve. Nelder-Mead compares
//     values only, so near a flat maximum it resolves about the square root of the solve noise: a looser tolerance
const ca = `T_H = 1000\nT_L = 300\nK = 1\nQ_h = K*(T_H - T_hw)\nQ_c = K*(T_cw - T_L)\nQ_h/T_hw = Q_c/T_cw\nW = Q_h - Q_c\neta = W/Q_h`;
for (const m of ['bfgs', 'nm']) {
  r = opt(ca, ['T_hw'], [310], [990], 'W', 'max', m, { guesses: { T_cw: 400 }, multistart: true }); show('Curzon-Ahlborn ' + m, r);
  ok(`Curzon-Ahlborn (${m}): efficiency 1 - sqrt(T_L/T_H)`, near(r.st.eta, 1 - Math.sqrt(0.3), m === 'bfgs' ? 1e-8 : 1e-5) && r.optima.length === 1, [r.st.eta, r.optima.length]);
}
// 8. The final state is left in the parser, and the user's guesses are restored
r = opt(comp3, ['P_2', 'P_3'], [100, 100], [2700, 2700], 'w', 'min', 'bfgs', { guesses: { P_2: 500 } });
ok('final values in the parser', near(r.p.variables.get('w').value, r.value, 1e-12) && r.p.variables.get('P_2').value === r.x[0]);
ok('guesses restored', r.p.variables.get('P_2').guess === 500 && r.p.variables.get('w').guess === 1, [r.p.variables.get('P_2').guess, r.p.variables.get('w').guess]);
messages([['no start', (() => { try { opt(holey, ['x', 'y'], [0, 0], [5, 3], 'z', 'max', 'bfgs', { guesses: { x: 0.5, y: 1 } }); return null; } catch (e) { return e.message; } })(),
  /^the equations do not solve at the starting point/]]);
done();
