// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// In the page: Plot lists in alphabetical order, Clear Table, the movable legend, Tab in the editor, the Min/Max bounds, and integral().
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), pg = app.pg;

  // ---- plot lists and Clear Table
  await pg.fill('#editor', 'zeta = 2*a\nB = a + 1\nc_2 = a^2\nC_10 = 3*a'); await pg.waitForTimeout(500);
  await pg.selectOption('#param-var', 'a'); await pg.fill('#param-start', '1'); await pg.fill('#param-end', '3'); await pg.fill('#param-steps', '3');
  await pg.click('#btn-run-table'); await pg.waitForTimeout(800);
  const xs = await pg.$$eval('#plot-x-select option', o => o.map(x => x.value));
  ok('Plot X list in alphabetical order, like the others', JSON.stringify(xs) === JSON.stringify(['a', 'B', 'c_2', 'C_10', 'zeta']), xs);
  ok('and the same for Y', JSON.stringify(await pg.$$eval('#plot-y-select option', o => o.map(x => x.value))) === JSON.stringify(xs));
  await app.clear(); await pg.click('#btn-clear-table');
  ok('Clear Table empties the pane', await pg.$eval('#parametric-container', e => e.innerHTML) === '');
  await pg.click('#btn-export-table'); await pg.waitForTimeout(100);
  ok('and Export then has nothing to export', /No table to export yet/.test(await app.con()), await app.con());

  // ---- legend
  await pg.selectOption('#plot-x-select', 'a'); await pg.selectOption('#plot-y-select', 'B'); await pg.waitForTimeout(300);
  await pg.check('#plot-overlay-check'); await pg.selectOption('#plot-y-select', 'zeta'); await pg.waitForTimeout(300);
  const lg = await pg.$eval('#plot-container', g => ({ n: g.data.length, show: g.layout.showlegend, drag: g._context.edits.legendPosition, rename: g._context.edits.legendText }));
  ok('an overlaid curve shows the legend; it can be dragged and its names edited', lg.n === 2 && lg.show === true && lg.drag && lg.rename, lg);
  await pg.uncheck('#plot-overlay-check');

  // ---- Tab in the editor
  const val = () => pg.inputValue('#editor');
  await pg.fill('#editor', 'a = 1\nb = 2\nc = 3');
  await pg.click('#editor'); await pg.keyboard.press('Control+Home'); await pg.keyboard.press('Tab');
  ok('Tab inserts two spaces at the cursor and keeps the focus', await val() === '  a = 1\nb = 2\nc = 3' && await pg.evaluate(() => document.activeElement.id) === 'editor', await val());
  await pg.$eval('#editor', ed => ed.setSelectionRange(0, ed.value.indexOf('c')));   // lines 1 and 2
  await pg.keyboard.press('Tab');
  ok('Tab indents every selected line', await val() === '    a = 1\n  b = 2\nc = 3', await val());
  await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Shift+Tab');
  ok('Shift+Tab unindents them', await val() === 'a = 1\nb = 2\nc = 3', await val());
  await pg.keyboard.press('Control+z');
  ok('Ctrl+Z undoes an indentation', await val() === '  a = 1\nb = 2\nc = 3', await val());
  await pg.keyboard.press('Escape'); await pg.keyboard.press('Tab');
  ok('Esc and then Tab leaves the editor', await pg.evaluate(() => document.activeElement.id) !== 'editor' && await val() === '  a = 1\nb = 2\nc = 3');

  // ---- bounds
  await app.solve('x = 5\ny^2 = 9');
  const box = (v, f) => `input[data-var="${v}"][data-field="${f}"]`;
  await pg.fill(box('x', 'upper'), '1'); await pg.dispatchEvent(box('x', 'upper'), 'change');
  await app.clear();
  await pg.fill(box('x', 'lower'), '2'); await pg.dispatchEvent(box('x', 'lower'), 'change'); await pg.waitForTimeout(100);
  ok('Min above Max is refused and undone', /x: Min \(2\) cannot be above Max \(1\); the change was undone/.test(await app.con()) && await pg.inputValue(box('x', 'lower')) === '', [await app.con(), await pg.inputValue(box('x', 'lower'))]);
  let c = await app.solve('x = 5\ny^2 = 9');
  ok('a value computed directly outside its bounds is reported', /WARNING: x = 5 is outside its bounds, -inf to 1\. Bounds limit the search for unknowns solved by iteration/.test(c), c);
  await pg.fill(box('y', 'lower'), '-10'); await pg.dispatchEvent(box('y', 'lower'), 'change');
  await pg.fill(box('y', 'upper'), '0'); await pg.dispatchEvent(box('y', 'upper'), 'change');
  await pg.fill(box('y', 'guess'), '-1'); await pg.dispatchEvent(box('y', 'guess'), 'change');
  c = await app.solve('x = 5\ny^2 = 9');
  ok('bounds steer an unknown solved by iteration: y = -3 within -10 to 0, no warning for it', /\n  y = -3\n/.test(c) && !/WARNING: y/.test(c), c);
  // ---- integral(), in the equations and on the console line
  c = await app.solve('T1 = 300 [K]\nT2 = 600 [K]\nds = integral(1000/T, T, T1, T2)');
  ok('integral() in an equation: 1000 ln 2 = 693.1472', /\n  ds = 693\.1472\n/.test(c), c);
  await app.clear(); await pg.fill('#console-input', 'integral(x^2, x, 0, 3)'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(150);
  ok('and on the console line: 9', /^> integral\(x\^2, x, 0, 3\)\n  9\n$/.test(await app.con()), await app.con());
  // Formatted view: equations as MathML, back to the editor with the text unchanged
  const fsrc = 'h_2 = h_1 - eta*(h_1 - h_2s) [kJ/kg]\nm_dot = rho*V*A/2 // comment\nfunction f = g(x)\n  f = x\nend';
  await pg.fill('#editor', fsrc); await pg.click('#btn-format');
  const fv = await pg.evaluate(() => ({ maths: document.querySelectorAll('#formatted-body math').length, texts: document.querySelectorAll('#formatted-body .fe-text').length,
    editorHidden: document.getElementById('editor-box').hidden, label: document.getElementById('btn-format').textContent, body: document.getElementById('formatted-body').textContent }));
  ok('Formatted: 2 equations as MathML, 3 block lines as text, comment left out, editor hidden', fv.maths === 2 && fv.texts === 3 && fv.editorHidden && fv.label === 'Text' && !/comment/.test(fv.body), fv);
  ok('each equation carries its LaTeX for copying', (await pg.$$eval('#formatted-body .fe-eq', es => es.map(e => e.dataset.tex)))[0] === '{h}_{2} = {h}_{1} - \\eta \\cdot \\left({h}_{1} - {h}_{\\mathrm{2s}}\\right)\\quad \\left[\\mathrm{kJ/kg}\\right]', await pg.$$eval('#formatted-body .fe-eq', es => es.map(e => e.dataset.tex)));
  await pg.click('#btn-format');
  ok('Text: back to the editor, text unchanged', !(await pg.$eval('#editor-box', e => e.hidden)) && (await pg.$eval('#formatted', e => e.hidden)) && (await pg.inputValue('#editor')) === fsrc);
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
