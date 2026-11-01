// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Heat transfer and fluid flow correlations, as given in F. P. Incropera, D. P. DeWitt, T. L. Bergman, A. S. Lavine,
// Fundamentals of Heat and Mass Transfer, 6th ed., Wiley, 2007 (equation and table numbers below), plus the Colebrook
// equation (the basis of the Moody chart) and the Clift-Gauvin sphere drag correlation, which the book gives only as graphs.
// All arguments and results are dimensionless, except lc_cylinders and ls_spheres (lengths, in the units of the radii). Outside a correlation's stated range the value is still computed and
// a warning is shown, for the solution only (the solver may pass outside on the way), as with interpolate().

const CORRELATIONS = (() => {
    const pow = Math.pow;
    // Constant tables, as printed
    const HILPERT = [[0.4, 4, 0.989, 0.330], [4, 40, 0.911, 0.385], [40, 4000, 0.683, 0.466], [4000, 40000, 0.193, 0.618], [40000, 400000, 0.027, 0.805]];      // Table 7.2
    const ZUK_CYL = [[1, 40, 0.75, 0.4], [40, 1000, 0.51, 0.5], [1e3, 2e5, 0.26, 0.6], [2e5, 1e6, 0.076, 0.7]];                                               // Table 7.4
    const C2_BANK = { aligned: [[1, 0.70], [2, 0.80], [3, 0.86], [4, 0.90], [5, 0.92], [7, 0.95], [10, 0.97], [13, 0.98], [16, 0.99], [20, 1]],              // Table 7.8
                      staggered: [[1, 0.64], [2, 0.76], [3, 0.84], [4, 0.89], [5, 0.92], [7, 0.95], [10, 0.97], [13, 0.98], [16, 0.99], [20, 1]] };
    const MORGAN = [[1e-10, 1e-2, 0.675, 0.058], [1e-2, 1e2, 1.02, 0.148], [1e2, 1e4, 0.850, 0.188], [1e4, 1e7, 0.480, 0.250], [1e7, 1e12, 0.125, 0.333]];   // Table 9.1
    const CHANNEL = { symmetric_t: [576, 2.87, false], symmetric_q: [48, 2.51, true], asymmetric_t: [144, 2.87, false], asymmetric_q: [24, 2.51, true] };   // Table 9.3: C1, C2, isoflux
    const DUCT = {   // Table 8.1: b/a, Nu (uniform q''), Nu (uniform Ts), f Re
        rectangle: [[1.0, 3.61, 2.98, 57], [1.43, 3.73, 3.08, 59], [2.0, 4.12, 3.39, 62], [3.0, 4.79, 3.96, 69], [4.0, 5.33, 4.44, 73], [8.0, 6.49, 5.60, 82]],
        circle: [4.36, 3.66, 64], plates: [8.23, 7.54, 96], plates_insulated: [5.39, 4.86, 96], triangle: [3.11, 2.49, 53] };
    const ANNULUS = [[0.05, 17.46, 4.06], [0.10, 11.56, 4.11], [0.25, 7.37, 4.23], [0.50, 5.74, 4.43], [1.00, 4.86, 4.86]];   // Table 8.2: Di/Do, Nu_i, Nu_o
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

    // Each entry: args (names; '$' marks a text argument; '?' an optional one), f, ranges [[arg, lo, hi], ...] (warnings),
    // eq (source), d (what it is). Ranges for 'Re'-like arguments use the names below.
    return {
        // ---------------- Internal flow (Chapter 8)
        f_laminar: { group: 'Internal flow', args: ['Re'], eq: 'Eq. 8.19', d: 'Darcy friction factor, fully developed laminar flow in a circular tube: 64/Re',
            ranges: [['Re', 0, 2300]], f: (Re) => 64 / Re },
        f_petukhov: { group: 'Internal flow', args: ['Re'], eq: 'Eq. 8.21', d: 'Darcy friction factor, smooth tube, turbulent: (0.790 ln Re - 1.64)^-2',
            ranges: [['Re', 3000, 5e6]], f: petukhov },
        f_colebrook: { group: 'Internal flow', args: ['Re', 'eps_D'], eq: 'Colebrook (1939); the Moody chart, Fig. 8.3', d: 'Darcy friction factor, turbulent, relative roughness eps/D (0 for a smooth tube), from the implicit Colebrook equation',
            ranges: [['Re', 4000, 1e8], ['eps_D', 0, 0.05]],
            f: (Re, e) => {
                if (e < 0) throw new Error('f_colebrook(): the relative roughness eps_D cannot be negative');
                let x = 1 / Math.sqrt(petukhov(Math.max(Re, 3000)));   // x = 1/sqrt(f); Newton on x + 2 log10(e/3.7 + 2.51 x/Re) = 0
                for (let i = 0; i < 50; i++) {
                    const a = e / 3.7 + 2.51 * x / Re, g = x + 2 * Math.log10(a), dg = 1 + 2 / Math.LN10 * 2.51 / Re / a;
                    const dx = g / dg; x -= dx; if (Math.abs(dx) < 1e-15 * x) break;
                }
                return 1 / (x * x);
            } },
        nu_duct_lam: { rangeText: 'b/a from 1 to 8 for rectangles', group: 'Internal flow', args: ['shape$', 'b_a', 'condition$'], eq: 'Table 8.1', d: "Nusselt number, fully developed laminar flow; shape 'circle', 'rectangle' (aspect ratio b/a, 1 to 8), 'plates' (parallel plates, both heated), 'plates_insulated' (one side insulated) or 'triangle' (equilateral); condition 'q' (uniform heat flux) or 'T' (uniform surface temperature). Linear in b/a between the tabulated ratios",
            ranges: [], f: (shape, ba, cond) => {
                const s = mode(shape, Object.keys(DUCT), 'nu_duct_lam'), c = mode(cond, ['q', 't'], 'nu_duct_lam') === 'q' ? 1 : 2;
                if (s !== 'rectangle') return DUCT[s][c - 1];
                if (ba < 1 || ba > 8) Corr.warn('nu_duct_lam', `b/a = ${Corr.fmt(ba)} is outside Table 8.1, 1 to 8 (use b/a >= 1; 'plates' for very wide ducts)`);
                return lin(DUCT.rectangle, ba, c);
            } },
        fre_duct_lam: { rangeText: 'b/a from 1 to 8 for rectangles', group: 'Internal flow', args: ['shape$', 'b_a'], eq: 'Table 8.1', d: 'Product f Re (Darcy friction factor times Reynolds number, both on the hydraulic diameter), fully developed laminar flow; shapes as for nu_duct_lam',
            ranges: [], f: (shape, ba) => {
                const s = mode(shape, Object.keys(DUCT), 'fre_duct_lam');
                if (s !== 'rectangle') return DUCT[s][2];
                if (ba < 1 || ba > 8) Corr.warn('fre_duct_lam', `b/a = ${Corr.fmt(ba)} is outside Table 8.1, 1 to 8`);
                return lin(DUCT.rectangle, ba, 3);
            } },
        nu_annulus_lam: { group: 'Internal flow', args: ['Di_Do', 'surface$'], eq: 'Table 8.2', d: "Nusselt number on the hydraulic diameter, fully developed laminar flow in an annulus with one surface at constant temperature and the other insulated; surface 'inner' or 'outer' (the heated one). Linear between the tabulated ratios",
            ranges: [['Di_Do', 0.05, 1]], f: (r, surf) => lin(ANNULUS, r, mode(surf, ['inner', 'outer'], 'nu_annulus_lam') === 'inner' ? 1 : 2) },
        nu_hausen: { group: 'Internal flow', args: ['Re', 'Pr', 'L_D'], eq: 'Eq. 8.56', d: 'Average Nusselt number, laminar thermal entry length (fully developed velocity), uniform surface temperature; Gz = Re Pr/(L/D)',
            ranges: [['Re', 0, 2300]], f: (Re, Pr, LD) => { const Gz = Re * Pr / LD; return 3.66 + 0.0668 * Gz / (1 + 0.04 * pow(Gz, 2 / 3)); } },
        nu_siedertate_lam: { rangeText: 'Re <= 2300, 0.60 <= Pr <= 5, 0.0044 <= mu/mu_s <= 9.75; Nu >= 3.66', group: 'Internal flow', args: ['Re', 'Pr', 'L_D', 'mu_mus'], eq: 'Eq. 8.57', d: 'Average Nusselt number, laminar combined entry length, uniform surface temperature; mu_mus = mu/mu_s. The book recommends Nu = 3.66 when this gives less',
            ranges: [['Re', 0, 2300], ['Pr', 0.60, 5], ['mu_mus', 0.0044, 9.75]],
            f: (Re, Pr, LD, mr) => {
                const Nu = 1.86 * pow(Re * Pr / LD, 1 / 3) * pow(mr, 0.14);
                if (Nu < 3.66) Corr.warn('nu_siedertate_lam', `Nu = ${Corr.fmt(Nu)} is below 3.66: the book recommends Nu = 3.66 (fully developed conditions over much of the tube)`);
                return Nu;
            } },
        nu_dittusboelter: { group: 'Internal flow', args: ['Re', 'Pr', 'mode$'], eq: 'Eq. 8.60', d: "Nusselt number, fully developed turbulent flow in a smooth tube: 0.023 Re^0.8 Pr^n, n = 0.4 for 'heating' (Ts > Tm), 0.3 for 'cooling'. Also needs L/D > 10",
            ranges: [['Re', 10000, Infinity], ['Pr', 0.7, 160]],
            f: (Re, Pr, m) => 0.023 * pow(Re, 0.8) * pow(Pr, mode(m, ['heating', 'cooling'], 'nu_dittusboelter') === 'heating' ? 0.4 : 0.3) },
        nu_siedertate: { group: 'Internal flow', args: ['Re', 'Pr', 'mu_mus'], eq: 'Eq. 8.61', d: 'Nusselt number, turbulent flow with large property variations: 0.027 Re^0.8 Pr^(1/3) (mu/mu_s)^0.14. Also needs L/D > 10',
            ranges: [['Re', 10000, Infinity], ['Pr', 0.7, 16700]], f: (Re, Pr, mr) => 0.027 * pow(Re, 0.8) * pow(Pr, 1 / 3) * pow(mr, 0.14) },
        nu_gnielinski: { group: 'Internal flow', args: ['Re', 'Pr', 'f?'], eq: 'Eq. 8.62', d: 'Nusselt number, turbulent and transition flow; f is the Darcy friction factor (default: smooth tube, Eq. 8.21; give f_colebrook(Re, eps_D) for a rough tube)',
            ranges: [['Re', 3000, 5e6], ['Pr', 0.5, 2000]],
            f: (Re, Pr, f) => { if (f === undefined) f = petukhov(Re); return (f / 8) * (Re - 1000) * Pr / (1 + 12.7 * Math.sqrt(f / 8) * (pow(Pr, 2 / 3) - 1)); } },
        nu_skupinski: { group: 'Internal flow', args: ['Re', 'Pr'], eq: 'Eq. 8.64', d: 'Nusselt number, liquid metals, fully developed turbulent flow, uniform heat flux: 4.82 + 0.0185 Pe^0.827, Pe = Re Pr',
            ranges: [['Re', 3.6e3, 9.05e5], ['Pe', 1e2, 1e4]], f: (Re, Pr) => 4.82 + 0.0185 * pow(Re * Pr, 0.827) },
        nu_sebanshimazaki: { group: 'Internal flow', args: ['Re', 'Pr'], eq: 'Eq. 8.65', d: 'Nusselt number, liquid metals, fully developed turbulent flow, uniform surface temperature: 5.0 + 0.025 Pe^0.8, Pe = Re Pr',
            ranges: [['Pe', 100, Infinity]], f: (Re, Pr) => 5.0 + 0.025 * pow(Re * Pr, 0.8) },

        // ---------------- Flat plate in parallel flow (Chapter 7)
        nu_plate_lam_x: { group: 'Flat plate', args: ['Re_x', 'Pr', 'xi_x?'], eq: 'Eqs. 7.23, 7.42', d: 'Local Nusselt number, laminar, uniform surface temperature: 0.332 Re_x^(1/2) Pr^(1/3); optional unheated starting length as xi/x',
            ranges: [['Re_x', 0, 5e5], ['Pr', 0.6, Infinity]], f: (Re, Pr, r = 0) => usl_local(0.332 * Math.sqrt(Re) * pow(Pr, 1 / 3), r, true) },
        nu_plate_lam: { group: 'Flat plate', args: ['Re_L', 'Pr', 'xi_L?'], eq: 'Eqs. 7.30, 7.44', d: 'Average Nusselt number, laminar over the whole plate: 0.664 Re_L^(1/2) Pr^(1/3); optional unheated starting length as xi/L (then h is averaged over the heated part)',
            ranges: [['Re_L', 0, 5e5], ['Pr', 0.6, Infinity]], f: (Re, Pr, r = 0) => usl_avg(0.664 * Math.sqrt(Re) * pow(Pr, 1 / 3), r, 2) },
        nu_plate_turb_x: { group: 'Flat plate', args: ['Re_x', 'Pr', 'xi_x?'], eq: 'Eqs. 7.36, 7.43', d: 'Local Nusselt number, turbulent: 0.0296 Re_x^(4/5) Pr^(1/3); optional unheated starting length as xi/x',
            ranges: [['Re_x', 5e5, 1e8], ['Pr', 0.6, 60]], f: (Re, Pr, r = 0) => usl_local(0.0296 * pow(Re, 0.8) * pow(Pr, 1 / 3), r, false) },
        nu_plate_turb: { group: 'Flat plate', args: ['Re_L', 'Pr', 'xi_L?'], eq: 'Eqs. 7.38 (A = 0), 7.44', d: 'Average Nusselt number, turbulent over the whole plate (tripped at the leading edge): 0.037 Re_L^(4/5) Pr^(1/3); optional unheated starting length as xi/L',
            ranges: [['Re_L', 0, 1e8], ['Pr', 0.6, 60]], f: (Re, Pr, r = 0) => usl_avg(0.037 * pow(Re, 0.8) * pow(Pr, 1 / 3), r, 8) },
        nu_plate_mixed: { rangeText: 'Re_xc <= Re_L <= 1e8, 0.6 <= Pr <= 60', group: 'Flat plate', args: ['Re_L', 'Pr', 'Re_xc?'], eq: 'Eqs. 7.38, 7.39', d: 'Average Nusselt number, laminar then turbulent: (0.037 Re_L^(4/5) - A) Pr^(1/3), A = 0.037 Re_xc^(4/5) - 0.664 Re_xc^(1/2) (A = 871 for the default Re_xc = 5e5)',
            ranges: [['Pr', 0.6, 60]],
            f: (Re, Pr, Rc = 5e5) => {
                if (Re < Rc || Re > 1e8) Corr.warn('nu_plate_mixed', `Re_L = ${Corr.fmt(Re)} is outside its range, ${Corr.fmt(Rc)} to 1e8 (below Re_xc the flow is laminar over the whole plate: use nu_plate_lam)`);
                const A = 0.037 * pow(Rc, 0.8) - 0.664 * Math.sqrt(Rc);
                return (0.037 * pow(Re, 0.8) - A) * pow(Pr, 1 / 3);
            } },
        nu_plate_lam_x_q: { group: 'Flat plate', args: ['Re_x', 'Pr'], eq: 'Eq. 7.45', d: 'Local Nusselt number, laminar, uniform surface heat flux: 0.453 Re_x^(1/2) Pr^(1/3)',
            ranges: [['Re_x', 0, 5e5], ['Pr', 0.6, Infinity]], f: (Re, Pr) => 0.453 * Math.sqrt(Re) * pow(Pr, 1 / 3) },
        nu_plate_turb_x_q: { group: 'Flat plate', args: ['Re_x', 'Pr'], eq: 'Eq. 7.46', d: 'Local Nusselt number, turbulent, uniform surface heat flux: 0.0308 Re_x^(4/5) Pr^(1/3)',
            ranges: [['Re_x', 5e5, 1e8], ['Pr', 0.6, 60]], f: (Re, Pr) => 0.0308 * pow(Re, 0.8) * pow(Pr, 1 / 3) },
        nu_churchillozoe_x: { group: 'Flat plate', args: ['Re_x', 'Pr'], eq: 'Eq. 7.33', d: 'Local Nusselt number, laminar, uniform surface temperature, any Prandtl number (liquid metals included): 0.3387 Re_x^(1/2) Pr^(1/3)/[1 + (0.0468/Pr)^(2/3)]^(1/4); the average is twice the local value',
            ranges: [['Pe_x', 100, Infinity]], f: (Re, Pr) => 0.3387 * Math.sqrt(Re) * pow(Pr, 1 / 3) / pow(1 + pow(0.0468 / Pr, 2 / 3), 1 / 4) },
        cf_plate_lam_x: { group: 'Flat plate', args: ['Re_x'], eq: 'Eq. 7.20', d: 'Local friction coefficient, laminar: 0.664 Re_x^(-1/2)', ranges: [['Re_x', 0, 5e5]], f: (Re) => 0.664 / Math.sqrt(Re) },
        cf_plate_lam: { group: 'Flat plate', args: ['Re_L'], eq: 'Eq. 7.29', d: 'Average friction coefficient, laminar: 1.328 Re_L^(-1/2)', ranges: [['Re_L', 0, 5e5]], f: (Re) => 1.328 / Math.sqrt(Re) },
        cf_plate_turb_x: { group: 'Flat plate', args: ['Re_x'], eq: 'Eq. 7.34', d: 'Local friction coefficient, turbulent: 0.0592 Re_x^(-1/5)', ranges: [['Re_x', 5e5, 1e8]], f: (Re) => 0.0592 * pow(Re, -0.2) },
        cf_plate_mixed: { rangeText: 'Re_xc <= Re_L <= 1e8', group: 'Flat plate', args: ['Re_L', 'Re_xc?'], eq: 'Eq. 7.40', d: 'Average friction coefficient, laminar then turbulent: 0.074 Re_L^(-1/5) - 2A/Re_L (A as in nu_plate_mixed)',
            ranges: [], f: (Re, Rc = 5e5) => {
                if (Re < Rc || Re > 1e8) Corr.warn('cf_plate_mixed', `Re_L = ${Corr.fmt(Re)} is outside its range, ${Corr.fmt(Rc)} to 1e8`);
                const A = 0.037 * pow(Rc, 0.8) - 0.664 * Math.sqrt(Rc);
                return 0.074 * pow(Re, -0.2) - 2 * A / Re;
            } },

        // ---------------- Cylinder, sphere, tube banks (Chapter 7)
        nu_churchillbernstein: { group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr'], eq: 'Eq. 7.54', d: 'Average Nusselt number, circular cylinder in cross flow (properties at the film temperature)',
            ranges: [['RePr', 0.2, Infinity]], f: (Re, Pr) => 0.3 + 0.62 * Math.sqrt(Re) * pow(Pr, 1 / 3) / pow(1 + pow(0.4 / Pr, 2 / 3), 1 / 4) * pow(1 + pow(Re / 282000, 5 / 8), 4 / 5) },
        nu_hilpert: { group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr'], eq: 'Eq. 7.52, Table 7.2', d: 'Average Nusselt number, circular cylinder in cross flow: C Re^m Pr^(1/3) (properties at the film temperature)',
            ranges: [['Re', 0.4, 4e5], ['Pr', 0.7, Infinity]], f: (Re, Pr) => { const [, , C, m] = band(HILPERT, Re); return C * pow(Re, m) * pow(Pr, 1 / 3); } },
        nu_zukauskas: { group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr', 'Pr_s'], eq: 'Eq. 7.53, Table 7.4', d: 'Average Nusselt number, circular cylinder in cross flow: C Re^m Pr^n (Pr/Pr_s)^(1/4), n = 0.37 for Pr <= 10, else 0.36 (properties at the free-stream temperature, Pr_s at the surface)',
            ranges: [['Re', 1, 1e6], ['Pr', 0.7, 500]], f: (Re, Pr, Prs) => { const [, , C, m] = band(ZUK_CYL, Re); return C * pow(Re, m) * pow(Pr, Pr <= 10 ? 0.37 : 0.36) * pow(Pr / Prs, 0.25); } },
        nu_whitaker: { group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr', 'mu_mus'], eq: 'Eq. 7.56', d: 'Average Nusselt number, sphere: 2 + (0.4 Re^(1/2) + 0.06 Re^(2/3)) Pr^0.4 (mu/mu_s)^(1/4) (properties at the free-stream temperature)',
            ranges: [['Re', 3.5, 7.6e4], ['Pr', 0.71, 380], ['mu_mus', 1.0, 3.2]], f: (Re, Pr, mr) => 2 + (0.4 * Math.sqrt(Re) + 0.06 * pow(Re, 2 / 3)) * pow(Pr, 0.4) * pow(mr, 0.25) },
        nu_ranzmarshall: { group: 'Cylinder, sphere, tube banks', args: ['Re', 'Pr'], eq: 'Eq. 7.57', d: 'Average Nusselt number, freely falling liquid drop: 2 + 0.6 Re^(1/2) Pr^(1/3)',
            ranges: [], f: (Re, Pr) => 2 + 0.6 * Math.sqrt(Re) * pow(Pr, 1 / 3) },
        cd_sphere: { rangeText: 'Re <= 2e5 (below the drag crisis)', group: 'Cylinder, sphere, tube banks', args: ['Re'], eq: 'Clift and Gauvin (1970), within about 6 % of data; follows Fig. 7.8 below the drag crisis, and Stokes, Eq. 7.55, at low Re', d: 'Drag coefficient of a smooth sphere: 24/Re (1 + 0.15 Re^0.687) + 0.42/(1 + 42500 Re^-1.16)',
            ranges: [], f: (Re) => {
                if (Re > 2e5) Corr.warn('cd_sphere', `Re = ${Corr.fmt(Re)} is above 2e5: in the drag crisis (Fig. 7.8) the drag coefficient falls to about 0.1 to 0.2, depending on surface roughness and free-stream turbulence, and this correlation does not apply`);
                return 24 / Re * (1 + 0.15 * pow(Re, 0.687)) + 0.42 / (1 + 42500 * pow(Re, -1.16));
            } },
        nu_tubebank: { rangeText: '10 <= Re_max <= 2e6, 0.7 <= Pr <= 500; aligned: ST/SL > 0.7', group: 'Cylinder, sphere, tube banks', args: ['Re_max', 'Pr', 'Pr_s', 'arrangement$', 'ST_SL', 'NL?'], eq: 'Eqs. 7.64, 7.65, Tables 7.7, 7.8', d: "Average Nusselt number, bank of tubes in cross flow (Zukauskas): C2 C Re_max^m Pr^0.36 (Pr/Pr_s)^(1/4); arrangement 'aligned' or 'staggered', ST_SL = ST/SL, NL = number of rows (default 20 or more; C2 interpolated in Table 7.8). Re_max on the maximum velocity; properties at the mean fluid temperature. For 100 < Re_max < 1000 the book's advice, a single isolated cylinder, is used (Eq. 7.53)",
            ranges: [['Re_max', 10, 2e6], ['Pr', 0.7, 500]],
            f: (Re, Pr, Prs, arr, r, NL = 20) => {
                const a = mode(arr, ['aligned', 'staggered'], 'nu_tubebank');
                if (!(NL >= 1)) throw new Error('nu_tubebank(): NL, the number of rows, must be 1 or more');
                let C, m;
                if (Re < 100) [C, m] = a === 'aligned' ? [0.80, 0.40] : [0.90, 0.40];
                else if (Re < 1000) return CORRELATIONS.nu_zukauskas.f(Re, Pr, Prs) * (NL < 20 ? lin(C2_BANK[a], NL, 1) : 1);
                else if (Re < 2e5) {
                    if (a === 'aligned') { [C, m] = [0.27, 0.63]; if (r < 0.7) Corr.warn('nu_tubebank', `aligned tubes with ST/SL = ${Corr.fmt(r)} below 0.7: heat transfer is inefficient and the book advises against it (Table 7.7)`); }
                    else [C, m] = r < 2 ? [0.35 * pow(r, 0.2), 0.60] : [0.40, 0.60];
                } else [C, m] = a === 'aligned' ? [0.021, 0.84] : [0.022, 0.84];
                const C2 = NL < 20 ? lin(C2_BANK[a], NL, 1) : 1;
                return C2 * C * pow(Re, m) * pow(Pr, 0.36) * pow(Pr / Prs, 0.25);
            } },

        // ---------------- Free convection, external (Chapter 9); Ra and Nu on the length named in each description
        nu_churchillchu_plate: { group: 'Free convection: plates, cylinders, spheres', args: ['Ra_L', 'Pr'], eq: 'Eq. 9.26', d: 'Average Nusselt number, vertical plate (height L), laminar and turbulent: {0.825 + 0.387 Ra^(1/6)/[1 + (0.492/Pr)^(9/16)]^(8/27)}^2. Also inclined plates with g cos(theta), and vertical cylinders when D/L >= 35/Gr_L^(1/4)',
            ranges: [['Ra_L', 0, 1e13]], f: (Ra, Pr) => pow(0.825 + 0.387 * pow(Ra, 1 / 6) / pow(1 + pow(0.492 / Pr, 9 / 16), 8 / 27), 2) },
        nu_churchillchu_plate_lam: { group: 'Free convection: plates, cylinders, spheres', args: ['Ra_L', 'Pr'], eq: 'Eq. 9.27', d: 'Average Nusselt number, vertical plate, laminar (slightly more accurate there): 0.68 + 0.670 Ra^(1/4)/[1 + (0.492/Pr)^(9/16)]^(4/9)',
            ranges: [['Ra_L', 0, 1e9]], f: (Ra, Pr) => 0.68 + 0.670 * pow(Ra, 1 / 4) / pow(1 + pow(0.492 / Pr, 9 / 16), 4 / 9) },
        nu_hplate: { group: 'Free convection: plates, cylinders, spheres', args: ['Ra_L', 'face$'], eq: 'Eqs. 9.30 to 9.32', d: "Average Nusselt number, horizontal plate, L = A/P (area over perimeter); face 'hot_up' (upper surface of a hot plate, or lower surface of a cold one): 0.54 Ra^(1/4), or 0.15 Ra^(1/3) above 1e7; face 'hot_down' (lower surface of a hot plate, or upper surface of a cold one): 0.27 Ra^(1/4)",
            rangeText: "hot_up: 1e4 <= Ra_L <= 1e11; hot_down: 1e5 <= Ra_L <= 1e10", ranges: [],
            f: (Ra, face) => {
                if (mode(face, ['hot_up', 'hot_down'], 'nu_hplate') === 'hot_up') {
                    if (Ra < 1e4 || Ra > 1e11) Corr.warn('nu_hplate', `Ra_L = ${Corr.fmt(Ra)} is outside its range, 1e4 to 1e11 (Eqs. 9.30, 9.31)`);
                    return Ra <= 1e7 ? 0.54 * pow(Ra, 1 / 4) : 0.15 * pow(Ra, 1 / 3);
                }
                if (Ra < 1e5 || Ra > 1e10) Corr.warn('nu_hplate', `Ra_L = ${Corr.fmt(Ra)} is outside its range, 1e5 to 1e10 (Eq. 9.32)`);
                return 0.27 * pow(Ra, 1 / 4);
            } },
        nu_churchillchu_cyl: { group: 'Free convection: plates, cylinders, spheres', args: ['Ra_D', 'Pr'], eq: 'Eq. 9.34', d: 'Average Nusselt number, long horizontal cylinder: {0.60 + 0.387 Ra^(1/6)/[1 + (0.559/Pr)^(9/16)]^(8/27)}^2',
            ranges: [['Ra_D', 0, 1e12]], f: (Ra, Pr) => pow(0.60 + 0.387 * pow(Ra, 1 / 6) / pow(1 + pow(0.559 / Pr, 9 / 16), 8 / 27), 2) },
        nu_morgan: { group: 'Free convection: plates, cylinders, spheres', args: ['Ra_D'], eq: 'Eq. 9.33, Table 9.1', d: 'Average Nusselt number, long horizontal cylinder: C Ra^n',
            ranges: [['Ra_D', 1e-10, 1e12]], f: (Ra) => { const [, , C, n] = band(MORGAN, Ra); return C * pow(Ra, n); } },
        nu_churchill_sphere: { group: 'Free convection: plates, cylinders, spheres', args: ['Ra_D', 'Pr'], eq: 'Eq. 9.35', d: 'Average Nusselt number, sphere: 2 + 0.589 Ra^(1/4)/[1 + (0.469/Pr)^(9/16)]^(4/9)',
            ranges: [['Ra_D', 0, 1e11], ['Pr', 0.7, Infinity]], f: (Ra, Pr) => 2 + 0.589 * pow(Ra, 1 / 4) / pow(1 + pow(0.469 / Pr, 9 / 16), 4 / 9) },

        // ---------------- Free convection in channels and enclosures (Chapter 9)
        nu_elenbaas: { group: 'Free convection: channels and enclosures', args: ['Ra_S', 'S_L'], eq: 'Eq. 9.36', d: 'Average Nusselt number on the spacing S, vertical channel between symmetric isothermal plates (height L), air: (1/24) Ra_S (S/L) {1 - exp[-35/(Ra_S S/L)]}^(3/4)',
            ranges: [['RaS_L', 0.1, 1e5]], f: (Ra, r) => Ra === 0 ? 0 : Ra * r / 24 * pow(1 - Math.exp(-35 / (Ra * r)), 3 / 4) },
        nu_channel: { group: 'Free convection: channels and enclosures', args: ['Ra_S', 'S_L', 'condition$'], eq: 'Eqs. 9.45, 9.46, Table 9.3', d: "Nusselt number on the spacing S, vertical parallel-plate channel (Bar-Cohen and Rohsenow); condition 'symmetric_t' (both plates isothermal), 'asymmetric_t' (one isothermal, one adiabatic): average Nu_S with Ra_S; 'symmetric_q' (both isoflux), 'asymmetric_q' (one isoflux, one adiabatic): Nu_S,L at the top with the modified Ra*_S = g beta q'' S^4/(k nu alpha)",
            rangeText: 'all S/L (fully developed to isolated plates)', ranges: [],
            f: (Ra, r, cond) => {
                const [C1, C2, q] = CHANNEL[mode(cond, Object.keys(CHANNEL), 'nu_channel')], x = Ra * r;
                if (x === 0) return 0;
                return q ? pow(C1 / x + C2 / pow(x, 2 / 5), -1 / 2) : pow(C1 / (x * x) + C2 / Math.sqrt(x), -1 / 2);
            } },
        nu_channel_inclined: { group: 'Free convection: channels and enclosures', args: ['Ra_S', 'S_L'], eq: 'Eq. 9.47', d: 'Average Nusselt number on S, inclined channel (tilt 0 to 45 degrees from vertical), isothermal plates or isothermal-insulated, isolated plate limit: 0.645 [Ra_S (S/L)]^(1/4)',
            ranges: [['RaS_L', 200, Infinity]], f: (Ra, r) => 0.645 * pow(Ra * r, 1 / 4) },
        nu_cavity_horiz: { group: 'Free convection: channels and enclosures', args: ['Ra_L', 'Pr'], eq: 'Eq. 9.49', d: 'Nusselt number on the gap L, horizontal cavity heated from below (Globe and Dropkin): 0.069 Ra^(1/3) Pr^0.074; Nu = 1 (conduction) below Ra_L = 1708. Heated from above: Nu = 1',
            rangeText: 'Ra_L < 1708 (Nu = 1) or 3e5 <= Ra_L <= 7e9', ranges: [],
            f: (Ra, Pr) => {
                if (Ra < 1708) return 1;
                if (Ra < 3e5 || Ra > 7e9) Corr.warn('nu_cavity_horiz', `Ra_L = ${Corr.fmt(Ra)} is outside its range, 3e5 to 7e9 (Eq. 9.49)`);
                return 0.069 * pow(Ra, 1 / 3) * pow(Pr, 0.074);
            } },
        nu_cavity_vert: { group: 'Free convection: channels and enclosures', args: ['Ra_L', 'Pr', 'H_L'], eq: 'Eqs. 9.50 to 9.53', d: 'Nusselt number on the gap L, vertical rectangular cavity (height H, sides heated and cooled): Eq. 9.51 for H/L < 2, 9.50 for 2 to 10, 9.52 for H/L >= 10 and Ra_L <= 1e7, 9.53 above; Nu = 1 below Ra_L = 1e3',
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
            } },
        nu_hollands: { group: 'Free convection: channels and enclosures', args: ['Ra_L', 'tau_deg'], eq: 'Eq. 9.54', d: 'Nusselt number on the gap L, inclined cavity heated from below, tilt tau (degrees from horizontal, up to the critical angle, about 70 degrees for H/L >= 12): 1 + 1.44 [1 - 1708/(Ra cos tau)]+ [1 - 1708 (sin 1.8 tau)^1.6/(Ra cos tau)] + [(Ra cos tau/5830)^(1/3) - 1]+, where [ ]+ means 0 if negative',
            rangeText: 'H/L >= 12, 0 <= tau <= tau* (Table 9.4)', ranges: [['tau_deg', 0, 70]],
            f: (Ra, tau) => {
                const t = tau * Math.PI / 180, rc = Ra * Math.cos(t), pos = (v) => Math.max(v, 0);
                if (rc <= 1708) return 1;
                return 1 + 1.44 * pos(1 - 1708 / rc) * (1 - 1708 * pow(Math.sin(1.8 * t), 1.6) / rc) + pos(pow(rc / 5830, 1 / 3) - 1);
            } },
        lc_cylinders: { group: 'Free convection: channels and enclosures', args: ['r_i', 'r_o'], length: true, eq: 'Eq. 9.60', d: 'Length scale L_c for Ra_c between long horizontal concentric cylinders: 2 [ln(r_o/r_i)]^(4/3)/(r_i^(-3/5) + r_o^(-3/5))^(5/3); in the units of the radii',
            ranges: [], f: (ri, ro) => 2 * pow(Math.log(ro / ri), 4 / 3) / pow(pow(ri, -3 / 5) + pow(ro, -3 / 5), 5 / 3) },
        keff_k_cylinders: { group: 'Free convection: channels and enclosures', args: ['Ra_c', 'Pr'], eq: 'Eq. 9.59', d: 'Effective conductivity ratio k_eff/k between concentric cylinders: 0.386 [Pr/(0.861 + Pr)]^(1/4) Ra_c^(1/4), at least 1. Then q per length = 2 pi k_eff (T_i - T_o)/ln(r_o/r_i) (Eq. 9.58)',
            ranges: [['Ra_c', 0, 1e7], ['Pr', 0.7, 6000]], f: (Ra, Pr) => Math.max(1, 0.386 * pow(Pr / (0.861 + Pr), 1 / 4) * pow(Ra, 1 / 4)) },
        ls_spheres: { group: 'Free convection: channels and enclosures', args: ['r_i', 'r_o'], length: true, eq: 'Eq. 9.63', d: 'Length scale L_s for Ra_s between concentric spheres: (1/r_i - 1/r_o)^(4/3)/[2^(1/3) (r_i^(-7/5) + r_o^(-7/5))^(5/3)]; in the units of the radii',
            ranges: [], f: (ri, ro) => pow(1 / ri - 1 / ro, 4 / 3) / (pow(2, 1 / 3) * pow(pow(ri, -7 / 5) + pow(ro, -7 / 5), 5 / 3)) },
        keff_k_spheres: { group: 'Free convection: channels and enclosures', args: ['Ra_s', 'Pr'], eq: 'Eq. 9.62', d: 'Effective conductivity ratio k_eff/k between concentric spheres: 0.74 [Pr/(0.861 + Pr)]^(1/4) Ra_s^(1/4), at least 1. Then q = 4 pi k_eff (T_i - T_o)/(1/r_i - 1/r_o) (Eq. 9.61)',
            ranges: [['Ra_s', 0, 1e4], ['Pr', 0.7, 4000]], f: (Ra, Pr) => Math.max(1, 0.74 * pow(Pr / (0.861 + Pr), 1 / 4) * pow(Ra, 1 / 4)) },
    };
})();

// Front end: the callables for equations, the range warnings, and the checks common to all correlations
const Corr = {
    fmt: (v) => String(+(+v).toPrecision(4)),
    warn(name, msg) { if (Interp.notes) Interp.notes.set(name + ': ' + msg, `${name}(): ${msg}`); },
    entries: {},
    build() {
        for (const [name, c] of Object.entries(CORRELATIONS)) {
            const req = c.args.filter(a => !a.endsWith('?')).length;
            Corr.entries[name] = (...a) => {
                Interp.used = true;   // so that solve() re-evaluates at the solution and shows the range warnings
                const sig = `${name}(${c.args.map(x => x.replace(/[$?]$/, '')).join(', ')})`;
                if (a.length < req || a.length > c.args.length) throw new Error(`${sig} takes ${req === c.args.length ? req : `${req} to ${c.args.length}`} arguments, got ${a.length}`);
                a.forEach((v, i) => {
                    const an = c.args[i];
                    if (an.includes('$')) { if (typeof v !== 'string') throw new Error(`${sig}: ${an.replace(/[$?]/g, '')} must be text in quotes`); }
                    else if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${sig}: ${an.replace(/[$?]/g, '')} must be a number`);
                    else if (v < 0 || (v === 0 && /^(Re|Re_x|Re_L|Re_max|Pr|Pr_s|mu_mus|L_D|b_a|Di_Do|f|S_L|H_L|r_i|r_o)\??$/.test(an))) throw new Error(`${sig}: ${an.replace(/[$?]/g, '')} = ${v} must be positive`);
                });
                if (Interp.notes) {   // ranges, checked at the solution only
                    const val = { Pe: a[0] * a[1], Pe_x: a[0] * a[1], RePr: a[0] * a[1], RaS_L: a[0] * a[1] };
                    c.args.forEach((an, i) => { val[an.replace(/[$?]/g, '')] = a[i]; });
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
