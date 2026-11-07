// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Fins, transient conduction, radiation and the special functions (correlations.js): published tables (Incropera's
// Tables 5.1 and 12.1, Abramowitz and Stegun values), and checks independent of the formulas: identities, direct
// numerical integration of the fin equations and of Planck's law, the heat equation and its boundary condition,
// crossed strings and area integrals for view factors.
import { E, run, err, units, logs } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const rel = (a, b) => Math.abs(a / b - 1);
const warns = () => logs.filter(l => /^WARN: /.test(l));

// 1. Special functions: Abramowitz and Stegun (Tables 9.1, 9.8, 7.1) to their 10 digits, and identities
const AS = [['besselj', 0, 1, 0.7651976866], ['besselj', 1, 1, 0.4400505857], ['besselj', 0, 10, -0.2459357645], ['besselj', 2, 5, 0.0465651163],
  ['besseli', 0, 1, 1.266065878], ['besseli', 1, 2, 1.590636855], ['besseli', 2, 2, 0.6889484477], ['besseli', 0, 10, 2815.716628],
  ['besselk', 0, 1, 0.4210244382], ['besselk', 1, 1, 0.6019072302], ['besselk', 0, 0.1, 2.427069025], ['besselk', 1, 5, 0.004044613445]];
ok('Bessel functions: 12 values of Abramowitz and Stegun to 1e-9 relative', AS.every(([f, n, x, v]) => rel(C(f, n, x), v) < 1e-9), AS.map(([f, n, x, v]) => rel(C(f, n, x), v)));
ok('Wronskian I_n K_(n+1) + I_(n+1) K_n = 1/x (n = 0, 1; x = 0.01 to 50)', [0.01, 0.3, 1, 7, 50].every(x => [0, 1].every(n => rel(C('besseli', n, x) * C('besselk', n + 1, x) + C('besseli', n + 1, x) * C('besselk', n, x), 1 / x) < 1e-12)));
ok('recurrence J_(n-1) + J_(n+1) = (2n/x) J_n (n = 1 to 3, x = 0.5 to 30)', [0.5, 3, 12, 30].every(x => [1, 2, 3].every(n => Math.abs(C('besselj', n - 1, x) + C('besselj', n + 1, x) - 2 * n / x * C('besselj', n, x)) < 1e-14)));
ok('erfc: erfc(3) = 2.209049700e-5 (A&S 7.1), erfc(x) + erfc(-x) = 2, and 1 - erf where both are accurate', rel(C('erfc', 3), 2.209049700e-5) < 1e-9 && near(C('erfc', 0.7) + C('erfc', -0.7), 2, 1e-15) &&
  [0.1, 0.5, 1, 1.5].every(x => Math.abs(C('erfc', x) - (1 - run(`y = erf(${x})`).st.y)) < 1e-14));

// 2. Radiation: Table 12.1 (61 rows); three misprints; the F column of the book drifts high by up to 5e-5 in the tail
//    (its 1 - F at 100000 um K is 9.5e-5; the series, and a direct integration below, give 1.45e-4)
const T121 = [[200, 0, 0], [400, 0, 0], [600, 0, 0.000014], [800, 0.000016, 0.001372], [1000, 0.000321, 0.016406], [1200, 0.002134, 0.072534], [1400, 0.007790, 0.186082],
  [1600, 0.019718, 0.344904], [1800, 0.039341, 0.519949], [2000, 0.066728, 0.683123], [2200, 0.100888, 0.816329], [2400, 0.140256, 0.912155], [2600, 0.183120, 0.970891],
  [2800, 0.227897, 0.997123], [2898, 0.250108, 1], [3000, 0.273232, 0.997143], [3200, 0.318102, 0.977373], [3400, 0.361735, 0.943551], [3600, 0.403607, 0.900429],
  [3800, 0.443382, 0.851737], [4000, 0.480877, 0.800291], [4200, 0.516014, 0.748139], [4400, 0.548796, 0.696720], [4600, 0.579280, 0.647004], [4800, 0.607559, 0.599610],
  [5000, 0.633747, 0.554898], [5200, 0.658970, 0.513043], [5400, 0.680360, 0.474092], [5600, 0.701046, 0.438002], [5800, 0.720158, 0.404671], [6000, 0.737818, 0.373965],
  [6200, 0.754140, 0.345724], [6400, 0.769234, 0.319783], [6600, 0.783199, 0.295973], [6800, 0.796129, 0.274128], [7000, 0.808109, 0.254090], [7200, 0.819217, 0.235708],
  [7400, 0.829527, 0.218842], [7600, 0.839102, 0.203360], [7800, 0.848005, 0.189143], [8000, 0.856288, 0.176079], [8500, 0.874608, 0.147819], [9000, 0.890029, 0.124801],
  [9500, 0.903085, 0.105956], [10000, 0.914199, 0.090442], [10500, 0.923710, 0.077600], [11000, 0.931890, 0.066913], [11500, 0.939959, 0.057970], [12000, 0.945098, 0.050448],
  [13000, 0.955139, 0.038689], [14000, 0.962898, 0.030131], [15000, 0.969981, 0.023794], [16000, 0.973814, 0.019026], [18000, 0.980860, 0.012574], [20000, 0.985602, 0.008629],
  [25000, 0.992215, 0.003828], [30000, 0.995340, 0.001945], [40000, 0.997967, 0.000656], [50000, 0.998953, 0.000279], [75000, 0.999713, 0.000058], [100000, 0.999905, 0.000019]];
const MIS = { 5200: 0.657947, 11500: 0.938915, 15000: 0.968934 };   // printed 0.658970, 0.939959, 0.969981: digit slips
const lmax = 2897.771955e-6;
const badF = T121.filter(([lT, F]) => Math.abs(C('f_blackbody', lT * 1e-6, 1) - (MIS[lT] !== undefined ? C('f_blackbody', lT * 1e-6, 1) : F)) > 5.5e-5);
ok('f_blackbody: the 58 correctly printed F values of Table 12.1 within 5.5e-5', T121.length === 61 && badF.length === 0, badF);
ok('f_blackbody: the three misprinted F values (5200, 11500, 15000 um K) differ by about 1e-3', Object.keys(MIS).every(k => Math.abs(C('f_blackbody', k * 1e-6, 1) - T121.find(r => r[0] === +k)[1]) > 9e-4 && Math.abs(C('f_blackbody', k * 1e-6, 1) - MIS[k]) < 1e-6));
ok('eb_lambda: the I/I_max column of Table 12.1 within 3e-5 (61 rows)', T121.every(([lT, , r]) => Math.abs(C('eb_lambda', lT * 1e-6, 1) / C('eb_lambda', lmax, 1) - r) < 3e-5));
// direct integration of Planck's law (Simpson in x = C2/(lambda T), 20000 intervals)
const c2 = 6.62607015e-34 * 299792458 / 1.380649e-23, planckF = (lT) => {
  const z = c2 / lT, n = 20000, h = (60 - z) / n, g = (x) => x ** 3 / Math.expm1(x); let s = g(z) + g(60);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * g(z + k * h);
  return 15 / Math.PI ** 4 * s * h / 3;
};
ok('f_blackbody agrees with a direct integration of Planck\'s law to 1e-10 (lambda T = 500 to 1e6 um K)', [500, 2898, 1e4, 1e5, 1e6].every(lT => Math.abs(C('f_blackbody', lT * 1e-6, 1) - planckF(lT * 1e-6)) < 1e-10));
let sig = 0; { const T = 1500, n = 200000, a = 1e-8, b = 1e-2, h = (b - a) / n; for (let k = 0; k <= n; k++) sig += (k === 0 || k === n ? 1 : k % 2 ? 4 : 2) * C('eb_lambda', a + k * h, T); sig *= h / 3 / T ** 4; }
ok('eb_lambda integrates to sigma T^4 (sigma = 5.670374e-8)', rel(sig, 5.670374419e-8) < 1e-5, sig);
ok('eb_lambda is largest at lambda T = 2897.77 um K (Wien)', C('eb_lambda', lmax, 1) > C('eb_lambda', lmax * 1.0001, 1) && C('eb_lambda', lmax, 1) > C('eb_lambda', lmax * 0.9999, 1));
ok('lambda_blackbody inverts f_blackbody (F = 1e-6 to 0.999999, T = 300 and 6000 K)', [1e-6, 0.1, 0.5, 0.9, 0.999999].every(F => [300, 6000].every(T => Math.abs(C('f_blackbody', C('lambda_blackbody', F, T), T) - F) < 1e-12 * Math.max(1, 1 / F) * F + 1e-15)));
let s = run(`T = 2000 [K]\nlambda_1 = 1 [um]\nF = f_blackbody(lambda_1, T)\nf_blackbody(lambda_2, T) = 0.1`, { lambda_2: 1e-6 }).st;
ok('Ex. 12.3: 10 % of the emission at 2000 K lies below 1.10 um (lambda T = 2195 um K)', Math.abs(s.lambda_2 * 1e6 - 1.10) < 0.005, s.lambda_2);

// 3. View factors: published special values, crossed strings (2D), area integrals (3D)
ok('perpendicular plates, equal widths: 1 - 2^(1/2)/2 = 0.2929; inclined at 90 degrees the same', near(C('vf_perpendicular_plates', 1), 1 - Math.SQRT1_2, 1e-15) && near(C('vf_inclined_plates', 90), 1 - Math.SQRT1_2, 1e-15));
ok('three-sided enclosure, equilateral: 0.5', C('vf_three_sided', 1, 1) === 0.5);
// Hottel's crossed strings: F_ij = (sum of crossed - sum of uncrossed)/(2 w_i)
const cs = (Wi, Wj) => { const a = Wi / 2, b = Wj / 2; return (2 * Math.hypot(a + b, 1) - 2 * Math.hypot(b - a, 1)) / (2 * Wi); };
ok('vf_parallel_plates equals crossed strings (W_i, W_j = 1, 3 and 2, 0.5)', near(C('vf_parallel_plates', 1, 3), cs(1, 3), 1e-14) && near(C('vf_parallel_plates', 2, 0.5), cs(2, 0.5), 1e-14));
// parallel cylinders by crossed strings around the cylinders (Hottel): F_12 = [2 (crossed belt) - 2 (uncrossed belt)]/(2 pi r_i)
const cyl = (ri, rj, s) => {
  const d = ri + rj + s, cross = 2 * (Math.sqrt(d * d - (ri + rj) ** 2) + ri * (Math.PI / 2 + Math.asin((ri + rj) / d)) + rj * (Math.PI / 2 + Math.asin((ri + rj) / d)));
  const a = Math.asin((rj - ri) / d), unc = 2 * Math.sqrt(d * d - (rj - ri) ** 2) + ri * (Math.PI - 2 * a) + rj * (Math.PI + 2 * a);
  return (cross - unc) / (2 * 2 * Math.PI * ri);
};
ok('vf_parallel_cylinders equals crossed strings (R = 1, S = 1; R = 2.5, S = 0.4)', near(C('vf_parallel_cylinders', 1, 1), cyl(1, 1, 1), 1e-12) && near(C('vf_parallel_cylinders', 2.5, 0.4), cyl(1, 2.5, 0.4), 1e-12), [C('vf_parallel_cylinders', 1, 1), cyl(1, 1, 1)]);
// plane strip to cylinder: area integral of the cylinder's angular extent (r/(L^2 + s^2) along the strip)
{ let q = 0; const n = 2000, s1 = 2, s2 = -1, h = (s1 - s2) / n; for (let k = 0; k < n; k++) { const x = s2 + (k + 0.5) * h; q += 0.5 / (1 + x * x) * h; }
  ok('vf_cylinder_rectangle equals the integral of r L/(L^2 + s^2) over the strip', rel(C('vf_cylinder_rectangle', 0.5, 2, -1), q / (s1 - s2)) < 1e-6); }
ok('vf_plane_cylinders: touching cylinders (D = s) see all of the plane: 1', near(C('vf_plane_cylinders', 1), 1, 1e-15));
// 3D: Gauss-Legendre over both surfaces, F_ij = (1/A_i) int int cos cos/(pi S^2) dA_i dA_j
const GL = (n) => { const x = [], w = []; for (let i = 1; i <= n; i++) { let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp; for (let k = 0; k < 100; k++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = n * (z * p1 - p2) / (z * z - 1); const dz = p1 / pp; z -= dz; if (Math.abs(dz) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return [x, w]; };
const [gx, gw] = GL(16);
const quad4 = (f, X, Y, U, V) => { let s = 0; for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let c = 0; c < 16; c++) for (let d = 0; d < 16; d++)
  s += gw[a] * gw[b] * gw[c] * gw[d] * f((gx[a] + 1) * X / 2, (gx[b] + 1) * Y / 2, (gx[c] + 1) * U / 2, (gx[d] + 1) * V / 2); return s * X * Y * U * V / 16; };
const Fal = quad4((x1, y1, x2, y2) => 1 / (Math.PI * ((x1 - x2) ** 2 + (y1 - y2) ** 2 + 1) ** 2), 2, 0.5, 2, 0.5) / 1;
ok(`vf_aligned_rectangles(2, 0.5) = ${C('vf_aligned_rectangles', 2, 0.5).toFixed(6)} equals the area integral (${Fal.toFixed(6)})`, rel(C('vf_aligned_rectangles', 2, 0.5), Fal) < 1e-6);
ok('aligned squares X = Y = L: 0.1998 (Fig. 13.4)', Math.abs(C('vf_aligned_rectangles', 1, 1) - 0.1998) < 5e-5);
// perpendicular, common edge along x (length 1): i in z = 0 (x, y), j in y = 0 (x, z); the integrand y z/(pi S^4) integrated
// exactly over x1 and x2, then by the midpoint rule over y and z (n = 800 and 1600, Richardson)
const inner = (c) => { const r = Math.sqrt(c), A = (d) => d / (2 * c * (d * d + c)) + Math.atan(d / r) / (2 * c * r), B = (d) => -1 / (2 * (d * d + c)); return 2 * ((A(1) - A(0)) - (B(1) - B(0))); };
const Fpm = (W, H, n) => { let s = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const y = (i + 0.5) / n * W, z = (j + 0.5) / n * H; s += y * z / Math.PI * inner(y * y + z * z) * (W / n) * (H / n); } return s / W; };
const Fpp = (W, H) => 2 * Fpm(W, H, 1600) - Fpm(W, H, 800);
ok(`vf_perpendicular_rectangles(1.5, 0.7) = ${C('vf_perpendicular_rectangles', 1.5, 0.7).toFixed(5)} equals the area integral (${Fpp(1.5, 0.7).toFixed(5)})`, Math.abs(C('vf_perpendicular_rectangles', 1.5, 0.7) - Fpp(1.5, 0.7)) < 2e-5);
ok('perpendicular squares: 0.2000 (Fig. 13.6)', Math.abs(C('vf_perpendicular_rectangles', 1, 1) - 0.2000) < 5e-5);
{ let q = 0; const n = 400, Ri = 0.8, Rj = 1.3;   // coaxial disks: point on disk i at radius r sees disk j: (1/2)[1 + (Rj^2 - r^2 - 1)/sqrt((1 + Rj^2 + r^2)^2 - 4 r^2 Rj^2)]... averaged over disk i
  for (let k = 0; k < n; k++) { const r = (k + 0.5) / n * Ri, Fp = 0.5 * (1 - (1 + r * r - Rj * Rj) / Math.sqrt((1 + r * r + Rj * Rj) ** 2 - 4 * r * r * Rj * Rj)); q += Fp * 2 * r * (Ri / n); }
  ok('vf_coaxial_disks equals the area average of the point-to-disk view factor', rel(C('vf_coaxial_disks', 0.8, 1.3), q / (Ri * Ri)) < 1e-5, [C('vf_coaxial_disks', 0.8, 1.3), q / (Ri * Ri)]); }
ok('reciprocity: coaxial disks A_i F_ij = A_j F_ji', near(0.8 ** 2 * C('vf_coaxial_disks', 0.8, 1.3), 1.3 ** 2 * C('vf_coaxial_disks', 1.3, 0.8), 1e-13));

// 4. Fins: direct integration of theta'' = (mL)^2 theta on [0, 1] (RK4, shooting on theta'(0)), heat rate -theta'(0)/(mL)
const finODE = (mL, tip, p) => {
  const shoot = (d0) => { let th = 1, d = d0; const n = 4000, h = 1 / n; for (let k = 0; k < n; k++) {
    const f = (a, b) => [b, mL * mL * a]; const k1 = f(th, d), k2 = f(th + h / 2 * k1[0], d + h / 2 * k1[1]), k3 = f(th + h / 2 * k2[0], d + h / 2 * k2[1]), k4 = f(th + h * k3[0], d + h * k3[1]);
    th += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); d += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); } return [th, d]; };
  const res = (d0) => { const [th, d] = shoot(d0); return tip === 'convection' ? d + p * mL * th : tip === 'adiabatic' ? d : th - p; };
  const r0 = res(0), r1 = res(-1), d0 = r0 / (r1 - r0);   // the residual is linear in d0
  return [-d0 / mL, shoot(d0)[0]];
};
for (const [tip, mL, p] of [['convection', 1.2, 0.3], ['adiabatic', 0.8, 0], ['temperature', 1.5, 0.4]]) {
  const [q, thL] = finODE(mL, tip, p);
  ok(`fin_q and fin_theta('${tip}', ${mL}${p ? ', p = ' + p : ''}) agree with a direct integration`, rel(C('fin_q', tip, mL, p), q) < 1e-10 && Math.abs(C('fin_theta', tip, mL, 1, p) - thL) < 1e-10, [C('fin_q', tip, mL, p), q]);
}
ok('fins: no overflow at mL = 1000 (adiabatic tip, theta at x/L = 0.001 = exp(-1))', Math.abs(C('fin_theta', 'adiabatic', 1000, 0.001) - Math.exp(-1)) < 1e-12 && C('fin_q', 'temperature', 1000, 0.5) === 1);
// annular fin: (r theta')' = m^2 r theta, theta(r1) = 1, theta'(r2c) = 0; eta = -2 r1 theta'(r1)/(m^2 (r2c^2 - r1^2)); in units of r1
const annODE = (a, R) => {
  const shoot = (d0) => { let th = 1, d = d0, r = 1; const n = 20000, h = (R - 1) / n; const f = (r, x, y) => [y, a * a * x - y / r];
    for (let k = 0; k < n; k++) { const k1 = f(r, th, d), k2 = f(r + h / 2, th + h / 2 * k1[0], d + h / 2 * k1[1]), k3 = f(r + h / 2, th + h / 2 * k2[0], d + h / 2 * k2[1]), k4 = f(r + h, th + h * k3[0], d + h * k3[1]);
      th += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); d += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); r += h; } return d; };
  const r0 = shoot(0), r1 = shoot(-1), d0 = r0 / (r1 - r0);
  return -2 * d0 / (a * a * (R * R - 1));
};
for (const [a, R] of [[0.2367, 1.92], [1, 3], [0.5, 1.2]]) ok(`eta_fin_annular(${a}, ${R}) agrees with a direct integration`, rel(C('eta_fin_annular', a, R), annODE(a, R)) < 1e-9, [C('eta_fin_annular', a, R), annODE(a, R)]);
ok('eta_fin_annular, Ex. 3.9 (m r1 = 0.237, r2c/r1 = 1.92): 0.979; the book reads 0.95 from Fig. 3.19', Math.abs(C('eta_fin_annular', 0.025 * Math.sqrt(100 / (186 * 0.006)), 1.92) - 0.979) < 1e-3);
ok('eta_fin: rectangular tanh(mL)/mL; triangular I1(2)/I0(2) = 0.69777 at mL = 1; all tend to 1 as mL -> 0',
  near(C('eta_fin', 'pin', 2), Math.tanh(2) / 2, 1e-15) && Math.abs(C('eta_fin', 'straight_triangular', 1) - 0.697775) < 1e-6 &&
  ['straight_rectangular', 'pin', 'straight_triangular', 'straight_parabolic', 'pin_triangular', 'pin_parabolic'].every(sh => Math.abs(C('eta_fin', sh, 1e-4) - 1) < 1e-7));
// straight triangular fin by direct integration: profile thickness t x/L from the tip, (x theta')' = (mL)^2 L theta / (L)... in x/L: (x theta')' = (mL)^2 theta
{ const mL = 1.3; let th, d;   // regular at the tip: series start theta = c (1 + (mL)^2 x + ...), integrate to x = 1 and scale
  th = 1; d = mL * mL; let x = 1e-6; th = 1 + mL * mL * x; d = mL * mL * (1 + mL * mL * x / 2); const n = 20000, h = (1 - x) / n; const f = (x, a, b) => [b, (mL * mL * a - b) / x];
  for (let k = 0; k < n; k++) { const k1 = f(x, th, d), k2 = f(x + h / 2, th + h / 2 * k1[0], d + h / 2 * k1[1]), k3 = f(x + h / 2, th + h / 2 * k2[0], d + h / 2 * k2[1]), k4 = f(x + h, th + h * k3[0], d + h * k3[1]);
    th += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); d += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); x += h; }
  ok('eta_fin straight_triangular agrees with a direct integration of (x theta\')\' = (mL)^2 theta', rel(C('eta_fin', 'straight_triangular', mL), d / th / (mL * mL)) < 1e-7, [C('eta_fin', 'straight_triangular', mL), d / th / (mL * mL)]); }

// 5. Transient conduction: Table 5.1 (35 finite Bi rows; one misprint), Ex. 5.4, and the heat equation itself
const T51 = [[0.01, 0.0998, 1.0017, 0.1412, 1.0025, 0.1730, 1.0030], [0.02, 0.1410, 1.0033, 0.1995, 1.0050, 0.2445, 1.0060], [0.03, 0.1723, 1.0049, 0.2440, 1.0075, 0.2991, 1.0090],
  [0.04, 0.1987, 1.0066, 0.2814, 1.0099, 0.3450, 1.0120], [0.05, 0.2218, 1.0082, 0.3143, 1.0124, 0.3854, 1.0149], [0.06, 0.2425, 1.0098, 0.3438, 1.0148, 0.4217, 1.0179],
  [0.07, 0.2615, 1.0114, 0.3709, 1.0173, 0.4551, 1.0209], [0.08, 0.2791, 1.0130, 0.3960, 1.0197, 0.4860, 1.0239], [0.09, 0.2956, 1.0145, 0.4195, 1.0222, 0.5150, 1.0268],
  [0.10, 0.3111, 1.0161, 0.4417, 1.0246, 0.5423, 1.0298], [0.15, 0.3779, 1.0237, 0.5376, 1.0365, 0.6609, 1.0445], [0.20, 0.4328, 1.0311, 0.6170, 1.0483, 0.7593, 1.0592],
  [0.25, 0.4801, 1.0382, 0.6856, 1.0598, 0.8447, 1.0737], [0.30, 0.5218, 1.0450, 0.7465, 1.0712, 0.9208, 1.0880], [0.4, 0.5932, 1.0580, 0.8516, 1.0932, 1.0528, 1.1164],
  [0.5, 0.6533, 1.0701, 0.9408, 1.1143, 1.1656, 1.1441], [0.6, 0.7051, 1.0814, 1.0184, 1.1345, 1.2644, 1.1713], [0.7, 0.7506, 1.0919, 1.0873, 1.1539, 1.3525, 1.1978],
  [0.8, 0.7910, 1.1016, 1.1490, 1.1724, 1.4320, 1.2236], [0.9, 0.8274, 1.1107, 1.2048, 1.1902, 1.5044, 1.2488], [1.0, 0.8603, 1.1191, 1.2558, 1.2071, 1.5708, 1.2732],
  [2.0, 1.0769, 1.1785, 1.5994, 1.3384, 2.0288, 1.4793], [3.0, 1.1925, 1.2102, 1.7887, 1.4191, 2.2889, 1.6227], [4.0, 1.2646, 1.2287, 1.9081, 1.4698, 2.4556, 1.7202],
  [5.0, 1.3138, 1.2402, 1.9898, 1.5029, 2.5704, 1.7870], [6.0, 1.3496, 1.2479, 2.0490, 1.5253, 2.6537, 1.8338], [7.0, 1.3766, 1.2532, 2.0937, 1.5411, 2.7165, 1.8673],
  [8.0, 1.3978, 1.2570, 2.1286, 1.5526, 1.7654, 1.8920], [9.0, 1.4149, 1.2598, 2.1566, 1.5611, 2.8044, 1.9106], [10.0, 1.4289, 1.2620, 2.1795, 1.5677, 2.8363, 1.9249],
  [20.0, 1.4961, 1.2699, 2.2881, 1.5919, 2.9857, 1.9781], [30.0, 1.5202, 1.2717, 2.3261, 1.5973, 3.0372, 1.9898], [40.0, 1.5325, 1.2723, 2.3455, 1.5993, 3.0632, 1.9942],
  [50.0, 1.5400, 1.2727, 2.3572, 1.6002, 3.0788, 1.9962], [100.0, 1.5552, 1.2731, 2.3809, 1.6015, 3.1102, 1.9990]];
const bad51 = [];
for (const [Bi, ...v] of T51) ['wall', 'cylinder', 'sphere'].forEach((g, k) => {
  const z = C('zeta_n', g, Bi), c = C('c_n', g, Bi);
  if (!(Bi === 8 && g === 'sphere') && (Math.abs(z - v[2 * k]) > 1e-4 || Math.abs(c - v[2 * k + 1]) > 1e-4)) bad51.push([Bi, g, z, c]);
});
ok('zeta_n and c_n: the 104 correctly printed entries of Table 5.1 within one unit of their 4th decimal', bad51.length === 0, bad51);
ok('Table 5.1 misprint: sphere, Bi = 8, zeta_1 is 2.7654, printed 1.7654', Math.abs(C('zeta_n', 'sphere', 8) - 2.7654) < 5e-5);
ok('eigenvalues satisfy their equations (n = 1 to 20, Bi = 0.05, 3, 200)', [0.05, 3, 200].every(Bi => [1, 2, 7, 20].every(n => {
  const zw = C('zeta_n', 'wall', Bi, n), zc = C('zeta_n', 'cylinder', Bi, n), zs = C('zeta_n', 'sphere', Bi, n);
  return Math.abs(zw * Math.tan(zw) - Bi) < 1e-9 * Bi && Math.abs(zc * C('besselj', 1, zc) / C('besselj', 0, zc) - Bi) < 1e-8 * Bi && Math.abs(1 - zs / Math.tan(zs) - Bi) < 1e-9 * Math.max(Bi, 1)
    && zw > (n - 1) * Math.PI && zw < (n - 0.5) * Math.PI && zs > (n - 1) * Math.PI && zs < n * Math.PI;
})));
ok('Ex. 5.4 (wall, Bi = 0.313, Fo = 5.64): the book, with zeta_1 and C_1 interpolated in Table 5.1, finds theta_o = 0.214 and Q/Q_o = 0.80; the series gives 0.2123 and 0.7976',
  Math.abs(C('theta_transient', 'wall', 0.313, 5.64, 0) - 0.2123) < 1e-4 && Math.abs(C('q_q0_transient', 'wall', 0.313, 5.64) - 0.7976) < 1e-4);
// the heat equation d(theta)/dFo = (1/x^k) d/dx (x^k d(theta)/dx), k = 0, 1, 2, and the boundary condition -d(theta)/dx = Bi theta at x = 1
for (const [g, k] of [['wall', 0], ['cylinder', 1], ['sphere', 2]]) {
  const th = (Fo, x) => C('theta_transient', g, 2, Fo, x), Fo = 0.05, x = 0.6, d = 1e-3, e = 1e-4;
  const dt = (th(Fo + e, x) - th(Fo - e, x)) / (2 * e), lap = (th(Fo, x + d) - 2 * th(Fo, x) + th(Fo, x - d)) / (d * d) + k / x * (th(Fo, x + d) - th(Fo, x - d)) / (2 * d);
  const bc = -(3 * th(Fo, 1) - 4 * th(Fo, 1 - d) + th(Fo, 1 - 2 * d)) / (2 * d) - 2 * th(Fo, 1);
  ok(`theta_transient('${g}', Bi = 2, Fo = 0.05) satisfies the heat equation and the convection condition`, Math.abs(dt - lap) < 1e-5 && Math.abs(bc) < 1e-5, [dt, lap, bc]);
  // Q/Q_o = 1 - (k + 1) int_0^1 theta x^k dx
  let I = 0; const n = 2000; for (let j = 0; j <= n; j++) { const xx = j / n; I += (j === 0 || j === n ? 1 : j % 2 ? 4 : 2) * th(0.3, xx) * xx ** k; }
  ok(`q_q0_transient('${g}') equals 1 minus the mean of theta`, Math.abs(C('q_q0_transient', g, 2, 0.3) - (1 - (k + 1) * I / (3 * n))) < 1e-10);
}
ok('Fo > 0.2: the one-term form of the book is within 2 % of the series (Bi 0.1 to 50)', ['wall', 'cylinder', 'sphere'].every(g => [0.1, 1, 10, 50].every(Bi => {
  const one = C('c_n', g, Bi) * Math.exp(-(C('zeta_n', g, Bi) ** 2) * 0.2); return rel(one, C('theta_transient', g, Bi, 0.2, 0)) < 0.02; })));
ok('small Fo: the wall agrees with the semi-infinite solid with convection (Bi = 5, Fo = 1e-3, near the surface)',
  Math.abs((1 - C('theta_transient', 'wall', 5, 1e-3, 0.95)) - C('theta_semiinf', 'convection', 0.05 / (2 * Math.sqrt(1e-3)), 5 * Math.sqrt(1e-3))) < 1e-9);
ok('Bi -> 0: lumped capacitance, theta = exp(-Bi Fo) (wall, Bi = 1e-4)', rel(C('theta_transient', 'wall', 1e-4, 300, 0.5), Math.exp(-1e-4 * 300)) < 1e-4);
ok('Fo = 0: theta = 1, Q = 0', C('theta_transient', 'sphere', 1, 0, 0.5) === 1 && C('q_q0_transient', 'cylinder', 1, 0) === 0);
logs.length = 0; run(`x = theta_transient('wall', 1, 1e-7, 0.5)`);
ok('very small Fo: a warning to use the semi-infinite solid', warns().length === 1 && /too small for 400 terms/.test(warns()[0]), warns());
// semi-infinite solid
const sb = (eta, beta) => C('theta_semiinf', 'convection', eta, beta);
ok('theta_semiinf convection: the surface condition d(theta)/d(eta) = -2 beta (1 - theta) at eta = 0, and beta -> infinity gives erfc',
  Math.abs((-3 * sb(0, 0.7) + 4 * sb(1e-5, 0.7) - sb(2e-5, 0.7)) / 2e-5 + 2 * 0.7 * (1 - sb(0, 0.7))) < 1e-8 && Math.abs(sb(0.4, 1e8) - C('erfc', 0.4)) < 1e-7);
ok('theta_semiinf: temperature case erf(eta); flux case at the surface 2/sqrt(pi)', near(C('theta_semiinf', 'temperature', 0.3), 1 - C('erfc', 0.3), 1e-15) && near(C('theta_semiinf', 'flux', 0), 2 / Math.sqrt(Math.PI), 1e-15));
messages([
  ['F range', err(`x = lambda_blackbody(1, 300)`), /F = 1 must be between 0 and 1/],
  ['geometry', err(`x = zeta_n('slab', 1)`), /'slab' should be one of 'wall', 'cylinder', 'sphere'/],
  ['n', err(`x = zeta_n('wall', 1, 1.5)`), /n = 1.5 should be a positive integer/],
  ['beta', err(`x = theta_semiinf('convection', 0.5)`), /needs beta/],
  ['triangle', err(`x = vf_three_sided(1, 3)`), /cannot form a triangle/],
  ['order', err(`x = besselj(0.5, 1)`), /order n must be an integer/],
]);
let u = units(`T = 1500 [K]\nlambda = 3 [um]\nF = f_blackbody(lambda, T)\nE = eb_lambda(lambda, T)\nbad = f_blackbody(T, lambda)`);
ok('Check Units: f_blackbody dimensionless, eb_lambda in W/m^3, swapped arguments flagged', u.p.variables.get('F').inferredUnit === '-' || u.p.variables.get('F').inferredUnit === '' ? u.p.variables.get('E').inferredUnit === 'W/m^3' && u.issues.some(i => /f_blackbody\(\) expects \[m\] for lambda but got \[K\]/.test(i)) : false,
  [u.p.variables.get('F').inferredUnit, u.p.variables.get('E').inferredUnit, u.issues]);
done();
