// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Opens index.html in headless Chromium. The CDN libraries are served from node_modules,
// so the tests run offline and against the same versions as the engine tests.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const TESTS = path.resolve(__dirname, '..');
const APP = path.resolve(process.env.APPDIR || path.join(TESTS, '..'));
const nm = f => path.join(TESTS, 'node_modules', f);
const MAP = {
  'cdnjs.cloudflare.com/ajax/libs/mathjs/11.8.0/math.js': nm('mathjs/lib/browser/math.js'),
  'cdn.plot.ly/plotly-2.24.1.min.js': nm('plotly.js-dist-min/plotly.min.js'),
  'cdn.jsdelivr.net/npm/coolprop-wasm@6.6.0/coolprop.js': nm('coolprop-wasm/coolprop.js'),
  'cdn.jsdelivr.net/npm/coolprop-wasm@6.6.0/coolprop.wasm': nm('coolprop-wasm/coolprop.wasm'),
};

async function open() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  const missing = [];
  await ctx.route(/^https:\/\//, r => {
    const url = r.request().url().replace(/^https:\/\//, ''), f = MAP[url];
    if (!f) { missing.push(url); return r.abort(); }
    r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.wasm') ? 'application/wasm' : 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(20000);   // an action that cannot happen (a click behind an open dialog, say) fails instead of hanging
  const pageErrors = []; pg.on('pageerror', e => pageErrors.push(e.message));
  pg.on('dialog', d => d.dismiss());
  await pg.goto('file://' + path.join(APP, 'index.html'));
  await pg.waitForFunction(() => window.CoolPropReady, null, { timeout: 30000 });
  const startup = await pg.$eval('#console-output', e => e.textContent);
  await pg.evaluate(() => { delete window.showSaveFilePicker; window.prompt = (msg, suggested) => suggested; });   // save by download, accepting the suggested name
  const con = () => pg.$eval('#console-output', e => e.textContent);
  const clear = () => pg.$eval('#console-output', e => { e.textContent = ''; });
  // Put text in the editor, press Solve and return the console text.
  async function solve(text) {
    await pg.fill('#editor', text); await clear(); await pg.click('#btn-solve');
    await pg.waitForFunction(() => /Solution Converged|ERROR|Error/.test(document.querySelector('#console-output').textContent), null, { timeout: 60000 }).catch(() => {});
    await pg.waitForTimeout(50);
    return con();
  }
  return { b, ctx, pg, con, clear, solve, missing, pageErrors, APP, startup };
}
module.exports = { open, APP };
