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

  // standard plots: from Solve, and from the command line with variables kept there
  c = await app.solve("x[1] = 1\nx[2] = 2\nx[3] = 3\ny[1] = 1\ny[2] = 4\ny[3] = 9\nplot(x, y, 'r-o')"); await pg.waitForTimeout(300);
  let q = await plot();
  ok('plot(x, y, style) after Solve draws one scatter trace with lines and markers', q.types.join() === 'scatter' && /Plot, line 7/.test(c), [q.types, c.slice(-200)]);
  await app.clear();
  await pg.fill('#console-input', 'xs = linspace(0, 6, 25)'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(150);
  await pg.fill('#console-input', 'plot(xs, sin(xs))'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  q = await plot();
  c = await app.con();
  ok('a console variable is plotted from the command line, with the expression as its name', q.types.join() === 'scatter' && q.names[0] === 'sin(xs)' && !/Error|Unknown/.test(c), [q.names, c]);
  await pg.fill('#console-input', 'bar([3, 1, 2])'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  ok('bar([3, 1, 2]) on the command line draws a bar chart', (await plot()).types.join() === 'bar');
  await pg.fill('#console-input', 'loglog(xs, xs)'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  q = await plot();
  ok('loglog sets both axes logarithmic', q.lay.xaxis.type === 'log' && q.lay.yaxis.type === 'log', [q.lay.xaxis.type, q.lay.yaxis.type]);
  // a multi-line entry: variable and plot line together
  await app.clear();
  await pg.fill('#console-input', 'u = [1, 2, 3]\nhist(u, 3)'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  await app.clear();
  await pg.fill('#console-input', "fplot('sin(x)', 0, 6)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  q = await plot();
  ok("fplot('sin(x)', 0, 6) typed at the command line draws a curve with no Solve and no variables", q.types.join() === 'scatter' && q.names[0] === 'sin(x)' && q.lay.xaxis.title.text === 'x' && !/Error|ERROR/.test(await app.con()), [q.names, await app.con()]);
  await pg.fill('#console-input', "fsurf('sin(x)*cos(y)', -3, 3, -3, 3)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(500);
  ok('fsurf draws a 3-D surface', (await plot()).types.join() === 'surface');
  await pg.fill('#console-input', "fimplicit('x^2 + y^2 = 1', -2, 2, -2, 2)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(500);
  ok('fimplicit draws a contour at level 0', (await plot()).types.join() === 'contour');
  await pg.fill('#console-input', "fquiver('-y', 'x', -2, 2, -2, 2)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  ok('fquiver draws the field', (await plot()).types.join() === 'scatter');
  await pg.fill('#console-input', 'pie([3, 1, 2])'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  ok('pie draws a pie chart', (await plot()).types.join() === 'pie');
  await app.clear();
  await pg.fill('#console-input', "fplot('x', 3, 1)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(300);
  ok('a bad range is reported in the console', /range 3 to 1 is empty/.test(await app.con()), await app.con());
  const editable = await pg.evaluate(() => { const pc = document.getElementById('plot-container'); return !!(pc._context && pc._context.edits && pc._context.edits.axisTitleText); });
  ok('axis titles of a plot line are editable on the plot', editable);
  // notes: the buttons, and the text(...) and arrow(...) lines
  const notes = () => pg.evaluate(() => { const pc = document.getElementById('plot-container'); return (pc.layout.annotations || []).map(a => ({ x: a.x, y: a.y, ax: a.ax, text: a.text, arrow: a.showarrow })); });
  await pg.fill('#console-input', "fplot('x', 0, 4)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  await pg.click('#btn-add-note'); await pg.waitForTimeout(300);
  let nn = await notes();
  ok('Add Note puts one note with an arrow in the middle of the plot', nn.length === 1 && nn[0].text === 'note' && nn[0].arrow && Math.abs(nn[0].x - 2) < 0.6, nn);
  ok('notes and arrows are editable on the plot (text, position, tail)', await pg.evaluate(() => { const e = document.getElementById('plot-container')._context.edits; return e.annotationText && e.annotationPosition && e.annotationTail; }));
  await pg.click('#btn-clear-notes'); await pg.waitForTimeout(200);
  ok('Clear Notes removes them', (await notes()).length === 0);
  await app.clear();
  await pg.fill('#console-input', "text(1, 2, 'here')"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(300);
  nn = await notes();
  ok("text(...) typed at the command line adds a note to the plot shown", nn.length === 1 && nn[0].text === 'here' && nn[0].x === 1 && nn[0].y === 2 && !/ERROR/.test(await app.con()), [nn, await app.con()]);
  await pg.fill('#console-input', 'arrow(1, 2, 3, 3)'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(300);
  nn = await notes();
  ok('arrow(...) adds an arrow, from (1, 2) to (3, 3)', nn.length === 2 && nn[1].arrow && nn[1].x === 3 && nn[1].ax === 1, nn);
  c = await app.solve("x[1] = 100 [cm]\nx[2] = 200 [cm]\ny[1] = 1\ny[2] = 4\nplot(x, y)\ntext(x[2], y[2], 'end')\narrow(x[1], 0, x[1], y[1])");
  await pg.waitForTimeout(400);
  nn = await notes();
  ok('after Solve the notes of the equations are on the new plot only, in the units of the axes (x in cm)', nn.length === 2 && nn[0].text === 'end' && nn[0].x === 200 && nn[1].x === 100, [nn, c.slice(-300)]);
  c = await app.solve("x[1] = 1\nx[2] = 10\ny[1] = 1\ny[2] = 100\nsemilogy(x, y)\ntext(5, 10, 'mid')");
  await pg.waitForTimeout(400);
  nn = await notes();
  ok('on a log axis the note is placed at the right value (y = 10 is 1 in Plotly log units)', nn.length === 1 && Math.abs(nn[0].y - 1) < 1e-9 && nn[0].x === 5, nn);
  await pg.fill('#console-input', "surfaceplot([1, 2; 3, 4])"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  await app.clear();
  await pg.fill('#console-input', "text(1, 2, 'no')"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(300);
  ok('a 3-D plot takes no note, and says so', /flat \(x, y\) plots/.test(await app.con()), await app.con());
  await pg.evaluate(() => Plotly.purge('plot-container')); await app.clear();
  await pg.fill('#console-input', "text(1, 2, 'no')"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(300);
  ok('with no plot, a note asks for one first', /no plot to put a note on/.test(await app.con()), await app.con());
  await app.clear();
  await pg.fill('#console-input', 'u = [1, 2, 3]\nhist(u, 3)'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(400);
  ok('a multi-line console entry runs each line (variable, then plot line)', (await plot()).types.join() === 'histogram', await app.con());
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
/*
ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
*/
