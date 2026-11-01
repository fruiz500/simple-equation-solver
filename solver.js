// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Solvers: partitioning, damped Newton / Levenberg-Marquardt, ode45, parametric sweeps, 1-D optimization.

// ==========================================
// TABULATED DATA (also used by the solid properties, solids.js): interpolate(xs, ys, x) and interpolate(xs, ys, Z, x, y), Z[i, j] at xs[i], ys[j]: linear (bilinear) by
// default, or cubic with the option 'spline' or 'pchip'. Outside the table it is an error, unless the option 'extrapolate'
// is given (a straight line continues the end slope).
// ==========================================
const Interp = {
    used: false,     // set by every call; solve() then checks the solution for values outside the tables
    lenient: false,  // while solve() iterates: outside the table, extend the end segments without complaint
    notes: null,     // a Map while extrapolation notes are being collected
    fmt: (v) => String(+v.toPrecision(7)),
    // A list of numbers: [1, 2, 3], x[1:N], or a one-row or one-column matrix
    vec(v, what) {
        let a = math.isMatrix(v) ? v.toArray() : v;
        if (Array.isArray(a) && Array.isArray(a[0]) && (a.length === 1 || a.every(r => Array.isArray(r) && r.length === 1))) a = a.flat();
        if (!Array.isArray(a) || a.some(x => typeof x !== 'number' || !Number.isFinite(x))) {
            throw new Error(`interpolate(): ${what} must be a list of numbers, such as [300, 400, 500] or x[1:N]`);
        }
        return a;
    },
    axis(v, what) {
        const a = Interp.vec(v, what);
        if (a.length < 2) throw new Error(`interpolate(): ${what} needs at least 2 values`);
        for (let i = 1; i < a.length; i++) if (!(a[i] > a[i - 1])) {
            throw new Error(`interpolate(): ${what} must be strictly increasing, but value ${i + 1} (${Interp.fmt(a[i])}) is not above value ${i} (${Interp.fmt(a[i - 1])})`);
        }
        return a;
    },
    // Index i of the segment xs[i] .. xs[i+1] used for x (the end segment when x is outside the table). label and hint
    // name the caller in the message (solid properties use them); lastOutside keeps the message of the last range error.
    lastOutside: '',
    find(xs, x, what, extrapolate, label = 'interpolate()', hint = " (add 'extrapolate' as the last argument to extend the end segments)") {
        if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`interpolate(): ${what} must be a number`);
        const n = xs.length, lo = xs[0], hi = xs[n - 1];
        const F = (v) => (v !== x || (Interp.fmt(x) !== Interp.fmt(lo) && Interp.fmt(x) !== Interp.fmt(hi))) ? Interp.fmt(v) : String(x);   // just past an end: all digits
        if (x < lo || x > hi) {
            if (!extrapolate && !Interp.lenient) {
                Interp.lastOutside = `${label}: ${what} = ${F(x)} is outside the table, ${F(lo)} to ${F(hi)}${hint}`;
                throw new Error(Interp.lastOutside);
            }
            const tol = 1e-9 * (hi - lo);
            if (Interp.notes && (x < lo - tol || x > hi + tol)) {
                Interp.notes.set(`${what} ${x} ${lo} ${hi}`, `interpolate(): extrapolated: ${what} = ${F(x)} is outside the table, ${F(lo)} to ${F(hi)}`);
            }
        }
        let a = 0, b = n - 1;
        while (b - a > 1) { const m = (a + b) >> 1; if (x < xs[m]) b = m; else a = m; }
        return a;
    },
    // Slopes at the nodes for 'spline' (cubic, not-a-knot ends, as Matlab's spline) or 'pchip' (shape-preserving cubic,
    // Fritsch-Carlson, as Matlab's pchip: no overshoot, monotonic data stay monotonic)
    slopes(xs, ys, method) {
        const n = xs.length, h = [], d = [];
        for (let k = 0; k < n - 1; k++) { h.push(xs[k + 1] - xs[k]); d.push((ys[k + 1] - ys[k]) / h[k]); }
        if (n === 2) return [d[0], d[0]];
        if (method === 'pchip') {
            const s = new Array(n).fill(0), sg = Math.sign;
            for (let k = 1; k < n - 1; k++) {
                if (d[k - 1] * d[k] <= 0) continue;
                const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
                s[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
            }
            const end = (h0, h1, d0, d1) => {
                let e = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
                if (sg(e) !== sg(d0)) e = 0; else if (sg(d0) !== sg(d1) && Math.abs(e) > Math.abs(3 * d0)) e = 3 * d0;
                return e;
            };
            s[0] = end(h[0], h[1], d[0], d[1]);
            s[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
            return s;
        }
        if (n === 3) {   // the parabola through the three points
            const c = (d[1] - d[0]) / (xs[2] - xs[0]);
            return xs.map(x => d[0] + c * (2 * x - xs[0] - xs[1]));
        }
        // Tridiagonal system for the slopes: continuous second derivative inside, not-a-knot at both ends
        const A = [], B = [], C = [], R = [];   // sub-, main and super-diagonal, right side
        const x20 = xs[2] - xs[0], xn = xs[n - 1] - xs[n - 3];
        A.push(0); B.push(h[1]); C.push(x20); R.push(((h[0] + 2 * x20) * h[1] * d[0] + h[0] * h[0] * d[1]) / x20);
        for (let k = 1; k < n - 1; k++) { A.push(h[k]); B.push(2 * (h[k - 1] + h[k])); C.push(h[k - 1]); R.push(3 * (h[k] * d[k - 1] + h[k - 1] * d[k])); }
        A.push(xn); B.push(h[n - 3]); C.push(0); R.push((h[n - 2] * h[n - 2] * d[n - 3] + (2 * xn + h[n - 2]) * h[n - 3] * d[n - 2]) / xn);
        // Gaussian elimination keeping the band (rows 0 and n-1 are not diagonally dominant: eliminate them carefully)
        const M = A.map((_, r) => ({ l: A[r], m: B[r], u: C[r], u2: 0, r: R[r] }));
        for (let k = 0; k < n - 1; k++) {
            const p = M[k], q = M[k + 1];
            if (Math.abs(q.l) > Math.abs(p.m)) {   // partial pivoting: swap rows k and k+1 (fill-in one place to the right)
                M[k] = { l: 0, m: q.l, u: q.m, u2: q.u, r: q.r }; M[k + 1] = { l: p.m, m: p.u, u: p.u2, u2: 0, r: p.r };
            }
            const P = M[k], Q = M[k + 1], f = Q.l / P.m;
            M[k + 1] = { l: 0, m: Q.m - f * P.u, u: Q.u - f * P.u2, u2: Q.u2, r: Q.r - f * P.r };
        }
        const s = new Array(n);
        for (let k = n - 1; k >= 0; k--) s[k] = (M[k].r - M[k].u * (s[k + 1] || 0) - M[k].u2 * (s[k + 2] || 0)) / M[k].m;
        return s;
    },
    // One-dimensional interpolation of the table xs, ys at x. Outside the table (when allowed): a straight line with the end slope.
    one(xs, ys, x, method, ext, what, label, hint) {
        const i = Interp.find(xs, x, what, ext, label, hint), n = xs.length;
        if (method === 'linear') { const t = (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[i] + t * (ys[i + 1] - ys[i]); }
        const s = Interp.slopes(xs, ys, method);
        if (x < xs[0]) return ys[0] + s[0] * (x - xs[0]);
        if (x > xs[n - 1]) return ys[n - 1] + s[n - 1] * (x - xs[n - 1]);
        const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;   // cubic Hermite on the segment
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * s[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * s[i + 1];
    },
    fn(...args) {
        Interp.used = true;
        let ext = false, method = 'linear', nOpt = 0;
        while (typeof args[args.length - 1] === 'string') {   // options: 'linear' (default), 'spline', 'pchip', 'extrapolate'
            const o = args.pop().toLowerCase(); nOpt++;
            if (o === 'extrapolate') ext = true;
            else if (['linear', 'spline', 'pchip'].includes(o)) method = o;
            else throw new Error(`interpolate(): unknown option '${o}' (options: 'linear', 'spline', 'pchip', 'extrapolate')`);
        }
        if (args.length === 3) {
            const xs = Interp.axis(args[0], 'xs'), ys = Interp.vec(args[1], 'ys');
            if (ys.length !== xs.length) throw new Error(`interpolate(): xs has ${xs.length} values but ys has ${ys.length}`);
            return Interp.one(xs, ys, args[2], method, ext, 'x');
        }
        if (args.length === 5) {
            const xs = Interp.axis(args[0], 'xs'), ys = Interp.axis(args[1], 'ys'), x = args[3], y = args[4];
            const Z = math.isMatrix(args[2]) ? args[2].toArray() : args[2];
            if (!(Array.isArray(Z) && Z.length === xs.length && Z.every(r => Array.isArray(r) && r.length === ys.length && r.every(z => typeof z === 'number' && Number.isFinite(z))))) {
                throw new Error(`interpolate(): Z must be a matrix of numbers with ${xs.length} rows (one per xs value) and ${ys.length} columns (one per ys value)`);
            }
            Interp.find(xs, x, 'x', ext);   // range check of x first, so its message comes before any about y
            // along y in every row, then along x through the results (for 'linear', this is bilinear interpolation)
            return Interp.one(xs, Z.map(row => Interp.one(ys, row, y, method, ext, 'y')), x, method, ext, 'x');
        }
        throw new Error(`interpolate() is used as interpolate(xs, ys, x) or interpolate(xs, ys, Z, x, y), optionally followed by 'spline' or 'pchip' and by 'extrapolate'; got ${args.length + nOpt} arguments`);
    },
    // Runs f strictly (outside the table is an error) while collecting extrapolation notes, then shows each one once
    collect(f) {
        Interp.notes = new Map(); Interp.lenient = false;
        try { return f(); }
        finally { const n = [...Interp.notes.values()]; Interp.notes = null; n.forEach(m => console.warn(m)); }
    },
};

// ==========================================
// 4. BOUNDED NEWTON-RAPHSON & SOLVER ENGINE
// ==========================================
// Sorts equations topologically, solves direct assignments, and uses Newton-Raphson for coupled blocks
class BoundedSolver {
    constructor(parsedASTs, variablesMap, odeCalls = []) {
        this.parsedASTs = parsedASTs;
        this.variablesMap = variablesMap;
        this.odeCalls = odeCalls;
        this.maxIterations = 100;
        this.tolerance = 1e-7;
    }

    /**
     * Maps scalar array keys (e.g., "x[1]") into JS arrays for 1-based indexing in math.js
     */
    createScopeWithCoolProp(baseState) {
        const scope = { ...baseState };

        for (const key of Object.keys(baseState)) {
            const match = key.match(/^([a-zA-Z0-9_]+)\[(\d+)\]$/);
            if (match) {
                const arrName = match[1];
                const idx = parseInt(match[2], 10);
                if (!scope[arrName]) scope[arrName] = [];
                scope[arrName][idx - 1] = baseState[key]; // Adjust 1-based math.js index to 0-based JS index
            }
        }

        // Attach thermodynamic function calls into evaluation scope
        Object.keys(ThermoEngine.propKeys).forEach(propName => {
            scope[propName] = (fluid, ...args) => ThermoEngine.evaluate(propName, fluid, ...args);
        });

        scope.ln = Math.log;
        scope.interpolate = Interp.fn;
        Object.assign(scope, Corr.entries);                     // heat transfer correlations (correlations.js)
        Object.assign(scope, UserFunctions.entries, OdeBlocks.entries);

        return scope;
    }

    solve() {
        const state = {};
        this.variablesMap.forEach((meta, name) => state[name] = meta.guess);
        Interp.used = false; Interp.lenient = true;

        // Partition system into sequentially solvable single blocks and coupled simultaneous blocks
        const blocks = this.partitionEquations();

        for (const block of blocks) {
            if (block.type === 'single') this.solveSingleEquation(block.eqIndex, state, block.targetVar);
            else if (block.type === 'simultaneous') this.solveSimultaneousBlock(block.eqIndices, block.vars, state);
            else if (block.type === 'check') this.checkEquation(block.eqIndex, state);
        }
        // interpolate(): values outside a table are an error, and extrapolation is reported, at the solution only
        // (while iterating, trial values may leave the table, so the end segments are extended quietly)
        Interp.lenient = false;
        if (Interp.used) Interp.collect(() => {
            const sc = this.createScopeWithCoolProp(state);
            const outside = (e) => /: \w+ = .* is outside the table/.test(e.message);
            this.parsedASTs.forEach(eq => {
                try { eq.leftAST.evaluate(sc); eq.rightAST.evaluate(sc); }
                catch (e) { if (outside(e)) throw new Error(/^ode block/.test(e.message) ? e.message : `Line ${eq.lineNo}: ${e.message}`); }
            });
            OdeBlocks.active.forEach(blk => {
                try { OdeBlocks.run(blk, blk.inputs.map(nm => state[nm])); }
                catch (e) { if (outside(e)) throw new Error(`ode block at line ${blk.no}: ${Interp.lastOutside}`); }
            });
        });
        if (OdeBlocks.active.length > 0) OdeBlocks.record(state); else OdeBlocks.tables = [];

        // Solve Ordinary Differential Equations (ODEs) if defined
        for (const odeCall of this.odeCalls) {
            this.solveODE45(odeCall, state);
        }

        this.variablesMap.forEach((meta, name) => {
            if (state[name] !== undefined) meta.value = state[name];
        });

        return state;
    }

    // 'line 12' or 'lines 3, 5, 9' (equation text where the line is unknown), for messages
    eqLabel(list) {
        const eqs = [].concat(list).map(i => this.parsedASTs[i]);
        const nums = [...new Set(eqs.filter(eq => eq.lineNo).map(eq => eq.lineNo))].sort((a, b) => a - b);
        const texts = eqs.filter(eq => !eq.lineNo).map(eq => `'${eq.lineRaw || (eq.leftAST + ' = ' + eq.rightAST)}'`);
        return [nums.length ? `line${nums.length > 1 ? 's' : ''} ${nums.join(', ')}` : '', ...texts].filter(Boolean).join(', ');
    }

    /**
     * Block decomposition. Each equation is matched to one unknown that it determines (augmenting paths); the
     * equations are then grouped into the strongly connected components of their dependency graph (Tarjan).
     * A component is the smallest set of equations that must be solved together; components come out in the
     * order in which they can be solved. Equations left without an unknown are checked at the end.
     */
    partitionEquations() {
        const eqs = this.parsedASTs, n = eqs.length;

        // 1. Matching: eqVar[i] = the unknown equation i determines; varEq: the reverse
        const eqVar = new Array(n).fill(null), varEq = new Map();
        const augment = (i, seen) => {
            for (const v of eqs[i].vars) {
                if (seen.has(v)) continue;
                seen.add(v);
                const j = varEq.get(v);
                if (j === undefined || augment(j, seen)) { eqVar[i] = v; varEq.set(v, i); return true; }
            }
            return false;
        };
        for (let i = 0; i < n; i++) {                     // cheap first pass: a still-free variable
            const v = eqs[i].vars.find(x => !varEq.has(x));
            if (v !== undefined) { eqVar[i] = v; varEq.set(v, i); }
        }
        for (let i = 0; i < n; i++) if (eqVar[i] === null && eqs[i].vars.length) augment(i, new Set());

        const allVars = new Set();
        eqs.forEach(eq => eq.vars.forEach(v => allVars.add(v)));
        const loose = [...allVars].filter(v => !varEq.has(v));
        if (loose.length > 0) {
            const extra = eqs.map((eq, i) => i).filter(i => eqVar[i] === null && eqs[i].vars.length);
            throw new Error(`The equations do not determine ${loose.join(', ')}.` + (extra.length
                ? ` The equation(s) at ${this.eqLabel(extra)} add no new information (redundant with, or contradicting, the others); replace them by equations involving ${loose.join(', ')}.`
                : ' Add equations involving them.'));
        }

        // 2. Tarjan's strongly connected components; equation i depends on the equations that determine its other variables
        const index = new Array(n).fill(-1), low = new Array(n).fill(0), onStack = new Array(n).fill(false);
        const stack = [], blocks = [];
        let counter = 0;
        const visit = (i) => {
            index[i] = low[i] = counter++;
            stack.push(i); onStack[i] = true;
            for (const v of eqs[i].vars) {
                if (v === eqVar[i]) continue;
                const j = varEq.get(v);
                if (index[j] < 0) { visit(j); low[i] = Math.min(low[i], low[j]); }
                else if (onStack[j]) low[i] = Math.min(low[i], index[j]);
            }
            if (low[i] === index[i]) {
                const comp = [];
                let j;
                do { j = stack.pop(); onStack[j] = false; comp.push(j); } while (j !== i);
                comp.sort((a, b) => a - b);
                if (comp.length === 1) blocks.push({ type: 'single', eqIndex: i, targetVar: eqVar[i] });
                else blocks.push({ type: 'simultaneous', eqIndices: comp, vars: comp.map(k => eqVar[k]) });
            }
        };
        for (let i = 0; i < n; i++) if (eqVar[i] !== null && index[i] < 0) visit(i);

        // 3. Equations without an unknown of their own are consistency checks
        for (let i = 0; i < n; i++) if (eqVar[i] === null) blocks.push({ type: 'check', eqIndex: i });
        return blocks;
    }

    checkEquation(eqIndex, state) {
        const { leftAST, rightAST, lineRaw } = this.parsedASTs[eqIndex];
        const scope = this.createScopeWithCoolProp(state);
        const L = leftAST.evaluate(scope), R = rightAST.evaluate(scope);
        if (typeof L === 'number' && typeof R === 'number' &&
            Math.abs(L - R) > 1e-6 * Math.max(Math.abs(L), Math.abs(R), 1)) {
            throw new Error(`Redundant/inconsistent equation '${lineRaw || (leftAST + ' = ' + rightAST)}': left = ${L}, right = ${R}.`);
        }
    }

    solveSingleEquation(eqIndex, state, targetVar) {
        const { leftAST, rightAST, vars } = this.parsedASTs[eqIndex];
        if (!targetVar) targetVar = vars.find(v => state[v] !== undefined) || vars[0];
        if (!targetVar) return;

        const scope = this.createScopeWithCoolProp(state);

        // Direct AST evaluation check (handles direct assignments, arrays, and matrix operations)
        const refsTarget = (ast) => ast.filter(n => n.toString() === targetVar).length > 0;
        if (leftAST.toString() === targetVar && !refsTarget(rightAST)) {
            try {
                const val = rightAST.evaluate(scope);
                if (val !== undefined) { state[targetVar] = val; return; }
            } catch (err) { }
        }
        if (rightAST.toString() === targetVar && !refsTarget(leftAST)) {
            try {
                const val = leftAST.evaluate(scope);
                if (val !== undefined) { state[targetVar] = val; return; }
            } catch (err) { }
        }

        this.solveSimultaneousBlock([eqIndex], [targetVar], state);
    }

    // Sets a variable in an equation scope, including its slot in the array that x[k] expressions read
    static setVar(scope, name, value) {
        scope[name] = value;
        const m = name.match(/^([a-zA-Z0-9_]+)\[(\d+)\]$/);
        if (m && Array.isArray(scope[m[1]])) scope[m[1]][Number(m[2]) - 1] = value;
    }

    /**
     * Damped Newton method with a finite-difference Jacobian and a Levenberg-Marquardt fallback, for one block
     */
    solveSimultaneousBlock(eqIndices, vars, state) {
        const n = vars.length;
        if (eqIndices.length !== n) {
            throw new Error(`Coupled block is not square: ${eqIndices.length} equation(s), ${n} unknown(s) [${vars.join(', ')}]. Check for a missing or redundant equation.`);
        }
        const eqs = eqIndices.map(i => this.parsedASTs[i]);
        eqs.forEach(eq => { if (!eq.code) eq.code = [eq.leftAST.compile(), eq.rightAST.compile()]; });   // compile once, not per evaluation
        const metas = vars.map(v => this.variablesMap.get(v) || { lower: -Infinity, upper: Infinity });
        const rowsOf = vars.map(v => eqs.map((eq, i) => i).filter(i => eqs[i].vars.includes(v)));        // equations containing each unknown

        // One scope for the whole block; trial values are written into it
        const scope = this.createScopeWithCoolProp({ ...state });
        const setX = (X) => vars.forEach((v, k) => BoundedSolver.setVar(scope, v, X[k]));
        const evalEq = (i) => {
            const L = eqs[i].code[0].evaluate(scope), R = eqs[i].code[1].evaluate(scope);
            return { f: L - R, mag: Math.max(Math.abs(L), Math.abs(R)) };
        };
        // Residual f = left - right for every equation at trial point X
        const residuals = (X) => { setX(X); return eqs.map((eq, i) => evalEq(i)); };
        const clamp = (X) => X.map((x, k) => Math.min(Math.max(x, metas[k].lower), metas[k].upper));

        // Size of each equation: the larger of its two sides and of its terms, a term's size being estimated from the
        // Jacobian as |dF/dx_j * x_j|. So  0 = m*(h1 - h2) + Q  is judged against the size of m*h1, not of 0.
        let termMag = new Array(n).fill(0);
        const size = (e, i) => Math.max(e.mag, termMag[i]);
        // Merit: root-sum-square of the residuals, each divided by its equation's size (relative for large quantities,
        // absolute below 1). The scales are frozen during each Newton iteration, so the Newton step is a descent
        // direction for the merit and step halving can always make progress.
        let scales = null;
        const merit = (r) => Math.sqrt(r.reduce((s, e, i) => s + (e.f / scales[i]) ** 2, 0));
        const isConverged = (r) => r.every((e, i) => Number.isFinite(e.f) && Math.abs(e.f) <= this.tolerance * size(e, i) + 1e-14);

        // Central differences; each column re-evaluates only the equations that contain that unknown
        let lastJ = null, lastJX = null;
        const jacobian = (X) => {
            const J = eqs.map(() => new Array(n).fill(0));
            setX(X);
            for (let j = 0; j < n; j++) {
                const h = Math.max(Math.abs(X[j]), 1e-3) * 1e-6;
                BoundedSolver.setVar(scope, vars[j], X[j] + h);
                const fp = rowsOf[j].map(evalEq);
                BoundedSolver.setVar(scope, vars[j], X[j] - h);
                const fm = rowsOf[j].map(evalEq);
                BoundedSolver.setVar(scope, vars[j], X[j]);
                rowsOf[j].forEach((i, k) => { J[i][j] = (fp[k].f - fm[k].f) / (2 * h); });
            }
            lastJ = J; lastJX = X;
            return J;
        };
        // Try a step direction with step halving; returns true if the merit function decreased
        const tryStep = (dX) => {
            if (dX.some(d => !Number.isFinite(d))) return false;
            for (let t = 1, k = 0; k < 30; k++, t /= 2) {
                const Xn = clamp(X.map((x, m) => x + t * dX[m]));
                let rn;
                try { rn = residuals(Xn); } catch (e) { continue; }
                const en = merit(rn);
                if (Number.isFinite(en) && en < err) { X = Xn; r = rn; err = en; return true; }
            }
            return false;
        };

        let X = clamp(vars.map(v => state[v]));
        let r = residuals(X), err, refine = 0, converged = false;
        const rescale = () => { scales = r.map((e, i) => Math.max(size(e, i), 1)); err = merit(r); };
        rescale();

        for (let iter = 0; iter < this.maxIterations; iter++) {
            const J = jacobian(X), negF = r.map(e => -e.f);
            termMag = J.map(row => row.reduce((m, a, j) => Math.max(m, Math.abs(a * X[j])), 0));
            rescale();
            let dX = null;
            try { dX = math.lusolve(J, negF).flat(); } catch (e) { dX = null; }
            if (isConverged(r)) {
                // Small residuals. Stop when the Newton step is negligible too: in an ill-conditioned system (a long
                // chain of nodes, say) small residuals can still be measurably far from the solution.
                converged = true;
                if (!dX || refine >= 3 || dX.every((d, k) => Math.abs(d) <= 1e-10 * Math.max(Math.abs(X[k]), 1e-3))) break;
                let rn = null;
                const Xn = clamp(X.map((x, k) => x + dX[k]));
                try { rn = residuals(Xn); } catch (e) { rn = null; }
                if (!rn || !isConverged(rn)) break;
                X = Xn; r = rn; refine++;
                continue;
            }
            let ok = dX ? tryStep(dX) : false;
            if (!ok) {
                // Levenberg-Marquardt fallback: (J'J + lambda*I) dX = -J'f  (handles singular / poor-guess cases)
                const Jt = math.transpose(J), JtJ = math.multiply(Jt, J), g = math.multiply(Jt, negF);
                const base = Math.max(math.trace(JtJ) / n, 1e-12);
                for (let k = 0; k < 10 && !ok; k++) {
                    const lam = base * 1e-6 * Math.pow(10, k);
                    try { ok = tryStep(math.lusolve(math.add(JtJ, math.multiply(lam, math.identity(n))), g).flat()); } catch (e) { ok = false; }
                }
            }
            if (!ok) break;
        }

        vars.forEach((v, k) => state[v] = X[k]);
        if (!converged && !isConverged(r)) {
            throw new Error(`Newton iteration did not converge for [${vars.join(', ')}] in the equations at ${this.eqLabel(eqIndices)} (scaled residual ${err.toExponential(2)}). Try better guesses or tighter bounds.`);
        }
        // Warn when the solution is not unique: a (nearly) zero pivot of the row-scaled Jacobian
        try {
            const J = (lastJX === X) ? lastJ : jacobian(X);
            const Js = J.map(row => { const s = Math.sqrt(row.reduce((q, a) => q + a * a, 0)) || 1; return row.map(a => a / s); });
            const U = math.lup(Js).U, piv = (Array.isArray(U) ? U : U.toArray()).map((row, k) => Math.abs(row[k]));
            if (!(Math.min(...piv) > 1e-10 * Math.max(...piv))) console.log(`WARNING: Jacobian of block [${vars.join(', ')}] is (nearly) singular; the solution may not be unique.`);
        } catch (e) { }
    }

    /**
     * One-line  [t, y] = ode45(@(t,y) f, [t0, tf], y0):  adaptive Dormand-Prince, output at 100 equal intervals
     */
    solveODE45(odeCall, state) {
        const match = odeCall.argsRaw.match(/^@\(([^,]+),([^)]+)\)\s*(.+),\s*\[([^\]]+)\]\s*,\s*(.+)$/);
        if (!match) throw new Error("Invalid ode45 syntax format.");

        const [, tVar, yVar, funcExpr, tSpanStr, y0Str] = match;

        try {
            const compiledFunc = math.parse(funcExpr).compile();
            const baseScope = this.createScopeWithCoolProp(state);

            const derivFunc = (currT, currY) => {
                const localScope = { ...baseScope, [tVar]: currT, [yVar]: currY };
                return compiledFunc.evaluate(localScope);
            };

            const tSpanArr = math.evaluate(`[${tSpanStr}]`);
            const tSpan = (tSpanArr.isMatrix || tSpanArr.toArray) ? tSpanArr.toArray().flat() : tSpanArr;

            let t0 = parseFloat(tSpan[0]), tf = parseFloat(tSpan[1]);
            let y0 = parseFloat(math.evaluate(y0Str));

            const outs = [];
            for (let i = 1; i <= 100; i++) outs.push(i === 100 ? tf : t0 + i * (tf - t0) / 100);
            const { ys } = OdeIntegrator.dopri((t, y) => [Number(derivFunc(t, y[0]))], t0, [y0], outs, { rtol: 1e-9, atol: 1e-12, maxSteps: 200000 });
            const tArr = [t0, ...outs], yArr = [y0, ...ys.map(v => v[0])];

            state[odeCall.timeVar] = tArr;
            state[odeCall.stateVar] = yArr;
        } catch (err) {
            throw new Error(`ODE45 execution error: ${err.message}`);
        }
    }
}

// ==========================================
// 5. PARAMETRIC SWEEP CONTROLLER
// ==========================================
class ParametricController {
    constructor(parser, solverClass) {
        this.parser = parser;
        this.solverClass = solverClass;
    }

    runTable(paramVar, startVal, endVal, steps) {
        const results = [];
        const stepSize = (endVal - startVal) / (steps - 1);

        for (let i = 0; i < steps; i++) {
            const val = startVal + i * stepSize;
            this.parser.parse(document.getElementById('editor').value);

            // --- THE FIX: Inject Parametric Binding Equation ---
            try {
                const leftAST = math.parse(paramVar);
                const rightAST = math.parse(val.toString());
                this.parser.parsedASTs.push({ leftAST, rightAST, vars: [paramVar] });
            } catch (err) { }

            const solver = new this.solverClass(this.parser.parsedASTs, this.parser.variables, this.parser.odeCalls);
            const solution = solver.solve();
            results.push({ [paramVar]: val, ...solution });
        }
        return results;
    }
}

class Optimizer1D {
    constructor(parser, solverClass) {
        this.parser = parser;
        this.solverClass = solverClass;
    }

    evaluateObjective(freeVar, trialValue, targetVar, editorText) {
        this.parser.parse(editorText);

        try {
            const leftAST = math.parse(freeVar);
            const rightAST = math.parse(trialValue.toString());
            this.parser.rawEquations.push({ leftStr: freeVar, rightStr: trialValue.toString(), lineRaw: `${freeVar} = ${trialValue}` });
            this.parser.parsedASTs.push({ leftAST, rightAST, vars: [freeVar] });
        } catch (err) {
            console.error("Failed to inject free variable binding: " + err.message);
        }

        const solver = new this.solverClass(this.parser.parsedASTs, this.parser.variables, this.parser.odeCalls);
        const solution = solver.solve();

        const val = solution[targetVar];
        return (val !== undefined && !Number.isNaN(val)) ? val : NaN;
    }

    goldenSection(freeVar, targetVar, a, b, isMax, editorText) {
        const phi = (1 + Math.sqrt(5)) / 2;
        const resphi = 2 - phi;
        const tol = 1e-5;

        let c = a + resphi * (b - a);
        let d = b - resphi * (b - a);

        let fc = this.evaluateObjective(freeVar, c, targetVar, editorText);
        let fd = this.evaluateObjective(freeVar, d, targetVar, editorText);

        if (Number.isNaN(fc)) fc = isMax ? -1e9 : 1e9;
        if (Number.isNaN(fd)) fd = isMax ? -1e9 : 1e9;

        let iter = 0;
        while (Math.abs(b - a) > tol && iter < 100) {
            const condition = isMax ? (fc > fd) : (fc < fd);

            if (condition) {
                b = d;
                d = c;
                fd = fc;
                c = a + resphi * (b - a);
                fc = this.evaluateObjective(freeVar, c, targetVar, editorText);
                if (Number.isNaN(fc)) fc = isMax ? -1e9 : 1e9;
            } else {
                a = c;
                c = d;
                fc = fd;
                d = b - resphi * (b - a);
                fd = this.evaluateObjective(freeVar, d, targetVar, editorText);
                if (Number.isNaN(fd)) fd = isMax ? -1e9 : 1e9;
            }
            iter++;
        }

        const optX = (a + b) / 2;
        const optY = this.evaluateObjective(freeVar, optX, targetVar, editorText);
        return { x: optX, y: optY, iter: iter };
    }

    brentsMethod(freeVar, targetVar, a, b, isMax, editorText) {
        const tol = 1e-5;
        const CGOLD = 0.3819660;

        let e = 0.0;
        let d = 0.0;

        let x = a + CGOLD * (b - a);
        let w = x;
        let v = w;

        let fx = this.evaluateObjective(freeVar, x, targetVar, editorText);
        if (Number.isNaN(fx)) fx = 1e9;
        else if (isMax) fx = -fx;

        let fw = fx;
        let fv = fx;

        let iter = 0;
        for (iter = 0; iter < 100; iter++) {
            let xm = 0.5 * (a + b);
            let tol1 = tol * Math.abs(x) + 1e-10;
            let tol2 = 2.0 * tol1;

            if (Math.abs(x - xm) <= (tol2 - 0.5 * (b - a))) break;

            if (Math.abs(e) > tol1) {
                let r = (x - w) * (fx - fv);
                let q = (x - v) * (fx - fw);
                let p = (x - v) * q - (x - w) * r;
                q = 2.0 * (q - r);

                if (q > 0.0) p = -p;
                q = Math.abs(q);

                let etemp = e;
                e = d;

                if (Math.abs(p) >= Math.abs(0.5 * q * etemp) || p <= q * (a - x) || p >= q * (b - x)) {
                    e = x >= xm ? a - x : b - x;
                    d = CGOLD * e;
                } else {
                    d = p / q;
                    let u = x + d;
                    if (u - a < tol2 || b - u < tol2) {
                        d = (xm - x > 0) ? tol1 : -tol1;
                    }
                }
            } else {
                e = x >= xm ? a - x : b - x;
                d = CGOLD * e;
            }

            let u = Math.abs(d) >= tol1 ? x + d : x + (d > 0 ? tol1 : -tol1);

            let fu = this.evaluateObjective(freeVar, u, targetVar, editorText);
            if (Number.isNaN(fu)) {
                fu = 1e9;
            } else if (isMax) {
                fu = -fu;
            }

            if (fu <= fx) {
                if (u >= x) a = x; else b = x;
                v = w; fv = fw;
                w = x; fw = fx;
                x = u; fx = fu;
            } else {
                if (u < x) a = u; else b = u;
                if (fu <= fw || w === x) {
                    v = w; fv = fw;
                    w = u; fw = fu;
                } else if (fu <= fv || v === x || v === w) {
                    v = u; fv = fu;
                }
            }
        }

        const optY = isMax ? -fx : fx;
        return { x: x, y: optY, iter: iter };
    }
}

// ==========================================
// MULTIVARIABLE MIN/MAX: bounded BFGS (default) or Nelder-Mead simplex, optionally from several starting points.
// Each evaluation fixes the free variables, solves the whole system and reads the target. The search runs in scaled
// coordinates u = (x - lower)/(upper - lower), each in [0, 1], so variables of very different sizes are treated alike.
// ==========================================
class OptimizerND {
    constructor(parser, solverClass, text, freeVars, lower, upper, targetVar, isMax) {
        Object.assign(this, { parser, solverClass, text, freeVars, lower, upper, targetVar, isMax });
        this.n = freeVars.length;
        this.nSolves = 0;
        this.cache = new Map();
        this.warm = null;                       // state of the last solve: the starting guesses of the next one
        this.best = null;                       // { f, u, st } best point seen
        parser.parse(text);
        this.guess0 = new Map([...parser.variables].map(([k, m]) => [k, m.guess]));   // restored at the end
    }
    toX(u) { return u.map((v, k) => this.lower[k] + v * (this.upper[k] - this.lower[k])); }
    toU(x) { return x.map((v, k) => (v - this.lower[k]) / (this.upper[k] - this.lower[k])); }

    // Solves with the free variables fixed at x, starting from the values in warm (else the user's guesses)
    solveAt(x, warm) {
        const P = this.parser;
        P.parse(this.text);
        P.variables.forEach((m, k) => {
            const w = warm && warm[k];
            m.guess = (typeof w === 'number' && Number.isFinite(w)) ? w : (this.guess0.has(k) ? this.guess0.get(k) : m.guess);
        });
        this.freeVars.forEach((v, k) => {
            P.rawEquations.push({ leftStr: v, rightStr: String(x[k]), lineRaw: `${v} = ${x[k]}` });
            P.parsedASTs.push({ leftAST: P.flatIndex(math.parse(v)), rightAST: new math.ConstantNode(x[k]), vars: [v] });
        });
        this.nSolves++;
        return new this.solverClass(P.parsedASTs, P.variables, P.odeCalls).solve();
    }

    // The function minimized: the target (or minus the target, for a maximum); +Infinity where the system does not solve
    F(u) {
        const key = u.join(',');
        if (this.cache.has(key)) return this.cache.get(key);
        const x = this.toX(u);
        let val = Infinity;
        for (const warm of (this.warm ? [this.warm, null] : [null])) {   // a failed warm start is retried from the guesses
            try {
                const st = this.solveAt(x, warm), t = st[this.targetVar];
                if (typeof t === 'number' && Number.isFinite(t)) {
                    val = this.isMax ? -t : t;
                    this.warm = st;
                    if (!this.best || val < this.best.f) this.best = { f: val, u: u.slice(), st };
                } else this.lastError = `${this.targetVar} is not a number there`;
                break;
            } catch (e) { this.lastError = e.message; }
        }
        this.cache.set(key, val);
        return val;
    }

    // Gradient in u: fourth-order central differences (accurate without a tiny step, which would amplify the noise of
    // the solves); second order next to a bound, or one-sided where one side does not solve
    grad(u, f0) {
        const h = 1e-4, g = [];
        for (let k = 0; k < this.n; k++) {
            const at = (d) => { const v = u.slice(); v[k] += d; return this.F(v); };
            if (u[k] - 2 * h >= 0 && u[k] + 2 * h <= 1) {
                const f1 = at(h), f_1 = at(-h), f2 = at(2 * h), f_2 = at(-2 * h);
                if ([f1, f_1, f2, f_2].every(Number.isFinite)) { g.push((8 * (f1 - f_1) - (f2 - f_2)) / (12 * h)); continue; }
            }
            if (u[k] - h >= 0 && u[k] + h <= 1) {
                const fp = at(h), fm = at(-h);
                if (Number.isFinite(fp) && Number.isFinite(fm)) { g.push((fp - fm) / (2 * h)); continue; }
            }
            let gk = null;
            for (const s of (u[k] <= 0.5 ? [1, -1] : [-1, 1])) {
                if (u[k] + 2 * s * h < 0 || u[k] + 2 * s * h > 1) continue;
                const f1 = at(s * h), f2 = at(2 * s * h);
                if (Number.isFinite(f1) && Number.isFinite(f2)) { gk = s * (-3 * f0 + 4 * f1 - f2) / (2 * h); break; }
            }
            if (gk === null) throw new Error(`the equations do not solve near ${this.freeVars[k]} = ${+this.toX(u)[k].toPrecision(7)}${this.lastError ? ' (' + this.lastError + ')' : ''}`);
            g.push(gk);
        }
        return g;
    }

    // Quasi-Newton (BFGS) with bounds: coordinates held at a bound by the gradient stay fixed; projected backtracking line search
    bfgs(u0) {
        const n = this.n, clamp = (u) => u.map(v => Math.min(1, Math.max(0, v)));
        const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
        let u = clamp(u0), f = this.F(u);
        if (!Number.isFinite(f)) throw new Error(`the equations do not solve at the starting point${this.lastError ? ' (' + this.lastError + ')' : ''}`);
        let g = this.grad(u, f), H = null, scaled = false, iter = 0, converged = false, still = 0;
        const fRef = Math.max(Math.abs(f), 1e-300);
        for (; iter < 200; iter++) {
            const free = u.map((v, k) => !((v <= 0 && g[k] > 0) || (v >= 1 && g[k] < 0)));
            const pg = Math.max(0, ...g.map((gk, k) => free[k] ? Math.abs(gk) : 0));
            if (pg <= 1e-10 * Math.max(Math.abs(f), fRef)) { converged = true; break; }   // else the line search stops it at the noise level
            const fresh = !H;
            if (fresh) { H = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 0.1 / pg : 0)); scaled = false; }
            let d = u.map((_, i) => free[i] ? -H[i].reduce((s, h, j) => s + (free[j] ? h * g[j] : 0), 0) : 0);
            if (!(dot(g, d) < 0)) { H = null; if (fresh) break; iter--; continue; }
            let a = 1, un = null, fn = Infinity, ok = false;
            for (let ls = 0; ls < 50; ls++) {
                un = clamp(u.map((v, k) => v + a * d[k]));
                fn = this.F(un);
                if (Number.isFinite(fn) && fn <= f + 1e-4 * dot(g, un.map((v, k) => v - u[k]))) { ok = true; break; }
                a *= 0.5;
            }
            if (!ok) {   // no measurable decrease along this direction: at the noise level of the solves, or a stale H
                if (fresh) { converged = true; break; }
                H = null; iter--; continue;
            }
            const s = un.map((v, k) => v - u[k]), gn = this.grad(un, fn), y = gn.map((v, k) => v - g[k]), sy = dot(s, y);
            if (sy > 1e-12 * Math.sqrt(dot(s, s) * dot(y, y))) {
                if (!scaled) { const c = sy / dot(y, y); H = H.map((row, i) => row.map((_, j) => i === j ? c : 0)); scaled = true; }
                const rho = 1 / sy, Hy = H.map(row => dot(row, y)), yHy = dot(y, Hy);
                H = H.map((row, i) => row.map((h, j) => h - rho * (Hy[i] * s[j] + s[i] * Hy[j]) + (rho * rho * yHy + rho) * s[i] * s[j]));
            }
            const tiny = Math.max(...s.map(Math.abs)) < 1e-9 || Math.abs(f - fn) <= 1e-14 * Math.max(Math.abs(f), 1e-300);
            u = un; f = fn; g = gn;
            still = tiny ? still + 1 : 0;
            if (still >= 2) { converged = true; break; }
        }
        return { u, f, iter, converged };
    }

    // Nelder-Mead simplex (adaptive coefficients for several variables), vertices kept inside the bounds; restarted
    // from its best point until a restart no longer improves it, which guards against a collapsed simplex
    nelderMead(u0) {
        const n = this.n, clamp = (u) => u.map(v => Math.min(1, Math.max(0, v)));
        const [ar, be, ga, de] = n > 2 ? [1, 1 + 2 / n, 0.75 - 1 / (2 * n), 1 - 1 / n] : [1, 2, 0.5, 0.5];
        let start = clamp(u0), iter = 0, converged = false, f = this.F(start);
        if (!Number.isFinite(f)) throw new Error(`the equations do not solve at the starting point${this.lastError ? ' (' + this.lastError + ')' : ''}`);
        for (let restart = 0, step = 0.1; restart < 4; restart++, step = 0.05) {
            let S = [start], fs = [f];
            for (let k = 0; k < n; k++) {
                const v = start.slice(); v[k] += v[k] + step <= 1 ? step : -step;
                S.push(v); fs.push(this.F(v));
            }
            let done = false;
            for (let it = 0; it < 300 * n; it++, iter++) {
                const ord = fs.map((_, i) => i).sort((i, j) => fs[i] - fs[j]);
                S = ord.map(i => S[i]); fs = ord.map(i => fs[i]);
                const diam = Math.max(...S.slice(1).map(v => Math.max(...v.map((x, k) => Math.abs(x - S[0][k])))));
                if (diam <= 1e-9 || (diam <= 1e-7 && Math.abs(fs[n] - fs[0]) <= 1e-15 * Math.max(Math.abs(fs[0]), 1e-300))) { done = true; break; }
                const c = S[0].map((_, k) => S.slice(0, n).reduce((s, v) => s + v[k], 0) / n);
                const pt = (t) => clamp(c.map((ck, k) => ck + t * (S[n][k] - ck)));
                const xr = pt(-ar), fr = this.F(xr);
                if (fr < fs[0]) {
                    const xe = pt(-ar * be), fe = this.F(xe);
                    if (fe < fr) { S[n] = xe; fs[n] = fe; } else { S[n] = xr; fs[n] = fr; }
                } else if (fr < fs[n - 1]) { S[n] = xr; fs[n] = fr; }
                else {
                    const xc = fr < fs[n] ? pt(-ar * ga) : pt(ga), fc = this.F(xc);
                    if (fc < Math.min(fr, fs[n])) { S[n] = xc; fs[n] = fc; }
                    else for (let i = 1; i <= n; i++) { S[i] = S[0].map((x, k) => x + de * (S[i][k] - x)); fs[i] = this.F(S[i]); }
                }
            }
            const improved = fs[0] < f - 1e-12 * Math.max(Math.abs(f), 1e-300);
            start = S[0]; f = fs[0];
            if (done && !improved && restart > 0) { converged = true; break; }
            if (!done) break;
        }
        return { u: start, f, iter, converged };
    }

    // Runs the search (method 'bfgs' or 'nm') from x0, or from x0 and 7 more points spread over the bounds (Halton
    // sequence: the same points every time). Returns the best result, the distinct optima found, and the work done.
    run(method, x0, multistart) {
        const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
        const P = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
        const starts = [this.toU(x0)];
        if (multistart) for (let i = 1; i < 8; i++) starts.push(this.freeVars.map((_, k) => halton(i, P[k % P.length])));
        const runs = [];
        for (const u0 of starts) {
            this.warm = null;
            try { runs.push((method === 'nm' ? this.nelderMead(u0) : this.bfgs(u0))); }
            catch (e) { if (!multistart) throw e; runs.push({ failed: e.message }); }
        }
        const good = runs.filter(r => !r.failed && Number.isFinite(r.f));
        if (!good.length) throw new Error(`no starting point could be solved (${runs[0].failed})`);
        good.sort((a, b) => a.f - b.f);
        const optima = [];   // distinct end points (more than 0.1 % of the range apart)
        good.forEach(r => {
            const o = optima.find(o => Math.max(...o.u.map((v, k) => Math.abs(v - r.u[k]))) < 1e-3);
            if (o) o.count++; else optima.push({ u: r.u, x: this.toX(r.u), value: this.isMax ? -r.f : r.f, count: 1 });
        });
        const b = good[0];
        return { x: this.toX(b.u), value: this.isMax ? -b.f : b.f, iter: b.iter, converged: b.converged,
            atBound: this.freeVars.filter((v, k) => b.u[k] <= 1e-9 || b.u[k] >= 1 - 1e-9), optima, starts: starts.length,
            failedStarts: runs.filter(r => r.failed).length, nSolves: this.nSolves };
    }

    // Leaves the parser holding the solution at x (for the Variables pane) and restores the user's guesses
    finish(x) {
        const key = this.toU(x).join(',');
        const warm = this.best && this.best.u.join(',') === key ? this.best.st : this.warm;
        const st = this.solveAt(x, warm);
        this.parser.variables.forEach((m, k) => { if (this.guess0.has(k)) m.guess = this.guess0.get(k); });
        return st;
    }
}
