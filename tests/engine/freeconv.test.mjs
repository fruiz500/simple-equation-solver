// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Free convection correlations (correlations.js): values computed in Incropera's worked examples (Ch. 9), limits where
// two correlations must agree, the piecewise choices, range warnings, messages, Check Units.
import { E, run, err, units, logs } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const warns = () => logs.filter(l => /^WARN: /.test(l));
const solve = (t, g) => { logs.length = 0; return run(t, g).st; };
const rel = (a, b) => Math.abs(a / b - 1);

// 1. Book examples
ok('nu_churchillchu_plate, Ex. 9.2: Ra 1.813e9, Pr 0.690 -> 147', Math.abs(C('nu_churchillchu_plate', 1.813e9, 0.690) - 147) < 0.5, C('nu_churchillchu_plate', 1.813e9, 0.690));
ok('nu_churchillchu_plate_lam, Ex. 9.3: h = 4.23 W/(m2 K) (k 0.0265, L 0.3, Ra 7.07e7, Pr 0.71)', Math.abs(C('nu_churchillchu_plate_lam', 7.07e7, 0.71) * 0.0265 / 0.3 - 4.23) < 0.005);
ok("nu_hplate, Ex. 9.3: top 5.47 and bottom 2.07 W/(m2 K) (Ra 1.38e8, L 0.375); the book rounds the top down",
  rel(C('nu_hplate', 1.38e8, 'hot_up') * 0.0265 / 0.375, 5.47) < 2e-3 && Math.abs(C('nu_hplate', 1.38e8, 'hot_down') * 0.0265 / 0.375 - 2.07) < 0.005,
  [C('nu_hplate', 1.38e8, 'hot_up') * 0.0265 / 0.375, C('nu_hplate', 1.38e8, 'hot_down') * 0.0265 / 0.375]);
ok('nu_morgan, Ex. 9.4 comment: 22.8', Math.abs(C('nu_morgan', 5.073e6) - 22.8) < 0.05, C('nu_morgan', 5.073e6));
// The book prints 23.3; the equation with its own numbers gives 23.09 (an arithmetic slip in the book, 0.9 %)
ok('nu_churchillchu_cyl, Ex. 9.4: 23.09 by the equation (the book prints 23.3)', Math.abs(C('nu_churchillchu_cyl', 5.073e6, 0.697) - 23.09) < 0.005 && rel(C('nu_churchillchu_cyl', 5.073e6, 0.697), 23.3) < 0.01);
const Lc = C('lc_cylinders', 0.05, 0.06), Rac = 9.8 * 2.85e-3 * 85 * Lc ** 3 / (20.92e-6 * 29.9e-6);
ok('lc_cylinders, keff_k_cylinders, Ex. 9.5: Ra_c 171, k_eff 0.0343 W/(m K)', Math.abs(Rac - 171) < 0.5 && Math.abs(0.030 * C('keff_k_cylinders', Rac, 0.70) - 0.0343) < 5e-5, [Lc, Rac]);
// 2. Limits that two correlations must share
for (const x of [1e-3, 1e-2]) ok(`fully developed limit Ra_S S/L = ${x}: Elenbaas and Bar-Cohen both Ra_S S/L/24`,
  rel(C('nu_elenbaas', x, 1), x / 24) < 1e-6 && rel(C('nu_channel', x, 1, 'symmetric_t'), x / 24) < 1e-5);
ok('isolated plate limit (Ra_S S/L = 1e8): Elenbaas 35^(3/4)/24 x^(1/4) = 0.600 x^(1/4), Bar-Cohen 2.87^(-1/2) x^(1/4) = 0.590 x^(1/4)', rel(C('nu_elenbaas', 1e8, 1), 35 ** 0.75 / 24 * 100) < 1e-6 && rel(C('nu_channel', 1e8, 1, 'symmetric_t'), 100 / Math.sqrt(2.87)) < 1e-3);
ok('nu_channel symmetric_q, fully developed: (x/48)^(1/2)', rel(C('nu_channel', 1e-4, 1, 'symmetric_q'), Math.sqrt(1e-4 / 48)) < 1e-3);
ok('nu_channel fully developed: asymmetric_t (C1 = 144) is twice symmetric_t (C1 = 576)', rel(C('nu_channel', 1e-3, 1, 'asymmetric_t') / C('nu_channel', 1e-3, 1, 'symmetric_t'), 2) < 1e-5,
  C('nu_channel', 1e-3, 1, 'asymmetric_t') / C('nu_channel', 1e-3, 1, 'symmetric_t'));
ok('nu_churchillchu_plate and _lam within 5 % at Ra = 1e6, Pr 0.7', rel(C('nu_churchillchu_plate', 1e6, 0.7), C('nu_churchillchu_plate_lam', 1e6, 0.7)) < 0.05);
ok('nu_morgan: continuous within 1 % at the band edges of Table 9.1', [1e-2, 1e2, 1e4, 1e7].every(Ra => rel(C('nu_morgan', Ra * 0.999999), C('nu_morgan', Ra * 1.000001)) < 0.01));
ok('nu_churchillchu_cyl and nu_morgan within 20 % (Ra 1e-2 to 1e11, Pr 0.7; the two fits differ that much)', [1e-2, 1, 1e3, 1e5, 1e7, 1e9, 1e11].every(Ra => rel(C('nu_churchillchu_cyl', Ra, 0.7), C('nu_morgan', Ra)) < 0.2));
ok('nu_churchill_sphere -> 2 as Ra -> 0', near(C('nu_churchill_sphere', 0, 0.7), 2, 1e-15));
// 3. Enclosures
ok('nu_cavity_horiz: 1 below 1708, Globe-Dropkin above', C('nu_cavity_horiz', 1000, 0.7) === 1 && near(C('nu_cavity_horiz', 1e6, 0.7), 0.069 * 100 * 0.7 ** 0.074, 1e-12));
ok('nu_hollands: 1 below 1708 cos tau; horizontal case at Ra 1e5 (formula)', C('nu_hollands', 1500, 0) === 1 &&
  near(C('nu_hollands', 1e5, 0), 1 + 1.44 * (1 - 1708 / 1e5) + ((1e5 / 5830) ** (1 / 3) - 1), 1e-12));
ok('nu_cavity_vert picks Eq. 9.51 (H/L 1.5), 9.50 (5), 9.52 (20, Ra 1e6), 9.53 (20, Ra 1e8)',
  near(C('nu_cavity_vert', 1e5, 0.7, 1.5), 0.18 * (0.7 / 0.9 * 1e5) ** 0.29, 1e-12) && near(C('nu_cavity_vert', 1e5, 0.7, 5), 0.22 * (0.7 / 0.9 * 1e5) ** 0.28 * 5 ** -0.25, 1e-12) &&
  near(C('nu_cavity_vert', 1e6, 1.5, 20), 0.42 * 1e6 ** 0.25 * 1.5 ** 0.012 * 20 ** -0.3, 1e-12) && near(C('nu_cavity_vert', 1e8, 1.5, 20), 0.046 * 1e8 ** (1 / 3), 1e-12));
ok('keff_k_spheres: at least 1, formula above', C('keff_k_spheres', 1, 0.7) === 1 && near(C('keff_k_spheres', 1e4, 0.7), 0.74 * (0.7 / 1.561) ** 0.25 * 10, 1e-12));
ok('ls_spheres matches Eq. 9.63', near(C('ls_spheres', 0.1, 0.15), (10 - 1 / 0.15) ** (4 / 3) / (2 ** (1 / 3) * (0.1 ** -1.4 + 0.15 ** -1.4) ** (5 / 3)), 1e-12));
// 4. Warnings only at the solution; a solution outside the range gives one
let s = solve(`Nu = nu_hplate(Ra, 'hot_down')\nNu = 20`);
ok('nu_hplate: solved backward for Ra, no warning inside the range', near(s.Ra, (20 / 0.27) ** 4, 1e-6) && warns().length === 0, [s.Ra, warns()]);
s = solve(`Nu = nu_hplate(1e4, 'hot_down')`);
ok('nu_hplate hot_down at Ra 1e4: one warning', warns().length === 1 && /Ra_L = 10000 is outside its range, 1e5 to 1e10 \(Eq\. 9\.32\)/.test(warns()[0]), warns());
s = solve(`Nu = nu_elenbaas(1e6, 0.5)`);
ok('nu_elenbaas: Ra_S S/L above 1e5 is reported as such', warns().length === 1 && /Ra_S S\/L = 500000 is outside its range, 0.1 to 100000 \(Eq\. 9\.36\)/.test(warns()[0]), warns());
s = solve(`Nu = nu_cavity_vert(1e5, 1.5, 50)`);
ok('nu_cavity_vert: H/L = 50 warned', warns().length === 1 && /H\/L = 50 is outside the range of the equation used, 1 to 40/.test(warns()[0]), warns());
messages([
  ['condition', err(`x = nu_channel(1e3, 0.1, 'iso')`), /'iso' should be one of 'symmetric_t', 'symmetric_q', 'asymmetric_t', 'asymmetric_q'/],
  ['negative Ra', err(`x = nu_morgan(-5)`), /Ra_D = -5 must be positive/],
  ['zero H/L', err(`x = nu_cavity_vert(1e5, 0.7, 0)`), /H_L = 0 must be positive/],
]);
// 5. Check Units: lc_cylinders takes and returns lengths; the Nusselt functions are dimensionless
let u = units(`ri = 0.05 [m]\nro = 0.06 [m]\nLc = lc_cylinders(ri, ro)\nT = 300 [K]\nbad = lc_cylinders(T, ro)`);
ok('Check Units: lc_cylinders in m', u.p.variables.get('Lc').inferredUnit === 'm', u.p.variables.get('Lc').inferredUnit);
u = units(`T1 = 300 [K]\nT2 = 310 [K]\nbad = lc_cylinders(T1, T2)`);
ok('Check Units: two temperatures as radii', u.issues.some(i => /lc_cylinders\(\) takes radii \(lengths\) but got \[K\]/.test(i)), u.issues);
u = units(`ri = 0.05 [m]\nT = 300 [K]\nbad = lc_cylinders(T, ri)`);
ok('Check Units: a temperature as radius is flagged', u.issues.some(i => /Cannot combine \[K\] and \[m\] in 'lc_cylinders/.test(i)), u.issues);
done();
