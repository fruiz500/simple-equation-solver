// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// LiBr-H2O solutions (Patek and Klomfar, Int. J. Refrig. 29 (2006) 566-578), against the worked examples of the
// EES LiBrH2O library documentation (fchartsoftware.com/ees/libr_help), which implements the same formulation.
import { E, run, err, units } from '../lib/engine.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';

const v = (expr) => run(`z_ = ${expr}`).st.z_;
const T = 323.15, w = 0.5;   // the EES examples: 50 C, 50 % LiBr

// ---- the EES examples, to the digits they print
ok('pressure 3.486 kPa', Math.abs(v(`libr_pressure(${T}, ${w})`) - 3486) < 1, v(`libr_pressure(${T}, ${w})`));
ok('enthalpy 105 kJ/kg', Math.abs(v(`libr_enthalpy(${T}, ${w})`) - 105e3) < 50, v(`libr_enthalpy(${T}, ${w})`));
ok('entropy 0.3519 kJ/(kg K)', Math.abs(v(`libr_entropy(${T}, ${w})`) - 351.9) < 0.05, v(`libr_entropy(${T}, ${w})`));
ok('specific heat 2.183 kJ/(kg K)', Math.abs(v(`libr_cp(${T}, ${w})`) - 2183) < 0.5, v(`libr_cp(${T}, ${w})`));
ok('density 1522 kg/m^3', Math.abs(v(`libr_density(${T}, ${w})`) - 1522) < 0.5, v(`libr_density(${T}, ${w})`));
ok('temperature at 3.5 kPa: 50.08 C (EES); 50.07 here, within 0.01 K', Math.abs(v(`libr_temperature(3500, ${w})`) - 273.15 - 50.08) < 0.015, v(`libr_temperature(3500, ${w})`) - 273.15);
ok('concentration at 50 C, 3.5 kPa: 0.4995', Math.abs(v(`libr_concentration(${T}, 3500)`) - 0.4995) < 1e-4, v(`libr_concentration(${T}, 3500)`));
// EES Q_LiBrH2O example: 60 % solution at 70 C and 10 kPa throttled to 1 kPa: Q = 0.0146, T = 48.6 C, x = 0.6089
const r = run(`T_1 = 343.15\nx_1 = 0.6\nP_2 = 1000\nh_1 = libr_enthalpy(T_1, x_1)\nx_1 = (1 - Q_2)*x_2\nT_2 = libr_temperature(P_2, x_2)\nh_1 = (1 - Q_2)*libr_enthalpy(T_2, x_2) + Q_2*enthalpy('water', T_2, P_2)`, { Q_2: 0.01, x_2: 0.61, T_2: 320 }).st;
ok('throttling flash: Q = 0.0146, T = 48.6 C, x = 0.6089', Math.abs(r.Q_2 - 0.0146) < 5e-5 && Math.abs(r.T_2 - 273.15 - 48.6) < 0.05 && Math.abs(r.x_2 - 0.6089) < 5e-5, [r.Q_2, r.T_2 - 273.15, r.x_2]);

// ---- consistency
ok('inverse functions agree with the pressure', near(v(`libr_pressure(libr_temperature(5000, 0.55), 0.55)`), 5000, 1e-10) && near(v(`libr_pressure(340, libr_concentration(340, 8000))`), 8000, 1e-10));
ok('at x = 0, the properties of saturated liquid water (IAPWS-95), so solution and steam enthalpies combine', ['H', 'S', 'P'].every(k =>
  near(v(`${{ H: 'libr_enthalpy', S: 'libr_entropy', P: 'libr_pressure' }[k]}(330, 0)`), v(`props('${k}', 'water', 'T', 330, 'Q', 0)`), 1e-12)));
// h and cp are separate fits in the paper: dh/dT and cp differ by up to about 1.2 % in the liquid region
const hT = (t) => v(`libr_enthalpy(${t}, 0.55)`);
ok('cp agrees with dh/dT at constant x within 1.5 % (separate fits)', near(v(`libr_cp(350, 0.55)`), hT(350.5) - hT(349.5), 1.5e-2), [v(`libr_cp(350, 0.55)`), hT(350.5) - hT(349.5)]);
const sT = (t) => v(`libr_entropy(${t}, 0.55)`);
ok('T ds = dh at constant x (within 0.5 %)', near(350 * (sT(350.5) - sT(349.5)), hT(350.5) - hT(349.5), 5e-3));
messages([
  ['T range', err(`z_ = libr_enthalpy(600, 0.5)`), /T = 600 K is outside 273\.16 to 500 K/],
  ['x range', err(`z_ = libr_enthalpy(330, 0.8)`), /LiBr mass fraction x = 0\.8 is outside 0 to 0\.75/],
  ['above water', err(`z_ = libr_concentration(300, 5000)`), /P = 5000 Pa is above the vapor pressure of pure water at T = 300 K \(3536\.\d Pa\)/],
]);

// ---- Check
const u = units(`T = 320 [K]\nP = 4 [kPa]\nx = libr_concentration(T, P)\nh = libr_enthalpy(T, x)\nbad = libr_enthalpy(P, x)`);
ok('Check: x dimensionless, h in J/kg, a pressure in place of T flagged', u.p.variables.get('h').inferredUnit === 'J/kg' && u.issues.length === 1 && /libr_enthalpy\(\) expects \[K\]/.test(u.issues[0]), u.issues);
done();
