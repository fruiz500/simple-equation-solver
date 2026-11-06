// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Phone-width screens (up to 600 px): the panes in one column in a fixed order (Equations, Variables, Console, Table, Plot), no gutters, no sideways scrolling, a bar that jumps
// to a pane, a plot that fits; and the two columns kept on a tablet (800 px) and a desktop.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  const box = (id) => pg.$eval('#' + id, e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; });
  const IDS = ['editor-panel', 'variables-panel', 'console-panel', 'parametric-panel', 'plot-panel'];

  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300);
  const b = {}; for (const id of IDS) b[id] = await box(id);
  ok('phone: the panes are stacked in the order Equations, Variables, Console, Table, Plot', IDS.every((id, k) => k === 0 || b[id].y > b[IDS[k - 1]].y + b[IDS[k - 1]].h - 2), IDS.map(id => Math.round(b[id].y)));
  ok('phone: every pane uses the full width of the screen', IDS.every(id => b[id].w > 360 && b[id].x < 12), IDS.map(id => [Math.round(b[id].x), Math.round(b[id].w)]));
  ok('phone: no sideways scrolling of the page', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
  ok('phone: the gutters are hidden', await pg.$$eval('.gutter', gs => gs.every(g => getComputedStyle(g).display === 'none')));
  ok('phone: each pane is tall enough to use', IDS.every(id => b[id].h >= 250), IDS.map(id => Math.round(b[id].h)));
  ok('phone: the jump bar is shown, with the five panes in the same order', await pg.$$eval('#pane-jump button', bs => bs.map(b => b.dataset.pane).join() === 'editor-panel,variables-panel,console-panel,parametric-panel,plot-panel' && getComputedStyle(bs[0].parentElement).display === 'flex'));
  await pg.evaluate(() => { document.getElementById('editor-panel').style.flex = '9 1 0px'; });   // what a gutter drag on a wide screen leaves behind
  ok('phone: sizes left by a gutter drag do not change the stacked layout', Math.abs((await box('editor-panel')).h - b['editor-panel'].h) < 2);
  await pg.click('#pane-jump button[data-pane="plot-panel"]'); await pg.waitForTimeout(1000);
  let top = await pg.$eval('#plot-panel', e => e.getBoundingClientRect().top);
  const atEnd = await pg.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
  ok('phone: the Plot button shows the plot pane, at the bar or, as the last pane, as far as the page scrolls', top >= 0 && (top < 70 || atEnd), [top, atEnd]);
  ok('phone: the bar stays at the top while scrolling', await pg.$eval('#pane-jump', e => Math.abs(e.getBoundingClientRect().top) < 1));
  await pg.click('#pane-jump button[data-pane="editor-panel"]'); await pg.waitForTimeout(1000);
  top = await pg.$eval('#editor-panel', e => e.getBoundingClientRect().top);
  ok('phone: the Equations button goes back to the top', top >= 0 && top < 70, top);

  ok('phone: the title of the Plot pane is not covered by its buttons', await pg.evaluate(() => { const h = document.querySelector('#plot-panel .panel-header'), t = h.querySelector('h2').getBoundingClientRect(); return [...h.querySelectorAll('button')].every(b => { const r = b.getBoundingClientRect(); return r.left >= t.right - 1 || r.top >= t.bottom - 1 || r.bottom <= t.top + 1; }); }));
  // work on the phone layout: Solve, and a plot that fits the screen
  let c = await app.solve('x = sqrt(9)');
  ok('phone: Solve works', /Solution Converged/.test(c), c.slice(-200));
  await pg.fill('#console-input', "fplot('sin(x)', 0, 6)"); await pg.press('#console-input', 'Enter'); await pg.waitForTimeout(500);
  const pw = await pg.evaluate(() => { const pc = document.getElementById('plot-container'), r = pc.getBoundingClientRect(), s = pc.querySelector('svg.main-svg'); return { n: (pc.data || []).length, w: r.width, sw: s ? s.getBoundingClientRect().width : 0 }; });
  ok('phone: a plot fits the pane width (the plot is as wide as its pane)', pw.n === 1 && pw.w > 300 && Math.abs(pw.sw - pw.w) < 4, pw);
  ok('phone: still no sideways scrolling after the plot', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // tablets and desktops keep two columns
  for (const w of [800, 1400]) {
    await pg.setViewportSize({ width: w, height: 900 }); await pg.waitForTimeout(300);
    await pg.evaluate(() => { document.getElementById('editor-panel').style.flex = ''; });
    const e = await box('editor-panel'), p = await box('plot-panel');
    ok(`${w} px: two columns (the plot is to the right of the equations), jump bar hidden`, p.x > e.x + e.w - 2 && await pg.$eval('#pane-jump', x => getComputedStyle(x).display === 'none'), [e, p]);
  }
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
