// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// interpolate() in the page: the console command line, and the extrapolation warning after Solve.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), pg = app.pg;
  const typeCmd = async (cmd) => { await app.clear(); await pg.fill('#console-input', cmd); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(100); return app.con(); };

  let c = await typeCmd(`interpolate([0, 1, 3], [0, 10, 40], 2)`);
  ok('console: 1-D value', /\n\s*25\s*$/.test(c), c);
  c = await typeCmd(`interpolate([0, 1], [0, 1], [0, 1; 10, 11], 0.5, 0.25)`);
  ok('console: 2-D value, rows follow xs', /\n\s*5\.25\s*$/.test(c), c);
  c = await typeCmd(`interpolate([0, 1, 2, 3], [0, 1, 8, 27], 1.5, 'spline')`);
  ok('console: spline through x^3 gives 1.5^3', /\n\s*3\.375\s*$/.test(c), c);
  c = await typeCmd(`interpolate([0, 1], [0, 2], 3)`);
  ok('console: outside the table is an error', /outside the table, 0 to 1/.test(c), c);
  c = await typeCmd(`interpolate([0, 1], [0, 2], 3, 'extrapolate')`);
  ok('console: extrapolated value and warning', /WARNING: interpolate\(\): extrapolated: x = 3 is outside the table, 0 to 1/.test(c) && /\n\s*6\s*$/.test(c), c);

  c = await typeCmd(`nu_hilpert(6071, 0.70)`);
  ok('console: a correlation (Ex. 7.4, Nu = 37.3)', /\n\s*37\.32\d*\s*$/.test(c), c);
  c = await typeCmd(`nu_dittusboelter(5000, 0.7, 'heating')`);
  ok('console: a correlation outside its range warns', /WARNING: nu_dittusboelter\(\): Re = 5000 is below 10000/.test(c), c);
  c = await app.solve(`y = interpolate([0, 1, 2], [0, 1, 4], x, 'extrapolate')\ny = 7`);
  ok('Solve: result and one warning at the solution', /x = 3\b/.test(c) && (c.match(/WARNING: interpolate/g) || []).length === 1, c);
  c = await app.solve(`y = interpolate([0, 1, 2], [0, 1, 4], x)\ny = 2.5`);
  ok('Solve: default guess outside the table, solution inside, no warning', /x = 1\.5\b/.test(c) && !/WARNING/.test(c), c);
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
