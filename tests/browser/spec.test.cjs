// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Spec lines in the page: Solve designs to the spec and reports it, the ± column is filled, a parametric table is refused.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  let c = await app.solve(`c = 5 [kJ/kg] +- 0.5 [kJ/kg]\nW = m*c [kW]\nW_spec = 100 [kW]\nW = atleast(W_spec, 0.95)`);
  await pg.waitForTimeout(300); c = await app.con();
  ok('Solve reports the design value and its margin', /Spec, line 4: W >= 100 \[kW\] with probability 0\.95: the equations use W = 119\.6\d* \[kW\], a margin of 1\.645 × 1\d\.?\d* \[kW\] \(the uncertainty of W with m = 23\.9\d* held fixed, as in the built design;/.test(c), c.slice(-400));
  ok('the uncertainties are printed although the box is not ticked', /Uncertainties \(first order, independent inputs\):\n(  .*\n)*  W = 119\.6\d* ± 12 \[kW\]/.test(c), c.slice(-400));
  const cell = await pg.$$eval('#variables-container tbody tr', trs => Object.fromEntries(trs.map(t => [t.children[0].textContent, t.lastElementChild.textContent])));
  ok('the ± column shows the uncertainty of W at the design point', /^1\d/.test(cell.W), cell);
  await pg.fill('#editor', `c = 5 +- 0.5\nW = m*c\nW = atleast(100, 0.95)\n//m = 1`); await pg.dispatchEvent('#editor', 'input'); await pg.waitForTimeout(600);
  await app.clear();
  await pg.selectOption('#param-var', 'c').catch(() => {});
  await pg.fill('#param-start', '1'); await pg.fill('#param-end', '2'); await pg.fill('#param-steps', '2');
  await pg.click('#btn-run-table'); await pg.waitForTimeout(400);
  ok('a parametric table with a spec line is refused', /spec lines \(atleast, atmost\) work with Solve only/.test(await app.con()), (await app.con()).slice(-300));
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
