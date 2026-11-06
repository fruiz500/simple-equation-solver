// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Spec lines: y = atleast(y_spec, p[, x]) makes y = y_spec + norminv(p) u_y, with u_y the first-order uncertainty of the built
// design (x fixed, named or found); checked against closed forms, the Uncertainty propagation itself, and the messages.
import { E, run, err } from '../lib/engine.mjs';
import { ok, near, done } from '../lib/check.mjs';

const z95 = 1.6448536269514722, z99 = 2.3263478740408408;
// W = m c, c = 5 +- 0.5: u_W = 0.5 m, so 5 m = 100 + z 0.5 m
let s = run(`c = 5 +- 0.5\nW = m*c\nW_spec = 100\nW = atleast(W_spec, 0.95)`).st;
ok('W = m c >= 100 with probability 0.95: m = 100/(5 - 0.5 z)', near(s.m, 100 / (5 - 0.5 * z95), 1e-7) && near(s.W, 5 * s.m, 1e-12), [s.m, 100 / (5 - 0.5 * z95)]);
// an upper limit: y = a x <= 10 with a = 2 +- 0.1, p = 0.99: 2 x + z 0.1 x = 10
s = run(`a = 2 +- 0.1\ny = a*x\ny = atmost(10, 0.99, x)`).st;
ok('y = a x <= 10 with probability 0.99: x = 10/(2 + 0.1 z)', near(s.x, 10 / (2 + 0.1 * z99), 1e-7), s.x);
// two uncertain inputs, nonlinear: the design value is value + z u, u from Uncertainty.run of the built design
const RANK = `T_3 = 550 [degC] +- 5 [K]\nP_3 = 8 [MPa] +- 1 %\nP_4 = 10 [kPa] +- 0.5 [kPa]\neta_t = 0.85 +- 0.02\nh_3 = enthalpy('water', T_3, P_3)\ns_3 = entropy('water', T_3, P_3)\nh_4s = enthalpy('water', 'P', P_4, 'S', s_3)\nh_4 = h_3 - eta_t*(h_3 - h_4s)\nW = m_dot*(h_3 - h_4)\n`;
const r = run(RANK + 'W_spec = 1000 [kW]\nW = atleast(W_spec, 0.95)');
const built = new E.EESParser(); built.parse(RANK + `m_dot = ${r.st.m_dot}`);
const u = E.Uncertainty.run(built, new E.BoundedSolver(built.parsedASTs, built.variables, built.odeCalls).solve()).u.get('W');
ok('turbine: W designed = 1000 kW + 1.645 u_W, u_W that of the built design (m_dot fixed)', near(r.st.W, 1e6 + z95 * u, 1e-6), [r.st.W, 1e6 + z95 * u, u]);
ok('turbine: the margin is about 4 % (u_W about 26 kW)', r.st.W > 1.03e6 && r.st.W < 1.06e6);
// the spec line with a temperature limit, degC as the compared value
s = run(`q = 1000 +- 50\nT = 300 + q/UA\nT = atmost(40 [degC], 0.9)`).st;
ok('a temperature limit in degC: T = 40 degC - 1.2816 u_T', near(s.T, 313.15 - 1.2815515655446004 * (50 / s.UA), 1e-9), s.T);
// messages
ok('no input with ±: a message', /needs inputs with an uncertainty/.test(err(`c = 5\nW = m*c\nW = atleast(100, 0.95)`) || ''));
ok('a probability outside 0.5 to 1', /between 0.5 and 1/.test(err(`c = 5 +- 1\nW = m*c\nW = atleast(100, 95)`) || ''));
ok('two candidates for the design variable: it must be named, and the message lists them', /name the variable held fixed in the built design .* one of (m, n|n, m)/.test(err(`c = 5 +- 1\nW = m*c + n\nn = 2*m\nW = atleast(100, 0.95)`) || ''), err(`c = 5 +- 1\nW = m*c + n\nn = 2*m\nW = atleast(100, 0.95)`));
ok('named, it is used: W = m n c with n held fixed', (() => { const st = run(`c = 5 +- 0.5\nW = m*n*c\nm = 2\nW = atleast(100, 0.95, n)`).st; return near(st.W, 100 / (1 - 0.1 * z95), 1e-7); })());
ok('the spec value cannot contain the variable', /cannot contain W/.test(err(`c = 5 +- 1\nW = m*c\nW = atleast(W/2, 0.95)`) || ''));
ok('the parser records the spec and its equation W = value + margin', (() => { const p = new E.EESParser(); p.parse(`c = 5 +- 1\nW = m*c\nW = atleast(100 [kW], 0.95, m)`); const e = p.parsedASTs[p.specs[0].eq]; return p.specs.length === 1 && p.specs[0].valueAST.evaluate({ unitval: (x) => x }) === 1e5 && p.specs[0].by === 'm' && e.spec === true && p.specs[0].op === '>='; })());
ok('the spec value is a variable of the problem: W_spec and W are both in the solution', (() => { const st = run(`c = 5 +- 0.5\nW = m*c\nW_spec = 100\nW = atleast(W_spec, 0.95)`).st; return st.W_spec === 100 && st.W > 100; })());
done();
