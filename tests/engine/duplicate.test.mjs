// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
import { run, err, units, CP } from '../lib/engine.mjs';
import { ok, near, note, messages, done } from '../lib/check.mjs';
// 1. fin with an adiabatic tip, 101 nodes; compare with the exact solution of the differential equation
let fin = `N = 101
L = 0.05 [m]
dx = L/(N - 1)
h = 25 [W/(m^2 K)]
k = 200 [W/(m K)]
D = 0.005 [m]
m_fin = sqrt(4*h/(k*D))
theta[1] = 80
duplicate i = 2 : N-1
  theta[i-1] - 2*theta[i] + theta[i+1] = (m_fin*dx)^2*theta[i]
end
2*theta[N-1] - 2*theta[N] = (m_fin*dx)^2*theta[N]
q_fin = k*pi*D^2/4*(theta[1] - theta[2])/dx`;
let { st, p, ms } = run(fin);
const mL = Math.sqrt(4 * 25 / (200 * 0.005)) * 0.05, tipExact = 80 / Math.cosh(mL);
note(`fin: ${p.parsedASTs.length} equations, ${ms} ms; tip ${st['theta[101]'].toFixed(6)} vs exact ${tipExact.toFixed(6)}`);
ok('fin tip (O(dx^2) discretization error)', Math.abs(st['theta[101]'] - tipExact) < 1e-3 * 80, st['theta[101]']);
// 2. sum over a range, and constants in indices
({ st } = run(`N = 10\nduplicate i = 1 : N\n  x[i] = i^2\nend\ntotal = sum(x[1:N])\nlast = x[N]\nsecond = x[1+1]`));
ok('sum(x[1:N])', st.total === 385, st.total); ok('x[N] is x[10]', st.last === 100); ok('x[1+1] is x[2]', st.second === 4);
// 3. 2-D Laplace on a 9 x 9 interior grid: top edge 100, others 0 -> the centre is exactly 25 (superposition)
let lap = `n = 11\nduplicate i = 1 : n\n  T[i,1] = 0\n  T[i,n] = 100\nend\nduplicate j = 2 : n-1\n  T[1,j] = 0\n  T[n,j] = 0\nend\nduplicate i = 2 : n-1\n  duplicate j = 2 : n-1\n    T[i-1,j] + T[i+1,j] + T[i,j-1] + T[i,j+1] - 4*T[i,j] = 0\n  end\nend`;
({ st, p, ms } = run(lap));
note(`Laplace: ${p.parsedASTs.length} equations, ${ms} ms; centre T[6, 6] = ${st['T[6, 6]']}`);
ok('2-D Laplace centre = 25', Math.abs(st['T[6, 6]'] - 25) < 1e-9, st['T[6, 6]']);
// 4. transient conduction: duplicate inside an ode block, stiff; same model as the 20-node test of step 5 (middle 300.34347)
let tr = `N = 20\nalpha = 1e-5\nL = 0.1\ndx = L/(N + 1)\nT_s = 300\node t = 0 : 600 : 100, stiff\n  duplicate i = 1 : N\n    T[i](0) = 400\n  end\n  T[1]' = alpha*(T_s - 2*T[1] + T[2])/dx^2\n  duplicate i = 2 : N-1\n    T[i]' = alpha*(T[i-1] - 2*T[i] + T[i+1])/dx^2\n  end\n  T[N]' = alpha*(T[N-1] - 2*T[N] + T_s)/dx^2\nend\nT_mid = (T[10] + T[11])/2`;
({ st, ms } = run(tr)); note(`transient 20 nodes via duplicate (stiff): T[10](600) = ${st['T[10]'].toFixed(5)}, ${ms} ms`);
ok('transient duplicate matches step-5 result', Math.abs(st['T[10]'] - 300.34347) < 2e-5, st['T[10]']);
// 5. old array syntax unchanged
({ st } = run(`x[1] = 5\nx[2] = x[1] * 2\nx[3] = x[1] + x[2]`)); ok('old arrays', st['x[3]'] === 15);
// 6. messages
const m = {
  accumulate: err(`N = 3\nduplicate i = 1 : N\n  x[i] = i\nend\ns = 0\nduplicate i = 1 : N\n  s = s + x[i]\nend`),
  notconst: err(`N = M + 1\nduplicate i = 1 : N\n  x[i] = i\nend\nM + y = 5\ny = 1`),
  noend: err(`duplicate i = 1 : 3\n  x[i] = i\n`),
  infunction: err(`function y = f(a)\n  y = 0\n  duplicate i = 1 : 3\n    y = y + i\n  end\nend\nz = f(1)`),
  badindex: err(`duplicate i = 0 : 2\n  x[i] = i\nend`),
  fracindex: err(`duplicate i = 1 : 0.5 : 2\n  x[i] = i\nend`),
};
const EXPECT = {
  accumulate: /^Line 7: every copy of this line defines the same s/, notconst: /^Line 2: the range of duplicate must be known before solving; 'N' is not a constant/,
  noend: /^Line 1: this duplicate block has no matching 'end'/, infunction: /^Line 3: duplicate writes equations; inside a function use a for loop/,
  badindex: /^Line 2 .*whole number of 1 or more, got 0$/, fracindex: /^Line 2 .*whole number of 1 or more, got 1\.5$/,
};
messages(Object.entries(m).map(([k, v]) => [k, v, EXPECT[k]]));
done();
