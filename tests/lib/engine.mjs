// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Loads the app's engine scripts into Node with the real math.js and CoolProp (WASM).
// The app folder is the parent of tests/, or APPDIR if set.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TESTS = path.resolve(here, '..');
export const APP = path.resolve(process.env.APPDIR || path.join(TESTS, '..'));
const require = createRequire(path.join(TESTS, 'package.json'));

const mathjs = require('mathjs');
globalThis.math = mathjs.create(mathjs.all);   // a full instance, as the browser bundle is (it has math.import)
const CPmod = (await import(pathToFileURL(path.join(TESTS, 'node_modules/coolprop-wasm/coolprop.js')).href)).default;
globalThis.window = { CoolProp: await CPmod(), CoolPropReady: true };
export const CP = globalThis.window.CoolProp;

const files = ['thermo.js', 'solids.js', 'correlations.js', 'units.js', 'userfunctions.js', 'ode.js', 'parser.js', 'solver.js'];
const code = files.map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
export const logs = [];
const con = { log: (...x) => logs.push(x.join(' ')), error: (...x) => logs.push('ERROR: ' + x.join(' ')), warn: (...x) => logs.push('WARN: ' + x.join(' ')) };
export const E = new Function('console', code +
  '\nreturn { EESParser, BoundedSolver, UnitConsistencyChecker, UserFunctions, UnitConv, OdeBlocks, OdeIntegrator, OptimizerND, Optimizer1D, Solids, SOLIDS_DB, Corr, CORRELATIONS, Interp: typeof Interp !== "undefined" ? Interp : null, Quadrature: typeof Quadrature !== "undefined" ? Quadrature : null };')(con);

// Parse and solve; guesses = { name: value } set before solving.
export function run(text, guesses = {}) {
  const p = new E.EESParser(); p.parse(text);
  for (const [k, v] of Object.entries(guesses)) p.variables.get(k).guess = v;
  const t0 = Date.now();
  const st = new E.BoundedSolver(p.parsedASTs, p.variables, p.odeCalls).solve();
  return { st, p, ms: Date.now() - t0, tb: E.OdeBlocks.tables };
}
// Error message of a run, or null if it succeeded.
export function err(text, guesses) { try { run(text, guesses); return null; } catch (e) { return e.message; } }
// Check Units on a text.
export function units(text) {
  logs.length = 0; const p = new E.EESParser(); p.parse(text);
  const r = E.UnitConsistencyChecker.run(p.parsedASTs, p.variables);
  return { issues: r.issues, logs: [...logs], p };
}
