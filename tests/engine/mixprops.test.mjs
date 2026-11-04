// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Fugacities, activity coefficients and excess properties of mixtures (thermo.js, Mixtures.extra), activity-coefficient models
// (gammamixture), Kay's rule (pseudocritical) and the Joule-Thomson functions: equal fugacities in the two phases, the
// Gibbs-Helmholtz relation between gE and hE, pure-fluid limits, the infinite-dilution limits and the Gibbs-Duhem relation of
// each model, a van Laar model from mixture()'s own infinite-dilution activity coefficients, mu_JT = v (T beta - 1)/cp, the
// zero-pressure inversion temperature from the second virial coefficient, messages, Check Units.
import { CP, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const v = (expr, g) => run(`x_ = ${expr}`, g).st.x_;
const EW = "'ethanol&water'", BT = "'benzene&toluene'", R = 8.314462618;

// ---- mixture(): fugacities, activity coefficients, excess properties
const at = (o) => v(`mixture('${o}', ${EW}, 'P', 101325, 'x', 0.2, 'q', 0)`);
ok('at the bubble point the fugacity of each fluid is the same in both phases: x phil = y phiv, to 1e-8', near(0.2 * at('phil1'), at('yv') * at('phiv1'), 1e-8) &&
  near(0.8 * at('phil2'), (1 - at('yv')) * at('phiv2'), 1e-8) && near(at('f1'), 0.2 * at('phil1') * 101325, 1e-12));
const gE = (T) => v(`mixture('gE', ${EW}, 'T', ${T}, 'P', 101325, 'x', 0.3)`), hE = v(`mixture('hE', ${EW}, 'T', 300, 'P', 101325, 'x', 0.3)`), d = 0.5;
ok('Gibbs-Helmholtz: hE = -T^2 d(gE/T)/dT, to 1e-4 (two routes through the same equation of state)', near(hE, -300 * 300 * (gE(300 + d) / (300 + d) - gE(300 - d) / (300 - d)) / (2 * d), 1e-4 * Math.abs(hE)), hE);
const ex = run(`g_1 = mixture('gamma1', ${EW}, 'T', 300, 'P', 101325, 'x', 0.3)\ng_2 = mixture('gamma2', ${EW}, 'T', 300, 'P', 101325, 'x', 0.3)\ngE = mixture('gE', ${EW}, 'T', 300, 'P', 101325, 'x', 0.3)
hE = mixture('hE', ${EW}, 'T', 300, 'P', 101325, 'x', 0.3)\nsE = mixture('sE', ${EW}, 'T', 300, 'P', 101325, 'x', 0.3)\nvE = mixture('vE', ${EW}, 'T', 300, 'P', 101325, 'x', 0.3)`).st;
ok('ethanol-water at 300 K, x = 0.3: gE = R T sum x ln gamma, sE = (hE - gE)/T; mixing gives off heat and the volume shrinks (hE < 0, vE < 0)', near(ex.gE, R * 300 * (0.3 * Math.log(ex.g_1) + 0.7 * Math.log(ex.g_2)), 1e-12) &&
  near(ex.sE, (ex.hE - ex.gE) / 300, 1e-12) && ex.hE < 0 && ex.vE < 0 && ex.g_1 > 1 && ex.g_2 > 1, ex);
ok('a pure fluid is its own reference: gamma = 1 and hE = 0', Math.abs(v(`mixture('gamma1', ${EW}, 'T', 300, 'P', 101325, 'x', 1)`) - 1) < 1e-9 && Math.abs(v(`mixture('hE', ${EW}, 'T', 300, 'P', 101325, 'x', 1)`)) < 1e-6);
ok("idealmixture(): gamma = 1, hE = 0, phil = Psat/P, phiv = 1", v(`idealmixture('gamma1', ${BT}, 'T', 350, 'P', 101325, 'x', 0.4)`) === 1 && v(`idealmixture('hE', ${BT}, 'T', 350, 'P', 101325, 'x', 0.4)`) === 0 &&
  near(v(`idealmixture('phil1', ${BT}, 'T', 350, 'P', 101325, 'x', 0.4)`), CP.PropsSI('P', 'T', 350, 'Q', 0, 'Benzene') / 101325, 1e-12) && v(`idealmixture('phiv1', ${BT}, 'T', 380, 'P', 101325, 'x', 0.4)`) === 1);

// ---- gammamixture(): activity-coefficient models
const ideal = v(`idealmixture('T', ${BT}, 'P', 101325, 'x', 0.4, 'q', 0)`);
ok('zero excess Gibbs energy is Raoult\'s law: Margules [0, 0], Wilson [1, 1], NRTL [0, 0, 0.3] all give the bubble point of idealmixture()',
  [['margules', '[0, 0]'], ['wilson', '[1, 1]'], ['nrtl', '[0, 0, 0.3]'], ['vanlaar', '[1e-12, 1e-12]']].every(([m, p]) => Math.abs(v(`gammamixture('T', ${BT}, '${m}', ${p}, 'P', 101325, 'x', 0.4, 'q', 0)`) - ideal) < 1e-6));
const G = (m, p, x, i) => v(`gammamixture('gamma${i}', ${BT}, '${m}', ${p}, 'T', 340, 'P', 101325, 'x', ${x})`);
ok('infinite dilution: ln gamma1 -> A12 and ln gamma2 -> A21 (Margules and van Laar)', ['margules', 'vanlaar'].every(m => Math.abs(Math.log(G(m, '[0.6, 0.4]', 0, 1)) - 0.6) < 1e-12 && Math.abs(Math.log(G(m, '[0.6, 0.4]', 1, 2)) - 0.4) < 1e-12));
const GD = (m, p) => { const x = 0.3, h = 1e-5, l = (i, xx) => Math.log(G(m, p, xx, i)); return 0.3 * (l(1, x + h) - l(1, x - h)) / (2 * h) + 0.7 * (l(2, x + h) - l(2, x - h)) / (2 * h); };
ok('Gibbs-Duhem, x1 dln(gamma1) + x2 dln(gamma2) = 0, for each model, to 1e-8', [['margules', '[0.6, 0.4]'], ['vanlaar', '[0.6, 0.4]'], ['wilson', '[0.5, 0.8]'], ['nrtl', '[0.4, 0.2, 0.3]']].every(([m, p]) => Math.abs(GD(m, p)) < 1e-8),
  [['margules', '[0.6, 0.4]'], ['wilson', '[0.5, 0.8]'], ['nrtl', '[0.4, 0.2, 0.3]']].map(([m, p]) => GD(m, p)));
const TX = "'benzene&toluene&o-xylene'";
ok('three fluids: the Wilson matrix and the NRTL 6 x 3 matrix give the binary results when the third fluid is absent',
  Math.abs(v(`gammamixture('gamma1', ${TX}, 'wilson', [[1, 0.5, 0.9], [0.8, 1, 0.7], [1.1, 0.6, 1]], 'T', 340, 'P', 101325, 'x', [0.3, 0.7, 0])`) - G('wilson', '[0.5, 0.8]', 0.3, 1)) < 1e-12 &&
  Math.abs(v(`gammamixture('gamma1', ${TX}, 'nrtl', [[0, 0.4, 0.1], [0.2, 0, 0.3], [0.5, 0.1, 0], [0, 0.3, 0.3], [0.3, 0, 0.3], [0.3, 0.3, 0]], 'T', 340, 'P', 101325, 'x', [0.3, 0.7, 0])`) - G('nrtl', '[0.4, 0.2, 0.3]', 0.3, 1)) < 1e-12);
const l1 = Math.log(v(`mixture('gamma1', ${EW}, 'T', 345, 'P', 101325, 'x', 1e-6)`)), l2 = Math.log(v(`mixture('gamma2', ${EW}, 'T', 345, 'P', 101325, 'x', ${1 - 1e-6})`));
const dv = [0.05, 0.2, 0.5, 0.8].map(x => v(`gammamixture('T', ${EW}, 'vanlaar', [${l1}, ${l2}], 'P', 101325, 'x', ${x}, 'q', 0)`) - v(`mixture('T', ${EW}, 'P', 101325, 'x', ${x}, 'q', 0)`));
ok("van Laar with the infinite-dilution activity coefficients of mixture() at 345 K: bubble points of ethanol-water within 0.5 K of mixture()", dv.every(x => Math.abs(x) < 0.5), [l1, l2, dv]);
const hs = run(`h_g = gammamixture('h', ${EW}, 'margules', [1.6, 0.8], 'T', 340, 'P', 101325, 'x', 0.3)\nh_i = idealmixture('h', ${EW}, 'T', 340, 'P', 101325, 'x', 0.3)
s_g = gammamixture('s', ${EW}, 'margules', [1.6, 0.8], 'T', 340, 'P', 101325, 'x', 0.3)\ns_i = idealmixture('s', ${EW}, 'T', 340, 'P', 101325, 'x', 0.3)\ngE = gammamixture('gE', ${EW}, 'margules', [1.6, 0.8], 'T', 340, 'P', 101325, 'x', 0.3)
M = idealmixture('M', ${EW}, 'T', 340, 'P', 101325, 'x', 0.3)`).st;
ok('parameters independent of T: the liquid has the h of an ideal solution and its s lowered by gE/T', hs.h_g === hs.h_i && near(hs.s_g, hs.s_i - hs.gE / 340 / hs.M, 1e-12), hs);

// ---- Kay's rule
const Tc = (f) => CP.Props1SI(f, 'Tcrit'), Pc = (f) => CP.Props1SI(f, 'pcrit'), w = (f) => CP.Props1SI(f, 'acentric');
ok("pseudocritical(): Kay's mole-fraction averages of Tc, Pc and the acentric factor; two and three fluids", near(v("pseudocritical('Tc', 'nitrogen&CO2', 0.8)"), 0.8 * Tc('Nitrogen') + 0.2 * Tc('CO2'), 1e-14) &&
  near(v("pseudocritical('Pc', 'nitrogen&CO2', 0.8)"), 0.8 * Pc('Nitrogen') + 0.2 * Pc('CO2'), 1e-14) && near(v("pseudocritical('omega', 'methane&ethane&propane', [0.9, 0.07, 0.03])"), 0.9 * w('Methane') + 0.07 * w('Ethane') + 0.03 * w('Propane'), 1e-14));

// ---- Joule-Thomson
const [T, P] = [300, 1e5], be = CP.PropsSI('isobaric_expansion_coefficient', 'T', T, 'P', P, 'Nitrogen'), cp = CP.PropsSI('Cpmass', 'T', T, 'P', P, 'Nitrogen'), rho = CP.PropsSI('Dmass', 'T', T, 'P', P, 'Nitrogen');
ok('joulethomson(): mu = v (T beta - 1)/cp of nitrogen at 300 K, 1 bar (0.21 K/bar), to 1e-10', near(v("joulethomson('nitrogen', 300, 1e5)"), (T * be - 1) / (rho * cp), 1e-10));
const Ti = v("inversiontemperature('nitrogen', 1e6)"), Tl = v("inversiontemperature('nitrogen', 1e7, 'lower')");
ok('at the inversion temperatures mu = 0 (upper at 10 bar, lower at 100 bar), and the lower lies below the upper', Math.abs(v(`joulethomson('nitrogen', ${Ti}, 1e6)`)) < 1e-12 && Math.abs(v(`joulethomson('nitrogen', ${Tl}, 1e7)`)) < 1e-12 && Tl < v("inversiontemperature('nitrogen', 1e7)"), [Ti, Tl]);
const B = (t) => CP.PropsSI('Bvirial', 'T', t, 'Dmolar', 1e-3, 'Nitrogen'), fB = (t) => B(t) - t * (B(t + 0.01) - B(t - 0.01)) / 0.02;
let a = 400, b = 900; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (fB(m) * fB(a) > 0) a = m; else b = m; }
ok('at low pressure (100 Pa) the upper inversion temperature is where B = T dB/dT, B the second virial coefficient of CoolProp nitrogen, within 0.01 K', Math.abs(v("inversiontemperature('nitrogen', 100)") - a) < 0.01, [v("inversiontemperature('nitrogen', 100)"), a]);

const u = units(`T = 300 [K]\nP = 1 [bar]\nmu = joulethomson('nitrogen', T, P)\nT_i = inversiontemperature('nitrogen', P)\nh_E = mixture('hE', ${EW}, 'T', T, 'P', P, 'x', 0.3)\nf = mixture('f1', ${EW}, 'T', T, 'P', P, 'x', 0.3)\nT_c = pseudocritical('Tc', 'nitrogen&CO2', 0.8)`);
ok('Check: mu in K/Pa, the inversion temperature and Tc in K, hE in J/mol, f in Pa', u.issues.length === 0 && /^K ?\/ ?Pa$|^m s\^2 K \/ kg$/.test(u.p.variables.get('mu').inferredUnit) && u.p.variables.get('T_i').inferredUnit === 'K' &&
  /^J ?\/ ?mol$/.test(u.p.variables.get('h_E').inferredUnit) && u.p.variables.get('f').inferredUnit === 'Pa' && u.p.variables.get('T_c').inferredUnit === 'K', [u.issues, ['mu', 'T_i', 'h_E', 'f', 'T_c'].map(n => u.p.variables.get(n).inferredUnit)]);
messages([
  ['liquid only', err(`x_ = mixture('gamma1', ${EW}, 'T', 400, 'P', 101325, 'x', 0.2)`), /'gamma1' is a property of the liquid, and this state \(q = 1\.001\) is all vapor/],
  ['vapor only', err(`x_ = mixture('phiv1', ${EW}, 'T', 300, 'P', 101325, 'x', 0.2)`), /'phiv1' is a property of the vapor, and this state \(q = -0\.001\) is all liquid/],
  ['model', err(`x_ = gammamixture('T', ${BT}, 'uniquac', [1, 1], 'P', 1e5, 'x', 0.4, 'q', 0)`), /unknown model 'uniquac'; use margules, vanlaar, wilson or nrtl/],
  ['params', err(`x_ = gammamixture('T', ${BT}, 'nrtl', [1, 1], 'P', 1e5, 'x', 0.4, 'q', 0)`), /the nrtl model takes \[tau12, tau21, alpha\]/],
  ['margules 3', err(`x_ = gammamixture('T', ${TX}, 'margules', [1, 1], 'P', 1e5, 'x', [0.3, 0.3, 0.4], 'q', 0)`), /the margules model takes \[A12, A21\] and two fluids/],
  ['van Laar sign', err(`x_ = gammamixture('T', ${BT}, 'vanlaar', [1, -1], 'P', 1e5, 'x', 0.4, 'q', 0)`), /the van Laar parameters A12 and A21 must be nonzero and of the same sign/],
  ['arguments', err(`x_ = gammamixture('T', ${BT}, 'P', 1e5, 'x', 0.4, 'q', 0)`), /use gammamixture\('output', 'fluid1&fluid2', 'model', \[parameters\]/],
  ['pseudo', err("x_ = pseudocritical('Zc', 'nitrogen&CO2', 0.8)"), /unknown output 'Zc'; use Tc, Pc or omega/],
  ['inversion', err("x_ = inversiontemperature('nitrogen', 1e8)"), /'nitrogen' has no inversion temperature at P = 100000000 Pa \(above its maximum inversion pressure\?\)/],
  ['branch', err("x_ = inversiontemperature('nitrogen', 1e6, 'middle')"), /the third argument is 'upper' or 'lower'/],
]);
done();
