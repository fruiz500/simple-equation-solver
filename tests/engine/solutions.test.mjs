// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Solutions of a nonvolatile solute (thermo.js, Solutions): molar masses from the formulas, the dilute limits (ebullioscopic and
// cryoscopic constants R T^2 M/Dh from CoolProp's water and IAPWS ice, van 't Hoff's law, Raoult's law), the consistency of the
// outputs with each other, solutes given by M and nu, names, backward solving, messages, Check Units; seawater('BPE') against
// the MIT seawater property tables (Table 1).
import { CP, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const v = (expr, g) => run(`x_ = ${expr}`, g).st.x_;
const R = 8.314462618, Mw = CP.Props1SI('Water', 'M'), NW = "'NaCl&water'";

ok('molar masses from the formulas (IUPAC atomic weights): NaCl 58.44, sucrose 342.297, NH4NO3 80.043 g/mol, through w = m M/(1 + m M)',
  near(v(`solution('w', ${NW}, 'm', 1)`), 0.05844 / 1.05844, 1e-12) && near(v("solution('w', 'sucrose&water', 'm', 1)"), 0.342297 / 1.342297, 1e-12) && near(v("solution('w', 'NH4NO3&water', 'm', 1)"), 0.080043 / 1.080043, 1e-12));
ok('molality from the mass fraction, m = w/(M (1 - w)); the activity of water counts both ions of NaCl', near(v(`solution('m', ${NW}, 'w', 0.035)`), 0.035 / (0.05844 * 0.965), 1e-12) &&
  near(v(`solution('aw', ${NW}, 'm', 1)`), (1 / Mw) / (1 / Mw + 2), 1e-12));
const Tb = CP.PropsSI('T', 'P', 101325, 'Q', 0, 'Water'), hfg = CP.PropsSI('H', 'P', 101325, 'Q', 1, 'Water') - CP.PropsSI('H', 'P', 101325, 'Q', 0, 'Water');
ok('dilute limit: dT/(nu m) = R Tb^2 M/h_fg of CoolProp water (0.5130 K kg/mol at 1 atm), to 1e-5', near(v(`solution('dT', ${NW}, 'P', 101325, 'm', 1e-5)`) / 2e-5, R * Tb * Tb / hfg, 1e-5), v(`solution('dT', ${NW}, 'P', 101325, 'm', 1e-5)`) / 2e-5);
const fz = run("T_m = meltingtemperature('water', 101325)\nh_ice = enthalpy('ice', T_m - 1e-7, 101325)").st, hl = CP.PropsSI('H', 'T|liquid', fz.T_m, 'P', 101325, 'Water');
ok('dilute limit: dTf/(nu m) = R Tm^2 M/h_fus, h_fus from IAPWS ice and water (1.860 K kg/mol), to 1e-4', near(v(`solution('dTf', ${NW}, 'm', 1e-5)`) / 2e-5, R * fz.T_m ** 2 / (hl - fz.h_ice), 1e-4),
  [v(`solution('dTf', ${NW}, 'm', 1e-5)`) / 2e-5, R * fz.T_m ** 2 / (hl - fz.h_ice)]);
const rho = CP.PropsSI('D', 'T', 298.15, 'P', 101325, 'Water');
ok("dilute limit: van 't Hoff's law, Pi = nu m rho_water R T, to 1e-4", near(v("solution('Pi', 'sucrose&water', 'T', 298.15, 'm', 1e-4)"), 1e-4 * rho * R * 298.15, 1e-4));
const Ps = CP.PropsSI('P', 'T', 373.15, 'Q', 0, 'Water'), a35 = v(`solution('aw', ${NW}, 'w', 0.035)`), P35 = v(`solution('P', ${NW}, 'T', 373.15, 'w', 0.035)`);
ok("vapor pressure: Raoult's law, P = a Psat, within 2 % of the lowering (the vapor is not quite an ideal gas)", Math.abs(P35 / Ps - a35) < 0.02 * (1 - a35), [P35 / Ps, a35]);
const cons = run(`T_b = solution('T', ${NW}, 'P', 2e5, 'w', 0.1)\nP_v = solution('P', ${NW}, 'T', T_b, 'w', 0.1)\nd = solution('dT', ${NW}, 'P', 2e5, 'w', 0.1)`).st;
ok('consistency: the vapor pressure at the boiling point is P; dT = T - Tsat(P)', near(cons.P_v, 2e5, 1e-9) && near(cons.d, cons.T_b - CP.PropsSI('T', 'P', 2e5, 'Q', 0, 'Water'), 1e-9), cons);
ok('w = 0: the pure solvent (boiling and freezing points, zero osmotic pressure)', near(v(`solution('T', ${NW}, 'P', 101325, 'w', 0)`), Tb, 1e-12) && v(`solution('Pi', ${NW}, 'T', 300, 'w', 0)`) === 0 &&
  near(v(`solution('Tf', ${NW}, 'w', 0)`), fz.T_m, 1e-12));
ok('a solute given by M and nu is the same as the one listed; names ignore case, spaces and underscores', v("solution('dT', 'water', 'P', 101325, 'm', 0.5, 'M', 0.05844, 'nu', 2)") === v(`solution('dT', ${NW}, 'P', 101325, 'm', 0.5)`) &&
  v("solution('Tf', 'Sodium Chloride&water', 'w', 0.05)") === v("solution('Tf', 'NACL&water', 'w', 0.05)") && v("solution('Tf', 'ethylene_glycol&water', 'w', 0.2)") === v("solution('Tf', 'C2H6O2&water', 'w', 0.2)"));
ok('another solvent: sucrose in ethanol boils higher than ethanol', v("solution('dT', 'sucrose&ethanol', 'P', 101325, 'm', 0.5)") > 0.5);
ok('solved backward: the NaCl mass fraction that lowers the freezing point by 2 K', near(run(`dTf = solution('dTf', ${NW}, 'w', w)\ndTf = 2`, { w: 0.02 }).st.dTf, 2, 1e-9));
const meg = v("props('T_freeze', 'INCOMP::MEG[0.3]', 'T', 290, 'P', 101325)"), egi = v("solution('Tf', 'ethylene glycol&water', 'w', 0.3)");
ok("ethylene glycol, 30 % by mass: the ideal freezing point is 2 to 3 K above CoolProp's (measured) MEG brine, as the help says", egi - meg > 2 && egi - meg < 3, [egi - 273.15, meg - 273.15]);

// seawater('BPE') against the MIT tables (Table 1, boiling-point elevation in K; rows degC, columns S in g/kg)
const BPE = [[0, 10, 0.067], [0, 120, 1.046], [10, 10, 0.073], [110, 10, 0.146], [120, 10, 0.155], [110, 120, 2.331], [120, 50, 0.868], [120, 120, 2.462]];
ok("seawater('BPE'): 8 values of the MIT table, from 0 to 120 degC and 10 to 120 g/kg, to their 3 decimals", BPE.every(([t, S, b]) => Math.abs(v(`seawater('BPE', ${t + 273.15}, ${S / 1000})`) - b) < 6e-4),
  BPE.map(([t, S]) => v(`seawater('BPE', ${t + 273.15}, ${S / 1000})`)));

const u = units(`P = 1 [atm]\nT = 25 [degC]\nw = 0.035\nd = solution('dT', ${NW}, 'P', P, 'w', w)\nPi = solution('Pi', ${NW}, 'T', T, 'w', w)\nm = solution('m', ${NW}, 'w', w)\nb = seawater('BPE', T, w)\nbad = solution('Tf', ${NW}, 'P', T, 'w', w)`);
ok('Check: dT in K, Pi in Pa, m in mol/kg, BPE in K; a temperature given for P is flagged', u.issues.length === 1 && /solution\(\) expects \[Pa\]/.test(u.issues[0]) && u.p.variables.get('d').inferredUnit === 'K' &&
  u.p.variables.get('Pi').inferredUnit === 'Pa' && /^mol ?\/ ?kg$/.test(u.p.variables.get('m').inferredUnit) && u.p.variables.get('b').inferredUnit === 'K', [u.issues, ['d', 'Pi', 'm', 'b'].map(n => u.p.variables.get(n).inferredUnit)]);
messages([
  ['not listed', err("x_ = solution('T', 'gold&water', 'P', 1e5, 'w', 0.1)"), /'gold' is not one of the solutes listed .*give any other by its molar mass and ions, as solution\('T', 'water', \.\.\., 'M', 0\.1, 'nu', 1\)/],
  ['M for listed', err(`x_ = solution('T', ${NW}, 'P', 1e5, 'w', 0.1, 'M', 0.1, 'nu', 1)`), /M and nu are known for NaCl; give them only for a solute not listed/],
  ['no solute', err("x_ = solution('T', 'water', 'P', 1e5, 'w', 0.1)"), /name the solute and the solvent, as 'NaCl&water', or give the solvent alone with the solute's molar mass M/],
  ['nu', err("x_ = solution('T', 'water', 'P', 1e5, 'w', 0.1, 'M', 0.1, 'nu', 1.5)"), /M must be positive \(kg\/mol\) and nu a whole number of 1 or more/],
  ['composition', err(`x_ = solution('T', ${NW}, 'P', 1e5, 'w', 0.1, 'm', 1)`), /give the composition once, as w \(the solute mass fraction\) or m/],
  ['needs P', err(`x_ = solution('T', ${NW}, 'T', 300, 'w', 0.1)`), /the boiling point needs P/],
  ['needs T', err(`x_ = solution('Pi', ${NW}, 'P', 1e5, 'w', 0.1)`), /the osmotic pressure needs T/],
  ['w range', err(`x_ = solution('T', ${NW}, 'P', 1e5, 'w', 1)`), /w = 1 must be a mass fraction from 0 to less than 1/],
  ['freezing', err("x_ = solution('Tf', 'NaCl&ethanol', 'w', 0.01)"), /the freezing point is available for water only/],
  ['too cold', err("x_ = solution('Tf', 'CaCl2&water', 'w', 0.6)"), /the freezing point is below 240 K \(-33 degC\).*too concentrated for this ideal model/],
  ['output', err(`x_ = solution('h', ${NW}, 'P', 1e5, 'w', 0.1)`), /unknown output 'h'; use P, T, dT, Tf, dTf, Pi, aw, m or w/],
  ['input', err(`x_ = solution('T', ${NW}, 'P', 1e5, 'x', 0.1)`), /unknown input 'x'; the inputs are T, P, w \(the solute mass fraction\) or m/],
]);
done();
