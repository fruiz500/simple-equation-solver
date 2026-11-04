// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// EES to SES converter (convert.js): units, property calls, the unit system, blocks, functions and procedures, names, the
// report, and converted programs that SES solves to textbook answers.
import { E, run } from '../lib/engine.mjs';
import { ok, near, done } from '../lib/check.mjs';

const C = E.EESConvert;
const conv = (t, sys) => { const r = C.run(t, sys); r.text = C.units(r); return r; };
const has = (r, re) => r.report.some(x => re.test(x.msg));

// ---- unit strings
const U = { 'kJ/kg-K': 'kJ/(kg K)', C: 'degC', F: 'degF', R: 'degR', psia: 'psi', 'W/m^2-K': 'W/(m^2 K)', 'Btu/lbm-R': 'BTU/(lbm degR)', 'kg/s': 'kg/s', '-': '-', '1/s': '1/s' };
ok('EES unit strings -> SES', Object.entries(U).every(([a, b]) => C.unit(a) === b), Object.keys(U).map(a => C.unit(a)));

// ---- Cengel Example 10-1, ideal Rankine cycle (eta = 26.0 %, x4 = 0.886), written as in EES (C, kPa, kJ)
const RANKINE = `"Ideal Rankine cycle, Cengel Example 10-1"
$UnitSystem SI Mass kJ C kPa
P[1] = 75 [kPa]
x[1] = 0
h[1] = enthalpy(Water, P=P[1], x=x[1])
v[1] = volume(Water, P=P[1], x=x[1])
s[1] = entropy(Water, P=P[1], x=x[1])
P[2] = 3000
w_pump = v[1]*(P[2] - P[1])  {kJ/kg}
h[2] = h[1] + w_pump
T[3] = 350
h[3] = enthalpy(Water, T=T[3], P=P[2])
s[3] = entropy(Water, T=T[3], P=P[2])
h[4] = enthalpy(Water, P=P[1], s=s[3])
x[4] = quality(Water, P=P[1], s=s[3])
eta = 1 - (h[4] - h[1])/(h[3] - h[2])
T_amb = 25`;
let r = conv(RANKINE), st = run(r.text).st;
ok('Rankine: SES solves the converted program, eta = 0.260 and x4 = 0.886 (Cengel)', near(st.eta, 0.2602, 5e-4) && near(st['x[4]'], 0.886, 1e-3), [st.eta, st['x[4]']]);
ok('Rankine: plain numbers tagged in the EES units, property results displayed in them', /^P\[2\] = 3000 \[kPa\]$/m.test(r.text) && /^T\[3\] = 350 \[degC\]$/m.test(r.text) && /h\[3\] = enthalpy\('water', 'T', T\[3\], 'P', P\[2\]\) \[kJ\/kg\]/.test(r.text), r.text);
ok('Rankine: computed lines displayed in kJ/kg as in EES; a tag in the EES text kept', /^h\[2\] = h\[1\] \+ w_pump \[kJ\/kg\]$/m.test(r.text) && /^P\[1\] = 75 \[kPa\]$/m.test(r.text));
ok('Rankine: comments kept ("..." as {...}), $UnitSystem dropped', /^\{Ideal Rankine cycle, Cengel Example 10-1\}$/m.test(r.text) && !/\$UnitSystem/.test(r.text));
ok('report: a number with no unit to work out, named like a temperature', has(r, /T_amb = 25: no unit could be worked out/));

// ---- English units
r = conv(`$UnitSystem Eng F psia Btu\nT1 = 400\nP1 = 100\nh1 = enthalpy(Steam, T=T1, P=P1)\nh2 = enthalpy(Steam, T=500, P=100)\ndh = h2 - h1`);
st = run(r.text).st;
ok('English units: degF and psi tags, numbers inside calls to SI (500 F = 533.15 K)', /T1 = 400 \[degF\]/.test(r.text) && /'T', 533\.15, 'P', 689475\.729276/.test(r.text), r.text);
ok('English units: dh from 400 to 500 F at 100 psia = 51.6 Btu/lbm (steam tables 1227.5 -> 1279.1)', near(st.dh / 2326, 51.6, 2e-3), st.dh / 2326);

// ---- functions, procedures, duplicate, ideal gases, humid air, names
r = conv(`$UnitSystem SI Mass kJ K kPa Rad
FUNCTION f_fric(Re)
  If (Re < 2300) Then
    f_fric := 64/Re
  Else
    f_fric := 0.316*Re^(-0.25)
  EndIf
END
PROCEDURE split(a, b : s, d)
  s := a + b
  d := a - b
END
N = 4
Duplicate i=1,N
  T[i] = 300 + 50*i
  h[i] = enthalpy(N2, T=T[i])
End
cp_N2 = cp(N2, T=T[1])
s_air = entropy(Air, T=T[2], P=200)
w = HumRat(AirH2O, T=303, P=101.325, R=0.6)
f = f_fric(1000)
CALL split(5, 3 : ss, dd)
Tot = sum(h[1..N])
z = IF(N, 3, 1, 2, 3)
r = R# * 2
e = 3
y = e * 2
H = enthalpy(steam, T=500, P=1000)`);
st = run(r.text).st;
ok('FUNCTION with IF/ELSE -> function, := -> =, the result in name_out', /function f_fric_out = f_fric\(Re\)/.test(r.text) && /f_fric_out = 64\/Re/.test(r.text) && near(st.f, 0.064, 1e-12));
ok('PROCEDURE and CALL -> function with several outputs', /function \[s, d\] = split\(a, b\)/.test(r.text) && st.ss === 8 && st.dd === 2);
ok('DUPLICATE i=1,N -> duplicate i_ = 1 : N (i is imaginary in SES); x[1..N] -> x[1:N]', /duplicate i_ = 1 : N/.test(r.text) && /sum\(h\[1:N\]\)/.test(r.text));
ok('ideal gas N2: per kg from the NASA functions; cp = 1.0416 kJ/(kg K) at 350 K', /ig_enthalpy\('N2', T\[i_\]\)\/ig_molarmass\('N2'\)/.test(r.text) && near(st.cp_N2, 1041.6, 2e-3), st.cp_N2);
ok("Air: CoolProp air, with the report's note on reference states; numbers in calls to SI", /entropy\('air', 'T', T\[2\], 'P', 200000\)/.test(r.text) && has(r, /EES 'Air' \(ideal gas\)/));
ok('AirH2O -> humidair(); w at 30 C, 60 % = 0.0160', /humidair\('W', 'T', 303, 'P', 101325, 'R', 0\.6\)/.test(r.text) && near(st.w, 0.0160, 0.02), st.w);
ok('IF(A, B, X, Y, Z) nested; R# -> constant; e renamed e_', st.z === 3 && /constant\('R_u'\)/.test(r.text) && st.y === 6);
ok('h and H are one name in EES; a scalar named like an array is renamed (h_)', /^h_ = enthalpy\('water', 'T', 500, 'P', 1000000\) \[kJ\/kg\]$/m.test(r.text) && has(r, /renamed h_/), r.text);

// ---- degrees and the additive-number check
r = conv(`a = 30\nc = cos(a)\nt = arctan(1)\nh1 = enthalpy(Water, T=100, P=200)\nh2 = h1 + 50`);
st = run(r.text).st;
ok('trigonometry in degrees: cos(30) = 0.866, arctan(1) = 45', near(st.c, Math.sqrt(3) / 2, 1e-12) && near(st.t, 45, 1e-12));
ok('a number added to an energy in kJ/kg is reported', has(r, /the number 50 is added to a quantity in kJ\/kg/));
done();
