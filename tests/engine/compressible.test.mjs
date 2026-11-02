// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Compressible flow: the k = 1.4 values of the usual tables (Cengel and Boles A-32 to A-35, NACA Report 1135), the
// conservation laws across a normal shock, the differential forms of Fanno flow and the Prandtl-Meyer function, the
// theta-beta-M relation, round trips through every inverse on both branches for three k, messages and Check.
import { E, run, err, units } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const DEG = Math.PI / 180;

// 1. Tabulated values, k = 1.4, to the four or five figures printed
const TAB = [
  ['isentropic', 2, { 'T/T0': 0.5556, 'P/P0': 0.1278, 'rho/rho0': 0.2300, 'A/A*': 1.6875, 'M*': 1.6330 }],
  ['isentropic', 0.5, { 'T/T0': 0.9524, 'P/P0': 0.8430, 'rho/rho0': 0.8852, 'A/A*': 1.3398, 'M*': 0.5345 }],
  ['normalshock', 2, { 'M2': 0.5774, 'P2/P1': 4.5000, 'T2/T1': 1.6875, 'rho2/rho1': 2.6667, 'P02/P01': 0.7209, 'P02/P1': 5.6404 }],
  ['normalshock', 3, { 'M2': 0.4752, 'P2/P1': 10.333, 'T2/T1': 2.6790, 'rho2/rho1': 3.8571, 'P02/P01': 0.3283, 'P02/P1': 12.061 }],
  ['fanno', 2, { 'T/T*': 0.6667, 'P/P*': 0.4082, 'rho/rho*': 0.6124, 'V/V*': 1.6330, 'P0/P0*': 1.6875, 'fL*/D': 0.3050 }],
  ['fanno', 0.5, { 'T/T*': 1.1429, 'P/P*': 2.1381, 'rho/rho*': 1.8708, 'V/V*': 0.5345, 'P0/P0*': 1.3398, 'fL*/D': 1.0691 }],
  ['rayleigh', 2, { 'T/T*': 0.5289, 'P/P*': 0.3636, 'rho/rho*': 0.6875, 'V/V*': 1.4545, 'T0/T0*': 0.7934, 'P0/P0*': 1.5031 }],
  ['rayleigh', 0.5, { 'T/T*': 0.7901, 'P/P*': 1.7778, 'rho/rho*': 2.2500, 'V/V*': 0.4444, 'T0/T0*': 0.6914, 'P0/P0*': 1.1141 }],
];
let worst = 0;
for (const [fn, M, vals] of TAB) for (const [r, b] of Object.entries(vals)) {
  const x = C(fn, r, M, 1.4), e = Math.abs(x - b) / (0.5e-4 * Math.max(1, 10 ** Math.floor(Math.log10(Math.abs(b)))));   // in half units of the last printed digit
  worst = Math.max(worst, e); if (e > 1.001) note('off', fn, r, M, x, b);
}
ok('tables, k = 1.4: 47 values at M = 0.5, 2 and 3, each within half a unit of its last printed digit', worst <= 1.001, worst);
ok('Prandtl-Meyer: nu(2) = 26.380 deg, nu(3) = 49.757 deg, nu_max = 130.45 deg', near(C('prandtlmeyer', 2, 1.4) / DEG, 26.380, 2e-5) && near(C('prandtlmeyer', 3, 1.4) / DEG, 49.757, 2e-5) && near(C('prandtlmeyer', 1e9, 1.4) / DEG, 130.454, 1e-5));
ok('oblique shock M1 = 2, theta = 10 deg: beta = 39.31 deg (weak), 83.70 deg (strong), theta_max = 22.97 deg',
  near(C('obliqueshock', 'beta', 2, 'theta', 10 * DEG, 1.4) / DEG, 39.314, 2e-5) && near(C('obliqueshock', 'beta', 2, 'theta', 10 * DEG, 1.4, 'strong') / DEG, 83.700, 2e-5) &&
  near(C('obliqueshock', 'theta_max', 2, 'theta', 0, 1.4) / DEG, 22.97, 2.2e-4));

// 2. Normal shock: mass, momentum and energy conserved, and P02/P01 from the isentropic ratios on each side
for (const k of [1.4, 1.3, 5 / 3]) for (const M1 of [1, 1.2, 2.5, 10]) {
  const s = (r) => C('normalshock', r, M1, k), M2 = s('M2'), iso = (r, M) => C('isentropic', r, M, k);
  const mass = s('rho2/rho1') * (M2 * Math.sqrt(s('T2/T1'))) / M1;                       // rho2 V2/(rho1 V1)
  const mom = s('P2/P1') * (1 + k * M2 * M2) / (1 + k * M1 * M1);                          // (P2 + rho2 V2^2)/(P1 + rho1 V1^2)
  const en = s('T2/T1') * iso('T/T0', M1, k) / iso('T/T0', M2, k);                         // T02/T01
  const p0 = s('P2/P1') * iso('P/P0', M1, k) / iso('P/P0', M2, k);
  ok(`normal shock k = ${+k.toFixed(3)}, M1 = ${M1}: mass, momentum, energy, P02/P01, P02/P1`, near(mass, 1, 1e-12) && near(mom, 1, 1e-12) && near(en, 1, 1e-12) && near(p0, s('P02/P01'), 1e-12) &&
    near(s('P02/P1'), s('P2/P1') / iso('P/P0', M2, k), 1e-12), [mass, mom, en, p0]);
}

// 3. Differential forms: Fanno d(fL*/D)/dM, Prandtl-Meyer dnu/dM; star ratios against stagnation ratios
for (const k of [1.4, 1.3]) for (const M of [0.3, 0.8, 1.5, 4]) {
  const h = 1e-6 * M, f = (m) => C('fanno', 'fL*/D', m, k), y = 1 + (k - 1) / 2 * M * M;
  ok(`Fanno k = ${k}, M = ${M}: d(fL*/D)/dM = -2 (1 - M^2)/(k M^3 (1 + (k-1)/2 M^2))`, near((f(M + h) - f(M - h)) / (2 * h), -2 * (1 - M * M) / (k * M ** 3 * y), 1e-7));
  const Ts = (r) => C('rayleigh', r, M, k);
  ok(`Rayleigh k = ${k}, M = ${M}: T0/T0* and P0/P0* from T/T* and P/P* and the stagnation ratios`, near(Ts('T0/T0*'), Ts('T/T*') * y / ((k + 1) / 2), 1e-12) &&
    near(Ts('P0/P0*'), Ts('P/P*') * C('isentropic', 'P/P0', 1, k) / C('isentropic', 'P/P0', M, k), 1e-12));
  ok(`Fanno k = ${k}, M = ${M}: P0/P0* = P/P* (P0/P)/(P0*/P*), equal to A/A*`, near(C('fanno', 'P0/P0*', M, k), C('fanno', 'P/P*', M, k) * C('isentropic', 'P/P0', 1, k) / C('isentropic', 'P/P0', M, k), 1e-12) &&
    near(C('fanno', 'P0/P0*', M, k), C('isentropic', 'A/A*', M, k), 1e-12));
  if (M > 1) { const g = (m) => C('prandtlmeyer', m, k);
    ok(`Prandtl-Meyer k = ${k}, M = ${M}: dnu/dM = sqrt(M^2 - 1)/(M (1 + (k-1)/2 M^2))`, near((g(M + h) - g(M - h)) / (2 * h), Math.sqrt(M * M - 1) / (M * y), 1e-7)); }
}

// 4. Oblique shocks: theta-beta-M, the normal components, the maximum deflection, weak and strong
for (const k of [1.4, 1.3]) for (const [M1, th] of [[1.5, 5], [2, 10], [3, 20], [5, 30]]) {
  const o = (r, b) => b ? C('obliqueshock', r, M1, 'theta', th * DEG, k, b) : C('obliqueshock', r, M1, 'theta', th * DEG, k);
  const bw = o('beta'), bs = o('beta', 'strong'), tmax = o('theta_max');
  const tb = (b) => Math.atan(2 / Math.tan(b) * (M1 * M1 * Math.sin(b) ** 2 - 1) / (M1 * M1 * (k + Math.cos(2 * b)) + 2));
  let scan = 0; for (let b = Math.asin(1 / M1); b < Math.PI / 2; b += 1e-5) scan = Math.max(scan, tb(b));
  ok(`oblique k = ${k}, M1 = ${M1}, theta = ${th} deg: both betas satisfy theta-beta-M; weak < strong; theta_max by a scan`,
    near(tb(bw), th * DEG, 1e-12) && near(tb(bs), th * DEG, 1e-12) && bw < bs && near(tmax, scan, 1e-8), [bw / DEG, bs / DEG, tmax / DEG, scan / DEG]);
  ok(`  normal components: Mn1 = M1 sin(beta), Mn2 = M2 sin(beta - theta), the normal shock on Mn1; weak M2 > 1 here, strong M2 < 1`,
    near(o('Mn1'), M1 * Math.sin(bw), 1e-12) && near(o('Mn2'), o('M2') * Math.sin(bw - th * DEG), 1e-12) && near(o('Mn2'), C('normalshock', 'M2', o('Mn1'), k), 1e-12) &&
    near(o('P2/P1'), C('normalshock', 'P2/P1', M1 * Math.sin(bw), k), 1e-12) && o('M2') > 1 && o('M2', 'strong') < 1);
  ok(`  given beta: theta and M2 come back`, near(C('obliqueshock', 'theta', M1, 'beta', bw, k), th * DEG, 1e-10) && near(C('obliqueshock', 'M2', M1, 'beta', bs, k), o('M2', 'strong'), 1e-9));
}
ok('limits: theta = 0 gives the Mach wave (weak) and the normal shock (strong)', near(C('obliqueshock', 'beta', 2, 'theta', 0, 1.4), Math.asin(0.5), 1e-12) &&
  near(C('obliqueshock', 'beta', 2, 'theta', 0, 1.4, 'strong'), Math.PI / 2, 1e-12) && near(C('obliqueshock', 'M2', 2, 'theta', 0, 1.4, 'strong'), C('normalshock', 'M2', 2, 1.4), 1e-12));

// 5. Every inverse, both branches, three k: M -> ratio -> M
const INV = { isentropic: ['T/T0', 'P/P0', 'rho/rho0', 'A/A*', 'M*'], fanno: ['T/T*', 'P/P*', 'rho/rho*', 'V/V*', 'P0/P0*', 'fL*/D'], rayleigh: ['P/P*', 'rho/rho*', 'V/V*', 'T0/T0*', 'P0/P0*'] };
const BR = { 'A/A*': 1, 'P0/P0*': 1, 'fL*/D': 1, 'T0/T0*': 1 };
let worstInv = 0, count = 0;
for (const k of [1.4, 1.3, 5 / 3]) for (const [fn, list] of Object.entries(INV)) for (const r of list) for (const M of [0.02, 0.3, 0.7, 0.99, 1.01, 1.5, 3, 8]) {
  if (fn === 'rayleigh' && M > 5 && r === 'T0/T0*') continue;   // flat at large M: the ratio no longer fixes M to 1e-8
  const x = C(fn, r, M, k), b = M < 1 ? 'subsonic' : 'supersonic';
  const back = BR[r] ? C(fn + '_mach', r, x, k, b) : C(fn + '_mach', r, x, k);
  worstInv = Math.max(worstInv, Math.abs(back / M - 1)); count++;
}
for (const k of [1.4, 1.3, 5 / 3]) for (const M of [1, 1.01, 2, 5, 20]) {
  for (const r of ['M2', 'P2/P1', 'T2/T1', 'rho2/rho1', 'P02/P01', 'P02/P1']) { if (M === 1 && r === 'P02/P01') continue; /* 1 - P02/P01 grows as (M1 - 1)^3: M1 = 1 is fixed only to 1e-5 */ worstInv = Math.max(worstInv, Math.abs(C('normalshock_mach', r, C('normalshock', r, M, k), k) - M) / M); count++; }
  worstInv = Math.max(worstInv, Math.abs(C('prandtlmeyer_mach', C('prandtlmeyer', M, k), k) - M) / M); count++;
}
note('inverse round trips:', count, 'worst relative error', worstInv);
ok(`${count} round trips through the inverse functions within 1e-8`, worstInv < 1e-8, worstInv);
ok('the branch decides: A/A* = 1.6875 gives M = 2 supersonic and 0.3722 subsonic', near(C('isentropic_mach', 'A/A*', 1.6875, 1.4, 'supersonic'), 2, 1e-12) && near(C('isentropic_mach', 'A/A*', 1.6875, 1.4, 'subsonic'), 0.37224, 1e-4));

// 6. In equations: solved forward and backward, names ignore case and spaces
let st = run(`k = 1.4\nAr = isentropic('A / a*', M, k)\nAr = 2`, { M: 3 }).st;
ok('solved backward from a supersonic guess: M = 2.1972', near(st.M, 2.19719, 1e-5), st.M);
st = run(`M = isentropic_mach('A/A*', 2, 1.4, 'Subsonic')`).st;
ok('the inverse, from the default guess: M = 0.30590 (subsonic, as asked)', near(st.M, 0.305904, 1e-5), st.M);

messages([
  ['branch', err(`z = isentropic_mach('A/A*', 2, 1.4)`), /isentropic_mach\(\): A\/A\* has a subsonic and a supersonic solution: add 'subsonic' or 'supersonic'/],
  ['reach', err(`z = fanno_mach('fL*/D', 0.9, 1.4, 'supersonic')`), /fanno_mach\(\): fL\*\/D = 0\.9 cannot be reached; supersonic flow covers 0 to 0\.82151/],
  ['A<1', err(`z = isentropic_mach('A/A*', 0.5, 1.4, 'subsonic')`), /A\/A\* = 0\.5 cannot be reached; subsonic flow covers 1 to infinity$/],
  ['TT*', err(`z = rayleigh_mach('T/T*', 1.02, 1.4)`), /rayleigh_mach\(\): M cannot be found from T\/T\*: it is not single-valued in subsonic flow/],
  ['M1<1', err(`z = normalshock('M2', 0.8, 1.4)`), /normalshock\(\): M1 = 0\.8 must be at least 1/],
  ['k', err(`z = isentropic('T/T0', 2, 1)`), /isentropic\(\): k = 1 must be above 1/],
  ['name', err(`z = fanno('L/D', 2, 1.4)`), /fanno\(\): 'L\/D' should be one of 'T\/T\*', 'P\/P\*', 'rho\/rho\*', 'V\/V\*', 'P0\/P0\*', 'fL\*\/D'/],
  ['A at 0', err(`z = isentropic('A/A*', 0, 1.4)`), /isentropic\(\): A\/A\* is infinite at M = 0/],
  ['detach', err(`z = obliqueshock('M2', 2, 'theta', 30*pi/180, 1.4)`), /obliqueshock\(\): theta = 30 deg is above the largest deflection for M1 = 2, theta_max = 22\.974 deg: the shock detaches/],
  ['beta', err(`z = obliqueshock('M2', 2, 'beta', 20*pi/180, 1.4)`), /beta = 20 deg must be between the Mach angle asin\(1\/M1\) = 30 deg and 90 deg/],
  ['b+weak', err(`z = obliqueshock('M2', 2, 'beta', 40*pi/180, 1.4, 'weak')`), /'weak' or 'strong' applies to a given deflection theta/],
  ['pm M<1', err(`z = prandtlmeyer(0.5, 1.4)`), /prandtlmeyer\(\): M = 0\.5 must be at least 1/],
]);

// 7. Check: angles tagged in degrees pass as dimensionless; a dimensional argument is flagged
const u = units(`k = 1.4\nM_1 = 2\ntheta = 10 [deg]\nbeta = obliqueshock('beta', M_1, 'theta', theta, k) [deg]\nnu = prandtlmeyer(M_1, k) [deg]\nT = 300 [K]\nbad = isentropic('T/T0', T, k)`);
ok('Check: [deg] angles accepted, a temperature as M flagged', u.issues.length === 1 && /isentropic\(\) takes dimensionless arguments but got \[K\]/.test(u.issues[0]), u.issues);
// 8. Particles mixed into the flow (Ruiz, 2000): the paper's results
const P = (r, M1, ML, ms, b) => b ? C('particleflow', r, M1, ML, ms, 1.4, b) : C('particleflow', r, M1, ML, ms, 1.4);
ok('particles at the gas speed (ML = M1): M2 = M1 (1 + ms)^(1/2), T2 = T1, no entropy change (Eqs. 16-18)', near(P('M2', 0.8, 0.8, 0.3), 0.8 * Math.sqrt(1.3), 1e-12) && near(P('T2/T1', 0.8, 0.8, 0.3), 1, 1e-12) && Math.abs(P('ds/R', 0.8, 0.8, 0.3)) < 1e-12);
ok('choking at ML = M1 when ms = 1/M1^2 - 1', near(P('ms_choke', 0.8, 0.8, 0), 1 / 0.64 - 1, 1e-7));
ok('the subsonic and supersonic M2 are conjugate across a normal shock (Eq. 13), separated by its entropy rise (Eq. 15)', (() => {
  const a = P('M2', 0.8, 0.5, 0.05), b = P('M2', 0.8, 0.5, 0.05, 'supersonic'), k = 1.4;
  const dsShock = k / (k - 1) * Math.log(C('normalshock', 'T2/T1', b, k)) - Math.log(C('normalshock', 'P2/P1', b, k));
  return near(C('normalshock', 'M2', b, k), a, 1e-12) && near(P('ds/R', 0.8, 0.5, 0.05) - P('ds/R', 0.8, 0.5, 0.05, 'supersonic'), dsShock, 1e-10); })());
ok('M1 = 0.8: no choking for ML from 0.8 to 7.0 (Fig. 4), choking below and above', [0.85, 2, 5, 7].every(ML => { try { P('ms_choke', 0.8, ML, 0); return false; } catch (e) { return true; } }) &&
  P('ms_choke', 0.8, 0.6, 0) > 0 && P('ms_choke', 0.8, 7.2, 0) > 0);
ok('at ms_choke, M2 = 1; momentum and energy hold', (() => { const ms = P('ms_choke', 0.8, 0.6, 0), k = 1.4, M1 = 0.8, ML = 0.6, u = P('V2/V1', M1, ML, ms), th = P('T2/T1', M1, ML, ms);
  return near(P('M2', M1, ML, ms), 1, 1e-6) && near(1 + k * M1 * M1 * (1 + ms * ML / M1), th / u + k * M1 * M1 * (1 + ms) * u, 1e-12) && near(1 + (k - 1) / 2 * (M1 * M1 + ms * ML * ML), th + (k - 1) / 2 * M1 * M1 * (1 + ms) * u * u, 1e-12); })());
ok('particleflow_ms: back to the loading for M2, T2/T1 and P2/P1; M2 = 1 gives the choking loading', [['M2', 0.8, 0.5], ['T2/T1', 0.6, 0.3], ['P2/P1', 0.8, 0.4]].every(([r, M1, ML]) => {
  const ms = 0.6 * P('ms_choke', M1, ML, 0); return near(C('particleflow_ms', r, P(r, M1, ML, ms), M1, ML, 1.4), ms, 1e-9); }) && near(C('particleflow_ms', 'M2', 1, 0.8, 0.5, 1.4), P('ms_choke', 0.8, 0.5, 0), 1e-9));
ok('particleflow_ms without choking (ML = 2 > M1, M2 falls as ms grows): M2 = 0.6 found', (() => { const ms = C('particleflow_ms', 'M2', 0.6, 0.8, 2, 1.4); return near(P('M2', 0.8, 2, ms), 0.6, 1e-10); })());
messages([['reach', err(`z = particleflow_ms('M2', 0.7, 0.8, 0.5, 1.4)`), /particleflow_ms\(\): no ms gives M2 = 0\.7; from ms = 0 to the choking ms = 0\.087491 it covers 0\.8 to 1/]]);
messages([['choked', err(`z = particleflow('M2', 0.8, 0.5, 0.2, 1.4)`), /particleflow\(\): no solution: the particles choke the flow \(M2 = 1 at ms = 0\.087491\)/]]);
done();
