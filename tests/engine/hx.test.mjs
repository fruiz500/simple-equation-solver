// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Heat exchangers: the effectiveness-NTU lines published in help.html (Tables 11.3 and 11.4), pasted into equations and
// solved forward and backward, against the book's examples, limits and a direct integration; eps_regenerator against the
// counterflow limit, an independent explicit integration and the Kays and London correlation; the solver's starting point.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { E, run, err, units, logs } from '../lib/engine.mjs';
import { CODE } from '../lib/help.mjs';
import { ok, near, messages, done } from '../lib/check.mjs';
const C = (name, ...a) => E.Corr.entries[name](...a);
const rel = (a, b) => Math.abs(a / b - 1);
const warns = () => logs.filter(l => /^WARN: /.test(l));

// 1. The published lines
const help = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../help.html'), 'utf8');
const dec = (t) => t.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const rows = {};
for (const m of help.matchAll(/<tr class="item hx" data-cfg="(\w+)"[^>]*><td>.*?<\/td><td>(.*?)<\/td><td>(.*?)<\/td>/g)) rows[m[1]] = { eps: dec(m[2]), ntu: /^\(/.test(dec(m[3])) ? null : dec(m[3]) };
ok('help.html lists 9 arrangements', Object.keys(rows).length === 9, Object.keys(rows));
const epsOf = (cfg, NTU, Cr, n = 2) => run(`NTU = ${NTU}\nC_r = ${Cr}\nn = ${n}\n${rows[cfg].eps}`).st.eps;
const NTUof = (cfg, eps, Cr, n = 2) => run(`eps = ${eps}\nC_r = ${Cr}\nn = ${n}\n${rows[cfg].ntu}`).st.NTU;
const NTUback = (cfg, eps, Cr, n = 2) => run(`eps = ${eps}\nC_r = ${Cr}\nn = ${n}\n${rows[cfg].eps}`, cfg === "shelln" ? { eps_1: 0.5 } : {}).st.NTU;   // eps_1 = 1 is singular (see the help's notes)
for (const cfg of Object.keys(rows)) {
  const Cr = cfg === 'counter1' ? 1 : cfg === 'cr0' ? 0 : 0.5, e = epsOf(cfg, 2, Cr);
  ok(`${cfg}: eps(NTU = 2, C_r = ${Cr}) = ${e.toFixed(5)}; the eps line solved backward gives NTU = 2`, Math.abs(NTUback(cfg, e, Cr) - 2) < 1e-8);
  if (rows[cfg].ntu) ok(`${cfg}: the NTU line (Table 11.4) inverts the eps line`, Math.abs(NTUof(cfg, e, Cr) - 2) < 1e-9, NTUof(cfg, e, Cr));
}
// 2. Book values and limits
ok('cross flow, both unmixed, Ex. 11.4: eps = 0.845 (NTU 2.67, C_r 0.357)', Math.abs(epsOf('crossunmixed', 100 * 40 / 1500, 1500 / 4197) - 0.845) < 5e-4);
ok('cross flow, both unmixed, Ex. 11.3: the book reads NTU = 2.1 from Fig. 11.14 (eps 0.75, C_r 0.45); Eq. 11.32 gives 1.99', Math.abs(NTUback('crossunmixed', 0.75, 0.45) - 1.9867) < 1e-3, NTUback('crossunmixed', 0.75, 0.45));
ok('C_r -> 0: every arrangement tends to 1 - exp(-NTU)', ['parallel', 'counter', 'shell1', 'shelln', 'crossunmixed', 'crossCmaxmixed', 'crossCminmixed'].every(c => Math.abs(epsOf(c, 1.5, 1e-7) - (1 - Math.exp(-1.5))) < 1e-5));
ok('counterflow: the C_r = 1 line is the limit of the general one', Math.abs(epsOf('counter', 3, 0.99999) - epsOf('counter1', 3, 1)) < 1e-5, epsOf('counter', 3, 0.99999) - epsOf('counter1', 3, 1));
ok('cross flow: C_max mixed and C_min mixed agree at C_r = 1', Math.abs(epsOf('crossCmaxmixed', 2, 1) - epsOf('crossCminmixed', 2, 1)) < 1e-12);
ok('shell and tube: n = 1 shell gives the one-shell result', Math.abs(epsOf('shelln', 2, 0.5, 1) - epsOf('shell1', 2, 0.5)) < 1e-12);
ok('shell and tube: NTU -> infinity gives 2/(1 + C_r + sqrt(1 + C_r^2))', Math.abs(epsOf('shell1', 40, 0.5) - 2 / (1.5 + Math.sqrt(1.25))) < 1e-9);
// direct integration of the two temperatures along the exchanger (RK4), C_min = hot side, T_hi = 1, T_ci = 0
const integrate = (NTU, Cr, counter, Tco) => {
  let Th = 1, Tc = counter ? Tco : 0; const N = 4000, h = NTU / N;
  const f = (th, tc) => [-(th - tc), (counter ? -1 : 1) * Cr * (th - tc)];
  for (let k = 0; k < N; k++) {
    const k1 = f(Th, Tc), k2 = f(Th + h / 2 * k1[0], Tc + h / 2 * k1[1]), k3 = f(Th + h / 2 * k2[0], Tc + h / 2 * k2[1]), k4 = f(Th + h * k3[0], Tc + h * k3[1]);
    Th += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); Tc += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }
  return [Th, Tc];
};
ok('parallel flow: eps line agrees with a direct integration', Math.abs(epsOf('parallel', 2, 0.5) - (1 - integrate(2, 0.5, false)[0])) < 1e-10);
let lo = 0, hi = 1; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (integrate(2, 0.5, true, m)[1] > 0) hi = m; else lo = m; }   // shoot on T_co
ok('counterflow: eps line agrees with a direct integration (shooting on T_c,o)', Math.abs(epsOf('counter', 2, 0.5) - (1 - integrate(2, 0.5, true, lo)[0])) < 1e-9);

// 3. eps_regenerator
ok('eps_regenerator: Cr_star -> infinity gives the counterflow effectiveness at NTU_o', [[3, 0.8], [5, 1], [8, 0.95]].every(([N, Cr]) =>
  Math.abs(C('eps_regenerator', N, Cr, 1000) - (Cr === 1 ? N / (1 + N) : (1 - Math.exp(-N * (1 - Cr))) / (1 - Cr * Math.exp(-N * (1 - Cr))))) < 1e-5));
ok('eps_regenerator: a slow matrix carries at most C_matrix (T_hi - T_ci): eps -> Cr_star', Math.abs(C('eps_regenerator', 20, 1, 0.2) - 0.2) < 1e-6);
ok('eps_regenerator: balanced flow is symmetric in hA_star (0.25 and 4), and hA_star changes eps by under 0.5 % there',
  Math.abs(C('eps_regenerator', 5, 1, 1, 0.25) - C('eps_regenerator', 5, 1, 1, 4)) < 1e-9 && rel(C('eps_regenerator', 5, 1, 1, 0.25), C('eps_regenerator', 5, 1, 1)) < 5e-3);
// An independent integration: explicit Euler in time, trapezoidal rule along the flow, first order, fine grid
const explicitRegen = (NTUo, Cr, Crs, hAs = 1) => {
  const N = 100, M = 2000, hA1 = NTUo * (1 + hAs), hA2 = hA1 / hAs, sides = [[hA1, Crs, 1, false], [hA2 * Cr, Crs * Cr, 0, true]];
  let w = Array.from({ length: N + 1 }, (_, i) => 1 - i / N), out = [0, 0];
  for (let cyc = 0; cyc < 3000; cyc++) {
    const w0 = w.slice();
    for (let s = 0; s < 2; s++) {
      const [ntu, crs, Tin, rev] = sides[s], dx = 1 / N, dt = 1 / M; let sum = 0;
      for (let n = 0; n < M; n++) {
        const T = new Array(N + 1); const idx = (j) => rev ? N - j : j;
        T[idx(0)] = Tin;
        for (let j = 0; j < N; j++) { const a = idx(j), b = idx(j + 1), c = ntu * dx / 2; T[b] = (T[a] * (1 - c) + c * (w[a] + w[b])) / (1 + c); }
        for (let i = 0; i <= N; i++) w[i] += dt * ntu / crs * (T[i] - w[i]);
        sum += T[idx(N)];
      }
      out[s] = sum / M;
    }
    if (Math.max(...w.map((v, i) => Math.abs(v - w0[i]))) < 1e-10) break;
  }
  return ((1 - out[0]) + out[1] / Cr) / 2;
};
for (const a of [[5, 1, 1.5], [2, 0.8, 3], [8, 0.95, 1], [1, 1, 1.5]]) {
  const x = explicitRegen(...a), v = C('eps_regenerator', ...a);
  ok(`eps_regenerator(${a.join(', ')}) = ${v.toFixed(5)}; an independent explicit integration gives ${x.toFixed(5)} (within 2e-3)`, Math.abs(x - v) < 2e-3);
}
// The Kays and London correlation (as published in the help) against the numerical result
let worst = 0, where = null;
for (const N of [2, 3, 5, 10]) for (const Cr of [0.9, 0.95, 1]) for (const Crs of [1.5, 2, 3, 5, 10]) {
  const ecf = Cr === 1 ? N / (1 + N) : (1 - Math.exp(-N * (1 - Cr))) / (1 - Cr * Math.exp(-N * (1 - Cr))), kl = ecf * (1 - 1 / (9 * Crs ** 1.93));
  const d = rel(kl, C('eps_regenerator', N, Cr, Crs)); if (d > worst) { worst = d; where = [N, Cr, Crs]; }
}
ok(`Kays and London correlation within 1 % of eps_regenerator for NTU_o 2 to 10, C_r 0.9 to 1, Cr_star 1.5 to 10 (worst ${(worst * 100).toFixed(2)} % at ${where})`, worst < 0.01);
const kl1 = 0.5 * (1 - 1 / (9 * 1.5 ** 1.93));
ok('at NTU_o = 1 the correlation is 2 % low (Cr_star 1.5, C_r 1), as the help says', Math.abs(kl1 / C('eps_regenerator', 1, 1, 1.5) - 1 + 0.0204) < 1e-3);
logs.length = 0; run(`e1 = eps_regenerator(60, 1, 2)`);
ok('eps_regenerator: NTU_o above 50 is warned', warns().length === 1 && /NTU_o = 60 is above 50/.test(warns()[0]), warns());
messages([
  ['C_r = 0', err(`x = eps_regenerator(5, 0, 2)`), /C_r = 0 must be positive/],
  ['arguments', err(`x = eps_regenerator(5, 1)`), /eps_regenerator\(NTU_o, C_r, Cr_star, hA_star\) takes 3 to 4 arguments, got 2/],
]);
let u = units(`UA = 4000 [W/K]\nx = eps_regenerator(UA, 1, 2)`);
ok('Check Units: a dimensional NTU_o is flagged', u.issues.some(i => /eps_regenerator\(\) takes dimensionless arguments but got \[W\/K\]/.test(i)), u.issues);

// 4. The solver's starting point: in a coupled block, v = expression lines whose v is still at the default guess start
//    from values consistent with the other guesses. The regenerator example converges from the default guesses with it.
const t0 = Date.now(), s9 = run(CODE['ex-h9']).st;
ok(`regenerator example (help ex-h9) converges from the default guesses (${((Date.now() - t0) / 1000).toFixed(1)} s)`, Math.abs(s9.eps - 0.7444864) < 1e-6 && Math.abs(s9.q - C('eps_regenerator', s9.NTU_o, s9.C_r, s9.Cr_star) * s9.C_min * 300) < 1e-6 * s9.q);
const s8 = run(CODE['ex-h8'], { T_ho: 400, T_co: 300 }).st;
ok('a guess set by hand is kept: the cross-flow example from hand-set outlet guesses gives the same solution', Math.abs(s8.eps - 0.8445222) < 1e-6);
done();
