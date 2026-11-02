// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Conduction beyond the 1D series: shape factors (Table 4.1), the dimensionless heat rates of Table 5.2, and the product
// solutions for multidimensional transients (the help's rules). Book examples, a finite-difference solution of Laplace's
// equation, explicit finite differences for the constant-flux transient, the series against theta_transient, and the
// approximations printed in Table 5.2.
import { E, run, err, units, logs } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const rel = (a, b) => Math.abs(a / b - 1);
const warns = () => logs.filter(l => /^WARN: /.test(l));

// 1. Shape factors (Table 4.1)
ok('eccentric wire coating (Sec. 4.3 example): R\' = 1/(S k) = 0.91 m K/W', Math.abs(1 / (C('sf_eccentric', 0.046, 0.005, 0.010, 1) * 0.35) - 0.91) < 0.005);
ok('square block with a centered hole (flux-plot comparison): S = 8.59 m', Math.abs(C('sf_cylinder_square', 0.25, 1, 2) - 8.59) < 0.005);
ok('eccentric cylinders with z = 0 reduce to concentric: 2 pi L/ln(D/d)', near(C('sf_eccentric', 0.1, 0.02, 0, 1), 2 * Math.PI / Math.log(5), 1e-12));
ok('buried cylinder: the book\'s approximation ln(4z/D) for z > 3D/2 is 1.65 % off acosh(2z/D) at z = 3D/2 and 0.1 % at z = 5D', Math.abs(Math.log(6) / Math.acosh(3) - 1 - 0.01646) < 1e-4 && rel(C('sf_cylinder_buried', 0.1, 0.5, 10), 2 * Math.PI * 10 / Math.log(20)) < 1e-3);
ok('two cylinders: equal cylinders far apart tend to pi L/ln(2w/D)', rel(C('sf_two_cylinders', 0.01, 0.01, 10, 1000), Math.PI * 1000 / Math.log(2 * 10 / 0.01)) < 1e-6);
ok('square channel: the two forms of case 11 differ by 0.5 % at W/w = 1.4', rel(C('sf_square_channel', 1.399999, 1, 1), C('sf_square_channel', 1.400001, 1, 1)) < 6e-3);
// Laplace's equation on the square channel cross-section (5-point finite differences, SOR, two grids and Richardson)
const channel = (N, wi) => {   // outer side 1 at T = 0, inner square of side wi (on grid lines) at T = 1; S per unit length
  const T = Array.from({ length: N + 1 }, () => new Float64Array(N + 1)), a = Math.round((1 - wi) / 2 * N), b = N - a;
  const fixed = (i, j) => i === 0 || j === 0 || i === N || j === N || (i >= a && i <= b && j >= a && j <= b);
  for (let i = a; i <= b; i++) for (let j = a; j <= b; j++) T[i][j] = 1;
  const om = 2 / (1 + Math.sin(Math.PI / N));
  for (let it = 0; it < 20000; it++) { let d = 0;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) { if (fixed(i, j)) continue; const nv = (T[i + 1][j] + T[i - 1][j] + T[i][j + 1] + T[i][j - 1]) / 4, dd = om * (nv - T[i][j]); T[i][j] += dd; d = Math.max(d, Math.abs(dd)); }
    if (d < 1e-12) break; }
  let q = 0; for (let k = 1; k < N; k++) q += T[1][k] + T[N - 1][k] + T[k][1] + T[k][N - 1];   // heat into the outer wall, per k and per unit length
  return q;
};
// The re-entrant corners make the error fall as h^1.36 (observed on 40 to 320 nodes): extrapolate with that order.
// Case 11 of the book is 3 to 4 % above the converged solution (W/w = 2: 10.567 against 10.234 per unit length).
for (const [N, wi, lo, hi] of [[80, 0.5, 0.025, 0.04], [120, 1 / 3, 0.03, 0.05]]) {
  const s1 = channel(N, wi), s2 = channel(2 * N, wi), r = 2 ** 1.36, S = s2 + (s2 - s1) / (r - 1), Sb = C('sf_square_channel', 1, wi, 1);
  ok(`square channel W/w = ${(1 / wi).toFixed(0)}: Table 4.1 gives ${Sb.toFixed(3)} per unit length, ${((Sb / S - 1) * 100).toFixed(1)} % above a finite-difference solution (${S.toFixed(3)})`, Sb / S - 1 > lo && Sb / S - 1 < hi, [S, Sb]);
}
logs.length = 0; run(`S = sf_cylinder_buried(0.5, 1, 1)`);
ok('a short cylinder (L < 4D) gets a warning', warns().length === 1 && /not much larger/.test(warns()[0]), warns());
ok('qss_star: sphere 1, disk 0.900, rectangle 0.932, cuboid 0.956 at d/D = 1 (Table 4.1b)', C('qss_star', 'sphere') === 1 && Math.abs(C('qss_star', 'disk') - 0.900) < 5e-4 && C('qss_star', 'rectangle') === 0.932 && C('qss_star', 'cuboid', 1) === 0.956);

// 2. Table 5.2: the series against theta_transient (Dirichlet limit, Bi = 1e8) and against explicit finite differences
for (const [g, k] of [['wall', 0], ['cylinder', 1], ['sphere', 2]]) for (const Fo of [0.05, 0.5]) {
  const th = (x) => C('theta_transient', g, 1e8, Fo, x), d = 1e-4, grad = (3 * th(1) - 4 * th(1 - d) + th(1 - 2 * d)) / (2 * d);
  ok(`qstar_ts('${g}', ${Fo}) equals the surface gradient of theta_transient with Bi -> infinity`, rel(C('qstar_ts', g, Fo), -grad) < 1e-6, [C('qstar_ts', g, Fo), -grad]);
}
// constant flux into a wall (half-thickness 1, symmetric at x = 0), explicit finite differences; q* = 1/theta_s
{ const N = 200, h = 1 / N, dt = 0.4 * h * h; let T = new Float64Array(N + 1), t = 0; const out = {};
  for (const Fo of [0.05, 0.5]) { while (t < Fo - 1e-12) { const Tn = new Float64Array(N + 1);
      for (let i = 1; i < N; i++) Tn[i] = T[i] + dt / (h * h) * (T[i + 1] - 2 * T[i] + T[i - 1]);
      Tn[0] = T[0] + dt / (h * h) * 2 * (T[1] - T[0]); Tn[N] = T[N] + dt / (h * h) * 2 * (T[N - 1] - T[N] + h); T = Tn; t += dt; }
    out[Fo] = T[N]; }
  ok('qstar_qs(wall) equals 1/theta_s from a finite-difference solution with constant flux (Fo = 0.05, 0.5; 0.3 %)', [0.05, 0.5].every(Fo => rel(C('qstar_qs', 'wall', Fo), 1 / out[Fo]) < 3e-3), [0.05, 0.5].map(Fo => [C('qstar_qs', 'wall', Fo), 1 / out[Fo]])); }
ok('limits: interior constant flux -> semi-infinite at small Fo; exterior sphere -> 1 (steady) at large Fo',
  ['wall', 'cylinder', 'sphere'].every(g => rel(C('qstar_qs', g, 1e-6), 0.5 * Math.sqrt(Math.PI / 1e-6)) < 2e-3) && Math.abs(C('qstar_qs', 'sphere_exterior', 1e6) - 1) < 1e-3);
// the approximations printed in Table 5.2, against the exact functions
const z1 = { wall: Math.PI / 2, cylinder: 2.4048, sphere: Math.PI };
const apT = { wall: (F) => F < 0.2 ? 1 / Math.sqrt(Math.PI * F) : 2 * Math.exp(-(z1.wall ** 2) * F), cylinder: (F) => F < 0.2 ? 1 / Math.sqrt(Math.PI * F) - 0.5 - 0.65 * F : 2 * Math.exp(-(z1.cylinder ** 2) * F),
  sphere: (F) => F < 0.2 ? 1 / Math.sqrt(Math.PI * F) - 1 : 2 * Math.exp(-(z1.sphere ** 2) * F) };
const apQ = { wall: (F) => F < 0.2 ? 0.5 * Math.sqrt(Math.PI / F) : 1 / (F + 1 / 3), cylinder: (F) => F < 0.2 ? 0.5 * Math.sqrt(Math.PI / F) - Math.PI / 8 : 1 / (2 * F + 1 / 4),
  sphere: (F) => F < 0.2 ? 0.5 * Math.sqrt(Math.PI / F) - Math.PI / 4 : 1 / (3 * F + 1 / 5), sphere_exterior: (F) => F < 0.2 ? 0.5 * Math.sqrt(Math.PI / F) + Math.PI / 4 : 0.77 / Math.sqrt(F) + 1 };
let worst = 0, at = null;
for (const F of [0.001, 0.01, 0.05, 0.1, 0.19, 0.2, 0.3, 0.5, 1]) {
  for (const g of ['wall', 'cylinder', 'sphere']) { const d = rel(apT[g](F), C('qstar_ts', g, F)); if (d > worst) { worst = d; at = ['T', g, F]; } }
  for (const g of Object.keys(apQ)) { const d = rel(apQ[g](F), C('qstar_qs', g, F)); if (d > worst) { worst = d; at = ['q', g, F]; } }
}
ok(`the approximations of Table 5.2 are within 6 % of the exact functions (worst ${(worst * 100).toFixed(2)} %, ${at}, where the two approximations meet)`, worst < 0.06);

// 3. Product solutions (the help's rules): a short cylinder is a wall times a cylinder; Q/Q_o by Langston's rule
{ const Bi1 = 2, Bi2 = 3, Fo1 = 0.4, Fo2 = 0.25;
  let I = 0; const n = 200;   // volume average of theta_wall(x) theta_cyl(r) over 0 <= x, r <= 1 (weight 2r), Simpson
  const w = (j) => (j === 0 || j === n ? 1 : j % 2 ? 4 : 2);
  const tw = Array.from({ length: n + 1 }, (_, j) => C('theta_transient', 'wall', Bi1, Fo1, j / n)), tc = Array.from({ length: n + 1 }, (_, j) => C('theta_transient', 'cylinder', Bi2, Fo2, j / n));
  for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) I += w(a) * w(b) * tw[a] * tc[b] * 2 * (b / n);
  I /= (3 * n) ** 2;
  const Q1 = C('q_q0_transient', 'wall', Bi1, Fo1), Q2 = C('q_q0_transient', 'cylinder', Bi2, Fo2);
  ok('short cylinder: 1 - (volume mean of the product) = (Q/Q_o)_1 + (Q/Q_o)_2 [1 - (Q/Q_o)_1] (Langston)', Math.abs(1 - I - (Q1 + Q2 * (1 - Q1))) < 1e-8, [1 - I, Q1 + Q2 * (1 - Q1)]); }

messages([
  ['overlap', err(`S = sf_two_cylinders(0.1, 0.1, 0.05, 1)`), /the cylinders overlap/],
  ['inside', err(`S = sf_eccentric(0.1, 0.05, 0.03, 1)`), /must lie inside/],
  ['needs q_ss', err(`q = qstar_ts('shape_exterior', 0.1)`), /needs q_ss/],
  ['cuboid', err(`q = qss_star('cuboid')`), /needs d_D/],
]);
let u = units(`D = 0.1 [m]\nz = 1 [m]\nL = 10 [m]\nS = sf_cylinder_buried(D, z, L)\nk = 1.2 [W/(m K)]\ndT = 50 [K]\nq = S*k*dT\nT = 300 [K]\nbad = sf_disk(T)`);
ok('Check Units: shape factors in m, q = S k dT in W, a temperature for a length flagged', u.p.variables.get('S').inferredUnit === 'm' && u.issues.some(i => /sf_disk\(\) expects \[m\] for D but got \[K\]/.test(i)), [u.p.variables.get('S').inferredUnit, u.issues]);
done();
