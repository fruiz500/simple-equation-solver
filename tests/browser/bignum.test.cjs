// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Console: bignumber() arithmetic shown in full, digits(n), the exact 1000!, and roots(p, 'all') with complex roots.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  const cmd = async (t) => { await app.clear(); await pg.fill('#console-input', t); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(150); return (await app.con()).split('\n').slice(1).join('\n').trim(); };
  let c = await cmd('factorial(bignumber(30))');
  ok('a bignumber result is shown in full: 30! = 265252859812191058636308480000000', c === '265252859812191058636308480000000', c);
  c = await cmd('factorial(bignumber(1000))');
  ok('1000! at the default 64 digits: 4.023872600770937735...e+2567', /^4\.0238726007709377354370243392300398571937486421071463254379991\d*e\+2567$/.test(c), c);
  c = await cmd('digits(3000)');
  ok('digits(3000) answers what it did', /now keeps 3000 significant digits/.test(c), c);
  c = await cmd('factorial(bignumber(1000))');
  ok('then 1000! exactly: 2568 digits, starting 40238726 and ending in 249 zeros', /^40238726007709377354/.test(c) && c.length === 2568 && /[1-9]0{249}$/.test(c), [c.length, c.slice(-260, -240)]);
  c = await cmd('digits(0)');
  ok('digits() refuses a bad value', /digits\(\): give a whole number/.test(c), c);
  await cmd('digits(210)');
  c = await cmd('acos(bignumber(-1))');
  ok('arbitrary floating point: pi to 200 decimals from acos(bignumber(-1))', c.startsWith('3.14159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798214808651328230664709384460955058223172535940812848111745028410270193852110555964462294895493038196'), c.slice(0, 80));
  await cmd('digits(64)');
  c = await cmd("roots([1, -1, 1, -1], 'all')");
  ok("roots(p, 'all') on the console lists the complex roots: -i, i, 1", /-i/.test(c) && /\bi\b/.test(c) && /1/.test(c), c);
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
