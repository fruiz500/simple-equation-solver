// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Water below the triple point (thermo.js): ice Ih from IAPWS R10-06(2009), sublimation and melting curves from IAPWS
// R14-08(2011), vapor below 273.16 K from IAPWS-95 (CoolProp at T, D). The check values of the releases; phase
// equilibria computed here against CoolProp's IAPWS-95 (an independent check of the coefficients); Clausius-Clapeyron;
// the routing between phases; the input pairs; messages; Check Units.
import { run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const rel = (a, b) => Math.abs(a / b - 1);
const v = (expr, g) => run(`x = ${expr}`, g).st.x;
const Tt = 273.16, Tm = Tt - 1e-9;   // just below the triple point, where ice is the stable solid at 611.657 Pa

// 1. Check values of R10-06(2009), Table 6 (as also reproduced by the reference implementation iapws, Python)
ok('ice, T = 100 K, p = 100 MPa: rho = 941.678203297 kg/m3, h = -483.491635676 kJ/kg, s = -2.61195122589 kJ/(kg K)',
  rel(v(`density('ice', 100, 100e6)`), 941.678203297) < 1e-11 && rel(v(`enthalpy('ice', 100, 100e6)`), -483491.635676) < 1e-11 && rel(v(`entropy('ice', 100, 100e6)`), -2611.95122589) < 1e-11);
ok('ice, T = 273.152519 K, p = 101325 Pa: f = -0.00918701567 kJ/kg, u = -333.465403393 kJ/kg, cp = 2.09671391024 kJ/(kg K)',
  rel(v(`helmholtzenergy('water', 273.152519, 101325)`), -9.18701567) < 1e-9 && rel(v(`internalenergy('water', 273.152519, 101325)`), -333465.403393) < 1e-11 && rel(v(`specificheat('water', 273.152519, 101325)`), 2096.71391024) < 1e-11);
ok('ice at the triple point: alpha = 1.59863102566e-4 1/K, kappa_T = 1.17793449348e-4 1/MPa',
  rel(v(`volumeexpansion('water', ${Tm}, 611.657)`), 1.59863102566e-4) < 1e-8 && rel(v(`isothermalcompressibility('water', ${Tm}, 611.657)`), 1.17793449348e-10) < 1e-8);
// R14-08(2011) check values
ok('sublimation pressure at 230 K: 8.94735 Pa; melting pressure at 260 K: 138.268 MPa (R14-08 check values)',
  Math.abs(v(`saturationpressure('water', 230)`) - 8.94735) < 5e-6 && Math.abs(v(`meltingpressure('water', 260)`) / 1e6 - 138.268) < 5e-4);

// 2. Consistency with CoolProp's IAPWS-95 for the fluid (independent of the ice coefficients)
ok('triple point: g of ice equals g of the liquid (0.6118 J/kg) within 1e-5 J/kg', Math.abs(v(`gibbsenergy('water', ${Tm}, 611.657)`) - v(`gibbsenergy('water', 273.16, 611.657)`)) < 1e-5);
// melting at 1 atm: g_ice(T) = g_liquid(T); each side from its own formulation (the liquid by IAPWS-95 with the phase imposed),
// linearized about T0 = 273.1525 K: T* = T0 + (g_l - g_i)/(s_l - s_i)
{ const T0 = 273.1525, gi = v(`gibbsenergy('water', ${T0}, 101325)`), si = v(`entropy('water', ${T0}, 101325)`);
  const gl = v(`props('G', 'water', 'T|liquid', ${T0}, 'P', 101325)`), sl = v(`props('S', 'water', 'T|liquid', ${T0}, 'P', 101325)`), Tstar = T0 + (gl - gi) / (sl - si);
  ok(`normal melting point from the phase equilibrium: ${Tstar.toFixed(7)} K (R10-06: 273.152519 K)`, Math.abs(Tstar - 273.152519) < 2e-6); }
ok('meltingtemperature(water, 1 atm) from the melting curve agrees: 273.152519 K', Math.abs(v(`meltingtemperature('water', 101325)`) - 273.152519) < 2e-6);
ok("meltingpoint('ice') is the melting point at 1 atm", Math.abs(v(`meltingpoint('ice')`) - 273.152519) < 2e-6);
// sublimation and melting: p* = p0 + (g_fluid - g_ice)/(v_ice - v_fluid) at p0 on the R14-08 curve (one Newton step, exact
// to second order in the small offset)
const eqP = (T, p0, ph) => { const gi = v(`gibbsenergy('water', ${T}, ${p0})`), vi = v(`specificvolume('water', ${T}, ${p0})`);
  const gf = v(`props('G', 'water', 'T|${ph}', ${T}, 'P', ${p0})`), vf = 1 / v(`props('D', 'water', 'T|${ph}', ${T}, 'P', ${p0})`); return p0 + (gf - gi) / (vi - vf); };
for (const T of [200, 230, 260, 273]) {
  const ps = v(`saturationpressure('water', ${T})`), pe = eqP(T, ps, 'gas');
  ok(`sublimation at ${T} K: the equilibrium of ice and IAPWS-95 vapor gives p within 0.05 % of R14-08 (${ps.toPrecision(6)} Pa)`, rel(pe, ps) < 5e-4, [pe, ps]);
}
for (const T of [255, 265, 272]) {
  const pm = v(`meltingpressure('water', ${T})`), pe = eqP(T, pm * (1 - 1e-12), 'liquid');
  ok(`melting at ${T} K: the equilibrium of ice and IAPWS-95 liquid gives p within 0.5 % of R14-08 (${(pm / 1e6).toPrecision(6)} MPa)`, rel(pe, pm) < 5e-3, [pe, pm]);
}
// Clausius-Clapeyron on the melting curve: dp/dT = (h_l - h_s)/(T (v_l - v_s))
{ const T = 265, p = v(`meltingpressure('water', ${T})`), dpdT = (v(`meltingpressure('water', ${T + 0.01})`) - v(`meltingpressure('water', ${T - 0.01})`)) / 0.02;
  const hl = v(`props('H', 'water', 'T|liquid', ${T}, 'P', ${p})`), vl = 1 / v(`props('D', 'water', 'T|liquid', ${T}, 'P', ${p})`);
  const hs = v(`enthalpy('water', ${T}, ${p * (1 - 1e-12)})`), vs = v(`specificvolume('water', ${T}, ${p * (1 - 1e-12)})`);
  ok('Clausius-Clapeyron on the melting curve at 265 K within 0.5 %', rel(dpdT, (hl - hs) / (T * (vl - vs))) < 5e-3, [dpdT, (hl - hs) / (T * (vl - vs))]); }
ok('enthalpy of fusion at 1 atm: 333.4 kJ/kg', Math.abs((v(`enthalpy('water', 273.1526, 101325)`) - v(`enthalpy('water', 273.1524, 101325)`)) / 1e3 - 333.43) < 0.05);
ok('enthalpy of sublimation at the triple point = h_fg + h_fusion there (continuity across 273.16 K)',
  rel(v(`enthalpyvaporization('water', 'T', ${Tm})`), v(`enthalpyvaporization('water', 'T', 273.16)`) + v(`enthalpy('water', 273.16, 611.657)`) - v(`enthalpy('water', ${Tm}, 611.657)`)) < 1e-6);

// 3. Routing: which phase answers
ok("'water' at 260 K: ice at 1 atm (phase 9), vapor at 100 Pa (gas, phase 5), liquid at 150 MPa (phase 3, CoolProp's liquid above the critical pressure)",
  v(`phase('water', 260, 101325)`) === 9 && v(`phase('water', 260, 100)`) === 5 && v(`phase('water', 260, 150e6)`) === 3);
ok("'steam' is water too: every phase, saturation, critical point and props()", ['300, 101325', '500, 101325', '250, 101325', '250, 10'].every(tp => v(`enthalpy('steam', ${tp})`) === v(`enthalpy('water', ${tp})`))
  && v(`saturationtemperature('steam', 101325)`) === v(`saturationtemperature('water', 101325)`) && v(`criticalpressure('Steam')`) === v(`criticalpressure('water')`)
  && v(`props('H', 'steam', 'P', 1e6, 'Q', 1)`) === v(`props('H', 'water', 'P', 1e6, 'Q', 1)`) && v(`saturationpressure('steam', 230)`) === v(`saturationpressure('water', 230)`));
ok("'ice' and 'water' are the same substance in every phase", v(`enthalpy('ice', 300, 101325)`) === v(`enthalpy('water', 300, 101325)`) && v(`enthalpy('ice', 260, 101325)`) === v(`enthalpy('water', 260, 101325)`));
ok("conductivity('ice', T): 612/T at 1 atm (Wolfenbarger et al. 2021); the book's Table A.3 values remain as 'ice_incropera'",
  near(v(`conductivity('ice', 253)`), 612 / 253, 1e-15) && v(`conductivity('ice_incropera', 253)`) === 2.03);
ok('ice: cp at 253 K within 1 % of Table A.3 (1945 J/(kg K)), density at 273 K within 0.5 % (920 kg/m3)', rel(v(`specificheat('ice', 253, 101325)`), 1945) < 0.01 && rel(v(`density('ice', 273, 101325)`), 920) < 0.005);
ok('saturationpressure below 273.16 K is over ice (stable), not over supercooled liquid', v(`saturationpressure('water', 260)`) < 0.9 * 222.557);
ok('saturationtemperature at 100 Pa is the sublimation temperature, and it inverts saturationpressure', near(v(`saturationpressure('water', saturationtemperature('water', 100))`), 100, 1e-12));
// input pairs
const h250 = v(`enthalpy('water', 250, 101325)`), s250 = v(`entropy('water', 250, 101325)`);
ok('(P, H) and (P, S) in the ice region invert (T, P)', Math.abs(v(`temperature('water', 'P', 101325, 'H', ${h250})`) - 250) < 1e-8 && Math.abs(v(`temperature('water', 'P', 101325, 'S', ${s250})`) - 250) < 1e-8);
const hi = v(`enthalpy('water', 'P', 101325, 'Q', 0)`);
ok('(P, H) between ice and liquid at 1 atm: a mixture at the melting temperature with its quality', Math.abs(v(`temperature('water', 'P', 101325, 'H', -100000)`) - 273.152519) < 2e-6 && Math.abs(v(`quality('water', 'P', 101325, 'H', -100000)`) - 0.70) < 0.01);
const hs0 = v(`enthalpy('water', 'T', 250, 'Q', 0)`), hs1 = v(`enthalpy('water', 'T', 250, 'Q', 1)`);
ok("(T, Q) below the triple point: Q = 0 ice, Q = 1 vapor, at the sublimation pressure; a mixture in between",
  near(hs0, v(`enthalpy('water', 250, saturationpressure('water', 250))`), 1e-12) && near(v(`enthalpy('water', 'T', 250, 'Q', 0.3)`), 0.7 * hs0 + 0.3 * hs1, 1e-12) && near(hs1 - hs0, v(`enthalpyvaporization('water', 'T', 250)`), 1e-9));
ok('(P, H) at 100 Pa through sublimation: ice, mixture and vapor below 273.16 K', Math.abs(v(`quality('water', 'P', 100, 'H', ${0.5 * hs0 + 0.5 * hs1})`) - 0.5) < 0.05 &&
  Math.abs(v(`temperature('water', 'P', 100, 'H', enthalpy('water', 265, 100))`) - 265) < 1e-6);
let s = run(`h = enthalpy('water', T, 101325)\nh = -350000`, { T: 250 }).st;
ok('solved backward for T in the ice region', Math.abs(v(`enthalpy('water', ${s.T}, 101325)`) + 350000) < 1e-6 && s.T < 273);
ok('the props() form works for ice', rel(v(`props('Cpmass', 'water', 'T', 100, 'P', 100e6)`), -100 * 0 + v(`specificheat('water', 100, 100e6)`)) < 1e-15);
messages([
  ['viscosity of ice', err(`x = viscosity('water', 260, 101325)`), /viscosity is not defined for ice/],
  ['ice III', err(`x = density('water', 240, 250e6)`), /ice III or a denser ice is stable there/],
  ['melting range', err(`x = meltingtemperature('water', 300e6)`), /outside the melting curve of ice Ih/],
  ['melting other fluid', err(`x = meltingtemperature('R134a', 1e5)`), /available for water only/],
]);
let u = units(`T = 260 [K]\nP = 1 [atm]\nrho = density('ice', T, P)\nT_m = meltingtemperature('water', P)\nbad = meltingpressure('water', P)`);
ok('Check Units: ice density in kg/m^3, melting temperature in K, a pressure given to meltingpressure flagged',
  u.p.variables.get('rho').inferredUnit === 'kg/m^3' && u.p.variables.get('T_m').inferredUnit === 'K' && u.issues.some(i => /meltingpressure\(\) expects \[K\]/.test(i)), [u.issues]);
done();
