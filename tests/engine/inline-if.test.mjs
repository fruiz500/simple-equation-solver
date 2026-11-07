// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Comparisons and the inline if(c, a, b) in equations and functions.
import { run, err, units } from '../lib/engine.mjs';
import { ok, messages, done, note } from '../lib/check.mjs';
const solve = (t) => run(t).st;
let r;
r = solve(`x = 3\ny = x >= 2 ? 1 : 0\nz = if(x == 3, 10, 20)\nw = if(x != 3, 10, if(x <= 2, 5, 7))\nv = if(x > 1 and x < 5, 1, 0)`);
ok('comparisons + inline if', r.y === 1 && r.z === 10 && r.w === 7 && r.v === 1, JSON.stringify(r));
// laziness: the branch not taken would throw (out of CoolProp's range)
r = solve(`T = 400\nP = 101325\nrho = if(T < 373.12, density('water', T, P), P/(461.5*T))\nq = if(T > 0, 1, saturationpressure('water', -5))`);
ok('lazy branches', Math.abs(r.rho - 101325 / (461.5 * 400)) < 1e-12 && r.q === 1, JSON.stringify(r));
// solving through an if: piecewise h(T), h = 80000 -> T = 315 exactly
r = solve(`h = if(T < 300, 1000*(T - 250), 50000 + 2000*(T - 300))\nh = 80000`);
ok('solve through if', Math.abs(r.T - 315) < 1e-6, r.T);
r = solve(`function y = sgn(x)\n  y = if(x >= 0, 1, -1)\nend\na = sgn(-2)\nb = sgn(0)`);
ok('if in function', r.a === -1 && r.b === 1);
r = solve(`function [p, q] = two(x)\n  p = x\n  q = 2*x\nend\nc = 1\n[a, b] = two(if(c == 1, 5, 6))`);
ok('if in multi-output call arguments', r.a === 5 && r.b === 10);
r = solve(`a = 1\nb = if(a == 1, 2, 3)`); ok('== inside if is not a split point', r.b === 2);

messages([
  ['args', err(`y = if(1 > 0, 2)`), /^Line 1 .*if\(\) takes 3 arguments.* but got 2/],
  ['twoeq', err(`y = 2 = 3`), /^Line 1: more than one '=' in 'y = 2 = 3'/],
  ['noeq', err(`y + 2`), /^Line 1: missing '=' sign in 'y \+ 2'/],
  ['fnargs', err(`function y = f(x)\n  y = if(x, 1)\nend\nz = f(1)`), /^Line 2: if\(\) takes 3 arguments/],
]);

const u = units(`T = 300 [K]\nP = 1e5 [Pa]\nL = 2 [m]\na = if(T > P, L, L)\nb = if(T > 250, L, T)\nc = if(T > 250, L, 3)`);
u.issues.forEach(s => note(s));
ok('units: comparing K with Pa flagged', u.issues.some(s => /\[K\] and \[Pa\]/.test(s)));
ok('units: branches m vs K flagged', u.issues.some(s => /\[m\] and \[K\]/.test(s)));
ok('units: c inferred as m', u.p.variables.get('c').inferredUnit === 'm', u.p.variables.get('c').inferredUnit);
done();
