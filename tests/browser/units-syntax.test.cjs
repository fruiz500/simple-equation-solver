// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// In the page: declared units ($) in tags and in the Variables pane, and a table written over several lines.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), pg = app.pg;
  let c = await app.solve(`units $\nprice = 0.12 [$/kWh]\nE = 500 [kWh]\ncost = price*E [$]\n// copper, Table A.1\nT_tab = [100, 200, 300, 400,\n         600, 800]\nk_tab = [482, 413, 401, 393,\n         379, 366]\nk = interpolate(T_tab, k_tab, 350)\np2 = price`);
  ok('solve with $ units and a continued table', /\n  cost = 60 \[\$\]/.test(c) && /\n  price = 0\.12 \[\$\/kWh\]/.test(c) && /\n  k = 397\n/.test(c), c);
  // change the display unit in the Variables pane
  await pg.fill('input[data-var="p2"][data-field="unit"]', '$/MWh'); await pg.dispatchEvent('input[data-var="p2"][data-field="unit"]', 'change');
  c = await app.solve(await pg.inputValue('#editor'));
  ok('Variables pane unit $/MWh on an untagged variable: 120', /\n  p2 = 120 \[\$\/MWh\]/.test(c), c);
  await app.clear(); await pg.click('#btn-check-units'); await pg.waitForTimeout(200);
  c = await app.con(); ok('Check Units passes', /Unit check passed/.test(c) && !/Cannot combine/.test(c), c);
  ok('start-up line shows the copyright and license', /Copyright \(C\) 2026 Francisco Ruiz\. Free software under the GNU General Public License v3 or later/.test(app.startup), app.startup);
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
