// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Matlab-style functions: linspace, logspace, trapz, cumtrapz, polyfit, polyval, lsqfit, expint, gammainc, betainc,
// erfinv, normcdf, norminv, tcdf, tinv. Reference values: Abramowitz & Stegun (1964) tables 5.1, 26.1 and 26.10.
import { run, err, units } from '../lib/engine.mjs';
import { ok, near, done } from '../lib/check.mjs';

const v = (e) => { const r = run(`x_ = ${e}`).st.x_; return r; };
const arr = (e) => { const r = v(e); return Array.isArray(r) ? r : (r && r._data) || r; };
const close = (a, b, tol) => a.length === b.length && a.every((x, i) => near(x, b[i], tol));

// ---- grids and the trapezoid rule
ok('linspace(0, 1, 5)', close(arr('linspace(0, 1, 5)'), [0, 0.25, 0.5, 0.75, 1], 1e-15));
ok('linspace default is 100 points', arr('linspace(0, 1)').length === 100);
ok('logspace(0, 2, 3) = [1, 10, 100]', close(arr('logspace(0, 2, 3)'), [1, 10, 100], 1e-14));
ok('trapz(x, y) is exact for a straight line', near(v('trapz([0, 1, 3], [1, 2, 4])'), 7.5, 1e-15));
ok('trapz(y) uses unit spacing', near(v('trapz([1, 2, 3])'), 4, 1e-15));
ok('cumtrapz starts at 0 and ends at trapz', close(arr('cumtrapz([0, 1, 2], [0, 1, 4])'), [0, 0.5, 3], 1e-15));
let s = run(`x = linspace(0, 2, 201)\ny = x.^2\nI = trapz(x, y)`).st;
ok('trapz of x^2 on 201 points: error (b - a) h^2 f\'\'/12 = 2e-4/3', near(s.I - 8 / 3, 2 * 0.01 ** 2 * 2 / 12, 1e-9), s.I);

// ---- polynomial fits: exact data, then the textbook straight-line formulas
ok('polyfit recovers x^2 + x + 1, highest power first', close(arr('polyfit([0, 1, 2, 3], [1, 3, 7, 13], 2)'), [1, 1, 1], 1e-12));
ok('polyval([1, 2, 1], 3) = 16', v('polyval([1, 2, 1], 3)') === 16);
ok('polyval on an array', close(arr('polyval([1, 2, 1], [0, 1])'), [1, 4], 1e-15));
const X = [0, 1, 2, 3, 4], Y = [1.1, 2.9, 5.2, 6.8, 9.1], n = 5;
const mx = 2, my = Y.reduce((a, b) => a + b) / n, Sxx = X.reduce((a, x) => a + (x - mx) ** 2, 0), Sxy = X.reduce((a, x, i) => a + (x - mx) * (Y[i] - my), 0);
const b1 = Sxy / Sxx, b0 = my - b1 * mx, SSE = X.reduce((a, x, i) => a + (Y[i] - b0 - b1 * x) ** 2, 0), se2 = SSE / (n - 2);
const SST = Y.reduce((a, y) => a + (y - my) ** 2, 0);
const xs = `[${X}]`, ys = `[${Y}]`;
ok('polyfit line = least-squares formulas', close(arr(`polyfit(${xs}, ${ys}, 1)`), [b1, b0], 1e-12));
ok('polyfit stderr = sqrt(s^2/Sxx), sqrt(s^2 (1/n + xbar^2/Sxx))', close(arr(`polyfit(${xs}, ${ys}, 1, 'stderr')`), [Math.sqrt(se2 / Sxx), Math.sqrt(se2 * (1 / n + mx * mx / Sxx))], 1e-12));
ok('polyfit r2 = 1 - SSE/SST', near(v(`polyfit(${xs}, ${ys}, 1, 'r2')`), 1 - SSE / SST, 1e-12));
ok('polyfit rmse = sqrt(SSE/(n - p))', near(v(`polyfit(${xs}, ${ys}, 1, 'rmse')`), Math.sqrt(se2), 1e-12));
ok('polyfit with too few points is an error', /point/i.test(err(`x_ = polyfit([1, 2], [1, 2], 2)`) || ''), err(`x_ = polyfit([1, 2], [1, 2], 2)`));

// ---- nonlinear least squares
ok('lsqfit recovers a = 2, b = 0.5 in a*exp(-b*x)', close(arr(`lsqfit('a*exp(-b*x)', [0, 1, 2, 3], [2, 2*exp(-0.5), 2*exp(-1), 2*exp(-1.5)], 'a b', [1, 1])`), [2, 0.5], 1e-8));
s = run(`x = linspace(1, 3, 11)\ny = 3*x.^1.5\nc = polyfit(x, x.^2, 2)[1]\nnn = lsqfit('a*x^n', x, y, 'a n', [1, 1])[2]`).st;
ok('indexed results in equations: polyfit(...)[1], lsqfit(...)[2]', near(s.c, 1, 1e-12) && near(s.nn, 1.5, 1e-8), [s.c, s.nn]);

// ---- special functions against A&S tables
ok('E1(0.1) = 1.822923958 (A&S 5.1)', near(v('expint(0.1)'), 1.82292395841939, 1e-12));
ok('E1(0.5) = 0.5597735948', near(v('expint(0.5)'), 0.559773594776161, 1e-12));
ok('E1(1) = 0.2193839344', near(v('expint(1)'), 0.219383934395520, 1e-12));
ok('E1(2) = 0.04890051071', near(v('expint(2)'), 0.048900510708061, 1e-11));
ok('E1(5) = 1.148295591e-3', near(v('expint(5)'), 1.148295591275e-3, 1e-10));
s = run(`I = integral(exp(-t)/t, t, 1.5, Infinity)\nE = expint(1.5)`).st;
ok('expint(1.5) = integral of exp(-t)/t from 1.5 to infinity', near(s.I, s.E, 1e-10), [s.I, s.E]);
ok('expint(0) is an error', !!err('x_ = expint(0)'));
ok('gammainc(x, 1) = 1 - exp(-x)', [0.1, 1, 5].every(x => near(v(`gammainc(${x}, 1)`), 1 - Math.exp(-x), 1e-13)));
ok('gammainc(x, 1/2) = erf(sqrt(x))', [0.2, 2, 8].every(x => near(v(`gammainc(${x}, 0.5)`), v(`erf(sqrt(${x}))`), 1e-12)));
ok("gammainc lower + upper = 1", near(v("gammainc(3, 2.5) + gammainc(3, 2.5, 'upper')"), 1, 1e-14));
ok('betainc(x, 1, 1) = x', near(v('betainc(0.3, 1, 1)'), 0.3, 1e-14));
ok('betainc(1/2, 2, 3) = 11/16', near(v('betainc(0.5, 2, 3)'), 0.6875, 1e-13));
ok('betainc symmetry I_x(a, b) + I_(1-x)(b, a) = 1', near(v('betainc(0.3, 2.5, 4) + betainc(0.7, 4, 2.5)'), 1, 1e-13));

// ---- inverse error function and the normal distribution (regression: erfinv once had the wrong sign of w)
ok('erfinv(0.5) = 0.4769362762', near(v('erfinv(0.5)'), 0.476936276204470, 1e-12));
ok('erfinv is odd, and erf(erfinv(y)) = y', near(v('erfinv(-0.9)'), -v('erfinv(0.9)'), 1e-14) && near(v('erf(erfinv(0.999))'), 0.999, 1e-13));
ok('normcdf(1.96) = 0.9750021049', near(v('normcdf(1.96)'), 0.975002104851780, 1e-12));
ok('normcdf(-6) = 9.865876e-10: the lower tail keeps its digits (A&S 26.1)', near(v('normcdf(-6)'), 9.86587645037698e-10, 1e-9));
ok('normcdf(x, mu, sigma) standardizes', near(v('normcdf(13, 10, 2)'), v('normcdf(1.5)'), 1e-15));
ok('norminv(0.975) = 1.959963985, norminv(0.95) = 1.644853627', near(v('norminv(0.975)'), 1.959963984540054, 1e-12) && near(v('norminv(0.95)'), 1.644853626951472, 1e-12));
ok('norminv(p, mu, sigma) = mu + sigma z', near(v('norminv(0.975, 10, 2)'), 10 + 2 * 1.959963984540054, 1e-12));

// ---- Student's t (A&S 26.10; nu = 1 and 2 have closed forms). Regression: with math.lgamma, tcdf(t, 1) was off by 4e-13.
ok('tcdf(t, 1) = 1/2 + atan(t)/pi', [-3, 0.5, 4].every(t => near(v(`tcdf(${t}, 1)`), 0.5 + Math.atan(t) / Math.PI, 1e-13)));
ok('tcdf(t, 2) = 1/2 + t/(2 sqrt(2 + t^2))', [-1, 2].every(t => near(v(`tcdf(${t}, 2)`), 0.5 + t / (2 * Math.sqrt(2 + t * t)), 1e-13)));
s = run(`F = 0.5 + integral(gamma(5)/(sqrt(9*pi)*gamma(4.5))*(1 + u^2/9)^(-5), u, 0, 1.3)\nT = tcdf(1.3, 9)`).st;
ok('tcdf(1.3, 9) = integral of the t density', near(s.F, s.T, 1e-11), [s.F, s.T]);
ok('tinv(0.975, 1) = tan(0.475 pi) = 12.7062', near(v('tinv(0.975, 1)'), Math.tan(0.475 * Math.PI), 1e-10));
ok('tinv(0.975, 9) = 2.262157', near(v('tinv(0.975, 9)'), 2.262157162740, 1e-9));
ok('tinv(0.975, 10) = 2.228139, tinv(0.995, 5) = 4.032143', near(v('tinv(0.975, 10)'), 2.228138851986, 1e-9) && near(v('tinv(0.995, 5)'), 4.032142983557, 1e-9));
ok('tinv(p, 1e6) approaches norminv(p)', near(v('tinv(0.975, 1e6)'), 1.959963984540054, 1e-5));

// ---- Check Units
let u = units(`x = linspace(0, 2, 21) [m]\nc = 3 [W/m^2]\nq = c*x\nQ = trapz(x, q)`);
ok('Check Units: trapz of W/m over m gives W', u.issues.length === 0 && (u.p.variables.get('Q').inferredUnit || '') === 'W', [u.issues.join(' | '), u.p.variables.get('Q').inferredUnit]);
u = units(`T = 300 [K]\ny = erfinv(T)`);
ok('Check Units: erfinv of a temperature is flagged', u.issues.some(m => /erfinv\(\) needs a dimensionless/.test(m)), u.issues.join(' | '));
u = units(`mu = 10 [kg]\nsigma = 2 [kg]\nm = norminv(0.9, mu, sigma)`);
ok('Check Units: norminv(p, mu, sigma) has the dimensions of mu', u.issues.length === 0 && (u.p.variables.get('m').inferredUnit || '') === 'kg', [u.issues.join(' | '), u.p.variables.get('m').inferredUnit]);
// ---- roots of polynomials of any degree (Aberth-Ehrlich), and factorialln
const mul = (a, b) => { const r = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => r[i + j] += x * y)); return r; };
const rp = (rs) => rs.reduce((p, x) => mul(p, [1, -x]), [1]);
ok('roots([1, -3, 2]) = 1, 2 (highest power first, smallest first)', close(arr('roots([1, -3, 2])'), [1, 2], 1e-14));
ok('roots of a degree-10 polynomial with a complex pair: the 8 real roots 1 ... 8', close(arr(`roots([${mul([1, 0, 1], rp([1, 2, 3, 4, 5, 6, 7, 8]))}])`), [1, 2, 3, 4, 5, 6, 7, 8], 1e-10));
ok("roots(p, 'all') (console only: complex numbers are refused in equations): the complex pair i, -i as well", (() => { const a = math.evaluate(`roots([${mul([1, 0, 1], rp([1, 2]))}], 'all')`).toArray(); const c = a.filter(x => typeof x === 'object'); return a.length === 4 && c.length === 2 && c.every(x => Math.abs(x.re) < 1e-12 && near(Math.abs(x.im), 1, 1e-12)); })());
ok("roots(p, 'all') in equations: refused as complex", /complex number/.test(err(`x_ = roots([1, 0, 1], 'all')`) || ''));
ok('a double root (x - 1)^2: both within 1e-7 (sqrt of the rounding error, as for any method)', close(arr('roots([1, -2, 1])'), [1, 1], 1e-7));
ok('zero roots and leading zeros: roots([0, 2, 0, -8, 0]) = -2, 0, 2', close(arr('roots([0, 2, 0, -8, 0])'), [-2, 0, 2], 1e-14));
ok('x^3 - 1: one real root', close(arr('roots([1, 0, 0, -1])'), [1], 1e-14));
ok("Wilkinson's degree-20 polynomial: 20 real roots near 1 ... 20 (within 0.01: its coefficients do not fit in doubles exactly)", close(arr(`roots([${rp([...Array(20).keys()].map(k => k + 1))}])`), [...Array(20).keys()].map(k => k + 1), 0.01));
ok('no real roots: a message pointing to roots(p, \'all\')', /no real roots; roots\(p, 'all'\)/.test(err('x_ = roots([1, 0, 1])') || ''));
s = run(`p = 1\nx = roots([1, -5, 6])[2]`).st;
ok('an element of roots() in equations: roots([1, -5, 6])[2] = 3', near(s.x, 3, 1e-14));
ok('factorialln(1000) = ln(1000!) = 5912.128178488163', near(v('factorialln(1000)'), 5912.128178488163, 1e-14));
ok('factorialln(n) = ln(n!) for n = 0, 5, 20', near(v('factorialln(0)'), 0, 1e-15) && near(v('factorialln(5)'), Math.log(120), 1e-14) && near(v('factorialln(20)'), Math.log(2432902008176640000), 1e-14));
// ---- regression statistics: Montgomery and Runger, Applied Statistics and Probability for Engineers, Example 12-1 (wire bonds)
{
  const Y = [9.95, 24.45, 31.75, 35.00, 25.02, 16.86, 14.38, 9.60, 24.35, 27.50, 17.08, 37.00, 41.95, 11.66, 21.65, 17.89, 69.00, 10.30, 34.93, 46.59, 44.88, 54.12, 56.63, 22.13, 21.15];
  const X1 = [2, 8, 11, 10, 8, 4, 2, 2, 9, 8, 4, 11, 12, 2, 4, 4, 20, 1, 10, 15, 15, 16, 17, 6, 5];
  const X2 = [50, 110, 120, 550, 295, 200, 375, 52, 100, 300, 412, 400, 500, 360, 205, 400, 600, 585, 540, 250, 290, 510, 590, 100, 400];
  const XM = '[' + Y.map((_, i) => `1, ${X1[i]}, ${X2[i]}`).join('; ') + ']', R = (w) => v(`regress([${Y}], ${XM}${w})`), A = (w) => { const r = R(w); return r._data || r; };
  ok('regress: b = 2.26379, 2.74427, 0.01253 (book)', close(A(''), [2.26379, 2.74427, 0.01253], 4e-5));
  ok('regress: standard errors 1.06007, 0.09352, 0.00280; t = 2.14, 29.34, 4.48 (book)', close(A(", 'stderr'"), [1.06007, 0.09352, 0.00280], 1e-5) && close(A(", 'tstat'"), [2.14, 29.34, 4.48], 6e-3));
  ok('regress: R^2 = 0.9811, adjusted 0.9794, sigma^2 = 5.2352 (book)', near(R(", 'r2'"), 0.9811, 1e-4) && near(R(", 'adjr2'"), 0.9794, 1e-4) && near(R(", 'rmse'") ** 2, 5.2352, 1e-4));
  ok('regress: 95 % interval of the wire-length coefficient 2.55029 to 2.93825 (book, Example 12-7)', (() => { const c = A(", 'ci'"); return near(c[1][0], 2.55029, 2e-5) && near(c[1][1], 2.93825, 2e-5); })());
  const pv = A(", 'pvalue'"), t = A(", 'tstat'");
  ok('p-values agree with 2 tcdf(-|t|, 22); all three terms significant at 5 %', pv.every((p, i) => near(p, 2 * v(`tcdf(${-Math.abs(t[i])}, 22)`), 1e-12)) && pv.every(p => p < 0.05), pv);
  ok("'summary': rows of value, standard error, t, p", (() => { const s = A(", 'summary'"); return s.length === 3 && s[1].length === 4 && near(s[1][0], 2.74427, 2e-5) && near(s[2][3], pv[2], 1e-14); })());
  const res = A(", 'resid'"), fit = A(", 'fit'");
  ok("'resid' and 'fit': y = fit + resid, residuals sum to 0 with a constant term", res.every((r, i) => near(fit[i] + r, Y[i], 1e-12)) && Math.abs(res.reduce((a, b) => a + b, 0)) < 1e-9);
  ok("'ci' at another level: 99 % wider than 95 %", (() => { const a = A(", 'ci'"), b = A(", 'ci', 0.99"); return b[1][1] - b[1][0] > a[1][1] - a[1][0]; })());
  ok('regress with X a vector: the fit through the origin, b = sum(x y)/sum(x^2)', near(arr('regress([1, 2, 3.1], [1, 2, 3])')[0], (1 + 4 + 9.3) / 14, 1e-14));
  ok('polyfit and regress give the same p-values for a straight line', close(arr("polyfit([0, 1, 2, 3, 4], [1.1, 2.9, 5.2, 6.8, 9.1], 1, 'pvalue')"), arr("regress([1.1, 2.9, 5.2, 6.8, 9.1], [0, 1; 1, 1; 2, 1; 3, 1; 4, 1], 'pvalue')"), 1e-12));
  ok("lsqfit 'resid' are the model's residuals at the optimum", close(arr(`lsqfit('a*exp(-b*x)', [0, 1, 2, 3], [2, 2*exp(-0.5), 2*exp(-1), 2*exp(-1.5)], 'a b', [1, 1], 'resid')`), [0, 0, 0, 0], 1e-9));
  ok('messages: rows of X, the level, the last argument', /X has 2 rows/.test(err('x_ = regress([1, 2, 3], [1, 0; 1, 1])') || '') && /between 0 and 1/.test(err("x_ = regress([1, 2, 3.5], [1; 2; 3], 'ci', 95)") || '') && /'summary'/.test(err("x_ = regress([1, 2, 3.5], [1; 2; 3], 'p-value')") || ''));
  ok('statistics need more points than parameters', /need more points than parameters/.test(err("x_ = regress([1, 2], [1, 0; 1, 1], 'pvalue')") || ''));
}
// ---- find, any, all, eye, numel, length, flip, cumprod, normpdf
ok('find: 1-based places of the nonzero entries', close(arr('find([3, 0, 5, 0, 1])'), [1, 3, 5], 1e-12) && close(arr('find([1, 5, 2, 7] > 3)'), [2, 4], 1e-12));
ok('any and all', v('any([1, 5, 2] > 4)') === true && v('any([1, 5, 2] > 9)') === false && v('all([1, 5, 2] > 0)') === true && v('all([1, 5, 2] > 1)') === false);
ok('eye(2) is the identity; eye(0) is refused', JSON.stringify(arr('eye(2)')) === '[[1,0],[0,1]]' && /whole number/.test(err('x_ = eye(0)') || ''));
ok('numel counts all the entries, length the longest side', v('numel([1, 2, 3; 4, 5, 6])') === 6 && v('length([1, 2, 3; 4, 5, 6])') === 3 && v('length([4, 5])') === 2 && v('length(7)') === 1);
ok('flip reverses a vector, a matrix top to bottom', close(arr('flip([1, 2, 3])'), [3, 2, 1], 1e-12) && JSON.stringify(arr('flip([1, 2; 3, 4])')) === '[[3,4],[1,2]]');
ok('cumprod', close(arr('cumprod([1, 2, 3, 4])'), [1, 2, 6, 24], 1e-12));
ok('normpdf: 1/sqrt(2 pi) at 0, and with mu and sigma', near(v('normpdf(0)'), 0.3989422804014327, 1e-14) && near(v('normpdf(3, 3, 2)'), 0.3989422804014327 / 2, 1e-14) && /sigma must be positive/.test(err('x_ = normpdf(0, 0, -1)') || ''));
ok('the names stay free as variables', run('find = 3\nany = 2\nlength = 4 [m]\ny = find*any*length').st.y === 24);
done();
