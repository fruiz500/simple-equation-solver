// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Plot lines (plots.js): set aside by the parser; the results gathered into arrays; propertyplot (saturation dome against
// CoolProp, the states, processes at constant P, T, s or h, units, log axes); contourplot, heatmapplot, surfaceplot.
import { E, run, err, CP } from '../lib/engine.mjs';
import { ok, near, done } from '../lib/check.mjs';

const PL = E.PlotLines;
const unitOf = (p) => (k) => { const m = p.variables.get(k); return (m && m.unit) || ''; };
function plotOf(text, k = 0) {
  const r = run(text), vals = new Map(Object.entries(r.st));
  const { sc, units } = PL.scope(vals, unitOf(r.p));
  return { r, out: PL.build(r.p.plots[k].src, { scope: E.BoundedSolver.prototype.createScopeWithCoolProp(sc), units }) };
}
const bare = (src) => PL.build(src, { scope: E.BoundedSolver.prototype.createScopeWithCoolProp({}), units: {} });
const msg = (f) => { try { f(); return ''; } catch (e) { return e.message; } };

// ---- the parser sets plot lines aside
let r = run(`x = 2\npropertyplot('water', 'Ts')\ny = x + 1; contourplot([1, 2; 3, 4])`);
ok('plot lines are not equations: 2 equations, 2 plot lines with their line numbers', r.p.parsedASTs.length === 2 && r.p.plots.length === 2 && r.p.plots[0].lineNo === 2 && r.p.plots[1].lineNo === 3, r.p.plots);
ok('a plot line with a syntax error gives its line number', /^Line 2: /.test(err(`x = 1\ncontourplot([1, 2; 3, 4)`) || ''), err(`x = 1\ncontourplot([1, 2; 3, 4)`));
ok('a plot line used as a value is not a known function', /propertyplot/.test(err(`y = propertyplot('water', 'Ts')`) || ''));
ok('string variables work in plot lines', run(`f$ = 'R134a'\npropertyplot(f$, 'Ph')\nx = 1`).p.plots[0].src === "propertyplot('R134a', 'Ph')");

// ---- results into arrays, with display units
const sc = PL.scope(new Map([['a', 1], ['x[1]', 1], ['x[3]', 3], ['x[2]', 2], ['T[1,1]', 11], ['T[1,2]', 12], ['T[2,1]', 21], ['T[2,2]', 22]]), (k) => k === 'x[2]' ? 'cm' : '');
ok('scope: x[i] gathered in index order, T[i, j] as rows of i', JSON.stringify(sc.sc.x) === '[1,2,3]' && JSON.stringify(sc.sc.T) === '[[11,12],[21,22]]' && sc.sc.a === 1);
ok('scope: the unit of an array is that of its first element with a display unit', sc.units.x === 'cm');

// ---- the saturation dome against CoolProp directly
const D = PL.DIAGRAMS, dome = PL.dome('water', D.Ts), n = (dome.x.length - 1) / 2;   // liquid, the critical point, vapor
ok('dome: starts at the triple point (273.16 K, s = 0)', near(dome.y[0], 273.16, 1e-12) && Math.abs(dome.x[0]) < 1e-6, [dome.y[0], dome.x[0]]);
ok('dome: the top is within 0.04 K of the critical temperature', near(dome.y[n - 1], CP.PropsSI('Tcrit', '', 0, '', 0, 'Water'), 1e-4) && dome.y[n - 1] < 647.096);
ok('dome: liquid and vapor entropies equal CoolProp at 373.15 K', (() => {
  const T = 373.15, i = dome.y.findIndex(y => y > T);   // interpolate the liquid branch to 373.15 K
  const sl = dome.x[i - 1] + (dome.x[i] - dome.x[i - 1]) * (T - dome.y[i - 1]) / (dome.y[i] - dome.y[i - 1]);
  return near(sl, CP.PropsSI('S', 'T', T, 'Q', 0, 'Water'), 2e-3);
})());
ok('dome: the liquid branch rises in s, the vapor branch (drawn down) rises too', dome.x.slice(0, n).every((v, k) => k === 0 || v > dome.x[k - 1]) && dome.x.slice(n).every((v, k, a) => k === 0 || v > a[k - 1]));
ok('dome: closed by the critical point (647.096 K, s = 4.40696 kJ/(kg K))', near(dome.y[n], 647.096, 1e-9) && near(dome.x[n], 4406.96, 1e-5), [dome.y[n], dome.x[n]]);
const dPh = PL.dome('R134a', D.Ph);
ok('P-h dome of R134a: the pressures are the saturation pressures', near(dPh.y[10], CP.PropsSI('P', 'H', dPh.x[10], 'Q', 0, 'R134a'), 1e-6));

// ---- a Rankine cycle on T-s, from the arrays T, s and P
const RANKINE = `P[1] = 10 [kPa]
P[2] = 5000 [kPa]
T[1] = saturationtemperature('water', P[1]) [degC]
s[1] = entropy('water', 'P', P[1], 'Q', 0) [kJ/(kg K)]
s[2] = s[1]
T[2] = temperature('water', 'P', P[2], 'S', s[2]) [degC]
T[3] = 500 [degC]
P[3] = P[2]
s[3] = entropy('water', T[3], P[3]) [kJ/(kg K)]
P[4] = P[1]
s[4] = s[3]
T[4] = temperature('water', 'P', P[4], 'S', s[4]) [degC]
propertyplot('water', 'Ts', 'cycle')`;
let { out } = plotOf(RANKINE);
const tr = Object.fromEntries(out.data.map(d => [d.name, d]));
ok('Rankine: axes in the display units of T[1] and s[1]', out.layout.yaxis.title === 'T [degC]' && out.layout.xaxis.title === 's [kJ/(kg K)]', out.layout);
ok('Rankine: four states labelled 1 to 4, at their values', tr.states.text.join() === '1,2,3,4' && near(tr.states.y[2], 500, 1e-12) && near(tr.states.x[2], 6.978084, 1e-6), tr.states);
ok('Rankine: 4 processes (cycle), none straight-dashed', /4 process\(es\) drawn at constant P, T, s or h, 0 joined/.test(out.note) && tr['other processes (straight)'].x.length === 0, out.note);
const Tsat5 = CP.PropsSI('T', 'P', 5e6, 'Q', 0, 'Water') - 273.15;
const plateau = tr.processes.y.filter((y, k) => y !== null && Math.abs(y - Tsat5) < 1e-6).length;
ok('Rankine: heating at 5 MPa follows the isobar, with its boiling plateau at Tsat = 263.94 degC', plateau >= 10 && near(Tsat5, 263.94, 1e-4), [plateau, Tsat5]);
ok('Rankine: the isobar points are CoolProp T(P, s)', (() => {
  const k = tr.processes.y.findIndex((y, i) => y > 400 && y < 499);
  return near(tr.processes.y[k] + 273.15, CP.PropsSI('T', 'P', 5e6, 'S', tr.processes.x[k] * 1000, 'Water'), 1e-9);
})());
ok('Rankine: T-s has linear axes', out.logx === false && out.logy === false);
({ out } = plotOf(RANKINE.replace("'Ts', 'cycle'", "'Ts'")));
ok("without 'cycle' the last state is not joined to the first: 3 processes", /3 process\(es\)/.test(out.note), out.note);
({ out } = plotOf(RANKINE.replace("propertyplot('water', 'Ts', 'cycle')", "h[1:4] = [1, 1, 1, 1]\npropertyplot('water', 'Ts', T, s)").replace('h[1:4] = [1, 1, 1, 1]\n', '')));
ok('arrays given: only they are known, so constant-s steps are exact and the others straight dashed', /2 process\(es\) drawn .* 1 joined by straight/.test(out.note), out.note);

// ---- error bars from the propagated uncertainties
{
  const txt = RANKINE.replace('P[1] = 10 [kPa]', 'P[1] = 10 [kPa] +- 1 [kPa]').replace('T[3] = 500 [degC]', 'T[3] = 500 [degC] +- 5 [K]');
  const r2 = run(txt), base = Object.fromEntries(Object.entries(r2.st));
  const unc = E.Uncertainty.run(r2.p, base).u;
  const { sc: s2, units: u2 } = PL.scope(new Map(Object.entries(r2.st)), unitOf(r2.p));
  const sc2 = E.BoundedSolver.prototype.createScopeWithCoolProp(s2);
  const o2 = PL.build(r2.p.plots[0].src, { scope: sc2, units: u2, unc }), st = o2.data.find(d => d.name === 'states');
  ok('error bars: T[3] has the given 5 K (display unit degC: a difference, so 5), T[1] follows from P[1]', near(st.error_y.array[2], 5, 1e-6) && st.error_y.array[0] > 0 && st.error_y.array[0] < 5, st.error_y);
  ok('error bars: s[3] has an x error bar (from T[3]), s[1] from P[1]', st.error_x.array.every(v => v > 0) && /error bars/.test(o2.note), st.error_x);
  ok('error bars: Pa/K differences in display units match the SI uncertainty of T[1]', near(st.error_y.array[0], unc.get('T[1]'), 1e-9), [st.error_y.array[0], unc.get('T[1]')]);
  const o3 = PL.build(r2.p.plots[0].src, { scope: sc2, units: u2 });
  ok('no uncertainties passed (box not ticked): no error bars', o3.data.find(d => d.name === 'states').error_y === undefined && !/error bars/.test(o3.note));
}

// ---- other diagrams
({ out } = plotOf(`T[1] = 263 [K]\nP[1] = 200 [kPa]\nh[1] = enthalpy('R134a', T[1], P[1]) [kJ/kg]\nP[2] = 1000 [kPa]\nh[2] = h[1] + 40 [kJ/kg]\npropertyplot('R134a', 'Ph')`));
ok('P-h: log P axis, states in kPa and kJ/kg', out.logy === true && out.logx === false && near(out.data[3].y[1], 1000, 1e-12) && out.layout.yaxis.title === 'P [kPa]', [out.layout, out.data[3]]);
ok('P-h without T, s: a compression is drawn straight dashed', /0 process\(es\) drawn .* 1 joined/.test(out.note), out.note);
out = bare("propertyplot('R134a', 'Pv')");
ok('P-v: both axes log; dome only, with default units kPa and m^3/kg', out.logx && out.logy && out.data.length === 1 && out.layout.xaxis.title === 'v [m^3/kg]' && /dome only/.test(out.note));
out = bare("propertyplot('nitrogen', 'hs')");
ok('h-s (Mollier) for nitrogen: h in kJ/kg against s', out.layout.yaxis.title === 'h [kJ/kg]' && out.data[0].y.length > 100);

// ---- messages
ok('unknown diagram', /'Ts', 'Ph', 'Pv' or 'hs', not 'Tv'/.test(msg(() => bare("propertyplot('water', 'Tv')"))));
ok("a last text other than 'cycle'", /may be 'cycle'/.test(msg(() => bare("propertyplot('water', 'Ts', 'closed')"))));
ok('one array only', /both arrays/.test(msg(() => bare("propertyplot('water', 'Ts', [300, 400])"))));
ok('arrays of different lengths', /has 2 values and .* has 3/.test(msg(() => bare("propertyplot('water', 'Ts', [300, 400], [1, 2, 3])"))));
ok('a fluid without a dome', /no saturation dome/.test(msg(() => bare("propertyplot('INCOMP::MEG-30%', 'Ts')"))), msg(() => bare("propertyplot('INCOMP::MEG-30%', 'Ts')")));

// ---- contour, heat map, surface
({ out } = plotOf(`N = 3
duplicate j = 1 : N
  y[j] = (j - 1)/(N - 1) [m]
end
duplicate i = 1 : N
  x[i] = 0.5*(i - 1) [m]
  duplicate j = 1 : N
    T[i, j] = 300 + 10*i + j [degC]
  end
end
contourplot(x, y, T)`));
const c = out.data[0];
ok('contour: Z[i][j] at x[i], y[j] (Plotly z[j][i]), in the display unit of T', c.type === 'contour' && c.z[1][2] === 300 + 30 + 2 && c.z[2][0] === 300 + 10 + 3 && near(c.x[2], 1, 1e-15), c.z);
ok('contour: axis and color-bar titles with units', out.layout.xaxis.title === 'x [m]' && c.colorbar.title.text === 'T [degC]', [out.layout, c.colorbar]);
out = bare('heatmapplot([1, 2, 3; 4, 5, 6])');
ok('heat map of a matrix: indices on the axes, Z as the name', out.data[0].type === 'heatmap' && out.data[0].x.join() === '1,2' && out.data[0].y.join() === '1,2,3' && out.data[0].colorbar.title.text === 'Z');
out = bare('surfaceplot([1, 2; 3, 4])');
ok('surface: a 3-D scene', out.data[0].type === 'surface' && out.three && out.layout.scene.zaxis.title === 'Z');
ok('contour of a 1-D array is refused', /two-dimensional array/.test(msg(() => bare('contourplot([1, 2, 3])'))));
ok('x of the wrong length', /x needs 2 values and y 2/.test(msg(() => bare('contourplot([1, 2, 3], [1, 2], [1, 2; 3, 4])'))));
ok('a ragged matrix is refused', !!msg(() => bare('contourplot([[1, 2], [3]])')));

// ---- the standard plots (Matlab names), from arrays
const R = `x[1] = 1 [m]\nx[2] = 2 [m]\nx[3] = 3 [m]\ny[1] = 10 [kPa]\ny[2] = 20 [kPa]\ny[3] = 15 [kPa]\nz[1] = 4\nz[2] = 5\nz[3] = 6`;
const std = (line) => plotOf(R + '\n' + line, 0).out;
ok('a plot line with a Matlab name is set aside, and is not an equation', run(`${R}\nplot(x, y)`).p.plots.length === 1 && run(`${R}\nplot(x, y)`).p.parsedASTs.length === 9);
r = run(`function y = bar(a)\n  y = a^2\nend\nbar(a) = 9\na = abs(a)`);
ok('an equation that begins like a plot line, here a user function named bar, is still an equation (regression guard for the short names)', r.p.plots.length === 0 && Math.abs(r.st.a - 3) < 1e-6, [r.p.plots, r.st]);
ok('isCall: the call must be the whole text', PL.isCall("plot(x, y)") === 'plot' && PL.isCall("plot(x, y) + 1") === null && PL.isCall("plot(x)(y)") === null && PL.isCall("hist(a, 5)") === 'hist' && PL.isCall("sin(x)") === null && PL.isCall("plot(x, 'a)b')") === 'plot');
let o = std('plot(x, y)');
ok('plot(x, y): one line curve, in display units, axis titles with units', o.data.length === 1 && o.data[0].mode === 'lines' && JSON.stringify(o.data[0].x) === '[1,2,3]' && JSON.stringify(o.data[0].y) === '[10,20,15]'
  && o.layout.xaxis.title === 'x [m]' && o.layout.yaxis.title === 'y [kPa]' && !o.logx && !o.logy, o);
ok('plot(y): against the index', JSON.stringify(std('plot(y)').data[0].x) === '[1,2,3]' && std('plot(y)').layout.xaxis.title === 'index');
o = std("plot(x, y, 'r--', x, z, 'ko')");
ok("two pairs with styles: red dashed line; black circles only", o.data.length === 2 && o.data[0].line.dash === 'dash' && o.data[0].line.color === '#d62728' && o.data[0].mode === 'lines'
  && o.data[1].mode === 'markers' && o.data[1].marker.symbol === 'circle' && o.data[1].marker.color === '#222222' && o.layout.showlegend === true, o.data.map(d => [d.mode, d.line, d.marker]));
ok("'-o' is lines with markers; '.' is a small marker", std("plot(x, y, '-o')").data[0].mode === 'lines+markers' && std("plot(x, y, '.')").data[0].marker.size === 4);
o = bare("plot([1, 2, 3], [1, 4; 2, 5; 3, 6])");
ok('plot(x, Y): the columns of Y are curves against x', o.data.length === 2 && JSON.stringify(o.data[1].y) === '[4,5,6]' && /\[:,1\]$/.test(o.data[0].name) && /\[:,2\]$/.test(o.data[1].name), o.data.map(d => d.name));
o = std('semilogx(x, y)'); ok('semilogx, semilogy, loglog set the log axes', o.logx && !o.logy && std('semilogy(x, y)').logy && !std('semilogy(x, y)').logx && std('loglog(x, y)').logx && std('loglog(x, y)').logy);
ok('stairs: steps', std('stairs(x, y)').data[0].line.shape === 'hv');
o = std('scatter(x, y)'); ok('scatter: markers only', o.data[0].mode === 'markers' && !o.data[0].marker.colorscale);
o = std('scatter(x, y, z)'); ok('scatter(x, y, c): points colored by c with a color bar', JSON.stringify(o.data[0].marker.color) === '[4,5,6]' && o.data[0].marker.showscale && o.data[0].marker.colorbar.title.text === 'z');
o = std('bar(x, y)'); ok('bar(x, y): bars', o.data[0].type === 'bar' && JSON.stringify(o.data[0].y) === '[10,20,15]' && o.layout.xaxis.title === 'x [m]');
o = bare('bar([1, 2, 3], [1, 4; 2, 5; 3, 6])'); ok('bar(x, Y): grouped bars', o.data.length === 2 && o.layout.barmode === 'group');
o = std('hist(y, 4)'); ok('hist(data, bins): a histogram of the display values with the number of bins asked', o.data[0].type === 'histogram' && o.data[0].nbinsx === 4 && JSON.stringify(o.data[0].x) === '[10,20,15]' && std('hist(y)').data[0].nbinsx === 10);
o = std('errorbar(x, y, 2)'); ok('errorbar(x, y, e): a single error for all points, in the display unit', o.data[0].error_y.array.every(v => Math.abs(v - 0.002) < 1e-12), o.data[0].error_y.array);
o = std('errorbar(x, y, [1000, 2000, 3000])'); ok('errorbar with one error per point (SI, converted: 1000 Pa = 1 kPa)', JSON.stringify(o.data[0].error_y.array) === '[1,2,3]');
{
  const unc = new Map([['y[1]', 500], ['y[2]', 1000], ['y[3]', 0]]);
  const r2 = run(R + '\nerrorbar(x, y)'), { sc: sc2, units: un2 } = PL.scope(new Map(Object.entries(r2.st)), unitOf(r2.p));
  const out2 = PL.build('errorbar(x, y)', { scope: E.BoundedSolver.prototype.createScopeWithCoolProp(sc2), units: un2, unc });
  ok('errorbar(x, y) takes the propagated uncertainties (500 Pa = 0.5 kPa)', JSON.stringify(out2.data[0].error_y.array) === '[0.5,1,0]', out2.data[0].error_y.array);
  ok('errorbar(x, y) without uncertainties says what to do', /tick Uncertainty/.test(msg(() => std('errorbar(x, y)'))));
}
o = bare('polarplot([0, pi/2, pi], [1, 2, 1])'); ok('polarplot: radians turned into degrees for the polar axis', o.data[0].type === 'scatterpolar' && o.polar && o.data[0].theta.join() === '0,90,180' && !o.three);
o = std('plot3(x, y, z)'); ok('plot3: a 3-D curve with three axis titles', o.data[0].type === 'scatter3d' && o.three && o.layout.scene.zaxis.title === 'z' && o.layout.scene.xaxis.title === 'x [m]' && JSON.stringify(o.data[0].z) === '[4,5,6]');
ok("plot3 with a marker the 3-D scene lacks falls back to a circle", std("plot3(x, y, z, 'p')").data[0].marker.symbol === 'circle');
ok('mismatched lengths name both arrays', /'x' has 3 value\(s\) and '\[1, 2\]' has 2/.test(msg(() => std('plot(x, [1, 2])'))), msg(() => std('plot(x, [1, 2])')));
ok('a bad style is explained', /not a line style/.test(msg(() => std("plot(x, y, 'zz')"))));
ok('a style before any data is refused', /must come after the data/.test(msg(() => std("plot('r', x, y)"))));
ok('wrong argument counts give the use', /use scatter\(x, y\)/.test(msg(() => std('scatter(x)'))) && /use bar\(y\) or bar\(x, y\)/.test(msg(() => std('bar(x, y, z)'))) && /use hist\(data\)/.test(msg(() => std('hist(x, 2, 3)'))));
ok('hist: bins must be a whole number', /whole number/.test(msg(() => std('hist(y, 2.5)'))));
ok('expressions of the results are plotted, with the expression as the name', std('plot(x, y*2)').data[0].name === 'y * 2' && std('plot(x, y*2)').layout.yaxis.title === 'y * 2');

// ---- plots of an expression (fplot, fsurf, ...), pie, area, quiver, and the Matlab names for the plots of an array
const fb = (src, v = {}) => PL.build(src, { scope: E.BoundedSolver.prototype.createScopeWithCoolProp(v), units: {} });
let fo = fb("fplot('x^2', 0, 2, 5)");
ok("fplot('x^2', 0, 2, 5): five points on the parabola, no dots needed for the power", JSON.stringify(fo.data[0].y) === '[0,0.25,1,2.25,4]' && fo.layout.xaxis.title === 'x' && fo.layout.yaxis.title === 'x^2', fo.data[0].y);
fo = fb("fplot('a*sin(w*x)', 0, 1, 3)", { a: 2, w: Math.PI });
ok('fplot uses the results as constants', near(fo.data[0].y[1], 2, 1e-12) && Math.abs(fo.data[0].y[2]) < 1e-12, fo.data[0].y);
fo = fb("fplot('sqrt(x)', -1, 1, 5)");
ok('fplot: points outside the domain are gaps, not errors', fo.data[0].y[0] === null && fo.data[0].y[1] === null && fo.data[0].y[4] === 1, fo.data[0].y);
ok('fplot: nothing real in the range is explained', /gives no number in the range/.test(msg(() => fb("fplot('sqrt(x-5)', 0, 1)"))));
ok('fplot: a style after the count of points', fb("fplot('x', 0, 1, 5, 'r--')").data[0].line.dash === 'dash');
fo = fb("fplot('cos(t)', 'sin(t)', 0, 6.283185307179586, 5)");
ok('fplot parametric: a circle, drawn with equal axes', near(fo.data[0].x[1], 0, 1) && near(fo.data[0].y[1], 1, 1e-12) && fo.layout.yaxis.scaleanchor === 'x');
ok('fplot: an empty range is refused', /range 3 to 1 is empty/.test(msg(() => fb("fplot('x', 3, 1)"))));
ok('fplot: wrong arguments give the use', /use fplot\('f\(x\)', a, b\)/.test(msg(() => fb("fplot('x')"))));
ok('fplot: a bad expression is named', /fplot\(\): 'x \+ ': /.test(msg(() => fb("fplot('x + ', 0, 1)"))), msg(() => fb("fplot('x + ', 0, 1)")));
ok('fplot: a count of points that is not a whole number is refused', /whole number from 2 to 2000/.test(msg(() => fb("fplot('x', 0, 1, 2.5)"))));
fo = fb("fplot3('cos(t)', 'sin(t)', 't', 0, 1, 4)");
ok('fplot3: a 3-D curve', fo.three && fo.data[0].type === 'scatter3d' && fo.data[0].z.length === 4 && near(fo.data[0].z[3], 1, 1e-12));
fo = fb("fsurf('x*y', 0, 2, 0, 1, 3)");
ok('fsurf: z[row = y][col = x] = x*y', fo.three && fo.data[0].z.length === 3 && JSON.stringify(fo.data[0].z[2]) === '[0,1,2]' && JSON.stringify(fo.data[0].x) === '[0,1,2]', fo.data[0].z);
fo = fb("fsurf('u', 'v', 'u+v', 0, 1, 0, 2, 3)");
ok('fsurf parametric: x(u, v), y(u, v), z(u, v) as arrays', fo.data[0].x.length === 3 && fo.data[0].x[0].length === 3 && fo.data[0].z[2][1] === 2.5 && fo.data[0].y[2][0] === 2, [fo.data[0].x, fo.data[0].z]);
fo = fb("fcontour('x+y', 0, 1, 0, 1, 3)");
ok('fcontour: a contour of the expression', fo.data[0].type === 'contour' && JSON.stringify(fo.data[0].z[2]) === '[1,1.5,2]');
fo = fb("fimplicit('x^2 + y^2 = 1', -2, 2, -2, 2)");
ok("fimplicit: the level 0 of lhs - rhs (contour at 0 only), a circle drawn with equal axes", fo.data[0].contours.start === 0 && fo.data[0].contours.end === 0 && fo.layout.yaxis.scaleanchor === 'x', fo.data[0].contours);
ok('fimplicit: z holds lhs - rhs', (() => { const o = fb("fimplicit('x^2 + y^2 = 1', -2, 2, -2, 2, 5)"); return near(o.data[0].z[2][2], -1, 1e-12) && near(o.data[0].z[0][0], 7, 1e-12); })());
fo = fb("fquiver('-y', 'x', -1, 1, -1, 1, 3)");
ok('fquiver: 9 arrows of 6 points each, with gaps between them', fo.data[0].x.length === 54 && fo.data[0].x.filter(v => v === null).length === 9, fo.data[0].x.length);
ok('quiver(x, y, u, v): arrows from lists', (() => { const o = fb('quiver([0, 1], [0, 0], [1, 1], [0, 0])'); return o.data[0].x.length === 12 && o.data[0].y[1] === 0; })());
ok('quiver: lists of different lengths are refused', /has 2 value\(s\) and/.test(msg(() => fb('quiver([0, 1], [0, 0], [1], [0, 0])'))));
fo = fb('pie([1, 2, 1])');
ok('pie: one slice per entry, labeled by index', fo.data[0].type === 'pie' && fo.data[0].values.length === 3 && fo.data[0].labels[1] === 'v[2]');
ok('pie: negative shares are refused', /0 or more/.test(msg(() => fb('pie([1, -2])'))));
fo = fb('area([1, 2, 3], [3, 1, 2])');
ok('area: filled to zero', fo.data[0].fill === 'tozeroy' && fo.data[0].y.length === 3);
fo = fb('area([1, 2], [[1, 2], [3, 4]])');
ok('area with a matrix: stacked columns', fo.data.length === 2 && fo.data[1].stackgroup === 'one');
fo = fb('surf([[1, 2], [3, 4]], [[1, 2], [3, 4]], [[1, 2], [3, 4]])');
ok('surf(X, Y, Z) with three arrays: a parametric surface', fo.three && fo.data[0].type === 'surface' && fo.data[0].x[1][0] === 2 && /X, Y and Z must have the same size/.test(msg(() => fb('surf([[1, 2], [3, 4]], [[1, 2]], [[1, 2], [3, 4]])'))));
ok('surf, contour, pcolor are surfaceplot, contourplot, heatmapplot; mesh draws the grid lines only', fb('surf([[1, 2], [3, 4]])').data[0].type === 'surface' && fb('contour([[1, 2], [3, 4]])').data[0].type === 'contour' && fb('pcolor([[1, 2], [3, 4]])').data[0].type === 'heatmap' && fb('mesh([[1, 2], [3, 4]])').data[0].hidesurface === true);
ok('errors name the Matlab name that was typed', /^surf\(\)/.test(msg(() => fb('surf(1)'))) && /^mesh\(\)/.test(msg(() => fb('mesh([[1, 2]])'))), [msg(() => fb('surf(1)')), msg(() => fb('mesh([[1, 2]])'))]);
r = run(`a = 2\nfplot('a*x', 0, 1)\nfsurf('x*y', 0, 1, 0, 1)\nsurf(Z)\nfimplicit('x^2 = y', -1, 1, 0, 1)\npie(v)\nfquiver('x', 'y', 0, 1, 0, 1)`);
ok('the parser sets the new plot lines aside', r.p.plots.length === 6 && r.p.parsedASTs.length === 1, r.p.plots.map(q => q.src));
r = run(`function y = area(r)\n  y = pi*r^2\nend\narea(r) = 12`);
ok('area(r) = 12 is still an equation (the short names may begin one)', r.p.plots.length === 0, r.p.plots);


// ---- notes: text(x, y, 'label'), arrow(x1, y1, x2, y2 [, 'label'])
let nt = fb("text(2, 3, 'peak')").notes[0];
ok("text(2, 3, 'peak'): a centered label at the point, no arrow", nt.x === 2 && nt.y === 3 && nt.text === 'peak' && nt.showarrow === false);
nt = fb('arrow(1, 2, 3, 4)').notes[0];
ok('arrow(x1, y1, x2, y2): the head at (x2, y2), the tail at (x1, y1), in data coordinates', nt.showarrow === true && nt.x === 3 && nt.y === 4 && nt.ax === 1 && nt.ay === 2 && nt.axref === 'x' && nt.text === '');
ok("arrow with a label: the label is at the tail", fb("arrow(1, 2, 3, 4, 'here')").notes[0].text === 'here');
ok('notes: expressions of the results are fine', fb("text(a + 1, 2*a, 'x')", { a: 2 }).notes[0].x === 3 && fb("text(a + 1, 2*a, 'x')", { a: 2 }).notes[0].y === 4);
{ const o = PL.build("text(x[1], 0, 'a')", { scope: E.BoundedSolver.prototype.createScopeWithCoolProp({ x: [1, 2] }), units: { x: 'cm' } });
  ok('notes: x[1] is given in the display unit of the array x (1 m is 100 cm)', near(o.notes[0].x, 100, 1e-12), o.notes[0]); }
ok('notes: wrong arguments give the use', /use text\(x, y, 'label'\)/.test(msg(() => fb('text(1, 2)'))) && /use arrow\(x1, y1, x2, y2\)/.test(msg(() => fb('arrow(1, 2, 3)'))) && /use text/.test(msg(() => fb("text(1, 'a', 2)"))));
ok('notes: a list is not a point', /single number/.test(msg(() => fb("text([1, 2], 3, 'a')"))));
r = run(`a = 2\nplot([1, 2], [3, 4])\ntext(1, 3, 'start')\narrow(1, 3, 2, 4)`);
ok('the parser sets text(...) and arrow(...) aside', r.p.plots.length === 3 && r.p.parsedASTs.length === 1, r.p.plots.map(q => q.src));

// ---- subscripted names (T_1, s_2) make the arrays too
const sb = PL.scope(new Map([['T_2', 20], ['T_1', 10], ['s_1', 1], ['s_2', 2], ['s_3', 3], ['M_1_1', 11], ['M_1_2', 12], ['M_2_1', 21], ['M_2_2', 22], ['P[1]', 5], ['P_1', 7], ['P_2', 8], ['eta', 1]]), () => '');
ok('subscripts: T_1, T_2 gathered into T in index order; the scalars stay', JSON.stringify(sb.sc.T) === '[10,20]' && sb.sc.T_1 === 10 && JSON.stringify(sb.sc.s) === '[1,2,3]', sb.sc);
ok('subscripts: M_i_j makes a matrix', JSON.stringify(sb.sc.M) === '[[11,12],[21,22]]', sb.sc.M);
ok('subscripts: a real P[1] array wins over P_1, P_2', JSON.stringify(sb.sc.P) === '[5]', sb.sc.P);
const sr = run(`T_1 = 300 [K]\nT_2 = 600 [K]\ns_1 = 1 [kJ/(kg K)]\ns_2 = 2 [kJ/(kg K)]\nP_1 = 100 [kPa]\nP_2 = 100 [kPa]\npropertyplot('water', 'Ts')`);
const so = (() => { const vals = new Map(Object.entries(sr.st)); const { sc, units } = PL.scope(vals, unitOf(sr.p)); return PL.build(sr.p.plots[0].src, { scope: E.BoundedSolver.prototype.createScopeWithCoolProp(sc), units }); })();
ok('propertyplot reads states named T_1, s_1 (no brackets)', so.data.some(d => /states/.test(d.name || '') && d.x.length === 2), so.data.map(d => d.name));
done();
