# Tests

Checks of the solver against exact or published answers: the engine runs in Node with the real
math.js and CoolProp, and the help examples run in Chromium through the real page.

## First time

```
cd tests
npm install
npx playwright install chromium
```

## Running

```
npm test                    # everything: engine in Node, then the browser
npm run test:engine         # engine only, no Chromium needed (about 30 s)
node run.mjs --verbose      # also print each test's notes: error messages, step counts, timings
node run.mjs ode units      # only the files whose names contain these words
APPDIR=/other/copy npm test # test another copy of the app
```

The exit code is 1 if any check fails, and each failure is printed as `FAIL name | value`.

## Files

| File | What it checks |
|---|---|
| engine/functions | user functions: if/for/while/break, multiple outputs, units in headers, recursion, error messages |
| engine/inline-if | comparisons, inline `if(c, a, b)`, solving through an if, unit checks of branches |
| engine/blocks | block decomposition, structural messages, `0 = ...` equations, a 300-node chain |
| engine/ode | ode blocks against exact solutions, stiff option, Robertson kinetics, solving for end time or a parameter |
| engine/duplicate | duplicate blocks: fin vs exact, 2-D Laplace, duplicate inside ode, error messages |
| engine/correlations | forced convection correlations: values from the book's worked examples, Colebrook residual, Eq. 7.44 against an integration, sphere drag against the standard curve, tables, range warnings, Check Units |
| engine/freeconv | free convection correlations: values from Examples 9.2 to 9.5, limits two correlations share (Elenbaas and Bar-Cohen, Morgan's bands), the piecewise choices for enclosures, range warnings, Check Units for the length scales |
| engine/boiling | boiling and condensation correlations: values from Examples 10.1 to 10.4, Bromley's implicit equation, the regime chosen by h_cond_vert against Eqs. 10.38 to 10.40, Kandlikar and Lienhard-Eichhorn branches, Tables 10.1 and 10.2, warnings, SI argument units in Check Units |
| engine/hx | heat exchangers: the effectiveness-NTU lines of the help solved forward and backward, against Examples 11.3 and 11.4, limits and a direct integration; eps_regenerator against the counterflow limit, an independent explicit integration and the Kays and London correlation; the regenerator example from the default guesses |
| engine/conduction-radiation | fins, transient conduction, radiation and special functions: Abramowitz and Stegun values and identities, Tables 5.1 and 12.1 (with their misprints), Example 5.4, direct integrations of the fin equations and of Planck's law, the heat equation and convection condition, crossed strings and area integrals for view factors |
| engine/conduction2 | conduction shape factors (Table 4.1) against their limits and a finite-difference solution, the q* functions of Table 5.2 against the exact series and a finite-difference solution, product solutions and Langston's rule |
| engine/leekesler | generalized compressibility: 36 values of the printed Lee-Kesler tables (Z, departures, fugacity coefficients of both fluids, liquid and vapor), Borgnakke and Sonntag's saturation table, the identities linking Z, ln(phi) and the departures, the choice of root, warnings, messages, Check; `fugacity` and `fugacitycoefficient` against CoolProp's residual Gibbs energy, dln(f)/dP = v/(R T), saturation and the Poynting correction |
| engine/compressible | compressible flow: 47 table values at k = 1.4, conservation across normal shocks, the differential forms of Fanno flow and the Prandtl-Meyer function, Rayleigh and Fanno stagnation ratios, oblique shocks (theta-beta-M, maximum deflection, weak and strong), round trips through every inverse on both branches for three k, messages, Check; particles mixed into the flow against the results of Ruiz (2000) |
| engine/ice | water below the triple point: IAPWS R10-06 and R14-08 check values, phase equilibria against CoolProp's IAPWS-95, routing between ice, liquid and vapor, input pairs, messages, Check Units |
| engine/derivative | `derivative()` values, optimum problems, messages |
| engine/solids | solid properties: every alpha printed at 300 K in Tables A.1/A.2, values read off the pages, interpolation, names, messages, ode blocks, Check Units |
| engine/syntax | bracket continuation and declared units ($, euro, person): conversions, Check Units, messages |
| engine/units | unit inference and the problems Check Units must find; every help example free of unit issues |
| engine/help-special | the 3 help examples the browser test cannot do by pressing Solve (hand-set guess, matrices) |
| engine/interpolate | `interpolate()` 1-D and 2-D, linear, spline and pchip: exact answers, orders of accuracy, monotonicity, solving backward, duplicate tables, functions, ode blocks, extrapolation warnings, messages, units |
| engine/optimize | multivariable Min/Max, BFGS and Nelder-Mead: 3- and 4-stage compression, Rosenbrock, Curzon-Ahlborn, optima at bounds, regions without solutions, multistart, an ode block inside |
| engine/robustness | convergence from a grid of guesses; the floors are counts measured on 31 Oct 2026 |
| browser/help-examples | every other help example reproduces its published result table |
| browser/table-export | Export button of the Parametric Table pane: sweep, one and two ode blocks, out-of-date refusal |
| browser/interpolate | `interpolate()` on the console command line, and the warning after Solve |
| browser/optimize | the Min/Max dialog: ticking free variables, bounds from the Variables pane, messages, Brent for one variable, multistart report |
| browser/plot | log axes, Light/Dark colors, text size, overlays kept, Save image (PNG pixel size, SVG) |
| browser/units-syntax | declared units and a continued table in the page; the start-up notice |
| tools/help-results | not a test: computes rows for a help.html result table, e.g. `node tools/help-results.mjs ex-a1 q_fin` |

Error-message checks compare the key wording, so rewording a message means updating its pattern.
The browser test serves the CDN libraries from `node_modules`, so it runs offline with the same versions.

## Adding a test

Put a `name.test.mjs` file in `engine/` (or `.cjs` in `browser/`). Use `run`, `err` and `units` from
`lib/engine.mjs` and `ok`, `near`, `note`, `messages` and `done` from `lib/check.mjs`; end the file with `done()`.
