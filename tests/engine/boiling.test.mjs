// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Boiling and condensation correlations (correlations.js): values computed in Incropera's worked examples (Ch. 10),
// the implicit and piecewise forms checked against their own equations, tables, warnings, messages, Check Units.
import { E, run, err, units, logs } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const warns = () => logs.filter(l => /^WARN: /.test(l));
const solve = (t, g) => { logs.length = 0; return run(t, g).st; };
const rel = (a, b) => Math.abs(a / b - 1);
const g = 9.8;   // the book's examples use 9.8 m/s^2

// 1. Book examples (water at 1 atm unless noted)
const ex1 = [279e-6, 2257e3, 957.9, 0.5956, 58.9e-3, 4217, 1.76];
ok('q_rohsenow, Ex. 10.1: 836 kW/m^2 (polished copper, DeltaT_e = 18 K)',
  Math.abs(C('q_rohsenow', 18, ...ex1, C('csf_rohsenow', 'water_copper_polished'), C('n_rohsenow', 'water_copper_polished'), g) / 1e3 - 836) < 0.5);
ok('q_max_zuber, Ex. 10.1: 1.26 MW/m^2', Math.abs(C('q_max_zuber', 2257e3, 957.9, 0.5956, 58.9e-3, 0.149, g) / 1e6 - 1.26) < 0.005);
ok('q_max_zuber: C defaults to 0.149', C('q_max_zuber', 2257e3, 957.9, 0.5956, 58.9e-3) === C('q_max_zuber', 2257e3, 957.9, 0.5956, 58.9e-3, 0.149, 9.80665));
ok('q_min_zuber, Ex. 10.1 comment: 18.9 kW/m^2', Math.abs(C('q_min_zuber', 2257e3, 957.9, 0.5956, 58.9e-3, g) / 1e3 - 18.9) < 0.05);
const hfgfb = C('hfg_corrected', 2257e3, 1980, 155, 'film_boiling');
ok('h_film_boiling, Ex. 10.2: h_conv = 238 W/(m^2 K)', Math.abs(C('h_film_boiling', 'cylinder', 0.006, 155, 0.0299, 0.4902, 15.25e-6, 957.9, hfgfb, g) - 238) < 0.5);
ok('h_bromley, Ex. 10.2: 254.1 W/(m^2 K) from 238 and 21.3', Math.abs(C('h_bromley', 238, 21.3) - 254.1) < 0.05, C('h_bromley', 238, 21.3));
ok("hfg_corrected, Ex. 10.3: 2400 kJ/kg; Ex. 10.4: 2455 kJ/kg", Math.abs(C('hfg_corrected', 2257e3, 4193, 50, 'condensation') / 1e3 - 2400) < 0.5 &&
  Math.abs(C('hfg_corrected', 2373e3, 4178, 29, 'condensation') / 1e3 - 2455) < 0.5);
const h3 = C('h_cond_vert', 1, 50, 975, 0.668, 375e-6, 2.4, 2.4e6, g), Re3 = 4 * h3 * 1 * 50 / (375e-6 * 2.4e6);
ok('h_cond_vert, Ex. 10.3: Re_delta = 1177 (wavy), h = 5300 W/(m^2 K)', Math.abs(Re3 - 1177) < 1 && Math.abs(h3 - 5300) < 5, [Re3, h3]);
ok('h_cond_tube, Ex. 10.4: 5194 W/(m^2 K) for a tier of N = 20', Math.abs(C('h_cond_tube', 0.006, 29, 992, 0.098, 0.631, 663e-6, 2.455e6, 20, g) - 5194) < 0.5);
// 2. Checks against the equations themselves
for (const [hc, hr] of [[238, 21.3], [100, 300], [50, 0]]) {
  const h = C('h_bromley', hc, hr);
  ok(`h_bromley(${hc}, ${hr}) satisfies Eq. 10.9`, Math.abs(h ** (4 / 3) - hc ** (4 / 3) - hr * h ** (1 / 3)) < 1e-10 * h ** (4 / 3), h);
}
ok('h_bromley close to Eq. 10.10 when h_rad << h_conv', rel(C('h_bromley', 500, 10), 500 + 0.75 * 10) < 1e-3);
ok('h_cond_tube with N = 1 is h_D times N^(1/4) of the tier', rel(C('h_cond_tube', 0.01, 10, 960, 0.6, 0.68, 3e-4, 2.3e6) / C('h_cond_tube', 0.01, 10, 960, 0.6, 0.68, 3e-4, 2.3e6, 16), 2) < 1e-12);
ok('h_cond_sphere / h_cond_tube / h_chato = 0.826 / 0.729 / 0.555', near(C('h_cond_sphere', 0.01, 10, 960, 0.6, 0.68, 3e-4, 2.3e6) / C('h_cond_tube', 0.01, 10, 960, 0.6, 0.68, 3e-4, 2.3e6), 0.826 / 0.729, 1e-12) &&
  near(C('h_chato', 0.01, 10, 960, 0.6, 0.68, 3e-4, 2.3e6) / C('h_cond_tube', 0.01, 10, 960, 0.6, 0.68, 3e-4, 2.3e6), 0.555 / 0.729, 1e-12));
// h_cond_vert: the Re it finds satisfies the modified-Nusselt correlation of its regime (Eqs. 10.38 to 10.40) with Eq. 10.41,
// to 0.5 %: the book rounds the constants of Eqs. 10.42 to 10.44 (3.78, 3.70, 0.069), which come from them
const props = [960, 0.68, 3e-4, 1.8, 2.3e6];
for (const [L, dT, eq] of [[0.02, 2, '10.38'], [0.5, 30, '10.39'], [3, 60, '10.40']]) {
  const h = C('h_cond_vert', L, dT, ...props), [rl, k, mu, Pr, hfgp] = props, Re = 4 * h * L * dT / (mu * hfgp), s = k / Math.pow((mu / rl) ** 2 / 9.80665, 1 / 3);
  const want = eq === '10.38' ? 1.47 * Re ** (-1 / 3) * s : eq === '10.39' ? Re / (1.08 * Re ** 1.22 - 5.2) * s : Re / (8750 + 58 * Pr ** -0.5 * (Re ** 0.75 - 253)) * s;
  const inRange = eq === '10.38' ? Re <= 30 : eq === '10.39' ? Re > 30 && Re <= 1800 : Re > 1800;
  ok(`h_cond_vert, L = ${L}, DeltaT = ${dT}: Re_delta = ${Re.toFixed(0)} in the range of Eq. ${eq}, and h satisfies it (0.5 %)`, inRange && rel(h, want) < 5e-3, [Re, h, want]);
}
ok('h_cond_vert in the wave-free range is within 2 % of h_cond_plate (rho_v << rho_l)', rel(C('h_cond_vert', 0.02, 2, ...props), C('h_cond_plate', 0.02, 2, 960, 0, 0.68, 3e-4, 2.3e6)) < 0.02);
// Kandlikar: the larger of 10.15a and 10.15b; stratification below Fr = 0.04
const kd = (X, fF) => { const r = 957.9 / 0.5956, Bo = (1e5 / (300 * 2257e3)) ** 0.7 * (1 - X) ** 0.8;
  return 1000 * Math.max(0.6683 * r ** 0.1 * X ** 0.16 * (1 - X) ** 0.64 * fF + 1058 * Bo, 1.136 * r ** 0.45 * X ** 0.72 * (1 - X) ** 0.08 * fF + 667.2 * Bo); };
ok('h_kandlikar: vertical tube, X = 0.05 and 0.5', [0.05, 0.5].every(X => near(C('h_kandlikar', 1000, X, 957.9, 0.5956, 1e5, 300, 2257e3, 1), kd(X, 1), 1e-12)));
ok('h_kandlikar: horizontal, Fr = 0.01 uses f = 2.63 Fr^0.3; Fr = 0.1 uses 1', near(C('h_kandlikar', 1000, 0.3, 957.9, 0.5956, 1e5, 300, 2257e3, 1, 0.01), kd(0.3, 2.63 * 0.01 ** 0.3), 1e-12) &&
  near(C('h_kandlikar', 1000, 0.3, 957.9, 0.5956, 1e5, 300, 2257e3, 1, 0.1), kd(0.3, 1), 1e-12));
// Lienhard and Eichhorn: low velocity at small V (large q/(rho_v h_fg V)), high velocity at large V
const lh = (V) => C('q_max_lienhard', V, 0.01, 2257e3, 957.9, 0.5956, 58.9e-3) / (0.5956 * 2257e3 * V), r = 957.9 / 0.5956, We = (V) => 0.5956 * V * V * 0.01 / 58.9e-3;
ok('q_max_lienhard: low-velocity form (Eq. 10.12) at V = 0.02 m/s', near(lh(0.02), (1 + (4 / We(0.02)) ** (1 / 3)) / Math.PI, 1e-12) && lh(0.02) > 0.275 / Math.PI * Math.sqrt(r) + 1);
ok('q_max_lienhard: high-velocity form (Eq. 10.13) at V = 5 m/s', near(lh(5), r ** 0.75 / (169 * Math.PI) + Math.sqrt(r) / (19.2 * Math.PI * We(5) ** (1 / 3)), 1e-12));
// 3. Tables
ok('Table 10.1: C_sf and n', C('csf_rohsenow', 'water_brass') === 0.0060 && C('csf_rohsenow', 'ethanol_chromium') === 0.0027 && C('n_rohsenow', 'pentane_copper_lapped') === 1.7 && C('n_rohsenow', 'water_platinum') === 1.0);
ok('Table 10.2: G_sf', C('gsf_kandlikar', 'R134a') === 1.63 && C('gsf_kandlikar', 'kerosene') === 0.488 && C('gsf_kandlikar', 'stainless') === 1);
ok('h_dropwise: 51104 + 2044 T (degC) up to 100 degC, 255510 above', near(C('h_dropwise', 323.15), 51104 + 2044 * 50, 1e-12) && C('h_dropwise', 400) === 255510);
// 4. In equations: SI arguments from unit tags; solved backward; warnings at the solution
let s = solve(`q = q_rohsenow(DeltaT_e, 279e-6, 2257e3, 957.9, 0.5956, 58.9e-3, 4217, 1.76, 0.0128, 1, 9.8)\nq = 5e5 [W/m^2]`);
ok('q_rohsenow solved backward for DeltaT_e: 18 (836/500)^(-1/3) K', rel(s.DeltaT_e, 18 * (5e5 / 836145.6) ** (1 / 3)) < 1e-6 && warns().length === 0, s.DeltaT_e);
s = solve(`h = h_dropwise(T)\nT = 15 [degC]`);
ok('h_dropwise below 22 degC: one warning', warns().length === 1 && /T_sat = 15 degC is below 22 degC/.test(warns()[0]), warns());
s = solve(`h = h_cond_plate(1, 50, 975, 0.596, 0.668, 375e-6, 2.4e6)`);
ok('h_cond_plate in the Ex. 10.3 setting: Re_delta = 910 (the book\'s comment), a warning pointing to h_cond_vert', warns().length === 1 && /Re_delta = 909.9 is above 30.*h_cond_vert/.test(warns()[0]), warns());
s = solve(`T_s = 25 [degC]\nT_sat = 54 [degC]\nh_fg = 2373 [kJ/kg]\ncp_l = 4.178 [kJ/(kg K)]\nD = 6 [mm]\nhfg_p = hfg_corrected(h_fg, cp_l, T_sat - T_s, 'condensation')\nh = h_cond_tube(D, T_sat - T_s, 992, 0.098, 0.631, 663e-6, hfg_p, 20, 9.8)`);
ok('tagged units arrive in SI (mm, kJ/kg, degC differences): Ex. 10.4 again', Math.abs(s.h - 5194) < 1, s.h);
messages([
  ['table key', err(`x = csf_rohsenow('water_steel')`), /'water_steel' should be one of 'water_copper_scored'/],
  ['arguments', err(`x = q_min_zuber(2257e3, 957.9, 0.5956)`), /q_min_zuber\(h_fg, rho_l, rho_v, sigma, g\) takes 4 to 5 arguments, got 3/],
  ['case', err(`x = hfg_corrected(2257e3, 4193, 50, 'boiling')`), /'boiling' should be one of 'condensation', 'chato', 'film_boiling'/],
  ['zero D', err(`x = h_cond_tube(0, 10, 960, 0.6, 0.68, 3e-4, 2.3e6)`), /D = 0 must be positive/],
]);
// 5. Check Units: each argument has its SI unit; the result its own
let u = units(`k_l = 0.631 [W/(m K)]\nmu = 663e-6 [Pa s]\nrho = 992 [kg/m^3]\nh_fg = 2455 [kJ/kg]\nD = 6 [mm]\ndT = 29 [K]\nh = h_cond_tube(D, dT, rho, 0.098, k_l, mu, h_fg, 20)\nbad = h_cond_tube(D, dT, rho, 0.098, mu, k_l, h_fg)`);
ok('Check Units: h_cond_tube in W/(m^2 K)', u.p.variables.get('h').inferredUnit === 'W/(m^2 K)', u.p.variables.get('h').inferredUnit);
ok('Check Units: swapped k_l and mu are flagged by name', u.issues.some(i => /h_cond_tube\(\) expects \[W\/\(m K\)\] for k_l but got \[Pa s\]/.test(i)) && u.issues.some(i => /expects \[Pa s\] for mu_l/.test(i)), u.issues);
u = units(`q = q_max_zuber(h_fg, rho_l, rho_v, sigma)\nh_fg = 2257 [kJ/kg]\nrho_l = 957.9 [kg/m^3]\nrho_v = 0.5956 [kg/m^3]\nsigma = 0.0589 [N/m]`);
ok('Check Units: q_max_zuber in W/m^2, no issues', u.p.variables.get('q').inferredUnit === 'W/m^2' && u.issues.length === 0, [u.p.variables.get('q').inferredUnit, u.issues]);
done();
