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
done();
