// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Several equations on one line, separated by semicolons; and guesses, bounds and units kept through parse errors.
import { E, run, err } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';

// ---- semicolons
let s = run(`a + b = 10; a - b = 2`).st;
ok('two equations on one line', s.a === 6 && s.b === 4, JSON.stringify(s));
s = run(`x = 5;\ny = 2*x;`).st;
ok('a trailing semicolon is allowed', s.x === 5 && s.y === 10, JSON.stringify(s));
s = run(`A = [1, 2; 3, 4]; d = det(A); B = A'; t = det(B + A')`).st;
ok('semicolons inside [ ] are matrix rows; a transpose is not a quote', s.d === -2 && near(s.t, -8), JSON.stringify([s.d, s.t]));
s = run(`L = 2 [m]; W = 3 [m]; Area = L*W`).st;
ok('inline units on each piece', near(s.Area, 6), JSON.stringify(s));
s = run(`f$ = 'water'; T = 300; h = enthalpy(f$, T, 101325)`).st;
ok('a string variable and an equation on one line', s.h > 1e5, JSON.stringify(s));
s = run(`N = 3; M = N\nduplicate i = 1 : M\n  x[i] = i; y[i] = 2*x[i]\nend\ntot = sum_y\nsum_y = y[1] + y[2] + y[3]`).st;
ok('a constant for a duplicate range, and two equations per line inside the block', s.tot === 12 && s['x[3]'] === 3, JSON.stringify(s));
s = run(`function z = f(x)\n  y = 2*x; z = y + 1;\nend\nq = f(3)`).st;
ok('two statements on one line of a function', s.q === 7, JSON.stringify(s));
s = run(`units $; price = 2 [$]; cost = 3*price`).st;
ok('a units declaration followed by equations', near(s.cost, 6), JSON.stringify(s));
messages([
  ['line number', err(`a = 1\nb = 2; c = ; d = 4`), /^Line 2: nothing on the right of '=' in 'c ='\.$/],
  ['block late', err(`N = 3; duplicate i = 1 : N\n  x[i] = i\nend`), /^Line 1: 'duplicate' must start its own line, not follow a semicolon\.$/],
  ['missing =', err(`a = 1; b 2`), /^Line 1: missing '=' sign in 'b 2'/],
]);

// ---- guesses, bounds and units survive a parse error (the Parametric Table's variable list parses while you type)
const p = new E.EESParser();
p.parse(`a = 2\nb^2 = 3 + a`);
Object.assign(p.variables.get('b'), { guess: -5, lower: -10 });
p.variables.get('a').unit = 'm';
try { p.parse(`c = \na = 2\nb^2 = 3 + a`); } catch (e) { }          // mid-edit: does not parse
p.parse(`c = 1\na = 2\nb^2 = 3 + a`);
const b = p.variables.get('b');
ok('guess and bound kept through a parse error', b.guess === -5 && b.lower === -10, JSON.stringify(b));
ok('unit kept too', p.variables.get('a').unit === 'm');
const st = new E.BoundedSolver(p.parsedASTs, p.variables, p.odeCalls).solve();
ok('so the solver finds the negative root', near(st.b, -Math.sqrt(5)), st.b);
p.parse(`z = 1`); p.parse(`b = 2`);
ok('a variable gone from a parse that succeeded starts fresh when it comes back', p.variables.get('b').guess === 1 && p.variables.get('b').lower === -Infinity);
done();
