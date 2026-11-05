// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Units in the Variables pane: a unit of the wrong dimensions refused, Ctrl+D and Ctrl+Shift+D fill down;
// the converter's report shows each line and selects it in the SES text.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  await app.solve(`P_1 = 100000\nP_2 = 2*P_1\nP_3 = 3*P_1\nh_1 = enthalpy('water', 300, P_1)\nP_4 = 4*P_1`);
  const unit = (n) => pg.$eval(`input[data-var="${n}"][data-field="unit"]`, e => e.value);
  const setUnit = async (n, u) => { await pg.fill(`input[data-var="${n}"][data-field="unit"]`, u); await pg.press(`input[data-var="${n}"][data-field="unit"]`, 'Tab'); await pg.waitForTimeout(100); };
  await app.clear(); await setUnit('P_1', 'kJ/kg');
  ok('a unit of the wrong dimensions is refused, with the SI unit in the message', (await unit('P_1')) === '' && /P_1: 'kJ\/kg' does not fit this variable, whose SI unit is Pa/.test(await app.con()), await app.con());
  await setUnit('P_1', 'kPa');
  ok('a unit of the right dimensions is taken', (await unit('P_1')) === 'kPa');
  await pg.focus('input[data-var="P_1"][data-field="unit"]'); await pg.keyboard.press('Control+d'); await pg.waitForTimeout(100);
  const order = await pg.$$eval('input[data-field="unit"]', es => es.map(e => e.dataset.var));
  const next = order[order.indexOf('P_1') + 1];
  ok('Ctrl+D copies the unit to the next row', (await unit(next)) === 'kPa', [order, next]);
  await pg.focus('input[data-var="P_1"][data-field="unit"]'); await pg.keyboard.press('Control+Shift+d'); await pg.waitForTimeout(100);
  ok('Ctrl+Shift+D copies it to every row below with the same dimensions, and skips the others', (await unit('P_3')) === 'kPa' && (await unit('P_4')) === 'kPa' && (await unit('h_1')) === '', [await unit('P_3'), await unit('h_1')]);
  // the converter report: line text and selection
  await pg.fill('#editor', '');
  const [cv] = await Promise.all([app.ctx.waitForEvent('page'), pg.click('#btn-ees')]);
  await cv.waitForLoadState('load');
  await cv.fill('#cv-in', 'a = 30\nb = cos(a)\nP = 100*convert(kPa, Pa)');
  await cv.click('#cv-go');
  const li = await cv.$$eval('#cv-report li', ls => ls.map(l => l.textContent));
  ok('report items show the line of the SES text they refer to', li.some(t => /Line 2 b = cos\(\(a\)\*pi\/180\)/.test(t)) && li.some(t => /Line 3 P = 100/.test(t)), li);
  await cv.click('#cv-report li[data-line="2"]');
  const sel = await cv.$eval('#cv-out', t => t.value.slice(t.selectionStart, t.selectionEnd));
  ok('clicking an item selects its line in the SES text', sel === 'b = cos((a)*pi/180)', sel);
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
