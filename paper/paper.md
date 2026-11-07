---
title: 'SimpleSolver: a free, browser-based equation solver for thermodynamics and heat transfer courses'
tags:
  - JavaScript
  - engineering education
  - thermodynamics
  - heat transfer
  - equation solver
  - WebAssembly
authors:
  - name: Francisco Ruiz
    orcid: 0000-0001-7787-2120
    affiliation: 1
affiliations:
  - name: School of Engineering, Applied Science, and Health, Illinois Institute of Technology, Chicago, Illinois, USA
    index: 1
date: 7 November 2026
bibliography: paper.bib
---

# Summary

SimpleSolver (SES, for Simple Equation Solver) is an open-source program for solving the
systems of equations that arise in engineering thermodynamics, heat transfer and related
courses. The student writes what is physically true — energy balances, property relations,
definitions — one equation per line and in any order, with units in brackets, and SES solves
them together. Thermodynamic and transport properties of more than 120 fluids come from
CoolProp [@Bell2014], compiled to WebAssembly; units are converted to SI and checked for
dimensional consistency; and the results can be swept in parametric tables, optimized, plotted
on property diagrams with the saturation dome, and copied into reports as typeset equations.

SES runs entirely in a web browser. There is nothing to install, no account, and no server
that sees the student's work (except for the optional assistant, which sends questions to the provider the student chooses): a laptop running any operating system, a Chromebook or a phone
is enough. It is free software under the GNU GPL, version 3 or later, and is available at
<https://simplesolver.org/app>.

The following lines, typed as they are, analyze a steam turbine with an isentropic efficiency
of 85 %:

```
P_1 = 8 [MPa]
T_1 = 500 [degC]
P_2 = 10 [kPa]
eta = 0.85
h_1 = enthalpy('water', T_1, P_1) [kJ/kg]
s_1 = entropy('water', T_1, P_1) [kJ/(kg K)]
h_2s = enthalpy('water', 'P', P_2, 'S', s_1) [kJ/kg]
h_2 = h_1 - eta*(h_1 - h_2s) [kJ/kg]
w_t = h_1 - h_2 [kJ/kg]
x_2 = quality('water', 'P', P_2, 'H', h_2)
```

The order of the lines does not matter, and the same lines solve the inverse problem — the
efficiency that gives a measured specific work — when `w_t` is given and `eta` is not.

# Statement of need

Courses in thermodynamics and heat transfer ask students to set up and solve problems that are
too tedious to do by hand but conceptually simple: a few dozen nonlinear equations, many of
them property evaluations. Two kinds of tools are used for them. General programming
environments, such as Python with CoolProp, are powerful but make the student write an
algorithm — the order of evaluation, an iteration for the implicit equations — when the point
of the exercise is the physics. Declarative equation solvers built for the purpose, of which
the Engineering Equation Solver [@EES] is the best known and is used alongside the leading
textbooks [@Cengel2019; @Moran2018], let students write the equations and leave the solution to
the program. That approach is the one SES follows, and its syntax and keyboard shortcuts are
close enough that an instructor can move a course to it with little rewriting; a converter for
existing programs is included.

What SES adds is access. Commercial solvers require a license and, typically, a particular
operating system, which leaves out students with Mac or Linux computers or Chromebooks, students
working on a phone, and instructors at institutions without a site license. A browser program
removes both barriers, and because it is free software, instructors can inspect, adapt and
redistribute it, and every result can be traced to the method and data that produced it.

SES is meant to be adopted in three ways: by students, as a replacement for a licensed solver
in homework and projects; by instructors, who can distribute problems as files or as links
that open a problem, with its guesses, bounds and units, in the student's browser; and by
authors of course material, through the many worked examples of the help, whose results are
computed by the program and checked again by its test suite.

# Features

- **Equations.** Nonlinear simultaneous equations, solved by Newton's method with automatic
  grouping into blocks, guesses and bounds; arrays and user functions with loops and branches;
  initial-value ODEs solved alongside the algebraic equations [@Dormand1980]; and derivatives of
  written-out formulas.
- **Properties.** Real fluids, mixtures, humid air, incompressible fluids and brines through
  CoolProp [@Bell2014]; ideal gases from the NASA polynomials [@McBride1993], with chemical
  equilibrium and adiabatic flame temperatures; solids, convection, boiling and condensation
  correlations, fins, transient conduction, radiation and the $\varepsilon$–NTU relations, after
  Incropera et al. [@Incropera2007].
- **Units.** Inline unit tags, conversion to SI, dimensional checking of every equation, and
  results shown in the units the user chooses. There is no need for conversion factors or functions.
- **Analysis.** Parametric tables, minimization and maximization of free variables, propagation
  of measurement uncertainties, and design to a specification with a stated probability.
- **Plots.** T–s, P–h, P–v and h–s diagrams with the saturation dome and the states of a cycle;
  the usual plots of Matlab, plots of an expression, contour and surface plots; notes with
  arrows; export as PNG or SVG.
- **Command line.** A Matlab-like console built on math.js [@mathjs], with matrices, complex
  and arbitrary-precision numbers, fitting and statistics.
- **Assistant.** An optional AI assistant, used with the student's own key for a provider of
  their choice or a model running on their computer. It sees the equations and results, and
  equations it proposes are checked on a copy — parsed, checked for units and solved — before
  the student decides whether to insert them.

The program is written in plain JavaScript with no build step, so that an instructor can read
and change it. More than 1,700 automated checks, run in Node.js and in a headless browser,
compare its property values, correlations and numerical methods with published data, and
check every example in the help.

# Origin and use in teaching

SES began as an experiment on vibe-coding. I chose to make an app inspired by Engineering Equation Solver (EES) because recent versions of EES crash recent MacIntosh machines when run under Wine or Crossover. It is being prepared for use at the senior-graduate course "Design of Termal Systems" next semester, which has used EES for years. A formal evaluation of learning outcomes has not been done.

# Acknowledgements

AI usage disclosure

Much of the code, tests and documentation was written with the
assistance of an AI model (Anthropic's Claude), directed, reviewed and tested by the author,
who is responsible for all of it.

# References
