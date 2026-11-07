// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Seawater (thermo.js): seawater() at atmospheric pressure against the MIT seawater property tables (K. G. Nayar, M. H. Sharqawy
// and J. H. Lienhard V, "2017 MIT Seawater Property Tables", web.mit.edu/seawater: Tables 2, 7, 16 and 21 at P0); oceandepth()
// against the check values of UNESCO Technical Paper 44 (Fofonoff and Millard 1983) and of the R package marelac (sw_depth);
// oceanpressure() as its inverse; the hydrostatic slope at the surface against seawater('rho') at 0 degC, S = 0.035; Check Units;
// backward solving; messages.
import { run, err, units, CP, E } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const v = (expr, g) => run(`x = ${expr}`, g).st.x;
const rel = (a, b) => Math.abs(a / b - 1);

// ---- seawater() against the MIT tables: rows 20, 40, 80 degC; columns 0, 40, 80 g/kg
const TAB = {
  rho: [[998.0, 1028.8, 1059.5], [992.2, 1022.1, 1052.0], [971.8, 1001.1, 1030.5]],
  cp: [[4189.4, 3973.4, 3784.1], [4181.4, 3982.3, 3801.9], [4194.1, 4002.8, 3824.9]],
  k: [[0.604, 0.601, 0.599], [0.630, 0.628, 0.626], [0.665, 0.664, 0.662]],
  mu: [[1.002e-3, 1.089e-3, 1.197e-3], [0.653e-3, 0.716e-3, 0.791e-3], [0.354e-3, 0.393e-3, 0.437e-3]],
};
const TOL = { rho: 2e-4, cp: 6e-4, k: 1e-3, mu: 1.5e-3 };   // the printed digits, and CoolProp's fit for rho, cp and k
for (const [o, t] of Object.entries(TAB)) {
  let worst = 0;
  [20, 40, 80].forEach((T, i) => [0, 0.04, 0.08].forEach((S, j) => { worst = Math.max(worst, rel(v(`seawater('${o}', ${T + 273.15}, ${S})`), t[i][j])); }));
  ok(`seawater('${o}'): the 9 values of the MIT table within ${TOL[o] * 100} %`, worst < TOL[o], worst);
}
const st = run("T = 25 [degC]\nS = 0.035\nrho = seawater('rho', T, S)\ncp = seawater('cp', T, S)\nk = seawater('k', T, S)\nmu = seawater('mu', T, S)\nnu = seawater('nu', T, S)\nalpha = seawater('alpha', T, S)\nPr = seawater('Pr', T, S)").st;
ok('nu, alpha and Pr follow from rho, cp, k and mu', near(st.nu, st.mu / st.rho, 1e-14) && near(st.alpha, st.k / (st.rho * st.cp), 1e-14) && near(st.Pr, st.mu * st.cp / st.k, 1e-12));
ok('S = 0: the density of pure water (CoolProp IAPWS-95) within 0.03 % from 5 to 95 degC', [278.15, 298.15, 323.15, 348.15, 368.15].every(T => rel(v(`seawater('rho', ${T}, 0)`), CP.PropsSI('D', 'T', T, 'P', 101325, 'Water')) < 3e-4));
ok("output names ignore case; the ends of the ranges work", v("seawater('PR', 298.15, 0.035)") === st.Pr && Number.isFinite(v("seawater('rho', 273.15, 0)")) && Number.isFinite(v("seawater('mu', 393.15, 0.12)")));
ok('solved backward: the salinity that gives 1028.8 kg/m^3 at 20 degC is 40 g/kg, as in the table', Math.abs(run("T = 20 [degC]\n1028.8 = seawater('rho', T, S)", { S: 0.03 }).st.S - 0.04) < 2e-4);

// ---- the ocean: UNESCO 1983 depth from pressure, and its inverse
const deg = Math.PI / 180, P = (dbar) => 101325 + dbar * 1e4;
ok('oceandepth: 9712.653 m at 10000 dbar and 30 deg, the check value of UNESCO Tech. Paper 44', Math.abs(v(`oceandepth(${P(1e4)}, ${30 * deg})`) - 9712.653) < 5e-4);
ok('oceandepth: the check values of marelac sw_depth, 496.00 m (500 dbar, 30 deg), 494.69 m (500 dbar, 60 deg), 4895.60 m (5000 dbar, 60 deg)',
  Math.abs(v(`oceandepth(${P(500)}, ${30 * deg})`) - 496.00) < 0.005 && Math.abs(v(`oceandepth(${P(500)}, ${60 * deg})`) - 494.69) < 0.005 && Math.abs(v(`oceandepth(${P(5000)}, ${60 * deg})`) - 4895.60) < 0.005);
ok('oceanpressure inverts oceandepth to 1e-9 m, from 0 to 9000 m, at the equator, 45 deg and the pole',
  [0, 0.5, 100, 2500, 9000].every(z => [0, 45, 90].every(la => Math.abs(v(`oceandepth(oceanpressure(${z}, ${la * deg}), ${la * deg})`) - z) < 1e-9)));
const hs = run('lat = 30 [deg]\nP_1 = oceanpressure(1, lat)\nP_0 = oceanpressure(0, lat)\ng = 9.780318*(1 + (5.2788e-3 + 2.36e-5*sin(lat)^2)*sin(lat)^2)\nrho_h = (P_1 - P_0)/(g*1)\nrho = seawater(\'rho\', 273.15, 0.035)').st;
ok('the hydrostatic slope at the surface gives the density of the standard ocean (0 degC, S = 35), as seawater() does, within 0.02 %', rel(hs.rho_h, hs.rho) < 2e-4, [hs.rho_h, hs.rho]);
ok('the surface is P = 101325 Pa at z = 0', v('oceandepth(101325, 0.5)') === 0 && Math.abs(v('oceanpressure(0, 0.5)') - 101325) < 1e-6);

// ---- Check Units
const u = units("T = 20 [degC]\nS = 0.035\nrho = seawater('rho', T, S)\nmu = seawater('mu', T, S)\nlat = 30 [deg]\nz = 100 [m]\nP = oceanpressure(z, lat)\nd = oceandepth(P, lat)");
ok('Check: rho in kg/m^3, mu in Pa s, P in Pa, d in m; no issue', u.issues.length === 0 && u.p.variables.get('rho').inferredUnit === 'kg/m^3' && u.p.variables.get('mu').inferredUnit === 'Pa s' &&
  u.p.variables.get('P').inferredUnit === 'Pa' && u.p.variables.get('d').inferredUnit === 'm', [u.issues, ['rho', 'mu', 'P', 'd'].map(n => u.p.variables.get(n).inferredUnit)]);
const ub = units("P = 2 [bar]\nS = 0.035\nz = 10 [m]\nrho = seawater('rho', P, S)\nP_2 = oceanpressure(P, 0.5)\nd = oceandepth(z, 0.5)");
ok('Check: a pressure given for T or for z, and a depth for P, are flagged', ub.issues.length === 3 && /seawater\(\) expects \[K\]/.test(ub.issues[0]) && /oceanpressure\(\) expects \[m\]/.test(ub.issues[1]) && /oceandepth\(\) expects \[Pa\]/.test(ub.issues[2]), ub.issues);

messages([
  ['T range', err("x = seawater('rho', 400, 0.03)"), /seawater\(\): T = 400 K is outside the correlations, 273\.15 to 393\.15 K \(0 to 120 degC\)/],
  ['S in g/kg', err("x = seawater('rho', 300, 35)"), /seawater\(\): S = 35 is outside the correlations, 0 to 0\.12 kg\/kg \(0 to 120 g\/kg\); give the salinity in kg\/kg, e\.g\. 0\.035/],
  ['output', err("x = seawater('q', 300, 0.03)"), /seawater\(\): 'q' should be one of 'rho', 'cp', 'k', 'mu', 'nu', 'alpha', 'Pr', 'BPE', 'h', 's', 'g', 'muw', 'aw', 'phi', 'Pi'/],
  ['arguments', err("x = seawater('rho', 300)"), /seawater\(\): use seawater\('rho', T, S\)/],
  ['P range', err('x = oceandepth(1000, 0.5)'), /oceandepth\(\): P = 1000 Pa is outside 101325 Pa \(the surface\) to 100101325 Pa .*P is the absolute pressure/],
  ['z range', err('x = oceanpressure(12000, 0.5)'), /oceanpressure\(\): z = 12000 m is outside 0 to 9713\.\d+ m .*z is the depth, positive down/],
  ['degrees', err('x = oceandepth(2e5, 45)'), /oceandepth\(\): latitude 45 rad is not between -pi\/2 and pi\/2; give it in degrees with a unit tag, lat = 30 \[deg\]/],
]);
// ---- TEOS-10 outputs (h, s, g, muw, aw, phi, Pi), for brackish water, seawater and brine
{
  const G = E.Seawater.gS, sw = (o, T, S, P) => E.ThermoEngine.call('seawater', P === undefined ? [o, T, S] : [o, T, S, P]);
  // IAPWS R13-08, Table 8: the saline part at (a) S_SO, 273.15 K, 101325 Pa; (b) 0.1 kg/kg, 353 K, 101325 Pa; (c) S_SO, 273.15 K, 1e8 Pa
  const R13 = [[35.16504, 0, 0, -0.101342742e3, 0.639974067e5, -0.147643376, -0.274957224e-4, -0.235181411e4],
               [100, 79.85, 0, 0.150871740e5, 0.251957276e6, 0.156230907e3, -0.579227286e-4, -0.101085536e5],
               [35.16504, 0, (1e8 - 101325) / 1e4, -0.260093051e4, -0.545861581e4, 0.754045685e1, -0.229123842e-4, -0.240897806e4]];
  ok('saline Gibbs function: 64 nonzero coefficients, as in R13-08 Table 2', E.Seawater.GIJK.length + 2 === 64 && E.Seawater.GIJK.every(r => r[3] !== 0 && r[0] >= 2));
  const rel = (a, b) => Math.abs(a - b) <= 5e-9 * Math.abs(b);   // the table gives 9 significant digits
  ok('saline Gibbs function reproduces the IAPWS R13-08 check values (g, g_S, g_T, g_p, saline mu_W) to 9 digits', R13.every(([sa, t, p, g, gs_, gt, gp, mu]) =>
    rel(G('000', sa, t, p), g) && rel(1000 * G('100', sa, t, p), gs_) && rel(G('010', sa, t, p), gt) && rel(G('001', sa, t, p), gp) &&
    rel(G('000', sa, t, p) - sa * G('100', sa, t, p), mu)));
  // TEOS-10 GSW-C library (gsw_enthalpy_t_exact, -gsw_gibbs(0,1,0), gsw_chem_potential_water_t_exact): pure water there is IAPWS-09, here IAPWS-95
  const GSW = [[35.16504, 25, 0, 99796.7361608, 349.581761139, -7157.2927166], [5, 10, 0, 41830.2650917, 152.451129804, -1002.71676829],
               [70, 25, 0, 94411.8758107, 318.800716643, -10101.7825966], [35, 15, 600, 65326.6285345, 212.077724479, 1904.93415481], [1, 30, 0, 125644.462818, 436.986560451, -6646.78925836]];
  const dev = GSW.map(([sa, t, p, h, s, mu]) => { const T = t + 273.15, P = 101325 + p * 1e4, S = sa / 1000;
    return [Math.abs(sw('h', T, S, P) - h), Math.abs(sw('s', T, S, P) - s), Math.abs(sw('muw', T, S, P) - mu)]; });
  ok('h, s and muw agree with the TEOS-10 library within 0.05 J/kg, 2e-4 J/(kg K), 0.05 J/kg (brackish 1 and 5 g/kg, seawater, brine 70 g/kg, 6 MPa)', dev.every(d => d[0] < 0.05 && d[1] < 2e-4 && d[2] < 0.05), dev);
  ok('osmotic coefficient of standard seawater at 25 degC: 0.9025 (Millero and Leung 1976 give 0.902)', near(sw('phi', 298.15, 0.03516504), 0.9025, 2e-4), sw('phi', 298.15, 0.03516504));
  const phi = [1e-5, 1e-3, 5e-3, 0.035].map(S => sw('phi', 298.15, S));
  ok('brackish water: phi rises towards 1 as S goes to 0 (Debye-Hueckel)', phi.every((v, i) => i === 0 || v < phi[i - 1]) && phi[0] > 0.99 && phi[0] < 1 && sw('phi', 298.15, 0) === 1, phi);
  const T = 298.15, S = 0.035, Pi = sw('Pi', T, S);
  ok('Pi: pure water at P balances seawater at P + Pi (g_W(T, P) = mu_W(S, T, P + Pi))', near(CP.PropsSI('Gmass', 'T', T, 'P', 101325, 'Water'), sw('muw', T, S, 101325 + Pi), 1e-10), Pi);
  ok("Pi: phi m R T rho_w within 0.2 % (the dilute form)", near(Pi, sw('phi', T, S) * S / ((1 - S) * 0.0314038218) * 8.314472 * T * CP.PropsSI('D', 'T', T, 'P', 101325, 'Water'), 2e-3));
  ok('Pi of 1 g/kg brackish water is about 75 kPa; of 70 g/kg brine about 5.5 MPa', near(sw('Pi', T, 0.001), 74591, 1e-3) && near(sw('Pi', T, 0.07), 5.5425e6, 1e-3), [sw('Pi', T, 0.001), sw('Pi', T, 0.07)]);
  ok('aw = exp(-phi m MW): the water activity and the osmotic coefficient agree', near(Math.log(sw('aw', T, S)), -sw('phi', T, S) * S / ((1 - S) * 0.0314038218) * 0.018015268, 1e-12));
  ok('h - T s = g', near(sw('h', T, S, 6e6) - T * sw('s', T, S, 6e6), sw('g', T, S, 6e6), 1e-12));
  messages([
    ['T above 80 degC', err('x = seawater(\'Pi\', 360, 0.035)'), /T = 360 K is outside the TEOS-10 seawater range used here, 273.15 to 353.15 K/],
    ['P too high for brine', err('x = seawater(\'h\', 300, 0.07, 2e7)'), /outside 1e4 to 12000000 Pa \(12 MPa above 42 g\/kg\)/],
    ['a pressure for an output without one', err('x = seawater(\'rho\', 300, 0.035, 1e6)'), /a pressure is taken only by 'h', 's', 'g', 'muw', 'aw', 'phi' and 'Pi'/],
  ]);
  const u = units(`T = 25 [degC]\nS = 0.035\nP = 60 [bar]\nPi = seawater('Pi', T, S, P)\nh = seawater('h', T, S, P)\nphi = seawater('phi', T, S)`);
  ok('Check Units: Pi in Pa, h in J/kg, phi dimensionless', u.issues.length === 0 && u.p.variables.get('Pi').inferredUnit === 'Pa' && u.p.variables.get('h').inferredUnit === 'J/kg', [u.issues, u.p.variables.get('Pi').inferredUnit]);
}
done();
