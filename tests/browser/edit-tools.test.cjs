// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// In the page: Find and Replace in the Equations pane, the Update guesses box, a complex result, a defined unit,
// the line numbers beside the editor (error marks, clicking a number or a message), tooltips and the empty editor.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), pg = app.pg;
  ok('the editor starts empty, with a placeholder', await pg.inputValue('#editor') === '' && /one per line/.test(await pg.$eval('#editor', e => e.placeholder)));
  const val = () => pg.inputValue('#editor');
  const count = () => pg.textContent('#find-count');
  const cur = () => pg.$eval('#editor-marks mark.cur', e => e.textContent).catch(() => null);

  // ---- Find and Replace
  await pg.fill('#editor', 'T_1 = 300\nT_10 = T_1 + 5\nt = 2*T_1\nq = T_1$x');
  await pg.click('#editor'); await pg.keyboard.press('Control+Home');
  await pg.keyboard.press('Control+f');
  ok('Ctrl+F opens the bar with the focus in Find', await pg.isVisible('#find-bar') && await pg.evaluate(() => document.activeElement.id) === 'find-text');
  await pg.keyboard.type('T_1');
  ok('matches counted (case ignored): 5, first one current', await count() === '1 of 5' && await pg.$$eval('#editor-marks mark', m => m.length) === 5, await count());
  await pg.check('#find-word');
  ok('whole words: T_10 no longer matches', await count() === '1 of 4', await count());
  await pg.focus('#find-text'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter');
  ok('Enter moves to the next match', await count() === '3 of 4', await count());
  await pg.keyboard.press('Shift+Enter');
  ok('Shift+Enter goes back', await count() === '2 of 4', await count());
  await pg.fill('#replace-text', 'T_in'); await pg.click('#find-replace');
  ok('Replace changes the current match only and moves on', await val() === 'T_1 = 300\nT_10 = T_in + 5\nt = 2*T_1\nq = T_1$x' && await count() === '2 of 3', [await val(), await count()]);
  await pg.click('#find-all');
  ok('Replace all (a $ in the replacement taken literally)', await val() === 'T_in = 300\nT_10 = T_in + 5\nt = 2*T_in\nq = T_in$x', await val());
  await pg.fill('#replace-text', '$&'); await pg.fill('#find-text', 'T_in'); await pg.click('#find-all');
  ok("'$&' is not a special pattern either", (await val()).startsWith('$& = 300'), await val());
  await pg.click('#editor'); await pg.keyboard.press('Control+z');
  ok('Ctrl+Z undoes Replace all', await val() === 'T_in = 300\nT_10 = T_in + 5\nt = 2*T_in\nq = T_in$x', await val());
  await pg.keyboard.press('Control+f'); await pg.keyboard.press('Escape');
  ok('Esc closes the bar and clears the highlights', !(await pg.isVisible('#find-bar')) && await pg.$$eval('#editor-marks mark', m => m.length) === 0);
  // a match far down the text is scrolled into view
  await pg.fill('#editor', Array.from({ length: 200 }, (_, k) => `x_${k} = ${k}`).join('\n') + '\nfar_away = 1');
  await pg.click('#btn-find'); await pg.fill('#find-text', 'far_away');
  const vis = await pg.$eval('#editor', ed => { const m = document.querySelector('#editor-marks mark.cur'); return m && m.offsetTop >= ed.scrollTop && m.offsetTop < ed.scrollTop + ed.clientHeight; });
  ok('the Find... button opens the bar, and a match far down is scrolled into view', vis && await cur() === 'far_away');
  await pg.keyboard.press('Escape');

  // ---- Update guesses
  const guess = (v) => pg.inputValue(`input[data-var="${v}"][data-field="guess"]`);
  await pg.uncheck('#update-guesses');
  await app.solve('x^2 = 9\ny = x + 1');
  ok('box off: guesses stay at 1', await guess('x') === '1', await guess('x'));
  await pg.check('#update-guesses');
  ok('ticking the box after a solve takes that solution', await guess('x') === '3' && await guess('y') === '4', [await guess('x'), await guess('y')]);
  await pg.fill(`input[data-var="x"][data-field="guess"]`, '-2'); await pg.dispatchEvent(`input[data-var="x"][data-field="guess"]`, 'change');
  await app.solve('x^2 = 9\ny = x + 1');
  ok('box on: after Solve the guesses are the new solution', await guess('x') === '-3' && await guess('y') === '-2', [await guess('x'), await guess('y')]);
  ok('the box is remembered in this browser', await pg.evaluate(() => localStorage.getItem('ses-update-guesses')) === '1');
  // table: each row starts from the row before, so it follows the branch of the starting guess
  await app.solve('x^2 = a\na = 4');
  await pg.fill('#editor', 'x^2 = a'); await pg.waitForTimeout(500);
  await pg.selectOption('#param-var', 'a'); await pg.fill('#param-start', '4'); await pg.fill('#param-end', '9'); await pg.fill('#param-steps', '3');
  await pg.click('#btn-run-table'); await pg.waitForTimeout(500);
  const xs = await pg.$$eval('#parametric-container tbody tr', trs => trs.map(t => t.children[1].textContent));
  ok('table: the negative root on every row, and the last row is the guess', JSON.stringify(xs) === '["-2","-2.54951","-3"]' && await guess('x') === '-3', [xs, await guess('x')]);
  await pg.uncheck('#update-guesses');

  // ---- complex numbers, defined units
  let c = await app.solve('a = 1\nx = sqrt(-a)');
  ok('sqrt of a negative number: an error with the line number', /ERROR: .*Line 2: x comes out as the complex number i/.test(c), c);
  c = await app.solve('units euro\n1 [$] = 0.88 [euro]\nprice = 10 [$]\nextra = 5 [euro]\ntotal = price + extra [euro]');
  ok('a unit defined from another: 10 $ + 5 euro = 13.8 euro', /\n  price = 10 \[\$\]/.test(c) && /\n  total = 13\.8 \[euro\]/.test(c), c);

  // ---- line numbers
  const rows = () => pg.$$eval('#editor-gutter > div > div', d => d.map(x => x.className));
  const selLine = () => pg.$eval('#editor', ed => ed.value.slice(0, ed.selectionStart).split('\n').length);
  c = await app.solve('a = 1\nb = 2\nc = sqrt(-a)\nd = 4');
  let r = await rows();
  ok('one number per line; the error line marked', r.length === 4 && r[2].includes('err') && !r[0].includes('err'), r);
  await pg.click('#console-output .lineref');
  ok('clicking the line number in the message selects that line', await selLine() === 3 && (await rows())[2].includes('cur'));
  await pg.click('#editor-gutter > div > div:nth-child(2)');
  ok('clicking a number in the gutter selects that line', await selLine() === 2 && await pg.$eval('#editor', ed => ed.value.slice(ed.selectionStart, ed.selectionEnd)) === 'b = 2');
  await pg.click('#editor'); await pg.keyboard.press('Control+End'); await pg.keyboard.type(' + 0');
  ok('editing without changing the number of lines keeps the mark', (await rows())[2].includes('err'));
  await pg.keyboard.press('Enter');
  ok('a new line clears the marks (they would point at the wrong lines)', !(await rows()).some(x => x.includes('err')));
  c = await app.solve('a = 1\nb = 2\nc = sqrt(-a)\nd = 4');
  await app.solve('a = 1\nb = 2\nc = sqrt(a)\nd = 4');
  ok('a new Solve clears the old marks', !(await rows()).some(x => x.includes('err')));
  await pg.fill('#editor', Array.from({ length: 150 }, (_, k) => `y_${k + 1} = ${k}`).join('\n'));
  await pg.$eval('#editor', ed => { ed.scrollTop = 1234; ed.dispatchEvent(new Event('scroll')); });
  const off = await pg.$eval('#editor', ed => {
    const cs = getComputedStyle(ed), lh = parseFloat(cs.lineHeight), top = ed.getBoundingClientRect().top + 9;
    return [100, 140].map(k => document.querySelector(`#editor-gutter > div > div:nth-child(${k})`).getBoundingClientRect().top - (top + (k - 1) * lh - ed.scrollTop));
  });
  ok('after scrolling, numbers 100 and 140 sit on their lines (within 1 px)', off.every(d => Math.abs(d) <= 1), off);
  // ---- tooltips and the empty editor
  const bare = await pg.$$eval('button, select, input:not([type=file]), .modal-close', els => els.filter(e => !e.closest('[title]')).map(e => e.id || e.outerHTML.slice(0, 60)));
  ok('every button, box and selector has a tooltip (on itself or its label)', bare.length === 0, bare);
  ok('the Plot pane is called Plot', await pg.$eval('#plot-panel h2', h => h.textContent) === 'Plot');
  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
