// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Ordinary differential equations: adaptive integrators and 'ode ... end' blocks.
//
//   ode t = 0 : t_end : 10          independent variable = start : end : output interval   [, stiff] [, rtol = 1e-9] [, atol = 1e-12]
//                                   (defaults: rtol 1e-9, atol 1e-12; with stiff: rtol 1e-8, atol 1e-10)
//     q = h*A*(T - T_inf)           helper lines, evaluated in order at every step
//     T' = -q/(m*c)                 one derivative line per state (names, or array elements such as T[2])
//     T(0) = 350                    one initial value per state, at the start
//   end
//
// After the block, each state name is a variable of the equations holding its value at the end. The block reads
// the other variables it mentions, so the solver treats it like a function of them: the equations can solve
// through it (for example find t_end so that T = 320). The values at every output time form a table.

class OdeIntegrator {
    // Weighted RMS norm of an error vector (scaled by atol + rtol*|y|)
    static errNorm(e, y0, y1, rtol, atol) {
        let s = 0;
        for (let i = 0; i < e.length; i++) {
            const sc = atol + rtol * Math.max(Math.abs(y0[i]), Math.abs(y1[i]));
            s += (e[i] / sc) ** 2;
        }
        return Math.sqrt(s / Math.max(e.length, 1));
    }

    static finite(v) { return v.every(Number.isFinite); }

    // Common driver: adaptive steps that land exactly on every output time. step(t, y, h) returns { y, err } or null.
    static drive(t0, y0, outs, opt, step, order, hint) {
        const dir = Math.sign(outs[outs.length - 1] - t0) || 1;
        const span = Math.abs(outs[outs.length - 1] - t0) || 1;
        let t = t0, y = y0.slice(), h = dir * Math.min(Math.abs(outs[0] - t0) || span, span) * 0.1;
        let steps = 0;
        const res = [];
        for (const tOut of outs) {
            while (dir * (tOut - t) > 1e-14 * Math.max(Math.abs(t), span)) {
                const land = dir * (t + h - tOut) >= 0;                      // this step reaches the output time: clip it
                const hs = land ? tOut - t : h;
                if (Math.abs(hs) < 1e-12 * Math.max(Math.abs(t), span)) {
                    throw new Error(`the step size became too small at ${OdeIntegrator.tTxt(t)}` +
                        (step.lastError ? ` (${step.lastError})` : ' (a singularity, or a derivative that changes abruptly there?)'));
                }
                if (++steps > opt.maxSteps) throw new Error(`more than ${opt.maxSteps} steps were needed before ${OdeIntegrator.tTxt(t)}${hint}`);
                step.lastError = null;
                const r = step(t, y, hs);
                const err = (r && OdeIntegrator.finite(r.y)) ? OdeIntegrator.errNorm(r.err, y, r.y, opt.rtol, opt.atol) : Infinity;
                const fac = err === 0 ? 5 : Number.isFinite(err) ? Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -1 / order))) : 0.2;
                if (err <= 1) {
                    t = land ? tOut : t + hs;
                    y = r.y;
                    if (!land || Math.abs(hs * fac) > Math.abs(h)) h = hs * fac;     // a clipped step does not shrink h
                } else h = hs * fac;
            }
            res.push(y.slice());
        }
        return { ys: res, steps };
    }

    static tTxt(t) { return `t = ${+t.toPrecision(6)}`; }

    // Dormand-Prince 5(4), the method of Matlab's ode45 (error estimate from the embedded 4th-order solution)
    static dopri(f, t0, y0, outs, opt) {
        const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
        const a = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9],
            [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
            [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
            [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
        const e = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
        const n = y0.length;
        const step = (t, y, h) => {
            const k = [];
            try {
                for (let s = 0; s < 7; s++) {
                    const ys = y.slice();
                    for (let j = 0; j < s; j++) if (a[s][j]) for (let i = 0; i < n; i++) ys[i] += h * a[s][j] * k[j][i];
                    k.push(f(t + c[s] * h, ys));
                    if (!OdeIntegrator.finite(k[s])) return null;
                }
            } catch (err) { if (err.odeFatal) throw err; step.lastError = err.message; return null; }   // e.g. a property call out of range: smaller step
            const yn = y.map((v, i) => v + h * a[6].reduce((s, aj, j) => s + aj * k[j][i], 0));
            const er = y.map((v, i) => h * e.reduce((s, ej, j) => s + ej * k[j][i], 0));
            return { y: yn, err: er };
        };
        return OdeIntegrator.drive(t0, y0, outs, opt, step, 5, ": the equations may be stiff; add ', stiff' to the ode line");
    }

    // Dense LU factorization with partial pivoting (plain arrays; much faster than math.js for this use)
    static lu(A) {
        const n = A.length, a = A.map(r => Float64Array.from(r)), piv = new Int32Array(n);
        for (let k = 0; k < n; k++) {
            let p = k, mx = Math.abs(a[k][k]);
            for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > mx) { mx = Math.abs(a[i][k]); p = i; }
            if (mx === 0) throw new Error('singular iteration matrix');
            piv[k] = p;
            if (p !== k) { const t = a[p]; a[p] = a[k]; a[k] = t; }
            const rk = a[k], d = rk[k];
            for (let i = k + 1; i < n; i++) {
                const ri = a[i], f = ri[k] / d;
                if (f === 0) continue;
                ri[k] = f;
                for (let j = k + 1; j < n; j++) ri[j] -= f * rk[j];
            }
        }
        return { a, piv };
    }
    static luSolve({ a, piv }, b) {
        const n = a.length, x = Float64Array.from(b);
        for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = x[p]; x[p] = x[k]; x[k] = t; } }
        for (let i = 0; i < n; i++) { const r = a[i]; let s = x[i]; for (let j = 0; j < i; j++) s -= r[j] * x[j]; x[i] = s; }
        for (let i = n - 1; i >= 0; i--) { const r = a[i]; let s = x[i]; for (let j = i + 1; j < n; j++) s -= r[j] * x[j]; x[i] = s / r[i]; }
        return Array.from(x);
    }

    // Stiff systems: linearly implicit Euler with extrapolation (the method of SEULEX and LIMEX), order 4 from the
    // step-number sequence 1, 2, 3, 4. One Jacobian per step; stable in a wide wedge around the negative real axis
    // and strongly damping very stiff modes, as in conduction and chemical kinetics. The difference between the
    // last two extrapolations estimates the error. Time is appended as a state with derivative 1, so explicit time
    // dependence is in the Jacobian too.
    // opt.pattern[j] (optional) lists the derivatives that depend on state j: columns that touch different
    // derivatives are perturbed together, so a chain of nodes needs about 4 evaluations per Jacobian.
    static stiff(f, t0, y0, outs, opt) {
        const n = y0.length, m = n + 1, seq = [1, 2, 3, 4];
        const F = (z) => [...f(z[n], z.slice(0, n)), 1];
        const rows = opt.pattern ? opt.pattern.map(r => r.slice()) : Array.from({ length: n }, () => [...Array(n).keys()]);
        rows.push([...Array(n).keys()]);                                     // time may affect every derivative
        const groups = [];                                                   // column groups with disjoint rows
        rows.forEach((r, j) => {
            const grp = j < n ? groups.find(G => G.cols[0] < n && !r.some(i => G.rows.has(i))) : null;
            if (grp) { grp.cols.push(j); r.forEach(i => grp.rows.add(i)); }
            else groups.push({ cols: [j], rows: new Set(r) });
        });
        const sc = [...y0.map(v => Math.max(Math.abs(v), 1e-3)), Math.max(Math.abs(outs[outs.length - 1] - t0), Math.abs(t0))];
        const jac = (z, F0) => {
            const J = Array.from({ length: m }, () => new Array(m).fill(0));
            for (const G of groups) {
                const zp = z.slice(), d = {};
                for (const j of G.cols) { sc[j] = Math.max(sc[j], Math.abs(z[j])); d[j] = 1e-7 * sc[j]; zp[j] += d[j]; }
                const Fp = F(zp);
                for (const j of G.cols) for (const i of rows[j]) J[i][j] = (Fp[i] - F0[i]) / d[j];
            }
            return J;
        };
        let Jz = null, F0z = null, Jat = null;
        const step = (t, y, H) => {
            try {
                const z = [...y, t], key = z.join();
                if (Jat !== key) { F0z = F(z); if (!OdeIntegrator.finite(F0z)) return null; Jz = jac(z, F0z); Jat = key; }
                const T = [];
                for (let j = 0; j < seq.length; j++) {
                    const nj = seq[j], h = H / nj;
                    const LU = OdeIntegrator.lu(Jz.map((row, i) => row.map((v, c) => (i === c ? 1 : 0) - h * v)));
                    let zz = z;
                    for (let i = 0; i < nj; i++) {
                        const Fi = i === 0 ? F0z : F(zz);
                        if (!OdeIntegrator.finite(Fi)) return null;
                        const d = OdeIntegrator.luSolve(LU, Fi.map(v => h * v));
                        zz = zz.map((v, q) => v + d[q]);
                    }
                    T.push([zz]);
                    for (let l = 1; l <= j; l++) T[j].push(T[j][l - 1].map((v, q) => v + (v - T[j - 1][l - 1][q]) / (nj / seq[j - l] - 1)));
                }
                const k = seq.length - 1, best = T[k][k], prev = T[k][k - 1];
                return { y: best.slice(0, n), err: best.slice(0, n).map((v, i) => v - prev[i]) };
            } catch (err) { if (err.odeFatal) throw err; step.lastError = err.message; return null; }
        };
        return OdeIntegrator.drive(t0, y0, outs, opt, step, 4, ': loosen rtol, or shorten the time span');
    }
}

class OdeBlocks {
    static active = [];      // compiled blocks of the last parse
    static entries = {};     // scope callables 'ode#k:state'(...inputs) -> final value of that state
    static tables = [];      // output tables of the last Solve
    static RESERVED = new Set(['pi', 'e', 'i', 'Infinity', 'NaN', 'true', 'false', 'null']);   // as in the equation parser

    // Lifts every 'ode ... end' block out of the comment-free lines (blanking them, so line numbers stay put)
    static extract(lines) {
        const blocks = [];
        for (let i = 0; i < lines.length; i++) {
            const head = lines[i].trim();
            if (!/^ode\s+[A-Za-z_]\w*\s*=/.test(head)) continue;
            const start = i, body = [];
            lines[i] = '';
            let closed = false;
            for (i++; i < lines.length; i++) {
                const t = lines[i].trim();
                lines[i] = '';
                if (/^end\s*;?$/.test(t)) { closed = true; break; }
                if (/^(ode|function)\b/.test(t)) throw new Error(`Line ${i + 1}: a block cannot start inside an ode block (is an 'end' missing above?).`);
                for (const p of t.split('\u0001')) if (p.trim()) body.push({ text: p.replace(/;\s*$/, '').trim(), no: i + 1 });
            }
            if (!closed) throw new Error(`Line ${start + 1}: this ode block has no matching 'end'.`);
            blocks.push({ header: head, no: start + 1, body });
        }
        return blocks;
    }

    static splitTop(s, sep) {   // split at sep outside (), [] and quotes
        const out = [];
        let d = 0, q = null, cur = '';
        for (const ch of s) {
            if (q) { if (ch === q) q = null; }
            else if (ch === "'" || ch === '"') q = ch;
            else if (ch === '(' || ch === '[') d++;
            else if (ch === ')' || ch === ']') d--;
            if (ch === sep && d === 0 && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
        }
        out.push(cur.trim());
        return out;
    }

    // Compiles the blocks of this parse (string variables substituted) and builds their callables
    static activate(blocks, strVars, flat = (n) => n) {
        const O = OdeBlocks;
        O.active = blocks.map((b, k) => O.compile(b, k + 1, strVars, flat));
        O.entries = {};
        O.active.forEach(blk => {
            let lastArgs = null, last = null;
            blk.call = (args) => {
                if (!(lastArgs && args.length === lastArgs.length && args.every((a, i) => a === lastArgs[i]))) {
                    last = O.run(blk, args);
                    lastArgs = args;
                }
                return last;
            };
            blk.states.forEach((s, j) => { O.entries[blk.fname(s)] = (...args) => blk.call(args).final[j]; });
        });
    }

    static compile(b, k, strVars, flat) {
        const where = `Line ${b.no}`;
        const sub = (txt, ln) => txt.replace(/([A-Za-z_]\w*)\$/g, (all, nm) => {
            if (!(nm in strVars)) throw new Error(`Line ${ln}: string variable '${nm}$' is not defined.`);
            return "'" + strVars[nm] + "'";
        });
        // A trailing [unit] after a constant converts it to SI, as in the equations (T(0) = 25 [degC]); after an
        // expression it has no effect on the calculation
        const parse = (src, ln) => {
            let node, unit = null;
            parse.lastUnit = '';
            const um = src.match(/[^\s=+\-*\/^(,;]\s+\[((?:[a-zA-Z$€£¥]|1\/)[a-zA-Z0-9_$€£¥\/\^\*\s\.\-\(\)]*|-)\]\s*$/);
            if (um) { unit = um[1].trim(); src = src.slice(0, um.index + 1).trim(); }
            try { node = flat(UserFunctions.lowerIf(math.parse(sub(src, ln)))); } catch (e) { throw new Error(`Line ${ln}: ${e.message}`); }
            if (unit) {
                if (!UnitConv.isValid(unit)) throw new Error(`Line ${ln}: unit '${unit}' is not recognized by math.js.`);
                let v = NaN;
                try { if (node.filter(c => c.isSymbolNode).length === 0) v = node.evaluate({}); } catch (e) { }
                if (typeof v === 'number' && Number.isFinite(v)) node = new math.ConstantNode(UnitConv.toSI(v, unit));
                parse.lastUnit = unit;
            }
            node.traverse((c) => {
                if (c.isAssignmentNode || c.isFunctionAssignmentNode || c.isBlockNode) throw new Error(`Line ${ln}: one item per line`);
                if (c.isFunctionNode && c.fn.isSymbolNode && UserFunctions.BLOCKED.has(c.fn.name)) throw new Error(`Line ${ln}: '${c.fn.name}()' is not available.`);
            });
            return node;
        };
        const hm = b.header.match(/^ode\s+([A-Za-z_]\w*)\s*=\s*(.+)$/);
        const indep = hm[1];
        const parts = OdeBlocks.splitTop(hm[2], ',');
        const range = OdeBlocks.splitTop(parts[0], ':');
        if (range.length < 2 || range.length > 3 || range.some(r => !r)) throw new Error(`${where}: write  ode ${indep} = start : end : output interval  (the interval is optional)`);
        const opt = { stiff: false, rtol: 1e-9, atol: 1e-12, maxSteps: 200000 };
        for (const p of parts.slice(1)) {
            const om = p.match(/^(rtol|atol)\s*=\s*([0-9.eE+-]+)$/);
            if (p === 'stiff') { opt.stiff = true; opt.rtol = 1e-8; opt.atol = 1e-10; }
            else if (om && Number(om[2]) > 0) opt[om[1]] = Number(om[2]);
            else throw new Error(`${where}: unknown option '${p}' (use stiff, rtol = 1e-8, atol = 1e-10)`);
        }
        if (parts.slice(1).some(p => p === 'stiff')) {                         // explicit tolerances win over the stiff defaults
            parts.slice(1).forEach(p => { const om = p.match(/^(rtol|atol)\s*=\s*([0-9.eE+-]+)$/); if (om) opt[om[1]] = Number(om[2]); });
        }
        const rangeNodes = range.map(r => parse(r, b.no));

        const NAME = '([A-Za-z_]\\w*(?:\\[[^\\]]*\\])?)';
        const named = (nm, ln) => {                              // T[2+1] -> T[3]; the index must be known before solving
            if (!nm.includes('[')) return nm;
            let nd;
            try { nd = flat(math.parse(nm)); } catch (e) { throw new Error(`Line ${ln}: ${e.message}`); }
            if (!nd.isSymbolNode) throw new Error(`Line ${ln}: the index in ${nm} must be known before solving.`);
            return nd.name;
        };
        const deriv = new Map(), init = new Map(), aux = [];
        for (const { text: t, no: ln } of b.body) {
            let m;
            if ((m = t.match(new RegExp(`^${NAME}\\s*'\\s*=\\s*(.+)$`)))) {
                const s = named(m[1], ln);
                if (deriv.has(s)) throw new Error(`Line ${ln}: ${s}' is defined twice.`);
                deriv.set(s, { node: parse(m[2], ln), ln });
            } else if ((m = t.match(new RegExp(`^${NAME}\\s*\\((.+)\\)\\s*=\\s*(.+)$`)))) {
                const s = named(m[1], ln);
                if (init.has(s)) throw new Error(`Line ${ln}: the initial value of ${s} is given twice.`);
                if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:\s*\[[^\]]*\])?\s*(?:\+-|±)/.test(m[3].trim()))   // T(0) = 400 [K] +- 3: not here
                    throw new Error(`Line ${ln}: an initial value in an ode block cannot carry an uncertainty; give it a name before the block, as  ${s.replace(/\[.*$/, '')}_0 = value +- u,  and write  ${s}(${m[2]}) = ${s.replace(/\[.*$/, '')}_0.`);
                init.set(s, { at: parse(m[2], ln), node: parse(m[3], ln), unit: parse.lastUnit, ln });
            } else if ((m = t.match(new RegExp(`^${NAME}\\s*=\\s*(.+)$`))) && !/^=/.test(m[2])) {
                const a = named(m[1], ln);
                if (aux.some(x => x.name === a)) throw new Error(`Line ${ln}: '${a}' is defined twice in this block.`);
                aux.push({ name: a, node: parse(m[2], ln), ln });
            } else {
                throw new Error(`Line ${ln}: in an ode block write  y' = derivative,  y(start) = initial value,  or  name = helper expression;  got '${t}'.`);
            }
        }
        const states = [...deriv.keys()];
        if (states.length === 0) throw new Error(`${where}: this ode block has no derivative lines (y' = ...).`);
        for (const s of states) if (!init.has(s)) throw new Error(`${where}: give the initial value of ${s}, as  ${s}(start) = value.`);
        for (const s of init.keys()) if (!deriv.has(s)) throw new Error(`Line ${init.get(s).ln}: ${s} has an initial value but no derivative line ${s}' = ...`);
        const names = new Set([indep, ...states, ...aux.map(a => a.name)]);
        for (const a of aux) {
            if (states.includes(a.name) || a.name === indep) throw new Error(`Line ${a.ln}: '${a.name}' is a state or the independent variable; pick another name for this helper.`);
        }
        const bases = new Set(states.map(s => s.replace(/\[.*$/, '')));

        // Inputs: the variables of the equations that the block reads
        const inputs = [];
        const collect = (node) => {
            const accBases = new Set();
            node.traverse((c) => {
                if (c.isAccessorNode && c.object && c.object.isSymbolNode && c.index) {
                    accBases.add(c.object.name);
                    const nm = c.toString();
                    if (!names.has(nm) && !inputs.includes(nm)) inputs.push(nm);
                }
            });
            node.traverse((c, path) => {
                if (!c.isSymbolNode || path === 'fn') return;
                if (accBases.has(c.name) || bases.has(c.name) || names.has(c.name) || OdeBlocks.RESERVED.has(c.name) || /^__iv\d+$/.test(c.name)) return;
                if (ThermoEngine.FUNCS[c.name.toLowerCase()] || UserFunctions.active.has(c.name)) throw new Error(`${where}: '${c.name}' is a function name; call it with parentheses.`);
                if (!inputs.includes(c.name)) inputs.push(c.name);
            });
        };
        rangeNodes.forEach(collect);
        aux.forEach(a => collect(a.node));
        deriv.forEach(d => collect(d.node));
        init.forEach(d => { collect(d.at); collect(d.node); });

        // Which states each derivative reads (directly or through helpers), for the stiff solver's sparse Jacobian
        const refs = (node) => {
            const out = new Set();
            node.traverse((c, path) => {
                if (c.isAccessorNode && c.object && c.object.isSymbolNode && c.index) out.add(c.toString());
                else if (c.isSymbolNode && path !== 'fn') out.add(c.name);
            });
            return out;
        };
        const auxDeps = new Map();
        const depsOf = (node) => {
            const d = new Set();
            for (const nm of refs(node)) {
                const si = states.indexOf(nm);
                if (si >= 0) d.add(si);
                else if (auxDeps.has(nm)) auxDeps.get(nm).forEach(x => d.add(x));
                else if (bases.has(nm)) states.forEach((s, x) => { if (s.startsWith(nm + '[')) d.add(x); });   // whole array used
            }
            return d;
        };
        aux.forEach(a => auxDeps.set(a.name, depsOf(a.node)));
        const derivDeps = states.map(s => depsOf(deriv.get(s).node));
        const pattern = states.map((s, j) => states.map((x, i) => i).filter(i => derivDeps[i].has(j)));

        const cmp = (n) => n.compile();
        return {
            pattern,
            stateUnits: states.map(s => init.get(s).unit || ''),
            k, no: b.no, header: b.header, indep, states, inputs, opt,
            range: rangeNodes.map(cmp),
            aux: aux.map(a => ({ name: a.name, code: cmp(a.node) })),
            deriv: states.map(s => cmp(deriv.get(s).node)),
            init: states.map(s => ({ at: cmp(init.get(s).at), code: cmp(init.get(s).node) })),
            fname: (s) => `ode#${k}:${s}`
        };
    }

    // Integrates one block for the given input values. Returns { final, table: { cols, rows }, steps }.
    static run(blk, args) {
        const set = BoundedSolver.setVar;
        const base = {};
        blk.inputs.forEach((nm, i) => { base[nm] = args[i]; });
        [blk.indep, ...blk.states, ...blk.aux.map(a => a.name)].forEach(nm => { base[nm] = 0; });
        const scope = BoundedSolver.prototype.createScopeWithCoolProp(base);
        const num = (v, what) => {
            if (typeof v === 'boolean') v = v ? 1 : 0;
            if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} is not a finite number (${typeof v === 'number' ? v : typeof v})`);
            return v;
        };
        const fail = (e) => { const x = new Error(`ode block at line ${blk.no}: ${e.message}`); x.odeFatal = true; return x; };
        try {
            const [t0, t1, dtRaw] = blk.range.map((c, i) => num(c.evaluate(scope), ['the start', 'the end', 'the output interval'][i]));
            if (t1 === t0) throw new Error('the start and the end are equal');
            const dt = blk.range.length === 3 ? dtRaw : (t1 - t0) / 100;
            if (!(dt !== 0 && Math.sign(dt) === Math.sign(t1 - t0))) throw new Error('the output interval must be nonzero and point from the start to the end');
            const nOut = Math.ceil(Math.abs((t1 - t0) / dt) - 1e-9);
            if (nOut > 100000) throw new Error(`${nOut} output times; use a larger output interval`);
            const outs = [];
            for (let i = 1; i < nOut; i++) outs.push(t0 + i * dt);
            outs.push(t1);

            set(scope, blk.indep, t0);
            const y0 = blk.states.map((s, i) => {
                const at = num(blk.init[i].at.evaluate(scope), `the time in ${s}(...)`);
                if (Math.abs(at - t0) > 1e-9 * Math.max(1, Math.abs(t0))) throw new Error(`the initial value ${s}(${+at.toPrecision(6)}) must be given at the start, ${blk.indep} = ${+t0.toPrecision(6)}`);
                return num(blk.init[i].code.evaluate(scope), `the initial value of ${s}`);
            });
            const evalAt = (t, y) => {
                set(scope, blk.indep, t);
                blk.states.forEach((s, i) => set(scope, s, y[i]));
                blk.aux.forEach(a => set(scope, a.name, num(a.code.evaluate(scope), a.name)));
            };
            const f = (t, y) => { evalAt(t, y); return blk.deriv.map((c, i) => num(c.evaluate(scope), `the derivative of ${blk.states[i]}`)); };
            f(t0, y0);                                                             // errors at the start are reported as they are
            const { ys, steps } = (blk.opt.stiff ? OdeIntegrator.stiff : OdeIntegrator.dopri)(f, t0, y0, outs, { ...blk.opt, pattern: blk.pattern });
            const cols = [blk.indep, ...blk.states, ...blk.aux.map(a => a.name)];
            const row = (t, y) => { evalAt(t, y); return [t, ...y, ...blk.aux.map(a => scope[a.name])]; };
            const rows = [row(t0, y0), ...outs.map((t, i) => row(t, ys[i]))];
            return { final: ys[ys.length - 1], table: { cols, rows }, steps };
        } catch (e) { throw e.odeFatal ? e : fail(e); }
    }

    // After a Solve: the tables of every block at the solved values of its inputs
    static record(state) {
        OdeBlocks.tables = OdeBlocks.active.map(blk => {
            const r = blk.call(blk.inputs.map(nm => state[nm]));
            return { no: blk.no, header: blk.header, indep: blk.indep, states: blk.states, steps: r.steps, ...r.table };
        });
    }
}

