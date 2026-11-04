// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Formatted equations (eqformat.js): the naming rules, the layout of operators and functions, what stays as text.
import { E } from '../lib/engine.mjs';
import { ok, done } from '../lib/check.mjs';
const F = E.EqFormat;
const NAMES = {
  T_1: '<msub><mi>T</mi><mrow><mn>1</mn></mrow></msub>',
  T_1_2: '<msub><mi>T</mi><mrow><mn>1</mn><mo>,</mo><mn>2</mn></mrow></msub>',
  m_dot: '<mover accent="true"><mi>m</mi><mo>˙</mo></mover>',
  Q_dot_in: '<msub><mover accent="true"><mi>Q</mi><mo>˙</mo></mover><mrow><mi mathvariant="normal">in</mi></mrow></msub>',
  v_bar: '<mover accent="true"><mi>v</mi><mo>¯</mo></mover>',
  n_hat: '<mover accent="true"><mi>n</mi><mo>^</mo></mover>',
  T_star: '<msup><mi>T</mi><mo>*</mo></msup>',
  T_star_1: '<msubsup><mi>T</mi><mrow><mn>1</mn></mrow><mo>*</mo></msubsup>',
  eta: '<mi>η</mi>', Omega: '<mi>Ω</mi>', OMEGA: '<mi>Ω</mi>',
  eta_th: '<msub><mi>η</mi><mrow><mi mathvariant="normal">th</mi></mrow></msub>',
  Delta_T: '<mrow><mi mathvariant="normal">Δ</mi><mi>T</mi></mrow>',
  DELTAP: '<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>',
  delta: '<mi>δ</mi>', Re: '<mi mathvariant="normal">Re</mi>', etaX: '<mi mathvariant="normal">etaX</mi>',
};
for (const [n, want] of Object.entries(NAMES)) ok(`name ${n}`, F.ident(n) === want, F.ident(n));
const eq = (s) => F.equation(s).math, tx = (s) => F.equation(s).tex;
ok('a/b is a fraction; parentheses written around a numerator are dropped', /<mfrac><mrow><mi>a<\/mi><mo>\+<\/mo><mi>b<\/mi><\/mrow><mi>c<\/mi><\/mfrac>/.test(eq('x = (a + b)/c')), eq('x = (a + b)/c'));
ok('powers, roots and absolute values', /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/.test(eq('y = sqrt(x^2)')) && /<msqrt>/.test(eq('y = sqrt(x^2)')) && /<mo>\|<\/mo>/.test(eq('y = abs(x)')));
ok('a negative base keeps its parentheses: (-x)^2', /<msup><mrow><mo>\(<\/mo><mrow><mo>−<\/mo><mi>x<\/mi><\/mrow><mo>\)<\/mo><\/mrow><mn>2<\/mn><\/msup>/.test(eq('y = (-x)^2')), eq('y = (-x)^2'));
ok('a number times a name is an implied product; names are joined by a centered dot', /<mn>2<\/mn><mo>&#x2062;<\/mo><mi>x<\/mi>/.test(eq('y = 2*x')) && /<mi>a<\/mi><mo>·<\/mo><mi>b<\/mi>/.test(eq('y = a*b')));
ok('small numbers in powers of ten', /<mn>1.5<\/mn><mo>·<\/mo><msup><mn>10<\/mn><mn>-6<\/mn><\/msup>/.test(eq('y = 1.5e-6*x')), eq('y = 1.5e-6*x'));
ok('function calls as text with quoted strings; the unit tag at the end', /<mi mathvariant="normal">enthalpy<\/mi>.*<mtext>'water'<\/mtext>/.test(eq("h = enthalpy('water', T, P) [kJ/kg]")) && /<mtext>\[kJ\/kg\]<\/mtext><\/mrow><\/math>$/.test(eq("h = enthalpy('water', T, P) [kJ/kg]")));
ok('array elements as subscripts', /<msub><mi>x<\/mi><mrow><mn>2<\/mn><\/mrow><\/msub>/.test(eq('y = x[2]')));
ok('comparisons in if()', /<mo>≤<\/mo>/.test(eq('y = if(a <= b, a, b)')));
const items = F.render(`// heading\nT_1 = 300 [K]; P_1 = 1 [bar]\nq = h*A*(T_s -\n   T_inf)\nfunction f = g(x)\n  if x > 1\n    f = 2\n  else\n    f = 1\n  end\nend\node t = 0 : 1 : 0.1\n  y' = -y\n  y(0) = 1\nend\nunits $\nfluid$ = 'water'`);
const kinds = items.map(i => i.math ? 'M' : 'T').join('');
ok('render: comments left out; two equations on a line; a continued line; function blocks and units as text; inside an ode block the header and end as text, the lines as equations; a string variable as an equation', kinds === 'MMM' + 'T'.repeat(7) + 'TMMT' + 'TM', [kinds, items.filter(i => i.text).map(i => i.text)]);
ok('clipboard: equations inline (Word keeps them left-aligned), one per paragraph', F.clipboardHtml(items).split('<p>').length === 7 && !/display="block"/.test(F.clipboardHtml(items)) && /displaystyle="true"/.test(F.clipboardHtml(items)));
ok('clipboard text: one LaTeX equation per line', F.clipboard(items).split('\n').length === 6 && F.clipboard(items).split('\n')[0] === '{T}_{1} = 300\\quad \\left[\\mathrm{K}\\right]', F.clipboard(items));
// ode blocks: y' = f as dy/dt = f with the block's own independent variable, y(start) = v with y as a variable, helpers as equations
const ob = F.render(`ode tau = 0 : t_end : 60, stiff\n  q = h*A*(T - T_inf)\n  T' = -q/(m*c) [K/s]\n  T(0) = 400 [K]\n  T[2]' = a - b; T[2](0) = 1\n  duplicate i = 3 : 4\n    T[i]' = 0\n    T[i](0) = 1\n  end\nend\nT = 320 [K]`);
ok('ode: kinds, and only the lines directly in the block are marked inner (indented)', ob.map(i => i.math ? (i.inner ? 'I' : 'M') : 'T').join('') === 'TIIIII' + 'TTTT' + 'TM', ob.map(i => i.math ? i.tex : i.text));
ok("ode: T' = ... is dT/dtau as a fraction with an upright d; the unit tag stays", /^<math[^>]*><mrow><mfrac><mrow><mi mathvariant="normal">d<\/mi><mi>T<\/mi><\/mrow><mrow><mi mathvariant="normal">d<\/mi><mi>τ<\/mi><\/mrow><\/mfrac><mo>=<\/mo>/.test(ob[2].math) && /<mtext>\[K\/s\]<\/mtext>/.test(ob[2].math), ob[2].math);
ok('ode: LaTeX of the derivative, the initial value and an array state', ob[2].tex === '\\frac{\\mathrm{d}T}{\\mathrm{d}\\tau} = \\frac{-q}{m \\cdot c}\\quad \\left[\\mathrm{K/s}\\right]' &&
  ob[3].tex === 'T\\left(0\\right) = 400\\quad \\left[\\mathrm{K}\\right]' && ob[4].tex === '\\frac{\\mathrm{d}{T}_{2}}{\\mathrm{d}\\tau} = a - b' && ob[5].tex === '{T}_{2}\\left(0\\right) = 1', ob.slice(2, 6).map(i => i.tex));
ok('ode: the initial value shows T in italics as a variable, not as a function name', /^<math[^>]*><mrow><mrow><mi>T<\/mi><mrow><mo>\(<\/mo><mn>0<\/mn><mo>\)<\/mo><\/mrow><\/mrow><mo>=<\/mo>/.test(ob[3].math), ob[3].math);
ok("ode: outside a block, y' = ... is not taken as a derivative", F.equation("y' = 2") === null);
ok('ode: an ode block inside a function block stays text', F.render(`function f = g(x)\n  ode t = 0 : 1\n    y' = -y\n    y(0) = 1\n  end\n  f = y\nend`).every(i => !i.math));
// integral(f, x, a, b): the integral sign with its limits and dx; a sum in parentheses; infinite limits as the symbol
const ig = (s) => F.equation(s);
ok('integral: MathML with the sign, limits, the integrand and an upright d', /<msubsup><mo>∫<\/mo><msub><mi>T<\/mi><mrow><mn>1<\/mn><\/mrow><\/msub><msub><mi>T<\/mi><mrow><mn>2<\/mn><\/mrow><\/msub><\/msubsup><mfrac>.*<mi mathvariant="normal">d<\/mi><mi>T<\/mi><\/mrow>/.test(ig('ds = integral(cp/T, T, T_1, T_2)').math), ig('ds = integral(cp/T, T, T_1, T_2)').math);
ok('integral: LaTeX; a sum as the integrand gets parentheses; -Infinity and Infinity as the infinity sign', ig('ds = integral(cp/T, T, T_1, T_2)').tex === '\\mathrm{ds} = \\int_{{T}_{1}}^{{T}_{2}} \\frac{\\mathrm{cp}}{T} \\,\\mathrm{d}T' &&
  ig('z = 2*integral(x + 1, x, 0, 1)').tex === 'z = 2 \\int_{0}^{1} \\left(x + 1\\right) \\,\\mathrm{d}x' && ig('I = integral(exp(-x^2), x, -Infinity, Infinity)').tex === 'I = \\int_{-\\infty}^{\\infty} \\mathrm{exp}\\left(-{x}^{2}\\right) \\,\\mathrm{d}x' &&
  /<mrow><mo>−<\/mo><mi mathvariant="normal">∞<\/mi><\/mrow><mi mathvariant="normal">∞<\/mi><\/msubsup>/.test(ig('I = integral(exp(-x^2), x, -Infinity, Infinity)').math), [ig('ds = integral(cp/T, T, T_1, T_2)').tex, ig('z = 2*integral(x + 1, x, 0, 1)').tex, ig('I = integral(exp(-x^2), x, -Infinity, Infinity)').tex]);
ok('integral: any other call form stays a function call', /<mi mathvariant="normal">integral<\/mi>/.test(ig('y = integral(f, 2*x, 0, 1)').math));
// values given with an uncertainty (+- or ±): the value, ±, the uncertainty, then the unit; a unit of the uncertainty's own or a percentage after the value's unit
ok('±: T_1 = 300 ± 2 [K], the uncertainty in the unit of the value', F.equation('T_1 = 300 [K] +- 2 [K]').tex === '{T}_{1} = 300 \\pm 2\\quad \\left[\\mathrm{K}\\right]' && F.equation('T_1 = 300 [K] ± 2').tex === F.equation('T_1 = 300 [K] +- 2 [K]').tex &&
  /<mn>300<\/mn><mo>±<\/mo><mn>2<\/mn><mspace width="1em"\/><mtext>\[K\]<\/mtext>/.test(F.equation('T_1 = 300 [K] +- 2 [K]').math));
ok('±: a unit of its own and a percentage come after the unit of the value; +- in arithmetic stays an operator', F.equation('T = 25 [degC] +- 0.5 [K]').tex === 'T = 25\\quad \\left[\\mathrm{degC}\\right] \\pm 0.5\\quad \\left[\\mathrm{K}\\right]' &&
  F.equation('D = 0.05 [m] +- 1 %').tex === 'D = 0.05\\quad \\left[\\mathrm{m}\\right] \\pm 1\\,\\%' && !/±/.test(F.equation('y = x +- 2').math), [F.equation('T = 25 [degC] +- 0.5 [K]').tex, F.equation('D = 0.05 [m] +- 1 %').tex]);
const TEX = { T_1_2: '{T}_{1,2}', m_dot: '\\dot{m}', Q_dot_in: '{\\dot{Q}}_{\\mathrm{in}}', v_bar: '\\bar{v}', T_star: '{T}^{*}', eta_th: '{\\eta}_{\\mathrm{th}}',
  Delta_T: '{\\Delta T}', DELTAP: '{\\Delta P}', Re: '\\mathrm{Re}', sigma: '\\sigma' };
for (const [n, want] of Object.entries(TEX)) ok(`LaTeX name ${n}`, F.identTex(n) === want, F.identTex(n));
ok('LaTeX equation: fraction, power, root, product, function, unit', tx("q = k*A*(T_1 - T_2)/L + sqrt(x^2) [W]") === '{q} = \\frac{k \\cdot A \\cdot \\left({T}_{1} - {T}_{2}\\right)}{L} + \\sqrt{{x}^{2}}\\quad \\left[\\mathrm{W}\\right]'.replace('{q}', 'q') &&
  tx("h = enthalpy('water', T, P)") === "h = \\mathrm{enthalpy}\\left(\\mathrm{'water'}, T, P\\right)", [tx("q = k*A*(T_1 - T_2)/L + sqrt(x^2) [W]"), tx("h = enthalpy('water', T, P)")]);
// regression: the one-line ode45 form was shown as plain text
ok('ode45 one-liner: dy/dt = f with the outputs as variables, the initial value and the range', tx("[t, y_ode] = ode45(@(t,y) -0.5 * y, [0, 10], 5)") === '\\frac{\\mathrm{d}{y}_{\\mathrm{ode}}}{\\mathrm{d}t} = -0.5 \\cdot {y}_{\\mathrm{ode}},\\qquad {y}_{\\mathrm{ode}}\\left(0\\right) = 5,\\qquad 0 \\leq t \\leq 10', tx("[t, y_ode] = ode45(@(t,y) -0.5 * y, [0, 10], 5)"));
ok('ode45 one-liner: the lambda names are replaced by the outputs, systems too', tx('[x, Y] = ode45(@(s, u) [u[2], -u[1]], [0, 2*pi], [1, 0])').startsWith('\\frac{\\mathrm{d}Y}{\\mathrm{d}x} = \\left[{Y}_{2}, -{Y}_{1}\\right]') && !!eq('[x, Y] = ode45(@(s, u) [u[2], -u[1]], [0, 2*pi], [1, 0])'));
ok('ode45 one-liner in render: a formatted item, not text', !!F.render('[t, y] = ode45(@(t,y) -y, [0, 1], 1)')[0].math);
done();
