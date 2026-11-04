// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// EES to SES: converts the text of an EES program into SES equations, with a report of what was changed and what to check.
// EESConvert.run(text, sys) -> { text, report: [{ line, kind: 'changed' | 'check' | 'unsupported', msg }] }.
// sys: the EES unit system, { T: 'C'|'K'|'F'|'R', P: 'kPa'|'Pa'|'bar'|'MPa'|'psia'|'atm', E: 'kJ'|'J'|'Btu', trig: 'deg'|'rad' };
// a $UnitSystem line in the text overrides it. The numbers of the EES program are in that system: SES works in SI, so plain
// numbers that are temperatures, pressures or energies get a unit tag, and property-call arguments are converted to SI.
class EESConvert {
    static DEFAULT = { T: 'C', P: 'kPa', E: 'kJ', trig: 'deg' };
    // EES property functions -> SES functions (real fluids through CoolProp)
    static PROP = { enthalpy: 'enthalpy', entropy: 'entropy', intenergy: 'internalenergy', volume: 'specificvolume', density: 'density',
        temperature: 'temperature', pressure: 'pressure', quality: 'quality', cp: 'specificheat', cv: 'specificheatv', viscosity: 'viscosity',
        conductivity: 'conductivity', prandtl: 'prandtl', soundspeed: 'soundspeed' };
    static SAT = { p_sat: ['saturationpressure', 'T'], t_sat: ['saturationtemperature', 'P'] };
    static CONSTPROP = { molarmass: 'molarmass', t_crit: 'criticaltemperature', p_crit: 'criticalpressure', t_triple: 'triplepointtemperature' };
    static KEY = { t: 'T', p: 'P', h: 'H', s: 'S', u: 'U', v: 'v', x: 'Q', d: 'D' };
    static HUMID = { enthalpy: 'H', entropy: 'S', humrat: 'W', relhum: 'R', dewpoint: 'D', wetbulb: 'B', volume: 'V', temperature: 'T' };
    static HKEY = { t: 'T', p: 'P', w: 'W', r: 'R', d: 'D', b: 'B', h: 'H' };
    static REAL = { water: 'water', steam: 'water', steam_iapws: 'water', steam_nbs: 'water', air_ha: 'air' };
    static IG = ['N2', 'O2', 'CO2', 'CO', 'H2', 'H2O', 'CH4', 'C2H6', 'C3H8', 'C4H10', 'C2H4', 'C2H2', 'NO', 'NO2', 'N2O', 'OH', 'Ar', 'He', 'NH3', 'SO2', 'H', 'O', 'N', 'C8H18', 'CH3OH', 'C2H5OH'];
    static CONST = { 'g#': "constant('g')", 'r#': "constant('R_u')", 'sigma#': "constant('sigma')", 'k#': "constant('k_B')", 'h#': "constant('h_planck')",
        'c#': "constant('c')", 'n#': "constant('N_A')", 'pi#': 'pi', 'pi': 'pi' };
    static FN = { ln: 'ln', log10: 'log10', log: 'log', exp: 'exp', sqrt: 'sqrt', abs: 'abs', min: 'min', max: 'max', sin: 'sin', cos: 'cos', tan: 'tan',
        arcsin: 'asin', arccos: 'acos', arctan: 'atan', asin: 'asin', acos: 'acos', atan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', round: 'round',
        trunc: 'fix', integral: 'integral', sum: 'sum', erf: 'erf', sign: 'sign' };
    static TRIG = ['sin', 'cos', 'tan'];
    static ATRIG = ['asin', 'acos', 'atan'];
    static RESERVED = ['e', 'i', 'Infinity', 'NaN', 'true', 'false'];

    // ---- units: an EES unit string -> a math.js one ('kJ/kg-K' -> 'kJ/(kg K)', 'C' -> 'degC')
    static UNIT = { c: 'degC', f: 'degF', r: 'degR', k: 'K', psia: 'psi', psi: 'psi', btu: 'BTU', hr: 'h', '%': '%', '-': '-' };
    static unit(u) {
        const t = u.trim();
        if (t === '' || t === '-') return t;
        const conv = (f) => { const k = f.trim(); return EESConvert.UNIT[k.toLowerCase()] && (k.length <= 4 || k.toLowerCase() === 'btu') ? EESConvert.UNIT[k.toLowerCase()] : k; };
        const side = (s) => { const fs = s.split(/[-*]/).filter(Boolean).map(conv); return fs.length > 1 ? fs.join(' ') : fs[0] || ''; };
        const [num, ...den] = t.split('/');
        if (!den.length) return side(num);
        const d = den.map(side), dd = d.length > 1 || /\s/.test(d[0]) ? `(${d.join(' ')})` : d[0];
        return `${side(num) || '1'}/${dd}`;
    }
    // display units of the EES unit system, by SI unit (as Check Units names them)
    static sysUnits(sys) {
        const eng = sys.E === 'Btu';
        const T = { C: 'degC', K: 'K', F: 'degF', R: 'degR' }[sys.T] || 'degC', P = { kPa: 'kPa', Pa: 'Pa', bar: 'bar', MPa: 'MPa', psia: 'psi', atm: 'atm' }[sys.P] || 'kPa';
        const e = eng ? 'BTU' : sys.E, m = eng ? 'lbm' : 'kg', dT = eng ? 'degR' : 'K';
        return { K: T, Pa: P, 'J/kg': `${e}/${m}`, 'J/(kg K)': `${e}/(${m} ${dT})`, J: e, W: eng ? 'BTU/h' : (e === 'kJ' ? 'kW' : 'W'), 'm^3/kg': eng ? 'ft^3/lbm' : 'm^3/kg', dT };
    }
    // a number in the EES system -> SI, for a property key (T, P, H, S, U, v)
    static toSI(x, key, sys) {
        const su = EESConvert.sysUnits(sys);
        const u = { T: su.K, P: su.Pa, H: su['J/kg'], U: su['J/kg'], S: su['J/(kg K)'], v: su['m^3/kg'], W: '', R: '', Q: '', D: su.K, B: su.K }[key];
        if (!u) return x;
        const c = UnitConv.coef(u);   // SI = a + b x, with the offset of degC and degF
        return c.a + c.b * x;
    }

    // ---- tokens: { t: 'num'|'id'|'str'|'op'|'sp', v }
    static lex(s) {
        const out = [], re = /(\s+)|(\d+(?:\.(?!\.)\d*)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*[$#]?)|('[^']*')|(\.\.|:=|<>|<=|>=|\*\*|[-+*/^(),=<>\[\]:;&|!])/y;
        let m, i = 0;
        while (i < s.length) {
            re.lastIndex = i; m = re.exec(s);
            if (!m) { out.push({ t: 'op', v: s[i] }); i++; continue; }
            i = re.lastIndex;
            if (m[1]) out.push({ t: 'sp', v: m[1] }); else if (m[2]) out.push({ t: 'num', v: m[2] }); else if (m[3]) out.push({ t: 'id', v: m[3] });
            else if (m[4]) out.push({ t: 'str', v: m[4] }); else out.push({ t: 'op', v: m[5] });
        }
        return out;
    }
    // split tokens at top-level commas (and the ':' of CALL / PROCEDURE lists when asked)
    static split(toks, colon) {
        const parts = [[]], seps = [];
        let d = 0;
        for (const k of toks) {
            if (k.v === '(' || k.v === '[') d++;
            if (k.v === ')' || k.v === ']') d--;
            if (d === 0 && (k.v === ',' || (colon && k.v === ':'))) { parts.push([]); seps.push(k.v); continue; }
            parts[parts.length - 1].push(k);
        }
        return { parts, seps };
    }
    static text(toks) { return toks.map(k => k.v).join('').trim(); }

    constructor(sys) { this.sys = Object.assign({}, EESConvert.DEFAULT, sys || {}); this.report = []; this.names = new Map(); this.line = 0; this.fns = new Set(); }
    note(kind, msg) { this.report.push({ line: this.line, kind, msg }); }
    name(v) {   // EES names are case-insensitive: the first spelling met is used everywhere
        const low = v.toLowerCase();
        if (!this.names.has(low)) {
            (this.first = this.first || new Map()).set(low, v);
            let n = v;
            if (EESConvert.RESERVED.includes(v)) { n = v + '_'; this.note('changed', `'${v}' is a constant in SES; renamed ${n}`); }
            this.names.set(low, n);
        } else if (this.first.get(low) !== v && !this.warnedCase?.has(low)) {
            (this.warnedCase = this.warnedCase || new Set()).add(low);
            this.note('changed', `'${v}' and '${this.names.get(low)}' are the same variable in EES; written ${this.names.get(low)}`);
        }
        return this.names.get(low);
    }

    // one expression (token list) -> SES text
    expr(toks) {
        const out = [];
        for (let i = 0; i < toks.length; i++) {
            const k = toks[i];
            if (k.t === 'op') {
                if (k.v === '<>') out.push('!='); else if (k.v === '..') out.push(':'); else if (k.v === '**') out.push('^'); else out.push(k.v);
                continue;
            }
            if (k.t === 'str') { out.push(k.v); continue; }
            if (k.t !== 'id') { out.push(k.v); continue; }
            const low = k.v.toLowerCase();
            let j = i + 1; while (toks[j] && toks[j].t === 'sp') j++;
            if (toks[j] && toks[j].v === '(') {   // a call: find its arguments
                let d = 0, e = j;
                for (; e < toks.length; e++) { if (toks[e].v === '(') d++; if (toks[e].v === ')' && --d === 0) break; }
                const args = EESConvert.split(toks.slice(j + 1, e)).parts;
                out.push(this.call(k.v, low, args));
                i = e; continue;
            }
            if (EESConvert.CONST[low]) { out.push(EESConvert.CONST[low]); if (low === 'pi#' || low === 'pi') this.note('changed', `${k.v} -> pi`); continue; }
            if (low.endsWith('#')) { this.note('unsupported', `the EES constant ${k.v} has no SES name; give its value`); out.push(k.v.slice(0, -1) + '_const'); continue; }
            if (['and', 'or', 'not'].includes(low)) { out.push(low); continue; }
            if (this.arrays.has(low) && !(toks[j] && toks[j].v === '[')) {   // EES: h and h[1] are different variables; SES: not
                const n = this.name(k.v) + '_';
                if (!(this.scalarNoted = this.scalarNoted || new Set()).has(low)) { this.scalarNoted.add(low); this.note('changed', `'${k.v}' is also the name of an array (${k.v}[...]); the single variable is renamed ${n}`); }
                out.push(n); continue;
            }
            out.push(this.name(k.v));
        }
        return out.join('');
    }
    // a function call
    call(orig, low, args) {
        const A = args.map(a => a.filter(t => t.t !== 'sp').length ? a : a), sys = this.sys;
        const plain = () => args.map(a => this.expr(a).trim());
        if (EESConvert.PROP[low] || EESConvert.HUMID[low] && args.length && /^airh2o$/i.test(EESConvert.text(args[0]))) return this.prop(orig, low, args);
        if (EESConvert.SAT[low]) {
            const [fn, key] = EESConvert.SAT[low], fl = this.fluid(args[0]), kv = this.keyArg(args[1], fl);
            return `${fn}(${fl.name}, ${kv.v})`;
        }
        if (EESConvert.CONSTPROP[low]) {
            const fl = this.fluid(args[0]);
            if (fl.kind === 'ig' && low === 'molarmass') return `ig_molarmass(${fl.name})`;
            return `${EESConvert.CONSTPROP[low]}(${fl.name})`;
        }
        if (low === 'if' && args.length === 5) {   // IF(A, B, X, Y, Z): X if A < B, Y if A = B, Z if A > B
            const [a, b, x, y, z] = plain();
            this.note('changed', `IF(A, B, X, Y, Z) written as nested if()`);
            return `if(${a} < ${b}, ${x}, if(${a} == ${b}, ${y}, ${z}))`;
        }
        if (low === 'integral' && args.length >= 4) {
            const p = plain();
            if (args.length > 4) this.note('changed', 'the step size of Integral() is dropped: SES integrates adaptively');
            return `integral(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]})`;
        }
        if (low === 'sum' && args.length === 2) {   // Sum(x[i], i=1,N) -> sum(x[1:N]) for the simple case
            const body = EESConvert.text(args[0]), m = /^([A-Za-z_]\w*)\[\s*([A-Za-z_]\w*)\s*\]$/.exec(body), r = EESConvert.text(args[1]).match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
            if (m && r && m[2].toLowerCase() === r[1].toLowerCase()) return `sum(${this.name(m[1])}[${this.expr(EESConvert.lex(r[2])).replace(',', ':')}])`;
        }
        if (low === 'sum' && args.length === 3) {
            const body = EESConvert.text(args[0]), m = /^([A-Za-z_]\w*)\[\s*([A-Za-z_]\w*)\s*\]$/.exec(body), r = EESConvert.text(args[1]).match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
            if (m && r && m[2].toLowerCase() === r[1].toLowerCase()) return `sum(${this.name(m[1])}[${this.expr(EESConvert.lex(r[2]))}:${this.expr(args[2]).trim()}])`;
            this.note('unsupported', `Sum(...) with a general term: write it with sum() over an array`);
        }
        if (EESConvert.FN[low]) {
            const fn = EESConvert.FN[low], p = plain();
            if (EESConvert.TRIG.includes(fn) && this.sys.trig === 'deg') { this.note('changed', `${orig}(): EES works in degrees here; SES in radians, so the angle is multiplied by pi/180`); return `${fn}((${p.join(', ')})*pi/180)`; }
            if (EESConvert.ATRIG.includes(fn) && this.sys.trig === 'deg') { this.note('changed', `${orig}(): the result is converted from radians to degrees`); return `(${fn}(${p.join(', ')})*180/pi)`; }
            return `${fn}(${p.join(', ')})`;
        }
        if (this.fns.has(low)) return `${this.name(orig)}(${plain().join(', ')})`;
        this.note('check', `${orig}(): not an EES function this converter knows; kept as written`);
        return `${this.name(orig)}(${plain().join(', ')})`;
    }
    // the fluid argument: { name (SES text), kind: 'real' | 'ig' | 'air' | 'humid' }
    fluid(a) {
        const t = EESConvert.text(a || []), low = t.toLowerCase().replace(/^'|'$/g, '');
        if (/\$$/.test(t)) { this.note('check', `the fluid comes from the string variable ${t}: SES reads it as a CoolProp fluid name`); return { name: this.name(t), kind: 'real' }; }
        if (low === 'airh2o') return { name: '', kind: 'humid' };
        if (low === 'air') return { name: "'air'", kind: 'air' };
        const ig = EESConvert.IG.find(g => g.toLowerCase() === low);
        if (ig) return { name: `'${ig}'`, kind: 'ig' };
        const real = EESConvert.REAL[low];
        return { name: `'${real || t.replace(/^'|'$/g, '')}'`, kind: 'real' };
    }
    // a key=value argument: { key (SES key), v (SES text, in SI) }
    keyArg(a, fl) {
        const t = (a || []).filter(k => k.t !== 'sp'), eq = t.findIndex(k => k.v === '=');
        if (eq < 1) { this.note('unsupported', `property argument '${EESConvert.text(a || [])}' is not of the form key=value`); return { key: '?', v: this.expr(a || []) }; }
        const kl = t[0].v.toLowerCase(), key = fl && fl.kind === 'humid' ? EESConvert.HKEY[kl] : EESConvert.KEY[kl];
        if (!key) this.note('unsupported', `property key '${t[0].v}' is not known to the converter`);
        const vt = t.slice(eq + 1);
        if (vt.length === 1 && vt[0].t === 'num' || vt.length === 2 && vt[0].v === '-' && vt[1].t === 'num') {   // a plain number: to SI
            const x = Number(vt.map(k => k.v).join('')), si = EESConvert.toSI(x, key, this.sys);
            if (si !== x) this.note('changed', `${t[0].v}=${x} converted to SI: ${+si.toPrecision(12)}`);
            return { key, v: String(+si.toPrecision(12)) };
        }
        return { key, v: this.expr(a.slice(a.findIndex(k => k.v === '=') + 1)).trim() };
    }
    prop(orig, low, args) {
        const fl = this.fluid(args[0]), kv = args.slice(1).map(a => this.keyArg(a, fl));
        const pairs = kv.map(k => `'${k.key}', ${k.v}`).join(', ');
        if (fl.kind === 'humid') {
            const out = EESConvert.HUMID[low];
            if (!out) { this.note('unsupported', `${orig}(AirH2O, ...) has no SES equivalent`); return `${low}(${pairs})`; }
            return `humidair('${out}', ${pairs})`;
        }
        const fn = EESConvert.PROP[low];
        if (fl.kind === 'ig') {   // ideal gas (EES formula names): per kg, from the molar NASA functions
            const T = kv.find(k => k.key === 'T'), P = kv.find(k => k.key === 'P'), M = `ig_molarmass(${fl.name})`;
            const per = (f, ...x) => `${f}(${fl.name}, ${x.join(', ')})/${M}`;
            if (T && low === 'enthalpy') return per('ig_enthalpy', T.v);
            if (T && low === 'intenergy') return per('ig_internalenergy', T.v);
            if (T && low === 'cp') return per('ig_cp', T.v);
            if (T && low === 'cv') return `(${per('ig_cp', T.v)} - constant('R_u')/${M})`;
            if (T && low === 'entropy') return P ? per('ig_entropy', T.v, P.v) : per('ig_entropy', T.v);
            if (T && P && low === 'volume') return `constant('R_u')*${T.v}/(${P.v}*${M})`;
            if (T && P && low === 'density') return `${P.v}*${M}/(constant('R_u')*${T.v})`;
            this.note('unsupported', `${orig}(${EESConvert.text(args[0])}, ...) for an ideal gas with these inputs has no direct SES function (only h, u, s, cp, cv, v and density from T, and P)`);
            return `${fn}(${fl.name}, ${pairs})`;
        }
        if (fl.kind === 'air') {   // EES Air is an ideal gas; SES uses CoolProp's real air, at 1 atm when no pressure is given
            if (!this.airNoted) { this.airNoted = true; this.note('check', "EES 'Air' (ideal gas) is written as CoolProp's real air: differences of h and s agree with EES within about 0.1 % at moderate pressure, but their zero points differ, so compare differences, not absolute values"); }
            if (!kv.some(k => k.key === 'P')) return `${fn}('air', ${pairs}, 'P', 101325)`;
        }
        return `${fn}(${fl.name}, ${pairs})`;
    }

    // ---- the whole program
    static run(text, sys) {
        const c = new EESConvert(sys);
        return c.program(text);
    }
    program(text) {
        // comments: {...} (may span lines) kept as {...}; "..." becomes {...}; // stays
        let src = text.replace(/\r\n?/g, '\n').replace(/"([^"\n]*)"/g, (m, x) => `{${x.replace(/[{}]/g, '')}}`);
        // the unit system
        const us = src.match(/^\s*\$UnitSystem\s+(.*)$/im);
        if (us) {
            const w = us[1].toUpperCase().split(/\s+/);
            if (w.includes('ENG')) Object.assign(this.sys, { T: 'F', P: 'psia', E: 'Btu' });
            if (w.includes('SI')) Object.assign(this.sys, { E: 'kJ' });
            for (const x of w) {
                if (['C', 'K', 'F', 'R'].includes(x)) this.sys.T = x;
                if (['KPA', 'PA', 'BAR', 'MPA', 'PSIA', 'ATM'].includes(x)) this.sys.P = { KPA: 'kPa', PA: 'Pa', BAR: 'bar', MPA: 'MPa', PSIA: 'psia', ATM: 'atm' }[x];
                if (x === 'J') this.sys.E = 'J'; if (x === 'KJ') this.sys.E = 'kJ'; if (x === 'DEG') this.sys.trig = 'deg'; if (x === 'RAD') this.sys.trig = 'rad';
                if (x === 'MOLAR') this.note('unsupported', '$UnitSystem MOLAR: the converter assumes a mass basis; molar property values will be wrong');
            }
        }
        // names of the user's functions and procedures (to keep calls to them)
        for (const m of src.matchAll(/^\s*(?:function|procedure)\s+([A-Za-z_]\w*)/gim)) this.fns.add(m[1].toLowerCase());
        this.arrays = new Set([...src.matchAll(/([A-Za-z_]\w*)\s*\[/g)].map(m => m[1].toLowerCase()));   // names used as arrays
        const lines = src.split('\n'), out = [];
        let block = [];   // open blocks: 'function' | 'procedure' | 'duplicate' | 'if' | 'repeat'
        let fnName = null, inComment = false;
        for (let n = 0; n < lines.length; n++) {
            this.line = n + 1;
            let raw = lines[n];
            // keep comment text as it is; convert only the code part
            let code = raw, tail = '';
            if (inComment) { const e = raw.indexOf('}'); if (e < 0) { out.push(raw); continue; } tail = ''; out.push(raw); inComment = false; continue; }
            const ob = code.lastIndexOf('{'), cb = code.lastIndexOf('}');
            if (ob >= 0 && cb < ob) { inComment = true; tail = code.slice(ob); code = code.slice(0, ob); }
            const cm = code.match(/\/\/.*$/); if (cm) { tail = cm[0] + tail; code = code.slice(0, cm.index); }
            code = code.replace(/\{[^}]*\}/g, (m) => { tail = m + ' ' + tail; return ''; });
            const t = code.trim(), ind = raw.match(/^\s*/)[0];
            const put = (s) => out.push((s ? ind + s : '') + (tail ? (s ? ' ' : ind) + tail.trim() : ''));
            if (!t) { put(''); continue; }
            if (/^\$/.test(t)) { if (!/^\$UnitSystem/i.test(t)) this.note('changed', `directive ${t.split(/\s/)[0]} dropped`); put(''); continue; }
            let m;
            if ((m = t.match(/^function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*$/i))) {
                fnName = m[1]; block.push('function');
                const a = m[2].split(',').map(s => this.name(s.trim())).join(', ');
                put(`function ${m[1]}_out = ${m[1]}(${a})`); continue;
            }
            if ((m = t.match(/^procedure\s+([A-Za-z_]\w*)\s*\(([^:)]*):([^)]*)\)\s*$/i))) {
                block.push('procedure'); fnName = null;
                const ins = m[2].split(',').map(s => this.name(s.trim())).join(', '), outs = m[3].split(',').map(s => this.name(s.trim())).join(', ');
                put(`function [${outs}] = ${m[1]}(${ins})`); continue;
            }
            if (/^(module|subprogram)\b/i.test(t)) { this.note('unsupported', `${t.split(/\s/)[0].toUpperCase()} has no SES equivalent: rewrite it as a function, or inline its equations`); block.push('module'); put(`// ${t}`); continue; }
            if ((m = t.match(/^duplicate\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*,\s*(.+)$/i))) {
                block.push('duplicate'); put(`duplicate ${this.name(m[1])} = ${this.expr(EESConvert.lex(m[2])).trim()} : ${this.expr(EESConvert.lex(m[3])).trim()}`); continue;
            }
            if (/^end\b/i.test(t) && !/^endif/i.test(t)) {
                const b = block.pop();
                if (b === 'module') { put(`// ${t}`); continue; }
                if (b === 'function' || b === 'procedure') fnName = null;
                put('end'); continue;
            }
            if (/^call\s+/i.test(t)) {
                m = t.match(/^call\s+([A-Za-z_]\w*)\s*\((.*)\)\s*$/i);
                if (!m) { this.note('unsupported', `CALL not understood: ${t}`); put(`// ${t}`); continue; }
                const sp = EESConvert.split(EESConvert.lex(m[2]), true), ci = sp.seps.indexOf(':');
                const ins = sp.parts.slice(0, ci + 1).map(p => this.expr(p).trim()), outs = sp.parts.slice(ci + 1).map(p => this.expr(p).trim());
                put(`[${outs.join(', ')}] = ${m[1]}(${ins.join(', ')})`); continue;
            }
            const inFn = block.includes('function') || block.includes('procedure');
            if (inFn) { this.stmt(t, fnName).forEach(s => put(s)); continue; }
            // an equation, maybe with a unit at the end
            put(this.equation(t));
        }
        return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), report: this.report, sys: this.sys };
    }
    // a statement inside a function or procedure (run in order in SES too)
    stmt(t, fnName) {
        let m;
        const cond = (c) => this.expr(EESConvert.lex(c)).replace(/([^=<>!])=([^=])/g, '$1==$2').trim();
        if ((m = t.match(/^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$/i)) && !/^\s*$/.test(m[2]) && !/\bthen\s*$/i.test(t)) {   // one-line IF
            const r = [`if ${cond(m[1])}`, '  ' + this.assign(m[2], fnName)];
            if (m[3]) r.push('else', '  ' + this.assign(m[3], fnName));
            r.push('end'); return r;
        }
        if ((m = t.match(/^if\s+(.+?)\s+then\s*$/i))) return [`if ${cond(m[1])}`];
        if ((m = t.match(/^else\s*if\s+(.+?)\s+then\s*$/i))) return [`elseif ${cond(m[1])}`];
        if (/^else\s*$/i.test(t)) return ['else'];
        if (/^endif\s*$/i.test(t) || /^end\s*if\s*$/i.test(t)) return ['end'];
        if (/^repeat\s*$/i.test(t)) return ['while true'];
        if ((m = t.match(/^until\s*\((.*)\)\s*$/i) || t.match(/^until\s+(.*)$/i))) return [`  if ${cond(m[1])}`, '    break', '  end', 'end'];
        if (/^goto\b|^\d+\s*:/i.test(t)) { this.note('unsupported', 'GOTO and labels have no SES equivalent: use while or if'); return [`// ${t}`]; }
        return [this.assign(t, fnName)];
    }
    assign(t, fnName) {
        const m = t.match(/^(.+?)\s*:=\s*(.+)$/);
        if (!m) { this.note('check', `inside a function, expected an assignment with := : ${t}`); return this.expr(EESConvert.lex(t)); }
        let lhs = this.expr(EESConvert.lex(m[1])).trim();
        if (fnName && lhs.toLowerCase() === fnName.toLowerCase()) lhs = `${fnName}_out`;
        return `${lhs} = ${this.expr(EESConvert.lex(m[2])).trim()}`;
    }
    equation(t) {
        let unit = '', body = t;
        const um = body.match(/\[([^\]]*)\]\s*;?\s*$/);
        if (um && !/[A-Za-z_]\w*\s*\[[^\]]*\]\s*;?\s*$/.test(body)) { unit = EESConvert.unit(um[1]); body = body.slice(0, um.index).trim(); }
        // numbers with units inside an expression: 5 [kJ/kg] + ...
        if (/\d\s*\[[^\]]+\]/.test(body)) this.note('check', 'a unit inside the expression is dropped: SES takes a unit only at the end of the line; put that number on a line of its own');
        body = body.replace(/(\d)\s*\[[^\]]+\]/g, '$1');
        const s = this.expr(EESConvert.lex(body)).trim().replace(/;$/, '');
        return unit ? `${s} [${unit}]` : s;
    }

    // ---- after the text is converted: units by Check Units (inference), for plain numbers and property results.
    // Needs EESParser and UnitConsistencyChecker (the SES engine). Lines 'x = number' whose x has a temperature, pressure or
    // energy unit get the EES unit-system tag; 'x = property call' lines get it as display unit. Returns the new text.
    static units(res) {
        const su = EESConvert.sysUnits(res.sys);
        let p;
        try { p = new EESParser(); p.parse(res.text); UnitConsistencyChecker.run(p.parsedASTs, p.variables); }
        catch (e) { res.report.push({ line: 0, kind: 'check', msg: `the converted equations do not parse yet, so no units were added: ${e.message}` }); return res.text; }
        const unitOf = (n) => { const m = p.variables.get(n); return m ? (m.unit || m.inferredUnit || '') : ''; };
        const lines = res.text.split('\n');
        const inside = lines.map(() => false);   // lines inside function blocks: statements, not equations
        let d = 0; lines.forEach((l, i) => { if (/^\s*function\b/.test(l)) d++; else if (d && /^\s*end\b/.test(l)) { const o = lines.slice(0, i).filter(x => /^\s*(function|if|for|while)\b/.test(x)).length - lines.slice(0, i).filter(x => /^\s*end\b/.test(x)).length; if (o <= 1) d = 0; } inside[i] = d > 0; });
        const depth = (i) => inside[i];
        lines.forEach((l, i) => {
            if (/^\s*(function|duplicate|end|if|else|elseif|for|while|break|return)\b/.test(l) || depth(i)) return;
            const m = l.match(/^(\s*)([A-Za-z_]\w*(?:\[[^\]]*\])?)\s*=\s*(-?\d+\.?\d*(?:[eE][-+]?\d+)?)\s*((?:\{.*\}|\/\/.*)?)$/);
            let m2 = !m && l.match(/^(\s*)([A-Za-z_]\w*(?:\[[^\]]*\])?)\s*=\s*([^{]*?\S)\s*((?:\{.*\}|\/\/.*)?)$/);
            if (m2 && (/\s\[[^\]]*\]$/.test(m2[3]) || /\/\//.test(m2[3]))) m2 = null;   // it has a unit already
            const mm = m || m2;
            if (!mm) return;
            const v = mm[2].replace(/\s+/g, ''), si = unitOf(v);
            if (m && (!si || si === '-') && /^[TP]/.test(v)) res.report.push({ line: i + 1, kind: 'check', msg: `${v} = ${m[3]}: no unit could be worked out (it is not used with a property); if it is a temperature or pressure, add its unit, as [${su.K}] or [${su.Pa}]` });
            let u = su[si];
            if (!u || u === si && si !== 'K') return;
            if (si === 'K' && /^(d|delta|dt_|dt$)/i.test(v) && m) { u = su.dT; }
            if (si === 'K' && u === 'K') return;
            if (m && si === 'K' && u !== su.dT) res.report.push({ line: i + 1, kind: 'check', msg: `${v} = ${m[3]} is read as a temperature in ${u}; if it is a temperature difference, change the unit to [${su.dT}]` });
            if (m) res.report.push({ line: i + 1, kind: 'changed', msg: `${v} = ${m[3]}: a plain number taken in the EES unit system, so tagged [${u}]` });
            lines[i] = `${mm[1]}${mm[2]} = ${mm[3]} [${u}]${mm[4] ? ' ' + mm[4] : ''}`;
        });
        // numbers added to quantities whose EES unit is not SI (kJ/kg read as J/kg)
        p.parsedASTs.forEach(eq => {
            [eq.leftAST, eq.rightAST].forEach(ast => ast.traverse(node => {
                if (!(node.isOperatorNode && (node.op === '+' || node.op === '-') && node.args.length === 2)) return;
                const [a, b] = node.args, num = a.isConstantNode && typeof a.value === 'number' ? a : b.isConstantNode && typeof b.value === 'number' ? b : null;
                if (!num || num.value === 0) return;
                const other = num === a ? b : a, syms = other.isSymbolNode ? [other.name] : [];   // a number added to a variable alone
                const scaled = syms.map(unitOf).find(u => ['J/kg', 'J/(kg K)', 'Pa', 'J', 'W'].includes(u) && su[u] !== u);
                if (scaled) res.report.push({ line: eq.lineNo, kind: 'check', msg: `the number ${num.value} is added to a quantity in ${su[scaled]} (EES), but SES reads it in ${scaled}: put it on a line of its own with its unit` });
                if (syms.map(unitOf).includes('K') && [273, 273.15, 459.67, 460].includes(Math.abs(num.value))) res.report.push({ line: eq.lineNo, kind: 'check', msg: `${num.value} converts a temperature scale; SES temperatures are already absolute (K), so this term is probably not needed` });
            }));
        });
        return lines.join('\n');
    }
}
