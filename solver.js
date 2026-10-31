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
        Object.assign(scope, UserFunctions.entries);

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

        // Solve Ordinary Differential Equations (ODEs) if defined
        for (const odeCall of this.odeCalls) {
            this.solveODE45(odeCall, state);
        }

        this.variablesMap.forEach((meta, name) => {
            if (state[name] !== undefined) meta.value = state[name];
        });

        return state;
    }

    /**
     * Topological Dependency Partitioning Algorithm
     */
    partitionEquations() {
        const blocks = [];
        const handledEqs = new Set();
        const knownVars = new Set();

        // Step 1: Topological Sort - Find explicit direct substitution equations
        let progress = true;
        while (progress) {
            progress = false;
            for (let i = 0; i < this.parsedASTs.length; i++) {
                if (handledEqs.has(i)) continue;
                const eq = this.parsedASTs[i];
                const unknowns = eq.vars.filter(v => !knownVars.has(v));

                if (unknowns.length === 1) {
                    blocks.push({ type: 'single', eqIndex: i, targetVar: unknowns[0] });
                    handledEqs.add(i); knownVars.add(unknowns[0]); progress = true;
                } else if (unknowns.length === 0) {
                    blocks.push({ type: 'check', eqIndex: i });
                    handledEqs.add(i); progress = true;
                }
            }
        }

        // Step 2: Group remaining coupled cyclic equations into simultaneous solver blocks
        const remainingEqs = [];
        const blockVars = new Set();
        for (let i = 0; i < this.parsedASTs.length; i++) {
            if (!handledEqs.has(i)) {
                remainingEqs.push(i);
                this.parsedASTs[i].vars.forEach(v => {
                    if (!knownVars.has(v)) blockVars.add(v);
                });
            }
        }

        if (remainingEqs.length > 0) {
            blocks.push({ type: 'simultaneous', eqIndices: remainingEqs, vars: Array.from(blockVars) });
        }

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

    /**
     * Multivariate Newton-Raphson Solver with Numerical Jacobian for coupled equations
     */
    solveSimultaneousBlock(eqIndices, vars, state) {
        const n = vars.length;
        if (eqIndices.length !== n) {
            throw new Error(`Coupled block is not square: ${eqIndices.length} equation(s), ${n} unknown(s) [${vars.join(', ')}]. Check for a missing or redundant equation.`);
        }
        const eqs = eqIndices.map(i => this.parsedASTs[i]);
        const metas = vars.map(v => this.variablesMap.get(v) || { lower: -Infinity, upper: Infinity });

        // Residual f = left - right for every equation at trial point X
        const residuals = (X) => {
            const local = { ...state };
            vars.forEach((v, k) => local[v] = X[k]);
            const scope = this.createScopeWithCoolProp(local);
            return eqs.map(({ leftAST, rightAST }) => {
                const L = leftAST.evaluate(scope), R = rightAST.evaluate(scope);
                return { f: L - R, mag: Math.max(Math.abs(L), Math.abs(R)) };
            });
        };
        const clamp = (X) => X.map((x, k) => Math.min(Math.max(x, metas[k].lower), metas[k].upper));
        // Merit: relative for large quantities, absolute for quantities below 1
        const merit = (r) => Math.max(...r.map(e => Math.abs(e.f) / Math.max(e.mag, 1)));
        const isConverged = (r) => r.every(e => Number.isFinite(e.f) && Math.abs(e.f) <= this.tolerance * e.mag + 1e-14);
        const jacobian = (X) => {
            const J = eqs.map(() => new Array(n).fill(0));
            for (let j = 0; j < n; j++) {
                const h = Math.max(Math.abs(X[j]), 1e-3) * 1e-6;
                const Xp = X.slice(), Xm = X.slice(); Xp[j] += h; Xm[j] -= h;
                const rp = residuals(Xp), rm = residuals(Xm);
                for (let i = 0; i < n; i++) {
                    if (eqs[i].vars.includes(vars[j])) J[i][j] = (rp[i].f - rm[i].f) / (2 * h);
                }
            }
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
        let r = residuals(X), err = merit(r);

        for (let iter = 0; iter < this.maxIterations && !isConverged(r); iter++) {
            const J = jacobian(X), negF = r.map(e => -e.f);
            let ok = false;
            try { ok = tryStep(math.lusolve(J, negF).flat()); } catch (e) { ok = false; }
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
        if (!isConverged(r)) {
            throw new Error(`Newton iteration did not converge for [${vars.join(', ')}] (worst scaled residual ${err.toExponential(2)}). Try better guesses or tighter bounds.`);
        }
        // Warn when the solution is not unique (singular Jacobian)
        try {
            const J = jacobian(X);
            const rowNorms = J.map(row => Math.sqrt(row.reduce((s, a) => s + a * a, 0)) || 1);
            const detRel = Math.abs(math.det(J)) / rowNorms.reduce((a, b) => a * b, 1);
            if (!(detRel > 1e-10)) console.log(`WARNING: Jacobian of block [${vars.join(', ')}] is (nearly) singular; the solution may not be unique.`);
        } catch (e) { }
    }

    /**
     * Classical 4th Order Runge-Kutta (RK4) Numerical ODE Integrator
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

            const steps = 100;
            const h = (tf - t0) / steps;

            let tArr = [t0], yArr = [y0];
            let currT = t0, currY = y0;

            // RK4 Numerical Integration Steps
            for (let i = 0; i < steps; i++) {
                let k1 = h * derivFunc(currT, currY);
                let k2 = h * derivFunc(currT + h / 2, currY + k1 / 2);
                let k3 = h * derivFunc(currT + h / 2, currY + k2 / 2);
                let k4 = h * derivFunc(currT + h, currY + k3);

                currY = currY + (k1 + 2 * k2 + 2 * k3 + k4) / 6;
                currT = currT + h;

                tArr.push(currT);
                yArr.push(currY);
            }

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

