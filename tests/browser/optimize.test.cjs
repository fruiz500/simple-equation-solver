// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Min/Max dialog: free variables ticked in a list, bounds from the Variables pane (editable for Min/Max only),
// several variables (BFGS, Nelder-Mead), one variable (Brent), multistart report, optimum at a bound, messages.
const { open } = require('../lib/browser.cjs');
(async () => {
  let pass = 0, fail = 0; const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', n, x === '' ? '' : '| ' + JSON.stringify(x)); } };
  const app = await open(), pg = app.pg;
  const alerts = []; pg.removeAllListeners('dialog'); pg.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });
  const modalOpen = () => pg.$eval('#optimize-modal', e => getComputedStyle(e).display !== 'none');
  const row = (v) => `#opt-free-list tr[data-v="${v}"]`;
  const openDlg = async (text) => { if (await modalOpen()) await pg.click('#optimize-close'); if (text !== undefined) { await pg.fill('#editor', text); } await pg.click('#btn-optimize'); };
  const setup = async ({ dir, target, free, algo = 'auto', multi = false }) => {
    await pg.selectOption('#opt-direction', dir); await pg.selectOption('#opt-target', target);
    for (const [v, lo, hi] of free) {
      await pg.check(`${row(v)} input[type=checkbox]`);
      if (lo !== undefined) { await pg.fill(`${row(v)} .opt-lo`, String(lo)); await pg.dispatchEvent(`${row(v)} .opt-lo`, 'change'); }
      if (hi !== undefined) { await pg.fill(`${row(v)} .opt-hi`, String(hi)); await pg.dispatchEvent(`${row(v)} .opt-hi`, 'change'); }
    }
    await pg.selectOption('#opt-algo', algo); if (multi) await pg.check('#opt-multistart'); else await pg.uncheck('#opt-multistart');
  };
  const runOpt = async () => { await app.clear(); alerts.length = 0; await pg.click('#btn-run-optimization'); await pg.waitForTimeout(100); return app.con(); };
  const val = (c, n) => { const m = c.match(new RegExp(`\\n  ${n} = (-?[\\d.e+-]+)`)); return m ? +m[1] : NaN; };

  // three-stage compression: two free pressures, minimum work at 300 and 900
  const comp3 = `P_1 = 100\nP_4 = 2700\nk = 0.4/1.4\nw = (P_2/P_1)^k + (P_3/P_2)^k + (P_4/P_3)^k - 3`;
  await openDlg(comp3);
  ok('dialog lists the variables with tick boxes', await pg.$$eval('#opt-free-list tr[data-v]', r => r.length) === 6);
  ok('degrees of freedom shown', /leave 2 degree\(s\) of freedom: tick 2/.test(await pg.textContent('#opt-dof')), await pg.textContent('#opt-dof'));
  await setup({ dir: 'min', target: 'w', free: [['P_2', 100, 2700], ['P_3', 100, 2700]] });
  let c = await runOpt();
  ok('BFGS: P_2 = 300, P_3 = 900', Math.abs(val(c, 'P_2') - 300) < 1e-3 && Math.abs(val(c, 'P_3') - 900) < 1e-3, c);
  ok('report: converged, iterations and solves', /Converged after \d+ iterations \(\d+ solves\): w = 1\.106214/.test(c), c);
  ok('dialog closes after the run', !(await modalOpen()));
  const paneVal = await pg.evaluate(() => [...document.querySelectorAll('#variables-container tr')].map(tr => tr.textContent).find(t => /^\s*P_3/.test(t)));
  ok('Variables pane value of P_3', /900/.test(paneVal || ''), paneVal);

  // reopen: ticks and dialog bounds kept; the pane's own bounds are untouched
  await openDlg();
  ok('ticks kept', await pg.isChecked(`${row('P_2')} input[type=checkbox]`) && await pg.isChecked(`${row('P_3')} input[type=checkbox]`));
  ok('bounds edited in the dialog kept', await pg.inputValue(`${row('P_2')} .opt-lo`) === '100' && await pg.inputValue(`${row('P_3')} .opt-hi`) === '2700');
  await pg.click('#optimize-close');
  ok('Variables pane bounds unchanged (still empty)', await pg.inputValue('input[data-var="P_2"][data-field="lower"]') === '');
  // a bound typed in the Variables pane shows in the dialog (it replaces the earlier dialog edit for that variable)
  await pg.fill('input[data-var="P_2"][data-field="lower"]', '150'); await pg.dispatchEvent('input[data-var="P_2"][data-field="lower"]', 'change');
  await openDlg();
  ok('Min from the Variables pane', await pg.inputValue(`${row('P_2')} .opt-lo`) === '150', await pg.inputValue(`${row('P_2')} .opt-lo`));
  ok('Max edited in the dialog kept (its pane value did not change)', await pg.inputValue(`${row('P_2')} .opt-hi`) === '2700', await pg.inputValue(`${row('P_2')} .opt-hi`));

  // Nelder-Mead
  await setup({ dir: 'min', target: 'w', free: [], algo: 'nm' });
  c = await runOpt();
  ok('Nelder-Mead: 300, 900', Math.abs(val(c, 'P_2') - 300) < 0.01 && Math.abs(val(c, 'P_3') - 900) < 0.01 && /Nelder-Mead/.test(c), c);

  // messages: too few ticked; target ticked; bad bounds; golden with two
  await openDlg(); await pg.uncheck(`${row('P_3')} input[type=checkbox]`); await pg.selectOption('#opt-algo', 'auto');
  c = await runOpt();
  ok('too few ticked: message', /leave 2 degrees of freedom, but 1 variable\(s\) are ticked: tick 1 more/.test(alerts[0] || ''), alerts);
  await pg.check(`${row('P_3')} input[type=checkbox]`); await pg.selectOption('#opt-algo', 'golden'); c = await runOpt();
  ok('golden with two variables: message', /Golden section works with one free variable/.test(alerts[0] || ''), alerts);
  await pg.selectOption('#opt-algo', 'auto'); await pg.fill(`${row('P_3')} .opt-hi`, ''); c = await runOpt();
  ok('missing Max: message', /Give P_3 a finite Min below its Max/.test(alerts[0] || ''), alerts);
  await pg.click('#optimize-close');

  // one variable: Brent, as before
  await openDlg(`y = -(x - 2)^2 + 5`);
  await setup({ dir: 'max', target: 'y', free: [['x', 0, 5]] });
  c = await runOpt();
  ok("one variable: Brent's method, x = 2", /Brent's method/.test(c) && /Optimal x = 2(\.0+)?\b|Optimal x = 1\.99999|Optimal x = 2\.0000/.test(c) && /Yielding y = 5\b/.test(c), c);

  // optimum at a bound; the other variable inside
  await openDlg(`A = x*(3 - x) + y`);
  await setup({ dir: 'max', target: 'A', free: [['x', 0, 2], ['y', 0, 1]] });
  c = await runOpt();
  ok('at a bound: y at its Max, x = 1.5 inside', /\n  y = 1   \(at its Max\)/.test(c) && /\n  x = 1\.5\n/.test(c), c);

  // multistart: two minima, both listed
  await openDlg(`f = (x^2 - 1)^2 + 0.3*x + y^2`);
  await setup({ dir: 'min', target: 'f', free: [['x', -2, 2], ['y', -2, 2]], multi: true });
  c = await runOpt();
  ok('multistart: global minimum x = -1.0356', Math.abs(val(c, 'x') + 1.0355787) < 1e-5, c);
  ok('multistart: 8 starts, 2 optima listed', /Multistart: 8 starts, 2 different optima found:\n  f = -0\.305428\d* at x = -1\.03\d+, y = .* \(from \d starts?\)\n  f = 0\.29\d+ at x = 0\.96\d+/.test(c), c);

  ok('no uncaught page errors', app.pageErrors.length === 0, app.pageErrors);
  await app.b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL browser run |', e.message.split('\n')[0]); console.log('0 passed, 1 failed'); process.exitCode = 1; });
