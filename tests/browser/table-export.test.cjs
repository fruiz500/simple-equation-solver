// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Export button of the Parametric Table pane: parametric sweep, one and two ode blocks, out-of-date refusal.
const { open } = require('../lib/browser.cjs');
const fs = require('fs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), pg = app.pg;
  const exportTable = async () => {
    await app.clear();
    const dl = pg.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await pg.click('#btn-export-table'); const d = await dl;
    return { text: d ? fs.readFileSync(await d.path(), 'utf8') : null, con: await app.con() };
  };

  // nothing yet
  let r = await exportTable(); ok('nothing to export before a table exists', r.text === null && /No table to export yet/.test(r.con), r.con);

  // parametric sweep with units: T from 300 to 400 K 4 points, h shown in kJ/kg
  await pg.fill('#editor', `P = 101325\nh = enthalpy('water', T, P) [kJ/kg]\nT_C = T - 273.15`);
  await pg.waitForTimeout(600);   // the parametric variable list refreshes after typing
  await pg.selectOption('#param-var', 'T');
  await pg.fill('#param-start', '300'); await pg.fill('#param-end', '360'); await pg.fill('#param-steps', '4');
  await pg.click('#btn-run-table');
  r = await exportTable();
  const lines = (r.text || '').trimEnd().split('\n');
  console.log('   parametric export:\n' + lines.map(l => '     ' + l).join('\n'));
  ok('parametric: header with units', /^T(\t|\s)/.test(lines[0]) && lines[0].split('\t').includes('h [kJ/kg]'), lines[0]);
  ok('parametric: 4 rows (Steps counts the points)', lines.length === 5, lines.length);
  const hcol = lines[0].split('\t').indexOf('h [kJ/kg]'), Tcol = lines[0].split('\t').findIndex(c => /^T( |$)/.test(c));
  ok('parametric: first row T = 300, h = 112.65 kJ/kg', lines[1] && lines[1].split('\t')[Tcol] === '300' && Math.abs(+lines[1].split('\t')[hcol] - 112.6549) < 1e-4, lines[1]);
  ok('parametric: values tab-separated, 7 significant digits', lines.slice(1).every(l => l.split('\t').length === lines[0].split('\t').length && l.split('\t').every(v => /^-?[\d.]+(e[-+]\d+)?$/.test(v) && v.replace(/[-.]|e.*$/g, '').replace(/^0+/, '').length <= 7)), lines[2]);
  ok('parametric: console reports the export', /Exported 4 row\(s\) to 'table\.txt'/.test(r.con), r.con);

  // edit the equations: refused
  await pg.fill('#editor', `P = 101325\nh = enthalpy('water', T, P) [kJ/kg]\nT_C = T - 273.15\n// edited`);
  r = await exportTable(); ok('refused after the equations change', r.text === null && /changed after this table was made/.test(r.con), r.con);

  // one ode block: Newton cooling, exact solution checked in the file
  let c = await app.solve(`k = 0.01 [1/s]\nT_a = 300 [K]\node t = 0 : 600 : 60\n  T' = -k*(T - T_a)\n  T(0) = 400 [K]\nend`);
  r = await exportTable(); const L1 = (r.text || '').trimEnd().split('\n');
  console.log('   ode export (first lines):\n' + L1.slice(0, 3).map(l => '     ' + l).join('\n'));
  ok('ode: header names the columns, no title for a single table', /^t/.test(L1[0]) && L1[0].split('\t')[1].startsWith('T'), L1[0]);
  ok('ode: 11 rows', L1.length === 12, L1.length);
  ok('ode: values match the exact solution', L1.slice(1).every(l => { const [t, T] = l.split('\t').map(Number); return Math.abs(T - (300 + 100 * Math.exp(-0.01 * t))) < 1e-4; }), L1.slice(1, 4));

  // two ode blocks: titles and a blank line between tables
  c = await app.solve(`ode t = 0 : 1 : 0.5\n  y' = -y\n  y(0) = 1\nend\node s = 0 : 2 : 1\n  z' = 2\n  z(0) = 0\nend`);
  r = await exportTable(); const parts = (r.text || '').trimEnd().split('\n\n');
  console.log('   two ode blocks:\n' + (r.text || '').trimEnd().split('\n').map(l => '     ' + l).join('\n'));
  ok('two ode blocks: two tables', parts.length === 2, r.text);
  ok('two ode blocks: each under its title', /^ode block, line 1\ny?/.test(parts[0]) && /^ode block, line 5\n/.test(parts[1] || ''), parts);
  ok('two ode blocks: z = 2s', (parts[1] || '').split('\n').slice(2).every(l => { const [s, z] = l.split('\t').map(Number); return Math.abs(z - 2 * s) < 1e-9; }), parts[1]);
  ok('console reports both tables', /Exported 2 tables, 6 row\(s\)/.test(r.con), r.con);

  // the button sits at the right end of the pane header, as in the Variables pane
  const pos = await pg.evaluate(() => { const b = document.getElementById('btn-export-table').getBoundingClientRect(), p = document.getElementById('parametric-panel').getBoundingClientRect(),
    v = document.getElementById('btn-export').getBoundingClientRect(), vp = document.getElementById('variables-panel').getBoundingClientRect();
    return { gap: p.right - b.right, vgap: vp.right - v.right, h: b.height, vh: v.height }; });
  ok('button at the right end, like the Variables Export', Math.abs(pos.gap - pos.vgap) < 2 && Math.abs(pos.h - pos.vh) < 2, pos);
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
