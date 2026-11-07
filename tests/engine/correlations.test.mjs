// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Forced convection correlations (correlations.js): values computed in Incropera's worked examples, independent checks
// of the implicit and integrated forms, tables, range warnings at the solution only, messages, Check Units.
import { E, run, err, units, logs } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const warns = () => logs.filter(l => /^WARN: /.test(l));
const solve = (t, g) => { logs.length = 0; return run(t, g).st; };

// 1. Results printed in the book's examples (to their printed precision)
const book = [
  ['nu_hilpert', [6071, 0.70], 37.3, 'Ex. 7.4'], ['nu_churchillbernstein', [6071, 0.70], 40.6, 'Ex. 7.4'],
  ['nu_zukauskas', [7992, 0.707, 0.690], 50.5, 'Ex. 7.4'], ['nu_whitaker', [6440, 0.708, 182.6 / 197.8], 47.1, 'Ex. 7.6'],
  ['nu_plate_lam', [1.14e5, 0.69], 198, 'Ex. 7.2'], ['nu_plate_lam', [4.56e5, 0.69], 396, 'Ex. 7.2'],
  ['nu_plate_mixed', [5.70e5, 0.69], 546, 'Ex. 7.2'], ['nu_plate_mixed', [6.84e5, 0.69], 753, 'Ex. 7.2'],
  ['nu_siedertate_lam', [2080, 0.56, 100, 1], 4.22, 'Ex. 8.7 (mass transfer analog)'], ['nu_dittusboelter', [20384, 0.70, 'cooling'], 57.9, 'Ex. 8.6'],
];
for (const [fn, a, v, ex] of book) {
  const got = C(fn, ...a), digits = String(v).replace('.', '').replace(/^0+/, '').length;
  // half a unit of the last printed digit, or 0.1 % (the book carries rounded intermediate values, such as A = 871)
  ok(`${fn}(${a.join(', ')}) = ${v} (${ex})`, Math.abs(got - v) <= Math.max(0.5 * 10 ** (Math.floor(Math.log10(v)) - digits + 1) * 1.0001, 1e-3 * v), got);
}
// tube bank, Ex. 7.7: the book rounds C = 0.35(ST/SL)^(1/5) to 0.34 and gets 87.9; unrounded C gives about 1 % more
let tb = C('nu_tubebank', 13943, 0.710, 0.701, 'staggered', 31.3 / 34.3, 7);
ok('nu_tubebank, Ex. 7.7: 87.9 with C rounded to 0.34 (1.1 % above with the unrounded C)', near(tb * 0.34 / (0.35 * (31.3 / 34.3) ** 0.2), 87.9, 2e-3) && Math.abs(tb / 87.9 - 1) < 0.015, tb);
// 2. Friction factors: Colebrook satisfies its own equation; smooth limit close to Petukhov; laminar
for (const [Re, e] of [[4000, 0], [1e5, 0.001], [1e7, 0.05], [5e4, 1e-5]]) {
  const f = C('f_colebrook', Re, e), res = 1 / Math.sqrt(f) + 2 * Math.log10(e / 3.7 + 2.51 / (Re * Math.sqrt(f)));
  ok(`f_colebrook(${Re}, ${e}) satisfies the Colebrook equation`, Math.abs(res) < 1e-12, res);
}
ok('f_colebrook: Moody chart value 0.0222 at Re = 1e5, eps/D = 0.001', Math.abs(C('f_colebrook', 1e5, 0.001) - 0.0222) < 0.0002);
ok('f_colebrook smooth vs f_petukhov within 2 % (1e4 to 1e6)', [1e4, 1e5, 1e6].every(Re => Math.abs(C('f_colebrook', Re, 0) / C('f_petukhov', Re) - 1) < 0.02));
ok('f_laminar = 64/Re', C('f_laminar', 1000) === 0.064);
// 3. Gnielinski: default f is Petukhov's; with a rough-tube f
ok('nu_gnielinski with the Petukhov f', near(C('nu_gnielinski', 5e4, 5), C('nu_gnielinski', 5e4, 5, C('f_petukhov', 5e4)), 1e-14));
ok('nu_gnielinski, rough tube: higher Nu', C('nu_gnielinski', 5e4, 5, C('f_colebrook', 5e4, 0.002)) > C('nu_gnielinski', 5e4, 5));
// 4. Flat plate: unheated starting length, average (Eq. 7.44) against an integration of the local value (Eqs. 7.42, 7.43)
for (const [lam, loc, avg, Re, r] of [[true, 'nu_plate_lam_x', 'nu_plate_lam', 2e5, 0.3], [false, 'nu_plate_turb_x', 'nu_plate_turb', 5e6, 0.4]]) {
  // h(x) ~ Nu_x/x; Re_x = Re_L x/L. Average over the heated part, (1/(L - xi)) * integral of h dx, as Nu on L
  const N = 20000; let s = 0;
  for (let i = 0; i < N; i++) { const x = r + (1 - r) * (i + 0.5) / N; s += C(loc, Re * x, 0.7, r / x) / x * (1 - r) / N; }
  const integral = s / (1 - r), eq744 = C(avg, Re, 0.7, r);
  note(`${avg} with xi/L = ${r}: Eq. 7.44 ${eq744.toFixed(2)}, integral of the local value ${integral.toFixed(2)}`);
  ok(`${avg}: unheated starting length (Eq. 7.44) agrees with the integral of Eq. ${lam ? '7.42' : '7.43'} within ${lam ? '1' : '3'} %`, Math.abs(eq744 / integral - 1) < (lam ? 0.01 : 0.03), [eq744, integral]);
}
ok('average laminar = 2 x local at the same Re', near(C('nu_plate_lam', 1e5, 0.7), 2 * C('nu_plate_lam_x', 1e5, 0.7), 1e-14));
ok('mixed with Re_xc = 0 is fully turbulent', near(C('nu_plate_mixed', 1e6, 0.7, 0), C('nu_plate_turb', 1e6, 0.7), 1e-12));
ok('A = 871 for Re_xc = 5e5', Math.abs((0.037 * 5e5 ** 0.8 - 0.664 * Math.sqrt(5e5)) - 871) < 1);
ok('cf_plate_mixed', near(C('cf_plate_mixed', 1e6), 0.074 * 1e6 ** -0.2 - 2 * (0.037 * 5e5 ** 0.8 - 0.664 * Math.sqrt(5e5)) / 1e6, 1e-14));
// 5. Sphere drag (Clift-Gauvin): Stokes at low Re; the standard drag curve: about 27 at Re = 1, 4.15 at 10, 1.1 at 100;
//    0.38 to 0.50 from Re = 1e3 to 2e5 (Newton regime); a warning in the drag crisis
ok('cd_sphere -> 24/Re (Stokes) at Re = 0.01', Math.abs(C('cd_sphere', 0.01) / 2400 - 1) < 0.01, C('cd_sphere', 0.01));
ok('cd_sphere on the standard curve at Re = 1, 10, 100', Math.abs(C('cd_sphere', 1) - 27) < 1.5 && Math.abs(C('cd_sphere', 10) - 4.15) < 0.1 && Math.abs(C('cd_sphere', 100) - 1.1) < 0.05,
  [1, 10, 100].map(Re => C('cd_sphere', Re)));
ok('cd_sphere between 0.38 and 0.50 for 1e3 to 2e5', [1e3, 3e3, 1e4, 3e4, 1e5, 2e5].every(Re => C('cd_sphere', Re) > 0.38 && C('cd_sphere', Re) < 0.50), [1e3, 1e4, 1e5, 2e5].map(Re => C('cd_sphere', Re)));
let s0 = solve(`cd = cd_sphere(5e5)`);
ok('cd_sphere: warning in the drag crisis', warns().length === 1 && /above 2e5: in the drag crisis/.test(warns()[0]), warns());
// 6. Tables
ok('Table 8.1: circle 4.36 / 3.66, f Re 64; square 3.61 / 2.98, 57; plates 8.23 / 7.54', C('nu_duct_lam', 'circle', 1, 'q') === 4.36 && C('nu_duct_lam', 'circle', 1, 'T') === 3.66 &&
  C('fre_duct_lam', 'circle', 1) === 64 && C('nu_duct_lam', 'rectangle', 1, 'q') === 3.61 && C('nu_duct_lam', 'rectangle', 1, 'T') === 2.98 && C('fre_duct_lam', 'rectangle', 1) === 57 && C('nu_duct_lam', 'plates', 1, 'q') === 8.23);
ok('Table 8.1: linear between b/a = 3 and 4', near(C('nu_duct_lam', 'rectangle', 3.5, 'T'), (3.96 + 4.44) / 2, 1e-14));
ok('Table 8.2: annulus Di/Do = 0.25, inner 7.37, outer 4.23', C('nu_annulus_lam', 0.25, 'inner') === 7.37 && C('nu_annulus_lam', 0.25, 'outer') === 4.23);
ok('Table 7.8: C2 for 6 staggered rows interpolated between 5 and 7', near(C('nu_tubebank', 5e4, 0.7, 0.7, 'staggered', 1.5, 6) / C('nu_tubebank', 5e4, 0.7, 0.7, 'staggered', 1.5), (0.92 + 0.95) / 2, 1e-12));
ok('Table 7.2 bands: Hilpert at Re = 100 uses C = 0.683, m = 0.466', near(C('nu_hilpert', 100, 1), 0.683 * 100 ** 0.466, 1e-14));
// 7. In equations: solved backward from the default guess, no warning on the way; a warning when the solution is outside
let s = solve(`Nu = nu_dittusboelter(Re, 0.7, 'heating')\nNu = 100`);
ok('solved for Re from the default guess (Re = 1 on the way), no warning', Math.abs(s.Re - (100 / (0.023 * 0.7 ** 0.4)) ** 1.25) < 1e-6 * s.Re && warns().length === 0, [s.Re, warns()]);
s = solve(`Nu = nu_dittusboelter(Re, 0.7, 'heating')\nNu = 20`);
ok('a solution outside the range gives one warning', warns().length === 1 && /nu_dittusboelter\(\): Re = [\d.]+ is below 10000, the limit of its range \(Eq\. 8\.60\)/.test(warns()[0]), warns());
s = solve(`function h = h_cyl(Re, Pr, k, D)\n  h = nu_churchillbernstein(Re, Pr)*k/D\nend\nh1 = h_cyl(6071, 0.70, 0.030, 0.0127)`);
ok('in a user function: Ex. 7.4 h = 96.0 W/(m2 K)', Math.abs(s.h1 - 96.0) < 0.05, s.h1);
messages([
  ['arguments', err(`x = nu_gnielinski(1e4)`), /nu_gnielinski\(Re, Pr, f\) takes 2 to 3 arguments, got 1/],
  ['text', err(`x = nu_dittusboelter(2e4, 0.7, heating)\nheating = 1`), /mode must be text in quotes/],
  ['mode', err(`x = nu_dittusboelter(2e4, 0.7, 'hot')`), /'hot' should be one of 'heating', 'cooling'/],
  ['negative', err(`x = nu_plate_lam(-5, 0.7)`), /Re_L = -5 must be positive/],
  ['name', err(`function y = nu_hilpert(x)\n  y = x\nend`), /already a built-in name/],
]);
// 8. Check Units: dimensionless arguments, dimensionless result; h = Nu k/D comes out in W/(m^2 K)
let u = units(`k = 0.03 [W/(m K)]\nD = 0.0127 [m]\nRe = 6071\nh = nu_churchillbernstein(Re, 0.7)*k/D\nV = 10 [m/s]\nbad = nu_hilpert(V, 0.7)`);
ok('Check Units: h in W/(m^2 K)', u.p.variables.get('h').inferredUnit === 'W/(m^2 K)', u.p.variables.get('h').inferredUnit);
ok('Check Units: a velocity as Re is flagged', u.issues.some(i => /nu_hilpert\(\) takes dimensionless arguments but got \[m\/s\]/.test(i)), u.issues);
ok(`${Object.keys(E.CORRELATIONS).length} correlations, each with its source`, Object.values(E.CORRELATIONS).every(c => c.eq && c.d && c.group));
done();
