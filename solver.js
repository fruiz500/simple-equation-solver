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
        this.variablesMap.forEach((meta, name) => {
            if (meta.lower > meta.upper) throw new Error(`The bounds of ${name} are impossible: Min (${meta.lower}) is above Max (${meta.upper}), in SI.`);
            state[name] = meta.guess;
        });
        Interp.used = false; Interp.lenient = true;

        // Partition system into sequentially solvable single blocks and coupled simultaneous blocks
        const blocks = this.partitionEquations();

        for (const block of blocks) {
            try {
                if (block.type === 'single') this.solveSingleEquation(block.eqIndex, state, block.targetVar);
                else if (block.type === 'simultaneous') this.solveSimultaneousBlock(block.eqIndices, block.vars, state);
                else if (block.type === 'check') this.checkEquation(block.eqIndex, state);
            } catch (e) {   // a message that names no line (a function given wrong arguments, say) gets the block's lines
                if (/\b[Ll]ines? \d|^ode block/.test(e.message)) throw e;
                const where = this.eqLabel(block.eqIndices || block.eqIndex);
                throw new Error(where ? `${where[0].toUpperCase()}${where.slice(1)}: ${e.message}` : e.message);
            }
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

    /**
     * The order of solution as text, for the console command blockorder. Without target: the steps in the order Solve takes
     * them. With target (a variable, or an array name for all its elements): a tree from that variable back to the inputs, each
     * equation followed by the unknowns it needs, a branch shown once ("see above"). The equations a duplicate line writes are
     * one step. lines: the source lines (lineNo counts from 1); value(name): its value as text, or '' when there are no results.
     */
    blockOrder(lines = [], target = '', value = () => '') {
        const eqs = this.parsedASTs;
        if (!eqs.length) return 'There are no equations.';
        const blocks = this.partitionEquations();
        // steps: blocks, with the single equations of one duplicate line merged
        const raw = blocks.map(b => b.type === 'single' ? { kind: 'single', eq: [b.eqIndex], vars: [b.targetVar] }
            : b.type === 'simultaneous' ? { kind: 'together', eq: b.eqIndices, vars: b.vars } : { kind: 'check', eq: [b.eqIndex], vars: [] });
        const merge = (list) => {
            const byLine = new Map(), out = [];
            list.forEach(s => {
                const ln = eqs[s.eq[0]].lineNo;
                if (s.kind !== 'single' || !ln || eqs.filter(q => q.lineNo === ln).length < 2) { out.push(s); return; }
                const m = byLine.get(ln);
                if (m) { m.eq.push(...s.eq); m.vars.push(...s.vars); } else { const n = { ...s, eq: [...s.eq], vars: [...s.vars] }; byLine.set(ln, n); out.push(n); }
            });
            return out;
        };
        const graph = (steps) => {
            const of = new Map(); steps.forEach((s, k) => s.vars.forEach(v => of.set(v, k)));
            steps.forEach((s, k) => { const d = new Set(); s.eq.forEach(i => eqs[i].vars.forEach(v => { const j = of.get(v); if (j !== undefined && j !== k) d.add(j); })); s.deps = [...d]; s.needs = [...new Set(s.eq.flatMap(i => eqs[i].vars))].filter(v => of.get(v) !== k); });
            return of;
        };
        // order the merged steps after what they need, keeping Solve's order otherwise; if merging made a loop, do not merge
        const sorted = (steps) => {
            const out = [], done = new Set(), busy = new Set();
            const go = (k) => { if (done.has(k)) return true; if (busy.has(k)) return false; busy.add(k); for (const j of steps[k].deps) if (!go(j)) return false; busy.delete(k); done.add(k); out.push(steps[k]); return true; };
            for (let k = 0; k < steps.length; k++) if (!go(k)) return null;
            return out;
        };
        let steps = merge(raw); graph(steps);
        let order = sorted(steps);
        if (!order) { steps = raw.map(s => ({ ...s })); graph(steps); order = sorted(steps) || steps; }
        steps = order; const of = graph(steps);

        const short = (t) => t.length > 100 ? t.slice(0, 97) + '...' : t;
        const src = (i) => {   // the line as typed (comments cut), or the parsed text when the line is not whole
            const q = eqs[i], t = q.lineNo && lines[q.lineNo - 1] !== undefined ? lines[q.lineNo - 1].replace(/\/\/.*$/, '').trim() : '';
            const bal = (t.match(/[([]/g) || []).length === (t.match(/[)\]]/g) || []).length;
            return short(t && bal ? t : (q.lineRaw || ''));
        };
        const where = (s) => this.eqLabel(s.eq);
        const names = (vs) => {   // T[1], T[2], ..., T[9] -> T[1] to T[9]; other elements of one array -> first, ..., last (n elements)
            const out = [], arr = new Map();
            vs.forEach(v => { const m = /^(\w+)\[([^\]]+)\]$/.exec(v); if (m) { if (!arr.has(m[1])) { arr.set(m[1], []); out.push(m[1] + '[]'); } arr.get(m[1]).push(m[2]); } else out.push(v); });
            const txt = out.map(o => {
                if (!o.endsWith('[]')) return o;
                const b = o.slice(0, -2), ix = arr.get(b), el = (k) => `${b}[${k}]`;
                if (ix.every(k => /^\d+$/.test(k))) { const n = ix.map(Number).sort((a, c) => a - c); if (n.length > 2 && n[n.length - 1] - n[0] === n.length - 1) return `${el(n[0])} to ${el(n[n.length - 1])}`; }
                return ix.length > 3 ? `${el(ix[0])}, ..., ${el(ix[ix.length - 1])} (${ix.length} elements)` : ix.map(el).join(', ');
            });
            return txt.length > 12 ? txt.slice(0, 12).join(', ') + `, and ${txt.length - 12} more` : txt.join(', ');
        };
        const withValue = (s) => { if (s.vars.length !== 1) return names(s.vars); const t = value(s.vars[0]); return s.vars[0] + (t ? ' = ' + t : ''); };
        const isInput = (s) => s.kind === 'single' && s.eq.length === 1 && eqs[s.eq[0]].vars.length === 1;
        const body = (s) => {   // where the step is and what it is
            const texts = [...new Set(s.eq.map(src))];
            if (s.kind === 'together') return `${where(s)}, solved together (${s.eq.length} equations):\n` + texts.slice(0, 20).map(t => '      ' + t).join('\n') + (texts.length > 20 ? `\n      ... ${texts.length - 20} more` : '');
            return `${where(s)}   ${texts[0]}${s.eq.length > 1 ? `   (${s.eq.length} equations, duplicate)` : ''}${isInput(s) ? '   (input)' : ''}${/^ode\b/.test(eqs[s.eq[0]].lineRaw || '') ? '   (ode block)' : ''}`;
        };

        if (!target) {
            const n = steps.filter(s => s.kind !== 'check').length;
            const out = [`Order of solution: ${eqs.length} equation(s) in ${n} step(s)${steps.some(s => s.kind === 'together') ? '; equations solved together are coupled' : ''}. blockorder <variable> traces one back to the inputs.`];
            let k = 0;
            steps.forEach(s => {
                if (s.kind === 'check') { out.push(`   check: ${body(s)}   (no unknown left: it must hold)`); return; }
                k++;
                out.push(s.kind === 'together' ? `${String(k).padStart(3)}. ${names(s.vars)}: ${body(s)}` : `${String(k).padStart(3)}. ${withValue(s)}: ${body(s)}`);
            });
            return out.join('\n');
        }

        const t = String(target).trim();
        const roots = [...new Set([...of.keys()].filter(v => v === t || v.startsWith(t + '[')).map(v => of.get(v)))];
        if (!roots.length) throw new Error(`blockorder: ${t} is not a variable of the equations`);
        const out = [`How ${t} is found, from the goal back to the inputs ("needs" lists the unknowns an equation uses):`], shown = new Set();
        let count = 0;
        const node = (k, depth, label) => {
            if (++count > 400) { if (count === 401) out.push('  ... (the tree is cut here)'); return; }
            const s = steps[k], pad = '  '.repeat(depth);
            if (shown.has(k) && !isInput(s)) { out.push(`${pad}${label}: see above (${where(s)})`); return; }   // an input is one line: repeated
            shown.add(k);
            out.push(`${pad}${label}: ${body(s).replace(/\n/g, '\n' + pad)}`);
            // the unknowns this step needs, each once, grouped by the step that gives them
            const by = new Map();
            s.needs.forEach(v => { const j = of.get(v); if (j === undefined) return; if (!by.has(j)) by.set(j, []); by.get(j).push(v); });
            by.forEach((vs, j) => node(j, depth + 1, 'needs ' + label1(vs)));
        };
        const label1 = (vs) => { if (vs.length !== 1) return names(vs); const tv = value(vs[0]); return vs[0] + (tv ? ' = ' + tv : ''); };
        roots.forEach(k => node(k, 0, label1(steps[k].vars.filter(v => v === t || v.startsWith(t + '[')))));
        return out.join('\n');
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
            let val; try { val = rightAST.evaluate(scope); } catch (err) { }
            if (val !== undefined) { this.noComplex(val, eqIndex, targetVar); state[targetVar] = val; return; }
        }
        if (rightAST.toString() === targetVar && !refsTarget(leftAST)) {
            let val; try { val = leftAST.evaluate(scope); } catch (err) { }
            if (val !== undefined) { this.noComplex(val, eqIndex, targetVar); state[targetVar] = val; return; }
        }

        this.solveSimultaneousBlock([eqIndex], [targetVar], state);
    }

    // Update guesses: the values of the last solution become the guesses (numbers within the bounds only)
    static adoptGuesses(variables) {
        variables.forEach(m => { const v = m.value; if (typeof v === 'number' && Number.isFinite(v) && v >= m.lower && v <= m.upper) m.guess = v; });
    }

    // math.js gives complex numbers for sqrt(-1), log(-1), (-8)^(1/3) and so on. They are not supported (yet), and in
    // these equations they nearly always mean a mistake, such as a negative value under a square root.
    noComplex(val, eqIndex, name) {
        const t = math.typeOf(val);
        const list = t === 'Array' ? val : (t === 'DenseMatrix' || t === 'SparseMatrix') ? val.toArray() : null;
        const z = t === 'Complex' ? val : list ? list.flat(Infinity).find(v => math.typeOf(v) === 'Complex') : undefined;
        if (z === undefined) return;
        throw new Error(`${this.eqLabel(eqIndex).replace(/^l/, 'L')}: ${t === 'Complex' ? name + ' comes out as' : 'an element of ' + name + ' is'} the complex number ${math.format(z, { precision: 6 })}, ` +
            `for example from the square root or logarithm of a negative number. Complex numbers are not supported in the equations; for a complex calculation, use the console line below the Console.`);
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
    // A block whose Newton iteration fails, with unknowns still at the default guess of 1, is tried again from typical values
    // of those unknowns: a temperature from 300 K, a pressure from 1 bar, an enthalpy from 1e5 J/kg, a quality from 0.5, and so
    // on. The kind of each unknown comes from the property calls it is an input of ('T', 'P', 'H', ... of the call), or from
    // the unit Check Units found for it. Guesses set by the user are never changed.
    static TYPICAL = {
        T: [300, 500, 800, 250, 1200], P: [1e5, 1e6, 1e4, 1e7, 1e3], H: [1e5, 1e6, 3e6, 3e5, -1e5], U: [1e5, 1e6, 2.5e6, 3e5, -1e5],
        S: [1e3, 5e3, 7e3, 300, 2e3], Q: [0.5, 0.1, 0.9, 0.01, 0.99], D: [1, 1000, 10, 100, 0.1], V: [1, 1e-3, 0.1, 10, 1e-2],
    };
    static UNIT_KIND = { K: 'T', Pa: 'P', 'J/kg': 'H', 'J/(kg K)': 'S', 'kg/m^3': 'D', 'm^3/kg': 'V' };
    kindOf(v) {
        if (!this._kinds) {   // once per solve: the property keys each variable is given for
            this._kinds = new Map();
            const keyOf = (k) => { const t = String(k).trim(); const u = t.toUpperCase(); return ({ T: 'T', TEMPERATURE: 'T', P: 'P', PRESSURE: 'P', H: 'H', ENTHALPY: 'H', S: 'S', ENTROPY: 'S', U: 'U', INTERNALENERGY: 'U', Q: 'Q', X: 'Q', QUALITY: 'Q', D: 'D', DENSITY: 'D', V: 'V', SPECIFICVOLUME: 'V' })[u]; };
            this.parsedASTs.forEach(eq => [eq.leftAST, eq.rightAST].forEach(ast => ast.traverse(nd => {
                if (!nd.isFunctionNode) return;
                nd.args.forEach((arg, i) => {
                    if (!(arg.isConstantNode && typeof arg.value === 'string') || i + 1 >= nd.args.length) return;
                    const kind = keyOf(arg.value), nx = nd.args[i + 1];
                    if (kind && nx.isSymbolNode && !this._kinds.has(nx.name)) this._kinds.set(nx.name, kind);
                });
            })));
        }
        if (this._kinds.has(v)) return this._kinds.get(v);
        const m = this.variablesMap.get(v);
        return m && BoundedSolver.UNIT_KIND[m.inferredUnit];
    }
    solveSimultaneousBlock(eqIndices, vars, state) {
        const start = vars.map(v => state[v]);
        try { return this.solveSimultaneousBlockOnce(eqIndices, vars, state); }
        catch (first) {
            const retry = vars.map((v, k) => { const m = this.variablesMap.get(v); return start[k] === 1 && (!m || m.guess === 1) ? this.kindOf(v) : null; });
            if (!retry.some(Boolean)) throw first;
            for (let c = 0; c < 5; c++) {
                vars.forEach((v, k) => { state[v] = retry[k] ? BoundedSolver.TYPICAL[retry[k]][c] : start[k]; });
                try { return this.solveSimultaneousBlockOnce(eqIndices, vars, state); } catch (e) { /* the next set of starting values */ }
            }
            vars.forEach((v, k) => { state[v] = start[k]; });
            throw first;
        }
    }
    solveSimultaneousBlockOnce(eqIndices, vars, state) {
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

        // Starting point. An equation  v = expression  whose v is an unknown of the block still at the default guess of 1 is
        // evaluated from the current values of the others, so that derived quantities (C = m*cp, NTU = UA/C_min, ...) start
        // consistent with the guessed ones (the temperatures, say) instead of at 1. Two passes, so that the order of the
        // lines does not matter; a value that cannot be computed (an error, not a finite number) keeps the guess.
        const atDefault = new Set(vars.filter(v => state[v] === 1 && (this.variablesMap.get(v) || {}).guess === 1));
        if (atDefault.size) {
            setX(vars.map(v => state[v]));
            for (let pass = 0; pass < 2; pass++) eqs.forEach(eq => {
                const L = eq.leftAST;
                if (!L.isSymbolNode || !atDefault.has(L.name) || eq.rightAST.filter(nd => nd.isSymbolNode && nd.name === L.name).length) return;
                let v; try { v = eq.code[1].evaluate(scope); } catch (e) { return; }
                if (typeof v === 'number' && Number.isFinite(v)) BoundedSolver.setVar(scope, L.name, v);
            });
        }
        let X = clamp(vars.map(v => atDefault.has(v) && typeof scope[v] === 'number' ? scope[v] : state[v]));
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
// Definite integrals: integral(expression, x, a, b). Adaptive Gauss-Kronrod quadrature, the 7-point Gauss and 15-point
// Kronrod rule of QUADPACK (Piessens et al., 1983), refining the subinterval with the largest error estimate until the
// estimate is below 1e-10 of the result (or 1e-13 of the integral of |f|). Infinite limits by x = a + t/(1 - t) and the like.
class Quadrature {
    static XK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
        0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
        0.207784955007898467600689403773245, 0];
    static WK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
        0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
        0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
    static WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975,
        0.417959183673469387755102040816327];   // Gauss weights at XK[1], XK[3], XK[5], XK[7]
    static MAXSUB = 2000;
    static rule(f, a, b) {
        const Q = Quadrature, c = (a + b) / 2, h = (b - a) / 2;
        let k = 0, g = 0, ab = 0;
        for (let i = 0; i < 8; i++) {
            const ys = i === 7 ? [f(c)] : [f(c - h * Q.XK[i]), f(c + h * Q.XK[i])];
            const y = ys.reduce((s, v) => s + v, 0);
            k += Q.WK[i] * y; ab += Q.WK[i] * ys.reduce((s, v) => s + Math.abs(v), 0);
            if (i % 2 === 1) g += Q.WG[(i - 1) / 2] * y;
        }
        return { a, b, I: k * h, err: Math.abs((k - g) * h), abs: ab * Math.abs(h) };
    }
    static integrate(f0, a, b) {
        if (a === b) return 0;
        if (a > b) return -Quadrature.integrate(f0, b, a);
        let f = f0, lo = a, hi = b;
        if (a === -Infinity && b === Infinity) return Quadrature.integrate(f0, -Infinity, 0) + Quadrature.integrate(f0, 0, Infinity);
        if (b === Infinity) { f = (t) => f0(a + t / (1 - t)) / ((1 - t) * (1 - t)); lo = 0; hi = 1; }
        else if (a === -Infinity) { f = (t) => f0(b - (1 - t) / t) / (t * t); lo = 0; hi = 1; }
        const parts = [Quadrature.rule(f, lo, hi)];
        for (let n = 0; ; n++) {
            const I = parts.reduce((s, p) => s + p.I, 0), err = parts.reduce((s, p) => s + p.err, 0), abs = parts.reduce((s, p) => s + p.abs, 0);
            if (err <= Math.max(1e-10 * Math.abs(I), 1e-13 * abs)) return I;
            if (n >= Quadrature.MAXSUB) throw new Error(`integral(): no convergence after ${n} subdivisions (estimated error ${err.toPrecision(3)} in ${I.toPrecision(6)}); the integrand may be singular or oscillate`);
            let w = 0;
            parts.forEach((p, i) => { if (p.err > parts[w].err) w = i; });
            const p = parts[w], m = (p.a + p.b) / 2;
            parts.splice(w, 1, Quadrature.rule(f, p.a, m), Quadrature.rule(f, m, p.b));
        }
    }
    // The math.js function: it gets the expression unevaluated and evaluates it with the dummy variable set
    static fn(args, math, scope) {
        const [ex, x, aN, bN] = args, name = x.name, code = ex.compile();
        const a = aN.compile().evaluate(scope), b = bN.compile().evaluate(scope);
        if (typeof a !== 'number' || typeof b !== 'number' || Number.isNaN(a) || Number.isNaN(b)) throw new Error('integral(): the limits a and b must be numbers');
        let xv = 0;
        const keys = () => { const s = new Set(scope.keys()); s.add(name); return s.values(); };   // an integral inside copies the scope by its keys
        const sub = { get: (k) => k === name ? xv : scope.get(k), has: (k) => k === name || scope.has(k), set: (k, v) => scope.set(k, v), keys };
        const shown = (typeof UserFunctions !== 'undefined' && UserFunctions.ivNames.get(name)) || name;
        return Quadrature.integrate((t) => {
            xv = t;
            const y = code.evaluate(sub);
            if (typeof y !== 'number' || !Number.isFinite(y)) throw new Error(`integral(): the expression is ${typeof y === 'number' ? y : 'not a number'} at ${shown} = ${t}`);
            return y;
        }, a, b);
    }
}
Quadrature.fn.rawArgs = true;
if (typeof math !== 'undefined') math.import({ integral: Quadrature.fn }, { override: true });

// Functions of Matlab that math.js lacks, for the equations and the console (Matlab's names, argument orders and conventions):
// linspace, logspace, trapz, cumtrapz, polyfit, polyval, lsqfit (nonlinear least squares), normcdf, norminv, tcdf, tinv,
// gammainc, betainc, expint, erfinv. Arrays come back as math.js matrices. The special functions follow Numerical Recipes
// (W. H. Press et al., 3rd ed., 2007: series and continued fractions, Secs. 6.2, 6.3 and 6.4), checked against Abramowitz and
// Stegun; inverses by Newton's method on the function itself.
const MathX = (() => {
    const arr = (v, what) => {
        const a = v && typeof v.toArray === 'function' ? v.toArray() : v;
        if (!Array.isArray(a)) throw new Error(`${what} must be an array`);
        const f = a.flat(Infinity).map(x => { const n = typeof x === 'number' ? x : Number(x); if (!Number.isFinite(n)) throw new Error(`${what} has an entry that is not a number`); return n; });
        return f;
    };
    const num = (v, what) => { const n = Number(v); if (typeof v === 'object' || !Number.isFinite(n)) throw new Error(`${what} must be a number`); return n; };
    const out = (a) => math.matrix(a);
    const linspace = (a, b, n = 100) => {
        a = num(a, 'linspace(): a'); b = num(b, 'linspace(): b'); n = num(n, 'linspace(): n');
        if (!(Number.isInteger(n) && n >= 2)) throw new Error('linspace(): n must be a whole number of 2 or more');
        return out(Array.from({ length: n }, (_, k) => k === n - 1 ? b : a + (b - a) * k / (n - 1)));
    };
    const logspace = (a, b, n = 50) => out(linspace(a, b, n).toArray().map(v => 10 ** v));
    const xy = (fn, x, y) => {
        if (y === undefined) { y = arr(x, `${fn}(): y`); x = y.map((_, k) => k + 1); }
        else { x = arr(x, `${fn}(): x`); y = arr(y, `${fn}(): y`); }
        if (x.length !== y.length) throw new Error(`${fn}(): x and y have ${x.length} and ${y.length} values`);
        if (x.length < 2) throw new Error(`${fn}(): at least 2 points are needed`);
        return [x, y];
    };
    const trapz = (x, y) => { [x, y] = xy('trapz', x, y); let s = 0; for (let k = 1; k < x.length; k++) s += (x[k] - x[k - 1]) * (y[k] + y[k - 1]) / 2; return s; };
    const cumtrapz = (x, y) => { [x, y] = xy('cumtrapz', x, y); const c = [0]; for (let k = 1; k < x.length; k++) c.push(c[k - 1] + (x[k] - x[k - 1]) * (y[k] + y[k - 1]) / 2); return out(c); };
    // Linear least squares by Householder QR: A p = y. -> p, and the covariance of p (s^2 (A'A)^-1), R^2 and rms residual
    const lstsq = (A, y, fn) => {
        const m = A.length, n = A[0].length;
        if (m < n) throw new Error(`${fn}(): ${m} points cannot fix ${n} parameters`);
        const Q = A.map(r => r.slice()), b = y.slice(), R = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let j = 0; j < n; j++) {
            let nrm = 0; for (let i = j; i < m; i++) nrm += Q[i][j] ** 2; nrm = Math.sqrt(nrm);
            if (!(nrm > 1e-300)) throw new Error(`${fn}(): the parameters cannot all be found from these points (the columns are dependent)`);
            const alpha = Q[j][j] > 0 ? -nrm : nrm, v = Q.map((r, i) => (i < j ? 0 : r[j])); v[j] -= alpha;
            const vv = v.reduce((s, t) => s + t * t, 0);
            for (let k = j; k < n; k++) { let d = 0; for (let i = j; i < m; i++) d += v[i] * Q[i][k]; d = 2 * d / vv; for (let i = j; i < m; i++) Q[i][k] -= d * v[i]; }
            let d = 0; for (let i = j; i < m; i++) d += v[i] * b[i]; d = 2 * d / vv; for (let i = j; i < m; i++) b[i] -= d * v[i];
        }
        for (let i = 0; i < n; i++) for (let k = i; k < n; k++) R[i][k] = Q[i][k];
        if (R.some((r, i) => Math.abs(r[i]) < 1e-14 * Math.abs(R[0][0]))) throw new Error(`${fn}(): the parameters cannot all be found from these points (the columns are dependent)`);
        const p = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= R[i][k] * p[k]; p[i] = s / R[i][i]; }
        const res = y.map((yi, i) => yi - A[i].reduce((s, a, k) => s + a * p[k], 0)), sse = res.reduce((s, r) => s + r * r, 0);
        const Ri = Array.from({ length: n }, () => new Array(n).fill(0));   // R^-1, so (A'A)^-1 = R^-1 R^-T
        for (let j = 0; j < n; j++) { Ri[j][j] = 1 / R[j][j]; for (let i = j - 1; i >= 0; i--) { let s = 0; for (let k = i + 1; k <= j; k++) s += R[i][k] * Ri[k][j]; Ri[i][j] = -s / R[i][i]; } }
        const s2 = m > n ? sse / (m - n) : NaN, ym = y.reduce((s, v) => s + v, 0) / m, sst = y.reduce((s, v) => s + (v - ym) ** 2, 0);
        const se = Ri.map(r => Math.sqrt(s2 * r.reduce((s, v) => s + v * v, 0)));
        return { p, se, r2: sst > 0 ? 1 - sse / sst : 1, rmse: m > n ? Math.sqrt(sse / (m - n)) : 0, res, y, dof: m - n };   // rmse with m - n degrees of freedom, as Matlab's fit reports it
    };
    // What a fit returns: the parameters, or (last arguments) 'stderr', 'r2', 'adjr2', 'rmse', 'resid' (y - fit), 'fit' (the
    // fitted values), 'tstat' (parameter/standard error), 'pvalue' (two-sided, for parameter = 0: below 0.05, the parameter is
    // significant at the 5 % level), 'ci' (confidence intervals, one row [low, high] per parameter, 95 % or the level given),
    // 'summary' (one row per parameter: value, standard error, t, p).
    const pick = (fit, what, fn, level) => {
        const w = what === undefined ? 'p' : String(what).trim().toLowerCase();
        if (w === 'p') return out(fit.p);
        if (w === 'r2') return fit.r2;
        if (w === 'rmse') return fit.rmse;
        if (w === 'resid') return out(fit.res);
        if (w === 'fit') return out(fit.y.map((v, i) => v - fit.res[i]));
        if (w === 'adjr2') { if (!(fit.dof > 0)) throw new Error(`${fn}(): the adjusted R^2 needs more points than parameters`); return 1 - (1 - fit.r2) * (fit.y.length - 1) / fit.dof; }
        const stats = ['stderr', 'tstat', 'pvalue', 'ci', 'summary'];
        if (!stats.includes(w)) throw new Error(`${fn}(): the last argument is one of 'stderr', 'r2', 'adjr2', 'rmse', 'resid', 'fit', 'tstat', 'pvalue', 'ci', 'summary'`);
        if (!(fit.dof > 0) || !fit.se.every(Number.isFinite)) throw new Error(`${fn}(): the statistics of the parameters need more points than parameters`);
        if (w === 'stderr') return out(fit.se);
        const t = fit.p.map((v, i) => fit.se[i] > 0 ? v / fit.se[i] : (v === 0 ? 0 : Infinity));
        const pv = t.map(x => Number.isFinite(x) ? Math.min(1, 2 * tcdf(-Math.abs(x), fit.dof)) : 0);
        if (w === 'tstat') return out(t);
        if (w === 'pvalue') return out(pv);
        if (w === 'summary') return out(fit.p.map((v, i) => [v, fit.se[i], t[i], pv[i]]));
        const L = level === undefined ? 0.95 : num(level, `${fn}(): the confidence level`);
        if (!(L > 0 && L < 1)) throw new Error(`${fn}(): the confidence level is between 0 and 1, as 0.95`);
        const k = tinv(1 - (1 - L) / 2, fit.dof);
        return out(fit.p.map((v, i) => [v - k * fit.se[i], v + k * fit.se[i]]));
    };
    const polyfit = (x, y, n, what, level) => {
        x = arr(x, 'polyfit(): x'); y = arr(y, 'polyfit(): y'); n = num(n, 'polyfit(): n');
        if (x.length !== y.length) throw new Error(`polyfit(): x and y have ${x.length} and ${y.length} values`);
        if (!(Number.isInteger(n) && n >= 0)) throw new Error('polyfit(): the degree n must be a whole number');
        const A = x.map(xi => Array.from({ length: n + 1 }, (_, k) => xi ** (n - k)));   // highest power first, as Matlab
        return pick(lstsq(A, y, 'polyfit'), what, 'polyfit', level);
    };
    // regress(y, X): multiple linear regression y = X b, as Matlab's regress: one column of X per term, and a column of ones
    // for a constant term. X may be one column (a vector). Same last arguments as polyfit.
    const regress = (y, X, what, level) => {
        y = arr(y, 'regress(): y');
        const Xa = X && typeof X.toArray === 'function' ? X.toArray() : X;
        if (!Array.isArray(Xa)) throw new Error('regress(): X must be a matrix, one column per term');
        const A = Array.isArray(Xa[0]) ? Xa.map(r => arr(r, 'regress(): X')) : arr(Xa, 'regress(): X').map(v => [v]);
        if (A.length !== y.length) throw new Error(`regress(): y has ${y.length} values and X has ${A.length} rows; X needs one row per point`);
        if (!A.every(r => r.length === A[0].length)) throw new Error('regress(): the rows of X have different lengths');
        return pick(lstsq(A, y, 'regress'), what, 'regress', level);
    };
    const polyval = (p, x) => {
        p = arr(p, 'polyval(): p');
        const ev = (t) => p.reduce((s, c) => s * t + c, 0);
        if (x && typeof x === 'object') return out(arr(x, 'polyval(): x').map(ev));
        return ev(num(x, 'polyval(): x'));
    };
    // lsqfit('a*exp(-b*x)', x, y, 'a b', [a0, b0]): Levenberg-Marquardt, the Jacobian by central differences
    const cache = new Map();
    const lsqfit = (model, x, y, names, guess, what, level) => {
        const fn = 'lsqfit';
        x = arr(x, 'lsqfit(): x'); y = arr(y, 'lsqfit(): y');
        if (x.length !== y.length) throw new Error(`lsqfit(): x and y have ${x.length} and ${y.length} values`);
        const pn = String(names).trim().split(/[\s,]+/), p0 = guess && typeof guess === 'object' ? arr(guess, 'lsqfit(): the guesses') : [num(guess, 'lsqfit(): the guess')];
        if (pn.length !== p0.length) throw new Error(`lsqfit(): ${pn.length} parameter names and ${p0.length} guesses`);
        const key = JSON.stringify([model, x, y, pn, p0]);
        let fit = cache.get(key);
        if (!fit) {
            let code;
            try { code = math.compile(String(model)); } catch (e) { throw new Error(`lsqfit(): the model '${model}' cannot be read: ${e.message}`); }
            const f = (p, xi) => { const sc = { x: xi }; pn.forEach((nm, k) => { sc[nm] = p[k]; }); const v = code.evaluate(sc); if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`lsqfit(): the model gives '${v}' at x = ${xi}`); return v; };
            const resid = (p) => x.map((xi, i) => y[i] - f(p, xi)), sse = (r) => r.reduce((s, v) => s + v * v, 0);
            const jac = (p) => x.map(xi => p.map((pk, k) => { const h = 1e-6 * Math.max(Math.abs(pk), 1e-3), a = p.slice(), b = p.slice(); a[k] += h; b[k] -= h; return (f(a, xi) - f(b, xi)) / (2 * h); }));
            let p = p0.slice(), r = resid(p), S = sse(r), lam = 1e-3;
            for (let it = 0; it < 500; it++) {
                const J = jac(p), n = p.length;
                const JtJ = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => J.reduce((s, row) => s + row[i] * row[j], 0)));
                const g = Array.from({ length: n }, (_, i) => J.reduce((s, row, k) => s + row[i] * r[k], 0));
                let improved = false;
                for (let tries = 0; tries < 30 && !improved; tries++) {
                    const M = JtJ.map((row, i) => [...row.map((v, j) => v + (i === j ? lam * (row[i] || 1e-12) : 0)), g[i]]);
                    let dp;
                    try { dp = Chem.gauss(M, 'lsqfit'); } catch (e) { lam *= 10; continue; }
                    const pt = p.map((v, i) => v + dp[i]);
                    let rt, St;
                    try { rt = resid(pt); St = sse(rt); } catch (e) { lam *= 10; continue; }
                    if (St <= S) { const done = Math.abs(S - St) <= 1e-15 * Math.max(S, 1e-300) || dp.every((d, i) => Math.abs(d) <= 1e-12 * Math.max(Math.abs(pt[i]), 1e-12)); p = pt; r = rt; S = St; lam = Math.max(lam / 10, 1e-12); improved = true; if (done) it = 500; }
                    else lam *= 10;
                }
                if (!improved) break;
            }
            fit = { ...lstsq(jac(p), r, fn), p };   // the covariance from the linearized problem at the optimum
            const ym = y.reduce((s, v) => s + v, 0) / y.length, sst = y.reduce((s, v) => s + (v - ym) ** 2, 0);
            fit.r2 = sst > 0 ? 1 - S / sst : 1; fit.rmse = y.length > p.length ? Math.sqrt(S / (y.length - p.length)) : 0;
            fit.res = r; fit.y = y;   // the residuals of the model itself, not of the last linearized step
            cache.set(key, fit); if (cache.size > 200) cache.delete(cache.keys().next().value);
        }
        return pick(fit, what, fn, level);
    };
    // Special functions
    // ln Gamma(x), x > 0: Lanczos series of Numerical Recipes, 3rd ed. (2007), sec. 6.1, good to about 1e-15.
    // (math.lgamma is off by 2e-12 at x = 1/2, which showed up in tcdf.)
    const LANCZOS = [57.1562356658629235, -59.5979603554754912, 14.1360979747417471, -0.491913816097620199, .339946499848118887e-4, .465236289270485756e-4, -.983744753048795646e-4,
        .158088703224912494e-3, -.210264441724104883e-3, .217439618115212643e-3, -.164318106536763890e-3, .844182239838527433e-4, -.261908384015814087e-4, .368991826595316234e-5];
    const gln = (x) => {
        let y = x, t = x + 5.2421875, ser = 0.999999999999997092; t = (x + 0.5) * Math.log(t) - t;
        for (const c of LANCZOS) ser += c / ++y;
        return t + Math.log(2.5066282746310005 * ser / x);
    };
    // [P, Q] of the regularized incomplete gamma, each computed directly where it is the small one: series or continued fraction
    const gammaPQ = (a, x) => {
        if (x === 0) return [0, 1];
        const pre = Math.exp(-x + a * Math.log(x) - gln(a));
        if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; } const P = sum * pre; return [P, 1 - P]; }
        let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
        for (let i = 1; i < 1000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break; }
        const Q = pre * h; return [1 - Q, Q];
    };
    const gammainc = (x, a, tail) => {   // regularized incomplete gamma: P(a, x), or Q(a, x) with 'upper', as Matlab's gammainc(x, a)
        x = num(x, 'gammainc(): x'); a = num(a, 'gammainc(): a');
        if (!(x >= 0 && a > 0)) throw new Error('gammainc(): needs x >= 0 and a > 0');
        const t = tail === undefined ? 'lower' : String(tail).trim().toLowerCase();
        if (t !== 'lower' && t !== 'upper') throw new Error("gammainc(): the third argument is 'lower' or 'upper'");
        return gammaPQ(a, x)[t === 'upper' ? 1 : 0];
    };
    const betacf = (a, b, x) => {
        let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
        for (let m = 1; m < 1000; m++) {
            const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del;
            if (Math.abs(del - 1) < 1e-16) break;
        }
        return h;
    };
    const betainc = (x, a, b) => {   // regularized incomplete beta I_x(a, b), Matlab's betainc(x, a, b)
        x = num(x, 'betainc(): x'); a = num(a, 'betainc(): a'); b = num(b, 'betainc(): b');
        if (!(x >= 0 && x <= 1 && a > 0 && b > 0)) throw new Error('betainc(): needs 0 <= x <= 1, a > 0 and b > 0');
        if (x === 0 || x === 1) return x;
        const bt = Math.exp(gln(a + b) - gln(a) - gln(b) + a * Math.log(x) + b * Math.log(1 - x));
        return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
    };
    const expint = (x) => {   // E1(x), x > 0
        x = num(x, 'expint(): x');
        if (!(x > 0)) throw new Error('expint(): x must be positive (E1 of a real argument)');
        if (x > 1) { let b = x + 1, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 1000; i++) { const an = -i * i; b += 2; d = 1 / (an * d + b); c = b + an / c; const del = c * d; h *= del; if (Math.abs(del - 1) < 1e-16) break; } return h * Math.exp(-x); }
        let ans = -Math.log(x) - 0.57721566490153286, fact = 1;
        for (let i = 1; i < 1000; i++) { fact *= -x / i; const del = -fact / i; ans += del; if (Math.abs(del) < Math.abs(ans) * 1e-16) break; }
        return ans;
    };
    const newton = (f, df, x, lo, hi) => { for (let it = 0; it < 100; it++) { const dx = f(x) / df(x); let xn = x - dx; if (lo !== undefined) xn = Math.min(Math.max(xn, lo), hi); if (Math.abs(xn - x) <= 1e-15 * Math.max(1, Math.abs(xn))) return xn; x = xn; } return x; };
    const erfinv = (y) => {
        y = num(y, 'erfinv(): y');
        if (!(y > -1 && y < 1)) { if (y === 1) return Infinity; if (y === -1) return -Infinity; throw new Error('erfinv(): y must be between -1 and 1'); }
        const w = Math.log((1 - y) * (1 + y)), x0 = Math.sign(y) * Math.sqrt(Math.sqrt((2 / (Math.PI * 0.147) + w / 2) ** 2 - w / 0.147) - (2 / (Math.PI * 0.147) + w / 2));   // Winitzki's approximation
        return newton((x) => math.erf(x) - y, (x) => 2 / Math.sqrt(Math.PI) * Math.exp(-x * x), x0);
    };
    const normcdf = (x, mu = 0, sigma = 1) => {
        x = num(x, 'normcdf(): x'); mu = num(mu, 'normcdf(): mu'); sigma = num(sigma, 'normcdf(): sigma');
        if (!(sigma > 0)) throw new Error('normcdf(): sigma must be positive');
        const z = (x - mu) / (sigma * Math.SQRT2);
        return z < 0 ? 0.5 * gammaPQ(0.5, z * z)[1] : 0.5 * (1 + math.erf(z));   // the lower tail as erfc(-z)/2 = Q(1/2, z^2)/2
    };
    const norminv = (p, mu = 0, sigma = 1) => {
        p = num(p, 'norminv(): p'); mu = num(mu, 'norminv(): mu'); sigma = num(sigma, 'norminv(): sigma');
        if (!(p > 0 && p < 1)) throw new Error('norminv(): p must be between 0 and 1');
        if (!(sigma > 0)) throw new Error('norminv(): sigma must be positive');
        const z = p < 0.5 ? -Math.SQRT2 * erfinv(1 - 2 * p) : Math.SQRT2 * erfinv(2 * p - 1);
        return mu + sigma * z;
    };
    const tcdf = (t, nu) => {
        t = num(t, 'tcdf(): t'); nu = num(nu, 'tcdf(): nu');
        if (!(nu > 0)) throw new Error('tcdf(): the degrees of freedom nu must be positive');
        const ib = betainc(nu / (nu + t * t), nu / 2, 0.5);
        return t >= 0 ? 1 - ib / 2 : ib / 2;
    };
    const tinv = (p, nu) => {
        p = num(p, 'tinv(): p'); nu = num(nu, 'tinv(): nu');
        if (!(p > 0 && p < 1)) throw new Error('tinv(): p must be between 0 and 1');
        if (!(nu > 0)) throw new Error('tinv(): the degrees of freedom nu must be positive');
        const pdf = (t) => Math.exp(gln((nu + 1) / 2) - gln(nu / 2) - 0.5 * Math.log(nu * Math.PI) - (nu + 1) / 2 * Math.log(1 + t * t / nu));
        let lo = -1, hi = 1; while (tcdf(lo, nu) > p) lo *= 2; while (tcdf(hi, nu) < p) hi *= 2;
        let t = norminv(p); t = Math.min(Math.max(t, lo), hi);
        for (let it = 0; it < 200; it++) {
            const f = tcdf(t, nu) - p; if (f > 0) hi = t; else lo = t;
            let tn = t - f / pdf(t); if (!(tn > lo && tn < hi)) tn = (lo + hi) / 2;
            if (Math.abs(tn - t) <= 1e-14 * Math.max(1, Math.abs(tn))) return tn;
            t = tn;
        }
        return t;
    };
    // roots(p): the roots of a polynomial of any degree, coefficients highest power first (Matlab's order), by the Aberth-Ehrlich
    // method (simultaneous Newton steps with repulsion between the estimates; O. Aberth, Math. Comp. 27, 1973), then polished by
    // Newton's method on the polynomial. In equations: the real roots, smallest first. roots(p, 'all'): every root, complex ones too.
    const roots = (p, what) => {
        let c = arr(p, 'roots(): p');
        while (c.length && c[0] === 0) c.shift();
        let zeros = 0; while (c.length > 1 && c[c.length - 1] === 0) { c.pop(); zeros++; }
        const n = c.length - 1;
        if (c.length === 0) throw new Error('roots(): every coefficient is 0');
        const all = what !== undefined && String(what).trim().toLowerCase() === 'all';
        if (what !== undefined && !all) throw new Error("roots(): the second argument may only be 'all'");
        const z = [];
        if (n >= 1) {
            const a = c.map(v => v / c[0]);   // monic
            const ev = (re, im) => {   // p(z) and p'(z) by Horner, complex
                let pr = 1, pi = 0, dr = 0, di = 0;
                for (let k = 1; k <= n; k++) {
                    const ndr = dr * re - di * im + pr, ndi = dr * im + di * re + pi; dr = ndr; di = ndi;
                    const npr = pr * re - pi * im + a[k], npi = pr * im + pi * re; pr = npr; pi = npi;
                }
                return [pr, pi, dr, di];
            };
            const R = 1 + Math.max(...a.slice(1).map(Math.abs));   // Cauchy's bound on the roots
            const r0 = Math.min(R, Math.max(...a.slice(1).map((v, k) => Math.abs(v) ** (1 / (k + 1)))) || 1);
            for (let k = 0; k < n; k++) { const t = 2 * Math.PI * k / n + 0.4; z.push([r0 * Math.cos(t), r0 * Math.sin(t)]); }
            for (let it = 0; it < 1000; it++) {
                let moved = 0;
                for (let k = 0; k < n; k++) {
                    const [pr, pi, dr, di] = ev(z[k][0], z[k][1]);
                    if (pr === 0 && pi === 0) continue;
                    const dd = dr * dr + di * di; if (dd === 0) { z[k][0] += 1e-8; continue; }
                    const wr = (pr * dr + pi * di) / dd, wi = (pi * dr - pr * di) / dd;   // w = p/p'
                    let sr = 0, si = 0;
                    for (let j = 0; j < n; j++) if (j !== k) { const xr = z[k][0] - z[j][0], xi = z[k][1] - z[j][1], q = xr * xr + xi * xi || 1e-300; sr += xr / q; si -= xi / q; }
                    const br = 1 - (wr * sr - wi * si), bi = -(wr * si + wi * sr), bb = br * br + bi * bi || 1e-300;   // offset = w/(1 - w S)
                    const or = (wr * br + wi * bi) / bb, oi = (wi * br - wr * bi) / bb;
                    z[k][0] -= or; z[k][1] -= oi;
                    moved = Math.max(moved, Math.hypot(or, oi) / Math.max(1, Math.hypot(z[k][0], z[k][1])));
                }
                if (moved < 1e-15) break;
            }
            for (const w of z) for (let it = 0; it < 3; it++) {   // polish (it does nothing harmful at a multiple root)
                const [pr, pi, dr, di] = ev(w[0], w[1]), dd = dr * dr + di * di;
                if (!(dd > 0)) break;
                const nr = w[0] - (pr * dr + pi * di) / dd, ni = w[1] - (pi * dr - pr * di) / dd;
                const [qr, qi] = ev(nr, ni);
                if (Math.hypot(qr, qi) < Math.hypot(pr, pi)) { w[0] = nr; w[1] = ni; } else break;
            }
        }
        for (let k = 0; k < zeros; k++) z.push([0, 0]);
        // real if the imaginary part is negligible against the root's size (multiple roots come out to about eps^(1/m))
        z.forEach(w => { if (Math.abs(w[1]) <= 1e-7 * Math.max(1, Math.hypot(w[0], w[1]))) w[1] = 0; });
        z.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
        if (all) return out(z.map(([re, im]) => im === 0 ? re : math.complex(re, im)));
        const real = z.filter(w => w[1] === 0).map(w => w[0]);
        if (!real.length) throw new Error("roots(): the polynomial has no real roots; roots(p, 'all') on the console gives the complex ones");
        return out(real);
    };
    const unitval = (x) => x;   // a number given with its unit inside an equation (parser.innerUnits): already in SI
    const factorialln = (x) => {   // ln(x!) = ln Gamma(x + 1), for numbers too large for factorial(): factorialln(1000) = 5912.128...
        x = num(x, 'factorialln(): n');
        if (!(x >= 0)) throw new Error('factorialln(): n must be 0 or more');
        return gln(x + 1);
    };
    // Matlab names for what math.js has under others, or lacks: find, any, all, eye, numel, flip, cumprod, normpdf
    const flat = (v) => (v && typeof v.toArray === 'function' ? v.toArray() : Array.isArray(v) ? v : [v]).flat(Infinity);
    const find = (v) => out(flat(v).map((x, k) => (x ? k + 1 : 0)).filter(k => k > 0));
    const any = (v) => flat(v).some(x => !!x);
    const all = (v) => flat(v).every(x => !!x);
    const eye = (n) => { n = num(n, 'eye(): n'); if (!(Number.isInteger(n) && n >= 1)) throw new Error('eye(): n must be a whole number, 1 or more'); return math.identity(n); };
    const numel = (v) => flat(v).length;
    const length = (v) => { const a = v && typeof v.toArray === 'function' ? v.toArray() : v; return Array.isArray(a) ? Math.max(a.length, Array.isArray(a[0]) ? a[0].length : 0) : 1; };
    const flip = (v) => { const a = v && typeof v.toArray === 'function' ? v.toArray() : v; if (!Array.isArray(a)) throw new Error('flip(): the argument must be an array'); return out(a.slice().reverse()); };   // a vector end to end, a matrix top to bottom
    const cumprod = (v) => { let p = 1; return out(arr(v, 'cumprod(): the argument').map(x => (p *= x))); };
    const normpdf = (x, mu = 0, sigma = 1) => {
        x = num(x, 'normpdf(): x'); mu = num(mu, 'normpdf(): mu'); sigma = num(sigma, 'normpdf(): sigma');
        if (!(sigma > 0)) throw new Error('normpdf(): sigma must be positive');
        return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
    };
    const fns = { find, any, all, eye, numel, length, flip, cumprod, normpdf, linspace, logspace, trapz, cumtrapz, polyfit, polyval, lsqfit, gammainc, betainc, expint, erfinv, normcdf, norminv, tcdf, tinv, roots, factorialln, regress, unitval };
    return { fns, names: Object.keys(fns) };
})();
if (typeof math !== 'undefined') math.import(MathX.fns, { override: true });

class ParametricController {
    constructor(parser, solverClass) {
        this.parser = parser;
        this.solverClass = solverClass;
    }

    // update: each row starts from the solution of the row before (the Update guesses box)
    runTable(paramVar, startVal, endVal, steps, update = false) {
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
            if (update) BoundedSolver.adoptGuesses(this.parser.variables);
            results.push({ [paramVar]: val, ...solution });
        }
        return results;
    }
}

// Propagation of uncertainty to first order, for independent inputs (GUM, JCGM 100:2008, Eq. 10):
//     u(y)^2 = sum over the inputs x_i of (dy/dx_i * u(x_i))^2
// Each dy/dx_i is a central difference: the equations are solved again with x_i + h and with x_i - h, starting from the
// solution, where h = u_i, or 1e-4 |x_i| if u_i is smaller (a smaller change could stay within the solver's tolerance, and over
// it y is linear anyway). These solves, and one more at the given values, use a tolerance 1000 times tighter than Solve's, so
// that the differences are not lost in the solver's own error (if one fails at that tolerance it is repeated at Solve's). With
// h = u_i, the second difference y(+) + y(-) - 2 y measures how far y is from linear over +-u_i; where it exceeds 10 % of the
// first, a warning says the first-order estimate is rough. Their messages are not shown; ode block tables stay those of Solve.
class Uncertainty {
    static TOL = 1e-10;
    // parser: just parsed and solved; base: the solution (name -> SI value). -> { u: Map name -> u(y), parts: Map name ->
    // [{ input, s: dy/dx, c: (s u)^2 }], inputs: [{ name, x, u, given, line }], warnings: [text], base }
    static run(parser, base, solverClass = BoundedSolver) {
        const inputs = [...parser.uncertain.entries()].filter(([, g]) => g.u > 0);
        const keepTables = OdeBlocks.tables, keep = { log: console.log, warn: console.warn };
        const solveWith = (k, x, tight) => {
            const asts = parser.parsedASTs.slice();
            if (k >= 0) asts[k] = { ...asts[k], rightAST: new math.ConstantNode(x) };
            const vars = new Map([...parser.variables].map(([n, m]) => [n, { ...m, guess: (typeof base[n] === 'number' && Number.isFinite(base[n])) ? base[n] : m.guess }]));
            const s = new solverClass(asts, vars, parser.odeCalls);
            if (tight) s.tolerance = Uncertainty.TOL;
            return s.solve();
        };
        const solveAt = (k, x, what) => {
            try { return solveWith(k, x, true); } catch (e) { }
            try { return solveWith(k, x, false); } catch (e) { throw new Error(`Uncertainty: the equations could not be solved ${what}: ${e.message}`); }
        };
        console.log = console.warn = () => { };
        try {
            const y0 = solveAt(-1, 0, 'at the given values');
            const names = Object.keys(y0).filter(n => typeof y0[n] === 'number' && Number.isFinite(y0[n]));
            const sq = new Map(names.map(n => [n, 0])), parts = new Map(names.map(n => [n, []])), warnings = [], done = [];
            for (const [name, g] of inputs) {
                const x0 = y0[name], h = Math.max(g.u, 1e-4 * Math.abs(x0)), si = (v) => `${+v.toPrecision(6)}`;
                const yp = solveAt(g.eq, x0 + h, `with ${name} = ${si(x0)} + ${si(h)} (SI)`);
                const ym = solveAt(g.eq, x0 - h, `with ${name} = ${si(x0)} - ${si(h)} (SI)`);
                const bent = [];
                for (const n of names) {
                    const a = yp[n], b = ym[n];
                    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
                    const s = (a - b) / (2 * h), c = (s * g.u) ** 2;
                    sq.set(n, sq.get(n) + c);
                    if (c > 0) parts.get(n).push({ input: name, s, c });
                    const lin = Math.abs(a - b) / 2, curv = Math.abs(a + b - 2 * y0[n]) / 2, scale = Math.max(Math.abs(y0[n]), Math.abs(a), Math.abs(b));
                    if (h === g.u && n !== name && curv > 0.1 * lin && curv > 1e-7 * scale) bent.push(n);
                }
                if (bent.length) warnings.push(`Uncertainty: over ${name} ± ${g.given}, ${bent.slice(0, 3).join(', ')}${bent.length > 3 ? ` and ${bent.length - 3} more` : ''} ` +
                    `${bent.length > 1 ? 'are' : 'is'} far from linear in ${name}; ${bent.length > 1 ? 'their' : 'its'} first-order uncertainty is a rough estimate.`);
                done.push({ name, x: x0, u: g.u, given: g.given, line: g.line });
            }
            return { u: new Map([...sq].map(([n, v]) => [n, Math.sqrt(v)])), parts, inputs: done, warnings, base: y0 };
        } finally { console.log = keep.log; console.warn = keep.warn; OdeBlocks.tables = keepTables; }
    }
}

// Spec lines: W = atleast(W_spec, p) makes the W of the equations W_spec + margin, the margin chosen so that the real W,
// spread by the uncertainties of the inputs given with ±, meets W_spec with probability p (atmost: stays below it). The spread
// is that of the built design: the design variable (named in the line, or found as the only candidate) held at its value.
// With the first-order (normal) uncertainty u_W of Uncertainty.run, P(W >= W_spec) = normcdf(margin/u_W), so margin =
// norminv(p) u_W. u_W depends on the design point, so the equations are solved again until the margin settles.
class DesignSpec {
    // the variables that could be the design variable of a spec: they share an equation with W, and fixing one of them in
    // place of the spec equation leaves a square system that can be matched (each equation to its own unknown)
    static candidates(parser, sp) {
        const eqs = parser.parsedASTs.filter((e, k) => k !== sp.eq).map(e => e.vars);
        const near = new Set(); eqs.forEach(vs => { if (vs.includes(sp.name)) vs.forEach(v => near.add(v)); });
        const inSpec = new Set(parser.parsedASTs[sp.eq].vars);
        const square = (list) => {
            const vars = [...new Set(list.flat())];
            if (vars.length !== list.length) return false;
            const owner = new Map();
            const aug = (i, seen) => { for (const v of list[i]) { if (seen.has(v)) continue; seen.add(v); const j = owner.get(v); if (j === undefined || aug(j, seen)) { owner.set(v, i); return true; } } return false; };
            return list.every((_, i) => aug(i, new Set()));
        };
        return [...near].filter(v => !inSpec.has(v) && square([...eqs, [v]]));
    }
    static solve(parser, solverClass = BoundedSolver, maxIt = 20) {
        if (!parser.uncertain.size) throw new Error(`Line ${parser.specs[0].lineNo}: a spec line needs inputs with an uncertainty (given with ±), so that the spread of ${parser.specs[0].name} is known.`);
        for (const sp of parser.specs) {
            if (sp.by) continue;
            const c = DesignSpec.candidates(parser, sp);
            if (c.length !== 1) throw new Error(`Line ${sp.lineNo}: name the variable held fixed in the built design as the third argument${c.length ? `, one of ${c.join(', ')}` : ''}: ${sp.name} = ${sp.op === '>=' ? 'atleast' : 'atmost'}(..., ..., ${c[0] || 'm_dot'}).`);
            sp.by = c[0];
        }
        const z = (p) => MathX.fns.norminv(p);
        let guesses = null, sol, unc, last = parser.specs.map(() => 0), values;
        for (let it = 0; it < maxIt; it++) {
            const vars = new Map([...parser.variables].map(([n, m]) => [n, { ...m, guess: guesses && typeof guesses[n] === 'number' && Number.isFinite(guesses[n]) ? guesses[n] : m.guess }]));
            const solver = new solverClass(parser.parsedASTs, vars, parser.odeCalls);
            solver.tolerance = Uncertainty.TOL;   // tight, so the design value does not depend on the path the solver took
            try { sol = solver.solve(); } catch (e) { sol = new solverClass(parser.parsedASTs, vars, parser.odeCalls).solve(); }
            const scope = BoundedSolver.prototype.createScopeWithCoolProp(sol);
            values = parser.specs.map(sp => sp.valueAST.evaluate(scope));
            // the spread of the result once built: the design variable fixed at its value, the spec equation left out
            const asts = parser.parsedASTs.slice();
            parser.specs.forEach(sp => { const e = asts[sp.eq]; asts[sp.eq] = { ...e, leftAST: new math.SymbolNode(sp.by), rightAST: new math.ConstantNode(sol[sp.by]), vars: [sp.by], code: undefined }; });
            unc = Uncertainty.run({ parsedASTs: asts, variables: parser.variables, uncertain: parser.uncertain, odeCalls: parser.odeCalls }, sol, solverClass);
            guesses = sol;
            const next = parser.specs.map(sp => (sp.op === '>=' ? 1 : -1) * z(sp.p) * (unc.u.get(sp.name) || 0));
            const settled = next.every((t, k) => Math.abs(t - last[k]) <= 1e-9 * Math.max(Math.abs(values[k]), 1e-300) + 1e-7 * (unc.u.get(parser.specs[k].name) || 0));
            if (settled) {
                parser.variables.forEach((m, n) => { if (sol[n] !== undefined) m.value = sol[n]; });
                return {
                    solution: sol, unc, passes: it + 1,
                    specs: parser.specs.map((sp, k) => ({ ...sp, value: values[k], design: sol[sp.name], margin: last[k], u: unc.u.get(sp.name) || 0, z: z(sp.p) })),
                };
            }
            next.forEach((t, k) => { const e = parser.parsedASTs[parser.specs[k].eq]; parser.parsedASTs[parser.specs[k].eq] = { ...e, rightAST: new math.OperatorNode('+', 'add', [e.rightAST.args[0], new math.ConstantNode(t)]), code: undefined }; });
            last = next;
        }
        throw new Error(`Line ${parser.specs[0].lineNo}: the margin of the spec did not settle in ${maxIt} passes (the uncertainty changes too much with the design point).`);
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
