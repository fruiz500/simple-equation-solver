// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Solid properties (solids.js, Incropera et al. 6th ed., Tables A.1-A.3): values printed in the book, the printed
// thermal diffusivities, linear interpolation, names, messages, solving through them, ode blocks, Check Units.
import fs from 'fs';
import path from 'path';
import { TESTS, E, run, err, units } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const P = (f, ...a) => E.Solids.call(f, a);

ok('198 materials', Object.keys(E.SOLIDS_DB).length === 198, Object.keys(E.SOLIDS_DB).length);
// 1. Every alpha printed in Tables A.1 and A.2 at 300 K (computed by the book from its own rho, cp, k) is reproduced
const A = JSON.parse(fs.readFileSync(path.join(TESTS, 'data/incropera-alpha-300K.json'), 'utf8')).alpha_1e6;
// Tolerance: 1 %, or half a unit of the last printed digit (the book prints 17, 3.1, 2.8 for some). Pure iron is an
// inconsistency of the book itself: 80.2/(7870*447) = 22.8e-6, printed 23.1e-6 (its rho, cp and k match the page image).
const BOOK_INCONSISTENT = { iron: 23.1 };
let worst = 0, bad = [];
for (const [key, a] of Object.entries(A)) {
  const mine = P('thermaldiffusivity', key, 300) * 1e6, dec = (String(a).split('.')[1] || '').length;
  const tol = Math.max(0.01 * a, 0.5 * 10 ** -dec);
  if (Math.abs(mine - a) > tol && !(key in BOOK_INCONSISTENT)) bad.push(`${key}: ${mine.toPrecision(4)} vs ${a}`);
  if (!(key in BOOK_INCONSISTENT)) worst = Math.max(worst, Math.abs(mine / a - 1));
}
note(`printed alpha at 300 K: ${Object.keys(A).length} materials, largest difference ${(worst * 100).toFixed(2)} % (iron excepted: ${(P('thermaldiffusivity', 'iron', 300) * 1e6).toFixed(2)} vs printed 23.1)`);
ok('alpha at 300 K matches the printed value for all of Tables A.1, A.2 (within print precision)', bad.length === 0, bad);
// 2. Values read off the pages (checked against the page images)
const spots = [
  ['conductivity', 'copper', 400, 393], ['specificheat', 'copper', 800, 433], ['conductivity', 'aisi_304', 1500, 31.7],
  ['specificheat', 'aisi_304', 100, 272], ['conductivity', 'aluminum_2024_t6', 100, 65], ['specificheat', 'iron', 1000, 975],
  ['conductivity', 'graphite_pyrolytic_parallel', 2000, 262], ['conductivity', 'graphite_pyrolytic_perpendicular', 2000, 0.81],
  ['conductivity', 'diamond', 100, 10000], ['conductivity', 'silicon_carbide', 1500, 30], ['conductivity', 'ice_incropera', 253, 2.03],
  ['specificheat', 'ice_incropera', 273, 2040], ['conductivity', 'cellular_glass', 420, 0.079], ['conductivity', 'polystyrene_extruded_35', 215, 0.023],
  ['conductivity', 'felt_semirigid_730', 200, 0.023], ['conductivity', 'blanket_alumina_silica_128', 750, 0.091],
  ['conductivity', 'teflon', 400, 0.45], ['specificheat', 'fir_cross', 300, 2720], ['conductivity', 'granite', 300, 2.79],
  ['conductivity', 'brick_fire_clay', 1478, 1.8], ['conductivity', 'chicken', 273, 0.476], ['density', 'pyrex', 300, 2225],
  ['conductivity', 'quartz_parallel', 100, 39], ['specificheat', 'quartz_parallel', 400, 885], ['conductivity', 'boron_epoxy_perpendicular', 400, 0.6],
];
const wrong = spots.filter(([f, k, T, v]) => P(f, k, T) !== v).map(([f, k, T, v]) => `${f}(${k}, ${T}) = ${P(f, k, T)}, book ${v}`);
ok(`${spots.length} values read off the pages`, wrong.length === 0, wrong);
ok('melting points', P('meltingpoint', 'tungsten') === 3660 && P('meltingpoint', 'aluminum') === 933 && P('meltingpoint', 'aisi_304') === 1670);
// 3. Linear interpolation between tabulated temperatures, as in the textbook
ok('linear between points: copper k at 350 K = 397', P('conductivity', 'copper', 350) === 397);
ok('linear between points: AISI 304 k at 450 K', near(P('conductivity', 'aisi_304', 450), 16.6 + 0.25 * (19.8 - 16.6), 1e-14));
ok('density is the tabulated value at any temperature', P('density', 'copper', 900) === 8933);
// 4. Names: case, spaces and punctuation ignored; aliases
ok('names and aliases', ['AISI 304', 'aisi-304', 'Stainless 304', 'stainless steel'].every(n => P('density', n, 300) === 7900) &&
  P('conductivity', 'Aluminium', 300) === 237 && P('conductivity', 'Cu', 300) === 401 && P('specificheat', 'Styrofoam', 300) === 1210);
// 5. In equations; solving backward from the default guess; an ode block; a user function
let s = run(`T = 350 [K]\nk = conductivity('copper', T)\nalpha = thermaldiffusivity('aluminum_2024_t6', T)\nm$ = 'brass'\nc = specificheat(m$, T)`).st;
ok('in equations, with a string variable', s.k === 397 && near(s.alpha, (177 + 186) / 2 / (2770 * (875 + 925) / 2), 1e-12) && s.c === (380 + 395) / 2, JSON.stringify(s));
s = run(`conductivity('aisi_304', T) = 18`).st;
ok('solved for T from the default guess (1 K, outside the table while iterating)', near(s.T, 487.5, 1e-9), s.T);
s = run(`function a = diff_of(mat$, T)\n  a = thermaldiffusivity(mat$, T)\nend\nx = diff_of('silver', 300)`).st;
ok('in a user function', near(s.x, 429 / (10500 * 235), 1e-14), s.x);
// lumped cooling of an aluminum sphere with cp(T): energy balance m*integral(cp dT) = heat lost; check against the table directly
s = run(`D = 0.01\nh = 50\nT_inf = 300\nm = density('aluminum', 400)*pi*D^3/6\nA = pi*D^2\node t = 0 : 600 : 100\n  T' = -h*A*(T - T_inf)/(m*specificheat('aluminum', T))\n  T(0) = 600\nend`).st;
ok('ode block with cp(T): ends between 300 and 600 K', s.T > 300 && s.T < 600, s.T);
messages([
  ['outside', err(`k = conductivity('copper', 1500)`), /^Line 1: conductivity\('copper'\): T = 1500 is outside the table, 100 to 1200 K \(Table A\.1, p\. 929\)/],
  ['solution outside', err(`conductivity('copper', T) = 300`), /conductivity\('copper'\): T = \d+(\.\d+)? is outside the table, 100 to 1200 K/],
  ['300 K only', err(`k = conductivity('plywood', 320)`), /gives the conductivity at 300 K only; write conductivity\('plywood', 300\) to use that value/],
  ['not tabulated', err(`c = specificheat('brick_face', 300)`), /specific heat of Brick, face is not tabulated \(Table A\.3, p\. 935\)/],
  ['no density', err(`r = density('blanket_mineral_fiber_920', 400)`), /density of .* is not tabulated \(density 96-192 kg\/m3.*\)/],
  ['other property', err(`mu = viscosity('copper', 300)`), /'copper' is a solid; solids have density, specificheat, conductivity, thermaldiffusivity and meltingpoint/],
  ['two arguments', err(`k = conductivity('copper', 300, 1e5)`), /a solid takes one temperature/],
  ['no melting point', err(`T = meltingpoint('plywood')`), /no melting point is tabulated/],
  ['not a solid', err(`T = meltingpoint('R134a')`), /'R134a' is not one of the solids/],   // meltingpoint('water') is ice's, at 1 atm
  ['ode outside', err(`ode t = 0 : 100\n  T' = 20\n  T(0) = 700\n  c = specificheat('aluminum', T)\nend`), /^ode block at line 1: specificheat\('aluminum'\): T = [\d.]+ is outside the table, 100 to 800 K/],
]);
// fluids are unaffected
s = run(`k = conductivity('water', 300, 101325)`).st; ok('fluids still go to CoolProp', near(s.k, 0.61, 0.02), s.k);
// 6. Check Units: the temperature argument is in K; results have the property units
let u = units(`T = 400 [K]\nk = conductivity('copper', T)\nc = specificheat('copper', T)\nalpha = thermaldiffusivity('copper', T)\nTm = meltingpoint('copper')\nL = 2 [m]\nbad = conductivity('copper', L)`);
u.issues.forEach(i => note(i));
ok('units: results inferred', u.p.variables.get('k').inferredUnit === 'W/(m K)' && u.p.variables.get('alpha').inferredUnit === 'm^2/s' && u.p.variables.get('Tm').inferredUnit === 'K',
  ['k', 'c', 'alpha', 'Tm'].map(v => u.p.variables.get(v).inferredUnit));
ok('units: a length as the temperature is flagged', u.issues.some(i => /conductivity\(\) expects \[K\]/.test(i)), u.issues);
done();
