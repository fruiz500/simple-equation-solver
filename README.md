# Simple Equation Solver

A browser-based solver for systems of algebraic and differential equations, made for courses in thermodynamics and heat transfer. Type the equations in any order, one per line, and press **Solve**. The program works out which equations have to be solved together, solves them, and shows every variable with its unit. It includes fluid properties, ideal-gas data for combustion, solid properties, heat transfer correlations, parametric tables, plots, optimization and ODE integration.

It runs entirely in the browser. There is nothing to install and no server: open `index.html`.

```
// Cylinder in cross flow of air, properties at the film temperature (Incropera, Example 7.4)
D = 0.0127 [m]
V = 10 [m/s]
T_inf = 26.2 [degC]
T_s = 128.4 [degC]
P = 101325 [Pa]
T_f = (T_inf + T_s)/2
k = conductivity('air', T_f, P)
Pr = prandtl('air', T_f, P)
Re = V*D/kinematicviscosity('air', T_f, P)
Nu = nu_churchillbernstein(Re, Pr)
h = Nu*k/D                      // 96.66 W/(m^2 K)
```

## Features

**Equations**
- Systems of nonlinear equations in any order. The solver splits them into blocks that must be solved simultaneously and solves each block with a bounded Newton method. You can set a guess, bounds and a display unit for each variable.
- Equations can be solved backward: any variable can be the unknown, including the argument of a property function, a correlation or a table interpolation.
- Arrays and matrices, `duplicate` blocks for repeated equations (finite-difference grids, for example), and long lines that continue across open brackets.
- User functions with several inputs and outputs, `if`/`elseif`, `for` and `while` loops, and `return`/`break`. Functions can be called from equations and solved through.
- Every [math.js](https://mathjs.org) function is available, plus `if(c, a, b)` and `c ? a : b`, and these Matlab-style functions: `linspace`, `logspace`, `trapz`, `cumtrapz`, `polyfit`, `polyval`, `lsqfit` (nonlinear least squares), `expint`, `gammainc`, `betainc`, `erfinv`, `normcdf`, `norminv`, `tcdf` and `tinv`; `roots` (polynomials of any degree), `factorialln`, and `regress` (multiple linear regression). The fits give standard errors, t statistics, p-values (which terms are significant), confidence intervals, R² and adjusted R², residuals and fitted values. On the console, `bignumber()` arithmetic to any number of digits, set with `digits(n)` (1000! exactly).

**Units**
- Unit tags such as `[kPa]`, `[W/(m^2 K)]` and `[degC]` on values and results. Calculations are done in SI and results are shown in the unit you choose. A number can carry its own unit inside an equation (`h_2 = 100 [kJ/kg] + h_1`). In the Variables pane, a unit of the wrong dimensions is refused, and Ctrl+D fills a unit down.
- **Check** checks the dimensional consistency of every equation and infers units for untagged variables.
- **Formatted** shows the equations as mathematics (subscripts, dots, Greek letters, fractions) and copies them into Word as editable equations, or as LaTeX.
- New units can be declared, for example `units $, euro`.

**Properties**
- Real fluids, humid air, incompressible fluids and mixtures, through [CoolProp](http://www.coolprop.org): `enthalpy('water', T, P)`, `quality(...)`, `humidair(...)`, derivatives such as `props('d(T)/d(P)|Hmass', ...)`, and the PR and SRK cubic equations of state.
- Ideal gases for combustion, from the NASA 7-coefficient polynomials (N2, O2, H2O, CO2, CH4, fuels, radicals): absolute enthalpy, entropy, Gibbs energy and enthalpy of formation.
- Water in every phase, under the name `'water'` or `'ice'`: ice Ih from the IAPWS equation of state for ice, the sublimation and melting curves, and vapor below the triple point, all on the same reference as CoolProp's water, so latent heats of fusion and sublimation come out of the enthalpies.
- Solids: conductivity, specific heat, density and diffusivity of the metals and nonmetals in Incropera's Tables A.1 to A.3, interpolated in temperature.
- The U.S. Standard Atmosphere 1976, from -5 to 86 km: temperature, pressure, density, speed of sound, viscosity, conductivity and gravity, and the pressure or density altitude.
- Mixtures of any of CoolProp's pure fluids, by mole fraction: bubble and dew points, flashes, the compositions of both phases, and h, s, u, v. `mixture()` uses CoolProp's mixture equation of state (ethanol–water with its azeotrope, CO2 in water, air, hydrocarbons, refrigerants), and `idealmixture()` uses Raoult's law for any number of fluids.
- Chemical equilibrium of ideal-gas mixtures by Gibbs minimization (the method of NASA's CEA): equilibrium compositions and adiabatic flame temperatures with dissociation. Reaction properties (ΔH, ΔS, ΔG, ln K) and reversible fuel-cell voltages, with liquid water.
- Fugacities, activity coefficients and excess properties of mixtures; activity-coefficient models (Margules, van Laar, Wilson, NRTL) with your parameters; Kay's rule for the generalized charts; the Joule–Thomson coefficient and inversion temperatures.
- Solutions of a solid solute (salts, sugars, glycols, urea; or any solute given by its molar mass and ions) as ideal solutions: vapor pressure, boiling and freezing points, osmotic pressure.
- Seawater at atmospheric pressure, 0 to 120 °C and 0 to 120 g/kg: density, specific heat, conductivity, viscosity, diffusivity, Prandtl number and boiling-point elevation; and, from TEOS-10 at any pressure, from brackish water to brine, enthalpy, entropy, Gibbs energy, water activity, osmotic coefficient and osmotic pressure (for reverse-osmosis design). Also the pressure at a depth in the ocean, and the depth at a pressure.
- Generalized compressibility (Lee–Kesler): Z, the enthalpy and entropy departures and the fugacity coefficient from Tr, Pr and the acentric factor, as in the generalized charts and tables. The fugacity of every CoolProp fluid is available too.

**Compressible flow**
- Isentropic flow, normal and oblique shocks, Fanno and Rayleigh flow the Prandtl–Meyer function and the mixing of particles into a gas flow (choking by particle loading), for a perfect gas of any k: `isentropic('A/A*', M, k)`, `normalshock('P02/P01', M1, k)`, and so on, with inverse functions that return the subsonic or the supersonic Mach number, as asked.

**Heat transfer correlations**
- These are named after the correlation, so the choice is visible in the equations: `nu_gnielinski(Re, Pr)`, `nu_churchillchu_plate(Ra, Pr)`, `f_colebrook(Re, eps_D)` (the Moody chart), `cd_sphere(Re)`, `q_rohsenow(...)`, `h_cond_tube(...)`, and so on.
- They cover forced convection (internal flow, flat plates, cylinders, spheres, tube banks), free convection (plates, cylinders, spheres, channels, enclosures, concentric cylinders and spheres), boiling (nucleate, critical and minimum heat flux, film boiling, flow boiling) and condensation (film on plates, tubes and spheres, in tubes, dropwise).
- Fins (efficiencies of the Table 3.5 shapes, including the Bessel-function ones, and the heat rate and temperature of uniform fins), transient conduction (the exact series for plane walls, cylinders and spheres, with computed eigenvalues, the semi-infinite solid, the heat rates of Table 5.2, and multidimensional product solutions), conduction shape factors (Table 4.1) and radiation (the blackbody functions and the view factors of Tables 13.1 and 13.2). Bessel functions and erfc are available directly.
- Convection correlations take dimensionless arguments; the boiling and condensation ones take SI quantities, and Check checks each argument. A value outside the published range of a correlation is still computed, with a warning.

- **Heat exchangers:** the ε–NTU relations of every standard flow arrangement, as lines to paste into the equations (they solve forward and backward), and `eps_regenerator`, a periodic-flow model of rotary and fixed-bed regenerators that solves together with properties evaluated at the unknown outlet temperatures.
- **Regenerator matrices and evaporation:** lines to paste for triangular-channel, packed-sphere, woven-screen and metal-felt matrices (Incropera Table 8.1 and Eq. 7.81, Ergun, Gedeon and Wood), and `evaporation()`, the evaporation from a free water surface into still or moving air (a cup, a pool, a reservoir) by the heat and mass transfer analogy.

**Tools**
- **Parametric tables:** sweep a variable and get every result as a column.
- **Plots:** T-s, P-h, P-v and h-s diagrams with the saturation dome and the states of a cycle, drawn by a plot line such as `propertyplot('water', 'Ts', 'cycle')`; the usual plots with Matlab names (`plot`, `semilogx`, `semilogy`, `loglog`, `scatter`, `bar`, `hist`, `errorbar`, `stairs`, `polarplot`, `plot3`, `pie`, `area`, `quiver`, `surf`, `mesh`), notes on the plot (`text`, `arrow`, and Add Note buttons), from arrays, and plots of an expression (`fplot`, `fplot3`, `fsurf`, `fcontour`, `fimplicit`, `fquiver`, parametric curves and surfaces, implicit curves), after Solve or typed on the command line; contour, heat-map and 3-D surface plots of two-dimensional arrays; error bars on the states from the propagated uncertainties; a second y-axis; overlaid curves, linear or log axes, straight or smooth lines, light and dark color schemes, adjustable text size, and export as PNG or SVG for publication.
- **Min/Max optimization** of one or more free variables within bounds. It uses BFGS (the default) or Nelder–Mead, with an optional multistart, and Brent's or golden-section search for one variable.
- **ODE blocks:** initial-value problems solved alongside the algebraic equations. They use adaptive Dormand–Prince 5(4) or, for stiff systems, a linearly implicit extrapolation method. The solver can also solve for an end time that meets a condition.
- **Uncertainty:** give measured values with their uncertainty, as `T_1 = 400 [degC] +- 1 [K]` or `P_1 = 3000 [kPa] +- 1 %`, and every result gets its uncertainty, by first-order propagation for independent inputs, with each input's share.
- **Design to a spec with a probability:** `W = atleast(W_spec, 0.95)` (or `atmost`) makes the W used in the equations W_spec plus the margin that meets the spec with that probability (here 1.645 u_W, from the propagated uncertainties of the built design).
- **Tabulated data:** `interpolate()` in 1-D and 2-D, linear, cubic spline or monotone (pchip), forward or backward, with optional extrapolation and a warning.
- A console command line for quick calculations, including symbolic `derivative()` and `simplify()`.
- **Keyboard shortcuts** for the main commands, with the function keys of EES (F2 Solve, F3 table, F4 Min/Max, F8 Check, F10 Formatted, ...) and Ctrl+Enter, Ctrl+S, Ctrl+O, Ctrl+/ and others; `?` on the command line lists them.
- **AI assistant:** `AI: question` on the command line asks a model of your choice (Anthropic, OpenAI, Gemini, OpenRouter, or one running on your computer, such as Ollama) with your key, which stays in the browser. It sees the equations, the last results and the latest messages (`AI: show` prints exactly what is sent). Equations it proposes are checked on a copy, corrected in a few rounds, and inserted only when you click.
- **Save** and **Open** sessions as plain-text `.ses` files (equations plus variable settings), and export results and tables as tab-separated text that opens in Excel.

The full manual, with many worked examples, is in [`help.html`](help.html), which also opens from the **Help** button. Every result shown in the help examples was computed by the program, and the test suite checks them again.

- **From EES:** a converter for EES programs: property calls, units of the EES unit system, functions, procedures and duplicate blocks, with a report of what to check.

## Getting started

1. Download or clone the repository.
2. Open `index.html` in a recent version of Chrome, Edge, Firefox or Safari.
3. Try one of the examples in the help: each has a **Copy** button. Paste it into the Equations pane and press **Solve**.

The page needs an internet connection the first time it loads, because math.js, Plotly and CoolProp come from public CDNs.

You can also serve the folder with GitHub Pages or any static web server. Nothing needs to be built.

## Files

| File | Contents |
|---|---|
| `index.html`, `style.css` | The page and its layout |
| `ui.js` | Editor, panes, tables, plots, dialogs, saving and loading |
| `parser.js` | Equation parsing, `duplicate` blocks, line continuation, unit declarations |
| `solver.js` | Block decomposition, Newton solver, optimizers, interpolation |
| `ode.js` | ODE blocks and integrators |
| `userfunctions.js` | User-defined functions |
| `units.js` | Unit conversion and Check |
| `thermo.js` | CoolProp interface and NASA ideal-gas data |
| `solids.js` | Solid property tables |
| `eqformat.js` | Formatted (MathML) display of the equations |
| `plots.js` | Plot lines: property diagrams, contour, heat-map and surface plots |
| `convert.js`, `convert.html` | The EES to SES converter (opened by From EES... in the Equations pane) |
| `correlations.js` | Heat transfer and friction correlations, generalized compressibility, compressible flow |
| `help.html` | The manual |
| `tests/` | Automated tests (see below) |

## Tests

The `tests/` folder checks the program against exact solutions and published results. It contains more than 450 checks, including the textbook's worked examples, CoolProp reference values, convergence orders of the integrators, every help example, and the user interface in a headless browser.

```
cd tests
npm install                 # math.js, CoolProp (WASM), Plotly and Playwright, at the versions the app uses
npx playwright install chromium
npm test                    # everything (Node, then Chromium)
npm run test:engine         # the solver only, in Node; no browser needed
```

Run `node run.mjs --verbose` for details, or `node run.mjs correlations` to run only the files whose names match. See [`tests/README.md`](tests/README.md) for the list of test files.

## Limitations

- Each equation is a single-line expression; sequential code goes in user functions. Derivatives are computed numerically.
- Optimization supports bounds only, not general inequality constraints, and finds a local optimum (multistart makes finding the global one likely, not certain).
- Array sizes and `duplicate` ranges must be known before solving.
- Results are real-valued.
- Most nonmetallic solids are tabulated at 300 K only.
- Correlations are typically within 10 to 25 % of experimental data. That is a property of the correlations, not of the program.

## Credits and sources

**Libraries** (loaded from CDNs, not included in this repository):
- [math.js](https://mathjs.org) 11.8.0, by Jos de Jong and contributors. Apache License 2.0. Expression parsing, units, matrices and symbolic functions.
- [Plotly.js](https://plotly.com/javascript/) 2.24.1, by Plotly, Inc. MIT License. Plots.
- [CoolProp](http://www.coolprop.org) 6.6.0, by Ian Bell and contributors, compiled to WebAssembly. MIT License. Fluid and humid-air properties. If you use CoolProp in published work, please cite:
  I. H. Bell, J. Wronski, S. Quoilin and V. Lemort, "Pure and Pseudo-pure Fluid Thermophysical Property Evaluation and the Open-Source Thermophysical Property Library CoolProp," *Industrial & Engineering Chemistry Research* 53(6), 2498–2508, 2014. [doi:10.1021/ie4033999](https://doi.org/10.1021/ie4033999)

**Data and correlations:**
- Solid properties and heat transfer correlations are extracted from F. P. Incropera, D. P. DeWitt, T. L. Bergman and A. S. Lavine, *Fundamentals of Heat and Mass Transfer*, 6th ed., John Wiley & Sons, 2007. Equation and table numbers are given for every function in the help. The original sources of the correlations are cited in that book.
- Ice: IAPWS R10-06(2009), *Revised Release on the Equation of State 2006 for H2O Ice Ih*, and IAPWS R14-08(2011), *Revised Release on the Pressure along the Melting and Sublimation Curves of Ordinary Water Substance* ([iapws.org](https://www.iapws.org)); thermal conductivity of ice from N. S. Wolfenbarger, E. Carnahan, J. S. Jordan and M. A. Hesse, "A comprehensive dataset for the thermal conductivity of ice Ih," *Data in Brief* 36, 107079, 2021 ([doi:10.1016/j.dib.2021.107079](https://doi.org/10.1016/j.dib.2021.107079)).
- Ideal-gas properties come from B. J. McBride, S. Gordon and M. A. Reno, *Coefficients for Calculating Thermodynamic and Transport Properties of Individual Species*, NASA TM-4513, 1993. [NASA Technical Reports Server](https://ntrs.nasa.gov/citations/19940013151)
- The Moody chart friction factor uses C. F. Colebrook, "Turbulent flow in pipes, with particular reference to the transition region between the smooth and rough pipe laws," *Journal of the Institution of Civil Engineers* 11(4), 133–156, 1939.
- The regenerator model follows R. K. Shah and D. P. Sekulić, *Fundamentals of Heat Exchanger Design*, Wiley, 2003, Ch. 5; the Kays and London correlation given for comparison is from W. M. Kays and A. L. London, *Compact Heat Exchangers*, 3rd ed., McGraw-Hill, 1984.
- Evaporation: the heat and mass transfer analogy of Incropera et al. (Secs. 6.7 and 9.6, Eqs. 7.31, 7.38, 9.30–9.32, Table A.8), with the film-theory correction for high rates of R. B. Bird, W. E. Stewart and E. N. Lightfoot, *Transport Phenomena*, 2nd ed., Wiley, 2002, Sec. 22.8. Packed-bed pressure drop: S. Ergun, *Chem. Eng. Prog.* 48, 89–94, 1952. Screens and felts: D. Gedeon and J. G. Wood, NASA CR-198442, 1996.
- Bessel function values, and those of the exponential integral and the normal and t distributions, were checked against M. Abramowitz and I. A. Stegun, *Handbook of Mathematical Functions*, NBS, 1964. The log-gamma function behind the incomplete gamma and beta functions is the Lanczos series of W. H. Press et al., *Numerical Recipes*, 3rd ed., Cambridge, 2007, sec. 6.1; nonlinear fits use the Levenberg–Marquardt method (same book, sec. 15.5). Radiation functions use the CODATA 2018 values of h, c and k.
- Regression statistics checked against D. C. Montgomery and G. C. Runger, *Applied Statistics and Probability for Engineers*, Wiley (Examples 12-1 and 12-7).
- Chemical equilibrium: S. Gordon and B. J. McBride, *Computer Program for Calculation of Complex Chemical Equilibrium Compositions and Applications*, NASA RP-1311, 1994 ([NTRS](https://ntrs.nasa.gov/citations/19950013764)); checked against the NIST-JANAF thermochemical tables ([janaf.nist.gov](https://janaf.nist.gov)) and the CEA flame temperatures of O. A. Marzouk, *Eng. Technol. Appl. Sci. Res.* 13(4), 11437–11444, 2023. Activity-coefficient models as in J. M. Smith, H. C. Van Ness and M. M. Abbott, *Introduction to Chemical Engineering Thermodynamics*, McGraw-Hill. Kay's rule: W. B. Kay, *Ind. Eng. Chem.* 28, 1014–1019, 1936.
- Mixtures: the multi-fluid form of O. Kunz and W. Wagner, "The GERG-2008 wide-range equation of state for natural gases and other mixtures," *J. Chem. Eng. Data* 57, 3032–3091, 2012, with CoolProp's parameters for each pair; the flash after H. H. Rachford and J. D. Rice, *J. Petrol. Technol.* 4(10), Sec. 1, p. 19 and Sec. 2, p. 3, 1952, started with the K-values of G. M. Wilson, "A modified Redlich-Kwong equation of state, application to general physical data calculations," 65th National AIChE Meeting, Cleveland, 1968, Paper 15C. Checked against L. W. Cornell and R. E. Montonna, *Ind. Eng. Chem.* 25, 1331, 1933, and P. Susial et al., *J. Chem. Eng. Data* 66, 928–946, 2021 ([doi:10.1021/acs.jced.0c00686](https://doi.org/10.1021/acs.jced.0c00686)).
- Seawater: M. H. Sharqawy, J. H. Lienhard V and S. M. Zubair, "Thermophysical properties of seawater: a review of existing correlations and data," *Desalination and Water Treatment* 16, 354–380, 2010 ([doi:10.5004/dwt.2010.1079](https://doi.org/10.5004/dwt.2010.1079)), through CoolProp's fit of them, checked against K. G. Nayar, M. H. Sharqawy and J. H. Lienhard V, *MIT Seawater Property Tables* ([web.mit.edu/seawater](https://web.mit.edu/seawater)). Enthalpy, entropy, Gibbs energy and the osmotic properties: TEOS-10, IAPWS R13-08, *Release on the IAPWS Formulation 2008 for the Thermodynamic Properties of Seawater* ([iapws.org](https://iapws.org/relguide/Seawater.html)), and R. Feistel, *Deep-Sea Res. I* 55, 1639–1671, 2008; the saline Gibbs function uses the 64 coefficients of the release's Table 2 and was checked against its check values and against the TEOS-10 GSW-C library ([teos-10.org](https://www.teos-10.org)). Pressure and depth: N. P. Fofonoff and R. C. Millard, *Algorithms for computation of fundamental properties of seawater*, UNESCO Technical Papers in Marine Science 44, 1983.
- Standard atmosphere: *U.S. Standard Atmosphere, 1976*, NOAA, NASA and USAF, U.S. Government Printing Office, 1976 (NASA TM-X-74335).
- Generalized compressibility: B. I. Lee and M. G. Kesler, "A generalized thermodynamic correlation based on three-parameter corresponding states," *AIChE Journal* 21(3), 510–527, 1975 ([doi:10.1002/aic.690210313](https://doi.org/10.1002/aic.690210313)).
- Compressible flow: the perfect-gas relations of J. D. Anderson, *Modern Compressible Flow*, 3rd ed., McGraw-Hill, 2003, and Ames Research Staff, *Equations, Tables, and Charts for Compressible Flow*, NACA Report 1135, 1953. Particle-laden flow: F. Ruiz, "Adiabatic interaction of particles with a compressible flow: basic mechanics," *Journal of Propulsion and Power* 16(3), 415–420, 2000 ([doi:10.2514/2.5605](https://doi.org/10.2514/2.5605)), with the mixture sound speed of G. B. Wallis, *One-Dimensional Two-Phase Flow*, McGraw-Hill, 1969.
- Sphere drag uses R. Clift and W. H. Gauvin, "The motion of particles in turbulent gas streams," *Proc. Chemeca '70*, Vol. 1, 14–28, 1970, as given in R. Clift, J. R. Grace and M. E. Weber, *Bubbles, Drops, and Particles*, Academic Press, 1978.

**Numerical methods:**
- ODEs: J. R. Dormand and P. J. Prince, "A family of embedded Runge–Kutta formulae," *J. Comput. Appl. Math.* 6(1), 19–26, 1980. Stiff systems use linearly implicit Euler with extrapolation, after E. Hairer and G. Wanner, *Solving Ordinary Differential Equations II*, Springer, 1996.
- Optimization: BFGS and Nelder–Mead, as described in J. Nocedal and S. J. Wright, *Numerical Optimization*, 2nd ed., Springer, 2006, and in J. A. Nelder and R. Mead, *The Computer Journal* 7(4), 308–313, 1965.
- Uncertainty: first-order propagation for independent inputs, as in JCGM 100:2008, *Evaluation of measurement data — Guide to the expression of uncertainty in measurement* (GUM), Eq. 10 ([bipm.org](https://www.bipm.org/en/committees/jc/jcgm/publications)).
- Interpolation: monotone piecewise cubic (pchip), after F. N. Fritsch and R. E. Carlson, *SIAM J. Numer. Anal.* 17(2), 238–246, 1980.

## License

Copyright © 2026 Francisco Ruiz.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License or (at your option) any later version. It is distributed in the hope that it will be useful, but **without any warranty**, without even the implied warranty of merchantability or fitness for a particular purpose. See [`LICENSE`](LICENSE) for the full text, or <https://www.gnu.org/licenses/>.

The libraries above keep their own licenses. The textbook data are short extracts included for teaching and reference.
