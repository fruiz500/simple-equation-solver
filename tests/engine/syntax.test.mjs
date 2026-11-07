// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Bracket continuation (a line with an open ( or [ continues on the next lines) and declared units (units $, euro).
import { E, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';

// ---- continuation
let s = run(`T_tab = [300, 350,\n         400, 450]\nk_tab = [1, 2,\n\n         4, 8]\ny = interpolate(T_tab,\n    k_tab, 375)\nA = [1, 2;\n     3, 4]\nd = det(A)\nz = (1 +\n     2)*3`).st;
ok('lists, a call, a matrix and parentheses across lines (blank lines skipped)', s.y === 3 && s.d === -2 && s.z === 9, JSON.stringify([s.y, s.d, s.z]));
s = run(`function y = poly(x)\n  y = (1 +\n       2*x)\nend\nq = poly(2)\nduplicate i = 1 : 2\n  w[i] = (i +\n          1)\nend\node t = 0 : 1\n  y' = -(y +\n         0)\n  y(0) = 1\nend`).st;
ok('inside a function, a duplicate block and an ode block', s.q === 5 && s['w[2]'] === 3 && near(s.y, Math.exp(-1), 1e-9), JSON.stringify(s));
s = run(`ode t = 0 : 1\n  T[1]' = -T[1]\n  T[1](0) = 1\nend\nA = [1, 2; 3, 4]\nb = sum(A' .* [0, 1; 0, 0])`).st;
ok("a prime (T[1]', A') is not taken as a quote", near(s['T[1]'], Math.exp(-1), 1e-9) && s.b === 3, JSON.stringify([s['T[1]'], s.b]));
s = run(`f$ = 'water'\nh = enthalpy(f$,\n             300, 101325)\nc = enthalpy('water', 300,\n   101325) - h`).st;
ok('quoted text and string variables', s.c === 0 && s.h > 1e5, JSON.stringify(s));
messages([
  ['later line number', err(`x = [1,\n     2]\ny = 1 +\nz = 2`), /^Line 3: missing '=' sign|^Line 3 /],
  ['never closed', err(`a = 1\nb = [2,\n3`), /^Line 2: a \( or \[ is not closed$/],
  ['next equation', err(`a = 1\nb = (2\n\nc = 3`), /^Line 2: a \( or \[ is not closed \(line 4 starts a new equation\)$/],
]);
ok('an error after a continued line keeps its own line number', /^Line 5/.test(err(`T = [1,\n2,\n3]\nq = 1\nr = (2`) || ''), err(`T = [1,\n2,\n3]\nq = 1\nr = (2`));

// ---- declared units
const cost = `units $, euro\nprice = 0.12 [$/kWh]\nE = 500 [kWh]\ncost = price*E\nrate = 0.92 [euro/$]\ncost_eu = cost*rate`;
s = run(cost).st;
ok('$ and euro with known units: 500 kWh at 0.12 $/kWh = 60 $, at 0.92 euro/$ = 55.2 euro', near(s.cost, 60, 1e-12) && near(s.cost_eu, 55.2, 1e-12), JSON.stringify(s));
ok('display in other units: 120 $/MWh, 0.12 $/kWh', near(E.UnitConv.fromSI(s.price, '$/MWh'), 120, 1e-12) && near(E.UnitConv.fromSI(s.price, '$/kWh'), 0.12, 1e-12));
let u = units(cost);
ok('Check Units: no issues; cost in $, cost_eu in euro', u.issues.length === 0 && u.p.variables.get('cost').inferredUnit === '$' && u.p.variables.get('cost_eu').inferredUnit === 'euro',
  [u.issues, u.p.variables.get('cost').inferredUnit, u.p.variables.get('cost_eu').inferredUnit]);
u = units(`units $, euro\na = 3 [$]\nb = 2 [euro]\nc = a + b\nm = 2 [kg]\nd = a + m`);
ok('Check Units: $ + euro and $ + kg are flagged', u.issues.some(i => /Cannot combine \[\$\] and \[euro\]/.test(i)) && u.issues.some(i => /Cannot combine \[\$\] and \[kg\]/.test(i)), u.issues);
u = units(`units person\nq = 75 [W/person]\nn = 40 [person]\nQ = q*n`);
ok('Check Units: W/person times person is W', u.issues.length === 0 && u.p.variables.get('Q').inferredUnit === 'W', [u.issues, u.p.variables.get('Q').inferredUnit]);
s = run(`units €\nfunction c [€] = annual(P [kW], h, p [€/kWh])\n  c = P*h*p\nend\nP = 2 [kW]\np = 0.3 [€/kWh]\nC2 = annual(P, 1000, p)`).st;
ok('a function header with € units', near(s.C2, 600, 1e-12), s.C2);
messages([
  ['not declared', err(`x = 3 [$]`), /Unit '\$' is not recognized.*declared first:  units \$, euro/],
  ['declaration removed', (run(`units euro\nx = 3 [euro]`), err(`x = 3 [euro]`)), /Unit 'euro' is not recognized/],
  ['known unit', err(`units m\nx = 1`), /^Line 1: 'm' is already a unit; only new names can be declared/],
  ['bad name', err(`units 3x\nx = 1`), /^Line 1: '3x' cannot be a unit name/],
  ['empty', err(`units ,\nx = 1`), /^Line 1: list the new units after 'units'/],
]);
s = run(`units = 5\ny = units*2`).st;
ok("a variable called units still works", s.y === 10, s.y);

// Unknown functions are found when the equations are read (by Check, too), with the nearest name when it looks like a typo
messages([
  ['typo', err(`h = enthalpie('water', 300, 1e5)`), /Unknown function 'enthalpie\(\)'\. Did you mean 'enthalpy\(\)'\?/],
  ['case', err(`h = Enthalpy('water', 300, 1e5)`), /Unknown function 'Enthalpy\(\)'\. Did you mean 'enthalpy\(\)'\?/],
  ['corr', err(`Nu = nu_gnielinsky(1e4, 0.7)`), /Did you mean 'nu_gnielinski\(\)'\?/],
  ['none', err(`x = foo(3)`), /Unknown function 'foo\(\)'\. See the Help for the functions available\./],
]);
ok('known kinds of functions still pass: math.js, ln, if, integral, user functions, multiple outputs', err(`function [a, b] = two(x)\n  a = x\n  b = 2*x\nend\nfunction c = one(x)\n  c = x\nend\ny = sin(1) + ln(2) + if(1 > 0, 1, 2) + integral(t^2, t, 0, 1) + one(3)\n[p, q] = two(4)`) === null);
done();
