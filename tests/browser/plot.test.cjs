// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Plot pane: Light colors by default, Dark, text size, log axes (with the warning for points <= 0),
// overlays kept when the style changes, and Save image (PNG pixel size from the file header, SVG).
const { open } = require('../lib/browser.cjs');
const fs = require('fs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), pg = app.pg;
  const L = () => pg.evaluate(() => { const p = document.getElementById('plot-container'); return { n: p.data.length, paper: p.layout.paper_bgcolor, font: p.layout.font.size, color: p.layout.font.color,
    xt: p.layout.xaxis.type, yt: p.layout.yaxis.type, title: p.layout.yaxis.title.text, xtitle: p.layout.xaxis.title.text }; });

  await app.solve(`k = 0.01\nT_a = 300\node t = 0 : 600 : 60\n  T' = -k*(T - T_a)\n  q = k*(T - T_a)\n  T(0) = 400 [K]\nend`);
  let l = await L();
  ok('light colors by default', l.paper === '#ffffff' && l.color === '#000000', l);
  ok('axis titles with units, inferred ones included', l.title === 'T [K]' && l.xtitle === 't', l);
  ok('default text size 12, linear axes', l.font === 12 && l.xt === 'linear' && l.yt === 'linear', l);
  ok('the camera button of the modebar is gone', await pg.$('[data-title="Download plot as a png"]') === null);

  // overlay a second curve, then change the style: both curves stay
  await pg.check('#plot-overlay-check'); await pg.selectOption('#plot-y-select', 'q');   // with Overlay ticked, choosing Y adds the curve
  await pg.selectOption('#plot-theme', 'dark'); l = await L();
  ok('dark colors, overlay kept', l.paper === '#181825' && l.color === '#cdd6f4' && l.n === 2, l);
  await pg.selectOption('#plot-theme', 'light');

  await app.clear(); await pg.check('#plot-logx'); l = await L(); let c = await app.con();
  ok('log x axis', l.xt === 'log' && l.yt === 'linear', l);
  ok('log x: warns about the 2 points at t = 0 (one per curve)', /Log x axis: 2 point\(s\) with x <= 0 cannot be shown/.test(c), c);
  await pg.check('#plot-logy'); l = await L(); ok('log y axis', l.yt === 'log', l);
  await pg.uncheck('#plot-logx'); await pg.uncheck('#plot-logy');

  await pg.click('#plot-font-up'); await pg.click('#plot-font-up'); l = await L(); ok('text larger: 16', l.font === 16, l);
  for (let i = 0; i < 10; i++) await pg.click('#plot-font-down');
  l = await L(); ok('text smaller, not below 8', l.font === 8, l);
  for (let i = 0; i < 2; i++) await pg.click('#plot-font-up');

  // a fresh plot keeps the chosen style
  await pg.selectOption('#plot-theme', 'dark'); await pg.uncheck('#plot-overlay-check');
  await app.solve(`ode t = 1 : 100 : 1\n  y' = -y/t\n  y(1) = 1\nend`); l = await L();
  ok('new plot keeps the style (dark, 12)', l.paper === '#181825' && l.font === 12 && l.n === 1, l);
  await pg.selectOption('#plot-theme', 'light');

  // straight or smooth lines: every curve, overlays included, and new plots keep the choice
  const shapes = () => pg.evaluate(() => document.getElementById('plot-container').data.map(t => (t.line || {}).shape || 'linear'));
  ok('lines straight by default', (await shapes()).every(x => x === 'linear'), await shapes());
  await pg.check('#plot-overlay-check'); await pg.selectOption('#plot-y-select', 't');
  await pg.selectOption('#plot-line', 'spline');
  ok('smooth: every curve drawn as a spline', (await shapes()).length === 2 && (await shapes()).every(x => x === 'spline'), await shapes());
  await pg.selectOption('#plot-y-select', 'y'); ok('a curve added later is smooth too', (await shapes()).length === 3 && (await shapes()).every(x => x === 'spline'), await shapes());
  await pg.uncheck('#plot-overlay-check'); await pg.selectOption('#plot-line', 'linear');
  ok('back to straight', (await shapes()).every(x => x === 'linear'), await shapes());

  // Save image: PNG at 3x, then SVG
  await pg.click('#btn-save-image');
  ok('image size defaults to 800 x 500', await pg.inputValue('#img-width') === '800' && await pg.inputValue('#img-height') === '500');
  await pg.click('#image-close');
  const save = async (fmt, w, h, scale) => {
    await pg.click('#btn-save-image');
    await pg.selectOption('#img-format', fmt); await pg.fill('#img-width', String(w)); await pg.fill('#img-height', String(h));
    if (fmt === 'png') await pg.selectOption('#img-scale', String(scale));
    const dl = pg.waitForEvent('download', { timeout: 15000 }).catch(() => null); await app.clear(); await pg.click('#btn-image-ok');
    const d = await dl; return { buf: d ? fs.readFileSync(await d.path()) : null, con: await app.con(), name: d && d.suggestedFilename() };
  };
  let r = await save('png', 600, 400, 3);
  const png = r.buf && r.buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  ok('PNG saved', png, r.con);
  ok('PNG is 1800 x 1200 pixels (600 x 400 at 3x)', png && r.buf.readUInt32BE(16) === 1800 && r.buf.readUInt32BE(20) === 1200, png && [r.buf.readUInt32BE(16), r.buf.readUInt32BE(20)]);
  ok('PNG: console message', /Saved the plot as 'plot\.png' \(1800 x 1200 pixels\)/.test(r.con), r.con);
  if (png) fs.writeFileSync(require('path').join(require('os').tmpdir(), 'plot-test.png'), r.buf);
  r = await save('svg', 500, 300);
  const svg = r.buf ? r.buf.toString('utf8') : '';
  ok('SVG saved, 500 x 300, white background', /^<svg[^>]*width="500"[^>]*height="300"/.test(svg) && /fill: ?rgb\(255, ?255, ?255\)/.test(svg), svg.slice(0, 200));
  ok('SVG has the axis titles and no modebar', /class="xtitle"/.test(svg) && !/modebar/.test(svg));
  ok('dialog closes after saving', await pg.$eval('#image-modal', e => getComputedStyle(e).display) === 'none');
  await pg.click('#btn-clear-plot'); await app.clear(); await pg.click('#btn-save-image');
  ok('nothing to save after Clear Plot', /Nothing to save yet/.test(await app.con()) && await pg.$eval('#image-modal', e => getComputedStyle(e).display) === 'none');
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
