// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Check Units: unit inference and the problems it must find.
import { units } from '../lib/engine.mjs';
import { CODE } from '../lib/help.mjs';
import { ok, note, done } from '../lib/check.mjs';
const unitOf = (u, n) => { const m = u.p.variables.get(n); return m.unit || m.inferredUnit || '?'; };
const allKnown = (u) => [...u.p.variables.values()].every(m => m.unit || m.inferredUnit);

let u = units(CODE['ex-a3']);
ok('slab (duplicate + ode): every unit known', allKnown(u), [...u.p.variables.keys()].filter(n => unitOf(u, n) === '?').join());
ok('slab: T[i] inferred as K', [1, 10, 20].every(i => unitOf(u, `T[${i}]`) === 'K'));
u = units(CODE['ex-a1']);
ok('fin: every unit known', allKnown(u)); ok('fin: theta[50] is K, m_fin is 1/m', unitOf(u, 'theta[50]') === 'K' && /^1 ?\/ ?m$/.test(unitOf(u, 'm_fin')), unitOf(u, 'm_fin'));

// an unlabelled student file: units come from the property calls; plain numbers are dimensionless
u = units(`T1 = 300\nP = 101325\nh1 = enthalpy('water', T1, P)\nh2 = h1 + 5000\nm_dot = 2\nQ_dot = m_dot*(h2 - h1)\nk = 0.01\nt = 60\nf = exp(-k*t)`);
const want = { T1: 'K', P: 'Pa', h1: 'J/kg', h2: 'J/kg', m_dot: '-', f: '-' };
for (const [n, w] of Object.entries(want)) ok(`unlabelled: ${n} [${w}]`, unitOf(u, n) === w, unitOf(u, n));
ok('unlabelled: no issues', u.issues.length === 0, u.issues.join(' | '));

u = units(`T = 300 [K]\nL = 2\nx = T + L*3\nA = L^2 [m^2]`);
ok('temperature plus a length is flagged', u.issues.some(s => /Cannot combine \[K\] and \[m\] in 'T \+ L \* 3'/.test(s)), u.issues.join(' | '));
// Known limitation (help.html): only dimensions are compared, so kPa used as Pa is not detected.
u = units(`P = 200\nT = 400 [K]\nrho = density('air', T, P*1000)\nv = 1/rho\nw = P*v [kJ/kg]`);
note(`kPa used as Pa: ${u.issues.length} issue(s) (known limitation, not checked)`);

// every help example: no unit problems, and at least as many variables with known units as on 31 Oct 2026 (370)
let tot = 0, known = 0;
for (const [id, code] of Object.entries(CODE)) {
  try { u = units(code); } catch (e) { ok('help ' + id + ' units run', false, e.message); continue; }
  tot += u.p.variables.size; known += [...u.p.variables.values()].filter(m => m.unit || m.inferredUnit).length;
  ok('help ' + id + ': no unit issues', u.issues.length === 0, u.issues.join(' | ').slice(0, 300));
}
note(`help examples: ${known} of ${tot} variables with known units`);
ok('help examples: at least 370 variables with known units', known >= 370, `${known}/${tot}`);
done();
