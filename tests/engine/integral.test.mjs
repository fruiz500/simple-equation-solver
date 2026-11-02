// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// integral(expression, x, a, b): the quadrature rule, accuracy, infinite limits, use in equations, functions and Check.
import { E, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';

const v = (text, name) => run(text).st[name];

// ---- the rule itself: weights sum to 2 on [-1, 1]; Gauss 7 exact to degree 13, Kronrod 15 to degree 22
const Q = E.Quadrature;
const rule = (deg) => Q.rule((x) => x ** deg, -1, 1).I, exact = (deg) => deg % 2 ? 0 : 2 / (deg + 1);
ok('Kronrod weights sum to 2', near(2 * Q.WK.slice(0, 7).reduce((s, w) => s + w, 0) + Q.WK[7], 2, 1e-15));
ok('Gauss weights sum to 2', near(2 * Q.WG.slice(0, 3).reduce((s, w) => s + w, 0) + Q.WG[3], 2, 1e-15));
ok('the 15-point rule integrates x^0 ... x^22 exactly', [...Array(23).keys()].every(d => Math.abs(rule(d) - exact(d)) < 1e-14));
const g7 = (deg) => { let s = 0; [1, 3, 5].forEach((i, k) => { s += Q.WG[k] * (Q.XK[i] ** deg + (-Q.XK[i]) ** deg); }); return s + Q.WG[3] * (deg === 0 ? 1 : 0); };
ok('the embedded 7-point Gauss rule integrates x^0 ... x^13 exactly', [...Array(14).keys()].every(d => Math.abs(g7(d) - exact(d)) < 1e-14));

// ---- accuracy
ok('x^2 from 0 to 3 = 9', near(v(`y = integral(x^2, x, 0, 3)`, 'y'), 9, 1e-13));
ok('exp(-x^2) over the whole line = sqrt(pi)', near(v(`y = integral(exp(-x^2), x, -Infinity, Infinity)`, 'y'), Math.sqrt(Math.PI), 1e-12));
ok('1/(1 + x^2) from 0 to infinity = pi/2', near(v(`y = integral(1/(1 + x^2), x, 0, Infinity)`, 'y'), Math.PI / 2, 1e-12));
ok('1/sqrt(x) from 0 to 1 = 2 (singular end)', near(v(`y = integral(1/sqrt(x), x, 0, 1)`, 'y'), 2, 1e-9));
ok('reversed limits change the sign; equal limits give 0', near(v(`y = integral(x^2, x, 3, 0)`, 'y'), -9, 1e-13) && v(`y = integral(x^2, x, 2, 2)`, 'y') === 0);
// Planck: integral of x^3/(e^x - 1) from 0 to infinity = pi^4/15
ok('Planck integral x^3/(exp(x) - 1), 0 to infinity = pi^4/15', near(v(`y = integral(x^3/(exp(x) - 1), x, 1e-300, Infinity)`, 'y'), Math.PI ** 4 / 15, 1e-10));

// ---- in equations
let s = run(`T1 = 300\nT2 = 600\nds = integral((28.11 + 0.1967e-2*T + 0.4802e-5*T^2 - 1.966e-9*T^3)/T, T, T1, T2)`).st;
const cp = (T) => 28.11 * Math.log(600 / 300) + 0.1967e-2 * 300 + 0.4802e-5 * (600 ** 2 - 300 ** 2) / 2 - 1.966e-9 * (600 ** 3 - 300 ** 3) / 3;
ok('entropy change from cp(T)/T: matches the integral done by hand', near(s.ds, cp(), 1e-12), [s.ds, cp()]);
s = run(`target = 20\nT1 = 300\ntarget = integral((28.11 + 0.1967e-2*T)/T, T, T1, T2)`, { T2: 500 }).st;
ok('an unknown limit is found by the solver (T2 for a given entropy change)', near(28.11 * Math.log(s.T2 / 300) + 0.1967e-2 * (s.T2 - 300), 20, 1e-9), s.T2);
s = run(`k = 3\ny = integral(k*t^2, t, 0, 1)`).st;
ok('other variables in the expression; t is not an unknown', near(s.y, 1, 1e-13) && !('t' in s), JSON.stringify(s));
ok('nested integrals', near(v(`y = integral(integral(x*z, z, 0, 1), x, 0, 2)`, 'y'), 1, 1e-12));
ok('inside a user function', v(`y = q(2)\nfunction r = q(s)\n  r = integral(s*w^2, w, 0, 3)\nend`, 'y') === 18);
messages([
  ['args', err(`y = integral(x^2, x, 0)`), /^Line 1\b.*integral\(\) takes 4 arguments: integral\(expression, x, a, b\)$/],
  ['not a name', err(`y = integral(x^2, 2*x, 0, 1)`), /in integral\(expression, x, a, b\), x must be a variable name/],
  ['diverges', err(`y = integral(1/x, x, 0, 1)`), /^Line 1: integral\(\): the expression is Infinity at x = /],
]);

// ---- Check
const u = units(`T1 = 300 [K]\nT2 = 600 [K]\ncp = 1000 [J/(kg*K)]\nds = integral(cp/T, T, T1, T2)\nq = integral(cp, T, T1, T2)\nL = 2 [m]\nbad = integral(cp, T, T1, L)`);
ok('Check: [f] times [x]: J/(kg K) for cp/T, J/kg for cp; limits in different units flagged',
  u.p.variables.get('ds').inferredUnit === 'J/(kg K)' && u.p.variables.get('q').inferredUnit === 'J/kg' && u.issues.length === 1 && /integral\(\) limits in different units, \[K\] and \[m\]/.test(u.issues[0]), [u.issues, u.p.variables.get('ds').inferredUnit]);
done();
