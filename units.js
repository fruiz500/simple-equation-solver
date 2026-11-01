// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Units: SI conversion (UnitConv) and the dimensional-analysis checker (UnitConsistencyChecker).
// --- Units declared in the equations:  units $, euro, person  ---
// Each declared name becomes a new, independent unit with factor 1: it converts to no other unit (an exchange rate is
// not a unit conversion), and Check Units tracks it as a dimension of its own. math.js accepts only alphanumeric unit
// names, so each name is given an internal alias (UsrUnitA, UsrUnitB, ...), created once per page and reused.
class UserUnits {
    static internal = new Map();   // declared name -> math.js name
    static active = new Map();     // the names declared by the equations now parsed
    static NAME = /^[A-Za-z$€£¥][A-Za-z0-9_$€£¥]*$/;
    static reset() { if (UserUnits.active.size) { UserUnits.active = new Map(); UnitConv.cache.clear(); } }
    static declare(names, where) {
        for (const n of names) {
            if (!UserUnits.NAME.test(n)) throw new Error(`${where}: '${n}' cannot be a unit name (use letters, digits, _ and $ € £ ¥, starting with a letter or a currency sign)`);
            if (!UserUnits.internal.has(n)) {
                let known = true;
                try { math.unit(1, n); } catch (e) { known = false; }
                if (known) throw new Error(`${where}: '${n}' is already a unit; only new names can be declared`);
                let k = UserUnits.internal.size, id = '';
                do { id = String.fromCharCode(65 + (k % 26)) + id; k = Math.floor(k / 26) - 1; } while (k >= 0);
                math.createUnit('UsrUnit' + id);
                UserUnits.internal.set(n, 'UsrUnit' + id);
            }
            UserUnits.active.set(n, UserUnits.internal.get(n));
            UnitConv.cache.clear();
        }
    }
    // The unit string with declared names replaced by their math.js names (unchanged when none is used)
    static translate(u) {
        if (!UserUnits.active.size) return u;
        return String(u).split(/([\s*\/^()]+)/).map(t => UserUnits.active.get(t) || t).join('');
    }
    // Declared name of a dimension index beyond math.js's own (for messages and inferred units)
    static nameOfDim(i) {
        for (const [n, id] of UserUnits.internal) if (math.unit(1, id).units[0].unit.base.dimensions[i] === 1) return n;
        return '?';
    }
}
class UnitConv {
    static cache = new Map();
    // Affine coefficients so that  SI = a + b * value_in_unit  (a is nonzero only for offset units: degC, degF)
    static coef(unit) {
        const u = String(unit || '').trim();
        if (u === '' || u === '-' || u === '1') return { a: 0, b: 1 };
        let c = UnitConv.cache.get(u);
        if (!c && UserUnits.translate(u) !== u) {   // uses a declared unit: factor of the known part only (declared ones are 1)
            c = { a: 0, b: math.unit(1, UserUnits.translate(u)).value };
            UnitConv.cache.set(u, c);
        }
        if (!c) {
            const siStr = math.unit(1, u).toSI().formatUnits();      // throws if math.js does not know the unit
            const v0 = math.unit(0, u).toNumber(siStr);
            const v1 = math.unit(1, u).toNumber(siStr);
            c = { a: v0, b: +(v1 - v0).toPrecision(15) };
            UnitConv.cache.set(u, c);
        }
        return c;
    }
    static isValid(unit) { try { UnitConv.coef(unit); return true; } catch (e) { return false; } }
    static toSI(value, unit) { const c = UnitConv.coef(unit); return c.a + value * c.b; }
    static fromSI(si, unit) { const c = UnitConv.coef(unit); return (si - c.a) / c.b; }
}

// --- Unit Consistency Engine ---
// --- Unit Consistency Engine: dimensional analysis with inference ---
// Dimension vectors follow math.js base order: [mass, length, time, current, temperature, luminous, amount, angle, bit]
// Angle and bit are ignored (treated as dimensionless).
class UnitConsistencyChecker {
    static LIT = { k: 'lit' };   // a bare number: adopts whatever dimension it meets
    static UNK = { k: 'unk' };   // dimension not known (yet)
    static zero() { return new Array(math.unit(1, 'm').units[0].unit.base.dimensions.length).fill(0); }   // 9, plus declared units
    static mk(d) { return { k: 'dim', d }; }
    static isDim(x) { return x.k === 'dim'; }
    static isDimless(x) { return x.d.every(v => Math.abs(v) < 1e-9); }
    static same(a, b) {   // vectors made before a unit was declared are shorter: missing entries are 0
        for (let i = 0; i < Math.max(a.d.length, b.d.length); i++) if (Math.abs((a.d[i] || 0) - (b.d[i] || 0)) >= 1e-9) return false;
        return true;
    }

    // Return value of each property function, and the dimension expected for keyed arguments
    static KEY_DIM = {
        t: 'K', temperature: 'K', p: 'Pa', pressure: 'Pa', h: 'J/kg', enthalpy: 'J/kg',
        s: 'J/(kg K)', entropy: 'J/(kg K)', d: 'kg/m^3', density: 'kg/m^3',
        u: 'J/kg', internalenergy: 'J/kg', q: '', quality: '', x: '', v: 'm^3/kg', specificvolume: 'm^3/kg'
    };
    static HA_DIM = { T: 'K', Tdb: 'K', B: 'K', Twb: 'K', D: 'K', Tdp: 'K', P: 'Pa', R: '', RH: '', W: '', Omega: '' };
    static NAMED = ['Pa', 'J', 'W', 'N', 'J/kg', 'J/(kg K)', 'W/(m K)', 'W/(m^2 K)', 'W/m^2', 'Pa s',
        'kg/m^3', 'm^3/kg', 'm/s', 'm^2/s', 'm^2', 'm^3', 'kg/s', 'm^3/s', 'J/K', 'W/K', 'K/W',
        '1/s', 'K', 'm', 'kg', 's', 'A', 'mol', 'J/mol', 'J/(mol K)'];

    static dimsOfUnit(unitStr) {
        const s = String(unitStr).trim();
        const d = UnitConsistencyChecker.zero();
        if (s === '' || s === '-' || s === '1') return d;
        math.unit(1, UserUnits.translate(s)).units.forEach(c => c.unit.base.dimensions.forEach((e, i) => d[i] += e * c.power));
        d[7] = 0; d[8] = 0;
        return d;
    }

    // Readable unit string for a dimension vector (a named unit if one matches, else base units)
    static nameFor(vec) {
        const U = UnitConsistencyChecker;
        if (!U._names || U._namesLen !== vec.length) {
            U._names = new Map(); U._namesLen = vec.length;
            U.NAMED.forEach(n => { const k = U.dimsOfUnit(n).join(','); if (!U._names.has(k)) U._names.set(k, n); });
        }
        if (vec.every(v => Math.abs(v) < 1e-9)) return '1';
        const hit = U._names.get(vec.join(','));
        if (hit) return hit;
        const sym = ['kg', 'm', 's', 'A', 'K', 'cd', 'mol'], num = [], den = [];
        vec.forEach((e, i) => {
            if (i >= 7 && i < 9) return;   // angle and bit
            const s = i < 7 ? sym[i] : UserUnits.nameOfDim(i);
            if (Math.abs(e) < 1e-9) return;
            const term = Math.abs(Math.abs(e) - 1) < 1e-9 ? s : `${s}^${+Math.abs(e).toFixed(4)}`;
            (e > 0 ? num : den).push(term);
        });
        return (num.join(' ') || '1') + (den.length ? ' / ' + (den.length > 1 ? `(${den.join(' ')})` : den[0]) : '');
    }

    static report(ctx, msg) { if (ctx.report) ctx.report(msg); }
    static scale(x, f) { return x.k === 'dim' ? UnitConsistencyChecker.mk(x.d.map(v => v * f)) : x; }

    static constValue(node) {
        try { const v = node.evaluate({}); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; }
    }

    // Terms that are added/subtracted (or passed to min/max) must share one dimension
    static addDims(list, ctx, node) {
        const U = UnitConsistencyChecker;
        const known = list.filter(U.isDim);
        if (known.length === 0) return list.some(x => x.k === 'unk') ? U.UNK : U.LIT;
        for (const k of known.slice(1)) {
            if (!U.same(known[0], k)) {
                U.report(ctx, `Cannot combine [${U.nameFor(known[0].d)}] and [${U.nameFor(k.d)}] in '${node.toString()}'`);
                return U.UNK;
            }
        }
        return known[0];
    }

    static mulDims(list, signs) {
        const U = UnitConsistencyChecker;
        const vec = U.zero();
        let anyDim = false;
        for (let i = 0; i < list.length; i++) {
            if (list[i].k === 'unk') return U.UNK;
            if (list[i].k === 'dim') { anyDim = true; list[i].d.forEach((v, j) => vec[j] += signs[i] * v); }
        }
        return anyDim ? U.mk(vec) : U.LIT;
    }

    static powDims(b, ex, exNode, ctx, node) {
        const U = UnitConsistencyChecker;
        if (U.isDim(ex) && !U.isDimless(ex)) {
            U.report(ctx, `Exponent must be dimensionless but is [${U.nameFor(ex.d)}] in '${node.toString()}'`);
        }
        if (b.k === 'lit') return ex.k === 'lit' ? U.LIT : (U.isDim(ex) ? U.mk(U.zero()) : U.UNK);
        if (b.k === 'unk') return U.UNK;
        const n = U.constValue(exNode);
        if (Number.isFinite(n)) return U.mk(b.d.map(v => v * n));
        return U.isDimless(b) ? b : U.UNK;
    }

    static checkPropArgs(name, args, ctx, node, spec) {
        const U = UnitConsistencyChecker;
        const got = args.map(x => U.dimOf(x, ctx));
        const rest = args.length - 1;
        const expected = [];   // [argument index, unit string]
        const keyed = (ki, vi, map, exact) => {
            const kn = args[ki];
            if (kn && kn.isConstantNode && typeof kn.value === 'string') {
                const u = map[exact ? kn.value : kn.value.toLowerCase()];
                if (u !== undefined) expected.push([vi, u]);
            }
        };
        if (spec.kind === 'state') {
            if (rest === 1) expected.push([1, 'K']);                     // a solid: conductivity('copper', T)
            else if (rest === 2) expected.push([1, 'K'], [2, 'Pa']);
            else if (rest === 4) { keyed(1, 2, U.KEY_DIM); keyed(3, 4, U.KEY_DIM); }
        } else if (spec.kind === 'sat') {
            if (rest === 1 && spec.argUnit) expected.push([1, spec.argUnit]);
            else if (rest === 2) keyed(1, 2, U.KEY_DIM);
        } else if (spec.kind === 'props') {
            keyed(2, 3, U.KEY_DIM); keyed(4, 5, U.KEY_DIM);
        } else if (spec.kind === 'ha') {
            keyed(1, 2, U.HA_DIM, true); keyed(3, 4, U.HA_DIM, true); keyed(5, 6, U.HA_DIM, true);
        }
        if (spec.kind === 'ig') (spec.argUnits || []).forEach((u, i) => { if (i < rest) expected.push([i + 1, u]); });
        expected.forEach(([i, u]) => {
            const want = U.mk(U.dimsOfUnit(u));
            if (ctx.infer && args[i] && got[i] && got[i].k === 'unk') U.inferDown(args[i], want, ctx);
            if (got[i] && U.isDim(got[i]) && !U.same(got[i], want)) {
                U.report(ctx, `${name}() expects [${u || 'dimensionless'}] here but got [${U.nameFor(got[i].d)}] in '${node.toString()}'`);
            }
        });
    }

   // interpolate(xs, ys, x) and interpolate(xs, ys, Z, x, y): x has the units of xs (and y of ys); the result those of ys (or Z).
    // A table written as a list has the common units of its entries.
    static interpDims(node, ctx) {
        const U = UnitConsistencyChecker;
        const args = node.args.filter(x => !(x.isConstantNode && typeof x.value === 'string'));
        const leaves = (n) => n.isArrayNode ? n.items.flatMap(leaves) : [n];
        const tbl = (n) => U.addDims(leaves(n).map(x => U.dimOf(x, ctx)), ctx, n);
        const pairs = args.length === 3 ? [[args[2], args[0]]] : args.length === 5 ? [[args[3], args[0]], [args[4], args[1]]] : [];
        pairs.forEach(([q, t]) => {
            const dq = U.dimOf(q, ctx), dt = tbl(t);
            if (ctx.infer && dq.k === 'unk' && U.isDim(dt)) U.inferDown(q, dt, ctx);
            if (ctx.infer && dt.k === 'unk' && U.isDim(dq)) leaves(t).forEach(x => { if (U.dimOf(x, ctx).k === 'unk') U.inferDown(x, dq, ctx); });
            if (U.isDim(dq) && U.isDim(dt) && !U.same(dq, dt)) {
                U.report(ctx, `interpolate() looks up [${U.nameFor(dq.d)}] in a table of [${U.nameFor(dt.d)}] in '${node.toString()}'`);
            }
        });
        const res = args.length === 3 ? args[1] : args.length === 5 ? args[2] : null;
        return res ? tbl(res) : U.UNK;
    }

    static inferDown(node, d, ctx) {
        const U = UnitConsistencyChecker;
        if (!U.isDim(d)) return;
        if (node.isParenthesisNode) return U.inferDown(node.content, d, ctx);
        if (node.isSymbolNode) {
            if (ctx.registered.has(node.name) && !ctx.dims.has(node.name)) { ctx.dims.set(node.name, d); ctx.changed = true; }
            return;
        }
        if (!node.isOperatorNode) return;
        const a = node.args;
        if (a.length === 1) { if (node.op === '-' || node.op === '+') U.inferDown(a[0], d, ctx); return; }
        const da = a.map(x => U.dimOf(x, ctx));
        switch (node.op) {
            case '+': case '-':
                a.forEach((x, i) => { if (da[i].k === 'unk') U.inferDown(x, d, ctx); });
                return;
            case '*': case '.*': case '/': case './': {
                const unk = [0, 1].filter(i => da[i].k === 'unk');
                if (unk.length !== 1) return;
                const i = unk[0], od = da[1 - i].k === 'dim' ? da[1 - i].d : U.zero();   // a plain number is a dimensionless factor
                let t;
                if (node.op === '*' || node.op === '.*') t = d.d.map((v, k) => v - od[k]);
                else if (i === 0) t = d.d.map((v, k) => v + od[k]);                     // x / a = d  ->  x = d a
                else t = od.map((v, k) => v - d.d[k]);                                  // a / x = d  ->  x = a / d
                return U.inferDown(a[i], U.mk(t), ctx);
            }
            case '^': case '.^': {
                const n = U.constValue(a[1]);
                if (da[0].k === 'unk' && Number.isFinite(n) && n !== 0) U.inferDown(a[0], U.mk(d.d.map(v => v / n)), ctx);
                return;
            }
        }
    }

    static dimOf(node, ctx) {
        const U = UnitConsistencyChecker;
        if (node.isConstantNode) return typeof node.value === 'number' ? U.LIT : U.UNK;
        if (node.isParenthesisNode) return U.dimOf(node.content, ctx);
        if (node.isConditionalNode) {   // if(c, a, b) and c ? a : b
            U.dimOf(node.condition, ctx);
            return U.addDims([U.dimOf(node.trueExpr, ctx), U.dimOf(node.falseExpr, ctx)], ctx, node);
        }
        if (node.isSymbolNode) return ctx.registered.has(node.name) ? (ctx.dims.get(node.name) || U.UNK) : U.LIT;
        if (node.isAccessorNode) { const n = node.toString(); return ctx.dims.get(n) || U.UNK; }

        if (node.isOperatorNode) {
            const a = node.args.map(x => U.dimOf(x, ctx));
            if (a.length === 1) return a[0];
            switch (node.op) {
                case '+': case '-': return U.addDims(a, ctx, node);
                case '*': case '.*': return U.mulDims(a, [1, 1]);
                case '/': case './': return U.mulDims(a, [1, -1]);
                case '^': case '.^': return U.powDims(a[0], a[1], node.args[1], ctx, node);
                case '<': case '>': case '<=': case '>=': case '==': case '!=': U.addDims(a, ctx, node); return U.LIT;
                case 'and': case 'or': case 'xor': return U.LIT;
                default: return U.UNK;
            }
        }

        if (node.isFunctionNode) {
            const name = node.fn.name, lname = name.toLowerCase();
            const tspec = ThermoEngine.FUNCS[lname];
            if (tspec) {
                U.checkPropArgs(name, node.args, ctx, node, tspec);
                if (tspec.kind === 'phys') {
                    const k0 = node.args[0];
                    const c = (k0 && k0.isConstantNode && typeof k0.value === 'string') ? IdealGas.constantInfo(k0.value) : null;
                    return c ? U.mk(U.dimsOfUnit(c.unit)) : U.UNK;
                }
                if (tspec.kind === 'props' || tspec.kind === 'props1' || tspec.kind === 'ha') return U.UNK;
                return U.mk(U.dimsOfUnit(tspec.unit));
            }
            if (name.startsWith('ode#')) {   // an ode state at the end: the unit tag of its initial value, if any
                const m = /^ode#(\d+):(.+)$/.exec(name), blk = m && typeof OdeBlocks !== 'undefined' && OdeBlocks.active[Number(m[1]) - 1];
                const u = blk ? blk.stateUnits[blk.states.indexOf(m[2])] : '';
                return u ? U.mk(U.dimsOfUnit(u)) : U.UNK;
            }
            const uf = UserFunctions.lookup(name);
            if (uf) {   // declared argument units are checked; the result has the declared output unit
                uf.def.params.forEach((p, i) => {
                    const g = node.args[i] ? U.dimOf(node.args[i], ctx) : U.UNK;
                    if (ctx.infer && p.unit && g.k === 'unk') U.inferDown(node.args[i], U.mk(U.dimsOfUnit(p.unit)), ctx);
                    if (p.unit && U.isDim(g) && !U.same(g, U.mk(U.dimsOfUnit(p.unit)))) {
                        U.report(ctx, `${uf.def.name}() expects [${p.unit}] for ${p.name} but got [${U.nameFor(g.d)}] in '${node.toString()}'`);
                    }
                });
                const o = uf.def.outputs[uf.k];
                return (o && o.unit) ? U.mk(U.dimsOfUnit(o.unit)) : U.UNK;
            }
            if (name === 'interpolate') return U.interpDims(node, ctx);
            if (typeof Corr !== 'undefined' && CORRELATIONS[name] && CORRELATIONS[name].length) {   // lc_cylinders, ls_spheres: radii in, a length out
                const a = node.args.map(x => U.dimOf(x, ctx)), d = U.addDims(a, ctx, node);
                if (U.isDim(d) && !U.same(d, U.mk(U.dimsOfUnit('m')))) U.report(ctx, `${name}() takes radii (lengths) but got [${U.nameFor(d.d)}] in '${node.toString()}'`);
                return U.isDim(d) ? d : U.UNK;
            }
            if (typeof Corr !== 'undefined' && Corr.entries[name] && CORRELATIONS[name].out) {   // boiling, condensation: SI units per argument
                const c = CORRELATIONS[name];
                node.args.forEach((x, i) => {
                    if (x.isConstantNode && typeof x.value === 'string') return;
                    const g = U.dimOf(x, ctx), u = c.argu[i] || '', want = u ? U.mk(U.dimsOfUnit(u)) : U.mk(U.zero());
                    if (ctx.infer && g.k === 'unk') U.inferDown(x, want, ctx);
                    if (U.isDim(g) && !U.same(g, want)) U.report(ctx, `${name}() expects [${u || 'dimensionless'}] for ${(c.argn[i] || '').replace(/[$?]/g, '')} but got [${U.nameFor(g.d)}] in '${node.toString()}'`);
                });
                return U.mk(U.dimsOfUnit(c.out));
            }
            if (typeof Corr !== 'undefined' && Corr.entries[name]) {   // correlations: dimensionless in, dimensionless out
                node.args.forEach(x => {
                    if (x.isConstantNode && typeof x.value === 'string') return;
                    const g = U.dimOf(x, ctx);
                    if (ctx.infer && g.k === 'unk') U.inferDown(x, U.mk(U.zero()), ctx);
                    if (U.isDim(g) && !U.isDimless(g)) U.report(ctx, `${name}() takes dimensionless arguments but got [${U.nameFor(g.d)}] in '${node.toString()}'`);
                });
                return U.mk(U.zero());
            }
            const a = node.args.map(x => U.dimOf(x, ctx));
            const DIMLESS_IN = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
                'asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log10', 'log2', 'log1p', 'ln', 'erf'];
            if (DIMLESS_IN.includes(name)) {
                if (ctx.infer) node.args.forEach((x, i) => { if (a[i].k === 'unk') U.inferDown(x, U.mk(U.zero()), ctx); });
                a.forEach(x => {
                    if (U.isDim(x) && !U.isDimless(x)) U.report(ctx, `${name}() needs a dimensionless argument but got [${U.nameFor(x.d)}] in '${node.toString()}'`);
                });
                return a.every(x => x.k === 'lit') ? U.LIT : U.mk(U.zero());
            }
            if (['abs', 'ceil', 'floor', 'round', 'fix', 'min', 'max', 'hypot', 'mod'].includes(name)) return U.addDims(a, ctx, node);
            if (name === 'atan2') { U.addDims(a, ctx, node); return a.every(x => x.k === 'lit') ? U.LIT : U.mk(U.zero()); }
            if (name === 'sqrt') return U.scale(a[0], 0.5);
            if (name === 'cbrt') return U.scale(a[0], 1 / 3);
            if (name === 'square') return U.scale(a[0], 2);
            if (name === 'cube') return U.scale(a[0], 3);
            if (name === 'sign') return U.mk(U.zero());
            if (name === 'pow') return U.powDims(a[0], a[1], node.args[1], ctx, node);
            return U.UNK;
        }
        return U.UNK;
    }

    static run(parsedASTs, variablesMap) {
        const U = UnitConsistencyChecker;
        const registered = new Set(variablesMap.keys());
        const dims = new Map();
        const issues = new Set();

        // 1. Declared units -> dimensions
        variablesMap.forEach((meta, name) => {
            const u = (meta.unit || '').trim();
            if (!u) return;
            try { dims.set(name, U.mk(U.dimsOfUnit(u))); }
            catch (e) { issues.add(`Unit '${u}' of ${name} is not recognized. Use forms like kPa, kJ/(kg K), W/(m^2 K), degC.`); }
        });
        const declared = new Set(dims.keys());

        // 2. Infer dimensions of unlabeled variables from the equations they are in, and from the arguments of
        //    functions, repeating until nothing changes (order-independent)
        const nameOf = (n) => n.isSymbolNode ? n.name : (n.isAccessorNode ? n.toString() : null);
        const propagate = () => {
            for (let pass = 0; pass <= parsedASTs.length; pass++) {
                const ctx = { registered, dims, report: null, infer: true, changed: false };
                for (const eq of parsedASTs) {
                    const L = U.dimOf(eq.leftAST, ctx), R = U.dimOf(eq.rightAST, ctx);
                    if (U.isDim(R)) U.inferDown(eq.leftAST, R, ctx);
                    if (U.isDim(L)) U.inferDown(eq.rightAST, L, ctx);
                }
                if (!ctx.changed) break;
            }
        };
        propagate();
        // 2b. A variable still without a dimension that is set by a plain number (N = 20) is dimensionless
        const plain = [];
        const ctx0 = { registered, dims, report: null };
        for (const eq of parsedASTs) {
            for (const [side, other] of [[eq.leftAST, eq.rightAST], [eq.rightAST, eq.leftAST]]) {
                const n = nameOf(side);
                if (n && registered.has(n) && !dims.has(n) && U.dimOf(other, ctx0).k === 'lit') { dims.set(n, U.mk(U.zero())); plain.push(n); }
            }
        }
        if (plain.length > 0) propagate();

        // 3. Final pass: report every inconsistency once
        const ctx = { registered, dims, report: (m) => issues.add(m) };
        for (const eq of parsedASTs) {
            const L = U.dimOf(eq.leftAST, ctx), R = U.dimOf(eq.rightAST, ctx);
            if (U.isDim(L) && U.isDim(R) && !U.same(L, R)) {
                const line = eq.lineRaw || `${eq.leftAST.toString()} = ${eq.rightAST.toString()}`;
                issues.add(`Unit mismatch in '${line}': left side is [${U.nameFor(L.d)}], right side is [${U.nameFor(R.d)}]`);
            }
        }

        // 4. Record inferred units (display only; replaced on every check)
        variablesMap.forEach((meta, name) => {
            meta.inferredUnit = (!declared.has(name) && dims.has(name))
                ? (U.isDimless(dims.get(name)) ? '-' : U.nameFor(dims.get(name).d)) : '';
        });

        const unlabeled = [...registered].filter(n => !dims.has(n));
        if (issues.size > 0) {
            console.error(`Unit check found ${issues.size} problem(s):`);
            issues.forEach(m => console.error('  ' + m));
            if (plain.length > 0) console.log(`  Set by a plain number, so dimensionless: ${plain.slice(0, 10).join(', ')}${plain.length > 10 ? ', ...' : ''}. Give a unit tag (T = 300 [K]) to those that have units.`);
        } else {
            console.log(`Unit check passed: ${dims.size} of ${registered.size} variables have known dimensions.`);
        }
        if (unlabeled.length > 0) {
            console.log(`  Not checked (no units known): ${unlabeled.slice(0, 12).join(', ')}${unlabeled.length > 12 ? ', ...' : ''}`);
        }
        if ([...variablesMap.values()].some(m => /^deg[CF]$/.test((m.unit || '').trim()))) {
            console.log('  Note: degC/degF are absolute temperatures here (stored in K). Label temperature DIFFERENCES in K.');
        }
        return { issues: [...issues], dims };
    }
}

