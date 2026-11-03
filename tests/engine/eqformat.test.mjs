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
ok('render: comments left out; two equations on a line; a continued line; function and ode blocks and units as text; a string variable as an equation', kinds === 'MMM' + 'T'.repeat(7) + 'T'.repeat(4) + 'TM', [kinds, items.filter(i => i.text).map(i => i.text)]);
ok('clipboard: equations inline (Word keeps them left-aligned), one per paragraph', F.clipboardHtml(items).split('<p>').length === 5 && !/display="block"/.test(F.clipboardHtml(items)) && /displaystyle="true"/.test(F.clipboardHtml(items)));
ok('clipboard text: one LaTeX equation per line', F.clipboard(items).split('\n').length === 4 && F.clipboard(items).split('\n')[0] === '{T}_{1} = 300\\quad \\left[\\mathrm{K}\\right]', F.clipboard(items));
const TEX = { T_1_2: '{T}_{1,2}', m_dot: '\\dot{m}', Q_dot_in: '{\\dot{Q}}_{\\mathrm{in}}', v_bar: '\\bar{v}', T_star: '{T}^{*}', eta_th: '{\\eta}_{\\mathrm{th}}',
  Delta_T: '{\\Delta T}', DELTAP: '{\\Delta P}', Re: '\\mathrm{Re}', sigma: '\\sigma' };
for (const [n, want] of Object.entries(TEX)) ok(`LaTeX name ${n}`, F.identTex(n) === want, F.identTex(n));
ok('LaTeX equation: fraction, power, root, product, function, unit', tx("q = k*A*(T_1 - T_2)/L + sqrt(x^2) [W]") === '{q} = \\frac{k \\cdot A \\cdot \\left({T}_{1} - {T}_{2}\\right)}{L} + \\sqrt{{x}^{2}}\\quad \\left[\\mathrm{W}\\right]'.replace('{q}', 'q') &&
  tx("h = enthalpy('water', T, P)") === "h = \\mathrm{enthalpy}\\left(\\mathrm{'water'}, T, P\\right)", [tx("q = k*A*(T_1 - T_2)/L + sqrt(x^2) [W]"), tx("h = enthalpy('water', T, P)")]);
done();
