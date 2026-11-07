// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// The AI assistant in the page, with a mock provider: AI: commands on the command line, the key neither echoed nor recalled,
// the state sent with a question, the check of a proposal, the insert link and its undo.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), { pg } = app;
  const reqs = []; let replies = [];
  await pg.route('https://api.anthropic.com/**', route => {
    const body = JSON.parse(route.request().postData() || '{}'); reqs.push({ url: route.request().url(), headers: route.request().headers(), body });
    const text = replies.shift() || 'ok';
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) });
  });
  const cmd = async (t) => { await pg.fill('#console-input', t); await pg.press('#console-input', 'Enter'); };
  const waitFor = (re) => pg.waitForFunction((s) => new RegExp(s).test(document.querySelector('#console-output').textContent), re.source, { timeout: 15000 });

  await app.clear();
  await cmd('AI: setup key sk-ant-test-9999');
  let c = await app.con();
  ok('the key is not echoed in the Console', /> AI: setup key \*+/.test(c) && !/sk-ant-test/.test(c), c.slice(-300));
  await pg.press('#console-input', 'ArrowUp');
  ok('the key is not recalled with the up arrow', !/sk-ant/.test(await pg.inputValue('#console-input')));
  ok('the key is stored in the browser', await pg.evaluate(() => (localStorage.getItem('ses-ai-keys') || '').includes('sk-ant-test-9999')));
  await pg.fill('#console-input', '');

  // a state to ask about: solved equations and one Console error
  await app.solve(`P = 100 [kPa]\nT = 300 [K]\nh = enthalpy('water', T, P)`);
  const OLD = await pg.inputValue('#editor');
  const GOOD = `P = 100 [kPa]\nT = 350 [K]\nh = enthalpy('water', T, P)\n`;
  replies = ['Raise T:\n```ses\n' + GOOD.trim() + '\n```\nDone.'];
  await app.clear(); await cmd('AI: raise the temperature to 350 K');
  await waitFor(/Checked on a copy/);
  c = await app.con();
  ok('the answer is shown and checked on a copy', /Raise T:/.test(c) && /Checked on a copy: it parses, the units are consistent and it solves/.test(c), c.slice(-500));
  const turn = reqs[0].body.messages[0].content;
  ok('the request carries the equations, the results with units and the question', /enthalpy\('water', T, P\)/.test(turn) && /\nT = 300 \[K\]/.test(turn) && /h = [\d.e+]+ \[J\/kg\]/.test(turn) && /raise the temperature to 350 K$/.test(turn), turn);
  ok('the key is in the header and not in the body', reqs[0].headers['x-api-key'] === 'sk-ant-test-9999' && !JSON.stringify(reqs[0].body).includes('sk-ant-test'), reqs[0].headers);
  ok('the check did not change the page: equations, results and Console unchanged by it', (await pg.inputValue('#editor')) === OLD && !/Solution Converged/.test(c));
  ok('an insert link appears', (await pg.$$('#console-output .ai-insert')).length === 1);
  await pg.click('#console-output .ai-insert');
  ok('clicking it replaces the Equations pane', (await pg.inputValue('#editor')) === GOOD, await pg.inputValue('#editor'));
  await pg.focus('#editor'); await pg.keyboard.press('Control+z');
  ok('Ctrl+Z in the pane undoes the insertion', (await pg.inputValue('#editor')) === OLD, await pg.inputValue('#editor'));

  // problems are fed back and the corrected proposal shown; the engine messages are not linked to the Equations pane
  replies = ['First:\n```ses\nx = 1 +\n```', 'Second:\n```ses\nx = 2\n```'];
  await app.clear(); await cmd('AI: new'); await cmd('AI: make an x');
  await waitFor(/Checked on a copy/);
  c = await app.con();
  ok('a proposal with a syntax error is sent back once and the corrected one is shown', reqs.length === 3 && /\n1\. Syntax: /.test(reqs[2].body.messages[2].content) && /Second:/.test(c) && !/First:/.test(c), c.slice(-400));
  replies = ['```ses\ny = 1 +\n```', '```ses\ny = 1 +\n```'];
  await app.clear(); await cmd('AI: bad one');
  await waitFor(/still has/);
  ok('problems in a proposal that stays wrong are listed and not linked as lines of the pane', (await pg.$$('#console-output .lineref')).length === 0, await app.con());

  // regression: an answer with the equations between <ses> tags gets the insert link too
  replies = ['Here they are:\n<ses>\nz = 3\n</ses>'];
  await app.clear(); await cmd('AI: new'); await cmd('AI: give z');
  await waitFor(/Checked on a copy/);
  ok('equations between <ses> tags: checked, and the insert link appears', (await pg.$$('#console-output .ai-insert')).length === 1, (await app.con()).slice(-300));
  // a question over several lines (Shift+Enter) is sent whole
  await pg.fill('#console-input', ''); await pg.focus('#console-input');
  await pg.keyboard.type('AI: first line'); await pg.keyboard.press('Shift+Enter'); await pg.keyboard.type('second line'); await pg.keyboard.press('Enter');
  await pg.waitForFunction((n) => document.querySelectorAll('#console-output .ai-insert').length >= 0 && window.__n !== n, reqs.length).catch(() => {});
  await pg.waitForTimeout(500);
  ok('a question typed over two lines (Shift+Enter) is sent as one question', /first line\nsecond line$/.test(reqs[reqs.length - 1].body.messages.slice(-1)[0].content), reqs[reqs.length - 1].body.messages.slice(-1)[0].content.slice(-60));

  await app.clear(); await cmd('AI: setup');
  c = await app.con();
  ok('AI: setup shows the settings without the key', /provider anthropic/.test(c) && /key set/.test(c) && !/sk-ant/.test(c), c);
  await cmd('AI: setup forget');
  const reqsBefore = reqs.length;
  ok('forget erases the key from the browser', await pg.evaluate(() => !localStorage.getItem('ses-ai-keys') && !localStorage.getItem('ses-ai')));
  // AI: copy: no key needed; the clipboard gets the instructions and the state of the page
  await app.ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await pg.fill('#editor', 'P_1 = 10 [kPa]\nT_1 = saturationtemperature(\'water\', P_1)'); await app.clear(); await cmd('AI: copy');
  await waitFor(/Copied the instructions|did not allow copying/);
  const clip = await pg.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok('AI: copy, with no key, puts the instructions and the equations of the pane on the clipboard', /^Follow these instructions/.test(clip) && /HOW TO PROPOSE EQUATIONS/.test(clip) && clip.includes("T_1 = saturationtemperature('water', P_1)") && reqs.length === reqsBefore, clip.slice(0, 100));
  ok('an ordinary expression still works on the command line', await (async () => { await app.clear(); await cmd('2+3'); await pg.waitForTimeout(100); return /  5\n/.test(await app.con()); })());
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
