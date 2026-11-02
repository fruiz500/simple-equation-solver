// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Exergy: flow and nonflow exergy of CoolProp fluids, ideal-gas physical, chemical and mixing exergy, and Check.
import { E, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';

const T0 = 298.15, P0 = 101325, R = 8.31446261815324;
const v = (expr) => run(`z_ = ${expr}`).st.z_;

// ---- physical exergy of a CoolProp fluid
const h = v(`enthalpy('water', 773.15, 4e6)`), s = v(`entropy('water', 773.15, 4e6)`), vol = v(`specificvolume('water', 773.15, 4e6)`);
const h0 = v(`enthalpy('water', ${T0}, ${P0})`), s0 = v(`entropy('water', ${T0}, ${P0})`);
const psi = v(`exergy('water', 773.15, 4e6, ${T0}, ${P0})`), phi = v(`exergy_nonflow('water', 773.15, 4e6, ${T0}, ${P0})`);
ok('flow exergy of steam at 500 C, 4 MPa = h - h0 - T0 (s - s0) = 1336.0 kJ/kg', near(psi, h - h0 - T0 * (s - s0), 1e-12) && near(psi, 1336048, 1e-5), psi);
ok('flow minus nonflow exergy = (P - P0) v', near(psi - phi, (4e6 - P0) * vol, 1e-9), [psi - phi, (4e6 - P0) * vol]);
ok('keyed inputs give the same flow exergy', v(`exergy('water', 'P', 4e6, 'T', 773.15, ${T0}, ${P0})`) === psi);
ok('zero at the dead state, flow and nonflow', Math.abs(v(`exergy('R134a', ${T0}, ${P0}, ${T0}, ${P0})`)) < 1e-6 && Math.abs(v(`exergy_nonflow('water', ${T0}, ${P0}, ${T0}, ${P0})`)) < 1e-6);
const ice = v(`exergy_nonflow('ice', 260, ${P0}, ${T0}, ${P0})`);
ok('ice: positive (it can absorb heat from the environment), through the water of all phases', ice > 0 && near(ice, 38369, 1e-3), ice);

// ---- ideal gas
const eN2 = v(`ig_exergy('N2', 1000, 5e5, ${T0}, ${P0})`);
const hN = (T) => v(`ig_enthalpy('N2', ${T})`), sN = (T, P) => v(`ig_entropy('N2', ${T}, ${P})`);
ok('ig_exergy = h - h0 - T0 (s - s0) with the NASA data', near(eN2, hN(1000) - hN(T0) - T0 * (sN(1000, 5e5) - sN(T0, P0)), 1e-12), eN2);
ok('ig_exergy at the pressure alone (T = T0) = R T0 ln(P/P0)', near(v(`ig_exergy('O2', ${T0}, 3e5, ${T0}, ${P0})`), R * T0 * Math.log(3e5 / P0), 1e-9));
ok('mixing: R T0 ln(y/y0)', near(v(`ig_mixingexergy(0.09, 0.0003, ${T0})`), R * T0 * Math.log(300), 1e-12));

// ---- chemical exergy (Moran and Shapiro, Sec. 13.6, environment of Table 13.4)
const cCO2 = v(`ig_chemicalexergy('CO2')`), cCH4 = v(`ig_chemicalexergy('methane')`);
ok('CO2, a gas of the atmosphere: R T0 ln(1/0.0003) = 20.108 kJ/mol (Moran and Shapiro: 20,108 kJ/kmol)', near(cCO2, R * T0 * Math.log(1 / 0.0003), 1e-12) && near(cCO2, 20108, 1e-4), cCO2);
ok('O2 and N2 likewise', near(v(`ig_chemicalexergy('O2')`), R * T0 * Math.log(1 / 0.2035), 1e-12) && near(v(`ig_chemicalexergy('N2')`), R * T0 * Math.log(1 / 0.7567), 1e-12));
ok('CH4: 830.41 kJ/mol, within 0.05 % of Moran and Shapiro (830,174 kJ/kmol with their tables)', near(cCH4, 830174, 5e-4) && near(cCH4, 830405.7, 1e-6), cCH4);
ok('CH4 by hand from ig_gibbs: same', near(cCH4, v(`ig_gibbs('CH4', ${T0}, ${P0}) + 2*ig_gibbs('O2', ${T0}, ${P0}) - ig_gibbs('CO2', ${T0}, ${P0}) - 2*ig_gibbs('H2O', ${T0}, ${P0})`) + R * T0 * Math.log(0.2035 ** 2 / (0.0003 * 0.0312 ** 2)), 1e-12));
ok('a gas of the flue: chemical + mixing at y = 1 is the mixing relative to the atmosphere', near(cCO2 + v(`ig_mixingexergy(0.09, 1, ${T0})`), v(`ig_mixingexergy(0.09, 0.0003, ${T0})`), 1e-9));
ok('another atmosphere: 400 ppm CO2 lowers the exergy of CO2', near(v(`ig_chemicalexergy('CO2', ${T0}, ${P0}, 'co2', 0.0004)`), R * T0 * Math.log(1 / 0.0004), 1e-12));
const g = (sp) => v(`ig_gibbs('${sp}', ${T0}, ${P0})`);
ok('formulas read right: isomers (CH3OCH3 and C2H5OH, nC4H10 and iC4H10) differ only by their Gibbs energies',
  near(v(`ig_chemicalexergy('CH3OCH3')`) - v(`ig_chemicalexergy('C2H5OH')`), g('CH3OCH3') - g('C2H5OH'), 1e-9) &&
  near(v(`ig_chemicalexergy('nC4H10')`) - v(`ig_chemicalexergy('iC4H10')`), g('nC4H10') - g('iC4H10'), 1e-9));
messages([
  ['args', err(`z_ = exergy('water', 773.15, 4e6)`), /^Line 1: exergy\(\): use exergy\(fluid, T, P, T0, P0\) or exergy\(fluid, 'key1', v1, 'key2', v2, T0, P0\)$/],
  ['sulfur', err(`z_ = ig_chemicalexergy('SO2')`), /SO2 contains S; only species made of C, H, O and N are covered/],
  ['env gas', err(`z_ = ig_chemicalexergy('CH4', 298.15, 101325, 'Ar', 0.01)`), /the gases of the atmosphere that can be set are N2, O2, H2O and CO2, not 'Ar'/],
  ['y range', err(`z_ = ig_mixingexergy(0, 0.2, 298.15)`), /mole fractions y and y0 must be above 0 and at most 1/],
]);

// ---- Check
let u = units(`T0 = 298.15 [K]\nP0 = 1 [atm]\nT = 500 [K]\nP = 2 [bar]\npsi = exergy('air', T, P, T0, P0)\nbad = exergy('air', T, P, P0, T0)\nm = ig_mixingexergy(0.1, 0.0003, T0)\nc = ig_chemicalexergy('CH4', T0, P0)`);
ok('Check: J/kg and J/mol results; T0 and P0 swapped are flagged', u.p.variables.get('psi').inferredUnit === 'J/kg' && u.p.variables.get('m').inferredUnit === 'J/mol' &&
  u.p.variables.get('c').inferredUnit === 'J/mol' && u.issues.length === 2 && u.issues.every(i => /^exergy\(\) expects/.test(i)), u.issues);
done();
