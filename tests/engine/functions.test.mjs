// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
import { run, err, units, CP } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const solve = (t) => ({ state: run(t).st });

// 1 basic single output, defined after use, if/elseif/else
let r = solve(`
y1 = f(2)
y2 = f(-3)
y3 = f(0)
function y = f(x)
  if x > 0
    y = x^2
  elseif x < 0
    y = -x
  else
    y = 42
  end
end`).state;
ok('if/elseif/else', r.y1===4 && r.y2===3 && r.y3===42, JSON.stringify(r));

// 2 for + while + break + local var; simultaneous use (solve backwards)
r = solve(`
function s = sumto(n)
  s = 0
  for i = 1:n
    s = s + i
  end
end
function r = sqrtnewton(a)
  r = a
  while abs(r^2 - a) > 1e-14*a
    r = (r + a/r)/2
  end
end
function k = firstover(lim)
  k = 0
  while true
    k = k + 1
    if k^2 > lim
      break
    end
  end
end
A = sumto(10)
B = sqrtnewton(2)
C = firstover(50)
sqrtnewton(z) = 3
`).state;
ok('for', r.A===55); ok('while', near(r.B, Math.SQRT2)); ok('break', r.C===8); ok('backward solve through function', near(r.z, 9, 1e-7), r.z);

// 3 multi output, in simultaneous block, cached
let calls = 0;
r = solve(`
function [s, d] = sd(a, b)
  s = a + b
  d = a - b
end
[p, q] = sd(x, y)
p = 10
q = 2
`).state;
ok('multi output solved simultaneously', near(r.x,6,1e-7) && near(r.y,4,1e-7), JSON.stringify(r));

// 4 multi output inside expression -> error; arrays
ok('multi in expression error', /returns 2 outputs/.test(err(`
function [s, d] = sd(a, b)
  s = a + b
  d = a - b
end
z = sd(1,2) + 1`)||''));
r = solve(`
function v = vec(a)
  v = [a, 2*a, 3*a]
  v[2] = 7
end
w = vec(2)
z = vec(2)[3] + 1
`).state;
ok('array output', math.isMatrix(r.w) && r.w.toArray().join()==='2,7,6', String(r.w)); ok('indexed call', r.z===7);

// 5 units convert: degC in, kJ/kg out
r = solve(`
function h [kJ/kg] = hw(T [degC], P [kPa])
  h = enthalpy('water', T + 273.15, P*1000)/1000
end
T1 = 26.85 [degC]
P1 = 101.325 [kPa]
h1 = hw(T1, P1)
`).state;
const hcp = globalThis.window.CoolProp.PropsSI('H','T',300,'P',101325,'Water');
ok('unit conversion in/out', near(r.h1, hcp, 1e-9), r.h1 + ' vs ' + hcp);

// 6 string args, global string const visible, recursion, nested calls
r = solve(`
fl$ = 'R134a'
function T = tsat(F$, P)
  T = saturationtemperature(F$, P)
end
function T = tsatg(P)
  T = tsat(fl$, P)
end
function f = fact(n)
  if n <= 1
    f = 1
  else
    f = n * fact(n - 1)
  end
end
Ta = tsat('water', 101325)
Tb = tsatg(500000)
F = fact(10)
`).state;
ok('string arg', near(r.Ta, 373.124, 1e-4), r.Ta); ok('global string const', near(r.Tb, globalThis.window.CoolProp.PropsSI('T','P',5e5,'Q',0,'R134a'))); ok('recursion', r.F===3628800);

// 7 errors with line numbers
const msgs = {
  undef: err(`y = g(1)\nfunction y = g(x)\n  y = x + zz\nend`),
  noout: err(`y = g(1)\nfunction y = g(x)\n  if x > 5\n    y = 1\n  end\nend`),
  noend: err(`function y = g(x)\n  y = 1\n`),
  endless: err(`y = g(1)\nfunction y = g(x)\n  y = 0\n  while true\n    y = y + 1\n  end\nend`),
  rec: err(`y = g(1)\nfunction y = g(x)\n  y = g(x)\nend`),
  usererr: err(`y = g(1)\nfunction y = g(x)\n  if x < 2\n    error('x below the correlation range')\n  end\n  y = x\nend`),
  badstmt: err(`function y = g(x)\n  y + 1\nend`),
  shadow: err(`function y = sin(x)\n  y = 1\nend`),
  propname: err(`function y = enthalpy(x)\n  y = 1\nend`),
  argcount: err(`y = g(1, 2)\nfunction y = g(x)\n  y = x\nend`),
  blocked: err(`y = evaluate('2+2')`),
  blockedfn: err(`function y = g(x)\n  y = evaluate('2')\nend\nz = g(1)`),
  eqline: err(`a = 1\n\n/* two\nlines */\nb = (2`),
  varclash: err(`function y = g(x)\n  y = x\nend\ng = 3`),
  stray: err(`a = 1\nend`),
  nested: err(`y = h(1)\nfunction y = h(x)\n  y = g(x) * 2\nend\nfunction y = g(x)\n  y = q\nend`),
  setfn: err(`y = g(1)\nfunction y = g(x)\n  enthalpy = 3\n  y = 1\nend`),
};
const EXPECT = {
  undef: /^g\(\), line 3: 'zz' is not defined here/, noout: /^Line 1: g\(\): output 'y' was not assigned/,
  noend: /^Line 1: this function has no matching 'end'/, endless: /^g\(\), line 4: the while loop ran 100000 times/,
  rec: /^Line 1: g\(\): calls nested more than 64 deep/, usererr: /^g\(\), line 4: x below the correlation range$/,
  badstmt: /^Line 2: expected an assignment .* got 'y \+ 1'/, shadow: /^Line 1: 'sin' is already a built-in name/,
  propname: /^Line 1: 'enthalpy' is already a built-in name/, argcount: /^Line 1 .*g\(\) takes 1 argument\(s\), got 2/,
  blocked: /^Line 1 .*'evaluate\(\)' is not available in equations/, blockedfn: /^Line 2: 'evaluate\(\)' is not available/,
  eqline: /^Line 5: a \( or \[ is not closed$/, varclash: /^Line 4 .*'g' is a user function/,
  stray: /^Line 2: 'end' without an open function/, nested: /^h\(\), line 3: g\(\), line 6: 'q' is not defined here/,
  setfn: /^g\(\), line 3: 'enthalpy' is a function name and cannot be assigned/,
};
messages(Object.entries(msgs).map(([k, v]) => [k, v, EXPECT[k]]));

// 8 unit checker
let u = units(`
function q [W] = conv(h [W/(m^2 K)], A [m^2], dT [K])
  q = h*A*dT
end
h = 10 [W/(m^2 K)]
A = 2 [m^2]
dT = 5 [K]
L = 3 [m]
Q = conv(h, A, dT)
Q2 = conv(h, L, dT)
`);
note(u.logs.join('\n'));
ok('unit check flags wrong arg', u.issues.some(s => /expects \[m\^2\]/.test(s)));
ok('unit inferred from output', u.p.variables.get('Q').inferredUnit === 'W', u.p.variables.get('Q').inferredUnit);

// 9 regression: demo-like file still solves
r = solve(`x[1] = 5\nx[2] = x[1] * 2\na + b = 10\na - b = 2\nh_1 = enthalpy('water', 300, 101325)\nA = [1, 2; 3, 4]\nB = inv(A)\n[t, y_ode] = ode45(@(t,y) -0.5 * y, [0, 10], 5)`).state;
ok('regression', r['x[2]']===10 && near(r.a,6,1e-7) && r.y_ode.length===101);
// ode45 RHS with user function
r = solve(`function d = rhs(t, y)\n  d = -0.5*y\nend\n[t, y] = ode45(@(t,y) rhs(t, y), [0, 2], 1)`).state;
ok('ode45 uses user function', near(r.y[100], Math.exp(-1), 1e-8), r.y[100]);
done();
