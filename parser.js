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
    }

    parse(text) {
        this.rawEquations = [];
        this.parsedASTs = [];
        this.odeCalls = [];
        this.previousVariables = this.variables;
        this.variables = new Map();

        // Comments are blanked but keep their line breaks, so messages can give line numbers
        let cleanText = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*|\{[^}]*\}/g, (c) => c.replace(/[^\n]/g, ' '));
        if (cleanText.includes('/*')) throw new Error("A '/*' comment is never closed with '*/'.");
        const srcLines = cleanText.split('\n');
        const odeBlocks = OdeBlocks.extract(srcLines);          // lifts out the ode ... end blocks
        const userFuncs = UserFunctions.extract(srcLines);      // lifts out the function ... end blocks
        // String variables:  fluid$ = 'R134a'  (substituted as text wherever fluid$ appears)
        const strVars = {};
        cleanText = srcLines.map(l => {
            const m = l.trim().match(/^([A-Za-z_]\w*)\$\s*=\s*(['"])([^'"]*)\2$/);
            if (m) { strVars[m[1]] = m[3]; return ''; }
            return l;
        }).join('\n');
        UserFunctions.activate(userFuncs, strVars);
        OdeBlocks.activate(odeBlocks, strVars);
        cleanText = cleanText.replace(/([A-Za-z_]\w*)\$/g, (all, name) => {
            if (!(name in strVars)) throw new Error(`String variable '${name}$' is not defined. Define it first, e.g. ${name}$ = 'water'`);
            return "'" + strVars[name] + "'";
        });
        const lines = cleanText.split('\n').map((l, i) => [l.trim(), i + 1]).filter(([l]) => l.length > 0);

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
            const unitMatch = line.match(/[^\s=+\-*\/^(,;]\s+\[((?:[a-zA-Z]|1\/)[a-zA-Z0-9_\/\^\*\s\.\-\(\)]*|-)\]\s*$/);
            if (unitMatch) {
                inlineUnit = unitMatch[1].trim();
                line = line.slice(0, unitMatch.index + 1).trim();
            }

            const eqAt = EESParser.equalsAt(line);
            if (eqAt.length === 0) throw new Error(`Line ${lineNo}: missing '=' sign in '${line}'.`);
            if (eqAt.length > 1) throw new Error(`Line ${lineNo}: more than one '=' in '${line}' (write comparisons as ==, <=, >=, !=).`);
            const parts = [line.slice(0, eqAt[0]), line.slice(eqAt[0] + 1)];

            try {
                const leftAST = UserFunctions.lowerIf(math.parse(parts[0].trim()));
                let rightAST = UserFunctions.lowerIf(math.parse(parts[1].trim()));
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
                                throw new Error(`Unit '${inlineUnit}' is not recognized by math.js (use e.g. kPa, kJ/(kg K), W/(m^2 K), degC; no hyphens).`);
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
        return { equationsCount: this.rawEquations.length, variables: Array.from(this.variables.keys()) };
    }

    // An ode block gives one equation per state:  T = ode#k:T(inputs...), the value of T at the end
    addOdeBlock(blk) {
        try {
            const inputs = blk.inputs.map(nm => math.parse(nm));
            blk.states.forEach(s => {
                const leftAST = math.parse(s);
                const rightAST = new math.FunctionNode(new math.SymbolNode(blk.fname(s)), inputs);
                const eqVars = new Set();
                this.extractVariablesFromAST(leftAST, eqVars);
                this.extractVariablesFromAST(rightAST, eqVars);
                this.rawEquations.push({ leftStr: s, rightStr: rightAST.toString(), lineRaw: blk.header });
                this.parsedASTs.push({ leftAST, rightAST, vars: Array.from(eqVars), lineRaw: blk.header, lineNo: blk.no });
            });
        } catch (err) { throw new Error(`Line ${blk.no} ('${blk.header}'): ${err.message}`); }
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
            const call = UserFunctions.lowerIf(math.parse(`${m[2]}(${m[3]})`));
            names.forEach((n, k) => {
                if (!/^[A-Za-z_]\w*(\[\d+\])?$/.test(n)) throw new Error(`'${n}' is not a variable name`);
                const leftAST = math.parse(n);
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
            if (RESERVED.has(child.name)) return;
            if (ThermoEngine.propKeys[child.name.toLowerCase()] !== undefined) {
                throw new Error(`'${child.name}' is a property-function name; call it with parentheses or pick another variable name.`);
            }
            this.registerVariable(child.name);
            if (varSet) varSet.add(child.name);
        });
    }

    registerVariable(name) {
        if (!this.variables.has(name)) {
            const old = this.previousVariables && this.previousVariables.get(name);
            this.variables.set(name, {
                guess: old ? old.guess : 1.0,
                lower: old ? old.lower : -Infinity,
                upper: old ? old.upper : Infinity,
                value: null,
                unit: old ? old.unit : ''
            });
        }
    }
}

