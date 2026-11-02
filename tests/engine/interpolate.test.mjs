// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// interpolate(xs, ys, x) and interpolate(xs, ys, Z, x, y): exact answers, solving through it, tables built with
// duplicate, use in functions and ode blocks, extrapolation warnings at the solution only, messages, units.
import { run, err, units, logs, CP, E } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
const warns = () => logs.filter(l => /^WARN: interpolate/.test(l));
const solve = (t, g) => { logs.length = 0; return run(t, g).st; };

// 1-D: values at and between nodes
let s = solve(`a = interpolate([0, 1, 3], [0, 10, 40], 2)\nb = interpolate([0, 1, 3], [0, 10, 40], 3)\nc = interpolate([0, 1, 3], [0, 10, 40], 0)\nd = interpolate([0, 1, 3], [0, 10, 40], 0.5)`);
ok('1-D between and at nodes', s.a === 25 && s.b === 40 && s.c === 0 && s.d === 5, JSON.stringify(s));
// linear data is reproduced exactly anywhere inside
s = solve(`y = interpolate([1, 2.5, 7, 10], [5, 9.5, 23, 32], x)\nx = 8.3`);
ok('linear data reproduced exactly', near(s.y, 3 * 8.3 + 2, 1e-14), s.y);

// table as array elements from duplicate (x[1:N]); and as matrix-valued variables
s = solve(`N = 5\nduplicate i = 1 : N\n  x[i] = i\n  y[i] = i^2\nend\nq = interpolate(x[1:N], y[1:N], 2.5)`);
ok('x[1:N] from duplicate', s.q === 6.5, s.q);
s = solve(`xs = [1, 2, 3]\nys = [10, 20, 40]\nq = interpolate(xs, ys, 2.25)`);
ok('matrix variables', s.q === 25, s.q);
s = solve(`q = interpolate([1; 2; 3], [10; 20; 40], 2.75)`); ok('column vectors', s.q === 35, s.q);

// solved backward: liquid water table at 1 MPa from CoolProp, find T where h = 300 kJ/kg (inverse of the same linear segments)
const Ts = [300, 320, 340, 360, 380, 400], hs = Ts.map(T => CP.PropsSI('H', 'T', T, 'P', 1e6, 'Water'));
s = solve(`Ts = [${Ts}]\nhs = [${hs}]\nh = interpolate(Ts, hs, T)\nh = 300000`, { T: 350 });
const k = hs.findIndex((h, i) => h <= 3e5 && hs[i + 1] > 3e5), Tinv = Ts[k] + (3e5 - hs[k]) / (hs[k + 1] - hs[k]) * 20;
ok('solved backward through a table', near(s.T, Tinv, 1e-9), s.T + ' vs ' + Tinv);
ok('table error within 0.01 K of CoolProp', Math.abs(s.T - CP.PropsSI('T', 'H', 3e5, 'P', 1e6, 'Water')) < 0.01, s.T);
s = solve(`Ts = [${Ts}]\nhs = [${hs}]\nh = interpolate(Ts, hs, T)\nh = 300000`);
ok('default guess 1, far outside the table, still solves', near(s.T, Tinv, 1e-9) && warns().length === 0, s.T);
messages([['solution outside', err(`Ts = [${Ts}]\nhs = [${hs}]\nh = interpolate(Ts, hs, T)\nh = 900000`), /^Line 3: interpolate\(\): x = 4\d\d\.\d+ is outside the table, 300 to 400/]]);

// 2-D, Z[i, j] at xs[i], ys[j]: bilinear data f = 2x + 3y + xy/10 is reproduced exactly; xs has 3 values, ys 4
const f2 = (x, y) => 2 * x + 3 * y + x * y / 10, X = [0, 10, 30], Y = [0, 5, 10, 20];
const Zlit = '[' + X.map(x => Y.map(y => f2(x, y)).join(', ')).join('; ') + ']';
s = solve(`z = interpolate([${X}], [${Y}], ${Zlit}, 17, 13)\nc = interpolate([${X}], [${Y}], ${Zlit}, 30, 0)`);
ok('2-D bilinear exact', near(s.z, f2(17, 13), 1e-14) && s.c === f2(30, 0), `${s.z} vs ${f2(17, 13)}`);
s = solve(`duplicate i = 1 : 3\n  xg[i] = 10*(i - 1)^2\n  duplicate j = 1 : 4\n    yg[j] = 5*j\n    Z[i, j] = 2*xg[i] + 3*yg[j]\n  end\nend\nz = interpolate(xg[1:3], yg[1:4], Z[1:3, 1:4], 25, 12)\nrow = sum(Z[2, 1:4])`);
ok('2-D table from duplicate, Z[1:3, 1:4]', near(s.z, 2 * 25 + 3 * 12, 1e-13), s.z);
ok('one row Z[2, 1:4]', s.row === 4 * 20 + 3 * (5 + 10 + 15 + 20), s.row);
// solve for x given z (2-D lookup inverted)
s = solve(`z = interpolate([${X}], [${Y}], ${Zlit}, x, 8)\nz = 60`, { x: 5 });
ok('2-D solved backward', near(f2(s.x, 8), 60, 1e-9), s.x);

// inside a user function and an ode block (integral of a piecewise-linear heat input: area 2 J)
s = solve(`function q = load(t)\n  q = interpolate([0, 1, 2], [0, 2, 0], t)\nend\na = load(0.25)\node t = 0 : 2 : 0.5\n  E' = load(t)\n  E(0) = 0\nend`);
ok('in a function', s.a === 0.5, s.a); ok('in an ode block (exact integral 2)', near(s.E, 2, 1e-8), s.E);

// extrapolation: error without the option; with it, linear extension and a warning, only at the solution
messages([['outside', err(`y = interpolate([0, 1, 2], [0, 1, 4], 3)`), /^Line 1: interpolate\(\): x = 3 is outside the table, 0 to 2 \(add 'extrapolate'/]]);
s = solve(`y = interpolate([0, 1, 2], [0, 1, 4], 3, 'extrapolate')`);
ok('extrapolated value (end segment extended)', s.y === 7, s.y);
ok('extrapolation warned once', warns().length === 1 && /extrapolated: x = 3 is outside the table, 0 to 2/.test(warns()[0]), logs);
s = solve(`y = interpolate([0, 1, 2], [0, 1, 4], x, 'Extrapolate')\ny = 2.5`, { x: 50 });
ok('Newton passes outside the table but ends inside: no warning', near(s.x, 1.5, 1e-9) && warns().length === 0, [s.x, logs]);
s = solve(`y = interpolate([0, 1, 2], [0, 1, 4], 2, 'extrapolate')`); ok('at the end node: no warning', s.y === 4 && warns().length === 0, logs);
s = solve(`ode t = 0 : 2 : 1\n  E' = interpolate([0, 1], [1, 1], t, 'extrapolate')\n  E(0) = 0\nend`);
ok('ode block extrapolating: warned', near(s.E, 2, 1e-9) && warns().length >= 1, logs);
s = solve(`z = interpolate([0, 1], [0, 1], [0, 1; 1, 2], 2, 0.5, 'extrapolate')`);
ok('2-D extrapolation along x only', near(s.z, 2.5, 1e-14) && warns().length === 1 && /x = 2/.test(warns()[0]), [s.z, logs]);

messages([
  ['in ode', err(`ode t = 0 : 2\n  E' = interpolate([0, 1], [1, 1], t)\n  E(0) = 0\nend`), /^ode block at line 1: interpolate\(\): x = 1\.\d+ is outside the table, 0 to 1 \(add/],
  ['in function', err(`function q = f(t)\n  q = interpolate([0, 1], [1, 1], t)\nend\na = f(3)`), /^Line 4: f\(\), line 2: interpolate\(\): x = 3 is outside the table/],
  ['increasing', err(`y = interpolate([0, 2, 1], [0, 1, 4], 0.5)`), /xs must be strictly increasing, but value 3 \(1\) is not above value 2 \(2\)/],
  ['lengths', err(`y = interpolate([0, 1, 2], [0, 1], 0.5)`), /xs has 3 values but ys has 2/],
  ['shape', err(`z = interpolate([0, 1], [0, 1, 2], [1, 2; 3, 4], 0.5, 0.5)`), /Z must be a matrix of numbers with 2 rows \(one per xs value\) and 3 columns/],
  ['args', err(`y = interpolate([0, 1], [0, 1])`), /interpolate\(xs, ys, x\) or interpolate\(xs, ys, Z, x, y\).*got 2 arguments/],
  ['option', err(`y = interpolate([0, 1], [0, 1], 0.5, 'cubic')`), /unknown option 'cubic' \(options: 'linear', 'spline', 'pchip', 'extrapolate'\)/],
  ['notlist', err(`y = interpolate(3, [0, 1], 0.5)`), /xs must be a list of numbers/],
  ['short', err(`y = interpolate([1], [2], 1)`), /xs needs at least 2 values/],
  ['fnname', err(`function y = interpolate(x)\n  y = x\nend`), /'interpolate' is already a built-in name/],
]);

// Cubic options. 'spline' (not-a-knot) reproduces any cubic exactly, also with uneven spacing; 3 points give the parabola
const cub = (x) => 2 - x + 0.5 * x * x - 0.3 * x ** 3, XS = [0, 0.7, 1.1, 2, 3.4, 4], YS = XS.map(cub);
const tbl = (xs, ys) => `[${xs}], [${ys}]`;
s = solve(`a = interpolate(${tbl(XS, YS)}, 0.35, 'spline')\nb = interpolate(${tbl(XS, YS)}, 2.9, 'spline')\nc = interpolate(${tbl(XS.slice(0, 4), YS.slice(0, 4))}, 1.6, 'spline')`);
ok('spline reproduces a cubic (6 and 4 uneven points)', near(s.a, cub(0.35), 1e-13) && near(s.b, cub(2.9), 1e-13) && near(s.c, cub(1.6), 1e-13), [s.a - cub(0.35), s.b - cub(2.9), s.c - cub(1.6)]);
const par = (x) => 1 + 2 * x - 3 * x * x;
s = solve(`p = interpolate([0, 0.4, 1], [${[0, 0.4, 1].map(par)}], 0.8, 'spline')\nq = interpolate([0, 1], [3, 5], 0.25, 'spline')`);
ok('spline: 3 points give the parabola, 2 points the line', near(s.p, par(0.8), 1e-14) && s.q === 3.5, [s.p, s.q]);
// order of accuracy on exp(x), 0..3 (monotonic, so pchip's flattening at extrema does not enter): halving the spacing
// divides the error by about 16 for spline (more before the asymptotic range), 8 for pchip, 4 for linear
const errOf = (n, m) => { const X = Array.from({ length: n }, (_, i) => 3 * i / (n - 1)), Y = X.map(Math.exp);
  let e = 0; for (let k = 1; k < 200; k++) { const x = 3 * k / 200; e = Math.max(e, Math.abs(E.Interp.fn(X, Y, x, m) - Math.exp(x)) / Math.exp(x)); } return e; };
for (const [m, lo, hi] of [['spline', 12, 32], ['pchip', 5, 12], ['linear', 3.5, 4.5]]) {
  const r = errOf(11, m) / errOf(21, m); note(`${m}: max error ${errOf(11, m).toExponential(1)} (11 points), ${errOf(21, m).toExponential(1)} (21 points), ratio ${r.toFixed(1)}`);
  ok(`${m}: convergence order (error ratio ${lo} to ${hi} when halving the spacing)`, r > lo && r < hi, r);
}
// smoothness at the nodes: first derivative continuous (spline and pchip), second derivative continuous (spline)
const Xs = [0, 1, 1.5, 3, 4, 6], Ys = [1, 3, 2, 2.5, 5, 4], eps = 1e-6;
for (const m of ['spline', 'pchip']) {
  const f = (x) => E.Interp.fn(Xs, Ys, x, m);
  const jump1 = Math.max(...[1, 1.5, 3, 4].map(x => Math.abs((f(x + eps) - f(x)) / eps - (f(x) - f(x - eps)) / eps)));
  ok(`${m}: continuous slope at the nodes`, jump1 < 1e-4, jump1);
  if (m === 'spline') {
    const d2 = (x, sgn) => (f(x + 2 * sgn * 1e-4) - 2 * f(x + sgn * 1e-4) + f(x)) / 1e-8;
    const jump2 = Math.max(...[1.5, 3].map(x => Math.abs(d2(x, 1) - d2(x, -1))));
    ok('spline: continuous second derivative', jump2 < 1e-2, jump2);
  }
}
// pchip keeps monotonic data monotonic and inside its range; the spline overshoots on this step-like table
const Xm = [0, 1, 2, 3, 4, 5], Ym = [0, 0, 0.1, 1, 1, 1];
const sam = (m) => Array.from({ length: 501 }, (_, k) => E.Interp.fn(Xm, Ym, 5 * k / 500, m));
const pm = sam('pchip'), sp = sam('spline');
ok('pchip: monotonic, within the data range', pm.every((v, k) => k === 0 || v >= pm[k - 1] - 1e-15) && Math.min(...pm) >= 0 && Math.max(...pm) <= 1, [Math.min(...pm), Math.max(...pm)]);
ok('spline: overshoots on the same data (why pchip exists)', Math.min(...sp) < -0.01 || Math.max(...sp) > 1.01, [Math.min(...sp), Math.max(...sp)]);
s = solve(`y = interpolate([0, 1, 3, 4], [1, 3, 7, 9], 2.2, 'pchip')`); ok('pchip reproduces a straight line', near(s.y, 5.4, 1e-14), s.y);
// saturated water: 'spline' and 'pchip' do much better than linear at 50 degC (CoolProp 12.352 kPa)
const Tt = [20, 40, 60, 80, 100], Pt = [2.3393, 7.3849, 19.946, 47.414, 101.42], P50 = CP.PropsSI('P', 'T', 323.15, 'Q', 0, 'Water') / 1000;
const errP = (m) => Math.abs(E.Interp.fn(Tt, Pt, 50, m) - P50) / P50;
note(`saturation pressure at 50 degC, relative error: linear ${errP('linear').toFixed(4)}, pchip ${errP('pchip').toFixed(4)}, spline ${errP('spline').toFixed(4)}`);
ok('saturation table: spline error below 1 %, pchip below 5 %, linear about 10 %', errP('spline') < 0.01 && errP('pchip') < 0.05 && errP('linear') > 0.09);
// options in any order, any case; extrapolation continues the end slope (the cubic's own slope at the end)
s = solve(`a = interpolate(${tbl(XS, YS)}, 5, 'extrapolate', 'Spline')\nb = interpolate(${tbl(XS, YS)}, -1, 'SPLINE', 'extrapolate')`);
const dcub = (x) => -1 + x - 0.9 * x * x;
ok('spline extrapolation: straight line with the end slope', near(s.a, cub(4) + dcub(4) * 1, 1e-12) && near(s.b, cub(0) - dcub(0), 1e-12), [s.a, s.b]);
messages([['spline outside', err(`y = interpolate([0, 1, 2], [0, 1, 4], 3, 'spline')`), /^Line 1: interpolate\(\): x = 3 is outside the table, 0 to 2/]]);
// 2-D: bicubic (spline along each direction) reproduces f = x^3 + x y^2 - y^3 + 2 exactly; 5 x 4 uneven grid
const fb = (x, y) => x ** 3 + x * y * y - y ** 3 + 2, BX = [0, 0.5, 1.5, 2, 3], BY = [-1, 0, 0.7, 2];
const Zb = '[' + BX.map(x => BY.map(y => fb(x, y)).join(', ')).join('; ') + ']';
const fl = (x, y) => 2 * x - 3 * y + 1, Zl = '[' + BX.map(x => BY.map(y => fl(x, y)).join(', ')).join('; ') + ']';
s = solve(`z = interpolate([${BX}], [${BY}], ${Zb}, 1.2, 1.3, 'spline')\nw = interpolate([${BX}], [${BY}], ${Zl}, 1.2, 1.3, 'pchip')`);
ok('2-D spline reproduces a bicubic polynomial', near(s.z, fb(1.2, 1.3), 1e-12), s.z - fb(1.2, 1.3));
ok('2-D pchip reproduces a plane', near(s.w, fl(1.2, 1.3), 1e-13), [s.w, fl(1.2, 1.3)]);
// solving backward through a spline table: T where P_sat = 30 kPa
s = solve(`P = interpolate([${Tt}], [${Pt}], T, 'spline')\nP = 30`);
ok('solved backward through a spline', near(E.Interp.fn(Tt, Pt, s.T, 'spline'), 30, 1e-12) && Math.abs(s.T - (CP.PropsSI('T', 'P', 30000, 'Q', 0, 'Water') - 273.15)) < 0.3, s.T);

// Check Units: x must have the units of xs; the result has those of ys; unknown units are inferred both ways
let u = units(`duplicate i = 1 : 3\n  T[i] = 300 + 50*i [K]\n  h[i] = 4180*i [J/kg]\nend\nT_q = 340\nh_q = interpolate(T[1:3], h[1:3], T_q)\nL = 2 [m]\nbad = interpolate(T[1:3], h[1:3], L)`);
u.issues.forEach(i => note(i));
ok('units: x of the wrong units flagged', u.issues.some(i => /interpolate\(\) looks up \[m\] in a table of \[K\]/.test(i)), u.issues);
ok('units: lookup value inferred from the table', u.p.variables.get('T_q').inferredUnit === 'K', u.p.variables.get('T_q').inferredUnit);
ok('units: result has the units of ys', u.p.variables.get('h_q').inferredUnit === 'J/kg', u.p.variables.get('h_q').inferredUnit);
u = units(`duplicate i = 1 : 3\n  P[i] = 1e5*i\nend\nP_q = 1.5e5 [Pa]\nv = interpolate(P[1:3], [1, 0.5, 0.33], P_q)`);
ok('units: table entries inferred from the lookup value', u.p.variables.get('P[2]').inferredUnit === 'Pa' && u.issues.length === 0, [u.p.variables.get('P[2]').inferredUnit, u.issues]);
done();
