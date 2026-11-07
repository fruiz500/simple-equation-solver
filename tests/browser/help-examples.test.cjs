// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Every help example, typed into the editor and solved in Chromium, must print the values of its
// published result table. Three are checked in Node instead (engine/help-special.test.mjs):
// ex-t5, ex-c2 and ex-c6 need hand-set guesses, ex-m4 shows matrices.
const { open } = require('../lib/browser.cjs');
const path = require('path');
const IN_NODE = ['ex-t5', 'ex-c2', 'ex-m4', 'ex-c6'];
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + x); } };
  const app = await open();
  const hp = await app.ctx.newPage(); await hp.goto('file://' + path.join(app.APP, 'help.html'));
  const ex = await hp.evaluate(() => Object.keys(CODE).map(id => ({ id, code: CODE[id],
    rows: [...document.querySelectorAll(`#${id} table.res tr`)].map(tr => [...tr.children].map(td => td.textContent.trim())) })));
  ok('help.html has examples', ex.length > 20, ex.length);
  for (const e of ex) {
    if (IN_NODE.includes(e.id)) continue;
    const c = await app.solve(e.code);
    const bad = e.rows.filter(([n, v]) => { const m = c.match(new RegExp(`\\n  ${n.replace(/[[\]]/g, '\\$&')} = ([^ \\n]+)`)); return !m || m[1] !== v; })
      .map(([n, v]) => { const m = c.match(new RegExp(`\\n  ${n.replace(/[[\]]/g, '\\$&')} = ([^ \\n]+)`)); return `${n}: ${m ? m[1] : 'missing'} (published ${v})`; });
    const errLine = /ERROR.*/.exec(c)?.[0];
    ok(`${e.id} reproduces its ${e.rows.length} published values`, !bad.length && !errLine, [...bad, errLine || ''].join('; ').slice(0, 300));
  }
  ok('only the CDN libraries were requested', app.missing.length === 0, app.missing.join(', '));
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors.join(' | '));
  console.log(`  ${ex.length - IN_NODE.length} examples solved in the browser; ${IN_NODE.join(', ')} checked in Node`);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
