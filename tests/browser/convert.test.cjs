// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// The EES converter page: opened from SES, converts a Rankine program, reports, sends the result back, and SES solves it.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  await pg.fill('#editor', '');
  const [cv] = await Promise.all([app.ctx.waitForEvent('page'), pg.click('#btn-ees')]);
  await cv.waitForLoadState('load');
  const errs = []; cv.on('pageerror', e => errs.push(e.message));
  await cv.fill('#cv-in', `"Ideal Rankine cycle"
P[1] = 75 [kPa]
h[1] = enthalpy(Water, P=P[1], x=0)
v[1] = volume(Water, P=P[1], x=0)
s[1] = entropy(Water, P=P[1], x=0)
P[2] = 3000
h[2] = h[1] + v[1]*(P[2] - P[1])
T[3] = 350
h[3] = enthalpy(Water, T=T[3], P=P[2])
s[3] = entropy(Water, T=T[3], P=P[2])
h[4] = enthalpy(Water, P=P[1], s=s[3])
eta = 1 - (h[4] - h[1])/(h[3] - h[2])
c = cos(60)`);
  await cv.click('#cv-go');
  const out = await cv.inputValue('#cv-out'), rep = await cv.$$eval('#cv-report li', ls => ls.map(l => l.textContent));
  ok('converted: property calls, unit tags from the unit system (C, kPa, kJ)', /h\[1\] = enthalpy\('water', 'P', P\[1\], 'Q', 0\) \[kJ\/kg\]/.test(out) && /T\[3\] = 350 \[degC\]/.test(out) && /P\[2\] = 3000 \[kPa\]/.test(out), out);
  ok('report: the degrees of cos() and the tagged numbers', rep.some(t => /cos\(\)/.test(t)) && rep.some(t => /T\[3\] = 350: a plain number/.test(t)), rep);
  await cv.click('#cv-send');
  await pg.waitForTimeout(200);
  ok('Send to SES puts the equations in the Equations pane', (await pg.inputValue('#editor')) === out);
  const c = await app.solve(out);
  ok('SES solves the converted program: eta = 0.2602 (Cengel, Example 10-1: 26.0 %), cos(60 deg) = 0.5', /eta = 0\.2602/.test(c) && /\n  c = 0\.5\n/.test(c), c.slice(-500));
  ok('no page errors in either window', errs.length === 0 && app.pageErrors.length === 0, [errs, app.pageErrors]);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
