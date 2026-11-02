// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Generalized compressibility (Lee-Kesler) and the fugacity of CoolProp fluids: printed Lee-Kesler table values, the
// saturation table of Borgnakke and Sonntag, thermodynamic identities between Z, phi and the departures, the choice of
// root, warnings, messages and Check; fugacity against CoolProp's residual Gibbs energy and dln(f)/dP = v/(R T).
import { E, CP, run, err, units, logs } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const warns = () => logs.filter(l => /^WARN: /.test(l));
const v = (expr) => run(`z_ = ${expr}`).st.z_;
const WR = 0.3978;

// 1. Printed Lee-Kesler tables (Smith, Van Ness and Abbott, App. E): Z0, Z1, (H^R)0/RTc, (H^R)1/RTc, (S^R)0/R, (S^R)1/R,
//    phi0, phi1 (the residuals H^R and S^R are minus the departures returned here). null: not used.
const TABLE = [
  [1.0, 0.1, [0.9659, -0.0069, -0.1027, -0.0926, -0.0690, -0.0857, 0.9669, null]],
  [1.0, 0.9, [0.5477, -0.0665, -1.4553, -1.3065, -1.1042, -1.2422, 0.7039, 0.9377]],
  [0.8, 0.9, [0.1467, -0.0588, -4.4965, -5.2808, -4.2834, -5.4598, 0.2626, 0.3194]],   // liquid
  [0.8, 1.0, [0.1626, -0.0648, -4.4937, -5.2845, null, null, null, null]],
  [1.4, 0.8, [0.9062, 0.0661, -0.4627, -0.1004, -0.2373, -0.1329, 0.9110, 1.0631]],
  [1.4, 0.9, [0.8945, null, null, null, null, null, null, null]],
];
let worst = 0, n = 0;
for (const [Tr, Pr, row] of TABLE) {
  const at = (f, w) => C(f, Tr, Pr, w);
  const z0 = at('lk_z', 0), h0 = -at('lk_hdep', 0), s0 = -at('lk_sdep', 0), p0 = at('lk_phi', 0);
  const calc = [z0, (at('lk_z', WR) - z0) / WR, h0, (-at('lk_hdep', WR) - h0) / WR, s0, (-at('lk_sdep', WR) - s0) / WR, p0, (at('lk_phi', WR) / p0) ** (1 / WR)];
  row.forEach((b, i) => { if (b === null) return; n++; worst = Math.max(worst, Math.abs(calc[i] - b)); });
}
note('largest difference from the printed tables', worst, 'in', n, 'values');
ok(`${n} printed table values (Tr = 0.8, 1.0, 1.4; liquid and vapor; both fluids) reproduced to the last printed digit`, worst <= 1.01e-4, worst);

// 2. Saturation of the simple fluid (Borgnakke and Sonntag, Table D.3: Pr_sat, Z_f, Z_g), from equal fugacities
const D3 = [[0.4, 2.7e-4, 6.5e-5, 0.999], [0.5, 4.6e-3, 9.5e-4, 0.988], [0.6, 0.028, 0.0052, 0.957], [0.7, 0.099, 0.017, 0.897],
  [0.8, 0.252, 0.042, 0.807], [0.85, 0.373, 0.062, 0.747], [0.9, 0.532, 0.090, 0.673], [0.95, 0.737, 0.132, 0.569]];
const lnphi = (Tr, Pr, ph, w = 0) => Math.log(C('lk_phi', Tr, Pr, w, ph));
const psat = (Tr, w = 0, guess) => {
  let lo = guess * 0.7, hi = Math.min(guess * 1.3, 0.999);
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (lnphi(Tr, m, 'liquid', w) > lnphi(Tr, m, 'vapor', w)) lo = m; else hi = m; }
  return (lo + hi) / 2;
};
let dev = [0, 0, 0];
for (const [Tr, P, Zf, Zg] of D3) {
  const p = psat(Tr, 0, P);
  dev = [Math.max(dev[0], Math.abs(p / P - 1)), Math.max(dev[1], Math.abs(C('lk_z', Tr, p, 0, 'liquid') / Zf - 1)), Math.max(dev[2], Math.abs(C('lk_z', Tr, p, 0, 'vapor') / Zg - 1))];
}
note('Table D.3: largest relative differences of Pr_sat, Z_f, Z_g', dev);
ok('Table D.3: Pr_sat within 0.7 %, Z_f within 0.8 % (printed to two digits), Z_g within 0.5 %', dev[0] < 0.007 && dev[1] < 0.008 && dev[2] < 0.005, dev);
ok('simple fluid at Tr = 0.7: Pr_sat = 0.0988, close to 0.1, which defines omega = 0', near(psat(0.7, 0, 0.1), 0.0988, 2e-3));

// 3. Identities, for a fluid with omega = 0.2 in vapor, liquid and supercritical states:
//    Z - 1 = Pr dln(phi)/dPr, (h* - h)/(R Tc) = Tr^2 dln(phi)/dTr, (s* - s)/R = (h* - h)/(R T) + ln(phi)
const W = 0.2;
for (const [Tr, Pr, what] of [[0.9, 0.3, 'vapor'], [0.7, 2, 'liquid'], [1.3, 3, 'supercritical'], [2.5, 8, 'dense gas']]) {
  const lp = (t, p) => Math.log(C('lk_phi', t, p, W)), d = 1e-5;
  const Z = C('lk_z', Tr, Pr, W), hd = C('lk_hdep', Tr, Pr, W), sd = C('lk_sdep', Tr, Pr, W);
  const dP = (lp(Tr, Pr * (1 + d)) - lp(Tr, Pr * (1 - d))) / (2 * d), dT = (lp(Tr * (1 + d), Pr) - lp(Tr * (1 - d), Pr)) / (2 * d * Tr);
  ok(`${what} (Tr = ${Tr}, Pr = ${Pr}): Z - 1 = Pr dln(phi)/dPr`, near(Z - 1, dP, 1e-7), [Z - 1, dP]);
  ok(`${what}: h departure = Tr^2 dln(phi)/dTr`, near(hd, Tr * Tr * dT, 1e-7), [hd, Tr * Tr * dT]);
  ok(`${what}: s departure = h departure/Tr + ln(phi)`, near(sd, hd / Tr + lp(Tr, Pr), 1e-12), [sd, hd / Tr + lp(Tr, Pr)]);
}
ok('ideal-gas limit Pr -> 0: Z = 1, departures 0, phi = 1', near(C('lk_z', 1.2, 1e-9), 1, 1e-8) && Math.abs(C('lk_hdep', 1.2, 1e-9)) < 1e-8 && Math.abs(C('lk_sdep', 1.2, 1e-9)) < 1e-8 && near(C('lk_phi', 1.2, 1e-9), 1, 1e-8));
ok('omega mixes linearly: Z(omega) = Z0 + omega Z1', near(C('lk_z', 1.1, 2, 0.5), C('lk_z', 1.1, 2) + 0.5 * (C('lk_z', 1.1, 2, WR) - C('lk_z', 1.1, 2)) / WR, 1e-12));
ok('negative omega accepted (as for hydrogen): Z1 > 0 at Tr = 3, so Z falls below Z0', C('lk_z', 3, 1, -0.2) < C('lk_z', 3, 1) && C('lk_z', 3, 1, -0.2) > 0.9);

// 4. Choice of root: the stable one by default, the other on request; one root above Tr = 1
const pz = psat(0.7, 0, 0.1);
ok('just below Pr_sat: vapor; just above: liquid', C('lk_z', 0.7, pz * 0.999) > 0.8 && C('lk_z', 0.7, pz * 1.001) < 0.02);
ok("metastable roots on request: 'liquid' below Pr_sat, 'vapor' above it", C('lk_z', 0.7, pz * 0.9, 0, 'liquid') < 0.02 && C('lk_z', 0.7, pz * 1.1, 0, 'vapor') > 0.8);
ok("supercritical: 'liquid' and 'vapor' give the one root", C('lk_z', 1.5, 2, 0.1, 'liquid') === C('lk_z', 1.5, 2, 0.1, 'vapor') && C('lk_z', 1.5, 2, 0.1) === C('lk_z', 1.5, 2, 0.1, 'vapor'));
ok('corners of the tables found (Tr = 0.3 and 4, Pr = 0.01 and 10)', [[0.3, 0.01], [0.3, 10], [4, 0.01], [4, 10]].every(([t, p]) => [0, 0.5].every(w => Number.isFinite(C('lk_z', t, p, w)) && C('lk_z', t, p, w) > 0)));
const pw = psat(0.8, W, 0.2);
ok(`omega = ${W}: the phase switches where the mixed fugacities are equal`, near(lnphi(0.8, pw, 'liquid', W), lnphi(0.8, pw, 'vapor', W), 1e-9) && C('lk_z', 0.8, pw * 0.99, W) > 0.5 && C('lk_z', 0.8, pw * 1.01, W) < 0.1);

// 5. Methane at 300 K, 10 MPa against CoolProp (a nonpolar gas: within 1 %)
const r = run(`Tc = criticaltemperature('methane')\nPc = criticalpressure('methane')\nw = acentricfactor('methane')\nZ = lk_z(300/Tc, 1e7/Pc, w)\nphi = lk_phi(300/Tc, 1e7/Pc, w)\nZ_cp = compressibilityfactor('methane', 300, 1e7)\nphi_cp = fugacitycoefficient('methane', 300, 1e7)`).st;
ok('methane: Z and phi within 1 % of CoolProp', near(r.Z, r.Z_cp, 0.01) && near(r.phi, r.phi_cp, 0.01), [r.Z, r.Z_cp, r.phi, r.phi_cp]);

// 6. Warnings outside the tables, at the solution only; messages
logs.length = 0; run(`z = lk_z(Tr, 12)\nTr = 1.5`);
ok('Pr above 10: one warning', warns().length === 1 && /lk_z\(\): Pr = 12 is above 10, the limit of its range \(Lee and Kesler \(1975\)\)/.test(warns()[0]), warns());
logs.length = 0; run(`z = lk_z(0.25, 0.001)`);
ok('Tr below 0.3: a warning', warns().length === 1 && /Tr = 0\.25 is outside its range, 0\.3 to 4/.test(warns()[0]), warns());
logs.length = 0; run(`z = lk_z(1.5, 2, 0.1)`);
ok('inside the tables: no warning', warns().length === 0, warns());
messages([
  ['phase', err(`z = lk_z(0.8, 1, 0, 'gas')`), /lk_z\(\): 'gas' should be one of 'liquid', 'vapor'/],
  ['Tr', err(`z = lk_z(0, 1)`), /lk_z\(\): Tr = 0 must be positive/],
  ['Pr<0', err(`z = lk_z(1, -1)`), /lk_z\(Tr, Pr, omega, phase\): Pr = -1 must be positive/],
  ['nargs', err(`z = lk_hdep(1)`), /lk_hdep\(Tr, Pr, omega, phase\) takes 2 to 4 arguments, got 1/],
]);

// 7. Fugacity of CoolProp fluids
const R = (f) => CP.Props1SI('gas_constant', f);
const lnphiCP = Math.log(v(`fugacitycoefficient('CO2', 300, 1e6)`));
ok('CO2 at 300 K, 1 MPa: ln(phi) = Gmolar_residual/(R T) - ln(Z)', near(lnphiCP, CP.PropsSI('Gmolar_residual', 'T', 300, 'P', 1e6, 'CO2') / (R('CO2') * 300) - Math.log(CP.PropsSI('Z', 'T', 300, 'P', 1e6, 'CO2')), 1e-12), lnphiCP);
const lf = (p) => Math.log(v(`fugacity('R134a', 350, ${p})`)), P1 = 2e6, dp = 200;
const vm = 1 / CP.PropsSI('Dmolar', 'T', 350, 'P', P1, 'R134a');
ok('R134a vapor: dln(f)/dP = v/(R T)', near((lf(P1 + dp) - lf(P1 - dp)) / (2 * dp), vm / (R('R134a') * 350), 1e-6));
const fl = v(`fugacity('CO2', 'T', 280, 'Q', 0)`), fv = v(`fugacity('CO2', 'T', 280, 'Q', 1)`), fm = v(`fugacity('CO2', 'T', 280, 'Q', 0.3)`);
ok('saturated CO2: f of the liquid = f of the vapor = f of the two-phase mixture', near(fl, fv, 1e-9) && fm === fl, [fl, fv, fm]);
const fw = v(`fugacity('water', 298.15, 101325)`), fsat = v(`fugacity('water', 'T', 298.15, 'Q', 0)`), vl = 1 / CP.PropsSI('Dmolar', 'T', 298.15, 'P', 101325, 'Water');
ok('liquid water at 25 C, 1 atm: f = f_sat exp(v (P - Psat)/(R T)) (Poynting), about 3.17 kPa', near(fw, fsat * Math.exp(vl * (101325 - v(`saturationpressure('water', 298.15)`)) / (R('Water') * 298.15)), 1e-6) && near(fw, 3170, 2e-3), [fw, fsat]);
ok('air at 1 atm: phi within 0.1 % of 1', near(v(`fugacitycoefficient('air', 300, 101325)`), 1, 1e-3));
messages([
  ['ice', err(`z = fugacity('ice', 260, 101325)`), /fugacity\(\): not available for ice or for water vapor below the triple point/],
  ['solid', err(`z = fugacity('copper', 300, 1e5)`), /'copper' is a solid/],
]);

// 8. Check: dimensionless arguments for lk_*, Pa for fugacity
const u = units(`T = 300 [K]\nP = 1 [MPa]\nTc = criticaltemperature('CO2')\nPc = criticalpressure('CO2')\nZ = lk_z(T/Tc, P/Pc, 0.224)\nbad = lk_z(T, P/Pc)\nf = fugacity('CO2', T, P)\nphi = fugacitycoefficient('CO2', T, P)`);
ok('Check: a temperature passed as Tr is flagged; fugacity in Pa, phi dimensionless', u.issues.length === 1 && /lk_z\(\) takes dimensionless arguments but got \[K\]/.test(u.issues[0]) &&
  u.p.variables.get('f').inferredUnit === 'Pa' && ['', '-', undefined].includes(u.p.variables.get('phi').inferredUnit), [u.issues, u.p.variables.get('f').inferredUnit, u.p.variables.get('phi').inferredUnit]);
done();
