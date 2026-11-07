// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Mixtures (thermo.js): idealmixture() against Raoult's law computed here from CoolProp's vapor pressures, its pure-fluid limits
// and mass balances; mixture() against CoolProp's own mixture flash (bubble and dew points, the vapor fraction and h at T, P),
// against the ethanol-water measurements of L. W. Cornell and R. E. Montonna, Ind. Eng. Chem. 25, 1331 (1933), at 1 atm, and
// the azeotrope of P. Susial et al., J. Chem. Eng. Data 66, 928 (2021), at 100 kPa; round trips through every input pair;
// three fluids; mass and mole fractions; messages; Check Units.
import { CP, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const v = (expr, g) => run(`x_ = ${expr}`, g).st.x_;
const ps = (f, T) => CP.PropsSI('P', 'T', T, 'Q', 0, f);
const BT = "'benzene&toluene'", EW = "'ethanol&water'";

// ---- idealmixture(): Raoult's law
const Pb = v(`idealmixture('P', ${BT}, 'T', 360, 'x', 0.4, 'q', 0)`), Pd = v(`idealmixture('P', ${BT}, 'T', 360, 'x', 0.4, 'q', 1)`);
ok('ideal: bubble P = sum x Psat and dew P = 1/sum(y/Psat), from CoolProp vapor pressures, to 1e-12', near(Pb, 0.4 * ps('Benzene', 360) + 0.6 * ps('Toluene', 360), 1e-12) &&
  near(Pd, 1 / (0.4 / ps('Benzene', 360) + 0.6 / ps('Toluene', 360)), 1e-12), [Pb, Pd]);
ok('ideal: the first vapor is y = x Psat/P', near(v(`idealmixture('yv', ${BT}, 'T', 360, 'x', 0.4, 'q', 0)`), 0.4 * ps('Benzene', 360) / Pb, 1e-12));
const Tb = v(`idealmixture('T', ${BT}, 'P', 101325, 'x', 0.4, 'q', 0)`);
ok('ideal: at the bubble temperature, sum x Psat = P to 1e-10', near(0.4 * ps('Benzene', Tb) + 0.6 * ps('Toluene', Tb), 101325, 1e-10), Tb);
const fl = run(`z = 0.4\nq = idealmixture('q', ${BT}, 'T', 370, 'P', 101325, 'x', z)\nxl = idealmixture('xl', ${BT}, 'T', 370, 'P', 101325, 'x', z)\nyv = idealmixture('yv', ${BT}, 'T', 370, 'P', 101325, 'x', z)`).st;
ok('ideal flash at T, P: z = (1 - q) xl + q yv, and yv/xl = Psat/P', near((1 - fl.q) * fl.xl + fl.q * fl.yv, 0.4, 1e-12) && near(fl.yv / fl.xl, ps('Benzene', 370) / 101325, 1e-10) && fl.q > 0 && fl.q < 1, fl);
const rt = run(`T = idealmixture('T', ${BT}, 'P', 101325, 'x', 0.4, 'q', 0.3)\nq = idealmixture('q', ${BT}, 'T', T, 'P', 101325, 'x', 0.4)\nP = idealmixture('P', ${BT}, 'T', 365, 'x', 0.4, 'q', 0.7)\nq_2 = idealmixture('q', ${BT}, 'T', 365, 'P', P, 'x', 0.4)
h = idealmixture('h', ${BT}, 'T', 368, 'P', 101325, 'x', 0.4)\nT_h = idealmixture('T', ${BT}, 'P', 101325, 'x', 0.4, 'h', h)`).st;
ok('ideal: round trips (P, x, q) -> T -> q, (T, x, q) -> P -> q, (T, P, x) -> h -> T', near(rt.q, 0.3, 1e-9) && near(rt.q_2, 0.7, 1e-9) && near(rt.T_h, 368, 1e-9), rt);
const hfg = CP.PropsSI('H', 'P', 101325, 'Q', 1, 'Benzene') - CP.PropsSI('H', 'P', 101325, 'Q', 0, 'Benzene');
ok('ideal, pure benzene (x = 1): the boiling point and h_fg of CoolProp; pure toluene (x = 0): the boiling point',
  near(v(`idealmixture('T', ${BT}, 'P', 101325, 'x', 1, 'q', 0)`), CP.PropsSI('T', 'P', 101325, 'Q', 0, 'Benzene'), 1e-10) &&
  near(v(`idealmixture('h', ${BT}, 'P', 101325, 'x', 1, 'q', 1)`) - v(`idealmixture('h', ${BT}, 'P', 101325, 'x', 1, 'q', 0)`), hfg, 1e-8) &&
  near(v(`idealmixture('T', ${BT}, 'P', 101325, 'x', 0, 'q', 1)`), CP.PropsSI('T', 'P', 101325, 'Q', 0, 'Toluene'), 1e-10));
const Mb = CP.Props1SI('Benzene', 'M'), Mt = CP.Props1SI('Toluene', 'M'), wb = 0.4 * Mb / (0.4 * Mb + 0.6 * Mt);
ok('ideal h: the subcooled liquid is the mass-weighted h of the saturated liquids; the superheated vapor that of the gases at their partial pressures',
  near(v(`idealmixture('h', ${BT}, 'T', 330, 'P', 101325, 'x', 0.4)`), wb * CP.PropsSI('H', 'T', 330, 'Q', 0, 'Benzene') + (1 - wb) * CP.PropsSI('H', 'T', 330, 'Q', 0, 'Toluene'), 1e-10) &&
  near(v(`idealmixture('h', ${BT}, 'T', 400, 'P', 101325, 'x', 0.4)`), wb * CP.PropsSI('H', 'T', 400, 'P', 0.4 * 101325, 'Benzene') + (1 - wb) * CP.PropsSI('H', 'T', 400, 'P', 0.6 * 101325, 'Toluene'), 1e-10));
ok('one phase: q = -0.001 (subcooled liquid) or 1.001 (superheated vapor), and xl = yv = x', v(`idealmixture('q', ${BT}, 'T', 330, 'P', 101325, 'x', 0.4)`) === -0.001 &&
  v(`idealmixture('q', ${BT}, 'T', 400, 'P', 101325, 'x', 0.4)`) === 1.001 && v(`idealmixture('yv', ${BT}, 'T', 330, 'P', 101325, 'x', 0.4)`) === 0.4);
const TX = "'benzene&toluene&o-xylene'", z3 = '[0.3, 0.3, 0.4]';
const t3 = run(`T = idealmixture('T', ${TX}, 'P', 101325, 'x', ${z3}, 'q', 0)\ny_1 = idealmixture('yv1', ${TX}, 'P', 101325, 'x', ${z3}, 'q', 0)\ny_2 = idealmixture('yv2', ${TX}, 'P', 101325, 'x', ${z3}, 'q', 0)\ny_3 = idealmixture('yv3', ${TX}, 'P', 101325, 'x', ${z3}, 'q', 0)`).st;
ok('three fluids: x as an array; at the bubble point sum x Psat = P, and the vapor fractions y1..y3 add up to 1',
  near(0.3 * ps('Benzene', t3.T) + 0.3 * ps('Toluene', t3.T) + 0.4 * ps('o-Xylene', t3.T), 101325, 1e-10) && near(t3.y_1 + t3.y_2 + t3.y_3, 1, 1e-12) && near(t3.y_1, 0.3 * ps('Benzene', t3.T) / 101325, 1e-10), t3);
ok('an array of unknowns as x: the solver finds the composition with a given bubble point', near(run(`T_b = idealmixture('T', ${BT}, 'P', 101325, 'x', [a, 1 - a], 'q', 0)\nT_b = 370`, { a: 0.5 }).st.a, (101325 - ps('Toluene', 370)) / (ps('Benzene', 370) - ps('Toluene', 370)), 1e-9));

// ---- mixture(): CoolProp's equation of state, the equilibrium solved here
const mix = (x) => `HEOS::Ethanol[${x}]&Water[${1 - x}]`;
let worst = 0;
for (const x of [0.02, 0.2, 0.5, 0.8]) for (const q of [0, 1]) worst = Math.max(worst, Math.abs(v(`mixture('T', ${EW}, 'P', 101325, 'x', ${x}, 'q', ${q})`) - CP.PropsSI('T', 'P', 101325, 'Q', q, mix(x))));
ok("real: bubble and dew temperatures of ethanol-water at 1 atm (x = 0.02 to 0.8) are CoolProp's own, to 1e-6 K", worst < 1e-6, worst);
ok("real: the enthalpy at the bubble point is CoolProp's, to 1e-9", near(v(`mixture('h', ${EW}, 'P', 101325, 'x', 0.2, 'q', 0)`), CP.PropsSI('Hmass', 'P', 101325, 'Q', 0, mix(0.2)), 1e-9));
const AS = CP.factory('HEOS', 'Ethanol&Water'), vd = new CP.VectorDouble(); vd.push_back(0.2); vd.push_back(0.8); AS.set_mole_fractions(vd); AS.update(CP.input_pairs.PT_INPUTS, 101325, 360);
ok("real flash at T, P: q and h are those of CoolProp's own flash (to 1e-8)", near(v(`mixture('q', ${EW}, 'T', 360, 'P', 101325, 'x', 0.2)`), AS.Q(), 1e-8) && near(v(`mixture('h', ${EW}, 'T', 360, 'P', 101325, 'x', 0.2)`), AS.hmass(), 1e-8));
const AC = CP.factory('HEOS', 'CarbonDioxide&Water'), vc = new CP.VectorDouble(); vc.push_back(0.05); vc.push_back(0.95); AC.set_mole_fractions(vc); AC.update(CP.input_pairs.PT_INPUTS, 1e6, 350);
const cw = run("q = mixture('q', 'CO2&water', 'T', 350, 'P', 1e6, 'x', 0.05)\nxl = mixture('xl', 'CO2&water', 'T', 350, 'P', 1e6, 'x', 0.05)\nyv = mixture('yv', 'CO2&water', 'T', 350, 'P', 1e6, 'x', 0.05)").st;
ok("real, with a fluid above its critical temperature (CO2 in water at 350 K, 10 bar): q as CoolProp's flash, the mass balance; little CO2 dissolves",
  near(cw.q, AC.Q(), 1e-8) && near((1 - cw.q) * cw.xl + cw.q * cw.yv, 0.05, 1e-10) && cw.xl < 0.005 && cw.yv > 0.9, cw);
const air = "'nitrogen&oxygen&argon'", za = '[0.7812, 0.2096, 0.0092]', airCP = 'HEOS::Nitrogen[0.7812]&Oxygen[0.2096]&Argon[0.0092]';
ok("real, three fluids: the bubble and dew points of air at 1 atm are CoolProp's, to 1e-6 K", Math.abs(v(`mixture('T', ${air}, 'P', 101325, 'x', ${za}, 'q', 0)`) - CP.PropsSI('T', 'P', 101325, 'Q', 0, airCP)) < 1e-6 &&
  Math.abs(v(`mixture('T', ${air}, 'P', 101325, 'x', ${za}, 'q', 1)`) - CP.PropsSI('T', 'P', 101325, 'Q', 1, airCP)) < 1e-6);
// Cornell and Montonna (1933): ethanol mass percent in the liquid and in the vapor at 1 atm
const CM = [[0.76, 6.15], [1.27, 10.97], [2.02, 19.98], [2.27, 19.78], [3.01, 26.20], [3.50, 29.03], [4.96, 37.48], [6.15, 42.31], [6.86, 44.80], [8.48, 49.22], [10.08, 53.10], [13.60, 58.87],
  [15.09, 61.03], [17.16, 63.01], [18.99, 64.64], [19.38, 65.11], [20.96, 66.30], [22.69, 67.74], [25.30, 69.04], [26.92, 69.64], [29.89, 71.31], [32.90, 72.28], [33.23, 72.84], [36.56, 73.70],
  [38.08, 74.01], [41.17, 74.77], [45.07, 75.90], [48.84, 76.78], [52.86, 77.64], [56.94, 78.62], [61.24, 79.85], [65.57, 80.85], [68.52, 81.70], [70.89, 82.60], [74.77, 83.90], [77.99, 85.05],
  [81.51, 86.51], [83.96, 87.64], [85.99, 88.79], [87.97, 89.96], [90.06, 91.24], [92.77, 93.26], [94.20, 94.29], [95.50, 95.50], [96.27, 96.14], [98.07, 97.90]];
const dev = (fn) => { const d = CM.map(([wx, wy]) => 100 * run(`y = ${fn}('yv', ${EW}, 'P', 101325, 'x', molefraction(${EW}, ${wx / 100}), 'q', 0)\nw = massfraction(${EW}, y)`).st.w - wy);
  return { rms: Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length), max: Math.max(...d.map(Math.abs)) }; };
const dr = dev('mixture'), di = dev('idealmixture');
ok('ethanol-water at 1 atm against the 46 measurements of Cornell and Montonna: mixture() within 1 mass % rms (3 % at most); Raoult\'s law off by over 10 % rms',
  dr.rms < 1 && dr.max < 3 && di.rms > 10, [dr, di]);
const az = run(`T_b = mixture('T', ${EW}, 'P', 1e5, 'x', x, 'q', 0)\nT_d = mixture('T', ${EW}, 'P', 1e5, 'x', x, 'q', 1)\nT_b = T_d`, { x: 0.85 }).st;
ok('the azeotrope at 100 kPa: x = 0.899, 351.39 K measured by Susial et al. (2021); here within 0.01 and 0.4 K', Math.abs(az.x - 0.899) < 0.01 && Math.abs(az.T_b - 351.39) < 0.4, [az.x, az.T_b]);
const r2 = run(`xl = mixture('xl', ${EW}, 'T', 360, 'P', 101325, 'q', 0)\nyv = mixture('yv', ${EW}, 'T', 360, 'P', 101325, 'q', 1)\nT_b = mixture('T', ${EW}, 'P', 101325, 'x', xl, 'q', 0)\nT_d = mixture('T', ${EW}, 'P', 101325, 'x', yv, 'q', 1)
T = mixture('T', ${EW}, 'P', 101325, 'x', 0.2, 'q', 0.3)\nq = mixture('q', ${EW}, 'T', T, 'P', 101325, 'x', 0.2)\nP = mixture('P', ${EW}, 'T', 360, 'x', 0.2, 'q', 0.6)\nq_2 = mixture('q', ${EW}, 'T', 360, 'P', P, 'x', 0.2)
h = mixture('h', ${EW}, 'T', 362, 'P', 101325, 'x', 0.2)\nT_h = mixture('T', ${EW}, 'P', 101325, 'x', 0.2, 'h', h)`).st;
ok('real: T, P, q = 0 or 1 gives the liquid and vapor in equilibrium (their bubble and dew points are T); round trips through (P, x, q), (T, x, q), (P, x, h)',
  Math.abs(r2.T_b - 360) < 1e-6 && Math.abs(r2.T_d - 360) < 1e-6 && near(r2.q, 0.3, 1e-8) && near(r2.q_2, 0.6, 1e-8) && Math.abs(r2.T_h - 362) < 1e-6, r2);
ok('real: one phase, q = -0.001 below the bubble point (300 K) and 1.001 above the dew point (400 K)', v(`mixture('q', ${EW}, 'T', 300, 'P', 101325, 'x', 0.2)`) === -0.001 && v(`mixture('q', ${EW}, 'T', 400, 'P', 101325, 'x', 0.2)`) === 1.001);

// ---- mass and mole fractions
const Me = CP.Props1SI('Ethanol', 'M'), Mw = CP.Props1SI('Water', 'M'), Mo = CP.Props1SI('o-Xylene', 'M');
ok('massfraction and molefraction: the first fluid of two; fluid i of three; round trip', near(v(`massfraction(${EW}, 0.2)`), 0.2 * Me / (0.2 * Me + 0.8 * Mw), 1e-14) &&
  near(v(`molefraction(${EW}, massfraction(${EW}, 0.2))`), 0.2, 1e-14) && near(v(`massfraction(${TX}, ${z3}, 3)`), 0.4 * Mo / (0.3 * Mb + 0.3 * Mt + 0.4 * Mo), 1e-14) &&
  near(v(`molefraction(${TX}, [massfraction(${TX}, ${z3}, 1), massfraction(${TX}, ${z3}, 2), massfraction(${TX}, ${z3}, 3)], 2)`), 0.3, 1e-13));
ok("M: the molar mass of the mixture", near(v(`mixture('M', ${EW}, 'T', 300, 'P', 101325, 'x', 0.2)`), 0.2 * Me + 0.8 * Mw, 1e-14));

// ---- Check Units and messages
const u = units(`T = 300 [K]\nP = 1 [atm]\nh = mixture('h', ${EW}, 'T', T, 'P', P, 'x', 0.2)\nx_l = mixture('xl', ${EW}, 'T', T, 'P', P, 'x', 0.2)\nM = mixture('M', ${EW}, 'T', T, 'P', P, 'x', 0.2)\nbad = idealmixture('h', ${BT}, 'T', P, 'P', P, 'x', 0.2)`);
ok('Check: h in J/kg, xl dimensionless, M in kg/mol; a pressure given for T is flagged', u.issues.length === 1 && /idealmixture\(\) expects \[K\]/.test(u.issues[0]) && u.p.variables.get('h').inferredUnit === 'J/kg' &&
  /^kg ?\/ ?mol$/.test(u.p.variables.get('M').inferredUnit), [u.issues, u.p.variables.get('h').inferredUnit, u.p.variables.get('M').inferredUnit]);
messages([
  ['no such fluid', err(`x_ = mixture('T', 'ethanol&whisky', 'P', 1e5, 'x', 0.2, 'q', 0)`), /mixture\(\): 'whisky' is not a CoolProp fluid/],
  ['a mixture', err(`x_ = idealmixture('T', 'R410A&water', 'P', 1e5, 'x', 0.2, 'q', 0)`), /idealmixture\(\): 'R410A' is itself a mixture; name pure fluids/],
  ['one fluid', err(`x_ = mixture('T', 'water', 'P', 1e5, 'x', 0.2, 'q', 0)`), /mixture\(\): name the fluids joined by &, as 'ethanol&water'/],
  ['no parameters', err(`x_ = mixture('T', 'ammonia&water', 'P', 1e5, 'x', 0.2, 'q', 0)`), /mixture\(\): CoolProp has no parameters for the pair Ammonia and Water; idealmixture\(\) \(Raoult's law\) works for any fluids/],
  ['above Tc', err(`x_ = idealmixture('q', 'CO2&water', 'T', 350, 'P', 1e6, 'x', 0.05)`), /idealmixture\(\): Raoult's law needs the vapor pressure of CarbonDioxide, known from .* K to its critical temperature, 304\.1\d* K; T = 350 K/],
  ['sum', err(`x_ = idealmixture('T', ${TX}, 'P', 1e5, 'x', [0.3, 0.3, 0.3], 'q', 0)`), /the mole fractions add up to 0\.9, not 1/],
  ['scalar x', err(`x_ = idealmixture('T', ${TX}, 'P', 1e5, 'x', 0.3, 'q', 0)`), /with 3 fluids, give x as an array of their 3 mole fractions/],
  ['length', err(`x_ = idealmixture('T', ${TX}, 'P', 1e5, 'x', [0.5, 0.5], 'q', 0)`), /x has 2 mole fractions for 3 fluids/],
  ['output x of 3', err(`x_ = idealmixture('yv', ${TX}, 'P', 1e5, 'x', ${z3}, 'q', 0)`), /unknown output 'yv'; use T, P, q, h, s, u, v, M, x1, xl1, yv1 \.\.\. x3, xl3, yv3/],
  ['T,P,q of 3', err(`x_ = idealmixture('T', ${TX}, 'T', 360, 'P', 1e5, 'q', 0)`), /T, P and q fix the phases only for two fluids; give x as well/],
  ['q range', err(`x_ = mixture('T', ${EW}, 'P', 1e5, 'x', 0.2, 'q', 1.5)`), /q = 1\.5 must be a molar vapor fraction from 0 to 1/],
  ['inputs', err(`x_ = mixture('T', ${EW}, 'P', 1e5, 'P', 2e5, 'x', 0.2)`), /input 'P' is given twice/],
  ['input pair', err(`x_ = mixture('T', ${EW}, 'P', 1e5, 'T', 300, 'h', 0)`), /the inputs must be T, P, x or P, x, q or T, x, q or T, P, q or P, x, h/],
  ['no two phases', err(`x_ = mixture('xl', ${EW}, 'T', 300, 'P', 101325, 'q', 0)`), /at T = 300 K, P = 101325 Pa there are no two phases of ethanol&water in equilibrium/],
  ['conversion', err(`x_ = massfraction(${TX}, ${z3})`), /massfraction\(\): give the index of the fluid wanted, 1 to 3/],
]);
done();
