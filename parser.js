// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Equation parser: text -> math.js ASTs, variables, units, ode45 calls.
// ==========================================
// 3. EES / MATLAB AST PARSER
// ==========================================

// Parses string equations, strips comments, extracts symbolic variables, and builds math.js AST trees
class EESParser {
    constructor() {
        this.rawEquations = [];
        this.parsedASTs = [];
        this.variables = new Map();
        this.odeCalls = [];
        this.saved = new Map();   // name -> guess, bounds and unit of the last parse that succeeded, kept through parse errors
    }

    parse(text) {
        this.rawEquations = [];
        this.parsedASTs = [];
        this.odeCalls = [];
        this.variables = new Map();

        // Comments are blanked but keep their line breaks, so messages can give line numbers
        let cleanText = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*|\{[^}]*\}/g, (c) => c.replace(/[^\n]/g, ' '));
        if (cleanText.includes('/*')) throw new Error("A '/*' comment is never closed with '*/'.");
        const srcLines = cleanText.split('\n');
        EESParser.joinContinuations(srcLines);                  // a line with an open ( or [ continues on the next lines
        EESParser.splitSemicolons(srcLines);                    // a = 1; b = 2  on one line: two equations, same line number
        EESParser.declareUnits(srcLines);                       // units $, euro, person: new unit names
        this.constants = EESParser.constantsOf(srcLines);       // name = number lines, for duplicate ranges and indices
        EESParser.expandDuplicates(srcLines, this.constants);   // writes out the duplicate ... end blocks
        const odeBlocks = OdeBlocks.extract(srcLines);          // lifts out the ode ... end blocks
        const userFuncs = UserFunctions.extract(srcLines);      // lifts out the function ... end blocks
        // String variables:  fluid$ = 'R134a'  (substituted as text wherever fluid$ appears)
        const strVars = {};
        cleanText = srcLines.map(l => l.split('\u0001').filter(p => {
            const m = p.trim().match(/^([A-Za-z_]\w*)\$\s*=\s*(['"])([^'"]*)\2$/);
            if (m) { strVars[m[1]] = m[3]; return false; }
            return true;
        }).join('\u0001')).join('\n');
        UserFunctions.activate(userFuncs, strVars);
        OdeBlocks.activate(odeBlocks, strVars, (node) => this.flatIndex(node));
        cleanText = cleanText.replace(/([A-Za-z_]\w*)\$/g, (all, name) => {
            if (!(name in strVars) && UserUnits.active.has(all)) return all;   // a unit such as k$
            if (!(name in strVars)) throw new Error(`String variable '${name}$' is not defined. Define it first, e.g. ${name}$ = 'water'`);
            return "'" + strVars[name] + "'";
        });
        const lines = cleanText.split('\n').flatMap((l, i) => l.split('\u0001').map(p => [p.trim(), i + 1])).filter(([l]) => l.length > 0);

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            let [line, lineNo] = lines[lineIndex];

            // ODE45 Syntax Parser
            const odeMatch = line.match(/^\[\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*\]\s*=\s*ode45\((.+)\)$/);
            if (odeMatch) {
                this.odeCalls.push({ lineRaw: line, timeVar: odeMatch[1], stateVar: odeMatch[2], argsRaw: odeMatch[3] });
                this.registerVariable(odeMatch[1]);
                this.registerVariable(odeMatch[2]);
                continue;
            }
            // Multiple outputs of a user function:  [h2, s2] = steam(T2, P2)  ->  one equation per output
            const multi = line.match(/^\[([^\]]+)\]\s*=\s*([A-Za-z_]\w*)\s*\((.*)\)$/);
            if (multi && UserFunctions.active.has(multi[2])) { this.addMultiCall(multi, line, lineNo); continue; }

            // --- NEW: Extract EES-style inline units (e.g., x = 5 [kJ/kg]) ---
            let inlineUnit = null;
            const unitMatch = line.match(/[^\s=+\-*\/^(,;]\s+\[((?:[a-zA-Z$€£¥]|1\/)[a-zA-Z0-9_$€£¥\/\^\*\s\.\-\(\)]*|-)\]\s*$/);
            if (unitMatch) {
                inlineUnit = unitMatch[1].trim();
                line = line.slice(0, unitMatch.index + 1).trim();
            }

            const eqAt = EESParser.equalsAt(line);
            if (eqAt.length === 0) throw new Error(`Line ${lineNo}: missing '=' sign in '${line}'.`);
            if (eqAt.length > 1) throw new Error(`Line ${lineNo}: more than one '=' in '${line}' (write comparisons as ==, <=, >=, !=).`);
            const parts = [line.slice(0, eqAt[0]), line.slice(eqAt[0] + 1)];
            if (!parts[0].trim() || !parts[1].trim()) throw new Error(`Line ${lineNo}: nothing on the ${parts[0].trim() ? 'right' : 'left'} of '=' in '${line}'.`);

            try {
                const leftAST = this.flatIndex(UserFunctions.lowerIf(math.parse(parts[0].trim())));
                let rightAST = this.flatIndex(UserFunctions.lowerIf(math.parse(parts[1].trim())));
                const eqVars = new Set();
                this.extractVariablesFromAST(leftAST, eqVars);
                this.extractVariablesFromAST(rightAST, eqVars);

                // --- NEW: Assign extracted inline unit to the target variable ---
                if (inlineUnit && leftAST.isSymbolNode) {
                    this.registerVariable(leftAST.name);
                    this.variables.get(leftAST.name).unit = inlineUnit;
                } else if (inlineUnit && leftAST.isAccessorNode) {
                    // Support array variables like x[1] = 5 [m]
                    const arrayVarName = leftAST.toString();
                    this.registerVariable(arrayVarName);
                    this.variables.get(arrayVarName).unit = inlineUnit;
                }

                // Automatic conversion to SI: a constant right side carrying a unit, e.g.  L = 5 [ft]
                if (inlineUnit && (leftAST.isSymbolNode || leftAST.isAccessorNode)) {
                    const rightVars = new Set();
                    this.extractVariablesFromAST(rightAST, rightVars);
                    if (rightVars.size === 0) {
                        let raw = NaN;
                        try { raw = rightAST.evaluate({}); } catch (e) { }
                        if (typeof raw === 'number' && Number.isFinite(raw)) {
                            if (!UnitConv.isValid(inlineUnit)) {
                                throw new Error(`Unit '${inlineUnit}' is not recognized by math.js (use e.g. kPa, kJ/(kg K), W/(m^2 K), degC; no hyphens). A new unit, such as $ or euro, must be declared first:  units $, euro`);
                            }
                            rightAST = math.parse(String(UnitConv.toSI(raw, inlineUnit)));
                        }
                    }
                }

                this.rawEquations.push({ leftStr: parts[0].trim(), rightStr: parts[1].trim(), lineRaw: line });

                // THE FIX: Added `lineRaw: line` so the Unit Checker can print the equation
                this.parsedASTs.push({ leftAST, rightAST, vars: Array.from(eqVars), lineRaw: line, lineNo });
            } catch (err) {
                throw new Error(`Line ${lineNo} ('${line}'): ${err.message}`);
            }
        }
        OdeBlocks.active.forEach(blk => this.addOdeBlock(blk));
        this.saved = new Map(this.variables);   // parsed: the store holds just these variables (a failed parse leaves it whole)
        return { equationsCount: this.rawEquations.length, variables: Array.from(this.variables.keys()) };
    }

    // An ode block gives one equation per state:  T = ode#k:T(inputs...), the value of T at the end
    addOdeBlock(blk) {
        try {
            const inputs = blk.inputs.map(nm => this.flatIndex(math.parse(nm)));
            blk.states.forEach(s => {
                const leftAST = this.flatIndex(math.parse(s));
                const rightAST = new math.FunctionNode(new math.SymbolNode(blk.fname(s)), inputs);
                const eqVars = new Set();
                this.extractVariablesFromAST(leftAST, eqVars);
                this.extractVariablesFromAST(rightAST, eqVars);
                this.rawEquations.push({ leftStr: s, rightStr: rightAST.toString(), lineRaw: blk.header });
                this.parsedASTs.push({ leftAST, rightAST, vars: Array.from(eqVars), lineRaw: blk.header, lineNo: blk.no });
            });
        } catch (err) { throw new Error(`Line ${blk.no} ('${blk.header}'): ${err.message}`); }
    }

    // Lines  name = constant  (a number, or an expression of earlier constants, with an optional unit tag) outside
    // function, ode and duplicate blocks. Their values (SI) are known before solving: duplicate ranges and indices use them.
    // A line whose ( or [ is still open continues on the next lines, as in
    //     T_tab = [300, 350, 400,
    //              450, 500]
    // The joined text goes on the first line and the others are left empty, so line numbers stay those of the editor.
    // Quoted text is skipped; ' after a name, ] or ) is a prime (T' or A'), not a quote.
    static joinContinuations(lines) {
        const depth = (s) => {
            let d = 0, q = null;
            for (let i = 0; i < s.length; i++) {
                const c = s[i];
                if (q) { if (c === q) q = null; continue; }
                if (c === '"' || (c === "'" && !/[A-Za-z0-9_\])]/.test(s[i - 1] || ''))) q = c;
                else if (c === '(' || c === '[') d++;
                else if (c === ')' || c === ']') d--;
            }
            return d;
        };
        const open = (i) => `Line ${i + 1}: a ( or [ is not closed`;
        for (let i = 0; i < lines.length; i++) {
            let d = depth(lines[i]), j = i;
            while (d > 0) {
                do j++; while (j < lines.length && !lines[j].trim());
                if (j >= lines.length) throw new Error(open(i));
                if (EESParser.equalsAt(lines[j]).length) throw new Error(`${open(i)} (line ${j + 1} starts a new equation)`);
                lines[i] = lines[i].replace(/\s+$/, '') + ' ' + lines[j].trim();
                d += depth(lines[j]);
                lines[j] = '';
            }
        }
    }

    // Semicolons outside brackets and quotes separate equations written on one line. The pieces stay in that line's
    // slot, separated by \u0001, so messages keep the source line number. A trailing ; is allowed (Matlab style).
    // Lines that open or close a block (function, ode, duplicate, if, for, while, else, end) are left as they are.
    static splitSemicolons(lines) {
        const block = /^(function|ode|duplicate|if|elseif|else|for|while|end)\b/;
        lines.forEach((l, i) => {
            if (!l.includes(';') || block.test(l.trim())) return;
            const out = [];
            let d = 0, q = null, cur = '';
            for (let k = 0; k < l.length; k++) {
                const c = l[k];
                if (q) { if (c === q) q = null; }
                else if (c === '"' || (c === "'" && !/[A-Za-z0-9_\])]/.test(l[k - 1] || ''))) q = c;   // ' after a name is a transpose
                else if (c === '(' || c === '[') d++;
                else if (c === ')' || c === ']') d--;
                if (c === ';' && d === 0 && !q) { out.push(cur); cur = ''; } else cur += c;
            }
            out.push(cur);
            const pieces = out.filter(p => p.trim());
            const late = pieces.slice(1).find(p => block.test(p.trim()));
            if (late) throw new Error(`Line ${i + 1}: '${late.trim().split(/\s/)[0]}' must start its own line, not follow a semicolon.`);
            lines[i] = pieces.join('\u0001');
        });
    }

    // Lines  units $, euro, person  declare new unit names (see UserUnits in units.js); the lines are then left empty
    // and lines  1 [$] = 0.88 [euro]  define a unit from a known one (the name on the left is new; any factors)
    static declareUnits(lines) {
        const num = '([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?)';
        const DEF = new RegExp(`^\\s*${num}\\s*\\[\\s*([^\\]\\s]+)\\s*\\]\\s*=\\s*${num}\\s*\\[([^\\]]+)\\]\\s*$`);
        UserUnits.reset();
        lines.forEach((l, i) => {
            lines[i] = l.split('\u0001').filter(p => {
                const d = p.match(DEF);
                if (d) { UserUnits.define(d[2], +d[3] / +d[1], d[4].trim(), `Line ${i + 1}`); return false; }
                const m = p.match(/^\s*units\s+([^=]*)$/);
                if (!m) return true;
                const names = m[1].split(/[\s,]+/).filter(Boolean);
                if (!names.length) throw new Error(`Line ${i + 1}: list the new units after 'units', e.g.  units $, euro`);
                UserUnits.declare(names, `Line ${i + 1}`);
                return false;
            }).join('\u0001');
        });
    }

    static constantsOf(lines) {
        const C = {}, cand = [];
        let skip = 0, depth = 0;                                  // inside a block: skip its lines
        lines.flatMap(l => l.split('\u0001')).forEach((raw) => {
            const t = raw.trim();
            if (skip) {
                if (/^(if|for|while|duplicate)\b/.test(t)) depth++;
                else if (/^end\s*;?$/.test(t)) { if (depth > 0) depth--; else skip = 0; }
                return;
            }
            if (/^(function|ode\s+[A-Za-z_]\w*\s*=|duplicate)\b/.test(t)) { skip = 1; depth = 0; return; }
            const m = t.match(/^([A-Za-z_]\w*)\s*=\s*([^=]+?)(?:\s+\[([^\]]*)\])?\s*$/);
            if (m && !/[<>!]$/.test(m[2])) cand.push(m);
        });
        for (let pass = 0; pass < 10; pass++) {                   // repeat so that  M = N - 1  after  N = 20  works
            let added = false;
            for (const [, name, expr, unit] of cand) {
                if (name in C) continue;
                try {
                    const node = math.parse(expr);
                    if (node.filter((c, path) => c.isSymbolNode && path !== 'fn' && !(c.name in C) && !['pi', 'e'].includes(c.name)).length) continue;
                    if (node.filter(c => c.isAccessorNode || c.isAssignmentNode).length) continue;
                    let v = node.evaluate({ ...C });
                    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
                    if (unit && unit.trim() && unit.trim() !== '-') v = UnitConv.toSI(v, unit.trim());
                    C[name] = v; added = true;
                } catch (e) { }
            }
            if (!added) break;
        }
        return C;
    }

    // duplicate i = a : b  ...  end   writes its lines once for every value of i (nested blocks allowed). The copies
    // of a line go into that line's slot, separated by \u0001, so messages keep the source line number.
    static expandDuplicates(lines, C) {
        const isEnd = (t) => /^end\s*;?$/.test(t);
        const findEnd = (i) => {
            let depth = 1;
            for (let j = i + 1; j < lines.length; j++) {
                const t = lines[j].trim();
                if (/^duplicate\b/.test(t)) depth++;
                else if (isEnd(t) && --depth === 0) return j;
                else if (/^(if|for|while|function|ode)\b/.test(t)) {
                    throw new Error(`Line ${j + 1}: a duplicate block holds equations only (no if, for, while, function or ode inside it; an ode block may contain a duplicate block).`);
                }
            }
            throw new Error(`Line ${i + 1}: this duplicate block has no matching 'end'.`);
        };
        // replaces the loop variables (whole words, outside quotes) by their values
        const subst = (text, env) => text.split(/('[^']*'|"[^"]*")/).map((seg, k) => k % 2 ? seg :
            seg.replace(/[A-Za-z_]\w*/g, (w, off) => (w in env && seg[off - 1] !== '.' && seg[off + w.length] !== '$') ? (env[w] < 0 ? `(${env[w]})` : String(env[w])) : w)).join('');
        const out = new Map();                                   // line index -> written-out copies
        let total = 0;
        const expand = (i, j, env) => {
            const m = lines[i].trim().match(/^duplicate\s+([A-Za-z_]\w*)\s*=\s*(.+)$/);
            if (!m) throw new Error(`Line ${i + 1}: write  duplicate i = start : end  (or start : step : end).`);
            let vals;
            try {
                const node = math.parse(subst(m[2], env));
                const unknown = node.filter((c, path) => c.isSymbolNode && path !== 'fn' && !(c.name in C) && !['pi', 'e'].includes(c.name));
                if (unknown.length) throw new Error(`Undefined symbol ${unknown[0].name}`);   // never read as a unit (N is newton)
                const r = node.evaluate({ ...C });
                vals = (math.isMatrix(r) ? r.toArray() : Array.isArray(r) ? r : [r]).flat(Infinity);
            } catch (e) {
                const u = /Undefined symbol (\S+)/.exec(e.message);
                throw new Error(`Line ${i + 1}: the range of duplicate must be known before solving` + (u ? `; '${u[1]}' is not a constant (set it on a line of its own, such as ${u[1]} = 10)` : ` (${e.message})`) + '.');
            }
            if (!vals.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error(`Line ${i + 1}: the range of duplicate must be numbers.`);
            for (const v of vals) {
                const env2 = { ...env, [m[1]]: v };
                for (let k = i + 1; k < j; k++) {
                    const t = lines[k].trim();
                    if (/^duplicate\b/.test(t)) { const e2 = findEnd(k); expand(k, e2, env2); k = e2; continue; }
                    if (!t) continue;
                    if (++total > 100000) throw new Error(`Line ${i + 1}: duplicate would write more than 100000 lines.`);
                    if (!out.has(k)) out.set(k, []);
                    out.get(k).push(subst(t, env2));
                }
            }
        };
        let inFunction = 0;                                       // depth inside a function block: duplicate is not allowed there
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (inFunction) {
                if (/^(if|for|while)\b/.test(t)) inFunction++;
                else if (isEnd(t)) inFunction--;
                else if (/^duplicate\b/.test(t)) throw new Error(`Line ${i + 1}: duplicate writes equations; inside a function use a for loop.`);
                continue;
            }
            if (/^function\b/.test(t)) { inFunction = 1; continue; }
            if (!/^duplicate\b/.test(t)) continue;
            const j = findEnd(i);
            expand(i, j, {});
            for (let k = i; k <= j; k++) lines[k] = '';
            i = j;
        }
        out.forEach((copies, k) => {
            // The usual mistake: the same left side in every copy, as in  s = s + x[i]
            const lefts = copies.map(c => { const at = EESParser.equalsAt(c); return at.length ? c.slice(0, at[0]).replace(/\s+/g, '') : null; });
            if (copies.length > 1 && lefts[0] && /^[A-Za-z_]/.test(lefts[0]) && !/'$/.test(lefts[0]) && lefts.every(l => l === lefts[0])) {
                throw new Error(`Line ${k + 1}: every copy of this line defines the same ${lefts[0]}, so the copies contradict each other (equations are solved together, not run in order). ` +
                    `To add up terms, write for example  ${lefts[0]} = sum(x[1:N]);  for a running calculation, use a user function with a for loop.`);
            }
            lines[k] = copies.map(c => '\u0001' + c).join('');
        });
    }

    // Indices that can be computed before solving become part of the variable name: T[i+1] with i = 2 is T[3], and
    // T[N] with the constant N = 20 is T[20]; T[2,3] is T[2, 3]. A range x[1:N] becomes the list [x[1], ..., x[N]],
    // so sum(x[1:N]) works; Z[1:M, 1:N] becomes the matrix of Z[i, j] and Z[2, 1:N] one row. Other indices are left alone.
    flatIndex(node) {
        const C = this.constants || {};
        const val = (n) => {
            if (n.filter((c, path) => c.isSymbolNode && path !== 'fn' && !(c.name in C)).length) return null;
            try { return n.evaluate({ ...C }); } catch (e) { return null; }
        };
        const check = (k, name) => {
            if (!(typeof k === 'number' && Number.isInteger(k) && k >= 1)) throw new Error(`an index of ${name} must be a whole number of 1 or more, got ${typeof k === 'number' ? k : k}`);
            return k;
        };
        return node.transform((n) => {
            if (!(n.isAccessorNode && n.object && n.object.isSymbolNode && n.index && n.index.dimensions)) return n;
            const name = n.object.name, dims = n.index.dimensions;
            if (dims.some(d => d.isRangeNode)) {
                const ks = dims.map(d => { const r = val(d); return (r === null || r === undefined) ? null : math.isMatrix(r) ? r.toArray() : r; });
                if (ks.some(k => k === null)) return n;
                const build = (i, idx) => i === dims.length ? new math.SymbolNode(`${name}[${idx.map(k => check(k, name)).join(', ')}]`)
                    : dims[i].isRangeNode ? new math.ArrayNode(ks[i].map(k => build(i + 1, [...idx, k]))) : build(i + 1, [...idx, ks[i]]);
                return build(0, []);
            }
            const ks = dims.map(val);
            if (ks.some(k => k === null)) return n;
            return new math.SymbolNode(`${name}[${ks.map(k => check(k, name)).join(', ')}]`);
        });
    }

    // Positions of the '=' signs that are not part of ==, <=, >=, != (text inside quotes is skipped)
    static equalsAt(s) {
        const at = [];
        let q = null;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (q) { if (c === q) q = null; continue; }
            if (c === "'" || c === '"') { q = c; continue; }
            if (c === '=' && !'=<>!'.includes(s[i - 1] || ' ') && s[i + 1] !== '=') at.push(i);
        }
        return at;
    }

    addMultiCall(m, line, lineNo) {
        const def = UserFunctions.active.get(m[2]);
        const names = m[1].split(',').map(s => s.trim());
        const where = `Line ${lineNo} ('${line}')`;
        if (names.length !== def.outputs.length) throw new Error(`${where}: ${def.name}() returns ${def.outputs.length} output(s), but ${names.length} name(s) are given.`);
        try {
            const call = this.flatIndex(UserFunctions.lowerIf(math.parse(`${m[2]}(${m[3]})`)));
            names.forEach((n, k) => {
                const leftAST = /^[A-Za-z_]\w*(\[[^\]]+\])?$/.test(n) ? this.flatIndex(math.parse(n)) : null;
                if (!leftAST || !leftAST.isSymbolNode) throw new Error(`'${n}' is not a variable name`);
                const rightAST = new math.FunctionNode(new math.SymbolNode(`${m[2]}__${k + 1}`), call.args);
                const eqVars = new Set();
                this.extractVariablesFromAST(leftAST, eqVars);
                this.extractVariablesFromAST(rightAST, eqVars);
                this.rawEquations.push({ leftStr: n, rightStr: rightAST.toString(), lineRaw: line });
                this.parsedASTs.push({ leftAST, rightAST, vars: Array.from(eqVars), lineRaw: line, lineNo });
            });
        } catch (err) { throw new Error(`${where}: ${err.message}`); }
    }

    /**
     * Traverses an AST tree to collect variable identifiers while ignoring functions and array bases
     */
    extractVariablesFromAST(node, varSet = null) {
        const arrayBases = new Set();

        // Pass 1: Collect indexed array expressions (e.g. "x[1]") and log base name "x"
        node.traverse((child) => {
            if (child.isAccessorNode && child.index && child.object && child.object.isSymbolNode) {
                arrayBases.add(child.object.name);
                const varName = child.toString();
                this.registerVariable(varName);
                if (varSet) varSet.add(varName);
            }
        });

        // Pass 2: every symbol that is not a function name, array base, or constant is a variable
        const RESERVED = new Set(['pi', 'e', 'i', 'Infinity', 'NaN', 'true', 'false', 'null']);
        node.traverse((child, path) => {
            if (child.isFunctionNode && child.fn.isSymbolNode && UserFunctions.BLOCKED.has(child.fn.name)) {
                throw new Error(`'${child.fn.name}()' is not available in equations.`);
            }
            if (child.isFunctionNode && child.fn.isSymbolNode && UserFunctions.active.has(child.fn.name)) {
                const np = UserFunctions.active.get(child.fn.name).params.length;
                if (child.args.length !== np) throw new Error(`${child.fn.name}() takes ${np} argument(s), got ${child.args.length}.`);
            }
            if (!child.isSymbolNode) return;
            if (path === 'fn') return;                    // function name: sin(, enthalpy(
            if (UserFunctions.active.has(child.name)) {
                throw new Error(`'${child.name}' is a user function; call it with parentheses or pick another variable name.`);
            }
            if (arrayBases.has(child.name)) return;
            if (RESERVED.has(child.name) || /^__iv\d+$/.test(child.name)) return;   // __iv: the dummy variable of an integral()
            if (ThermoEngine.propKeys[child.name.toLowerCase()] !== undefined) {
                throw new Error(`'${child.name}' is a property-function name; call it with parentheses or pick another variable name.`);
            }
            this.registerVariable(child.name);
            if (varSet) varSet.add(child.name);
        });
    }

    registerVariable(name) {
        if (!this.variables.has(name)) {
            const old = this.saved.get(name);
            const meta = {
                guess: old ? old.guess : 1.0,
                lower: old ? old.lower : -Infinity,
                upper: old ? old.upper : Infinity,
                value: null,
                unit: old ? old.unit : ''
            };
            this.variables.set(name, meta);
            this.saved.set(name, meta);   // the pane edits this object, so the store follows the edits
        }
    }
}

