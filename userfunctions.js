// User-defined functions: function ... end blocks, interpreted from math.js ASTs.
// ==========================================
// 3b. USER-DEFINED FUNCTIONS (sequential code)
// ==========================================
//   function y = name(a, b) ... end        function [y1 [unit], y2] = name(a [unit], b, F$) ... end
// The body runs line by line: assignments, if / elseif / else, for, while, break, return, error('...'), and
// [p, q] = other(...). Each line is a math.js AST (no JavaScript eval). A function sees only its arguments,
// its own variables and the global string constants (fluid$), so the solver's dependency analysis stays correct.
// Header units convert: an argument [degC] arrives in degC, an output [kJ/kg] is read in kJ/kg and stored in SI.
class UFScope {   // math.js scope: the function's own variables over a shared read-only base (functions, strings)
    constructor(base) { this.loc = new Map(); this.base = base; }
    get(k) { return this.loc.has(k) ? this.loc.get(k) : this.base.get(k); }
    set(k, v) {
        if (typeof this.base.get(k) === 'function') throw new Error(`'${k}' is a function name and cannot be assigned`);
        this.loc.set(k, v); return this;
    }
    has(k) { return this.loc.has(k) || this.base.has(k); }
    keys() { return new Set([...this.base.keys(), ...this.loc.keys()]).values(); }
    delete(k) { return this.loc.delete(k); }
    clear() { this.loc.clear(); }
}

class UserFunctions {
    static active = new Map();     // name -> definition (set by every parse)
    static entries = {};           // callables for equation scopes: name(...), and name__k(...) for output k
    static base = new Map();
    static BLOCKED = new Set(['evaluate', 'parse', 'compile', 'simplify', 'simplifyCore', 'simplifyConstant', 'derivative',
        'rationalize', 'resolve', 'createUnit', 'import', 'config']);
    static KEYWORDS = new Set(['function', 'if', 'elseif', 'else', 'end', 'for', 'while', 'break', 'return', 'error']);
    static WHILE_CAP = 100000;     // passes of one while loop
    static STEP_CAP = 5000000;     // statements per outermost call
    static DEPTH_CAP = 64;         // nested calls (recursion)
    static depth = 0;
    static steps = 0;

    // Lifts every 'function ... end' block out of the comment-free lines, blanking them so line numbers stay put
    static extract(lines) {
        const defs = new Map();
        for (let i = 0; i < lines.length; i++) {
            const head = lines[i].trim();
            if (!/^function\b/.test(head)) {
                if (/^end\s*;?$/.test(head)) throw new Error(`Line ${i + 1}: 'end' without an open function.`);
                continue;
            }
            const start = i, body = [];
            let depth = 1;
            lines[i] = '';
            for (i++; i < lines.length; i++) {
                const t = lines[i].trim();
                lines[i] = '';
                if (/^function\b/.test(t)) throw new Error(`Line ${i + 1}: a function cannot be defined inside another one (is an 'end' missing above?).`);
                if (/^(if|for|while)\b/.test(t)) depth++;
                else if (/^end\s*;?$/.test(t) && --depth === 0) break;
                if (t) body.push({ text: t.replace(/;\s*$/, '').trim(), no: i + 1 });
            }
            if (depth > 0) throw new Error(`Line ${start + 1}: this function has no matching 'end'.`);
            const def = UserFunctions.compile(head.slice(8).trim(), start + 1, body);
            if (defs.has(def.name)) throw new Error(`Line ${start + 1}: function '${def.name}' is defined twice.`);
            defs.set(def.name, def);
        }
        return defs;
    }

    static splitTop(s) {   // split at commas outside () and []
        const out = [];
        let d = 0, cur = '';
        for (const ch of s) {
            if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--;
            if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
        }
        out.push(cur.trim());
        return out;
    }

    static checkName(n, where) {
        if (UserFunctions.KEYWORDS.has(n)) throw new Error(`${where}: '${n}' is a reserved word.`);
    }

    static nameUnit(item, where) {
        const m = item.match(/^([A-Za-z_]\w*\$?)\s*(?:\[(.*)\])?$/);
        if (!m) throw new Error(`${where}: '${item}' is not a valid name (a name, optionally followed by a [unit]).`);
        const unit = (m[2] || '').trim();
        UserFunctions.checkName(m[1], where);
        if (unit && m[1].endsWith('$')) throw new Error(`${where}: the string argument ${m[1]} cannot have a unit.`);
        if (unit && !UnitConv.isValid(unit)) throw new Error(`${where}: unit '${unit}' is not recognized by math.js (use e.g. kPa, kJ/(kg K), degC).`);
        return { name: m[1], unit };
    }

    // Parses the header and the body lines into a statement tree
    static compile(header, no, body) {
        const U = UserFunctions, where = `Line ${no}`;
        const h = header.match(/^(?:(.*?)\s*=\s*)?([A-Za-z_]\w*)\s*\((.*)\)$/);
        if (!h) throw new Error(`${where}: write the header as  function y = name(a, b)  or  function [y1, y2] = name(a, b)`);
        if (!h[1]) throw new Error(`${where}: a function must return something:  function y = ${h[2]}(...)`);
        const name = h[2];
        U.checkName(name, where);
        if (ThermoEngine.FUNCS[name.toLowerCase()] || math[name] !== undefined || name === 'ln' || /__\d+$/.test(name)) {
            throw new Error(`${where}: '${name}' is already a built-in name; pick another function name.`);
        }
        let outs = h[1].trim();
        if (outs.startsWith('[') && outs.endsWith(']')) outs = outs.slice(1, -1);
        const outputs = U.splitTop(outs).map(s => U.nameUnit(s, where));
        const params = h[3].trim() ? U.splitTop(h[3]).map(s => U.nameUnit(s, where)) : [];
        const dup = (list, what) => list.forEach((p, i) => {
            if (list.findIndex(q => q.name === p.name) !== i) throw new Error(`${where}: ${what} '${p.name}' appears twice.`);
        });
        dup(outputs, 'output'); dup(params, 'argument');

        const vet = (node, ln) => node.traverse((c) => {
            if (c.isAssignmentNode || c.isFunctionAssignmentNode || c.isBlockNode) {
                throw new Error(`Line ${ln}: one assignment per line, written  name = expression`);
            }
            if (c.isFunctionNode && c.fn.isSymbolNode && U.BLOCKED.has(c.fn.name)) throw new Error(`Line ${ln}: '${c.fn.name}()' is not available.`);
        });
        const expr = (src, ln) => {
            let node;
            try { node = U.lowerIf(math.parse(src)); } catch (e) { throw new Error(`Line ${ln}: ${e.message}`); }
            vet(node, ln);
            return node.compile();
        };

        let k = 0, loops = 0;
        const block = (stops) => {
            const out = [];
            while (k < body.length) {
                const { text: t, no: ln } = body[k];
                const kw = t === 'else' || t === 'end' ? t : (/^elseif\b/.test(t) ? 'elseif' : null);
                if (kw) {
                    if (stops.includes(kw)) return { out, stop: kw };
                    throw new Error(`Line ${ln}: unexpected '${kw}'.`);
                }
                if (/^else\b/.test(t)) throw new Error(`Line ${ln}: write 'elseif condition' (one word), or 'else' alone on its line.`);
                k++;
                let m;
                if ((m = t.match(/^if\b\s*(.*)$/))) {
                    if (!m[1]) throw new Error(`Line ${ln}: 'if' needs a condition.`);
                    const branches = [{ cond: expr(m[1], ln), ln }];
                    let r = block(['elseif', 'else', 'end']), elseBody = null;
                    branches[0].body = r.out;
                    while (r.stop === 'elseif') {
                        const b = body[k++], c = b.text.replace(/^elseif\b\s*/, '');
                        if (!c) throw new Error(`Line ${b.no}: 'elseif' needs a condition.`);
                        const br = { cond: expr(c, b.no), ln: b.no };
                        r = block(['elseif', 'else', 'end']);
                        br.body = r.out;
                        branches.push(br);
                    }
                    if (r.stop === 'else') { k++; r = block(['end']); elseBody = r.out; }
                    if (r.stop !== 'end') throw new Error(`Line ${ln}: this 'if' has no matching 'end'.`);
                    k++;
                    out.push({ t: 'if', branches, elseBody, ln });
                } else if ((m = t.match(/^for\b\s*([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
                    U.checkName(m[1], `Line ${ln}`);
                    const range = expr(m[2], ln);
                    loops++; const r = block(['end']); loops--;
                    if (r.stop !== 'end') throw new Error(`Line ${ln}: this 'for' has no matching 'end'.`);
                    k++;
                    out.push({ t: 'for', v: m[1], range, body: r.out, ln });
                } else if ((m = t.match(/^while\b\s*(.*)$/))) {
                    if (!m[1]) throw new Error(`Line ${ln}: 'while' needs a condition.`);
                    const cond = expr(m[1], ln);
                    loops++; const r = block(['end']); loops--;
                    if (r.stop !== 'end') throw new Error(`Line ${ln}: this 'while' has no matching 'end'.`);
                    k++;
                    out.push({ t: 'while', cond, body: r.out, ln });
                } else if (t === 'break') {
                    if (!loops) throw new Error(`Line ${ln}: 'break' outside a for or while loop.`);
                    out.push({ t: 'break', ln });
                } else if (t === 'return') {
                    out.push({ t: 'return', ln });
                } else if (/^error\b/.test(t)) {
                    m = t.match(/^error\s*\(\s*(['"])(.*)\1\s*\)$/);
                    if (!m) throw new Error(`Line ${ln}: write  error('message')`);
                    out.push({ t: 'error', msg: m[2], ln });
                } else if ((m = t.match(/^\[([^\]]*)\]\s*=\s*(.+)$/))) {
                    const names = U.splitTop(m[1]);
                    names.forEach(n => { if (!/^[A-Za-z_]\w*\$?$/.test(n)) throw new Error(`Line ${ln}: '${n}' is not a valid name.`); U.checkName(n, `Line ${ln}`); });
                    let call;
                    try { call = U.lowerIf(math.parse(m[2])); } catch (e) { throw new Error(`Line ${ln}: ${e.message}`); }
                    if (!call.isFunctionNode || !call.fn.isSymbolNode) throw new Error(`Line ${ln}: [${names.join(', ')}] = ... needs a call to a user function on the right.`);
                    call.args.forEach(a => vet(a, ln));
                    out.push({ t: 'multi', names, fname: call.fn.name, args: call.args.map(a => a.compile()), ln });
                } else {
                    let node;
                    try { node = U.lowerIf(math.parse(t)); } catch (e) { throw new Error(`Line ${ln}: ${e.message}`); }
                    if (!node.isAssignmentNode || !node.object.isSymbolNode) {
                        throw new Error(`Line ${ln}: expected an assignment (name = expression), if, for, while, break, return or error(), got '${t}'.`);
                    }
                    U.checkName(node.object.name, `Line ${ln}`);
                    vet(node.value, ln);
                    if (node.index) vet(node.index, ln);
                    out.push({ t: 'set', code: node.compile(), ln });
                }
            }
            return { out, stop: null };
        };
        const top = block([]);
        return { name, params, outputs, body: top.out, line: no };
    }

    // Builds the callables for this parse. Calls are cached (last arguments -> outputs): functions are pure.
    static activate(defs, strConsts) {
        const U = UserFunctions;
        U.active = defs;
        U.entries = {};
        const fresh = (v) => (v !== null && typeof v === 'object') ? math.clone(v) : v;
        defs.forEach((def, name) => {
            let lastArgs = null, lastOuts = null;
            const call = (args) => {
                if (!(lastArgs && args.length === lastArgs.length && args.every((a, i) => a === lastArgs[i]))) {
                    lastOuts = U.run(def, args);
                    lastArgs = args;
                }
                return lastOuts;
            };
            U.entries[name] = (...args) => {
                if (def.outputs.length > 1) {
                    throw new Error(`${name}() returns ${def.outputs.length} outputs: write  [${def.outputs.map(o => o.name).join(', ')}] = ${name}(...)  on a line of its own`);
                }
                return fresh(call(args)[0]);
            };
            def.outputs.forEach((o, k) => { U.entries[`${name}__${k + 1}`] = (...args) => fresh(call(args)[k]); });
        });
        U.base = new Map();
        Object.keys(ThermoEngine.FUNCS).forEach(p => U.base.set(p, (fluid, ...a) => ThermoEngine.evaluate(p, fluid, ...a)));
        U.base.set('ln', Math.log);
        Object.entries(U.entries).forEach(([n, f]) => U.base.set(n, f));
        Object.entries(strConsts || {}).forEach(([n, v]) => U.base.set(n + '$', v));
    }

    // Inline  if(condition, a, b)  ->  math.js conditional node (same as  condition ? a : b): only the chosen branch is evaluated
    // Also:  derivative(expression, x)  ->  the derivative, worked out symbolically before solving (math.js)
    static lowerIf(node) {
        return node.transform((n) => {
            if (n.isFunctionNode && n.fn.isSymbolNode && n.fn.name === 'derivative') return UserFunctions.lowerDerivative(n);
            if (!(n.isFunctionNode && n.fn.isSymbolNode && n.fn.name === 'if')) return n;
            if (n.args.length !== 3) throw new Error(`if() takes 3 arguments, if(condition, value if true, value if false), but got ${n.args.length}`);
            const [c, a, b] = n.args.map(x => UserFunctions.lowerIf(x));
            return new math.ConditionalNode(c, a, b);
        });
    }

    static lowerDerivative(n) {
        if (n.args.length !== 2) throw new Error('derivative() takes 2 arguments: derivative(expression, x)');
        const [ex, x] = n.args.map(a => (a.isConstantNode && typeof a.value === 'string') ? math.parse(a.value) : a);
        if (!x.isSymbolNode) throw new Error('in derivative(expression, x), x must be a variable name');
        const expr = UserFunctions.lowerIf(ex).transform(c => (c.isFunctionNode && c.fn.isSymbolNode && c.fn.name === 'ln')
            ? new math.FunctionNode(new math.SymbolNode('log'), c.args) : c);      // ln is our name for log
        try { return math.derivative(expr, x.name); }
        catch (e) {
            const fn = (/function "?([A-Za-z_]\w*)/i.exec(e.message) || [])[1];
            throw new Error(`derivative(): ${fn ? `'${fn}' cannot be differentiated symbolically` : e.message}. Only written-out formulas can be ` +
                "(+ - * / ^, sqrt, exp, log, sin, ...); property and user functions are computed numerically. For property derivatives use props('d(H)/d(T)|P', ...).");
        }
    }

    // name or name__k  ->  { def, k } (for the unit checker)
    static lookup(fname) {
        const U = UserFunctions;
        if (U.active.has(fname)) return { def: U.active.get(fname), k: 0 };
        const m = fname.match(/^(.+)__(\d+)$/);
        return (m && U.active.has(m[1])) ? { def: U.active.get(m[1]), k: Number(m[2]) - 1 } : null;
    }

    static conv(v, unit, toSI) {
        if (!unit) return v;
        const one = (x) => typeof x === 'number' ? (toSI ? UnitConv.toSI(x, unit) : UnitConv.fromSI(x, unit)) : x;
        if (typeof v === 'number') return one(v);
        if (math.isMatrix(v) || Array.isArray(v)) return math.map(v, one);
        return v;
    }

    static run(def, args) {
        const U = UserFunctions;
        if (args.length !== def.params.length) {
            throw new Error(`${def.name}() takes ${def.params.length} argument(s) (${def.params.map(p => p.name).join(', ')}), got ${args.length}`);
        }
        if (U.depth >= U.DEPTH_CAP) {
            const e = new Error(`${def.name}(): calls nested more than ${U.DEPTH_CAP} deep (endless recursion?)`);
            e.ufKeep = true;
            throw e;
        }
        if (U.depth === 0) U.steps = 0;
        const scope = new UFScope(U.base);
        def.params.forEach((p, i) => {
            const a = args[i];
            if (p.name.endsWith('$') !== (typeof a === 'string')) {
                throw new Error(`${def.name}(): argument ${p.name} must be ${p.name.endsWith('$') ? 'a string' : 'a number or array'}`);
            }
            scope.loc.set(p.name, U.conv((a !== null && typeof a === 'object') ? math.clone(a) : a, p.unit, false));
        });
        U.depth++;
        try { U.exec(def.body, scope); }
        catch (e) { throw e.ufKeep ? e : new Error(`${def.name}(), ${e.message}`); }
        finally { U.depth--; }
        return def.outputs.map(o => {
            if (!scope.loc.has(o.name)) throw new Error(`${def.name}(): output '${o.name}' was not assigned`);
            return U.conv(scope.loc.get(o.name), o.unit, true);
        });
    }

    static truth(v) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number' && !Number.isNaN(v)) return v !== 0;
        throw new Error(`a condition must be a single true/false value, got ${typeof v === 'number' ? 'NaN' : math.format(v, { precision: 4 })}`);
    }

    static items(v) {
        if (math.isMatrix(v)) return v.toArray().flat(Infinity);
        if (Array.isArray(v)) return v.flat(Infinity);
        return [v];
    }

    static fail(ln, e) {
        if (e.ufLine || e.ufKeep) return e;
        const msg = String(e.message || e).replace(/^Undefined symbol (\S+)$/,
            "'$1' is not defined here (a function sees only its arguments and the variables it assigns)");
        const err = new Error(`line ${ln}: ${msg}`);
        err.ufLine = true;
        return err;
    }

    // Runs a statement list; returns 'break' or 'return' when one of them ends it early
    static exec(stmts, scope) {
        const U = UserFunctions;
        for (const st of stmts) {
            let sig;
            try {
                if (++U.steps > U.STEP_CAP) throw new Error(`more than ${U.STEP_CAP} statements were run (endless loop?)`);
                switch (st.t) {
                    case 'set': st.code.evaluate(scope); break;
                    case 'multi': {
                        const f = U.active.get(st.fname);
                        if (!f) throw new Error(`'${st.fname}' is not a user function`);
                        if (f.outputs.length !== st.names.length) throw new Error(`${st.fname}() returns ${f.outputs.length} output(s), not ${st.names.length}`);
                        const outs = U.run(f, st.args.map(a => a.evaluate(scope)));
                        st.names.forEach((n, i) => scope.set(n, outs[i]));
                        break;
                    }
                    case 'if': {
                        let body = st.elseBody;
                        for (const b of st.branches) {
                            let ok;
                            try { ok = U.truth(b.cond.evaluate(scope)); } catch (e) { throw U.fail(b.ln, e); }
                            if (ok) { body = b.body; break; }
                        }
                        if (body) sig = U.exec(body, scope);
                        break;
                    }
                    case 'for':
                        for (const x of U.items(st.range.evaluate(scope))) {
                            scope.set(st.v, x);
                            const s = U.exec(st.body, scope);
                            if (s === 'break') break;
                            if (s === 'return') { sig = s; break; }
                        }
                        break;
                    case 'while': {
                        let n = 0;
                        while (U.truth(st.cond.evaluate(scope))) {
                            if (++n > U.WHILE_CAP) throw new Error(`the while loop ran ${U.WHILE_CAP} times without ending`);
                            const s = U.exec(st.body, scope);
                            if (s === 'break') break;
                            if (s === 'return') { sig = s; break; }
                        }
                        break;
                    }
                    case 'break': return 'break';
                    case 'return': return 'return';
                    case 'error': throw new Error(st.msg);
                }
            } catch (e) { throw U.fail(st.ln, e); }
            if (sig) return sig;
        }
    }
}

