// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Reactions and chemical equilibrium (thermo.js, Chem): equilibrium constants against the log Kf of the NIST-JANAF tables
// (janaf.nist.gov: CO2 C-095, CO C-093, H2O H-064, liquid water H-065, O O-001, OH H-038, NO N-005); heats of reaction and the
// reversible cell voltage; equilibrium compositions that satisfy every equilibrium constant and the element balances; adiabatic
// flame temperatures against NASA CEA (O. A. Marzouk, Eng. Technol. Appl. Sci. Res. 13, 11437, 2023); round trips; messages.
import { run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const v = (expr, g) => run(`x_ = ${expr}`, g).st.x_;
const R = 8.31446261815324, L10 = Math.log(10), lnK = (rx, T) => v(`reaction('lnK', '${rx}', 'T', ${T})`);

// ---- equilibrium constants, ln K = ln(10) (sum of log Kf of the products - that of the reactants), JANAF
const KF = { CO2: { 298.15: 69.095, 1000: 20.679, 2000: 10.351 }, CO: { 298.15: 24.030, 1000: 10.461, 2000: 7.470 }, H2O: { 298.15: 40.047, 1000: 10.060, 2000: 3.540, 3000: 1.344 },
  O: { 298.15: -40.599, 1000: -9.803, 2000: -3.175 }, OH: { 298.15: -6.005, 1000: -1.222 } };
const CASES = [['CO2 -> CO + 0.5 O2', (T) => KF.CO[T] - KF.CO2[T], [298.15, 1000, 2000]], ['H2O -> H2 + 0.5 O2', (T) => -KF.H2O[T], [298.15, 1000, 2000, 3000]],
  ['0.5 O2 -> O', (T) => KF.O[T], [298.15, 1000, 2000]]];
let worst = 0, at = '';
for (const [rx, f, Ts] of CASES) for (const T of Ts) { const d = Math.abs(lnK(rx, T) - L10 * f(T)); if (d > worst) { worst = d; at = `${rx} at ${T} K`; } }
ok('ln K of 3 reactions from 298 to 3000 K: within 0.02 of JANAF (10 values; the NASA polynomials are a fit of the same data)', worst < 0.02, [worst, at]);
// NO and OH: the NASA data take newer enthalpies of formation than JANAF's (NO 91.27 against 90.29 kJ/mol, N-005; OH 39.35
// against 38.99, H-038); with that difference allowed for, ln K is JANAF's
const dHf = v("ig_formationenthalpy('NO')") - 90291, dOH = v("ig_formationenthalpy('OH')") - 38987;
ok('0.5 N2 + 0.5 O2 -> NO and H2O -> 0.5 H2 + OH: ln K as JANAF (log Kf at 298.15 and 1000 K) once the differences in the enthalpies of formation are allowed for',
  [[298.15, -15.172], [1000, -4.063]].every(([T, lk]) => Math.abs(lnK('0.5 N2 + 0.5 O2 -> NO', T) + dHf / (R * T) - L10 * lk) < 0.02) &&
  [298.15, 1000].every((T) => Math.abs(lnK('H2O -> 0.5 H2 + OH', T) + dOH / (R * T) - L10 * (KF.OH[T] - KF.H2O[T])) < 0.02) && Math.abs(dHf - 977) < 5, [dHf, dOH]);
const fc = run("dH = reaction('dH', 'H2 + 0.5 O2 -> H2O(l)', 'T', 298.15)\ndG = reaction('dG', 'H2 + 0.5 O2 -> H2O(l)', 'T', 298.15)\nE = reaction('E0', 'H2 + 0.5 O2 -> H2O(l)', 'T', 298.15, 'n', 2)").st;
ok('the hydrogen fuel cell: dH = -285.830 and dG = -237.141 kJ/mol (JANAF, liquid water, H-065), E0 = 1.2289 V', Math.abs(fc.dH + 285830) < 50 && Math.abs(fc.dG + 237141) < 50 && Math.abs(fc.E - 237141 / (2 * 96485.33212)) < 3e-4, fc);
ok('higher and lower heating values of methane: CO2 + 2 H2O(l) or 2 H2O(g), JANAF -890.31 and -802.30 kJ/mol, within 0.5', Math.abs(v("reaction('dH', 'CH4 + 2 O2 -> CO2 + 2 H2O(l)', 'T', 298.15)") + 890309) < 500 &&
  Math.abs(v("reaction('dH', 'CH4 + 2 O2 -> CO2 + 2 H2O', 'T', 298.15)") + 802301) < 500);
const id = run("T = 1500\ndH = reaction('dH', 'CO + 0.5 O2 -> CO2', 'T', T)\ndS = reaction('dS', 'CO + 0.5 O2 -> CO2', 'T', T)\ndG = reaction('dG', 'CO + 0.5 O2 -> CO2', 'T', T)\nlnK = reaction('lnK', 'CO + 0.5 O2 -> CO2', 'T', T)\nK = reaction('K', 'CO + 0.5 O2 -> CO2', 'T', T)").st;
ok('dG = dH - T dS, ln K = -dG/(R T), K = exp(ln K); reversing the reaction changes the sign', near(id.dG, id.dH - 1500 * id.dS, 1e-12) && near(id.lnK, -id.dG / (R * 1500), 1e-12) && near(id.K, Math.exp(id.lnK), 1e-12) &&
  near(lnK('CO2 -> CO + 0.5 O2', 1500), -id.lnK, 1e-12));

// ---- equilibrium compositions
const SP = "'species', 'CO2 CO H2O H2 O2 OH H O N2 NO N'", RX = "'CH4 + 2 (O2 + 3.76 N2)'";
const outs = ['CO2', 'CO', 'H2O', 'H2', 'O2', 'OH', 'H', 'O', 'N2', 'NO', 'N'];
const eq = (T, P) => Object.fromEntries(outs.map(s => [s, v(`equilibrium('n_${s}', ${RX}, 'T', ${T}, 'P', ${P}, ${SP})`)]));
const e = eq(2500, 101325), Nt = Object.values(e).reduce((a, b) => a + b, 0), y = (s) => e[s] / Nt, p = 101325 / 1e5;
ok('element balances at 2500 K, 1 atm: C 1, H 4, O 4, N 15.04 per mole of CH4', near(e.CO2 + e.CO, 1, 1e-10) && near(2 * e.H2O + 2 * e.H2 + e.OH + e.H, 4, 1e-10) &&
  near(2 * e.CO2 + e.CO + e.H2O + 2 * e.O2 + e.OH + e.O + e.NO, 4, 1e-10) && near(2 * e.N2 + e.NO + e.N, 15.04, 1e-10), e);
const Kc = (rx) => Math.exp(lnK(rx, 2500));
ok('the composition satisfies every equilibrium constant (CO2, H2O, OH, O2, NO), to 1e-9', [
  [y('CO') * Math.sqrt(y('O2') * p) / y('CO2'), Kc('CO2 -> CO + 0.5 O2')], [y('H2') * Math.sqrt(y('O2') * p) / y('H2O'), Kc('H2O -> H2 + 0.5 O2')], [Math.sqrt(y('H2') * p) * y('OH') / y('H2O'), Kc('H2O -> 0.5 H2 + OH')],
  [y('O') * p / Math.sqrt(y('O2') * p), Kc('0.5 O2 -> O')], [y('NO') / Math.sqrt(y('N2') * y('O2')), Kc('0.5 N2 + 0.5 O2 -> NO')]].every(([a, b]) => Math.abs(a / b - 1) < 1e-9));
ok("Le Chatelier: CO2 dissociates less at 10 atm than at 1 atm (3000 K)", v("equilibrium('y_CO', 'CO2', 'T', 3000, 'P', 1013250)") < v("equilibrium('y_CO', 'CO2', 'T', 3000, 'P', 101325)"));
ok('at 1000 K methane burns completely: 1 CO2 and 2 H2O per CH4 to 1e-4', v(`equilibrium('n_CO2', ${RX}, 'T', 1000, 'P', 101325)`) > 0.9999 && v(`equilibrium('n_H2O', ${RX}, 'T', 1000, 'P', 101325)`) > 1.9998);
const fl = [[RX, 2224.25, 3], ["'CH4 + 2 O2'", 3050.12, 5], ["'H2 + 0.5 O2'", 3074.51, 6]].map(([r, T0, tol]) => [v(`equilibrium('T', ${r}, 'P', 101325, 'Tr', 298.15)`), T0, tol]);
ok('adiabatic flame temperatures at 1 atm from 298.15 K, against NASA CEA: CH4-air 2224.25 K (within 3 K), CH4-O2 3050.12 K (5 K), H2-O2 3074.51 K (6 K)', fl.every(([T, T0, tol]) => Math.abs(T - T0) < tol), fl);
const ab = run(`T_ad = equilibrium('T', ${RX}, 'P', 101325, 'Tr', 298.15)\nh_p = equilibrium('h', ${RX}, 'T', T_ad, 'P', 101325)
h_r = (ig_enthalpy('CH4', 298.15) + 2*ig_enthalpy('O2', 298.15) + 7.52*ig_enthalpy('N2', 298.15))/(ig_molarmass('CH4') + 2*ig_molarmass('O2') + 7.52*ig_molarmass('N2'))
s = equilibrium('s', ${RX}, 'T', 2000, 'P', 101325)\nT_s = equilibrium('T', ${RX}, 'P', 101325, 's', s)\nT_h = equilibrium('T', ${RX}, 'P', 101325, 'h', equilibrium('h', ${RX}, 'T', 1800, 'P', 101325))
M = equilibrium('M', ${RX}, 'T', 2000, 'P', 101325)\nv_ = equilibrium('v', ${RX}, 'T', 2000, 'P', 101325)`).st;
ok('adiabatic: the products carry the enthalpy of the reactants (from ig_enthalpy); round trips through (P, s) and (P, h); v = R T/(M P)', near(ab.h_p, ab.h_r, 1e-9) && near(ab.T_s, 2000, 1e-9) &&
  near(ab.T_h, 1800, 1e-9) && near(ab.v_, R * 2000 / (ab.M * 101325), 1e-12), ab);
ok('the default species include the radicals, so the flame is cooler than with the products of complete combustion only (2326 K, CEA)', v(`equilibrium('T', ${RX}, 'P', 101325, 'Tr', 298.15, 'species', 'CO2 H2O N2 O2')`) > 2300);

const u = units(`T = 2000 [K]\nP = 1 [atm]\nh = equilibrium('h', ${RX}, 'T', T, 'P', P)\ny = equilibrium('y_NO', ${RX}, 'T', T, 'P', P)\ndG = reaction('dG', 'CO + 0.5 O2 -> CO2', 'T', T)\nE = reaction('E0', 'H2 + 0.5 O2 -> H2O(l)', 'T', 298.15, 'n', 2)\nbad = equilibrium('T', ${RX}, 'T', P, 'P', P)`);
ok('Check: h in J/kg, y dimensionless, dG in J, E0 in V; a pressure given for T is flagged', u.issues.length === 1 && /equilibrium\(\) expects \[K\]/.test(u.issues[0]) && u.p.variables.get('h').inferredUnit === 'J/kg' &&
  /^V$|^kg m\^2 \/ \(s\^3 A\)$/.test(u.p.variables.get('E').inferredUnit) && u.p.variables.get('dG').inferredUnit === 'J', [u.issues, ['h', 'y', 'dG', 'E'].map(n => u.p.variables.get(n).inferredUnit)]);
messages([
  ['not balanced', err("x_ = reaction('dH', 'CH4 + O2 -> CO2 + 2 H2O', 'T', 300)"), /the reaction is not balanced in O \(\+2\)/],
  ['species', err("x_ = reaction('dH', 'C8H18 + 12.5 O2 -> 8 CO2 + 9 H2O', 'T', 300)"), /'C8H18' is not one of the ideal-gas species/],
  ['liquid', err("x_ = reaction('dH', 'CH3OH(l) -> CH3OH', 'T', 300)"), /only water can be liquid, H2O\(l\)/],
  ['E0 needs n', err("x_ = reaction('E0', 'H2 + 0.5 O2 -> H2O(l)', 'T', 298.15)"), /E0 needs n, the electrons transferred/],
  ['arrow', err("x_ = reaction('dH', 'H2 + 0.5 O2', 'T', 300)"), /write the reaction as  reactants -> products/],
  ['syntax', err(`x_ = equilibrium('T', 'CH4 + 2 (O2 + 3.76 N2', 'P', 1e5, 'T', 2000)`), /cannot read .* write terms such as  2 O2  or  2 \(O2 \+ 3\.76 N2\)/],
  ['needs P', err(`x_ = equilibrium('T', ${RX}, 'T', 2000, 'h', 0)`), /give P and one of T, h, s or Tr/],
  ['output', err(`x_ = equilibrium('cp', ${RX}, 'T', 2000, 'P', 1e5)`), /unknown output 'cp'; use T, P, h, s, u, v, M, N/],
  ['not a product', err(`x_ = equilibrium('y_SO2', ${RX}, 'T', 2000, 'P', 1e5)`), /SO2 is not among the species of this equilibrium/],
  ['list element', err(`x_ = equilibrium('T', 'H2 + 0.5 O2', 'P', 1e5, 'T', 2000, 'species', 'H2O H2 O2 CO')`), /CO contains C, which the reactants do not/],
  ['list missing', err(`x_ = equilibrium('T', ${RX}, 'P', 1e5, 'T', 2000, 'species', 'H2O H2 O2 CO2 CO')`), /no product species contains N/],
  ['range', err(`x_ = equilibrium('T', ${RX}, 'P', 1e5, 'T', 7000)`), /T = 7000 K is outside 200 to 6000 K, the range of the species data/],
  ['liquid reactant', err(`x_ = equilibrium('T', 'H2O(l)', 'P', 1e5, 'T', 2000)`), /the reactants are ideal gases/],
]);
done();
