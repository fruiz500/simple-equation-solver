// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Plots in the page: a plot line drawn after Solve, one typed on the command line, log axes set by the diagram and put back
// for the next table plot, a contour plot of a T[i, j] grid, errors in the console, the Y2 axis, plot lines in Formatted.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  const plot = () => pg.evaluate(() => { const pc = document.getElementById('plot-container'); return { names: (pc.data || []).map(d => d.name), types: (pc.data || []).map(d => d.type), lay: pc.layout || {} }; });
  const logs = () => pg.evaluate(() => [document.getElementById('plot-logx').checked, document.getElementById('plot-logy').checked]);
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
  let c = await app.solve(RANKINE); await pg.waitForTimeout(300);
  let p = await plot();
  ok('Solve draws the plot line: dome, processes and the four states', /Plot, line 13: 4 state\(s\) from T and s; 4 process\(es\)/.test(c) && p.names.join() === 'saturation,processes,other processes (straight),states', [c.slice(-300), p.names]);
  ok('T-s axes in degC and kJ/(kg K), linear', p.lay.yaxis.title.text === 'T [degC]' && p.lay.xaxis.title.text === 's [kJ/(kg K)]' && p.lay.yaxis.type === 'linear', p.lay.yaxis);
  await pg.fill('#console-input', "propertyplot('water', 'Ph', 'cycle')"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(500);
  p = await plot();
  ok('the command line draws another diagram from the last Solve, with log P', p.lay.yaxis.type === 'log' && p.lay.yaxis.title.text === 'P [kPa]' && (await logs()).join() === 'false,true', [p.lay.yaxis, await logs()]);
  await pg.fill('#console-input', "propertyplot('water', 'Tx')"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(200);
  ok('a wrong plot line on the command line: a message, and the plot stays', /not 'Tx'/.test(await app.con()) && (await plot()).lay.yaxis.type === 'log');
  c = await app.solve(`x = 1\npropertyplot('INCOMP::MEG-30%', 'Ts')`);
  ok('a plot line that fails: the results stand and the console says why, with the line', /Solution Converged/.test(c) && /Plot, line 2: propertyplot\(\): 'INCOMP::MEG-30%' has no saturation dome/.test(c), c.slice(-300));

  // error bars: only when the Uncertainty box is ticked
  const RU = RANKINE.replace('P[1] = 10 [kPa]', 'P[1] = 10 [kPa] +- 1 [kPa]').replace('T[3] = 500 [degC]', 'T[3] = 500 [degC] +- 5 [K]');
  const bars = () => pg.evaluate(() => { const d = document.getElementById('plot-container').data.find(t => t.name === 'states'); return d && [d.error_y && d.error_y.array, d.error_x && d.error_x.array]; });
  c = await app.solve(RU); await pg.waitForTimeout(300);
  let b = await bars();
  ok('Uncertainty box off: no error bars', b && !b[0] && !b[1], b);
  await pg.check('#uncertainty'); c = await app.solve(RU); await pg.waitForTimeout(500);
  b = await bars();
  ok('Uncertainty box ticked: error bars on the states, 5 on T[3]', b && b[0] && Math.abs(b[0][2] - 5) < 1e-6 && b[1].every(v => v > 0) && /error bars from the uncertainties/.test(c), [b, c.slice(-200)]);
  await pg.fill('#console-input', "propertyplot('water', 'Ts', T, s)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(500);
  b = await bars();
  ok('the command line draws them too, for arrays given by name', b && b[0] && Math.abs(b[0][2] - 5) < 1e-6, b);
  await pg.uncheck('#uncertainty');

  // a table plot after a diagram: the log axes chosen before it come back; Y2 on the right
  await pg.fill('#editor', 'y = x^2\nz = sqrt(x)\n//x = 1'); await pg.dispatchEvent('#editor', 'input'); await pg.waitForTimeout(600);
  await pg.selectOption('#param-var', 'x'); await pg.fill('#param-start', '1'); await pg.fill('#param-end', '4'); await pg.fill('#param-steps', '4');
  await pg.click('#btn-run-table'); await pg.waitForTimeout(600);
  ok('a table plot after a diagram: log axes back to what they were (off)', (await logs()).join() === 'false,false' && (await plot()).lay.yaxis.type === 'linear', await logs());
  await pg.selectOption('#plot-y-select', 'y'); await pg.selectOption('#plot-y2-select', 'z'); await pg.waitForTimeout(300);
  p = await plot();
  ok('Y2: a second curve on its own axis on the right, with the legend', p.names.join() === 'y vs x,z vs x (right axis)' && p.lay.yaxis2.side === 'right' && p.lay.yaxis2.title.text === 'z' && p.lay.showlegend, [p.names, p.lay.yaxis2]);
  await pg.selectOption('#plot-y2-select', ''); await pg.waitForTimeout(300);
  ok('Y2 (none): one curve again', (await plot()).names.length === 1);

  // contour of a grid T[i, j]
  c = await app.solve(`N = 6
duplicate j = 1 : N
  y[j] = (j - 1)/(N - 1) [m]
end
duplicate i = 1 : N
  x[i] = (i - 1)/(N - 1) [m]
  duplicate j = 1 : N
    T[i, j] = 300 + 100*sin(pi*x[i])*sinh(pi*y[j])/sinh(pi) [K]
  end
end
contourplot(x, y, T)`); await pg.waitForTimeout(300);
  p = await plot();
  ok('contourplot of T[i, j] over x and y', /Plot, line 11: 6 x 6 values of T/.test(c) && p.types.join() === 'contour' && p.lay.xaxis.title.text === 'x [m]', [c.slice(-200), p]);
  c = await app.solve(`a = 1\nsurfaceplot([1, 2; 3, 4])\nheatmapplot([1, 2; 3, 4])`); await pg.waitForTimeout(300);
  ok('two plot lines: the last is shown, and the console says so', (await plot()).types.join() === 'heatmap' && /2 plot lines: the Plot pane shows the last/.test(c));
  await pg.fill('#console-input', 'surfaceplot([1, 2; 3, 4])'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  ok('surfaceplot from the command line: a 3-D scene', (await plot()).types.join() === 'surface');

  await pg.fill('#editor', "x = 1\npropertyplot('water', 'Ts')"); await pg.click('#btn-format'); await pg.waitForTimeout(200);
  const items = await pg.$$eval('#formatted-body > *', es => es.map(e => e.textContent.trim()));
  ok('Formatted: the plot line is shown as text', items.some(t => t === "propertyplot('water', 'Ts')"), items);
  await pg.click('#btn-format');
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
