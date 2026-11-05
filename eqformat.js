// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Formatted equations: the equations shown as MathML, for reading, and copied as LaTeX, for Word and other editors. Display only: the solver
// never sees this. Names: T_1 -> T with subscript 1, T_1_2 -> subscripts 1,2, m_dot -> m with a dot over it, _bar, _hat,
// _star, Greek names (eta, Delta_T, DELTAP). integral(f, x, a, b) is shown with the integral sign. Inside an ode block,
// y' = f is shown as dy/dt = f, y(0) = v and the helpers as equations; the header, the end and any nested block stay as text,
// as do function and duplicate blocks.

const EqFormat = (() => {
    const NS = 'http://www.w3.org/1998/Math/MathML';
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ',
        lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
        Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
    const greek = (s) => GREEK[s] || (s.length > 2 && s === s.toUpperCase() && GREEK[s[0] + s.slice(1).toLowerCase()]) || null;   // DELTA, OMEGA
    const MARK = { dot: '˙', bar: '¯', hat: '^' };
    const tok = (s, upright) => /^\d+(\.\d+)?$/.test(s) ? `<mn>${s}</mn>` : `<mi${upright || [...s].length > 1 ? ' mathvariant="normal"' : ''}>${esc(s)}</mi>`;

    // A variable name: base, subscripts (joined by commas), and the marks dot, bar, hat, star
    function ident(name) {
        let parts = name.split('_').filter(p => p !== '');
        if (!parts.length) return tok(name);
        let base = parts.shift();
        const marks = [];
        parts = parts.filter(p => { if (p in MARK || p === 'star') { marks.push(p); return false; } return true; });
        let pre = '';
        const d = base.match(/^(Delta|DELTA)(.*)$/);
        if (d && d[2]) { pre = 'Δ'; base = d[2]; }                             // DeltaT, DELTAP
        else if (d && parts.length) { pre = 'Δ'; base = parts.shift(); }        // Delta_T
        const g = greek(base);
        let m = pre ? `<mrow><mi mathvariant="normal">Δ</mi>${g ? `<mi>${g}</mi>` : tok(base)}</mrow>` : g ? `<mi>${g}</mi>` : tok(base);
        for (const k of marks) if (k !== 'star') m = `<mover accent="true">${m}<mo>${MARK[k]}</mo></mover>`;
        const sub = parts.length ? `<mrow>${parts.map(p => greek(p) ? `<mi>${greek(p)}</mi>` : tok(p, true)).join('<mo>,</mo>')}</mrow>` : '';
        const star = marks.includes('star') ? '<mo>*</mo>' : '';
        if (sub && star) return `<msubsup>${m}${sub}${star}</msubsup>`;
        if (sub) return `<msub>${m}${sub}</msub>`;
        if (star) return `<msup>${m}${star}</msup>`;
        return m;
    }

    const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4 };
    const strip = (n) => { while (n && n.isParenthesisNode) n = n.content; return n; };   // the layout itself groups fractions, exponents and roots
    const INF = (n) => {   // 1 for Infinity, -1 for -Infinity, else 0 (limits of an integral)
        n = strip(n);
        const isInf = (x) => x && ((x.isSymbolNode && x.name === 'Infinity') || (x.isConstantNode && x.value === Infinity));
        return isInf(n) ? 1 : n.isOperatorNode && n.fn === 'unaryMinus' && isInf(strip(n.args[0])) ? -1 : 0;
    };
    const num = (v) => {
        const x = Number(v), s = x !== 0 && (Math.abs(x) < 1e-4 || Math.abs(x) >= 1e7) ? x.toExponential() : String(v), m = s.match(/^(-?[\d.]+)e([+-]?\d+)$/i);
        return m ? `<mrow><mn>${m[1]}</mn><mo>·</mo><msup><mn>10</mn><mn>${+m[2]}</mn></msup></mrow>` : `<mn>${s}</mn>`;
    };
    const paren = (x) => `<mrow><mo>(</mo>${x}<mo>)</mo></mrow>`;
    const OPS = { '==': '=', '!=': '≠', '<=': '≤', '>=': '≥', '<': '&lt;', '>': '&gt;', and: 'and', or: 'or', xor: 'xor', '%': 'mod' };

    function ml(n) {
        if (n.isParenthesisNode) return paren(ml(n.content));
        if (n.isConstantNode) return typeof n.value === 'string' ? `<mtext>'${esc(n.value)}'</mtext>` : typeof n.value === 'boolean' ? `<mi mathvariant="normal">${n.value}</mi>` : num(n.value);
        if (n.isSymbolNode) return ident(n.name);
        if (n.isAccessorNode && n.object.isSymbolNode) return `<msub>${ident(n.object.name)}<mrow>${n.index.dimensions.map(ml).join('<mo>,</mo>')}</mrow></msub>`;
        if (n.isArrayNode) return `<mrow><mo>[</mo>${n.items.map(ml).join('<mo>,</mo>')}<mo>]</mo></mrow>`;
        if (n.isConditionalNode) return fn('if', [n.condition, n.trueExpr, n.falseExpr]);
        if (n.isFunctionNode && n.fn.isSymbolNode) {
            const a = n.args, f = n.fn.name;
            if (f === 'unitval' && a.length === 2) return `<mrow>${ml(a[0])}<mspace width="0.3em"/><mtext>[${esc(String(a[1].value))}]</mtext></mrow>`;
            if (f === 'sqrt' && a.length === 1) return `<msqrt>${ml(strip(a[0]))}</msqrt>`;
            if (f === 'abs' && a.length === 1) return `<mrow><mo>|</mo>${ml(strip(a[0]))}<mo>|</mo></mrow>`;
            if (f === 'integral' && a.length === 4 && strip(a[1]).isSymbolNode) {
                const g = strip(a[0]), body = g.isOperatorNode && g.args.length === 2 && PREC[g.op] === 1 ? paren(ml(g)) : ml(g);
                const lim = (x) => INF(x) ? (INF(x) < 0 ? '<mrow><mo>−</mo><mi mathvariant="normal">∞</mi></mrow>' : '<mi mathvariant="normal">∞</mi>') : ml(strip(x));
                return `<mrow><msubsup><mo>∫</mo>${lim(a[2])}${lim(a[3])}</msubsup>${body}<mspace width="0.17em"/><mi mathvariant="normal">d</mi>${ml(strip(a[1]))}</mrow>`;
            }
            return fn(f, a);
        }
        if (n.isOperatorNode) {
            const a = n.args, op = n.op;
            if (a.length === 1) {
                const x = a[0], inner = (x.isOperatorNode && x.args.length === 2 && PREC[x.op] < 2) ? paren(ml(x)) : ml(x);
                return op === 'not' ? `<mrow><mtext>not </mtext>${inner}</mrow>` : `<mrow><mo>${op === '-' ? '−' : esc(op)}</mo>${inner}</mrow>`;
            }
            if (op === '/') return `<mfrac>${ml(strip(a[0]))}${ml(strip(a[1]))}</mfrac>`;
            if (op === '^') {
                const b = a[0], base = (b.isOperatorNode || (b.isConstantNode && Number(b.value) < 0)) ? paren(ml(b)) : ml(b);
                return `<msup>${base}${ml(strip(a[1]))}</msup>`;
            }
            const side = (x, right) => {   // parentheses only where the precedence needs them (math.js keeps the ones written)
                const p = x.isOperatorNode && x.args.length === 2 ? PREC[x.op] : null;
                return (p !== null && p !== undefined && (p < PREC[op] || (right && p === PREC[op] && (op === '-' || op === '%')))) ? paren(ml(x)) : ml(x);
            };
            if (op === '*') {
                const l = side(a[0]), r = side(a[1], true);
                const implied = a[0].isConstantNode && !a[1].isConstantNode && !(a[1].isOperatorNode && a[1].args.length === 1);
                return `<mrow>${l}${implied ? '<mo>&#x2062;</mo>' : '<mo>·</mo>'}${r}</mrow>`;
            }
            const o = op === '-' ? '−' : OPS[op] || esc(op);
            return `<mrow>${side(a[0])}<mo>${o}</mo>${side(a[1], true)}</mrow>`;
        }
        throw new Error('not formatted');
    }
    const fn = (name, args) => `<mrow><mi mathvariant="normal">${esc(name)}</mi><mo>&#x2061;</mo><mrow><mo>(</mo>${args.map(x => ml(strip(x))).join('<mo>,</mo>')}<mo>)</mo></mrow></mrow>`;

    // The same in LaTeX, for Word (Insert > Equation, LaTeX mode) and other editors
    const GTEX = Object.fromEntries(Object.keys(GREEK).map(k => [k, '\\' + k]));
    const gtex = (s) => GTEX[s] || (s.length > 2 && s === s.toUpperCase() && GTEX[s[0] + s.slice(1).toLowerCase()]) || null;
    const ttok = (s) => /^\d+(\.\d+)?$/.test(s) || [...s].length === 1 ? s : `\\mathrm{${s}}`;
    function identTex(name) {
        let parts = name.split('_').filter(p => p !== '');
        if (!parts.length) return ttok(name);
        let base = parts.shift();
        const marks = [];
        parts = parts.filter(p => { if (p in MARK || p === 'star') { marks.push(p); return false; } return true; });
        let pre = '';
        const d = base.match(/^(Delta|DELTA)(.*)$/);
        if (d && d[2]) { pre = '\\Delta '; base = d[2]; } else if (d && parts.length) { pre = '\\Delta '; base = parts.shift(); }
        let m = gtex(base) ? gtex(base) + ' ' : ttok(base);
        for (const k of marks) if (k !== 'star') m = `\\${k}{${m.trim()}}`;
        m = pre + m.trim();
        const sub = parts.map(p => gtex(p) || (/^\d+$/.test(p) ? p : `\\mathrm{${p}}`)).join(',');
        return (pre || sub || marks.includes('star') ? `{${m}}` : m) + (sub ? `_{${sub}}` : '') + (marks.includes('star') ? '^{*}' : '');
    }
    const tnum = (v) => {
        const x = Number(v), s = x !== 0 && (Math.abs(x) < 1e-4 || Math.abs(x) >= 1e7) ? x.toExponential() : String(v), m = s.match(/^(-?[\d.]+)e([+-]?\d+)$/i);
        return m ? `${m[1]}\\cdot 10^{${+m[2]}}` : s;
    };
    const tparen = (x) => `\\left(${x}\\right)`;
    const TOPS = { '==': '=', '!=': '\\neq', '<=': '\\leq', '>=': '\\geq', '<': '<', '>': '>', and: '\\ \\mathrm{and}\\ ', or: '\\ \\mathrm{or}\\ ', xor: '\\ \\mathrm{xor}\\ ', '%': '\\bmod' };
    const tfn = (name, args) => `\\mathrm{${name}}${tparen(args.map(x => tex(strip(x))).join(', '))}`;
    function tex(n) {
        if (n.isParenthesisNode) return tparen(tex(n.content));
        if (n.isConstantNode) return typeof n.value === 'string' ? `\\mathrm{'${n.value}'}` : typeof n.value === 'boolean' ? `\\mathrm{${n.value}}` : tnum(n.value);
        if (n.isSymbolNode) return identTex(n.name);
        if (n.isAccessorNode && n.object.isSymbolNode) return `{${identTex(n.object.name)}}_{${n.index.dimensions.map(tex).join(',')}}`;
        if (n.isArrayNode) return `\\left[${n.items.map(tex).join(', ')}\\right]`;
        if (n.isConditionalNode) return tfn('if', [n.condition, n.trueExpr, n.falseExpr]);
        if (n.isFunctionNode && n.fn.isSymbolNode) {
            const a = n.args, f = n.fn.name;
            if (f === 'unitval' && a.length === 2) return `${tex(a[0])}\\,\\left[\\mathrm{${String(a[1].value).replace(/\s+/g, '\\ ')}}\\right]`;
            if (f === 'sqrt' && a.length === 1) return `\\sqrt{${tex(strip(a[0]))}}`;
            if (f === 'abs' && a.length === 1) return `\\left|${tex(strip(a[0]))}\\right|`;
            if (f === 'integral' && a.length === 4 && strip(a[1]).isSymbolNode) {
                const g = strip(a[0]), body = g.isOperatorNode && g.args.length === 2 && PREC[g.op] === 1 ? tparen(tex(g)) : tex(g);
                const lim = (x) => INF(x) ? (INF(x) < 0 ? '-\\infty' : '\\infty') : tex(strip(x));
                return `\\int_{${lim(a[2])}}^{${lim(a[3])}} ${body} \\,\\mathrm{d}${tex(strip(a[1]))}`;
            }
            return tfn(f, a);
        }
        if (n.isOperatorNode) {
            const a = n.args, op = n.op;
            if (a.length === 1) {
                const x = a[0], inner = (x.isOperatorNode && x.args.length === 2 && PREC[x.op] < 2) ? tparen(tex(x)) : tex(x);
                return op === 'not' ? `\\mathrm{not}\\ ${inner}` : `${op}${inner}`;
            }
            if (op === '/') return `\\frac{${tex(strip(a[0]))}}{${tex(strip(a[1]))}}`;
            if (op === '^') {
                const b = a[0], base = (b.isOperatorNode || (b.isConstantNode && Number(b.value) < 0)) ? tparen(tex(b)) : tex(b);
                return `{${base}}^{${tex(strip(a[1]))}}`;
            }
            const side = (x, right) => {
                const p = x.isOperatorNode && x.args.length === 2 ? PREC[x.op] : null;
                return (p !== null && p !== undefined && (p < PREC[op] || (right && p === PREC[op] && (op === '-' || op === '%')))) ? tparen(tex(x)) : tex(x);
            };
            if (op === '*') {
                const implied = a[0].isConstantNode && !a[1].isConstantNode && !(a[1].isOperatorNode && a[1].args.length === 1);
                return `${side(a[0])}${implied ? ' ' : ' \\cdot '}${side(a[1], true)}`;
            }
            return `${side(a[0])} ${TOPS[op] || op} ${side(a[1], true)}`;
        }
        throw new Error('not formatted');
    }

    // One equation (text, without comments) -> { math: a <math> element, tex: LaTeX }, or null if it cannot be formatted.
    // indep: the independent variable of the ode block the line is in (the same line forms as OdeBlocks.compile)
    const ODE_NAME = '([A-Za-z_]\\w*(?:\\[[^\\]]*\\])?)';
    const ODE_D = new RegExp(`^${ODE_NAME}\\s*'\\s*=\\s*(.+)$`), ODE_I = new RegExp(`^${ODE_NAME}\\s*\\((.+)\\)\\s*=\\s*(.+)$`);
    // [t, y] = ode45(@(a, b) f, [t0, t1], y0)  ->  dy/dt = f (a, b written as t, y),   y(t0) = y0,   t0 <= t <= t1
    const ODE45 = /^\[\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\]\s*=\s*ode45\s*\(\s*@\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\)(.*)\)\s*$/s;
    function ode45(text) {
        const m = text.match(ODE45);
        if (!m) return null;
        const parts = [];   // the rest split at the commas outside brackets: body, [t0, t1], y0
        let depth = 0, cur = '';
        for (const c of m[5]) { if ('([{'.includes(c)) depth++; if (')]}'.includes(c)) depth--; if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c; }
        parts.push(cur);
        if (parts.length < 3) return null;
        try {
            const tv = math.parse(m[1]), yv = math.parse(m[2]), ren = { [m[3]]: m[1], [m[4]]: m[2] };
            const f = math.parse(parts.slice(0, -2).join(',')).transform(n => (n.isSymbolNode && ren[n.name] && n.name !== ren[n.name]) ? new math.SymbolNode(ren[n.name]) : n);
            const span = strip(math.parse(parts[parts.length - 2])), y0 = math.parse(parts[parts.length - 1]);
            if (!span.isArrayNode || span.items.length !== 2) return null;
            const [t0, t1] = span.items, gap = '<mspace width="2em"/>', le = '<mo>≤</mo>';
            return {
                math: `<math xmlns="${NS}" displaystyle="true"><mrow><mfrac><mrow><mi mathvariant="normal">d</mi>${ml(yv)}</mrow><mrow><mi mathvariant="normal">d</mi>${ml(tv)}</mrow></mfrac><mo>=</mo>${ml(f)}${gap}` +
                    `<mrow>${ml(yv)}${paren(ml(strip(t0)))}</mrow><mo>=</mo>${ml(y0)}${gap}${ml(t0)}${le}${ml(tv)}${le}${ml(t1)}</mrow></math>`,
                tex: `\\frac{\\mathrm{d}${tex(yv)}}{\\mathrm{d}${tex(tv)}} = ${tex(f)},\\qquad ${tex(yv)}${tparen(tex(strip(t0)))} = ${tex(y0)},\\qquad ${tex(t0)} \\leq ${tex(tv)} \\leq ${tex(t1)}`,
            };
        } catch (e) { return null; }
    }
    function equation(line, indep) {
        if (!indep) { const o = ode45(line.trim()); if (o) return o; }
        let text = line.trim(), unit = '';
        // numbers with their own unit inside the line: shown as written (the unit at the end of the line stays the line's unit)
        const inner = (t) => t.replace(/(?<![\w.$])(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)\s*\[([^\]\[]+)\](?!\s*$)/g, (all, num, u) => `unitval(${num}, '${u.trim()}')`);
        const unc = indep ? null : EESParser.splitUncertainty(text);   // T = 300 [K] +- 2  ->  T = 300 ± 2 [K]
        if (unc) text = unc.head;
        const u = text.match(/[^\s=+\-*\/^(,;]\s+\[((?:[a-zA-Z$€£¥]|1\/)[a-zA-Z0-9_$€£¥\/\^\*\s\.\-\(\)]*|-)\]\s*$/);
        if (u) { unit = u[1].trim(); text = text.slice(0, u.index + 1).trim(); }
        text = inner(text);
        try {
            let Lm, Lt, R, m;
            if (indep && (m = text.match(ODE_D))) {                // y' = f  ->  dy/dt = f
                const y = math.parse(m[1]);
                Lm = `<mfrac><mrow><mi mathvariant="normal">d</mi>${ml(y)}</mrow><mrow><mi mathvariant="normal">d</mi>${ident(indep)}</mrow></mfrac>`;
                Lt = `\\frac{\\mathrm{d}${tex(y)}}{\\mathrm{d}${identTex(indep)}}`;
                R = math.parse(m[2]);
            } else if (indep && (m = text.match(ODE_I))) {         // y(0) = value, with y in italics as a variable
                const y = math.parse(m[1]), at = math.parse(m[2]);
                Lm = `<mrow>${ml(y)}${paren(ml(strip(at)))}</mrow>`;
                Lt = `${tex(y)}${tparen(tex(strip(at)))}`;
                R = math.parse(m[3]);
            } else {
                const eq = EESParser.equalsAt(text);
                if (eq.length !== 1) return null;
                const L = math.parse(text.slice(0, eq[0]));
                Lm = ml(L); Lt = tex(L); R = math.parse(text.slice(eq[0] + 1));
            }
            const mu = (w) => `<mspace width="1em"/><mtext>[${esc(w)}]</mtext>`, tu = (w) => `\\quad \\left[\\mathrm{${w.replace(/\s+/g, '\\ ')}}\\right]`;
            let Rm = ml(R), Rt = tex(R);
            if (unc) {   // a unit of its own, other than the value's, goes after it; a percentage stays a percentage
                const pct = unc.tail === '%', own = unc.tail && !pct && unc.tail !== unit;
                if ((own || pct) && unit) { Rm += mu(unit); Rt += tu(unit); unit = ''; }
                Rm += `<mo>±</mo>${num(unc.u)}${pct ? '<mo>%</mo>' : ''}`;
                Rt += ` \\pm ${tnum(unc.u)}${pct ? '\\,\\%' : ''}`;
                if (own) unit = unc.tail;
            }
            return { math: `<math xmlns="${NS}" displaystyle="true"><mrow>${Lm}<mo>=</mo>${Rm}${unit ? mu(unit) : ''}</mrow></math>`,
                tex: `${Lt} = ${Rt}${unit ? tu(unit) : ''}` };
        } catch (e) { return null; }
    }

    // The whole text -> items { math } or { text } in order. Comments are dropped; block lines stay as text, except the
    // lines directly inside an ode block, which are formatted and marked inner (indented)
    function render(src) {
        const lines = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*|\{[^}]*\}/g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
        EESParser.joinContinuations(lines);
        EESParser.splitSemicolons(lines);
        const raw = src.split('\n'), out = [], open = [];   // open: the kinds of the blocks open, outermost first
        let indep = null;
        lines.forEach((l, i) => {
            const t = l.trim();
            const opens = /^(function|ode|duplicate)\b/.test(t) || (open.length > 0 && /^(if|for|while)\b/.test(t));
            const inOde = !opens && indep !== null && open.length === 1 && open[0] === 'ode' && !/^end\b/.test(t);
            if (!inOde && (open.length > 0 || opens || /^units\b/.test(t))) {
                if (opens) {
                    open.push(t.match(/^\w+/)[0]);
                    if (open.length === 1) { const h = t.match(/^ode\s+([A-Za-z_]\w*)\s*=/); indep = h ? h[1] : null; }
                }
                if (open.length > 0 && /^end\b/.test(t)) open.pop();
                const shown = raw[i].replace(/\/\/.*$/, '').replace(/\s+$/, '');
                if (shown.trim()) out.push({ text: shown });
                return;
            }
            for (const part of l.split('\u0001')) {
                if (!part.trim()) continue;
                const m = equation(part, inOde ? indep : undefined);
                out.push(m ? (inOde ? { ...m, inner: true } : m) : { text: (inOde ? '  ' : '') + part.trim() });
            }
        });
        return out;
    }
    // The page content (each equation carries its LaTeX, to copy it alone); for the clipboard, the equations as web content
    // (Word pastes MathML from HTML as its own equations; inline ones stay left-aligned) and, as plain text, their LaTeX
    const html = (items) => items.map(it => it.math ? `<div class="fe-eq${it.inner ? ' fe-in' : ''}" title="Click to copy this equation" data-tex="${esc(it.tex)}">${it.math}</div>` : `<pre class="fe-text">${esc(it.text)}</pre>`).join('');
    const clipboard = (items) => items.filter(it => it.math).map(it => it.tex).join('\n');
    const clipboardHtml = (items) => items.filter(it => it.math).map(it => `<p>${it.math}</p>`).join('');
    return { ident, identTex, equation, render, html, clipboard, clipboardHtml };
})();
