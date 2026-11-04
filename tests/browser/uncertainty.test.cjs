// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Uncertainty in the page: the note when the box is not ticked, the published ± of the help example, the ± column (given values
// gray, results clickable), the breakdown of a result, ticking the box after a Solve, results dropped when the text changes,
// the box off at every visit, and the Formatted view.
const { open } = require('../lib/browser.cjs');
const path = require('path');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  const hp = await app.ctx.newPage(); await hp.goto('file://' + path.join(app.APP, 'help.html'));
  const ex = await hp.evaluate(() => ({ code: CODE['ex-t10'], rows: [...document.querySelectorAll('#ex-t10 table.res tr')].map(tr => [...tr.children].map(td => td.textContent.trim())) }));
  ok('the Uncertainty box is off at a new visit', !(await pg.isChecked('#uncertainty')));
  let c = await app.solve(ex.code);
  ok('not ticked: a note says how many values carry an uncertainty, and none is propagated', /4 given value\(s\) carry an uncertainty \(±\); tick Uncertainty/.test(c) && !/Uncertainties/.test(c), c.slice(-300));
  const cells = () => pg.$$eval('#variables-container tbody tr', trs => Object.fromEntries(trs.map(t => [t.children[0].textContent, { u: t.lastElementChild.textContent, cls: t.lastElementChild.className, click: !!t.lastElementChild.querySelector('[data-unc]') }])));
  let cl = await cells();
  ok('± column before propagating: the given values in gray (in their display unit), the results blank', cl.T_2.u === '1.0' && /unc-given/.test(cl.T_2.cls) && cl.P_1.u === '30' && cl.eta.u === '' && !cl.eta.click, cl);
  await pg.check('#uncertainty'); await pg.waitForTimeout(300);
  c = await app.con();
  const bad = ex.rows.filter(([n, v, u]) => { const m = c.match(new RegExp(`\\n  ${n} = (\\S+) ± (\\S+)`)); return !m || m[1] !== v || `± ${m[2]}` !== u; });
  ok('ticked after the Solve: the help example prints its published values and uncertainties', ex.rows.length === 4 && !bad.length, [bad, c.slice(-500)]);
  cl = await cells();
  ok('± column: the results in black and clickable, the given values still gray', cl.eta.u === '0.0038' && cl.eta.click && !/unc-given/.test(cl.eta.cls) && cl.h_2.u === '2.0' && /unc-given/.test(cl.T_1.cls), cl);
  await pg.click('[data-unc="eta"]'); await pg.waitForTimeout(100);
  const bd = await pg.evaluate(() => ({ title: document.getElementById('inspector-title').innerText, rows: [...document.querySelectorAll('#inspector-body tr')].slice(1).map(tr => [...tr.children].map(td => td.textContent)) }));
  const share = bd.rows.reduce((s, r) => s + parseFloat(r[3]), 0);
  ok('breakdown of eta: four inputs, largest share first (T_2), shares adding up to 100 %', bd.title === 'Uncertainty of eta: ± 0.0038' && bd.rows.length === 4 && bd.rows[0][0] === 'T_2' && Math.abs(share - 100) < 0.2, bd);
  await pg.click('#inspector-close');
  c = await app.solve(ex.code);
  ok('ticked: Solve propagates at once', /Uncertainties \(first order, independent inputs\):\n  eta = 0\.7029211 ± 0\.0038\n/.test(c), c.slice(-400));
  await pg.fill('#editor', ex.code + '\nW = 1'); await pg.dispatchEvent('#editor', 'input');
  await pg.click('#btn-check-units'); await pg.waitForTimeout(200);
  cl = await cells();
  ok('after an edit the propagated uncertainties are gone; the given ones stay', cl.eta.u === '' && cl.T_2.u === '1.0', cl);
  await pg.fill('#editor', 'T = 300 [K] +- 2 [K]\nD = 0.05 [m] +- 1 %'); await pg.click('#btn-format');
  const tx = await pg.$$eval('#formatted-body .fe-eq', es => es.map(e => e.dataset.tex));
  ok('Formatted: the value ± its uncertainty', tx[0] === 'T = 300 \\pm 2\\quad \\left[\\mathrm{K}\\right]' && tx[1] === 'D = 0.05\\quad \\left[\\mathrm{m}\\right] \\pm 1\\,\\%', tx);
  await pg.click('#btn-format');
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
