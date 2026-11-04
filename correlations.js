// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Heat transfer and fluid flow correlations, as given in F. P. Incropera, D. P. DeWitt, T. L. Bergman, A. S. Lavine,
// Fundamentals of Heat and Mass Transfer, 6th ed., Wiley, 2007 (equation and table numbers below), plus the Colebrook
// equation (the basis of the Moody chart) and the Clift-Gauvin sphere drag correlation, which the book gives only as graphs.
// Also the generalized compressibility functions of Lee and Kesler (lk_*) and the compressible flow functions of a perfect gas.
// Arguments and results are dimensionless, except lc_cylinders and ls_spheres (lengths, in the units of the radii) and the
// boiling and condensation correlations, whose arguments and results are SI quantities (unit listed with each argument). Outside a correlation's stated range the value is still computed and
// a warning is shown, for the solution only (the solver may pass outside on the way), as with interpolate().

const CORRELATIONS = (() => {
    const pow = Math.pow;
    // Constant tables, as printed
    const HILPERT = [[0.4, 4, 0.989, 0.330], [4, 40, 0.911, 0.385], [40, 4000, 0.683, 0.466], [4000, 40000, 0.193, 0.618], [40000, 400000, 0.027, 0.805]];      // Table 7.2
    const ZUK_CYL = [[1, 40, 0.75, 0.4], [40, 1000, 0.51, 0.5], [1e3, 2e5, 0.26, 0.6], [2e5, 1e6, 0.076, 0.7]];                                               // Table 7.4
    const C2_BANK = {
        aligned: [[1, 0.70], [2, 0.80], [3, 0.86], [4, 0.90], [5, 0.92], [7, 0.95], [10, 0.97], [13, 0.98], [16, 0.99], [20, 1]],              // Table 7.8
        staggered: [[1, 0.64], [2, 0.76], [3, 0.84], [4, 0.89], [5, 0.92], [7, 0.95], [10, 0.97], [13, 0.98], [16, 0.99], [20, 1]]
    };
    const MORGAN = [[1e-10, 1e-2, 0.675, 0.058], [1e-2, 1e2, 1.02, 0.148], [1e2, 1e4, 0.850, 0.188], [1e4, 1e7, 0.480, 0.250], [1e7, 1e12, 0.125, 0.333]];   // Table 9.1
    const CHANNEL = { symmetric_t: [576, 2.87, false], symmetric_q: [48, 2.51, true], asymmetric_t: [144, 2.87, false], asymmetric_q: [24, 2.51, true] };   // Table 9.3: C1, C2, isoflux
    const G0 = 9.80665;   // standard gravity, the default g of the boiling and condensation correlations
    const CSF = {
        water_copper_scored: [0.0068, 1.0], water_copper_polished: [0.0128, 1.0], water_steel_etched: [0.0133, 1.0], water_steel_polished: [0.0132, 1.0],   // Table 10.1: C_sf, n
        water_steel_ground: [0.0080, 1.0], water_brass: [0.0060, 1.0], water_nickel: [0.006, 1.0], water_platinum: [0.0130, 1.0],
        pentane_copper_polished: [0.0154, 1.7], pentane_copper_lapped: [0.0049, 1.7], benzene_chromium: [0.0101, 1.7], ethanol_chromium: [0.0027, 1.7]
    };
    const GSF = { kerosene: 0.488, r134a: 1.63, r152a: 1.10, water: 1.00, stainless: 1 };   // Table 10.2
    const DUCT = {   // Table 8.1: b/a, Nu (uniform q''), Nu (uniform Ts), f Re
        rectangle: [[1.0, 3.61, 2.98, 57], [1.43, 3.73, 3.08, 59], [2.0, 4.12, 3.39, 62], [3.0, 4.79, 3.96, 69], [4.0, 5.33, 4.44, 73], [8.0, 6.49, 5.60, 82]],
        circle: [4.36, 3.66, 64], plates: [8.23, 7.54, 96], plates_insulated: [5.39, 4.86, 96], triangle: [3.11, 2.49, 53]
    };
    const ANNULUS = [[0.05, 17.46, 4.06], [0.10, 11.56, 4.11], [0.25, 7.37, 4.23], [0.50, 5.74, 4.43], [1.00, 4.86, 4.86]];   // Table 8.2: Di/Do, Nu_i, Nu_o

    // Counterflow periodic regenerator (eps_regenerator). Side 1 has C_min = 1, side 2 C_max = 1/C_r; the matrix has C_matrix
    // = Cr_star. In each period the gas crosses N cells, each with its matrix temperature w uniform: the gas leaves a cell at
    // w + (T_in - w) exp(-NTU_j/N), and the cell gains (T_in - T_out) (in units of the gas C) times its dwell time, so that
    // dw/d(eta) = N (T_in - T_out)/Cr*_j over the period's dimensionless time eta, integrated with the trapezoidal rule
    // (second order, stable at any step) in M steps. Cycles repeat until the matrix profile repeats (to 1e-13), with Aitken
    // extrapolation along the slowest mode; results on N = M = 64 and 128 are combined by Richardson extrapolation.
    // Hot gas enters at 1 at cell 1, cold gas at 0 at cell N. The last periodic profile of each grid is kept as the next start.
    const regenStart = {};
    const regenGrid = (NTUo, Cr, Crs, hAs, N) => {
        const hA1 = NTUo * (1 + hAs), hA2 = hA1 / hAs, M = N, dx = 1 / N, dt = 1 / M;
        const sides = [[hA1, Crs, 1, false], [hA2 * Cr, Crs * Cr, 0, true]];   // NTU_j = hA_j/C_j, Cr*_j = C_matrix/C_j, inlet, reversed
        let w = regenStart[N] && regenStart[N].length === N ? Float64Array.from(regenStart[N]) : Float64Array.from({ length: N }, (_, i) => 1 - (i + 0.5) / N);
        const qo = new Float64Array(N), out = [0, 0];
        let dprev = null;
        for (let cyc = 0; ; cyc++) {
            if (cyc > 20000) throw new Error('eps_regenerator(): the periodic state was not reached in 20000 cycles');
            const w0 = Float64Array.from(w);
            for (let s = 0; s < 2; s++) {
                const [ntu, crs, Tin, rev] = sides[s], b = 1 - Math.exp(-ntu * dx), k = dt / (crs * dx);
                let T = Tin;
                for (let j = 0; j < N; j++) { const i = rev ? N - 1 - j : j; qo[i] = (T - w[i]) * b; T -= qo[i]; }
                let sum = 0, Tprev = T;
                for (let n = 0; n < M; n++) {
                    T = Tin;
                    for (let j = 0; j < N; j++) {
                        const i = rev ? N - 1 - j : j, wn = (w[i] + k / 2 * (qo[i] + b * T)) / (1 + k * b / 2), qn = (T - wn) * b;
                        w[i] = wn; qo[i] = qn; T -= qn;
                    }
                    sum += (Tprev + T) / 2; Tprev = T;
                }
                out[s] = sum / M;
            }
            let d = 0; const dv = new Float64Array(N);
            for (let i = 0; i < N; i++) { dv[i] = w[i] - w0[i]; d = Math.max(d, Math.abs(dv[i])); }
            if (d < 1e-13) break;
            if (dprev && cyc % 3 === 2) {
                let a = 0, b2 = 0; for (let i = 0; i < N; i++) { a += dv[i] * dprev[i]; b2 += dprev[i] * dprev[i]; }
                const r = a / b2; if (r > 0 && r < 0.999) for (let i = 0; i < N; i++) w[i] += dv[i] * r / (1 - r);
                dprev = null;
            } else dprev = dv;
        }
        regenStart[N] = w;
        return ((1 - out[0]) + out[1] / Cr) / 2;   // the hot and cold energy balances agree at the periodic state; average them
    };
    const regenerator = (NTUo, Cr, Crs, hAs) => {
        if (NTUo === 0) return 0;
        if (Crs === 0) return 0;
        const e1 = regenGrid(NTUo, Cr, Crs, hAs, 64), e2 = regenGrid(NTUo, Cr, Crs, hAs, 128);
        return e2 + (e2 - e1) / 3;
    };

    // ---------------- Special functions. Integer-order Bessel functions from their integral representations, evaluated by
    // the trapezoidal rule, which converges exponentially for these periodic (J, I) or doubly decaying (K) integrands:
    //   J_n(x) = (1/2pi) int_0^2pi cos(n t - x sin t) dt,  I_n(x) = (1/2pi) int_0^2pi exp(x cos t) cos(n t) dt,
    //   K_n(x) = int_0^inf exp(-x cosh t) cosh(n t) dt.  Accurate to a few units in the 15th digit.
    const besselJ = (n, x) => {
        if (n < 0) return (n % 2 ? -1 : 1) * besselJ(-n, x);
        const M = 2 * Math.ceil((Math.abs(x) + n) / 2) + 64; let s = 0;
        for (let k = 0; k < M; k++) { const t = 2 * Math.PI * k / M; s += Math.cos(n * t - x * Math.sin(t)); }
        return s / M;
    };
    const besselI = (n, x) => {
        n = Math.abs(n); if (x === 0) return n === 0 ? 1 : 0;
        if (x < 0) return (n % 2 ? -1 : 1) * besselI(n, -x);
        if (x < 0.5) { let term = pow(x / 2, n) / gammaInt(n + 1), s = term; for (let k = 1; k < 30; k++) { term *= (x * x / 4) / (k * (k + n)); s += term; } return s; }
        const M = 2 * Math.ceil(x + n / 2) + 64; let s = 0;   // scaled by exp(-x) inside the sum to keep large x finite
        for (let k = 0; k < M; k++) { const t = 2 * Math.PI * k / M; s += Math.exp(x * (Math.cos(t) - 1)) * Math.cos(n * t); }
        return s / M * Math.exp(x);
    };
    const besselK = (n, x) => {
        n = Math.abs(n); if (!(x > 0)) return Infinity;
        const h = 0.05, tmax = Math.acosh(Math.max(745 / x, 1)) + 1; let s = Math.exp(-x) / 2;
        for (let t = h; t < tmax; t += h) s += Math.exp(-x * Math.cosh(t)) * Math.cosh(n * t);
        return s * h;
    };
    const gammaInt = (m) => { let g = 1; for (let k = 2; k < m; k++) g *= k; return g; };   // (m - 1)!
    // erf and erfcx(x) = exp(x^2) erfc(x): Taylor series below 2, continued fraction (Lentz) above
    const erfS = (x) => { let term = x, s = x; for (let k = 1; k < 200; k++) { term *= -x * x / k; const d = term / (2 * k + 1); s += d; if (Math.abs(d) < 1e-17 * Math.abs(s)) break; } return 2 / Math.sqrt(Math.PI) * s; };
    const erfcx = (x) => {
        if (x < 2) return Math.exp(x * x) * (1 - erfS(x));
        let f = x, C = x, D = 0;   // erfc(x) = exp(-x^2)/sqrt(pi) / (x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + ...)))))
        for (let k = 1; k < 500; k++) { const a = k / 2; D = x + a * D; D = 1 / D; C = x + a / C; const dl = C * D; f *= dl; if (Math.abs(dl - 1) < 1e-16) break; }
        return 1 / (Math.sqrt(Math.PI) * f);
    };
    const erfc = (x) => x < 0 ? 2 - erfc(-x) : x < 2 ? 1 - erfS(x) : Math.exp(-x * x) * erfcx(x);

    // ---------------- Radiation (Chapter 12): Planck's law with the CODATA 2018 constants
    const C1R = 2 * Math.PI * 6.62607015e-34 * 299792458 ** 2, C2R = 6.62607015e-34 * 299792458 / 1.380649e-23;   // W m^2, m K
    const fBlack = (lT) => {   // F(0 -> lambda T), lambda T in m K
        if (!(lT > 0)) return 0;
        const z = C2R / lT;
        if (z > 0.5) {   // (15/pi^4) sum exp(-n z)/n (z^3 + 3 z^2/n + 6 z/n^2 + 6/n^3)
            let s = 0; for (let n = 1; n < 2000; n++) { const t = Math.exp(-n * z) / n * (z ** 3 + 3 * z * z / n + 6 * z / (n * n) + 6 / n ** 3); s += t; if (t < 1e-18 * s) break; }
            return 15 / Math.PI ** 4 * s;
        }
        // small z: 1 - (15/pi^4) int_0^z x^3/(e^x - 1) dx, with x^3/(e^x - 1) = sum B_k x^(k+2)/k! (Bernoulli numbers)
        const B = [1, -1 / 2, 1 / 6, 0, -1 / 30, 0, 1 / 42, 0, -1 / 30, 0, 5 / 66, 0, -691 / 2730, 0, 7 / 6, 0, -3617 / 510];
        let s = 0, fact = 1; for (let k = 0; k < B.length; k++) { if (k) fact *= k; s += B[k] * z ** (k + 3) / ((k + 3) * fact); }
        return 1 - 15 / Math.PI ** 4 * s;
    };

    // ---------------- Transient conduction (Chapter 5): eigenvalues, coefficients and the full series
    const root = (g, a, b) => {   // Illinois false position on a bracket [a, b] with a sign change
        let fa = g(a), fb = g(b), side = 0;
        if (fa === 0) return a; if (fb === 0) return b;
        for (let k = 0; k < 200; k++) {
            const c = (a * fb - b * fa) / (fb - fa), fc = g(c);
            if (fc === 0 || Math.abs(b - a) < 4e-16 * Math.abs(c)) return c;
            if (fc * fb < 0) { a = b; fa = fb; if (side === -1) fb /= 2; side = -1; } else { if (side === 1) fa /= 2; side = 1; }
            b = c; fb = fc;
            if (Math.abs(b - a) < 2e-16 * Math.abs(b)) return b;
        }
        return b;
    };
    const besselZero = (nu, n) => {   // n-th positive zero of J_nu (nu = 0, 1): McMahon's estimate, then Newton
        const b = (n + nu / 2 - 1 / 4) * Math.PI, mu = 4 * nu * nu;
        let x = b - (mu - 1) / (8 * b) - 4 * (mu - 1) * (7 * mu - 31) / (3 * (8 * b) ** 3);
        for (let k = 0; k < 20; k++) { const d = besselJ(nu, x) / (nu ? besselJ(0, x) - besselJ(1, x) / x : -besselJ(1, x)); x -= d; if (Math.abs(d) < 1e-15 * x) break; }
        return x;
    };
    const GEO = {
        wall: {
            eq: (z, Bi) => z * Math.sin(z) - Bi * Math.cos(z), br: (n) => [(n - 1) * Math.PI, (n - 1) * Math.PI + Math.PI / 2],
            C: (z) => 4 * Math.sin(z) / (2 * z + Math.sin(2 * z)), X: (z, x) => Math.cos(z * x), Q: (z) => Math.sin(z) / z
        },
        cylinder: {
            eq: (z, Bi) => z * besselJ(1, z) - Bi * besselJ(0, z), br: (n) => [n === 1 ? 0 : besselZero(1, n - 1), besselZero(0, n)],
            C: (z) => 2 / z * besselJ(1, z) / (besselJ(0, z) ** 2 + besselJ(1, z) ** 2), X: (z, x) => besselJ(0, z * x), Q: (z) => 2 * besselJ(1, z) / z
        },
        sphere: {
            eq: (z, Bi) => (1 - Bi) * Math.sin(z) - z * Math.cos(z), br: (n) => [n === 1 ? 1e-300 : (n - 1) * Math.PI, n * Math.PI],
            C: (z) => 4 * (Math.sin(z) - z * Math.cos(z)) / (2 * z - Math.sin(2 * z)), X: (z, x) => x === 0 ? 1 : Math.sin(z * x) / (z * x), Q: (z) => 3 * (Math.sin(z) - z * Math.cos(z)) / z ** 3
        },
    };
    const eigenCache = new Map();
    const eigen = (geo, Bi, n) => {   // the n-th eigenvalue zeta_n and coefficient C_n, cached per geometry and Bi
        const key = geo + ':' + Bi; let list = eigenCache.get(key);
        if (!list) { list = []; if (eigenCache.size > 50) eigenCache.clear(); eigenCache.set(key, list); }
        const G = GEO[geo];
        while (list.length < n) {
            const k = list.length + 1, [a, b] = G.br(k);
            const z = Bi === 0 ? (geo === 'cylinder' ? (k === 1 ? 0 : besselZero(1, k - 1)) : (k - 1) * Math.PI + (geo === 'sphere' && k > 1 ? 0 : 0)) : root((t) => G.eq(t, Bi), a, b);
            list.push([z, z === 0 ? 1 : G.C(z)]);
        }
        return list[n - 1];
    };
    const series = (geo, Bi, Fo, fn) => {   // sum over n of C_n exp(-zeta_n^2 Fo) fn(zeta_n), until the terms are negligible
        if (Bi === 0) return { s: fn(0) === undefined ? 1 : null, n: 1 };
        let s = 0, n = 1;
        for (; n <= 400; n++) {
            const [z, Cn] = eigen(geo, Bi, n), t = Cn * Math.exp(-z * z * Fo) * fn(z);
            s += t;
            if (n > 2 && Math.exp(-z * z * Fo) < 1e-16) break;
        }
        return { s, n };
    };


    // Table 5.2 series: sum over n of exp(-l_n^2 Fo)/l_n^(2p), l_n the eigenvalues of the Dirichlet (p = 0) or Neumann (p = 1) problem
    const tsumCache = {};
    const lam = (g, p, n) => {
        const key = g + p; const L = tsumCache[key] || (tsumCache[key] = []);
        while (L.length < n) {
            const k = L.length + 1;
            L.push(g === 'wall' ? (p ? k * Math.PI : (k - 0.5) * Math.PI) : g === 'cylinder' ? besselZero(p ? 1 : 0, k)
                : (p ? root((x) => Math.sin(x) - x * Math.cos(x), k * Math.PI + 1e-9, (k + 0.5) * Math.PI - 1e-9) : k * Math.PI));
        }
        return L[n - 1];
    };
    const tsum = (g, Fo, p) => { let s = 0; for (let n = 1; n <= 5000; n++) { const l = lam(g, p, n), t = Math.exp(-l * l * Fo) / l ** (2 * p); s += t; if (Math.exp(-l * l * Fo) < 1e-17) break; } return s; };
    const shapeWarn = (name, L, D) => { if (L < 4 * D) Corr.warn(name, `L = ${Corr.fmt(L)} is not much larger than ${Corr.fmt(D)}; the formula assumes a long cylinder (it neglects the ends)`); };
    // ---------------- Fins (Chapter 3): ratio N(a)/N(b) of cosh + p sinh, and sinh ratios, without overflow (a, b >= 0)
    const chRatio = (a, b, p) => Math.exp(a - b) * ((1 + p) + Math.exp(-2 * a) * (1 - p)) / ((1 + p) + Math.exp(-2 * b) * (1 - p));
    const shRatio = (a, b) => b === 0 ? 1 : Math.exp(a - b) * (1 - Math.exp(-2 * a)) / (1 - Math.exp(-2 * b));
    const lin = (tab, x, col) => {   // linear interpolation in a table sorted by its first column (clamped at the ends)
        if (x <= tab[0][0]) return tab[0][col];
        for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) return tab[i - 1][col] + (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]) * (tab[i][col] - tab[i - 1][col]);
        return tab[tab.length - 1][col];
    };
    const band = (tab, Re) => tab.find(r => Re >= r[0] && Re < r[1]) || (Re < tab[0][0] ? tab[0] : tab[tab.length - 1]);
    const usl_local = (Nu0, r, lam) => lam ? Nu0 / pow(1 - pow(r, 3 / 4), 1 / 3) : Nu0 / pow(1 - pow(r, 9 / 10), 1 / 9);         // Eqs. 7.42, 7.43
    const usl_avg = (Nu0, r, p) => r === 0 ? Nu0 : Nu0 / (1 - r) * pow(1 - pow(r, (p + 1) / (p + 2)), p / (p + 1));               // Eq. 7.44
    const petukhov = (Re) => pow(0.790 * Math.log(Re) - 1.64, -2);
    const mode = (s, opts, fn) => { const k = String(s).toLowerCase(); if (!opts.includes(k)) throw new Error(`${fn}(): '${s}' should be one of ${opts.map(o => `'${o}'`).join(', ')}`); return k; };

    // ---------------- Generalized compressibility: B. I. Lee and M. G. Kesler, AIChE J. 21 (1975) 510, Table 1 and Eqs. 1-9.
    // A modified BWR equation in the reduced volume V = Pc v/(R Tc) (here its inverse, rho = 1/V), for the simple fluid
    // (omega = 0) and the reference fluid (n-octane, omega_r = 0.3978); a fluid of acentric factor omega takes
    // X = X0 + (omega/omega_r)(Xr - X0) for Z, the departures and ln(phi). The coefficients agree in Cantera (tpx/lk.cpp),
    // pychemqt, Borgnakke and Sonntag (Fundamentals of Thermodynamics, App. D) and the AVEVA manual.
    const LK = [
        { b: [0.1181193, 0.265728, 0.154790, 0.030323], c: [0.0236744, 0.0186984, 0.0, 0.042724], d: [0.155488e-4, 0.623689e-4], beta: 0.65392, gamma: 0.060167 },
        { b: [0.2026579, 0.331511, 0.027655, 0.203488], c: [0.0313385, 0.0503618, 0.016901, 0.041577], d: [0.48736e-4, 0.0740336e-4], beta: 1.226, gamma: 0.03754 }];
    const LK_OMEGA_R = 0.3978;
    const lkProps = (f, Tr, r) => {   // Z, ln(phi), (h - h_ig)/(R Tc), (s - s_ig)/R at reduced density r = 1/V
        const { b, c, d, beta, gamma } = f, t = 1 / Tr;
        const B = b[0] - b[1] * t - b[2] * t * t - b[3] * t ** 3, C = c[0] - c[1] * t + c[2] * t ** 3, D = d[0] + d[1] * t;
        const r2 = r * r, ex = Math.exp(-gamma * r2);
        const Z = 1 + B * r + C * r2 + D * r ** 5 + c[3] * t ** 3 * r2 * (beta + gamma * r2) * ex;
        const E = c[3] * t ** 3 / (2 * gamma) * (beta + 1 - (beta + 1 + gamma * r2) * ex);
        return {
            Z, lnphi: Z - 1 - Math.log(Z) + B * r + C * r2 / 2 + D * r ** 5 / 5 + E,
            h: Tr * (Z - 1 - (b[1] + 2 * b[2] * t + 3 * b[3] * t * t) * t * r - (c[1] - 3 * c[2] * t * t) * t * r2 / 2 + d[1] * t * r ** 5 / 5 + 3 * E),
            s: Math.log(Z) - (b[0] + b[2] * t * t + 2 * b[3] * t ** 3) * r - (c[0] - 2 * c[2] * t ** 3) * r2 / 2 - d[0] * r ** 5 / 5 + 2 * E
        };
    };
    const lkRoots = (f, Tr, Pr) => {   // reduced densities where Tr rho Z(rho) = Pr: [vapor (smallest), liquid (largest)]
        if (Pr === 0) return [0, 0];
        const g = (r) => Tr * r * lkProps(f, Tr, r).Z - Pr, h = 0.02, found = [];
        let a = 0, ga = -Pr;
        for (let i = 1; i < 1e5; i++) {
            const bb = i * h, gb = g(bb);
            if (ga < 0 !== gb < 0 || gb === 0) {
                let lo = a, hi = bb, glo = ga;
                for (let it = 0; it < 200 && hi - lo > 2e-16 * hi; it++) { const m = (lo + hi) / 2, gm = g(m); if (gm < 0 === glo < 0) { lo = m; glo = gm; } else hi = m; }
                found.push((lo + hi) / 2);
            }
            if (gb > 0 && bb > 20 && i * h > 2 * (found[found.length - 1] || 0)) break;   // past the liquid root: the pressure only rises from here
            a = bb; ga = gb;
        }
        if (!found.length) throw new Error(`no solution of the Lee-Kesler equation at Tr = ${Tr}, Pr = ${Pr}`);
        return [found[0], found[found.length - 1]];
    };
    let lkLast = null;
    const leeKesler = (fn, Tr, Pr, omega = 0, phase) => {
        if (!(Tr > 0)) throw new Error(`${fn}(): Tr = ${Tr} must be positive`);
        const ph = phase === undefined ? 'auto' : mode(phase, ['liquid', 'vapor'], fn);
        const key = [Tr, Pr, omega, ph].join();
        if (lkLast && lkLast.key === key) return lkLast.v;
        const w = omega / LK_OMEGA_R, mix = (p0, pr) => { const o = {}; for (const k in p0) o[k] = p0[k] + w * (pr[k] - p0[k]); return o; };
        const R = LK.map(f => lkRoots(f, Tr, Pr));
        const at = (i) => mix(lkProps(LK[0], Tr, R[0][i]), lkProps(LK[1], Tr, R[1][i]));   // i = 0 vapor, 1 liquid
        let v;
        if (ph === 'vapor') v = at(0);
        else if (ph === 'liquid') v = at(1);
        else { const V = at(0), L = at(1); v = L.lnphi < V.lnphi ? L : V; }   // the stable phase: the lower Gibbs energy
        lkLast = { key, v };
        return v;
    };

    // ---------------- Compressible flow of a perfect gas, specific heat ratio k (Anderson, Modern Compressible Flow; the
    // tables of Cengel and Boles, App. A-32 to A-35; NACA Report 1135). Fanno flow uses the Darcy friction factor.
    // Inverses by bisection on M (subsonic) or 1/M (supersonic), to full precision, so the branch is the one asked for.
    const kCheck = (fn, k) => { if (!(k > 1)) throw new Error(`${fn}(): k = ${k} must be above 1`); };
    const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
    const pick = (fn, s, table) => {
        const f = table[norm(s)];
        if (!f) throw new Error(`${fn}(): '${s}' should be one of ${Object.keys(table).map(o => `'${table[o].label}'`).join(', ')}`);
        return f;
    };
    const tab = (list) => Object.fromEntries(list.map(([label, f, inv]) => [norm(label), Object.assign(f, { label, inv })]));   // inv: 'all', 'branch' or a reason it cannot be inverted
    const ISEN = tab([
        ['T/T0', (M, k) => 1 / (1 + (k - 1) / 2 * M * M), 'all'],
        ['P/P0', (M, k) => pow(1 + (k - 1) / 2 * M * M, -k / (k - 1)), 'all'],
        ['rho/rho0', (M, k) => pow(1 + (k - 1) / 2 * M * M, -1 / (k - 1)), 'all'],
        ['A/A*', (M, k) => pow(2 / (k + 1) * (1 + (k - 1) / 2 * M * M), (k + 1) / (2 * (k - 1))) / M, 'branch'],
        ['M*', (M, k) => M * Math.sqrt((k + 1) / (2 + (k - 1) * M * M)), 'all']]);
    const nsRho = (M, k) => (k + 1) * M * M / (2 + (k - 1) * M * M), nsP = (M, k) => 1 + 2 * k / (k + 1) * (M * M - 1);
    const nsM2 = (M, k) => Math.sqrt((M * M + 2 / (k - 1)) / (2 * k / (k - 1) * M * M - 1));
    const SHOCK = tab([
        ['M2', nsM2, 'all'],
        ['P2/P1', nsP, 'all'],
        ['T2/T1', (M, k) => nsP(M, k) / nsRho(M, k), 'all'],
        ['rho2/rho1', nsRho, 'all'],
        ['P02/P01', (M, k) => pow(nsRho(M, k), k / (k - 1)) * pow(nsP(M, k), -1 / (k - 1)), 'all'],
        ['P02/P1', (M, k) => pow(1 + (k - 1) / 2 * nsM2(M, k) ** 2, k / (k - 1)) * nsP(M, k), 'all']]);
    const fy = (M, k) => (2 + (k - 1) * M * M) / (k + 1);   // 1 + (k - 1)/2 M^2, over its value at M = 1
    const FANNO = tab([
        ['T/T*', (M, k) => 1 / fy(M, k), 'all'],
        ['P/P*', (M, k) => 1 / (M * Math.sqrt(fy(M, k))), 'all'],
        ['rho/rho*', (M, k) => Math.sqrt(fy(M, k)) / M, 'all'],
        ['V/V*', (M, k) => M / Math.sqrt(fy(M, k)), 'all'],
        ['P0/P0*', (M, k) => pow(fy(M, k), (k + 1) / (2 * (k - 1))) / M, 'branch'],
        ['fL*/D', (M, k) => (1 - M * M) / (k * M * M) + (k + 1) / (2 * k) * Math.log(M * M / fy(M, k)), 'branch']]);
    const RAYL = tab([
        ['T/T*', (M, k) => (M * (1 + k) / (1 + k * M * M)) ** 2, 'it is not single-valued in subsonic flow (its maximum is at M = 1/sqrt(k)); use T0/T0*, P/P*, V/V* or rho/rho*'],
        ['P/P*', (M, k) => (1 + k) / (1 + k * M * M), 'all'],
        ['rho/rho*', (M, k) => (1 + k * M * M) / ((1 + k) * M * M), 'all'],
        ['V/V*', (M, k) => (1 + k) * M * M / (1 + k * M * M), 'all'],
        ['T0/T0*', (M, k) => (k + 1) * M * M * (2 + (k - 1) * M * M) / (1 + k * M * M) ** 2, 'branch'],
        ['P0/P0*', (M, k) => (1 + k) / (1 + k * M * M) * pow(fy(M, k), k / (k - 1)), 'branch']]);
    const flow = (fn, table, s, M, k, minM = 0) => {
        kCheck(fn, k);
        if (M < minM) throw new Error(`${fn}(): M1 = ${M} must be at least 1 (a normal shock needs supersonic flow ahead of it)`);
        const f = pick(fn, s, table), v = f(M, k);
        if (!Number.isFinite(v)) throw new Error(`${fn}(): ${f.label} is infinite at M = 0`);
        return v;
    };
    const machFrom = (fn, f, k, value, branches, what) => {   // M on the given branches where f(M, k) = value
        const fmt = (x) => String(+x.toPrecision(5));
        const ends = branches.map(([sup]) => { const e = f(sup ? 1e12 : 1e-12, k), o = f(1, k); return [Math.min(e, o), Math.max(e, o)]; });
        const i = branches.findIndex((b, j) => value >= ends[j][0] && value <= ends[j][1]);
        const lim = (x) => x > 1e9 ? 'infinity' : x < 1e-9 ? '0' : fmt(x);   // the ends at M = 1e-12 and 1e12 stand for the limits 0 and infinity
        if (i < 0) throw new Error(`${fn}(): ${what} = ${fmt(value)} cannot be reached; ${branches.map(([sup], j) => `${sup ? 'supersonic' : 'subsonic'} flow covers ${lim(ends[j][0])} to ${lim(ends[j][1])}`).join(', and ')}`);
        const sup = branches[i][0], M = (u) => sup ? 1 / u : u;
        let lo = 1e-12, hi = 1, glo = f(M(lo), k) - value;
        for (let it = 0; it < 300 && hi - lo > 2e-16 * hi; it++) { const m = (lo + hi) / 2, gm = f(M(m), k) - value; if (gm === 0) return M(m); if (gm < 0 === glo < 0) { lo = m; glo = gm; } else hi = m; }
        return M((lo + hi) / 2);
    };
    const branchArg = (fn, b, required, label) => {
        if (b === undefined) { if (required) throw new Error(`${fn}(): ${label} has a subsonic and a supersonic solution: add 'subsonic' or 'supersonic'`); return null; }
        return mode(b, ['subsonic', 'supersonic'], fn) === 'supersonic';
    };
    const flowMach = (fn, table, s, value, k, b) => {
        kCheck(fn, k);
        const f = pick(fn, s, table);
        if (f.inv !== 'all' && f.inv !== 'branch') throw new Error(`${fn}(): M cannot be found from ${f.label}: ${f.inv}`);
        const sup = branchArg(fn, b, f.inv === 'branch', f.label);
        return machFrom(fn, f, k, value, sup === null ? [[false], [true]] : [[sup]], f.label);
    };
    const prandtlMeyer = (M, k) => { const g = Math.sqrt((k + 1) / (k - 1)), m = Math.sqrt(M * M - 1); return g * Math.atan(m / g) - Math.atan(m); };
    const oblique = (out, M1, inKey, angle, k, br) => {   // the theta-beta-M relation, then the normal shock on Mn1 = M1 sin(beta)
        const fn = 'obliqueshock';
        kCheck(fn, k);
        if (!(M1 > 1)) throw new Error(`${fn}(): M1 = ${M1} must be above 1`);
        const mu = Math.asin(1 / M1), th = (b) => Math.atan(2 / Math.tan(b) * (M1 * M1 * Math.sin(b) ** 2 - 1) / (M1 * M1 * (k + Math.cos(2 * b)) + 2));
        const s2 = ((k + 1) / 4 * M1 * M1 - 1 + Math.sqrt((k + 1) * ((k + 1) / 16 * M1 ** 4 + (k - 1) / 2 * M1 * M1 + 1))) / (k * M1 * M1);
        const bMax = Math.asin(Math.sqrt(s2)), thMax = th(bMax), deg = (x) => String(+(x * 180 / Math.PI).toPrecision(5)) + ' deg';
        const o = norm(out);
        if (o === 'theta_max') return thMax;
        let beta;
        const ik = mode(inKey, ['theta', 'beta'], fn);
        if (ik === 'beta') {
            if (br !== undefined) throw new Error(`${fn}(): 'weak' or 'strong' applies to a given deflection theta, not to a given wave angle beta`);
            if (angle < mu * (1 - 1e-12) || angle > Math.PI / 2 * (1 + 1e-12)) throw new Error(`${fn}(): beta = ${deg(angle)} must be between the Mach angle asin(1/M1) = ${deg(mu)} and 90 deg`);
            beta = angle;
        } else {
            const strong = (br === undefined ? 'weak' : mode(br, ['weak', 'strong'], fn)) === 'strong';
            if (angle > thMax) throw new Error(`${fn}(): theta = ${deg(angle)} is above the largest deflection for M1 = ${M1}, theta_max = ${deg(thMax)}: the shock detaches`);
            let lo = strong ? bMax : mu, hi = strong ? Math.PI / 2 : bMax;
            const g = (b) => (th(b) - angle) * (strong ? -1 : 1);   // increasing on the weak side, decreasing on the strong side
            for (let it = 0; it < 200 && hi - lo > 1e-16; it++) { const m = (lo + hi) / 2; if (g(m) < 0) lo = m; else hi = m; }
            beta = (lo + hi) / 2;
        }
        const theta = ik === 'beta' ? Math.max(th(beta), 0) : angle, Mn1 = Math.max(M1 * Math.sin(beta), 1), Mn2 = nsM2(Mn1, k);
        const res = { beta: () => beta, theta: () => theta, mn1: () => Mn1, mn2: () => Mn2, m2: () => Mn2 / Math.sin(beta - theta) };
        if (res[o]) return res[o]();
        const ns = SHOCK[o];
        if (ns && o !== 'm2' && o !== 'p02/p1') return ns(Mn1, k);
        throw new Error(`${fn}(): '${out}' should be one of 'beta', 'theta', 'M2', 'Mn1', 'Mn2', 'P2/P1', 'T2/T1', 'rho2/rho1', 'P02/P01', 'theta_max'`);
    };

    // Particles (or a spray) mixed into a gas in a constant-area duct, adiabatic, no wall friction, no heat or mass transfer
    // between the phases, negligible particle volume (F. Ruiz, The adiabatic interaction of particles with a compressible
    // flow: basic mechanics, J. Propulsion and Power 16 (2000) 415-420). ms = particle/gas mass flow ratio, ML = VL/c1. Momentum and energy give a quadratic in
    // u = V2/V1; M2 is the Mach number of the mixture, with the sound speed c = (k R T/(1 + ms))^(1/2) of Wallis (1969).
    const particles = (out, M1, ML, ms, k, br, quiet) => {
        const fn = 'particleflow';
        kCheck(fn, k);
        const E0 = 1 + (k - 1) / 2 * M1 * M1, A0 = 1 + k * M1 * M1, A1 = k * M1 * ML, c0 = (k + 1) / 2 * M1 * M1, e1 = (k - 1) / 2 * ML * ML;
        const qa = A1 * A1 - 4 * c0 * e1, qb = 2 * A0 * A1 - 4 * c0 * (E0 + e1), qc = A0 * A0 - 4 * c0 * E0;   // discriminant as a quadratic in ms
        const roots = qa === 0 ? [-qc / qb] : [-1, 1].map(sg => (-qb + sg * Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa));
        const choke = Math.min(...roots.filter(r => r > 0 && Number.isFinite(r)), Infinity);
        const o = norm(out);
        if (o === 'ms_choke') { if (choke === Infinity) throw new Error(`${fn}(): with M1 = ${M1} and ML = ${ML} the particles never choke the flow`); return choke; }
        const sup = (br === undefined ? 'subsonic' : mode(br, ['subsonic', 'supersonic'], fn)) === 'supersonic';
        const Mo = A0 + A1 * ms, ab = c0 * (1 + ms), E = E0 + e1 * ms, a = (k - 1) / 2 * M1 * M1 * (1 + ms);
        let D = Mo * Mo - 4 * ab * E;
        if (D < 0 && D > -1e-12 * Mo * Mo) D = 0;   // at the choking point, within rounding
        if (D < 0) throw new Error(`${fn}(): no solution: the particles choke the flow (M2 = 1 at ms = ${+choke.toPrecision(5)})`);
        const us = [-1, 1].map(sg => (Mo + sg * Math.sqrt(D)) / (2 * ab));
        const st = us.map(u => { const th = E - a * u * u; return { u, th, M2: u * M1 * Math.sqrt((1 + ms) / th) }; }).filter(x => x.th > 0);
        const r = st.find(x => sup ? x.M2 >= 1 - 1e-9 : x.M2 <= 1 + 1e-9);
        if (!r) throw new Error(`${fn}(): there is no ${sup ? 'supersonic' : 'subsonic'} solution here` + (sup ? `: the subsonic one has M2 below ${+Math.sqrt((k - 1) / (2 * k)).toPrecision(4)}, the lowest Mach number a normal shock leaves behind, so its supersonic conjugate would need a negative temperature` : ''));
        const ds = k / (k - 1) * Math.log(r.th) - Math.log(r.th / r.u);
        if (ds < -1e-12 && Interp.notes && !quiet) Corr.warn(fn, `the ${sup ? 'supersonic' : 'subsonic'} solution lowers the entropy of the gas (ds/R = ${+ds.toPrecision(4)}): impossible in adiabatic flow`);
        const res = { m2: r.M2, 'v2/v1': r.u, 't2/t1': r.th, 'p2/p1': r.th / r.u, 'rho2/rho1': 1 / r.u, 'ds/r': ds };
        if (o in res) return res[o];
        throw new Error(`${fn}(): '${out}' should be one of 'M2', 'V2/V1', 'T2/T1', 'P2/P1', 'rho2/rho1', 'ds/R', 'ms_choke'`);
    };
    const particlesMs = (out, value, M1, ML, k, br) => {   // the smallest ms giving the value: the first reached as particles are added
        const fn = 'particleflow_ms';
        if (norm(out) === 'ms_choke') throw new Error(`${fn}(): give a flow ratio, not 'ms_choke'`);
        let top; try { top = particles('ms_choke', M1, ML, 0, k); } catch (e) { top = Infinity; }
        const grid = top < Infinity ? Array.from({ length: 401 }, (_, i) => top * i / 400) : [0, ...Array.from({ length: 401 }, (_, i) => 10 ** (-6 + 12 * i / 400))];
        const g = (ms) => particles(out, M1, ML, ms, k, br, true) - value;
        let a = grid[0], ga = g(a), lo = ga, hi = ga;
        if (ga === 0) return a;
        for (const b of grid.slice(1)) {
            const gb = g(b); lo = Math.min(lo, gb); hi = Math.max(hi, gb);
            if (gb === 0) return b;
            if (ga < 0 !== gb < 0) {
                let x = a, y = b, gx = ga;
                for (let it = 0; it < 200 && y - x > 2e-16 * y; it++) { const m = (x + y) / 2, gm = g(m); if (gm < 0 === gx < 0) { x = m; gx = gm; } else y = m; }
                return (x + y) / 2;
            }
            a = b; ga = gb;
        }
        const f5 = (x) => String(+(x + value).toPrecision(5));
        throw new Error(`${fn}(): no ms gives ${out} = ${value}; from ms = 0 to ${top < Infinity ? `the choking ms = ${+top.toPrecision(5)}` : '1e6'} it covers ${f5(lo)} to ${f5(hi)}`);
    };

    // Each entry: args (names; '$' marks a text argument; '?' an optional one), f, ranges [[arg, lo, hi], ...] (warnings),
    // eq (source), d (what it is). Ranges for 'Re'-like arguments use the names below.
    return {
        // ---------------- Internal flow (Chapter 8)
        f_laminar: {
            group: 'Internal flow', args: ['Re'], eq: 'Eq. 8.19', d: 'Darcy friction factor, fully developed laminar flow in a circular tube: 64/Re',
            ranges: [['Re', 0, 2300]], f: (Re) => 64 / Re
        },
        f_petukhov: {
            group: 'Internal flow', args: ['Re'], eq: 'Eq. 8.21', d: 'Darcy friction factor, smooth tube, turbulent: (0.790 ln Re - 1.64)^-2',
            ranges: [['Re', 3000, 5e6]], f: petukhov
        },
        f_colebrook: {
            group: 'Internal flow', args: ['Re', 'eps_D'], eq: 'Colebrook (1939); the Moody chart, Fig. 8.3', d: 'Darcy friction factor, turbulent, relative roughness eps/D (0 for a smooth tube), from the implicit Colebrook equation',
            ranges: [['Re', 4000, 1e8], ['eps_D', 0, 0.05]],
            f: (Re, e) => {
                if (e < 0) throw new Error('f_colebrook(): the relative roughness eps_D cannot be negative');
                let x = 1 / Math.sqrt(petukhov(Math.max(Re, 3000)));   // x = 1/sqrt(f); Newton on x + 2 log10(e/3.7 + 2.51 x/Re) = 0
                for (let i = 0; i < 50; i++) {
                    const a = e / 3.7 + 2.51 * x / Re, g = x + 2 * Math.log10(a), dg = 1 + 2 / Math.LN10 * 2.51 / Re / a;
                    const dx = g / dg; x -= dx; if (Math.abs(dx) < 1e-15 * x) break;
                }
                return 1 / (x * x);
            }
        },
        nu_duct_lam: {
            rangeText: 'b/a from 1 to 8 for rectangles', group: 'Internal flow', args: ['shape$', 'b_a', 'condition$'], eq: 'Table 8.1', d: "Nusselt number, fully developed laminar flow; shape 'circle', 'rectangle' (aspect ratio b/a, 1 to 8), 'plates' (parallel plates, both heated), 'plates_insulated' (one side insulated) or 'triangle' (equilateral); condition 'q' (uniform heat flux) or 'T' (uniform surface temperature). Linear in b/a between the tabulated ratios",
            ranges: [], f: (shape, ba, cond) => {
                const s = mode(shape, Object.keys(DUCT), 'nu_duct_lam'), c = mode(cond, ['q', 't'], 'nu_duct_lam') === 'q' ? 1 : 2;
                if (s !== 'rectangle') return DUCT[s][c - 1];
                if (ba < 1 || ba > 8) Corr.warn('nu_duct_lam', `b/a = ${Corr.fmt(ba)} is outside Table 8.1, 1 to 8 (use b/a >= 1; 'plates' for very wide ducts)`);
                return lin(DUCT.rectangle, ba, c);
            }
        },
        fre_duct_lam: {
            rangeText: 'b/a from 1 to 8 for rectangles', group: 'Internal flow', args: ['shape$', 'b_a'], eq: 'Table 8.1', d: 'Product f Re (Darcy friction factor times Reynolds number, both on the hydraulic diameter), fully developed laminar flow; shapes as for nu_duct_lam',
            ranges: [], f: (shape, ba) => {
                const s = mode(shape, Object.keys(DUCT), 'fre_duct_lam');
                if (s !== 'rectangle') return DUCT[s][2];
                if (ba < 1 || ba > 8) Corr.warn('fre_duct_lam', `b/a = ${Corr.fmt(ba)} is outside Table 8.1, 1 to 8`);
                return lin(DUCT.rectangle, ba, 3);
            }
        },
        nu_annulus_lam: {
            group: 'Internal flow', args: ['Di_Do', 'surface$'], eq: 'Table 8.2', d: "Nusselt number on the hydraulic diameter, fully developed laminar flow in an annulus with one surface at constant temperature and the other insulated; surface 'inner' or 'outer' (the heated one). Linear between the tabulated ratios",
            ranges: [['Di_Do', 0.05, 1]], f: (r, surf) => lin(ANNULUS, r, mode(surf, ['inner', 'outer'], 'nu_annulus_lam') === 'inner' ? 1 : 2)
        },
        nu_hausen: {
            group: 'Internal flow', args: ['Re', 'Pr', 'L_D'], eq: 'Eq. 8.56', d: 'Average Nusselt number, laminar thermal entry length (fully developed velocity), uniform surface temperature; Gz = Re Pr/(L/D)',
            ranges: [['Re', 0, 2300]], f: (Re, Pr, LD) => { const Gz = Re * Pr / LD; return 3.66 + 0.0668 * Gz / (1 + 0.04 * pow(Gz, 2 / 3)); }
        },
        nu_siedertate_lam: {
            rangeText: 'Re <= 2300, 0.60 <= Pr <= 5, 0.0044 <= mu/mu_s <= 9.75; Nu >= 3.66', group: 'Internal flow', args: ['Re', 'Pr', 'L_D', 'mu_mus'], eq: 'Eq. 8.57', d: 'Average Nusselt number, laminar combined entry length, uniform surface temperature; mu_mus = mu/mu_s. The book recommends Nu = 3.66 when this gives less',
            ranges: [['Re', 0, 2300], ['Pr', 0.60, 5], ['mu_mus', 0.0044, 9.75]],
            f: (Re, Pr, LD, mr) => {
                const Nu = 1.86 * pow(Re * Pr / LD, 1 / 3) * pow(mr, 0.14);
                if (Nu < 3.66) Corr.warn('nu_siedertate_lam', `Nu = ${Corr.fmt(Nu)} is below 3.66: the book recommends Nu = 3.66 (fully developed conditions over much of the tube)`);
                return Nu;
            }
        },
        nu_dittusboelter: {
            group: 'Internal flow', args: ['Re', 'Pr', 'mode$'], eq: 'Eq. 8.60', d: "Nusselt number, fully developed turbulent flow in a smooth tube: 0.023 Re^0.8 Pr^n, n = 0.4 for 'heating' (Ts > Tm), 0.3 for 'cooling'. Also needs L/D > 10",
            ranges: [['Re', 10000, Infinity], ['Pr', 0.7, 160]],
            f: (Re, Pr, m) => 0.023 * pow(Re, 0.8) * pow(Pr, mode(m, ['heating', 'cooling'], 'nu_dittusboelter') === 'heating' ? 0.4 : 0.3)
        },
        nu_siedertate: {
            group: 'Internal flow', args: ['Re', 'Pr', 'mu_mus'], eq: 'Eq. 8.61', d: 'Nusselt number, turbulent flow with large property variations: 0.027 Re^0.8 Pr^(1/3) (mu/mu_s)^0.14. Also needs L/D > 10',
            ranges: [['Re', 10000, Infinity], ['Pr', 0.7, 16700]], f: (Re, Pr, mr) => 0.027 * pow(Re, 0.8) * pow(Pr, 1 / 3) * pow(mr, 0.14)
        },
        nu_gnielinski: {
            group: 'Internal flow', args: ['Re', 'Pr', 'f?'], eq: 'Eq. 8.62', d: 'Nusselt number, turbulent and transition flow; f is the Darcy friction factor (default: smooth tube, Eq. 8.21; give f_colebrook(Re, eps_D) for a rough tube)',
            ranges: [['Re', 3000, 5e6], ['Pr', 0.5, 2000]],
            f: (Re, Pr, f) => { if (f === undefined) f = petukhov(Re); return (f / 8) * (Re - 1000) * Pr / (1 + 12.7 * Math.sqrt(f / 8) * (pow(Pr, 2 / 3) - 1)); }
        },
        nu_skupinski: {
            group: 'Internal flow', args: ['Re', 'Pr'], eq: 'Eq. 8.64', d: 'Nusselt number, liquid metals, fully developed turbulent flow, uniform heat flux: 4.82 + 0.0185 Pe^0.827, Pe = Re Pr',
            ranges: [['Re', 3.6e3, 9.05e5], ['Pe', 1e2, 1e4]], f: (Re, Pr) => 4.82 + 0.0185 * pow(Re * Pr, 0.827)
        },
        nu_sebanshimazaki: {
            group: 'Internal flow', args: ['Re', 'Pr'], eq: 'Eq. 8.65', d: 'Nusselt number, liquid metals, fully developed turbulent flow, uniform surface temperature: 5.0 + 0.025 Pe^0.8, Pe = Re Pr',
            ranges: [['Pe', 100, Infinity]], f: (Re, Pr) => 5.0 + 0.025 * pow(Re * Pr, 0.8)
        },

        // ---------------- Flat plate in parallel flow (Chapter 7)
        nu_plate_lam_x: {
            group: 'Flat plate', args: ['Re_x', 'Pr', 'xi_x?'], eq: 'Eqs. 7.23, 7.42', d: 'Local Nusselt number, laminar, uniform surface temperature: 0.332 Re_x^(1/2) Pr^(1/3); optional unheated starting length as xi/x',
            ranges: [['Re_x', 0, 5e5], ['Pr', 0.6, Infinity]], f: (Re, Pr, r = 0) => usl_local(0.332 * Math.sqrt(Re) * pow(Pr, 1 / 3), r, true)
        },
        nu_plate_lam: {
            group: 'Flat plate', args: ['Re_L', 'Pr', 'xi_L?'], eq: 'Eqs. 7.30, 7.44', d: 'Average Nusselt number, laminar over the whole plate: 0.664 Re_L^(1/2) Pr^(1/3); optional unheated starting length as xi/L (then h is averaged over the heated part)',
            ranges: [['Re_L', 0, 5e5], ['Pr', 0.6, Infinity]], f: (Re, Pr, r = 0) => usl_avg(0.664 * Math.sqrt(Re) * pow(Pr, 1 / 3), r, 2)
        },
        nu_plate_turb_x: {
            group: 'Flat plate', args: ['Re_x', 'Pr', 'xi_x?'], eq: 'Eqs. 7.36, 7.43', d: 'Local Nusselt number, turbulent: 0.0296 Re_x^(4/5) Pr^(1/3); optional unheated starting length as xi/x',
            ranges: [['Re_x', 5e5, 1e8], ['Pr', 0.6, 60]], f: (Re, Pr, r = 0) => usl_local(0.0296 * pow(Re, 0.8) * pow(Pr, 1 / 3), r, false)
        },
        nu_plate_turb: {
            group: 'Flat plate', args: ['Re_L', 'Pr', 'xi_L?'], eq: 'Eqs. 7.38 (A = 0), 7.44', d: 'Average Nusselt number, turbulent over the whole plate (tripped at the leading edge): 0.037 Re_L^(4/5) Pr^(1/3); optional unheated starting length as xi/L',
            ranges: [['Re_L', 0, 1e8], ['Pr', 0.6, 60]], f: (Re, Pr, r = 0) => usl_avg(0.037 * pow(Re, 0.8) * pow(Pr, 1 / 3), r, 8)
        },
        nu_plate_mixed: {
            rangeText: 'Re_xc <= Re_L <= 1e8, 0.6 <= Pr <= 60', group: 'Flat plate', args: ['Re_L', 'Pr', 'Re_xc?'], eq: 'Eqs. 7.38, 7.39', d: 'Average Nusselt number, laminar then turbulent: (0.037 Re_L^(4/5) - A) Pr^(1/3), A = 0.037 Re_xc^(4/5) - 0.664 Re_xc^(1/2) (A = 871 for the default Re_xc = 5e5)',
            ranges: [['Pr', 0.6, 60]],
            f: (Re, Pr, Rc = 5e5) => {
                if (Re < Rc || Re > 1e8) Corr.warn('nu_plate_mixed', `Re_L = ${Corr.fmt(Re)} is outside its range, ${Corr.fmt(Rc)} to 1e8 (below Re_xc the flow is laminar over the whole plate: use nu_plate_lam)`);
                const A = 0.037 * pow(Rc, 0.8) - 0.664 * Math.sqrt(Rc);
                return (0.037 * pow(Re, 0.8) - A) * pow(Pr, 1 / 3);
            }
        },
        nu_plate_lam_x_q: {
            group: 'Flat plate', args: ['Re_x', 'Pr'], eq: 'Eq. 7.45', d: 'Local Nusselt number, laminar, uniform surface heat flux: 0.453 Re_x^(1/2) Pr^(1/3)',
            ranges: [['Re_x', 0, 5e5], ['Pr', 0.6, Infinity]], f: (Re, Pr) => 0.453 * Math.sqrt(Re) * pow(Pr, 1 / 3)
        },
        nu_plate_turb_x_q: {
            group: 'Flat plate', args: ['Re_x', 'Pr'], eq: 'Eq. 7.46', d: 'Local Nusselt number, turbulent, uniform surface heat flux: 0.0308 Re_x^(4/5) Pr^(1/3)',
            ranges: [['Re_x', 5e5, 1e8], ['Pr', 0.6, 60]], f: (Re, Pr) => 0.0308 * pow(Re, 0.8) * pow(Pr, 1 / 3)
        },
        nu_churchillozoe_x: {
            group: 'Flat plate', args: ['Re_x', 'Pr'], eq: 'Eq. 7.33', d: 'Local Nusselt number, laminar, uniform surface temperature, any Prandtl number (liquid metals included): 0.3387 Re_x^(1/2) Pr^(1/3)/[1 + (0.0468/Pr)^(2/3)]^(1/4); the average is twice the local value',
            ranges: [['Pe_x', 100, Infinity]], f: (Re, Pr) => 0.3387 * Math.sqrt(Re) * pow(Pr, 1 / 3) / pow(1 + pow(0.0468 / Pr, 2 / 3), 1 / 4)
        },
        cf_plate_lam_x: { group: 'Flat plate', args: ['Re_x'], eq: 'Eq. 7.20', d: 'Local friction coefficient, laminar: 0.664 Re_x^(-1/2)', ranges: [['Re_x', 0, 5e5]], f: (Re) => 0.664 / Math.sqrt(Re) },
        cf_plate_lam: { group: 'Flat plate', args: ['Re_L'], eq: 'Eq. 7.29', d: 'Average friction coefficient, laminar: 1.328 Re_L^(-1/2)', ranges: [['Re_L', 0, 5e5]], f: (Re) => 1.328 / Math.sqrt(Re) },
        cf_plate_turb_x: { group: 'Flat plate', args: ['Re_x'], eq: 'Eq. 7.34', d: 'Local friction coefficient, turbulent: 0.0592 Re_x^(-1/5)', ranges: [['Re_x', 5e5, 1e8]], f: (Re) => 0.0592 * pow(Re, -0.2) },
        cf_plate_mixed: {
            rangeText: 'Re_xc <= Re_L <= 1e8', group: 'Flat plate', args: ['Re_L', 'Re_xc?'], eq: 'Eq. 7.40', d: 'Average friction coefficient, laminar then turbulent: 0.074 Re_L^(-1/5) - 2A/Re_L (A as in nu_plate_mixed)',
            ranges: [], f: (Re, Rc = 5e5) => {
                if (Re < Rc || Re > 1e8) Corr.warn('cf_plate_mixed', `Re_L = ${Corr.fmt(Re)} is outside its range, ${Corr.fmt(Rc)} to 1e8`);
                const A = 0.037 * pow(Rc, 0.8) - 0.664 * Math.sqrt(Rc);
                return 0.074 * pow(Re, -0.2) - 2 * A / Re;
            }
        },

        // ---------------- Cylinder, sphere, tube banks (Chapter 7)
        nu_churchillbernstein: {
            group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr'], eq: 'Eq. 7.54', d: 'Average Nusselt number, circular cylinder in cross flow (properties at the film temperature)',
            ranges: [['RePr', 0.2, Infinity]], f: (Re, Pr) => 0.3 + 0.62 * Math.sqrt(Re) * pow(Pr, 1 / 3) / pow(1 + pow(0.4 / Pr, 2 / 3), 1 / 4) * pow(1 + pow(Re / 282000, 5 / 8), 4 / 5)
        },
        nu_hilpert: {
            group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr'], eq: 'Eq. 7.52, Table 7.2', d: 'Average Nusselt number, circular cylinder in cross flow: C Re^m Pr^(1/3) (properties at the film temperature)',
            ranges: [['Re', 0.4, 4e5], ['Pr', 0.7, Infinity]], f: (Re, Pr) => { const [, , C, m] = band(HILPERT, Re); return C * pow(Re, m) * pow(Pr, 1 / 3); }
        },
        nu_zukauskas: {
            group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr', 'Pr_s'], eq: 'Eq. 7.53, Table 7.4', d: 'Average Nusselt number, circular cylinder in cross flow: C Re^m Pr^n (Pr/Pr_s)^(1/4), n = 0.37 for Pr <= 10, else 0.36 (properties at the free-stream temperature, Pr_s at the surface)',
            ranges: [['Re', 1, 1e6], ['Pr', 0.7, 500]], f: (Re, Pr, Prs) => { const [, , C, m] = band(ZUK_CYL, Re); return C * pow(Re, m) * pow(Pr, Pr <= 10 ? 0.37 : 0.36) * pow(Pr / Prs, 0.25); }
        },
        nu_whitaker: {
            group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr', 'mu_mus'], eq: 'Eq. 7.56', d: 'Average Nusselt number, sphere: 2 + (0.4 Re^(1/2) + 0.06 Re^(2/3)) Pr^0.4 (mu/mu_s)^(1/4) (properties at the free-stream temperature)',
            ranges: [['Re', 3.5, 7.6e4], ['Pr', 0.71, 380], ['mu_mus', 1.0, 3.2]], f: (Re, Pr, mr) => 2 + (0.4 * Math.sqrt(Re) + 0.06 * pow(Re, 2 / 3)) * pow(Pr, 0.4) * pow(mr, 0.25)
        },
        nu_ranzmarshall: {
            group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr'], eq: 'Eq. 7.57', d: 'Average Nusselt number, freely falling liquid drop: 2 + 0.6 Re^(1/2) Pr^(1/3)',
            ranges: [], f: (Re, Pr) => 2 + 0.6 * Math.sqrt(Re) * pow(Pr, 1 / 3)
        },
        cd_sphere: {
            rangeText: 'Re <= 2e5 (below the drag crisis)', group: 'Cylinder, sphere, tube banks', args: ['Re'], eq: 'Clift and Gauvin (1970), within about 6 % of data; follows Fig. 7.8 below the drag crisis, and Stokes, Eq. 7.55, at low Re', d: 'Drag coefficient of a smooth sphere: 24/Re (1 + 0.15 Re^0.687) + 0.42/(1 + 42500 Re^-1.16)',
            ranges: [], f: (Re) => {
                if (Re > 2e5) Corr.warn('cd_sphere', `Re = ${Corr.fmt(Re)} is above 2e5: in the drag crisis (Fig. 7.8) the drag coefficient falls to about 0.1 to 0.2, depending on surface roughness and free-stream turbulence, and this correlation does not apply`);
                return 24 / Re * (1 + 0.15 * pow(Re, 0.687)) + 0.42 / (1 + 42500 * pow(Re, -1.16));
            }
        },
        nu_tubebank: {
            rangeText: '10 <= Re_max <= 2e6, 0.7 <= Pr <= 500; aligned: ST/SL > 0.7', group: 'Cylinder, sphere, tube banks', args: ['Re_max', 'Pr', 'Pr_s', 'arrangement$', 'ST_SL', 'NL?'], eq: 'Eqs. 7.64, 7.65, Tables 7.7, 7.8', d: "Average Nusselt number, bank of tubes in cross flow (Zukauskas): C2 C Re_max^m Pr^0.36 (Pr/Pr_s)^(1/4); arrangement 'aligned' or 'staggered', ST_SL = ST/SL, NL = number of rows (default 20 or more; C2 interpolated in Table 7.8). Re_max on the maximum velocity; properties at the mean fluid temperature. For 100 < Re_max < 1000 the book's advice, a single isolated cylinder, is used (Eq. 7.53)",
            ranges: [['Re_max', 10, 2e6], ['Pr', 0.7, 500]],
            f: (Re, Pr, Prs, arr, r, NL = 20) => {
                const a = mode(arr, ['aligned', 'staggered'], 'nu_tubebank');
                if (!(NL >= 1)) throw new Error('nu_tubebank(): NL, the number of rows, must be 1 or more');
                let C, m;
                if (Re < 100) [C, m] = a === 'aligned' ? [0.80, 0.40] : [0.90, 0.40];
                else if (Re < 1000) return CORRELATIONS.nu_zukauskas.f(Re, Pr, Prs) * (NL < 20 ? lin(C2_BANK[a], NL, 1) : 1);
                else if (Re < 2e5) {
                    if (a === 'aligned') { [C, m] = [0.27, 0.63]; if (r < 0.7) Corr.warn('nu_tubebank', `aligned tubes with ST/SL = ${Corr.fmt(r)} below 0.7: heat transfer is inefficient and the book advises against it (Table 7.7)`); }
                    else[C, m] = r < 2 ? [0.35 * pow(r, 0.2), 0.60] : [0.40, 0.60];
                } else[C, m] = a === 'aligned' ? [0.021, 0.84] : [0.022, 0.84];
                const C2 = NL < 20 ? lin(C2_BANK[a], NL, 1) : 1;
                return C2 * C * pow(Re, m) * pow(Pr, 0.36) * pow(Pr / Prs, 0.25);
            }
        },

        // ---------------- Free convection, external (Chapter 9); Ra and Nu on the length named in each description
        nu_churchillchu_plate: {
            group: 'Free convection: plates, cylinders, spheres', args: ['Ra_L', 'Pr'], eq: 'Eq. 9.26', d: 'Average Nusselt number, vertical plate (height L), laminar and turbulent: {0.825 + 0.387 Ra^(1/6)/[1 + (0.492/Pr)^(9/16)]^(8/27)}^2. Also inclined plates with g cos(theta), and vertical cylinders when D/L >= 35/Gr_L^(1/4)',
            ranges: [['Ra_L', 0, 1e13]], f: (Ra, Pr) => pow(0.825 + 0.387 * pow(Ra, 1 / 6) / pow(1 + pow(0.492 / Pr, 9 / 16), 8 / 27), 2)
        },
        nu_churchillchu_plate_lam: {
            group: 'Free convection: plates, cylinders, spheres', args: ['Ra_L', 'Pr'], eq: 'Eq. 9.27', d: 'Average Nusselt number, vertical plate, laminar (slightly more accurate there): 0.68 + 0.670 Ra^(1/4)/[1 + (0.492/Pr)^(9/16)]^(4/9)',
            ranges: [['Ra_L', 0, 1e9]], f: (Ra, Pr) => 0.68 + 0.670 * pow(Ra, 1 / 4) / pow(1 + pow(0.492 / Pr, 9 / 16), 4 / 9)
        },
        nu_hplate: {
            group: 'Free convection: plates, cylinders, spheres', args: ['Ra_L', 'face$'], eq: 'Eqs. 9.30 to 9.32', d: "Average Nusselt number, horizontal plate, L = A/P (area over perimeter); face 'hot_up' (upper surface of a hot plate, or lower surface of a cold one): 0.54 Ra^(1/4), or 0.15 Ra^(1/3) above 1e7; face 'hot_down' (lower surface of a hot plate, or upper surface of a cold one): 0.27 Ra^(1/4)",
            rangeText: "hot_up: 1e4 <= Ra_L <= 1e11; hot_down: 1e5 <= Ra_L <= 1e10", ranges: [],
            f: (Ra, face) => {
                if (mode(face, ['hot_up', 'hot_down'], 'nu_hplate') === 'hot_up') {
                    if (Ra < 1e4 || Ra > 1e11) Corr.warn('nu_hplate', `Ra_L = ${Corr.fmt(Ra)} is outside its range, 1e4 to 1e11 (Eqs. 9.30, 9.31)`);
                    return Ra <= 1e7 ? 0.54 * pow(Ra, 1 / 4) : 0.15 * pow(Ra, 1 / 3);
                }
                if (Ra < 1e5 || Ra > 1e10) Corr.warn('nu_hplate', `Ra_L = ${Corr.fmt(Ra)} is outside its range, 1e5 to 1e10 (Eq. 9.32)`);
                return 0.27 * pow(Ra, 1 / 4);
            }
        },
        nu_churchillchu_cyl: {
            group: 'Free convection: plates, cylinders, spheres', args: ['Ra_D', 'Pr'], eq: 'Eq. 9.34', d: 'Average Nusselt number, long horizontal cylinder: {0.60 + 0.387 Ra^(1/6)/[1 + (0.559/Pr)^(9/16)]^(8/27)}^2',
            ranges: [['Ra_D', 0, 1e12]], f: (Ra, Pr) => pow(0.60 + 0.387 * pow(Ra, 1 / 6) / pow(1 + pow(0.559 / Pr, 9 / 16), 8 / 27), 2)
        },
        nu_morgan: {
            group: 'Free convection: plates, cylinders, spheres', args: ['Ra_D'], eq: 'Eq. 9.33, Table 9.1', d: 'Average Nusselt number, long horizontal cylinder: C Ra^n',
            ranges: [['Ra_D', 1e-10, 1e12]], f: (Ra) => { const [, , C, n] = band(MORGAN, Ra); return C * pow(Ra, n); }
        },
        nu_churchill_sphere: {
            group: 'Free convection: plates, cylinders, spheres', args: ['Ra_D', 'Pr'], eq: 'Eq. 9.35', d: 'Average Nusselt number, sphere: 2 + 0.589 Ra^(1/4)/[1 + (0.469/Pr)^(9/16)]^(4/9)',
            ranges: [['Ra_D', 0, 1e11], ['Pr', 0.7, Infinity]], f: (Ra, Pr) => 2 + 0.589 * pow(Ra, 1 / 4) / pow(1 + pow(0.469 / Pr, 9 / 16), 4 / 9)
        },

        // ---------------- Free convection in channels and enclosures (Chapter 9)
        nu_elenbaas: {
            group: 'Free convection: channels and enclosures', args: ['Ra_S', 'S_L'], eq: 'Eq. 9.36', d: 'Average Nusselt number on the spacing S, vertical channel between symmetric isothermal plates (height L), air: (1/24) Ra_S (S/L) {1 - exp[-35/(Ra_S S/L)]}^(3/4)',
            ranges: [['RaS_L', 0.1, 1e5]], f: (Ra, r) => Ra === 0 ? 0 : Ra * r / 24 * pow(1 - Math.exp(-35 / (Ra * r)), 3 / 4)
        },
        nu_channel: {
            group: 'Free convection: channels and enclosures', args: ['Ra_S', 'S_L', 'condition$'], eq: 'Eqs. 9.45, 9.46, Table 9.3', d: "Nusselt number on the spacing S, vertical parallel-plate channel (Bar-Cohen and Rohsenow); condition 'symmetric_t' (both plates isothermal), 'asymmetric_t' (one isothermal, one adiabatic): average Nu_S with Ra_S; 'symmetric_q' (both isoflux), 'asymmetric_q' (one isoflux, one adiabatic): Nu_S,L at the top with the modified Ra*_S = g beta q'' S^4/(k nu alpha)",
            rangeText: 'all S/L (fully developed to isolated plates)', ranges: [],
            f: (Ra, r, cond) => {
                const [C1, C2, q] = CHANNEL[mode(cond, Object.keys(CHANNEL), 'nu_channel')], x = Ra * r;
                if (x === 0) return 0;
                return q ? pow(C1 / x + C2 / pow(x, 2 / 5), -1 / 2) : pow(C1 / (x * x) + C2 / Math.sqrt(x), -1 / 2);
            }
        },
        nu_channel_inclined: {
            group: 'Free convection: channels and enclosures', args: ['Ra_S', 'S_L'], eq: 'Eq. 9.47', d: 'Average Nusselt number on S, inclined channel (tilt 0 to 45 degrees from vertical), isothermal plates or isothermal-insulated, isolated plate limit: 0.645 [Ra_S (S/L)]^(1/4)',
            ranges: [['RaS_L', 200, Infinity]], f: (Ra, r) => 0.645 * pow(Ra * r, 1 / 4)
        },
        nu_cavity_horiz: {
            group: 'Free convection: channels and enclosures', args: ['Ra_L', 'Pr'], eq: 'Eq. 9.49', d: 'Nusselt number on the gap L, horizontal cavity heated from below (Globe and Dropkin): 0.069 Ra^(1/3) Pr^0.074; Nu = 1 (conduction) below Ra_L = 1708. Heated from above: Nu = 1',
            rangeText: 'Ra_L < 1708 (Nu = 1) or 3e5 <= Ra_L <= 7e9', ranges: [],
            f: (Ra, Pr) => {
                if (Ra < 1708) return 1;
                if (Ra < 3e5 || Ra > 7e9) Corr.warn('nu_cavity_horiz', `Ra_L = ${Corr.fmt(Ra)} is outside its range, 3e5 to 7e9 (Eq. 9.49)`);
                return 0.069 * pow(Ra, 1 / 3) * pow(Pr, 0.074);
            }
        },
        nu_cavity_vert: {
            group: 'Free convection: channels and enclosures', args: ['Ra_L', 'Pr', 'H_L'], eq: 'Eqs. 9.50 to 9.53', d: 'Nusselt number on the gap L, vertical rectangular cavity (height H, sides heated and cooled): Eq. 9.51 for H/L < 2, 9.50 for 2 to 10, 9.52 for H/L >= 10 and Ra_L <= 1e7, 9.53 above; Nu = 1 below Ra_L = 1e3',
            rangeText: '1 <= H/L <= 40 and the ranges of the equation used (see the book)', ranges: [],
            f: (Ra, Pr, HL) => {
                if (Ra < 1e3) return 1;
                const out = (lo, hi, what, v) => { if (v < lo || v > hi) Corr.warn('nu_cavity_vert', `${what} = ${Corr.fmt(v)} is outside the range of the equation used, ${Corr.fmt(lo)} to ${Corr.fmt(hi)}`); };
                out(1, 40, 'H/L', HL);
                if (HL < 2) { out(1e-3, 1e5, 'Pr (Eq. 9.51)', Pr); out(1e3, Infinity, 'Ra_L Pr/(0.2 + Pr) (Eq. 9.51)', Ra * Pr / (0.2 + Pr)); return 0.18 * pow(Pr / (0.2 + Pr) * Ra, 0.29); }
                if (HL <= 10) { out(0, 1e5, 'Pr (Eq. 9.50)', Pr); out(1e3, 1e10, 'Ra_L (Eq. 9.50)', Ra); return 0.22 * pow(Pr / (0.2 + Pr) * Ra, 0.28) * pow(HL, -1 / 4); }
                if (Ra <= 1e7) { out(1, 2e4, 'Pr (Eq. 9.52)', Pr); out(1e4, 1e7, 'Ra_L (Eq. 9.52)', Ra); return 0.42 * pow(Ra, 1 / 4) * pow(Pr, 0.012) * pow(HL, -0.3); }
                out(1, 20, 'Pr (Eq. 9.53)', Pr); out(1e6, 1e9, 'Ra_L (Eq. 9.53)', Ra);
                return 0.046 * pow(Ra, 1 / 3);
            }
        },
        nu_hollands: {
            group: 'Free convection: channels and enclosures', args: ['Ra_L', 'tau_deg'], eq: 'Eq. 9.54', d: 'Nusselt number on the gap L, inclined cavity heated from below, tilt tau (degrees from horizontal, up to the critical angle, about 70 degrees for H/L >= 12): 1 + 1.44 [1 - 1708/(Ra cos tau)]+ [1 - 1708 (sin 1.8 tau)^1.6/(Ra cos tau)] + [(Ra cos tau/5830)^(1/3) - 1]+, where [ ]+ means 0 if negative',
            rangeText: 'H/L >= 12, 0 <= tau <= tau* (Table 9.4)', ranges: [['tau_deg', 0, 70]],
            f: (Ra, tau) => {
                const t = tau * Math.PI / 180, rc = Ra * Math.cos(t), pos = (v) => Math.max(v, 0);
                if (rc <= 1708) return 1;
                return 1 + 1.44 * pos(1 - 1708 / rc) * (1 - 1708 * pow(Math.sin(1.8 * t), 1.6) / rc) + pos(pow(rc / 5830, 1 / 3) - 1);
            }
        },
        lc_cylinders: {
            group: 'Free convection: channels and enclosures', args: ['r_i', 'r_o'], length: true, eq: 'Eq. 9.60', d: 'Length scale L_c for Ra_c between long horizontal concentric cylinders: 2 [ln(r_o/r_i)]^(4/3)/(r_i^(-3/5) + r_o^(-3/5))^(5/3); in the units of the radii',
            ranges: [], f: (ri, ro) => 2 * pow(Math.log(ro / ri), 4 / 3) / pow(pow(ri, -3 / 5) + pow(ro, -3 / 5), 5 / 3)
        },
        keff_k_cylinders: {
            group: 'Free convection: channels and enclosures', args: ['Ra_c', 'Pr'], eq: 'Eq. 9.59', d: 'Effective conductivity ratio k_eff/k between concentric cylinders: 0.386 [Pr/(0.861 + Pr)]^(1/4) Ra_c^(1/4), at least 1. Then q per length = 2 pi k_eff (T_i - T_o)/ln(r_o/r_i) (Eq. 9.58)',
            ranges: [['Ra_c', 0, 1e7], ['Pr', 0.7, 6000]], f: (Ra, Pr) => Math.max(1, 0.386 * pow(Pr / (0.861 + Pr), 1 / 4) * pow(Ra, 1 / 4))
        },
        ls_spheres: {
            group: 'Free convection: channels and enclosures', args: ['r_i', 'r_o'], length: true, eq: 'Eq. 9.63', d: 'Length scale L_s for Ra_s between concentric spheres: (1/r_i - 1/r_o)^(4/3)/[2^(1/3) (r_i^(-7/5) + r_o^(-7/5))^(5/3)]; in the units of the radii',
            ranges: [], f: (ri, ro) => pow(1 / ri - 1 / ro, 4 / 3) / (pow(2, 1 / 3) * pow(pow(ri, -7 / 5) + pow(ro, -7 / 5), 5 / 3))
        },
        keff_k_spheres: {
            group: 'Free convection: channels and enclosures', args: ['Ra_s', 'Pr'], eq: 'Eq. 9.62', d: 'Effective conductivity ratio k_eff/k between concentric spheres: 0.74 [Pr/(0.861 + Pr)]^(1/4) Ra_s^(1/4), at least 1. Then q = 4 pi k_eff (T_i - T_o)/(1/r_i - 1/r_o) (Eq. 9.61)',
            ranges: [['Ra_s', 0, 1e4], ['Pr', 0.7, 4000]], f: (Ra, Pr) => Math.max(1, 0.74 * pow(Pr / (0.861 + Pr), 1 / 4) * pow(Ra, 1 / 4))
        },

        // ---------------- Boiling (Chapter 10). Dimensional: SI arguments and result, as listed in each args entry
        q_rohsenow: {
            group: 'Boiling', args: ['DeltaT_e [K]', 'mu_l [Pa s]', 'h_fg [J/kg]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'sigma [N/m]', 'cp_l [J/(kg K)]', 'Pr_l', 'C_sf', 'n', 'g? [m/s^2]'], out: 'W/m^2',
            eq: 'Eq. 10.5', d: 'Heat flux, nucleate pool boiling (Rohsenow), excess temperature DeltaT_e = T_s - T_sat: mu_l h_fg [g (rho_l - rho_v)/sigma]^(1/2) [cp_l DeltaT_e/(C_sf h_fg Pr_l^n)]^3; C_sf and n from Table 10.1 (csf_rohsenow, n_rohsenow). Properties at T_sat. Clean surfaces; errors up to 100 % in q (about 30 % in DeltaT_e)',
            rangeText: 'nucleate boiling: q below q_max_zuber', ranges: [],
            f: (dT, mu, hfg, rl, rv, sg, cp, Pr, Csf, n, g = G0) => mu * hfg * Math.sqrt(g * (rl - rv) / sg) * pow(cp * dT / (Csf * hfg * pow(Pr, n)), 3)
        },
        csf_rohsenow: {
            group: 'Boiling', args: ['surface$'], eq: 'Table 10.1', d: `Coefficient C_sf of the Rohsenow correlation for a surface-fluid combination: ${Object.keys(CSF).map(k => `'${k}'`).join(', ')}`,
            ranges: [], f: (sf) => CSF[mode(sf, Object.keys(CSF), 'csf_rohsenow')][0]
        },
        n_rohsenow: {
            group: 'Boiling', args: ['surface$'], eq: 'Table 10.1', d: 'Exponent n of the Rohsenow correlation (1.0 for water, 1.7 for the other fluids); combinations as for csf_rohsenow',
            ranges: [], f: (sf) => CSF[mode(sf, Object.keys(CSF), 'n_rohsenow')][1]
        },
        q_max_zuber: {
            group: 'Boiling', args: ['h_fg [J/kg]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'sigma [N/m]', 'C?', 'g? [m/s^2]'], out: 'W/m^2',
            eq: 'Eq. 10.6', d: 'Critical (maximum) heat flux, nucleate pool boiling (Kutateladze and Zuber): C h_fg rho_v [sigma g (rho_l - rho_v)/rho_v^2]^(1/4); C = 0.149 (the default) for large horizontal plates, pi/24 = 0.131 for large horizontal cylinders, spheres and large finite surfaces. Properties at T_sat',
            rangeText: 'heater large compared with the bubbles (Confinement number below about 0.2)', ranges: [],
            f: (hfg, rl, rv, sg, C = 0.149, g = G0) => C * hfg * rv * pow(sg * g * (rl - rv) / (rv * rv), 1 / 4)
        },
        q_min_zuber: {
            group: 'Boiling', args: ['h_fg [J/kg]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'sigma [N/m]', 'g? [m/s^2]'], out: 'W/m^2',
            eq: 'Eq. 10.7', d: 'Minimum heat flux (Leidenfrost point), large horizontal plate (Zuber, with C = 0.09 from Berenson): 0.09 rho_v h_fg [g sigma (rho_l - rho_v)/(rho_l + rho_v)^2]^(1/4). Properties at T_sat; about 50 % accuracy at moderate pressures',
            rangeText: 'moderate pressures', ranges: [],
            f: (hfg, rl, rv, sg, g = G0) => 0.09 * rv * hfg * pow(g * sg * (rl - rv) / pow(rl + rv, 2), 1 / 4)
        },
        h_film_boiling: {
            group: 'Boiling', args: ['geometry$', 'D [m]', 'DeltaT_e [K]', 'k_v [W/(m K)]', 'rho_v [kg/m^3]', 'mu_v [Pa s]', 'rho_l [kg/m^3]', 'hfg_p [J/kg]', 'g? [m/s^2]'], out: 'W/(m^2 K)',
            eq: 'Eq. 10.8', d: "Convection coefficient h_conv, film pool boiling on a horizontal cylinder or a sphere of diameter D; geometry 'cylinder' (C = 0.62) or 'sphere' (0.67): (C k_v/D) [g (rho_l - rho_v) hfg_p D^3/(nu_v k_v DeltaT_e)]^(1/4), with hfg_p = hfg_corrected(h_fg, cp_v, DeltaT_e, 'film_boiling'). Vapor properties at the film temperature, rho_l at T_sat. With radiation: h_bromley",
            rangeText: 'film boiling (beyond the Leidenfrost point)', ranges: [],
            f: (geo, D, dT, kv, rv, mu, rl, hfgp, g = G0) => {
                const C = { cylinder: 0.62, sphere: 0.67 }[mode(geo, ['cylinder', 'sphere'], 'h_film_boiling')];
                return C * kv / D * pow(g * (rl - rv) * hfgp * D * D * D / (mu / rv * kv * dT), 1 / 4);
            }
        },
        h_bromley: {
            group: 'Boiling', args: ['h_conv [W/(m^2 K)]', 'h_rad [W/(m^2 K)]'], out: 'W/(m^2 K)',
            eq: 'Eq. 10.9', d: 'Total coefficient in film boiling with radiation (Bromley): the root h of h^(4/3) = h_conv^(4/3) + h_rad h^(1/3), with h_rad = eps sigma (T_s^4 - T_sat^4)/(T_s - T_sat) (Eq. 10.11). For h_rad < h_conv it is close to h_conv + (3/4) h_rad (Eq. 10.10)',
            ranges: [], f: (hc, hr) => {   // Newton on F(h) = h^(4/3) - hr h^(1/3) - hc^(4/3), increasing for h > hr/4, starting above the root
                if (hc === 0) return hr;
                let h = hc + hr;
                for (let k = 0; k < 50; k++) {
                    const F = pow(h, 4 / 3) - hr * pow(h, 1 / 3) - pow(hc, 4 / 3), dF = 4 / 3 * pow(h, 1 / 3) - hr / 3 * pow(h, -2 / 3), dh = F / dF;
                    h -= dh; if (Math.abs(dh) < 1e-15 * h) break;
                }
                return h;
            }
        },
        q_max_lienhard: {
            group: 'Boiling', args: ['V [m/s]', 'D [m]', 'h_fg [J/kg]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'sigma [N/m]'], out: 'W/m^2',
            eq: 'Eqs. 10.12 to 10.14', d: 'Critical heat flux, liquid of velocity V in cross flow over a cylinder (Lienhard and Eichhorn), with We_D = rho_v V^2 D/sigma; low velocity: rho_v h_fg V (1/pi) [1 + (4/We_D)^(1/3)]; high velocity: rho_v h_fg V [(rho_l/rho_v)^(3/4)/(169 pi) + (rho_l/rho_v)^(1/2)/(19.2 pi We_D^(1/3))]; low velocity while the low-velocity value of q_max/(rho_v h_fg V) exceeds (0.275/pi)(rho_l/rho_v)^(1/2) + 1. Properties at T_sat; within 20 % of data',
            ranges: [], f: (V, D, hfg, rl, rv, sg) => {
                const We = rv * V * V * D / sg, r = rl / rv, low = (1 + pow(4 / We, 1 / 3)) / Math.PI;
                const p = low > 0.275 / Math.PI * Math.sqrt(r) + 1 ? low : pow(r, 3 / 4) / (169 * Math.PI) + Math.sqrt(r) / (19.2 * Math.PI * pow(We, 1 / 3));
                return p * rv * hfg * V;
            }
        },
        h_kandlikar: {
            group: 'Boiling', args: ['h_sp [W/(m^2 K)]', 'X', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'q_s [W/m^2]', 'G [kg/(s m^2)]', 'h_fg [J/kg]', 'G_sf', 'Fr?'], out: 'W/(m^2 K)',
            eq: 'Eq. 10.15', d: 'Coefficient h, saturated flow boiling in a smooth circular tube (Kandlikar): the larger of Eqs. 10.15a and 10.15b times h_sp, the single-phase liquid coefficient (nu_gnielinski with properties at T_sat); X = mean vapor mass fraction (quality), G = mass flux, G_sf from Table 10.2 (gsf_kandlikar). Fr = (G/rho_l)^2/(g D) for a horizontal tube (f(Fr) = 2.63 Fr^0.3 below 0.04); omit it for a vertical tube',
            rangeText: '0 <= X <= 0.8; turbulent liquid flow; Confinement number below 1/2', ranges: [['X', 0, 0.8]],
            f: (hsp, X, rl, rv, q, G, hfg, Gsf, Fr) => {
                const fF = Fr !== undefined && Fr < 0.04 ? 2.63 * pow(Fr, 0.3) : 1, r = rl / rv, Bo = pow(q / (G * hfg), 0.7) * pow(1 - X, 0.8) * Gsf;
                return hsp * Math.max(0.6683 * pow(r, 0.1) * pow(X, 0.16) * pow(1 - X, 0.64) * fF + 1058 * Bo,
                    1.136 * pow(r, 0.45) * pow(X, 0.72) * pow(1 - X, 0.08) * fF + 667.2 * Bo);
            }
        },
        gsf_kandlikar: {
            group: 'Boiling', args: ['fluid$'], eq: 'Table 10.2', d: `Fluid-surface parameter G_sf of the Kandlikar correlation, commercial copper tubing: ${Object.keys(GSF).filter(k => k !== 'stainless').map(k => `'${k}'`).join(', ')}; 'stainless' (any fluid in stainless steel tubing) gives 1`,
            ranges: [], f: (fl) => GSF[mode(fl, Object.keys(GSF), 'gsf_kandlikar')]
        },
        hfg_corrected: {
            group: 'Boiling', args: ['h_fg [J/kg]', 'cp [J/(kg K)]', 'DeltaT [K]', 'case$'], out: 'J/kg',
            eq: 'Eqs. 10.27, 10.48, Sec. 10.4.4', d: "Modified latent heat h'_fg; case 'condensation' (film condensation, cp of the liquid, DeltaT = T_sat - T_s): h_fg + 0.68 cp DeltaT; 'chato' (condensation in a horizontal tube): h_fg + (3/8) cp DeltaT; 'film_boiling' (cp of the vapor, DeltaT = T_s - T_sat): h_fg + 0.80 cp DeltaT",
            ranges: [], f: (hfg, cp, dT, c) => hfg + { condensation: 0.68, chato: 3 / 8, film_boiling: 0.80 }[mode(c, ['condensation', 'chato', 'film_boiling'], 'hfg_corrected')] * cp * dT
        },

        // ---------------- Condensation (Chapter 10)
        h_cond_plate: {
            group: 'Condensation', args: ['L [m]', 'DeltaT [K]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'k_l [W/(m K)]', 'mu_l [Pa s]', 'hfg_p [J/kg]', 'g? [m/s^2]'], out: 'W/(m^2 K)',
            eq: 'Eq. 10.31', d: "Average coefficient, laminar film condensation on a vertical plate of height L (Nusselt), DeltaT = T_sat - T_s: 0.943 [g rho_l (rho_l - rho_v) k_l^3 hfg_p/(mu_l DeltaT L)]^(1/4), hfg_p = hfg_corrected(h_fg, cp_l, DeltaT, 'condensation'). Liquid properties at the film temperature, rho_v and h_fg at T_sat. Also inclined plates with g cos(theta), and vertical tubes with a thin film. For wavy or turbulent films: h_cond_vert",
            rangeText: 'wave-free laminar film, Re_delta <= 30', ranges: [],
            f: (L, dT, rl, rv, k, mu, hfgp, g = G0) => {
                const h = 0.943 * pow(g * rl * (rl - rv) * k * k * k * hfgp / (mu * dT * L), 1 / 4), Re = 4 * h * L * dT / (mu * hfgp);
                if (Re > 30) Corr.warn('h_cond_plate', `Re_delta = ${Corr.fmt(Re)} is above 30, the limit of the wave-free laminar film (Eq. 10.38); h_cond_vert covers wavy and turbulent films`);
                return h;
            }
        },
        h_cond_vert: {
            group: 'Condensation', args: ['L [m]', 'DeltaT [K]', 'rho_l [kg/m^3]', 'k_l [W/(m K)]', 'mu_l [Pa s]', 'Pr_l', 'hfg_p [J/kg]', 'g? [m/s^2]'], out: 'W/(m^2 K)',
            eq: 'Eqs. 10.38 to 10.44', d: "Average coefficient, film condensation on a vertical plate of height L, laminar, wavy-laminar or turbulent: Re_delta from Eq. 10.42 (wave-free, up to 30), 10.43 (wavy, up to 1800) or 10.44 (turbulent), whichever falls in its range, then h = Re_delta mu_l hfg_p/(4 L DeltaT) (Eq. 10.41); rho_l >> rho_v. Properties as for h_cond_plate; the film Reynolds number is then 4 h L DeltaT/(mu_l hfg_p)",
            rangeText: 'all Re_delta (data for water from 1 to 7200)', ranges: [],
            f: (L, dT, rl, k, mu, Pr, hfgp, g = G0) => {
                const P = k * L * dT / (mu * hfgp * pow(pow(mu / rl, 2) / g, 1 / 3));
                let Re = 3.78 * pow(P, 3 / 4);                                                                         // Eq. 10.42
                if (Re > 30) Re = pow(3.70 * P + 4.8, 0.82);                                                           // Eq. 10.43
                if (Re > 1800) Re = pow(0.069 * P * Math.sqrt(Pr) - 151 * Math.sqrt(Pr) + 253, 4 / 3);                 // Eq. 10.44
                return Re * mu * hfgp / (4 * L * dT);
            }
        },
        h_cond_tube: {
            group: 'Condensation', args: ['D [m]', 'DeltaT [K]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'k_l [W/(m K)]', 'mu_l [Pa s]', 'hfg_p [J/kg]', 'N?', 'g? [m/s^2]'], out: 'W/(m^2 K)',
            eq: 'Eqs. 10.45, 10.46', d: "Average coefficient, laminar film condensation on the outside of a horizontal tube of diameter D, or the average over a vertical tier of N tubes (default 1): 0.729 [g rho_l (rho_l - rho_v) k_l^3 hfg_p/(N mu_l DeltaT D)]^(1/4), DeltaT = T_sat - T_s, hfg_p = hfg_corrected(h_fg, cp_l, DeltaT, 'condensation'). Properties as for h_cond_plate",
            rangeText: 'laminar film; reliable for Ja < 0.1', ranges: [],
            f: (D, dT, rl, rv, k, mu, hfgp, N = 1, g = G0) => 0.729 * pow(g * rl * (rl - rv) * k * k * k * hfgp / (N * mu * dT * D), 1 / 4)
        },
        h_cond_sphere: {
            group: 'Condensation', args: ['D [m]', 'DeltaT [K]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'k_l [W/(m K)]', 'mu_l [Pa s]', 'hfg_p [J/kg]', 'g? [m/s^2]'], out: 'W/(m^2 K)',
            eq: 'Eq. 10.45', d: 'Average coefficient, laminar film condensation on a sphere of diameter D: 0.826 [g rho_l (rho_l - rho_v) k_l^3 hfg_p/(mu_l DeltaT D)]^(1/4); arguments as for h_cond_tube',
            rangeText: 'laminar film', ranges: [],
            f: (D, dT, rl, rv, k, mu, hfgp, g = G0) => 0.826 * pow(g * rl * (rl - rv) * k * k * k * hfgp / (mu * dT * D), 1 / 4)
        },
        h_chato: {
            group: 'Condensation', args: ['D [m]', 'DeltaT [K]', 'rho_l [kg/m^3]', 'rho_v [kg/m^3]', 'k_l [W/(m K)]', 'mu_l [Pa s]', 'hfg_p [J/kg]', 'g? [m/s^2]'], out: 'W/(m^2 K)',
            eq: 'Eq. 10.47', d: "Average coefficient, condensation inside a horizontal tube of diameter D at low vapor velocity (Chato): 0.555 [g rho_l (rho_l - rho_v) k_l^3 hfg_p/(mu_l DeltaT D)]^(1/4), with hfg_p = hfg_corrected(h_fg, cp_l, DeltaT, 'chato'). Properties as for h_cond_plate",
            rangeText: 'vapor Reynolds number at the inlet, rho_v u_m,v D/mu_v, below 35000', ranges: [],
            f: (D, dT, rl, rv, k, mu, hfgp, g = G0) => 0.555 * pow(g * rl * (rl - rv) * k * k * k * hfgp / (mu * dT * D), 1 / 4)
        },
        h_dropwise: {
            group: 'Condensation', args: ['T_sat [K]'], out: 'W/(m^2 K)',
            eq: 'Eqs. 10.49, 10.50', d: 'Coefficient, dropwise condensation of steam on well-promoted copper surfaces: 51104 + 2044 T_sat (T_sat in degC) up to 100 degC, 255510 above (W/(m^2 K)). Give T_sat as a temperature (in K internally)',
            rangeText: 'T_sat >= 22 degC', ranges: [],
            f: (T) => {
                const t = T - 273.15;
                if (t < 22) Corr.warn('h_dropwise', `T_sat = ${Corr.fmt(t)} degC is below 22 degC, the limit of its range (Eq. 10.49)`);
                return t <= 100 ? 51104 + 2044 * t : 255510;
            }
        },

        // ---------------- Heat exchangers. The epsilon-NTU formulas of Tables 11.3 and 11.4 are in the help, to paste
        eps_regenerator: {
            group: 'Heat exchangers', args: ['NTU_o', 'C_r', 'Cr_star', 'hA_star?'], eq: 'Periodic-flow model of Shah and Sekulic (2003), Ch. 5; see Heat exchangers',
            d: 'Effectiveness q/(C_min (T_h,i - T_c,i)) of a counterflow rotary (or fixed-bed) regenerator at its periodic steady state, computed from the energy equations of the gases and the matrix over the hot and cold periods. NTU_o = [1/(1/(hA)_h + 1/(hA)_c)]/C_min; C_r = C_min/C_max; Cr_star = C_matrix/C_min, with C_matrix = M_matrix c_matrix (revolutions per second) for a rotary regenerator; hA_star = (hA) on the C_min side/(hA) on the C_max side (default 1). Constant properties, no longitudinal conduction in the matrix, no leakage or carryover',
            rangeText: 'NTU_o <= 50 (grid accuracy better than 1e-5 below about 20)', ranges: [['NTU_o', 0, 50], ['C_r', 0, 1]],
            f: (NTUo, Cr, Crs, hAs = 1) => regenerator(NTUo, Cr, Crs, hAs)
        },

        // ---------------- Fins (Chapter 3)
        fin_q: {
            group: 'Fins', args: ['tip$', 'mL', 'p?'], eq: 'Table 3.4', d: "Fin heat rate over M = (h P k A_c)^(1/2) theta_b, uniform cross section, m = (h P/(k A_c))^(1/2); tip 'convection' (p = h/(m k)): (sinh mL + p cosh mL)/(cosh mL + p sinh mL); 'adiabatic': tanh mL; 'temperature' (p = theta_L/theta_b): (cosh mL - p)/sinh mL; 'infinite': 1",
            ranges: [], f: (tip, mL, p = 0) => {
                const t = mode(tip, ['convection', 'adiabatic', 'temperature', 'infinite'], 'fin_q'), th = Math.tanh(mL);
                if (t === 'adiabatic') return th;
                if (t === 'infinite') return 1;
                if (t === 'convection') return (th + p) / (1 + p * th);
                return mL === 0 ? Infinity : 1 / th - p * 2 * Math.exp(-mL) / (1 - Math.exp(-2 * mL));
            }
        },
        fin_theta: {
            group: 'Fins', args: ['tip$', 'mL', 'x_L', 'p?'], eq: 'Table 3.4', d: "Temperature ratio theta/theta_b = (T - T_inf)/(T_b - T_inf) at x/L along a fin of uniform cross section; tips and p as for fin_q. For 'infinite', exp(-mL x/L) (L any reference length)",
            ranges: [['x_L', 0, 1]], f: (tip, mL, xL, p = 0) => {
                const t = mode(tip, ['convection', 'adiabatic', 'temperature', 'infinite'], 'fin_theta'), a = mL * (1 - xL);
                if (t === 'infinite') return Math.exp(-mL * xL);
                if (t === 'adiabatic') return chRatio(a, mL, 0);
                if (t === 'convection') return chRatio(a, mL, p);
                return mL === 0 ? 1 - xL + p * xL : p * shRatio(mL * xL, mL) + shRatio(a, mL);
            }
        },
        eta_fin: {
            group: 'Fins', args: ['shape$', 'mL'], eq: 'Table 3.5, Eqs. 3.89, 3.93 to 3.97', d: "Fin efficiency; shape 'straight_rectangular' or 'pin' (tanh(mL)/mL, with the corrected length L_c = L + t/2 or L + D/4 in mL), 'straight_triangular': I1(2mL)/(mL I0(2mL)), 'straight_parabolic': 2/([4(mL)^2 + 1]^(1/2) + 1), 'pin_triangular': 2 I2(2mL)/(mL I1(2mL)), 'pin_parabolic': 2/([(4/9)(mL)^2 + 1]^(1/2) + 1). m = (2h/(k t))^(1/2) for straight fins, (4h/(k D))^(1/2) for pins",
            ranges: [], f: (shape, mL) => {
                const sh = mode(shape, ['straight_rectangular', 'pin', 'straight_triangular', 'straight_parabolic', 'pin_triangular', 'pin_parabolic'], 'eta_fin');
                if (mL === 0) return 1;
                if (sh === 'straight_rectangular' || sh === 'pin') return Math.tanh(mL) / mL;
                if (sh === 'straight_triangular') return besselI(1, 2 * mL) / (mL * besselI(0, 2 * mL));
                if (sh === 'straight_parabolic') return 2 / (Math.sqrt(4 * mL * mL + 1) + 1);
                if (sh === 'pin_triangular') return 2 * besselI(2, 2 * mL) / (mL * besselI(1, 2 * mL));
                return 2 / (Math.sqrt(4 / 9 * mL * mL + 1) + 1);
            }
        },
        eta_fin_annular: {
            group: 'Fins', args: ['m_r1', 'r2c_r1'], eq: 'Eq. 3.91', d: 'Efficiency of an annular fin of rectangular profile, m = (2h/(k t))^(1/2), inner radius r1 and corrected outer radius r2c = r2 + t/2: C2 [K1(m r1) I1(m r2c) - I1(m r1) K1(m r2c)]/[I0(m r1) K1(m r2c) + K0(m r1) I1(m r2c)], C2 = (2 r1/m)/(r2c^2 - r1^2)',
            ranges: [['r2c_r1', 1, Infinity]], f: (a, r) => {
                if (r === 1) return 1;
                const b = a * r, C2 = 2 * a / (b * b - a * a);
                return C2 * (besselK(1, a) * besselI(1, b) - besselI(1, a) * besselK(1, b)) / (besselI(0, a) * besselK(1, b) + besselK(0, a) * besselI(1, b));
            }
        },

        // ---------------- Transient conduction (Chapter 5)
        zeta_n: {
            group: 'Transient conduction', args: ['geometry$', 'Bi', 'n?'], eq: 'Eqs. 5.39c, 5.50c, 5.51c', d: "n-th eigenvalue (default the first, zeta_1 of Table 5.1) for a plane wall (Bi = hL/k, L the half-thickness): zeta tan zeta = Bi; a long cylinder (Bi = h r_o/k): zeta J1(zeta)/J0(zeta) = Bi; a sphere: 1 - zeta cot zeta = Bi; geometry 'wall', 'cylinder' or 'sphere'",
            ranges: [], f: (geo, Bi, n = 1) => { if (n !== Math.round(n) || n < 1) throw new Error(`zeta_n(): n = ${n} should be a positive integer`); return eigen(mode(geo, Object.keys(GEO), 'zeta_n'), Bi, n)[0]; }
        },
        c_n: {
            group: 'Transient conduction', args: ['geometry$', 'Bi', 'n?'], eq: 'Eqs. 5.39b, 5.50b, 5.51b', d: 'Coefficient C_n of the series (default C_1 of Table 5.1): wall 4 sin zeta/(2 zeta + sin 2 zeta); cylinder (2/zeta) J1(zeta)/(J0^2(zeta) + J1^2(zeta)); sphere 4 (sin zeta - zeta cos zeta)/(2 zeta - sin 2 zeta)',
            ranges: [], f: (geo, Bi, n = 1) => { if (n !== Math.round(n) || n < 1) throw new Error(`c_n(): n = ${n} should be a positive integer`); return eigen(mode(geo, Object.keys(GEO), 'c_n'), Bi, n)[1]; }
        },
        theta_transient: {
            group: 'Transient conduction', args: ['geometry$', 'Bi', 'Fo', 'x_L'], eq: 'Eqs. 5.39a, 5.50a, 5.51a', d: "Temperature ratio (T - T_inf)/(T_i - T_inf) in a plane wall, long cylinder or sphere suddenly exposed to convection, from the full series (as many terms as needed; the one-term form of Sec. 5.5 is its first term). x_L = x/L or r/r_o (0 at the center); Fo = alpha t/L^2 or alpha t/r_o^2",
            ranges: [['x_L', 0, 1]], f: (geo, Bi, Fo, xL) => {
                const g = mode(geo, Object.keys(GEO), 'theta_transient');
                if (Fo === 0 || Bi === 0) return 1;
                const r = series(g, Bi, Fo, (z) => GEO[g].X(z, xL));
                if (r.n > 400) Corr.warn('theta_transient', `Fo = ${Corr.fmt(Fo)} is too small for 400 terms of the series; use the semi-infinite solid (theta_semiinf)`);
                return r.s;
            }
        },
        q_q0_transient: {
            group: 'Transient conduction', args: ['geometry$', 'Bi', 'Fo'], eq: 'Eqs. 5.46, 5.52', d: 'Fraction Q/Q_o of the initial energy (relative to T_inf) transferred up to Fo, plane wall, long cylinder or sphere, full series',
            ranges: [], f: (geo, Bi, Fo) => {
                const g = mode(geo, Object.keys(GEO), 'q_q0_transient');
                if (Fo === 0 || Bi === 0) return 0;
                const r = series(g, Bi, Fo, GEO[g].Q);
                if (r.n > 400) Corr.warn('q_q0_transient', `Fo = ${Corr.fmt(Fo)} is too small for 400 terms of the series; use the semi-infinite solid`);
                return 1 - r.s;
            }
        },
        theta_semiinf: {
            group: 'Transient conduction', args: ['case$', 'eta', 'beta?'], eq: 'Eqs. 5.57, 5.59, 5.60', d: "Semi-infinite solid, eta = x/(2 (alpha t)^(1/2)); case 'temperature' (surface suddenly at T_s): (T - T_s)/(T_i - T_s) = erf(eta); 'flux' (constant q''_o): (T - T_i) k/(q''_o (alpha t)^(1/2)) = (2/pi^(1/2)) exp(-eta^2) - 2 eta erfc(eta); 'convection' (beta = h (alpha t)^(1/2)/k): (T - T_i)/(T_inf - T_i) = erfc(eta) - exp(2 eta beta + beta^2) erfc(eta + beta)",
            ranges: [], f: (c, eta, beta) => {
                const k = mode(c, ['temperature', 'flux', 'convection'], 'theta_semiinf');
                if (k === 'temperature') return 1 - erfc(eta);
                if (k === 'flux') return 2 / Math.sqrt(Math.PI) * Math.exp(-eta * eta) - 2 * eta * erfc(eta);
                if (beta === undefined) throw new Error("theta_semiinf(): the 'convection' case needs beta = h (alpha t)^(1/2)/k");
                return erfc(eta) - Math.exp(-eta * eta) * erfcx(eta + beta);
            }
        },

        qstar_ts: {
            group: 'Transient conduction', args: ['geometry$', 'Fo', 'q_ss?'], eq: 'Table 5.2a', d: "Dimensionless heat rate q* = q''_s L_c/(k (T_s - T_i)) after a sudden change of the surface temperature to T_s; geometry 'semiinfinite': 1/(pi Fo)^(1/2); interior 'wall' (L_c = half-thickness), 'cylinder', 'sphere' (L_c = r_o): the exact series; exterior 'sphere_exterior' (T_i of the medium): 1/(pi Fo)^(1/2) + 1; 'shape_exterior' (L_c = (A_s/4pi)^(1/2), cases 12 to 15 of Table 4.1): 1/(pi Fo)^(1/2) + q_ss, with q_ss = qss_star(shape)",
            ranges: [], f: (geo, Fo, qss) => {
                const g = mode(geo, ['semiinfinite', 'wall', 'cylinder', 'sphere', 'sphere_exterior', 'shape_exterior'], 'qstar_ts');
                if (Fo === 0) return Infinity;
                const s = 1 / Math.sqrt(Math.PI * Fo);
                if (g === 'semiinfinite') return s;
                if (g === 'sphere_exterior') return s + 1;
                if (g === 'shape_exterior') { if (qss === undefined) throw new Error("qstar_ts(): 'shape_exterior' needs q_ss (qss_star)"); return s + qss; }
                return 2 * tsum(g, Fo, 0);
            }
        },
        qstar_qs: {
            group: 'Transient conduction', args: ['geometry$', 'Fo', 'q_ss?'], eq: 'Table 5.2b', d: "Dimensionless heat rate q* = q''_s L_c/(k (T_s - T_i)) for a constant surface heat flux, T_s(t) the surface temperature it produces; geometries as for qstar_ts; exact: semi-infinite (1/2)(pi/Fo)^(1/2); wall [Fo + 1/3 - 2 sum exp(-l^2 Fo)/l^2]^(-1), l = n pi; cylinder [2Fo + 1/4 - 2 sum ...]^(-1), J1(l) = 0; sphere [3Fo + 1/5 - 2 sum ...]^(-1), tan l = l; sphere exterior [1 - exp(Fo) erfc(Fo^(1/2))]^(-1); 'shape_exterior' only approximately: (1/2)(pi/Fo)^(1/2) + pi/4 for Fo < 0.2, 0.77/Fo^(1/2) + q_ss above",
            ranges: [], f: (geo, Fo, qss) => {
                const g = mode(geo, ['semiinfinite', 'wall', 'cylinder', 'sphere', 'sphere_exterior', 'shape_exterior'], 'qstar_qs');
                if (Fo === 0) return Infinity;
                if (g === 'semiinfinite') return 0.5 * Math.sqrt(Math.PI / Fo);
                if (g === 'sphere_exterior') return 1 / (1 - erfcx(Math.sqrt(Fo)));
                if (g === 'shape_exterior') { if (qss === undefined) throw new Error("qstar_qs(): 'shape_exterior' needs q_ss (qss_star)"); return Fo < 0.2 ? 0.5 * Math.sqrt(Math.PI / Fo) + Math.PI / 4 : 0.77 / Math.sqrt(Fo) + qss; }
                const a = { wall: [1, 1 / 3], cylinder: [2, 1 / 4], sphere: [3, 1 / 5] }[g];
                return 1 / (a[0] * Fo + a[1] - 2 * tsum(g, Fo, 1));
            }
        },
        qss_star: {
            group: 'Conduction shape factors', args: ['shape$', 'd_D?'], eq: 'Table 4.1, cases 12 to 15', d: "Steady dimensionless conduction heat rate q*_ss = q L_c/(k A_s (T_1 - T_2)), L_c = (A_s/4pi)^(1/2), of an isothermal object in an infinite medium; shape 'sphere' 1 (A_s = pi D^2), 'disk' (thin, both faces) 2 2^(1/2)/pi = 0.900 (A_s = pi D^2/2), 'rectangle' (thin, both faces, A_s = 2wL) 0.932, 'cuboid' of square footprint D and height d (A_s = 2D^2 + 4Dd): linear in d/D between 0.943 at 0.1, 0.956 at 1, 0.961 at 2 and 1.111 at 10",
            ranges: [['d_D', 0.1, 10]], f: (sh, r) => {
                const k = mode(sh, ['sphere', 'disk', 'rectangle', 'cuboid'], 'qss_star');
                if (k === 'sphere') return 1; if (k === 'disk') return 2 * Math.SQRT2 / Math.PI; if (k === 'rectangle') return 0.932;
                if (r === undefined) throw new Error("qss_star(): 'cuboid' needs d_D, the height over the footprint width");
                return lin([[0.1, 0.943], [1, 0.956], [2, 0.961], [10, 1.111]], r, 1);
            }
        },
        sf_sphere_buried: {
            group: 'Conduction shape factors', args: ['D [m]', 'z [m]'], out: 'm', eq: 'Table 4.1, case 1', d: 'Shape factor S (q = S k (T_1 - T_2)) of an isothermal sphere of diameter D buried with its center at depth z under an isothermal surface: 2 pi D/(1 - D/(4z))',
            ranges: [], f: (D, z) => { if (z <= D / 2) throw new Error('sf_sphere_buried(): z must exceed D/2'); return 2 * Math.PI * D / (1 - D / (4 * z)); }
        },
        sf_cylinder_buried: {
            group: 'Conduction shape factors', args: ['D [m]', 'z [m]', 'L [m]'], out: 'm', eq: 'Table 4.1, case 2', d: 'Shape factor of a horizontal isothermal cylinder of diameter D and length L >> D, axis at depth z under an isothermal surface: 2 pi L/acosh(2z/D) (exact for the infinite cylinder; ln(4z/D) replaces acosh when z > 3D/2)',
            ranges: [], f: (D, z, L) => { if (z <= D / 2) throw new Error('sf_cylinder_buried(): z must exceed D/2'); shapeWarn('sf_cylinder_buried', L, D); return 2 * Math.PI * L / Math.acosh(2 * z / D); }
        },
        sf_cylinder_vertical: {
            group: 'Conduction shape factors', args: ['D [m]', 'L [m]'], out: 'm', eq: 'Table 4.1, case 3', d: 'Shape factor of a vertical isothermal cylinder of diameter D and length L >> D, reaching down from an isothermal surface: 2 pi L/ln(4L/D)',
            ranges: [], f: (D, L) => { shapeWarn('sf_cylinder_vertical', L, D); return 2 * Math.PI * L / Math.log(4 * L / D); }
        },
        sf_two_cylinders: {
            group: 'Conduction shape factors', args: ['D1 [m]', 'D2 [m]', 'w [m]', 'L [m]'], out: 'm', eq: 'Table 4.1, case 4', d: 'Shape factor between two parallel isothermal cylinders of diameters D1 and D2, axes w apart, length L >> D1, D2, w, in an infinite medium: 2 pi L/acosh[(4w^2 - D1^2 - D2^2)/(2 D1 D2)]',
            ranges: [], f: (D1, D2, w, L) => { if (2 * w <= D1 + D2) throw new Error('sf_two_cylinders(): the cylinders overlap (w must exceed (D1 + D2)/2)'); shapeWarn('sf_two_cylinders', L, Math.max(D1, D2, w)); return 2 * Math.PI * L / Math.acosh((4 * w * w - D1 * D1 - D2 * D2) / (2 * D1 * D2)); }
        },
        sf_cylinder_planes: {
            group: 'Conduction shape factors', args: ['D [m]', 'z [m]', 'L [m]'], out: 'm', eq: 'Table 4.1, case 5', d: 'Shape factor of a cylinder of diameter D and length L >> z midway between two parallel isothermal planes a distance z from its axis (2z apart): 2 pi L/ln(8z/(pi D)), z >> D/2',
            ranges: [], f: (D, z, L) => { if (z <= D / 2) throw new Error('sf_cylinder_planes(): z must exceed D/2'); shapeWarn('sf_cylinder_planes', L, z); return 2 * Math.PI * L / Math.log(8 * z / (Math.PI * D)); }
        },
        sf_cylinder_square: {
            group: 'Conduction shape factors', args: ['D [m]', 'w [m]', 'L [m]'], out: 'm', eq: 'Table 4.1, case 6', d: 'Shape factor of a circular cylinder of diameter D centered in a square solid of side w and the same length L >> w: 2 pi L/ln(1.08 w/D), w > D',
            ranges: [], f: (D, w, L) => { if (w <= D) throw new Error('sf_cylinder_square(): w must exceed D'); return 2 * Math.PI * L / Math.log(1.08 * w / D); }
        },
        sf_eccentric: {
            group: 'Conduction shape factors', args: ['D [m]', 'd [m]', 'z [m]', 'L [m]'], out: 'm', eq: 'Table 4.1, case 7', d: 'Shape factor between a cylinder of diameter d inside a cylinder of diameter D, axes z apart, length L >> D: 2 pi L/acosh[(D^2 + d^2 - 4z^2)/(2 D d)] (z = 0: concentric, 2 pi L/ln(D/d))',
            ranges: [], f: (D, d, z, L) => { if (d + 2 * z >= D) throw new Error('sf_eccentric(): the inner cylinder must lie inside the outer one (d + 2z < D)'); return 2 * Math.PI * L / Math.acosh((D * D + d * d - 4 * z * z) / (2 * D * d)); }
        },
        sf_wall_edge: {
            group: 'Conduction shape factors', args: ['D [m]'], out: 'm', eq: 'Table 4.1, case 8', d: 'Shape factor of the edge where two walls of thickness L meet, edge length D > 5L: 0.54 D (add to the two plane walls)',
            ranges: [], f: (D) => 0.54 * D
        },
        sf_wall_corner: {
            group: 'Conduction shape factors', args: ['L [m]'], out: 'm', eq: 'Table 4.1, case 9', d: 'Shape factor of the corner where three walls of thickness L meet (L much smaller than their length and width): 0.15 L',
            ranges: [], f: (L) => 0.15 * L
        },
        sf_disk: {
            group: 'Conduction shape factors', args: ['D [m]'], out: 'm', eq: 'Table 4.1, case 10', d: 'Shape factor of an isothermal disk of diameter D on the surface of a semi-infinite medium: 2 D',
            ranges: [], f: (D) => 2 * D
        },
        sf_square_channel: {
            group: 'Conduction shape factors', args: ['W [m]', 'w [m]', 'L [m]'], out: 'm', eq: 'Table 4.1, case 11', d: 'Shape factor of a square channel of outer side W, inner side w and length L >> W: 2 pi L/(0.785 ln(W/w)) for W/w < 1.4, 2 pi L/(0.930 ln(W/w) - 0.050) above',
            ranges: [], f: (W, w, L) => { if (W <= w) throw new Error('sf_square_channel(): W must exceed w'); const r = W / w; return 2 * Math.PI * L / (r < 1.4 ? 0.785 * Math.log(r) : 0.930 * Math.log(r) - 0.050); }
        },

        // ---------------- Radiation (Chapters 12 and 13)
        f_blackbody: {
            group: 'Radiation', args: ['lambda [m]', 'T [K]'], out: '', eq: 'Eq. 12.30, Table 12.1', d: 'Blackbody radiation function F(0 -> lambda): the fraction of blackbody emission between wavelengths 0 and lambda at temperature T, from the exact series in lambda T. Give lambda with a unit tag, such as lambda = 2 [um]; F(lambda1 -> lambda2) = f_blackbody(lambda2, T) - f_blackbody(lambda1, T)',
            ranges: [], f: (l, T) => fBlack(l * T)
        },
        lambda_blackbody: {
            group: 'Radiation', args: ['F', 'T [K]'], out: 'm', eq: 'Eq. 12.30 inverted', d: 'Wavelength lambda below which the fraction F of blackbody emission at T lies: the inverse of f_blackbody (so that f_blackbody(lambda_blackbody(F, T), T) = F), 0 < F < 1. Solving f_blackbody(lambda, T) = F for lambda works too, but needs a guess near the answer, since F is flat far from it',
            ranges: [['F', 0, 1]], f: (F, T) => {
                if (!(F > 0 && F < 1)) throw new Error(`lambda_blackbody(): F = ${F} must be between 0 and 1`);
                let lo = Math.log(100e-6), hi = Math.log(1e6 * 1e-6);   // ln(lambda T) in m K, from 100 to 1e6 um K
                while (fBlack(Math.exp(hi)) < F) hi += 2;
                while (fBlack(Math.exp(lo)) > F) lo -= 0.5;
                for (let k = 0; k < 200 && hi - lo > 1e-15; k++) { const m = (lo + hi) / 2; if (fBlack(Math.exp(m)) < F) lo = m; else hi = m; }
                return Math.exp((lo + hi) / 2) / T;
            }
        },
        eb_lambda: {
            group: 'Radiation', args: ['lambda [m]', 'T [K]'], out: 'W/m^3', eq: 'Eq. 12.26', d: 'Spectral emissive power of a blackbody (Planck): C1/(lambda^5 [exp(C2/(lambda T)) - 1]), C1 = 2 pi h c^2, C2 = h c/k (CODATA 2018), in W/(m^2 m); divide by 1e6 for W/(m^2 um)',
            ranges: [], f: (l, T) => C1R / (l ** 5 * Math.expm1(C2R / (l * T)))
        },
        vf_parallel_plates: {
            group: 'Radiation', args: ['W_i', 'W_j'], eq: 'Table 13.1', d: 'View factor F_ij, two-dimensional parallel plates of widths w_i and w_j a distance L apart, centered on a common perpendicular; W = w/L: {[(W_i + W_j)^2 + 4]^(1/2) - [(W_j - W_i)^2 + 4]^(1/2)}/(2 W_i)',
            ranges: [], f: (Wi, Wj) => (Math.sqrt((Wi + Wj) ** 2 + 4) - Math.sqrt((Wj - Wi) ** 2 + 4)) / (2 * Wi)
        },
        vf_inclined_plates: {
            group: 'Radiation', args: ['alpha_deg'], eq: 'Table 13.1', d: 'View factor, two-dimensional plates of equal width with a common edge, at an angle alpha (degrees): 1 - sin(alpha/2)',
            ranges: [['alpha_deg', 0, 180]], f: (a) => 1 - Math.sin(a * Math.PI / 360)
        },
        vf_perpendicular_plates: {
            group: 'Radiation', args: ['wj_wi'], eq: 'Table 13.1', d: 'View factor F_ij, two-dimensional perpendicular plates with a common edge, widths w_i and w_j: [1 + w_j/w_i - (1 + (w_j/w_i)^2)^(1/2)]/2',
            ranges: [], f: (r) => (1 + r - Math.sqrt(1 + r * r)) / 2
        },
        vf_three_sided: {
            group: 'Radiation', args: ['wj_wi', 'wk_wi'], eq: 'Table 13.1', d: 'View factor F_ij, two-dimensional three-sided enclosure of widths w_i, w_j, w_k: (w_i + w_j - w_k)/(2 w_i)',
            ranges: [], f: (rj, rk) => { if (rk > 1 + rj || rj > 1 + rk || 1 > rj + rk) throw new Error(`vf_three_sided(): the widths 1, ${Corr.fmt(rj)}, ${Corr.fmt(rk)} cannot form a triangle`); return (1 + rj - rk) / 2; }
        },
        vf_parallel_cylinders: {
            group: 'Radiation', args: ['R', 'S'], eq: 'Table 13.1', d: 'View factor F_ij, long parallel cylinders of radii r_i and r_j, gap s between their surfaces; R = r_j/r_i, S = s/r_i, C = 1 + R + S: (1/2pi){pi + [C^2 - (R + 1)^2]^(1/2) - [C^2 - (R - 1)^2]^(1/2) + (R - 1) acos(R/C - 1/C) - (R + 1) acos(R/C + 1/C)}',
            ranges: [], f: (R, S) => {
                const C = 1 + R + S;
                return (Math.PI + Math.sqrt(C * C - (R + 1) ** 2) - Math.sqrt(C * C - (R - 1) ** 2) + (R - 1) * Math.acos(R / C - 1 / C) - (R + 1) * Math.acos(R / C + 1 / C)) / (2 * Math.PI);
            }
        },
        vf_cylinder_rectangle: {
            group: 'Radiation', args: ['r_L', 's1_L', 's2_L'], eq: 'Table 13.1', d: 'View factor F_ij from a parallel plane strip (from s_2 to s_1 along it, measured from the foot of the perpendicular through the axis) to a long cylinder of radius r whose axis is a distance L from the plane: [r/(s_1 - s_2)] [atan(s_1/L) - atan(s_2/L)]',
            signed: ['s1_L', 's2_L'], ranges: [], f: (r, s1, s2) => r / (s1 - s2) * (Math.atan(s1) - Math.atan(s2))
        },
        vf_plane_cylinders: {
            group: 'Radiation', args: ['D_s'], eq: 'Table 13.1', d: 'View factor F_ij from an infinite plane to a row of long cylinders of diameter D, pitch s: 1 - [1 - (D/s)^2]^(1/2) + (D/s) atan{[(s^2 - D^2)/D^2]^(1/2)}',
            ranges: [['D_s', 0, 1]], f: (r) => 1 - Math.sqrt(1 - r * r) + r * Math.atan(Math.sqrt(1 - r * r) / r)
        },
        vf_aligned_rectangles: {
            group: 'Radiation', args: ['X_L', 'Y_L'], eq: 'Table 13.2, Fig. 13.4', d: 'View factor between aligned parallel rectangles X by Y a distance L apart: (2/(pi X Y)) {ln[(1 + X^2)(1 + Y^2)/(1 + X^2 + Y^2)]^(1/2) + X (1 + Y^2)^(1/2) atan[X/(1 + Y^2)^(1/2)] + Y (1 + X^2)^(1/2) atan[Y/(1 + X^2)^(1/2)] - X atan X - Y atan Y}, with X = X/L, Y = Y/L',
            ranges: [], f: (X, Y) => 2 / (Math.PI * X * Y) * (0.5 * Math.log((1 + X * X) * (1 + Y * Y) / (1 + X * X + Y * Y)) + X * Math.sqrt(1 + Y * Y) * Math.atan(X / Math.sqrt(1 + Y * Y))
                + Y * Math.sqrt(1 + X * X) * Math.atan(Y / Math.sqrt(1 + X * X)) - X * Math.atan(X) - Y * Math.atan(Y))
        },
        vf_coaxial_disks: {
            group: 'Radiation', args: ['ri_L', 'rj_L'], eq: 'Table 13.2, Fig. 13.5', d: 'View factor F_ij between coaxial parallel disks of radii r_i and r_j a distance L apart; R = r/L, S = 1 + (1 + R_j^2)/R_i^2: (1/2){S - [S^2 - 4 (r_j/r_i)^2]^(1/2)}',
            ranges: [], f: (Ri, Rj) => { const S = 1 + (1 + Rj * Rj) / (Ri * Ri); return (S - Math.sqrt(S * S - 4 * (Rj / Ri) ** 2)) / 2; }
        },
        vf_perpendicular_rectangles: {
            group: 'Radiation', args: ['Y_X', 'Z_X'], eq: 'Table 13.2, Fig. 13.6', d: 'View factor F_ij, perpendicular rectangles with a common edge of length X: i is X by Y, j is X by Z; W = Y/X, H = Z/X: (1/(pi W)){W atan(1/W) + H atan(1/H) - (H^2 + W^2)^(1/2) atan[1/(H^2 + W^2)^(1/2)] + (1/4) ln{[(1 + W^2)(1 + H^2)/(1 + W^2 + H^2)] [W^2 (1 + W^2 + H^2)/((1 + W^2)(W^2 + H^2))]^(W^2) [H^2 (1 + H^2 + W^2)/((1 + H^2)(H^2 + W^2))]^(H^2)}}',
            ranges: [], f: (W, H) => {
                const W2 = W * W, H2 = H * H, s = Math.sqrt(H2 + W2);
                const lg = Math.log((1 + W2) * (1 + H2) / (1 + W2 + H2)) + W2 * Math.log(W2 * (1 + W2 + H2) / ((1 + W2) * (W2 + H2))) + H2 * Math.log(H2 * (1 + H2 + W2) / ((1 + H2) * (H2 + W2)));
                return (W * Math.atan(1 / W) + H * Math.atan(1 / H) - s * Math.atan(1 / s) + lg / 4) / (Math.PI * W);
            }
        },

        // ---------------- Generalized compressibility (Lee-Kesler)
        lk_z: {
            group: 'Generalized compressibility', args: ['Tr', 'Pr', 'omega?', 'phase$?'], signed: ['omega'], eq: 'Lee and Kesler (1975)', d: 'Compressibility factor Z = P v/(R T)',
            ranges: [['Tr', 0.3, 4], ['Pr', 0, 10]], f: (Tr, Pr, w, ph) => leeKesler('lk_z', Tr, Pr, w, ph).Z
        },
        lk_hdep: {
            group: 'Generalized compressibility', args: ['Tr', 'Pr', 'omega?', 'phase$?'], signed: ['omega'], eq: 'Lee and Kesler (1975)', d: 'Enthalpy departure (h_ideal - h)/(R Tc), at the same T and P',
            ranges: [['Tr', 0.3, 4], ['Pr', 0, 10]], f: (Tr, Pr, w, ph) => -leeKesler('lk_hdep', Tr, Pr, w, ph).h
        },
        lk_sdep: {
            group: 'Generalized compressibility', args: ['Tr', 'Pr', 'omega?', 'phase$?'], signed: ['omega'], eq: 'Lee and Kesler (1975)', d: 'Entropy departure (s_ideal - s)/R, at the same T and P',
            ranges: [['Tr', 0.3, 4], ['Pr', 0, 10]], f: (Tr, Pr, w, ph) => -leeKesler('lk_sdep', Tr, Pr, w, ph).s
        },
        lk_phi: {
            group: 'Generalized compressibility', args: ['Tr', 'Pr', 'omega?', 'phase$?'], signed: ['omega'], eq: 'Lee and Kesler (1975)', d: 'Fugacity coefficient phi = f/P',
            ranges: [['Tr', 0.3, 4], ['Pr', 0, 10]], f: (Tr, Pr, w, ph) => Math.exp(leeKesler('lk_phi', Tr, Pr, w, ph).lnphi)
        },
        // ---------------- Compressible flow
        isentropic: {
            group: 'Compressible flow', args: ['out$', 'M', 'k'], eq: 'isentropic flow', d: "Isentropic flow ratios: 'T/T0', 'P/P0', 'rho/rho0', 'A/A*', 'M*'", ranges: [],
            f: (s, M, k) => flow('isentropic', ISEN, s, M, k)
        },
        isentropic_mach: {
            group: 'Compressible flow', args: ['in$', 'value', 'k', 'branch$?'], eq: 'isentropic flow', d: "Mach number from an isentropic ratio; 'A/A*' needs 'subsonic' or 'supersonic'", ranges: [],
            f: (s, v, k, b) => flowMach('isentropic_mach', ISEN, s, v, k, b)
        },
        normalshock: {
            group: 'Compressible flow', args: ['out$', 'M1', 'k'], eq: 'normal shock', d: "Normal shock: 'M2', 'P2/P1', 'T2/T1', 'rho2/rho1', 'P02/P01', 'P02/P1'", ranges: [],
            f: (s, M, k) => flow('normalshock', SHOCK, s, M, k, 1)
        },
        normalshock_mach: {
            group: 'Compressible flow', args: ['in$', 'value', 'k'], eq: 'normal shock', d: 'Upstream Mach number M1 from one of the normal shock ratios', ranges: [],
            f: (s, v, k) => { kCheck('normalshock_mach', k); const f = pick('normalshock_mach', s, SHOCK); return machFrom('normalshock_mach', f, k, v, [[true]], f.label); }
        },
        fanno: {
            group: 'Compressible flow', args: ['out$', 'M', 'k'], eq: 'Fanno flow', d: "Adiabatic flow with friction: 'T/T*', 'P/P*', 'rho/rho*', 'V/V*', 'P0/P0*', 'fL*/D' (Darcy f)", ranges: [],
            f: (s, M, k) => flow('fanno', FANNO, s, M, k)
        },
        fanno_mach: {
            group: 'Compressible flow', args: ['in$', 'value', 'k', 'branch$?'], eq: 'Fanno flow', d: "Mach number from a Fanno ratio; 'fL*/D' and 'P0/P0*' need 'subsonic' or 'supersonic'", ranges: [],
            f: (s, v, k, b) => flowMach('fanno_mach', FANNO, s, v, k, b)
        },
        rayleigh: {
            group: 'Compressible flow', args: ['out$', 'M', 'k'], eq: 'Rayleigh flow', d: "Frictionless flow with heat transfer: 'T/T*', 'P/P*', 'rho/rho*', 'V/V*', 'T0/T0*', 'P0/P0*'", ranges: [],
            f: (s, M, k) => flow('rayleigh', RAYL, s, M, k)
        },
        rayleigh_mach: {
            group: 'Compressible flow', args: ['in$', 'value', 'k', 'branch$?'], eq: 'Rayleigh flow', d: "Mach number from a Rayleigh ratio; 'T0/T0*' and 'P0/P0*' need 'subsonic' or 'supersonic'", ranges: [],
            f: (s, v, k, b) => flowMach('rayleigh_mach', RAYL, s, v, k, b)
        },
        prandtlmeyer: {
            group: 'Compressible flow', args: ['M', 'k'], eq: 'Prandtl-Meyer expansion', d: 'Prandtl-Meyer function nu(M), in radians (tag the result [deg] to see degrees)', ranges: [],
            f: (M, k) => { kCheck('prandtlmeyer', k); if (M < 1) throw new Error(`prandtlmeyer(): M = ${M} must be at least 1`); return prandtlMeyer(M, k); }
        },
        prandtlmeyer_mach: {
            group: 'Compressible flow', args: ['nu', 'k'], eq: 'Prandtl-Meyer expansion', d: 'Mach number from the Prandtl-Meyer function nu, in radians', ranges: [],
            f: (nu, k) => { kCheck('prandtlmeyer_mach', k); return machFrom('prandtlmeyer_mach', prandtlMeyer, k, nu, [[true]], 'nu'); }
        },
        obliqueshock: {
            group: 'Compressible flow', args: ['out$', 'M1', 'in$', 'angle', 'k', 'branch$?'], eq: 'oblique shock', d: "Oblique shock from M1 and the deflection 'theta' (with 'weak', the default, or 'strong') or the wave angle 'beta', in radians", ranges: [],
            f: (s, M1, ik, a, k, b) => oblique(s, M1, ik, a, k, b)
        },

        particleflow: { group: 'Compressible flow', args: ['out$', 'M1', 'ML', 'ms', 'k', 'branch$?'], eq: 'Ruiz (2000)', d: "Gas flow after particles are mixed in (adiabatic, constant area): 'M2' (mixture), 'V2/V1', 'T2/T1', 'P2/P1', 'rho2/rho1', 'ds/R', 'ms_choke'", ranges: [],
            f: (s, M1, ML, ms, k, b) => particles(s, M1, ML, ms, k, b) },
        particleflow_ms: { group: 'Compressible flow', args: ['in$', 'value', 'M1', 'ML', 'k', 'branch$?'], eq: 'Ruiz (2000)', d: 'Particle loading ms that gives a value of one of the particleflow ratios (the smallest such ms)', ranges: [],
            f: (s, v, M1, ML, k, b) => particlesMs(s, v, M1, ML, k, b) },

        // ---------------- Special functions
        besselj: {
            group: 'Special functions', args: ['n', 'x'], eq: 'integral representation', d: 'Bessel function of the first kind J_n(x), integer order n', signed: ['n', 'x'], ranges: [],
            f: (n, x) => { if (n !== Math.round(n)) throw new Error('besselj(): the order n must be an integer'); return besselJ(n, x); }
        },
        besseli: {
            group: 'Special functions', args: ['n', 'x'], eq: 'integral representation', d: 'Modified Bessel function of the first kind I_n(x), integer order n', signed: ['n', 'x'], ranges: [],
            f: (n, x) => { if (n !== Math.round(n)) throw new Error('besseli(): the order n must be an integer'); return besselI(n, x); }
        },
        besselk: {
            group: 'Special functions', args: ['n', 'x'], eq: 'integral representation', d: 'Modified Bessel function of the second kind K_n(x), integer order n, x > 0', signed: ['n'], ranges: [],
            f: (n, x) => { if (n !== Math.round(n)) throw new Error('besselk(): the order n must be an integer'); if (x === 0) throw new Error('besselk(): x must be positive'); return besselK(n, x); }
        },
        erfc: {
            group: 'Special functions', args: ['x'], eq: 'series and continued fraction', d: 'Complementary error function erfc(x) = 1 - erf(x), accurate also where it is small (erf is the math.js function)', signed: ['x'], ranges: [],
            f: (x) => erfc(x)
        },
    };
})();

// Front end: the callables for equations, the range warnings, and the checks common to all correlations
const Corr = {
    fmt: (v) => String(+(+v).toPrecision(4)),
    warn(name, msg) { if (Interp.notes) Interp.notes.set(name + ': ' + msg, `${name}(): ${msg}`); },
    entries: {},
    build() {
        for (const [name, c] of Object.entries(CORRELATIONS)) {
            c.argn = c.args.map(a => a.replace(/\s*\[.*\]$/, ''));                 // 'mu_l [Pa s]': name 'mu_l', SI unit 'Pa s'
            c.argu = c.args.map(a => (a.match(/\[(.+)\]$/) || [])[1] || '');
            const req = c.argn.filter(a => !a.endsWith('?')).length;
            Corr.entries[name] = (...a) => {
                Interp.used = true;   // so that solve() re-evaluates at the solution and shows the range warnings
                const sig = `${name}(${c.argn.map(x => x.replace(/[$?]+$/, '')).join(', ')})`;
                if (a.length < req || a.length > c.argn.length) throw new Error(`${sig} takes ${req === c.argn.length ? req : `${req} to ${c.argn.length}`} arguments, got ${a.length}`);
                a.forEach((v, i) => {
                    const an = c.argn[i];
                    if (an.includes('$')) { if (typeof v !== 'string') throw new Error(`${sig}: ${an.replace(/[$?]/g, '')} must be text in quotes`); }
                    else if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${sig}: ${an.replace(/[$?]/g, '')} must be a number`);
                    else if ((v < 0 && !(c.signed || []).includes(an.replace(/[$?]/g, ''))) || (v === 0 && /^(Re|Re_x|Re_L|Re_max|Pr|Pr_s|mu_mus|L_D|b_a|Di_Do|f|S_L|H_L|r_i|r_o|D|L|mu_l|mu_v|h_fg|hfg_p|rho_l|sigma|k_l|k_v|C_sf|V|G|N|g|C|C_r|hA_star|W_i|W_j|R|wj_wi|wk_wi|D_s|r_L|X_L|Y_L|ri_L|rj_L|Y_X|Z_X|lambda|T|m_r1|r2c_r1|F|D|D1|D2|w|d|W|d_D)\??$/.test(an))) throw new Error(`${sig}: ${an.replace(/[$?]/g, '')} = ${v} must be positive`);
                });
                if (Interp.notes) {   // ranges, checked at the solution only
                    const val = { Pe: a[0] * a[1], Pe_x: a[0] * a[1], RePr: a[0] * a[1], RaS_L: a[0] * a[1] };
                    c.argn.forEach((an, i) => { val[an.replace(/[$?]/g, '')] = a[i]; });
                    for (const [k, lo, hi] of c.ranges) {
                        const v = val[k];
                        if (v === undefined) continue;
                        if (!(v < lo || v > hi)) continue;
                        const what = `${k.replace('RePr', 'Re Pr').replace('RaS_L', 'Ra_S S/L')} = ${Corr.fmt(v)}`;
                        Corr.warn(name, lo <= 0 ? `${what} is above ${Corr.fmt(hi)}, the limit of its range (${c.eq})`
                            : hi === Infinity ? `${what} is below ${Corr.fmt(lo)}, the limit of its range (${c.eq})`
                                : `${what} is outside its range, ${Corr.fmt(lo)} to ${Corr.fmt(hi)} (${c.eq})`);
                    }
                }
                return c.f(...a);
            };
        }
    },
};
Corr.build();
