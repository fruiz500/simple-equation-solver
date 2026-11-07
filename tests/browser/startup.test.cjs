// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Start-up and layout: CoolProp prepared at start (the first Solve is not slow), the buttons under the Equations pane on a
// laptop screen, the favicon, and the console box (several lines, Shift+Enter, growing, history from the first line).
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  await pg.waitForFunction(() => /CoolProp loaded/.test(document.getElementById('thermo-status').textContent), null, { timeout: 30000 });
  let t0 = Date.now();
  const c = await app.solve(`P = 100 [kPa]\nT = 300 [K]\nh = enthalpy('water', T, P)`);
  const ms = Date.now() - t0;
  ok('the first Solve with a property call is quick once the badge says loaded (CoolProp prepared at start)', /Solution Converged/.test(c) && ms < 1000, ms);

  // Solve keeps the Console uncluttered: a confirmation, the values in the Variables pane (as after Min/Max)
  ok('Solve does not list the solved variables in the Console', /Solution Converged: 3 variable\(s\), in the Variables pane\./.test(await app.con()) && !/\n  h = /.test(await app.con()), (await app.con()).slice(-200));
  ok('the values are in the Variables pane', /^  h = 1\d{5}/m.test(await app.listing()), await app.listing());

  for (const [w, h] of [[1366, 768], [1280, 720]]) {
    await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(200);
    const r = await pg.evaluate(() => {
      const row = document.getElementById('editor-buttons'), pr = row.getBoundingClientRect(), bs = [...row.querySelectorAll('button')];
      return { hidden: bs.filter(b => b.getBoundingClientRect().right > pr.right + 1 || b.getBoundingClientRect().bottom > row.parentElement.getBoundingClientRect().bottom + 1).map(b => b.id),
        rows: new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size };
    });
    ok(`${w}x${h}: every button under the Equations pane is visible${w === 1366 ? ', on one row' : ''}`, r.hidden.length === 0 && (w !== 1366 || r.rows === 1), r);
  }
  await pg.setViewportSize({ width: 1400, height: 900 });

  const fav = await pg.evaluate(() => new Promise((res) => { const l = document.querySelector('link[rel=icon][type="image/svg+xml"]'); if (!l) return res(null);
    const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res('does not load'); im.src = l.href; }));
  ok('the page has a favicon, an SVG that loads', fav === true, fav);

  // the console box
  const box = '#console-input';
  ok('the console box is a text area of two lines at the start', await pg.$eval(box, e => e.tagName === 'TEXTAREA' && e.rows === 2));
  await app.clear(); await pg.fill(box, ''); await pg.focus(box);
  await pg.keyboard.type('a = 2'); await pg.keyboard.press('Shift+Enter'); await pg.keyboard.type('a^3');
  ok('Shift+Enter starts a new line without running', (await pg.inputValue(box)) === 'a = 2\na^3' && !/> a = 2/.test(await app.con()));
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  let k = await app.con();
  ok('Enter runs each line in turn', /> a = 2\n  2\n> a\^3\n  8\n/.test(k) && (await pg.inputValue(box)) === '', k);
  await app.clear(); await pg.fill(box, 'lusolve([4, 1;\n   1, 3], [1; 2])'); await pg.press(box, 'Enter'); await pg.waitForTimeout(150);
  k = await app.con();
  ok('a line whose bracket is open continues on the next', /> lusolve\(\[4, 1; 1, 3\], \[1; 2\]\)\n  \[\[0\.0909/.test(k), k);
  await pg.fill(box, 'x\ny\nz\nw\nv\nu\nt\ns\nr\nq\np');
  await pg.dispatchEvent(box, 'input');
  const hgt = await pg.$eval(box, e => [e.clientHeight, parseFloat(getComputedStyle(e).lineHeight)]);
  ok('the box grows with its text, up to about 8 lines', hgt[0] > 6 * hgt[1] && hgt[0] < 9.5 * hgt[1], hgt);
  await pg.fill(box, ''); await pg.dispatchEvent(box, 'input');
  await pg.focus(box); await pg.keyboard.press('ArrowUp');
  ok('the up arrow recalls the last entry, with its lines', (await pg.inputValue(box)) === 'lusolve([4, 1;\n   1, 3], [1; 2])', await pg.inputValue(box));
  await pg.keyboard.press('ArrowUp');
  ok('on the last line of a recalled entry the up arrow moves the cursor, not the history', (await pg.inputValue(box)).startsWith('lusolve'));
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
