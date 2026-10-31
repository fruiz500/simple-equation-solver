// Solvers: partitioning, damped Newton / Levenberg-Marquardt, ode45, parametric sweeps, 1-D optimization.
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
        Object.assign(scope, UserFunctions.entries, OdeBlocks.entries);

        return scope;
    }

    solve() {
        const state = {};
        this.variablesMap.forEach((meta, name) => state[name] = meta.guess);

        // Partition system into sequentially solvable single blocks and coupled simultaneous blocks
        const blocks = this.partitionEquations();

        for (const block of blocks) {
            if (block.type === 'single') this.solveSingleEquation(block.eqIndex, state, block.targetVar);
            else if (block.type === 'simultaneous') this.solveSimultaneousBlock(block.eqIndices, block.vars, state);
            else if (block.type === 'check') this.checkEquation(block.eqIndex, state);
        }
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

