// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Units defined from other units (1 [$] = 0.88 [euro]), complex results as errors, and adoptGuesses (Update guesses).
import { E, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';

// ---- defined units
let s = run(`units euro\n1 [$] = 0.88 [euro]\nprice = 10 [$]\nextra = 5 [euro]\ntotal = price + extra`).st;
ok('10 $ + 5 euro: stored in euro (the base), 13.8', near(s.total, 13.8, 1e-12), s.total);
ok('shown in $: 15.68182', near(E.UnitConv.fromSI(s.total, '$'), 13.8 / 0.88, 1e-12));
s = run(`1 [furlong] = 201.168 [m]\nL = 3 [furlong]`).st;
ok('a new name from a math.js unit, no units line needed: 3 furlong = 603.504 m', near(s.L, 603.504, 1e-12), s.L);
s = run(`0.5 [half] = 1 [kg]\nm = 1 [half]`).st;
ok('any number on the left: 0.5 half = 1 kg, so 1 half = 2 kg', near(s.m, 2, 1e-12), s.m);
s = run(`units $\n1 [k$] = 1000 [$]\n1 [M$] = 1000 [k$]\nc = 2 [M$]\nd = c [k$]`).st;
ok('a chain, names ending in $: 2 M$ = 2000 k$', near(E.UnitConv.fromSI(s.d, 'k$'), 2000, 1e-12), s.d);
s = run(`units euro\n1 [$] = 0.90 [euro]\np = 10 [$]`).st;
ok('a changed factor takes effect on the next parse', near(s.p, 9, 1e-12), s.p);
s = run(`units $, euro\n1 [euro] = 1.136 [$]\np = 1 [euro]`).st;
ok('a name in the units line may be defined too (the definition wins)', near(s.p, 1.136, 1e-12), s.p);
s = run(`units euro\n1 [$] = 0.88 [euro]; a = 2 [$]`).st;
ok('after a semicolon', near(s.a, 1.76, 1e-12), s.a);
let u = units(`units euro\n1 [$] = 0.88 [euro]\na = 2 [$]\nb = 3 [euro]\nc = a + b\nd = a*b`);
ok('Check: $ and euro add; the unit is named by the base, euro; a*b in euro^2',
  u.issues.length === 0 && u.p.variables.get('c').inferredUnit === 'euro' && u.p.variables.get('d').inferredUnit === 'euro^2', [u.issues, u.p.variables.get('c').inferredUnit]);
u = units(`units euro\n1 [$] = 0.88 [euro]\na = 2 [$]\nb = 3 [m]\nc = a + b`);
ok('Check: $ and m do not', u.issues.some(i => /Cannot combine \[euro\] and \[m\]/.test(i)), u.issues);
messages([
  ['known name', err(`1 [ft] = 0.3 [m]\nx = 1`), /^Line 1: 'ft' is already a unit and cannot be redefined$/],
  ['unknown right', err(`1 [k$] = 1000 [$]\nx = 1`), /^Line 1: unit '\$' on the right is not known \(declare new names first, e\.g\.  units euro\)$/],
  ['offset', err(`1 [degX] = 1 [degC]\nx = 1`), /^Line 1: define units from ones without an offset/],
  ['zero', err(`1 [foo] = 0 [m]\nx = 1`), /^Line 1: the conversion factor must be a positive number$/],
  ['itself', err(`units $\n1 [$] = 2 [$]\nx = 1`), /^Line 2: '\$' cannot be defined from itself$/],
]);

// ---- complex results
messages([
  ['sqrt', err(`a = 1\nx = sqrt(-a)`), /^Line 2: x comes out as the complex number i, for example from the square root or logarithm of a negative number\. Complex numbers are not supported in the equations; for a complex calculation, use the console line below the Console\.$/],
  ['log', err(`z = log(-1)`), /^Line 1: z comes out as the complex number 3\.14159i/],
  ['element', err(`v = [1, sqrt(-4)]`), /^Line 1: an element of v is the complex number 2i/],
  ['power', err(`w = (-8)^(1/3)`), /^Line 1: w comes out as the complex number 1 \+ 1\.73205i/],
]);
ok('real roots still fine', run(`q = sqrt(4); r = cbrt(-8)`).st.r === -2);

// ---- adoptGuesses
const r = run(`x^2 = 9\ny = x + 1\nA = [1, 2]`, { x: -2 });
E.BoundedSolver.adoptGuesses(r.p.variables);
ok('the solution becomes the guesses (numbers only)', near(r.p.variables.get('x').guess, -3) && near(r.p.variables.get('y').guess, -2) && r.p.variables.get('A').guess === 1);
done();
