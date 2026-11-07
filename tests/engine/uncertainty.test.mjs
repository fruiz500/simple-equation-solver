// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Uncertainty (solver.js, parser.js): first-order propagation for independent inputs (GUM, JCGM 100:2008, Eq. 10), with
// sensitivities from central differences of solves at x +- u. Exact answers for linear and implicit equations and an ode block
// (Newton cooling), CoolProp's cp for dh/dT, an independent finite-difference check of a turbine efficiency computed straight
// from CoolProp, units of the uncertainty (own unit, percentage, degC and degF), the nonlinearity warning, messages, and what
// stays as before (+- in ordinary arithmetic, duplicate ranges, Check Units, ode tables, messages of the extra solves).
import { E, CP, run, err, units, logs } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const U = (t) => { const { p, st } = run(t); return { r: E.Uncertainty.run(p, st), p, st }; };

// ---- syntax: the line, the value and the uncertainty in SI
const g = (t, n) => { const p = new E.EESParser(); p.parse(t); return p.uncertain.get(n); };
ok('a number with the unit of the value; a percentage; a unit of its own; ± as well as +-',
  near(g('m = 2.5 [kg] +- 0.01', 'm').u, 0.01) && near(g('P = 3000 [kPa] +- 1 %', 'P').u, 30e3) && near(g('T = 300 [K] +- 2 [K]', 'T').u, 2) &&
  near(g('L = 2 [ft] ± 1 [inch]', 'L').u, 0.0254) && near(g('x = 5 +- 0.5', 'x').u, 0.5));
ok('degC and degF: the uncertainty is a difference (0.5 degC = 0.5 K, 1 degF = 5/9 K); a percentage of 25 degC is of 25',
  near(g('T = 25 [degC] +- 0.5', 'T').u, 0.5) && near(g('T = 25 [degC] +- 0.5 [degC]', 'T').u, 0.5) && near(g('T = 77 [degF] +- 1', 'T').u, 5 / 9, 1e-12) &&
  near(g('T = 25 [degC] +- 2 %', 'T').u, 0.5));
ok('the given text and the line are kept; the value itself is solved as if written without ±',
  g('T = 300 [K] +- 2 [K]', 'T').given === '2 [K]' && g('P = 3 [bar] +- 1 %', 'P').given === '1 %' && g('a = 1\nb = 2 +- 0.1', 'b').line === 2 &&
  run('T = 25 [degC] +- 0.5\ny = 2*T').st.y === 2 * 298.15 && run('x[2] = 4 +- 0.1\ny = x[2]').st.y === 4);
ok('+- elsewhere keeps its meaning: y = x +- 2 is x - 2, and only a line name = number carries an uncertainty',
  run('x = 5\ny = x +- 2').st.y === 3 && !g('x = 5\ny = x +- 2', 'y') && !g('y = 2*3 +- 1', 'y') && run('y = 2*3 +- 1').st.y === 5);
ok('a constant with ± works in a duplicate range (N = 5, not 4)', run('N = 5 +- 1\nduplicate i = 1 : N\n  x[i] = i\nend\ns = sum(x[1:N])').st.s === 15);
messages([
  ['± misplaced', err('x = 2\ny = x ± 1'), /Line 2: ± goes only after a value given as a number, as in  T_1 = 300 \[K\] ± 2 \[K\]/],
  ['wrong unit', err('T = 300 [K] +- 2 [kPa]'), /Line 1 .*the uncertainty of T is in kPa, which is not a unit of the same kind as K/],
  ['unknown unit', err('T = 300 [K] +- 2 [kelvinz]'), /Line 1 .*unit 'kelvinz' of the uncertainty is not recognized/],
  ['in an ode block', err("ode t = 0 : 1\n  y' = -y\n  y(0) = 1 +- 0.1\nend"), /^Line 3: an initial value in an ode block cannot carry an uncertainty; give it a name before the block, as  y_0 = value \+- u,  and write  y\(0\) = y_0\.$/],
]);
const cu = units('T = 300 [K] +- 2 [K]\nP = 2 [bar] +- 1 %\nrho = P/(287*T)');
ok('Check Units: no issue from the ± part; T keeps its unit', cu.issues.length === 0 && cu.p.variables.get('T').unit === 'K', cu.issues);

// ---- exact answers
let { r } = U('a = 2 +- 0.1\nb = 3 +- 1 %\ny = a*b');
ok('y = a b: u(y) = sqrt((b u_a)^2 + (a u_b)^2), the inputs keep their own u, no warning', near(r.u.get('y'), Math.hypot(3 * 0.1, 2 * 0.03), 1e-12) &&
  near(r.u.get('a'), 0.1, 1e-12) && near(r.u.get('b'), 0.03, 1e-12) && r.warnings.length === 0, [r.u.get('y'), r.warnings]);
const py = r.parts.get('y'), tot = py.reduce((s, q) => s + q.c, 0);
ok('parts: the sensitivities dy/da = b and dy/db = a, shares of u^2 adding up to 1', py.length === 2 && near(py.find(q => q.input === 'a').s, 3, 1e-12) &&
  near(py.find(q => q.input === 'b').s, 2, 1e-12) && near(tot, r.u.get('y') ** 2, 1e-12), py);
({ r } = U('c = 10 +- 0.1\nx^3 + x = c'));
const root = (c) => { let x = 2; for (let i = 0; i < 50; i++) x -= (x ** 3 + x - c) / (3 * x * x + 1); return x; };
ok('an implicit equation (solved by iteration): the slope of the secant over c +- u, to 1e-8', near(r.u.get('x'), (root(10.1) - root(9.9)) / 0.2 * 0.1, 1e-8), [r.u.get('x'), (root(10.1) - root(9.9)) / 2]);
({ r } = U('c = 10 +- 1e-9\nx^3 + x = c'));
ok('a very small uncertainty (1e-10 of the value) is not lost in the solver tolerance: u = 1e-9/13 to 1e-6', Math.abs(r.u.get('x') / (1e-9 / 13) - 1) < 1e-6, r.u.get('x'));
({ r } = U('x = 0 +- 1\ny = x^2\nz = 3*x'));
messages([['nonlinear', r.warnings[0], /^Uncertainty: over x ± 1, y is far from linear in x; its first-order uncertainty is a rough estimate\.$/]]);
ok('y = x^2 at x = 0: first order gives 0, with the warning; z = 3x gives 3, without', r.u.get('y') === 0 && near(r.u.get('z'), 3, 1e-12) && r.warnings.length === 1);

// ---- through CoolProp and an ode block
let res = U("T = 25 [degC] +- 0.5\nh = enthalpy('water', T, 101325)\ncp = specificheat('water', T, 101325)");
ok('h of water from T +- 0.5 K: u(h) = cp u(T) to 1e-5 (the secant over 1 K)', near(res.r.u.get('h'), 0.5 * res.st.cp, 1e-5), [res.r.u.get('h'), 0.5 * res.st.cp]);
const tur = U(`P_1 = 3000 [kPa] +- 1 %\nT_1 = 400 [degC] +- 1 [K]\nP_2 = 50 [kPa] +- 1 %\nT_2 = 85 [degC] +- 1 [K]
h_1 = enthalpy('water', 'T', T_1, 'P', P_1)\ns_1 = entropy('water', 'T', T_1, 'P', P_1)\nh_2 = enthalpy('water', 'T', T_2, 'P', P_2)
h_2s = enthalpy('water', 'P', P_2, 'S', s_1)\neta = (h_1 - h_2)/(h_1 - h_2s)`);
const etaCP = (P1, T1, P2, T2) => { const W = 'Water', h1 = CP.PropsSI('H', 'T', T1, 'P', P1, W), s1 = CP.PropsSI('S', 'T', T1, 'P', P1, W);
  return (h1 - CP.PropsSI('H', 'T', T2, 'P', P2, W)) / (h1 - CP.PropsSI('H', 'P', P2, 'S', s1, W)); };
const x0 = [3e6, 673.15, 5e4, 358.15], ux = [3e4, 1, 500, 1];
const uEta = Math.sqrt(ux.reduce((s, u, i) => { const a = [...x0], b = [...x0]; a[i] += u; b[i] -= u; return s + ((etaCP(...a) - etaCP(...b)) / 2) ** 2; }, 0));
ok('turbine efficiency (the help example): u(eta) = 0.0038, as from central differences of CoolProp calls made here, to 1e-6', near(tur.r.u.get('eta'), uEta, 1e-6) &&
  near(tur.st.eta, etaCP(...x0), 1e-9) && tur.r.u.get('eta').toPrecision(2) === '0.0038', [tur.r.u.get('eta'), uEta]);
ok('turbine: T_2 has the largest share of u(eta)^2, and the parts of h_1 are only T_1 and P_1',
  tur.r.parts.get('eta').sort((a, b) => b.c - a.c)[0].input === 'T_2' && tur.r.parts.get('h_1').map(q => q.input).sort().join() === 'P_1,T_1');
const ode = `T_inf = 300 [K]; m = 0.1; c = 900; A = 0.01\nh = 20 +- 2\nT_0 = 400 [K] +- 3 [K]
ode t = 0 : 600 : 60\n  T' = -h*A*(T - T_inf)/(m*c)\n  T(0) = T_0\nend`;
const o = run(ode), rows = JSON.stringify(o.tb), ro = E.Uncertainty.run(o.p, o.st);
const Tend = (hh, T0) => 300 + (T0 - 300) * Math.exp(-hh * 0.01 * 600 / 90);
ok('ode block (Newton cooling): u(T) from the exact solution, secants over h +- 2 and T_0 +- 3, to 1e-7', near(ro.u.get('T'), Math.hypot((Tend(22, 400) - Tend(18, 400)) / 2, (Tend(20, 403) - Tend(20, 397)) / 2), 1e-7), ro.u.get('T'));
ok('ode block: the tables of Solve are left as they were', JSON.stringify(E.OdeBlocks.tables) === rows);

// ---- messages
messages([['no solution', err('x = 0.5 +- 1\ny = sqrt(x)') || (() => { try { U('x = 0.5 +- 1\ny = sqrt(x)'); return null; } catch (e) { return e.message; } })(),
  /^Uncertainty: the equations could not be solved with x = 0\.5 - 1 \(SI\): /]]);
logs.length = 0;
const w = run('Re = 3e5 +- 1e3\nC = cd_sphere(Re)'), nw = logs.length;
E.Uncertainty.run(w.p, w.st);
ok('the extra solves print nothing (the drag-crisis warning of Solve is not repeated)', nw === 1 && logs.length === 1, logs);
done();
