// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Keyboard shortcuts: each key does what the table says, from the Equations pane, a Variables cell or the console box; the
// comment toggles; the unit arrow; the list printed by ?; every key in the help; the tooltips; the warning before leaving.
const path = require('path');
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app, kb = pg.keyboard;
  const EQ = `P = 100 [kPa]\nT = 300 [K]\nh = enthalpy('water', T, P)\nx = 2*y\ny = 3`;
  const fresh = async (t = EQ) => { await pg.fill('#editor', t); await pg.dispatchEvent('#editor', 'input'); await app.clear(); await pg.focus('#editor'); };
  const after = async (re, ms = 20000) => { await pg.waitForFunction((s) => new RegExp(s).test(document.querySelector('#console-output').textContent), re.source, { timeout: ms }).catch(() => {}); return app.con(); };

  await fresh(); await kb.press('F2');
  ok('F2 solves', /Solution Converged/.test(await after(/Solution Converged|ERROR/)));
  await fresh(); await kb.press('Control+Enter');
  ok('Ctrl+Enter solves', /Solution Converged/.test(await after(/Solution Converged|ERROR/)));
  await fresh(); await pg.focus('#console-input'); await kb.press('Control+Enter');
  ok('Ctrl+Enter in the console box solves (and does not run the box)', /Solution Converged/.test(await after(/Solution Converged|ERROR/)) && !/^> /m.test(await app.con()));
  await fresh(); await kb.press('F8');
  ok('F8 checks', /--- Check ---/.test(await after(/Syntax OK|error/)));
  await fresh(); await kb.press('Control+k');
  ok('Ctrl+K checks', /--- Check ---/.test(await after(/Syntax OK|error/)));

  // a Guess typed and not yet left takes effect: F2 from the cell
  await fresh(`x^2 = 4`); await kb.press('F2'); await after(/Solution Converged|ERROR/);
  await pg.fill('input[data-var="x"][data-field="guess"]', '-5'); await app.clear(); await kb.press('F2');
  await after(/Solution Converged|ERROR/);
  ok('F2 from a Guess cell uses the value just typed (negative root)', /x = -2\b/.test(await app.sol()), (await app.sol()).slice(-200));

  await fresh(`x^2 = 4`); await kb.press('F2'); await after(/Solution Converged/);
  await pg.fill('input[data-var="x"][data-field="guess"]', '9'); await pg.dispatchEvent('input[data-var="x"][data-field="guess"]', 'change');
  await pg.focus('#editor'); await app.clear(); await kb.press('Control+g'); await pg.waitForTimeout(150);
  ok('Ctrl+G makes the last solution the guesses', /^-?2$/.test(await pg.inputValue('input[data-var="x"][data-field="guess"]')) && /now the guesses/.test(await app.con()), await pg.inputValue('input[data-var="x"][data-field="guess"]'));
  await pg.fill('#editor', 'x^2 = 5'); await app.clear(); await pg.focus('#editor'); await kb.press('Control+g');
  ok('Ctrl+G after an edit: refused with the reason', /changed after the last Solve/.test(await app.con()));

  await fresh(); await kb.press('F2'); await after(/Solution Converged/);
  await kb.press('F9');
  ok('F9 goes to the first Guess cell', await pg.evaluate(() => document.activeElement.dataset.field === 'guess'));
  await kb.press('Control+e');
  ok('Ctrl+E goes back to the Equations pane', await pg.evaluate(() => document.activeElement.id === 'editor'));
  await pg.evaluate(() => { const e = document.getElementById('editor'), i = e.value.indexOf('\nh =') + 1; e.setSelectionRange(i, i); });
  await kb.press('Control+Shift+V');
  ok('Ctrl+Shift+V goes to the row of the variable at the cursor', await pg.evaluate(() => document.activeElement.dataset.var === 'h' && document.activeElement.dataset.field === 'guess'));
  await kb.press('Control+u');
  ok('Ctrl+U goes to the Variables pane', await pg.evaluate(() => document.activeElement.dataset.field === 'guess'));

  await pg.focus('#editor'); await kb.press('F10');
  ok('F10 shows the formatted equations', await pg.evaluate(() => !document.getElementById('formatted').hidden));
  await kb.press('F10');
  ok('F10 again goes back to the text', await pg.evaluate(() => document.getElementById('formatted').hidden));
  await pg.focus('#editor'); await kb.press('F4'); await pg.waitForTimeout(200);
  ok('F4 opens Min/Max (here: it says what is missing, as the button does)', /Min\/Max|free|degree/i.test(await app.con()) || await pg.evaluate(() => getComputedStyle(document.getElementById('optimize-modal')).display !== 'none'));
  await pg.evaluate(() => { document.getElementById('optimize-modal').style.display = 'none'; });

  await fresh(`c = 5 +- 0.5\nW = m*c\nm = 2`); await kb.press('F6');
  ok('F6 ticks Uncertainty and solves', /Uncertainties \(first order/.test(await after(/Uncertainties|ERROR/)) && await pg.isChecked('#uncertainty'));
  await pg.uncheck('#uncertainty');
  await fresh(); await kb.press('F5'); await pg.waitForTimeout(100);
  ok('F5 does not reload: it says SES has no Min/Max Table', /F5: SES has no Min\/Max Table/.test(await app.con()) && (await pg.inputValue('#editor')) === EQ);
  await kb.press('F7');
  ok('F7 says SES has no Uncertainty Propagation Table', /F7: SES has no Uncertainty Propagation Table/.test(await app.con()));

  await fresh(`a = 1`); await kb.press('F3'); await pg.waitForTimeout(200);
  ok('F3 runs the parametric table (here: it asks for a variable to sweep, as the button does)', (await app.con()).length > 0, await app.con());
  await fresh(); await kb.press('Control+f');
  ok('Ctrl+F opens Find', await pg.evaluate(() => !document.getElementById('find-bar').hidden && document.activeElement.id === 'find-text'));
  await kb.press('Escape'); await kb.press('Control+r');
  ok('Ctrl+R opens Replace', await pg.evaluate(() => !document.getElementById('find-bar').hidden));
  await kb.press('Escape');

  // comments
  await fresh(`a = 1\n  b = 2\n\nc = 3`);
  await pg.evaluate(() => document.getElementById('editor').setSelectionRange(0, 13));
  await kb.press('Control+/');
  ok('Ctrl+/ comments the selected lines, keeping the indentation and skipping blank lines', (await pg.inputValue('#editor')) === `// a = 1\n  // b = 2\n\nc = 3`, await pg.inputValue('#editor'));
  await kb.press('Control+/');
  ok('Ctrl+/ again uncomments them', (await pg.inputValue('#editor')) === `a = 1\n  b = 2\n\nc = 3`, await pg.inputValue('#editor'));
  await kb.press('Control+z'); 
  ok('Ctrl+Z undoes a comment toggle', (await pg.inputValue('#editor')) === `// a = 1\n  // b = 2\n\nc = 3`, await pg.inputValue('#editor'));
  await fresh(`a = 1\nb = 2`); await pg.evaluate(() => document.getElementById('editor').setSelectionRange(7, 7));
  await kb.press('Control+Shift+BracketLeft');
  ok('Ctrl+Shift+[ puts the line at the cursor between { }', (await pg.inputValue('#editor')) === `a = 1\n{b = 2}`, await pg.inputValue('#editor'));
  await kb.press('Control+Shift+BracketLeft');
  ok('Ctrl+Shift+[ again takes the braces out', (await pg.inputValue('#editor')) === `a = 1\nb = 2`, await pg.inputValue('#editor'));
  await pg.evaluate(() => document.getElementById('editor').setSelectionRange(0, 11)); await kb.press('Control+Shift+BracketLeft');
  await app.clear(); await kb.press('Control+k');
  ok('a selection of several lines between { } is a comment that SES accepts', (await pg.inputValue('#editor')) === `{a = 1\nb = 2}` && !/error/i.test(await after(/Syntax OK|rror/)), await app.con());
  await pg.focus('#console-input'); await kb.press('Control+/');
  ok('Ctrl+/ outside the Equations pane changes nothing', (await pg.inputValue('#editor')) === `{a = 1\nb = 2}`);

  // AI box, Esc
  await pg.fill('#console-input', ''); await pg.focus('#editor'); await kb.press('Control+i');
  ok('Ctrl+I puts AI: in the console box, with the cursor after it', await pg.evaluate(() => { const c = document.getElementById('console-input'); return document.activeElement === c && c.value === 'AI: ' && c.selectionStart === 4; }));
  await kb.press('Escape');
  ok('Esc in the console box goes back to the Equations pane', await pg.evaluate(() => document.activeElement.id === 'editor'));
  await pg.fill('#console-input', '');

  // the unit arrow
  await fresh(`P_1 = 100 [kPa]\nP_2 = 2*P_1\nP_3 = 3*P_1\nT = 300 [K]`); await kb.press('F2'); await after(/Solution Converged/);
  const unit = (v) => pg.inputValue(`input[data-var="${v}"][data-field="unit"]`);
  const order = await pg.$$eval('input[data-field="unit"]', a => a.map(x => x.dataset.var));
  const first = order.find(v => /^P_/.test(v)), idx = order.indexOf(first);
  await pg.fill(`input[data-var="${first}"][data-field="unit"]`, 'bar');
  ok('the arrow is hidden until its Unit cell has the focus', await pg.$eval(`input[data-var="${first}"][data-field="unit"]`, i => getComputedStyle(i.nextElementSibling).visibility === 'visible')
    && await pg.$eval(`input[data-var="${order[(idx + 1) % order.length]}"][data-field="unit"]`, i => getComputedStyle(i.nextElementSibling).visibility === 'hidden'));
  await pg.click(`input[data-var="${first}"][data-field="unit"] + .fill-down`, { modifiers: ['Shift'] }); await pg.waitForTimeout(150);
  const ps = order.filter(v => /^P_/.test(v));
  const units = await Promise.all(ps.map(unit));
  ok('Shift+click on the arrow copies the unit to every row below with the same dimensions, from a row whose unit came from a tag (regression), not to T', ps.slice(ps.indexOf(first)).every((v, k) => units[ps.indexOf(first) + k] === 'bar') && (await unit('T')) === 'K', [order, units, await unit('T')]);

  // ? and the help
  await app.clear(); await pg.fill('#console-input', '?'); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(100);
  const list = await app.con(), table = await pg.evaluate(() => window.SESShortcuts);
  ok('? lists every shortcut', table.every(s => s.keys.every(k => list.includes(k))) && /Ctrl\+D/.test(list), list);
  ok('the tooltips show the keys', /\(F2, Ctrl\+Enter\)$/.test(await pg.getAttribute('#btn-solve', 'title')) && /\(F1\)$/.test(await pg.getAttribute('#btn-help', 'title')));
  const hp = await app.ctx.newPage(); await hp.goto('file://' + path.join(app.APP, 'help.html'));
  const helpKeys = await hp.$$eval('#shortcuts + p + table td:first-child', tds => tds.map(td => td.textContent).join(' | '));
  const miss = table.flatMap(s => s.keys).filter(k => !['F5', 'F7'].includes(k) && !helpKeys.includes(k));
  ok('every shortcut is in the help table (F5 and F7 in the note under it)', miss.length === 0 && await hp.$eval('#shortcuts', h => /F5 and F7/.test(h.nextElementSibling.nextElementSibling.nextElementSibling.textContent)), miss);
  await hp.close();

  // leaving with unsaved equations asks first; after Open/Save it does not (Save tested in the session-file tests)
  const types = []; pg.on('dialog', d => types.push(d.type()));
  await pg.fill('#editor', 'q = 1'); await pg.dispatchEvent('#editor', 'input');
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await pg.close({ runBeforeUnload: true }); await new Promise(r => setTimeout(r, 500));
  ok('leaving the page with unsaved equations asks first', types.includes('beforeunload'), types);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
