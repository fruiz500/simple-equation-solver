// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// U.S. Standard Atmosphere 1976: the printed tables (Part 4 of the standard, as reproduced by Public Domain Aeronautical
// Software, pdas.com/bigtables.html), the layer bases of its Table 4, M/M0 above 80 km, the inverse functions, messages, Check.
import { run, err, units } from '../lib/engine.mjs';
import { ok, note, messages, done } from '../lib/check.mjs';
const A = (o, z) => run(`z_ = atmosphere('${o}', ${z})`).st.z_;
const rel = (a, b) => Math.abs(a / b - 1);

// 1. Table 1 (T, P, rho, c, g) and Table 2 (mu, nu, k), to the printed digits (5 significant: within 6e-5)
const T1 = [[0, 288.150, 1.0132e5, 1.2250, 340.29, 9.8066], [10, 223.252, 2.6500e4, 4.1351e-1, 299.53, 9.7759], [15, 216.650, 1.2112e4, 1.9476e-1, 295.07, 9.7605],
  [25, 221.552, 2.5492e3, 4.0084e-2, 298.39, 9.7300], [40, 250.350, 2.8714e2, 3.9957e-3, 317.19, 9.6844], [55, 260.771, 4.2525e1, 5.6810e-4, 323.72, 9.6391],
  [65, 233.292, 1.0930e1, 1.6321e-4, 306.19, 9.6091], [75, 208.399, 2.3881, 3.9921e-5, 289.40, 9.5793], [80, 198.639, 1.0525, 1.8458e-5, 282.54, 9.5644],
  [85, 188.893, 4.4568e-1, 8.2195e-6, 275.52, 9.5496]];
let worst = 0;
for (const [z, ...b] of T1) ['T', 'P', 'rho', 'c', 'g'].forEach((o, i) => {
  if (z === 85 && o === 'T') return;   // see 3.
  worst = Math.max(worst, rel(A(o, z * 1000), b[i]));
});
note('Table 1: largest relative difference', worst);
ok('Table 1: T, P, rho, c, g at 0 to 85 km, to the printed digits', worst < 6e-5, worst);
worst = 0;
for (const [z, mu, nu, k] of [[0, 1.7894e-5, 1.4607e-5, 2.5326e-2], [20, 1.4216e-5, 1.5989e-4, 1.9505e-2], [50, 1.7037e-5, 1.6590e-2, 2.3938e-2]])
  worst = Math.max(worst, rel(A('mu', z * 1000), mu), rel(A('nu', z * 1000), nu), rel(A('k', z * 1000), k));
ok('Table 2: mu, nu, k at 0, 20 and 50 km, to the printed digits', worst < 6e-5, worst);

// 2. The layer bases of Table 4 (geopotential altitude, molecular-scale temperature) and the sea-level values
const Hz = (H) => 6356766 * H / (6356766 - H);   // geometric altitude of a geopotential altitude
const bases = [[11000, 216.65], [20000, 216.65], [32000, 228.65], [47000, 270.65], [51000, 270.65], [71000, 214.65]];
ok('layer bases: T and H as in Table 4', bases.every(([H, T]) => rel(A('T', Hz(H)), T) < 1e-12 && rel(A('H', Hz(H)), H) < 1e-12));
ok('sea level: 288.15 K, 101325 Pa, 1.2250 kg/m^3, g0 = 9.80665', A('T', 0) === 288.15 && A('P', 0) === 101325 && rel(A('rho', 0), 1.225) < 1e-5 && A('g', 0) === 9.80665);
ok('continuous at the layer bases', bases.every(([H]) => rel(A('P', Hz(H) - 1e-6), A('P', Hz(H) + 1e-6)) < 1e-9));

// 3. Above 80 km: T = T_M M/M0 (Eq. 22, Table 8). The printed T at 85 km is T_M; the kinetic T is 0.0306 % lower
ok('85 km: T = 188.893 K (T_M, as printed) times M/M0 = 0.999694', rel(A('T', 85000), 188.893 * 0.999694) < 6e-6, A('T', 85000));
ok('86 km: T = 186.87 K, P = 0.37338 Pa (the standard values at its top)', rel(A('T', 86000), 186.87) < 3e-5 && rel(A('P', 86000), 0.37338) < 2e-5, [A('T', 86000), A('P', 86000)]);

// 4. Pressure and density altitude
let st = run(`z = atmosphere_altitude('P', 50000)\nzr = atmosphere_altitude('rho', 0.5)`).st;
ok('round trips: pressure and density altitude', rel(A('P', st.z), 50000) < 1e-12 && rel(A('rho', st.zr), 0.5) < 1e-12, st);
st = run(`P = atmosphere('P', z)\nP = 70 [kPa]`).st;
ok('solved backward from the default guess', rel(st.z, run(`z_ = atmosphere_altitude('P', 70000)`).st.z_) < 1e-9, st.z);
messages([
  ['range', err(`x = atmosphere('T', 90000)`), /z = 90000 m is outside the standard atmosphere, -5000 to 86000 m/],
  ['output', err(`x = atmosphere('density', 0)`), /'density' should be one of 'T', 'P', 'rho', 'c', 'mu', 'k', 'nu', 'g', 'H'/],
  ['inverse T', err(`x = atmosphere_altitude('T', 250)`), /can be found from 'P' or 'rho'/],
  ['P range', err(`x = atmosphere_altitude('P', 2e5)`), /P = 200000 is outside the standard atmosphere, 0\.37338 to 177760 Pa/],
]);

// 5. Check: z in m, the result in the unit of the output named
const u = units(`z = 3 [km]\nT = atmosphere('T', z)\nP = atmosphere('P', z)\nmu = atmosphere('mu', z)\nh = atmosphere_altitude('P', P)\nbad = atmosphere('T', T)`);
const iu = (n) => u.p.variables.get(n).inferredUnit;
ok('Check: K, Pa, Pa s and m results; a temperature as altitude is flagged', iu('T') === 'K' && iu('P') === 'Pa' && /Pa.?s|kg\/\(m s\)/.test(iu('mu')) && iu('h') === 'm' &&
  u.issues.length === 1 && /atmosphere\(\) expects \[m\]/.test(u.issues[0]), [iu('T'), iu('P'), iu('mu'), iu('h'), u.issues]);
done();
