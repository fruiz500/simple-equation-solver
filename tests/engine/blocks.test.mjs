// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Block decomposition, structural messages, equations written 0 = ..., large sparse systems.
import { E, run, err, CP } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const blocks = (txt) => { const p = new E.EESParser(); p.parse(txt); const S = new E.BoundedSolver(p.parsedASTs, p.variables, p.odeCalls);
  return S.partitionEquations().map(b => b.type === 'simultaneous' ? `{${b.vars.join(',')}}` : b.type === 'single' ? b.targetVar : 'check'); };

// two coupled pairs in reverse order, the second depending on the first: c = 3, d = 8, a = 4, b = 3, z = 9
const sys = `z = d + 1\na^2 + b^2 = 25*d/8\na - b = c - 2\nd = c^2 - 1\nc + d = 11`;
const bl = blocks(sys); note('blocks:', bl.join(' -> '));
ok('blocks found in order', bl.join(' ') === '{d,c} z {a,b}' || bl.join(' ') === '{c,d} z {a,b}', bl.join(' '));
let { st } = run(sys, { c: 2, a: 5 });
ok('two blocks solve', near(st.c, 3, 1e-7) && near(st.d, 8, 1e-7) && near(st.a, 4, 1e-7) && near(st.b, 3, 1e-7) && near(st.z, 9, 1e-7), JSON.stringify(st));

messages([
  ['redundant', err(`a = 1\nb = 2\na + b = 3\nd + w = 4`), /do not determine w\. The equation\(s\) at line 3 add no new information/],
  ['nonconv', err(`x^2 + y = 100\nx - y = 1e9\nx*y = -5`), /^Newton iteration did not converge for \[x, y\] in the equations at lines 1, 2/],
]);

// 300-node finite-difference chain T[i-1] - 2T[i] + T[i+1] + 0.01 = 0, ends 400 and 300; exact quadratic solution
const N = 300; let chain = `T_1 = 400\nT_${N} = 300\n`; for (let i = 2; i < N; i++) chain += `T_${i - 1} - 2*T_${i} + T_${i + 1} + 0.01 = 0\n`;
const exact = (i) => { const x = i - 1, L = N - 1; return 400 - 100 * x / L + 0.005 * x * (L - x); };
let ms; ({ st, ms } = run(chain)); note(`300-node chain: ${ms} ms, ${blocks(chain).length} blocks`);
ok('300-node chain exact', [2, 75, 150, 299].every(i => near(st['T_' + i], exact(i), 1e-9)), st.T_150 + ' vs ' + exact(150));

// property chain solved by direct substitution, inverse property call
({ st } = run(`T = 300\nP = 101325\nh = enthalpy('water', T, P)\ns = entropy('water', 'T', T, 'P', P)\nh2 = h + 1000\nT2 = temperature('water', 'P', P, 'H', h2)`));
ok('property chain', near(CP.PropsSI('H', 'T', st.T2, 'P', 101325, 'Water') - CP.PropsSI('H', 'T', 300, 'P', 101325, 'Water'), 1000, 1e-8), st.T2);

// Energy balance written in three forms; all must give h(T2) - h(T1) = Q/m = 50000 J/kg (CoolProp checked directly)
const forms = [
  ['0 = ...', `T1 = 300\nP = 2e5\nm = 2\nQ = 100000\n0 = m*(enthalpy('water', T1, P) - enthalpy('water', T2, P)) + Q`, { T2: 300 }],
  ['h_out = h_in + q', `T1 = 300\nP = 2e5\nm = 2\nQ = 100000\nm*enthalpy('water', T2, P) = m*enthalpy('water', T1, P) + Q`, { T2: 300 }],
  ['2-equation block, = 0', `T1 = 300\nP = 2e5\nm = 2\nQ = 100000\n0 = m*(h1 - enthalpy('water', T2, P)) + Q\nh1 - enthalpy('water', T1, P) = 0`, { T2: 300, h1: 1e5 }],
];
const H = T => CP.PropsSI('H', 'T', T, 'P', 2e5, 'Water');
for (const [name, txt, g] of forms) {
  const e = err(txt, g); if (e) { ok('energy balance ' + name, false, e); continue; }
  ({ st } = run(txt, g)); note(`energy balance ${name}: T2 = ${st.T2}`);
  ok('energy balance ' + name, near(H(st.T2) - H(300), 50000, 1e-9), st.T2);
}
done();
