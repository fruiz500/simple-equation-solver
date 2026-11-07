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
  ok('digits(3000) answers what it did', /bignumber\(\) arithmetic now keeps 3000 significant digits/.test(c), c);
  c = await cmd('factorial(bignumber(1000))');
  ok('then 1000! exactly: 2568 digits, starting 40238726 and ending in 249 zeros', /^40238726007709377354/.test(c) && c.length === 2568 && /[1-9]0{249}$/.test(c), [c.length, c.slice(-260, -240)]);
  c = await cmd('digits(0)');
  ok('digits() refuses a bad value', /digits\(\): give a whole number/.test(c), c);
  await cmd('digits(210)');
  c = await cmd('acos(bignumber(-1))');
  ok('arbitrary floating point: pi to 200 decimals from acos(bignumber(-1))', c.startsWith('3.14159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798214808651328230664709384460955058223172535940812848111745028410270193852110555964462294895493038196'), c.slice(0, 80));
  const pi210 = await cmd('acos(bignumber(-1))');
  // after digits(n) above 16 every expression is computed with n digits, not only bignumber()
  ok('pi is pi to the digits set, the same as acos(bignumber(-1))', (await cmd('pi')) === pi210 && pi210.length >= 205, pi210.length);
  ok('e is e to the digits set: exp(1) - e is zero, and e starts 2.71828182845904523536028747135266249775724709369995', (await cmd('exp(1) - e')) === '0' && (await cmd('e')).startsWith('2.71828182845904523536028747135266249775724709369995'));
  c = await cmd('1/3');
  ok('1/3 has 210 digits', /^0\.3{205,}$/.test(c) && c.length >= 207, c.length);
  ok('sqrt(2) and ln(2) have all their digits', (await cmd('sqrt(2)')).startsWith('1.4142135623730950488016887242096980785696718753769') && (await cmd('sqrt(2)')).length >= 205
    && (await cmd('ln(2)')).startsWith('0.69314718055994530941723212145817656807550013436025525412068') && (await cmd('ln(2)')).length >= 205);
  ok('ordinary calculations keep working: 2 + 3, 5 ft to m, a matrix inverse, an error message', (await cmd('2 + 3')) === '5' && (await cmd('5 ft to m')) === '1.524 m' && /-2, 1\], \[1\.5, -0\.5/.test(await cmd('inv([1,2;3,4])')) && /Unexpected end of expression/.test(await cmd('1 +')));
  await app.solve('T_a = 2318.742199999999\nP_1 = 10 [kPa]');
  c = await cmd('P_1 * pi');
  ok('a result with a few digits (10000) mixes with pi at full precision', /^31415\.9265358979323846264338327950288419716939937510582097494459/.test(c) && c.length >= 205, c.slice(0, 60));
  c = await app.con(); const c2 = await cmd('T_a * 2');
  ok('a result of Solve with 16 digits cannot be mixed: ordinary numbers, with the reason', /Computed with ordinary numbers \(about 16 digits\), not 210: it uses a value of more than 15 digits/.test(await app.con()) && /4637\.48/.test(await app.con()), await app.con());
  await cmd("enthalpy('water', 300, 101325)");
  ok('a property function takes ordinary numbers, and the Console says so', /not 210: enthalpy\(\) takes ordinary numbers/.test(await app.con()) && /112654\.89/.test(await app.con()), await app.con());
  c = await cmd('digits(1500)');
  ok('above 1000 digits the console keeps ordinary numbers (pi and e stop at about 1000), and says so', /bignumber\(\) arithmetic now keeps 1500 significant digits; the rest of the console uses ordinary numbers/.test(c), c);
  ok('then pi is an ordinary number, 2 + 3 works, and bignumber arithmetic still has the digits (factorial of 1000 is exact)', (await cmd('pi')) === '3.141592654' && (await cmd('2 + 3')) === '5' && /^4\.0238726007709377354/.test(await cmd('factorial(bignumber(1000))')));
  c = await cmd('bignumber(pi)');
  ok('with ordinary numbers and more than 16 digits set, bignumber(pi) explains why it has 16 digits and what to do', /3\.141592653589793$/.test(c) && /ordinary number of about 16 digits/.test(c) && /digits\(n\)/.test(c), c);
  ok('bignumber(0.1), bignumber(7) and bignumber of a text give no note', !/ordinary number/.test(await cmd('bignumber(0.1)')) && !/ordinary number/.test(await cmd('bignumber(7)')) && !/ordinary number/.test(await cmd("bignumber('0.1')")));
  c = await cmd('digits(1000)');
  ok('1000 digits is the most the whole console computes with: pi has 1000 digits', /now computes with 1000 significant digits/.test(c) && (await cmd('pi')).length === 1001, c);
  c = await cmd('digits(16)');
  ok('digits(16) goes back to ordinary numbers', /ordinary numbers again/.test(c) && (await cmd('pi')) === '3.141592654', c);
  ok('at 16 digits or fewer bignumber(pi) loses nothing, so there is no note', !/ordinary number of about 16/.test(await cmd('bignumber(pi)')));
  await cmd('digits(64)'); await cmd('digits(16)');
  c = await cmd("roots([1, -1, 1, -1], 'all')");
  ok("roots(p, 'all') on the console lists the complex roots: -i, i, 1", /-i/.test(c) && /\bi\b/.test(c) && /1/.test(c), c);
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
