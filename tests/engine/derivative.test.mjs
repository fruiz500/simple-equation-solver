// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// derivative(expr, x), worked out symbolically before solving.
import { run, err } from '../lib/engine.mjs';
import { ok, messages, done } from '../lib/check.mjs';
let s = run(`a = 28.9\nb = -0.0016\nc = 8e-6\nT = 400\ncp = derivative(a + b*T + c*T^2, T)`).st;
ok('polynomial cp', Math.abs(s.cp - (-0.0016 + 2 * 8e-6 * 400)) < 1e-15, s.cp);
s = run(`derivative(z^3 - 12*z + 12, z) = 0`, { z: 3 }).st; ok('optimum from derivative = 0', Math.abs(s.z - 2) < 1e-9, s.z);
// optimum intercooler pressure for two-stage compression: Px = sqrt(P1*P2)
s = run(`P1 = 100\nP2 = 900\nk = 0.4/1.4\nderivative((Px/P1)^k + (P2/Px)^k, Px) = 0`, { Px: 200 }).st; ok('two-stage optimum', Math.abs(s.Px - 300) < 1e-6, s.Px);
s = run(`x = 2\ny = derivative(ln(x)*x, x)\nz = derivative('sin(x)', 'x')`).st;
ok('ln and quoted forms', Math.abs(s.y - (Math.log(2) + 1)) < 1e-12 && Math.abs(s.z - Math.cos(2)) < 1e-12, JSON.stringify(s));
s = run(`function g = slope(x)\n  g = derivative(x^4, x)\nend\nq = slope(2)`).st; ok('in a function', s.q === 32, s.q);
s = run(`ode t = 0 : 1\n  y' = derivative(t^2, t)\n  y(0) = 0\nend`).st; ok('in an ode block', Math.abs(s.y - 1) < 1e-9, s.y);
const notSym = /cannot be differentiated symbolically.*props\('d\(H\)\/d\(T\)\|P'/;
messages([
  ['prop', err(`T = 300\ndh = derivative(enthalpy('water', T, 1e5), T)`), notSym],
  ['args', err(`y = derivative(x^2)`), /derivative\(\) takes 2 arguments/],
  ['notvar', err(`y = derivative(x^2, 2)`), /x must be a variable name/],
  ['userfn', err(`function y = f(x)\n  y = x^2\nend\nz = derivative(f(x), x)\nx = 1`), notSym],
]);
done();
