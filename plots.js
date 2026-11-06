// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Plot lines in the equations (and on the console): propertyplot, contourplot, heatmapplot, surfaceplot, and the standard plots
// of Matlab (plot, semilogx, semilogy, loglog, scatter, bar, hist, errorbar, stairs, polarplot, plot3) from arrays.
// A plot line is not an equation: the parser sets it aside, and after Solve it is drawn from the results.
// PlotLines.build returns the Plotly traces and layout; the UI draws them. Nothing here touches the page.
class PlotLines {
    static STD = ['plot', 'semilogx', 'semilogy', 'loglog', 'scatter', 'bar', 'hist', 'errorbar', 'stairs', 'polarplot', 'plot3', 'pie', 'area', 'quiver'];
    static CORE = ['propertyplot', 'contourplot', 'heatmapplot', 'surfaceplot'];   // these names cannot begin an ordinary equation; the Matlab names can
    static ALIAS = { surf: 'surfaceplot', mesh: 'surfaceplot', contour: 'contourplot', pcolor: 'heatmapplot' };   // Matlab names for the plots of a two-dimensional array
    static FUN = ['fplot', 'fplot3', 'fsurf', 'fcontour', 'fimplicit', 'fquiver'];   // plots of an expression given as a text, such as fplot('sin(x)', 0, 6)
    static NOTE = ['text', 'arrow'];   // notes on the plot shown: text(x, y, 'label'), arrow(x1, y1, x2, y2 [, 'label'])
    static NAMES = [...PlotLines.CORE, ...Object.keys(PlotLines.ALIAS), ...PlotLines.FUN, ...PlotLines.STD, ...PlotLines.NOTE];
    // The name of the plot line if the text is one call of it alone, as in  plot(x, y, 'r--'), else null. (The call must end the
    // text: an equation such as  bar(a) = f(b)  is not a plot line.)
    static isCall(src) {
        const s = String(src).trim(), m = /^([a-z0-9]+)\s*\(/.exec(s);
        if (!m || !PlotLines.NAMES.includes(m[1])) return null;
        let depth = 0, q = null;
        for (let i = m[0].length - 1; i < s.length; i++) {
            const ch = s[i];
            if (q) { if (ch === q) q = null; continue; }
            if (ch === "'" || ch === '"') { q = ch; continue; }
            if (ch === '(' || ch === '[') depth++;
            else if (ch === ')' || ch === ']') { depth--; if (depth === 0) return i === s.length - 1 ? m[1] : null; }
        }
        return null;
    }
    // Property diagrams: [vertical, horizontal] quantity, the function giving it on the saturation line, axis defaults
    static DIAGRAMS = {
        Ts: { y: 'T', x: 's', logx: false, logy: false },
        Ph: { y: 'P', x: 'h', logx: false, logy: true },
        Pv: { y: 'P', x: 'v', logx: true, logy: true },
        hs: { y: 'h', x: 's', logx: false, logy: false },
    };
    static QTY = {
        T: { fn: 'temperature', unit: 'K', label: 'T' }, P: { fn: 'pressure', unit: 'kPa', label: 'P' },
        h: { fn: 'enthalpy', unit: 'kJ/kg', label: 'h' }, s: { fn: 'entropy', unit: 'kJ/(kg K)', label: 's' },
        v: { fn: 'specificvolume', unit: 'm^3/kg', label: 'v' },
    };

    // The results as a scope in SI: scalars by name, and the elements x[1], x[2], ... (or T[1,1], T[1,2], ...) gathered
    // into arrays under the array's name. units[name] is the display unit of a variable or of an array's elements.
    static scope(values, unitOf) {
        const sc = {}, units = {}, fam = {}, sub = {};
        values.forEach((v, k) => {
            const m = /^([A-Za-z_]\w*)\[\s*(\d+)\s*(?:,\s*(\d+)\s*)?\]$/.exec(k);
            if (!m) {
                sc[k] = v; units[k] = unitOf(k);
                const q = /^([A-Za-z]\w*?)_(\d+)(?:_(\d+))?$/.exec(k);   // T_1, T_2, ... (or T_1_2) also make the array T when no T[...] exists
                if (q) (sub[q[1]] = sub[q[1]] || []).push({ i: +q[2], j: q[3] === undefined ? null : +q[3], v, k });
                return;
            }
            (fam[m[1]] = fam[m[1]] || []).push({ i: +m[2], j: m[3] === undefined ? null : +m[3], v, k });
        });
        for (const [name, els] of Object.entries(sub)) if (!(name in fam) && !(name in sc)) fam[name] = els;   // a real array or scalar of that name wins
        for (const [name, els] of Object.entries(fam)) {
            if (name in sc || !els.every(e => typeof e.v === 'number')) continue;   // a scalar of the same name wins
            units[name] = (els.find(e => unitOf(e.k)) || els[0]).k; units[name] = unitOf(units[name]);   // the first element with a display unit
            if (els.every(e => e.j === null)) {
                const n = Math.max(...els.map(e => e.i)), a = new Array(n).fill(NaN);
                els.forEach(e => { a[e.i - 1] = e.v; });
                sc[name] = a;
            } else if (els.every(e => e.j !== null)) {
                const n = Math.max(...els.map(e => e.i)), m2 = Math.max(...els.map(e => e.j));
                const a = Array.from({ length: n }, () => new Array(m2).fill(NaN));
                els.forEach(e => { a[e.i - 1][e.j - 1] = e.v; });
                sc[name] = a;
            }
        }
        return { sc, units };
    }

    // Matlab-style: the scalar functions apply to each element of an array, so plot(x, sin(x)) works (use .^ , .* , ./ for the operators).
    static vectorScope(scope) {
        const out = Object.assign({}, scope);
        ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log10', 'log2', 'sqrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'cbrt', 'erf', 'gamma'].forEach((f) => {
            const g = typeof scope[f] === 'function' ? scope[f] : (typeof math !== 'undefined' ? math[f] : null); if (typeof g !== 'function') return;
            out[f] = (v, ...r) => (v && typeof v.map === 'function' && !v.isUnit) ? (v.toArray ? v.toArray() : v).map(function m(e) { return Array.isArray(e) ? e.map(m) : g(e, ...r); }) : g(v, ...r);
        });
        return out;
    }
    static plain(v) { return (v && typeof v.toArray === 'function') ? v.toArray() : v; }
    // An argument: a quoted text, or an expression of the results. A bare name keeps its display unit.
    static arg(node, ctx) {
        if (node.isConstantNode && typeof node.value === 'string') return { text: node.value };
        let v;
        try { v = PlotLines.plain(node.compile().evaluate(PlotLines.vectorScope(ctx.scope))); }
        catch (e) { throw new Error(`'${node.toString()}': ${e.message}`); }
        if (v && v.isUnit) v = v.toSI().toNumber();
        const un = node.isSymbolNode ? node.name : (node.isAccessorNode && node.object.isSymbolNode ? node.object.name : null);   // T[3] has the display unit of the array T
        return { v, unit: un ? (ctx.units[un] || '') : '', name: node.toString(), sym: node.isSymbolNode };
    }
    static numbers(a, what, fn) {
        const flat = Array.isArray(a.v) ? a.v : [a.v];
        if (!flat.every(x => typeof x === 'number')) throw new Error(`${fn}(): ${what} '${a.name}' must be a number or an array of numbers`);
        return flat;
    }
    static fromSI(x, unit) { return unit ? UnitConv.fromSI(x, unit) : x; }

    // Plotly traces and layout for one plot line. ctx = { scope, units } from PlotLines.scope (with the property
    // functions in the scope, as for the equations).
    static build(src, ctx) {
        const fn = PlotLines.isCall(src);
        if (!fn) throw new Error(`not a plot line: '${src}'`);
        const node = math.parse(src.trim());
        const args = node.args.map(a => PlotLines.arg(a, ctx));
        if (fn === 'propertyplot') return PlotLines.property(args, ctx);
        if (PlotLines.NOTE.includes(fn)) return PlotLines.notes(fn, args);
        if (PlotLines.FUN.includes(fn)) return PlotLines.functions(fn, args, ctx);
        if (PlotLines.STD.includes(fn)) return PlotLines.standard(fn, args, ctx);
        return PlotLines.grid(PlotLines.ALIAS[fn] || fn, args, fn);
    }

    // text(x, y, 'label') and arrow(x1, y1, x2, y2 [, 'label']): annotations for the plot shown, at points of its axes (display units);
    // the arrow goes from (x1, y1) to (x2, y2), where the head is, and the label is at its tail. The UI puts them on the plot.
    static notes(fn, args) {
        const nums = args.filter(a => a.text === undefined), texts = args.filter(a => a.text !== undefined), want = fn === 'text' ? 2 : 4;
        const use = fn === 'text' ? "text(x, y, 'label'), the label centered at the point (x, y) of the axes" : "arrow(x1, y1, x2, y2) or arrow(x1, y1, x2, y2, 'label'), from (x1, y1) to (x2, y2) where the head is; the label is at the tail";
        if (nums.length !== want || texts.length !== (fn === 'text' ? 1 : texts.length) || texts.length > 1 || args.some((a, k) => (a.text !== undefined) !== (k >= want)))
            throw new Error(`${fn}(): use ${use}`);
        const c = nums.map(a => {
            const v = a.v;
            if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${fn}(): '${a.name}' must be a single number (a point of the plot's axes)`);
            return PlotLines.fromSI(v, a.unit);
        });
        const label = texts.length ? texts[0].text : '';
        const ann = fn === 'text'
            ? { x: c[0], y: c[1], text: label, showarrow: false, xref: 'x', yref: 'y' }
            : { x: c[2], y: c[3], ax: c[0], ay: c[1], axref: 'x', ayref: 'y', xref: 'x', yref: 'y', text: label, showarrow: true, arrowhead: 2, arrowwidth: 1.5 };
        return { notes: [ann], note: fn === 'text' ? `text '${label}' at (${c[0]}, ${c[1]})` : `arrow from (${c[0]}, ${c[1]}) to (${c[2]}, ${c[3]})` };
    }

    // ---- the standard plots, from arrays (or scalars) given by name or as expressions of the results ----
    static LINE = { '-': 'solid', '--': 'dash', ':': 'dot', '-.': 'dashdot' };
    static MARK = { o: 'circle', '+': 'cross', '*': 'star', '.': 'circle', x: 'x', s: 'square', d: 'diamond', '^': 'triangle-up', v: 'triangle-down', '<': 'triangle-left', '>': 'triangle-right', p: 'pentagon', h: 'hexagon' };
    static COLOR = { r: '#d62728', g: '#2ca02c', b: '#1f77b4', c: '#17becf', m: '#9467bd', y: '#e6b800', k: '#222222', w: '#bbbbbb' };
    // A style text as in Matlab: a color, a line and a marker, in any of the usual orders ('r--', 'ko', '-.b', 'g+')
    static style(text, fn) {
        const m = /^([rgbcmykw])?(--|-\.|-|:)?([o+*.xsd^v<>ph])?([rgbcmykw])?$/.exec(text);
        if (!text || !m || (m[1] && m[4])) throw new Error(`${fn}(): '${text}' is not a line style: a color (r g b c m y k w), a line (- -- : -.) and a marker (o + * . x s d ^ v < > p h), as in 'r--' or 'ko'`);
        return { color: PlotLines.COLOR[m[1] || m[4]], line: m[2], marker: m[3] };
    }
    static trace(x, y, name, st) {
        const tr = { type: 'scatter', mode: st.marker ? (st.line ? 'lines+markers' : 'markers') : 'lines', name, x, y };
        if (st.color) { tr.line = { color: st.color }; tr.marker = { color: st.color }; }
        if (st.line) tr.line = Object.assign(tr.line || {}, { dash: PlotLines.LINE[st.line] });
        if (st.marker) tr.marker = Object.assign(tr.marker || {}, { symbol: PlotLines.MARK[st.marker], size: st.marker === '.' ? 4 : 7 });
        return tr;
    }
    // (x, y [, style]) or (y [, style]), repeated: the series of a plot, each with the arguments it came from
    static pairs(args, fn) {
        const out = []; let i = 0;
        while (i < args.length) {
            if (args[i].text !== undefined) throw new Error(`${fn}(): the style '${args[i].text}' must come after the data it styles, as in ${fn}(x, y, 'r--')`);
            let xa = null, ya = args[i++];
            if (i < args.length && args[i].text === undefined) { xa = ya; ya = args[i++]; }
            let st = {};
            if (i < args.length && args[i].text !== undefined) st = PlotLines.style(args[i++].text, fn);
            out.push({ xa, ya, st });
        }
        return out;
    }
    static disp(a, unit) { return a.map(v => Number.isFinite(v) ? PlotLines.fromSI(v, unit) : null); }
    // The curves of one (x, y) pair in display units: y a vector, or a matrix whose columns are curves against x (Y[i, j] at x[i])
    static expand(p, fn) {
        const { xa, ya } = p, yv = ya.v;
        const mat = Array.isArray(yv) && Array.isArray(yv[0]);
        if (mat && !yv.every(r => Array.isArray(r) && r.length === yv[0].length && r.every(v => typeof v === 'number')))
            throw new Error(`${fn}(): '${ya.name}' must be a number, a list or a two-dimensional array of numbers`);
        const rows = mat ? yv.length : (Array.isArray(yv) ? yv.length : 1);
        const cols = mat ? yv[0].length : 1;
        const xs = xa ? PlotLines.numbers(xa, 'x', fn) : Array.from({ length: rows }, (_, i) => i + 1);
        if (xs.length !== rows) throw new Error(`${fn}(): '${xa ? xa.name : 'x'}' has ${xs.length} value(s) and '${ya.name}' has ${rows}`);
        const x = xa ? PlotLines.disp(xs, xa.unit) : xs;
        const cs = mat ? Array.from({ length: cols }, (_, j) => yv.map(r => r[j])) : [PlotLines.numbers(ya, 'y', fn)];
        return cs.map((c, j) => ({ x, y: PlotLines.disp(c, ya.unit), name: mat ? `${ya.name}[:,${j + 1}]` : ya.name }));
    }
    static nameOf(a) { return a.sym || a.name.length <= 24 ? a.name : ''; }
    static lab(n, u) { return u ? (n ? `${n} [${u}]` : `[${u}]`) : n; }

    // plot, semilogx, semilogy, loglog, stairs (x, y [, style]), scatter (x, y [, c]), bar (x, y), hist (data [, bins]),
    // errorbar (x, y [, e]), polarplot (theta, r), plot3 (x, y, z)
    static standard(fn, args, ctx) {
        const lab = PlotLines.lab, nameOf = PlotLines.nameOf, nums = args.filter(a => a.text === undefined), texts = args.filter(a => a.text !== undefined);
        const style = () => texts.length ? PlotLines.style(texts[0].text, fn) : {};
        const need = (ok, use) => { if (!ok) throw new Error(`${fn}(): use ${use}`); };
        const vec = (a, what) => PlotLines.numbers(a, what, fn);
        const same = (a, b, an, bn) => { if (a.length !== b.length) throw new Error(`${fn}(): '${an.name}' has ${a.length} value(s) and '${bn.name}' has ${b.length}`); };
        const clean = (tr) => tr;
        let data, layout, extra = {};
        if (['plot', 'semilogx', 'semilogy', 'loglog', 'stairs'].includes(fn)) {
            need(args.length > 0, `${fn}(x, y), ${fn}(y), ${fn}(x, Y) with the columns of Y as curves, ${fn}(x1, y1, x2, y2), and a style such as 'r--' or 'o' after any pair`);
            const prs = PlotLines.pairs(args, fn);
            data = [];
            prs.forEach(p => PlotLines.expand(p, fn).forEach(s => {
                const tr = PlotLines.trace(s.x, s.y, s.name, p.st);
                if (fn === 'stairs') tr.line = Object.assign(tr.line || {}, { shape: 'hv' });
                data.push(tr);
            }));
            const x0 = prs[0].xa, ys = prs.map(p => p.ya), u0 = ys[0].unit;
            layout = { xaxis: { title: x0 ? lab(nameOf(x0), x0.unit) : 'index' },
                yaxis: { title: ys.length === 1 ? lab(nameOf(ys[0]), u0) : (u0 && ys.every(y => y.unit === u0) ? `[${u0}]` : '') }, showlegend: data.length > 1 };
            extra = { logx: fn === 'semilogx' || fn === 'loglog', logy: fn === 'semilogy' || fn === 'loglog' };
        } else if (fn === 'scatter') {
            need(nums.length >= 2 && nums.length <= 3 && texts.length <= 1, 'scatter(x, y), scatter(x, y, c) with c the values that color the points, and optionally a style such as \'r+\'');
            const [xa, ya, ca] = nums, x = vec(xa, 'x'), y = vec(ya, 'y');
            same(x, y, xa, ya);
            const st = style(); st.marker = st.marker || 'o'; st.line = undefined;
            const tr = PlotLines.trace(PlotLines.disp(x, xa.unit), PlotLines.disp(y, ya.unit), ya.name, st);
            if (ca) {
                const c = vec(ca, 'c'); same(x, c, xa, ca);
                tr.marker = Object.assign(tr.marker || {}, { color: PlotLines.disp(c, ca.unit), colorscale: 'Viridis', showscale: true, size: 8, colorbar: { title: { text: lab(nameOf(ca), ca.unit) } } });
            }
            data = [tr]; layout = { xaxis: { title: lab(nameOf(xa), xa.unit) }, yaxis: { title: lab(nameOf(ya), ya.unit) }, showlegend: false };
        } else if (fn === 'bar') {
            need(texts.length === 0 && (nums.length === 1 || nums.length === 2), 'bar(y) or bar(x, y); with a matrix Y (Y[i, j] at x[i]) the columns are grouped bars');
            const xa = nums.length === 2 ? nums[0] : null, ya = nums[nums.length - 1];
            const ser = PlotLines.expand({ xa, ya }, fn);
            data = ser.map(s => ({ type: 'bar', x: s.x, y: s.y, name: s.name }));
            layout = { xaxis: { title: xa ? lab(nameOf(xa), xa.unit) : 'index' }, yaxis: { title: lab(nameOf(ya), ya.unit) }, barmode: 'group', showlegend: data.length > 1 };
        } else if (fn === 'hist') {
            need(texts.length === 0 && (nums.length === 1 || nums.length === 2), 'hist(data) or hist(data, bins)');
            const a = nums[0], v = vec(a, 'data').filter(Number.isFinite);
            let bins = 10;
            if (nums[1]) { bins = Number(nums[1].v); if (!(Number.isInteger(bins) && bins >= 1)) throw new Error(`hist(): the number of bins must be a whole number, 1 or more, not '${nums[1].name}'`); }
            data = [{ type: 'histogram', x: PlotLines.disp(v, a.unit), nbinsx: bins, name: a.name }];
            layout = { xaxis: { title: lab(nameOf(a), a.unit) }, yaxis: { title: 'count' }, showlegend: false };
        } else if (fn === 'pie') {
            need(texts.length === 0 && nums.length === 1, 'pie(v), the shares as a list; each slice is labeled with its index');
            const a = nums[0], v = vec(a, 'v');
            if (!v.every(x => Number.isFinite(x) && x >= 0) || !(v.reduce((p, q) => p + q, 0) > 0)) throw new Error(`pie(): '${a.name}' must be numbers that are 0 or more, not all 0`);
            data = [{ type: 'pie', values: PlotLines.disp(v, a.unit), labels: v.map((_, i) => `${a.sym ? a.name : 'v'}[${i + 1}]`), sort: false, textinfo: 'label+percent', name: a.name }];
            layout = { showlegend: false };
        } else if (fn === 'area') {
            need(nums.length >= 1 && nums.length <= 2 && texts.length <= 1, "area(y), area(x, y), optionally with a style such as 'r'; with a matrix Y the columns are stacked");
            const xa = nums.length === 2 ? nums[0] : null, ya = nums[nums.length - 1];
            const ser = PlotLines.expand({ xa, ya }, fn), st = style();
            data = ser.map(s => Object.assign(PlotLines.trace(s.x, s.y, s.name, { color: st.color }), { fill: ser.length > 1 ? 'tonexty' : 'tozeroy', stackgroup: ser.length > 1 ? 'one' : undefined }));
            layout = { xaxis: { title: xa ? lab(nameOf(xa), xa.unit) : 'index' }, yaxis: { title: lab(nameOf(ya), ya.unit) }, showlegend: data.length > 1 };
        } else if (fn === 'quiver') {
            need(nums.length === 4 && texts.length === 0, 'quiver(x, y, u, v), the arrows (u, v) at the points (x, y), all lists of the same length');
            const [xa, ya, ua, va] = nums, x = vec(xa, 'x'), y = vec(ya, 'y'), u = vec(ua, 'u'), v = vec(va, 'v');
            same(x, y, xa, ya); same(x, u, xa, ua); same(x, v, xa, va);
            data = [PlotLines.arrows(PlotLines.disp(x, xa.unit), PlotLines.disp(y, ya.unit), u, v, `(${nameOf(ua) || 'u'}, ${nameOf(va) || 'v'})`)];
            layout = { xaxis: { title: lab(nameOf(xa), xa.unit) }, yaxis: { title: lab(nameOf(ya), ya.unit) }, showlegend: false };
        } else if (fn === 'errorbar') {
            need(nums.length >= 2 && nums.length <= 3 && texts.length <= 1, "errorbar(x, y, e) with e the error (a list or one number), or errorbar(x, y) from the propagated uncertainties (Uncertainty ticked, y a variable name), and optionally a style such as 'o-'");
            const [xa, ya, ea] = nums, x = vec(xa, 'x'), y = vec(ya, 'y');
            same(x, y, xa, ya);
            let e;
            if (ea) {
                const ev = vec(ea, 'e'); if (ev.length !== 1) same(x, ev, xa, ea);
                e = y.map((v, i) => Math.abs(ev[ev.length === 1 ? 0 : i]));
            } else {
                if (!ctx.unc || !ya.sym) throw new Error("errorbar(): without the errors as a third argument, tick Uncertainty in the Variables pane and give y as the name of a variable (or array) that carries an uncertainty");
                e = y.map((v, i) => ctx.unc.get(Array.isArray(ya.v) ? `${ya.name}[${i + 1}]` : ya.name) || 0);
                if (!e.some(v => v > 0)) throw new Error(`errorbar(): '${ya.name}' has no uncertainty in the last results; give the errors as a third argument`);
            }
            const ed = e.map((v, i) => Math.abs(PlotLines.fromSI(y[i] + v, ya.unit) - PlotLines.fromSI(y[i], ya.unit)));   // a difference, in the display unit
            const st = style(); st.marker = st.marker || 'o';
            const tr = PlotLines.trace(PlotLines.disp(x, xa.unit), PlotLines.disp(y, ya.unit), ya.name, st);
            tr.error_y = { type: 'data', array: ed, visible: true, thickness: 1.2, width: 4 };
            data = [tr]; layout = { xaxis: { title: lab(nameOf(xa), xa.unit) }, yaxis: { title: lab(nameOf(ya), ya.unit) }, showlegend: false };
        } else if (fn === 'polarplot') {
            need(nums.length === 2 && texts.length <= 1, "polarplot(theta, r), theta in radians, optionally with a style such as 'r--'");
            const [ta, ra] = nums, th = vec(ta, 'theta'), r = vec(ra, 'r');
            same(th, r, ta, ra);
            const tr = PlotLines.trace(null, null, ra.name, style());
            delete tr.x; delete tr.y; tr.type = 'scatterpolar'; tr.r = PlotLines.disp(r, ra.unit); tr.theta = th.map(v => Number.isFinite(v) ? v * 180 / Math.PI : null);
            data = [tr]; layout = { polar: { radialaxis: { title: { text: lab(nameOf(ra), ra.unit) } } }, showlegend: false }; extra = { polar: true };
        } else {   // plot3
            need(nums.length === 3 && texts.length <= 1, "plot3(x, y, z), optionally with a style such as 'r--' or 'o'");
            const [xa, ya, za] = nums, x = vec(xa, 'x'), y = vec(ya, 'y'), z = vec(za, 'z');
            same(x, y, xa, ya); same(x, z, xa, za);
            const tr = PlotLines.trace(PlotLines.disp(x, xa.unit), PlotLines.disp(y, ya.unit), za.name, style());
            tr.type = 'scatter3d'; tr.z = PlotLines.disp(z, za.unit);
            const ok3 = ['circle', 'cross', 'diamond', 'square', 'x'];
            if (tr.marker && tr.marker.symbol && !ok3.includes(tr.marker.symbol)) tr.marker.symbol = 'circle';
            data = [tr]; layout = { scene: { xaxis: { title: lab(nameOf(xa), xa.unit) }, yaxis: { title: lab(nameOf(ya), ya.unit) }, zaxis: { title: lab(nameOf(za), za.unit) } }, showlegend: false }; extra = { three: true };
        }
        const pts = data.reduce((n, t) => n + ((t.x || t.r || []).length), 0);
        return Object.assign({ data: data.map(clean), layout, logx: false, logy: false, three: false, polar: false, note: `${fn}: ${data.length} curve(s), ${pts} point(s)` }, extra);
    }

    // propertyplot(fluid, 'Ts'|'Ph'|'Pv'|'hs'[, y, x][, 'cycle']): the saturation dome and the states.
    // The states are the arrays named by the diagram (T and s for 'Ts'), or the two arrays given (vertical first).
    static property(args, ctx) {
        const use = "propertyplot(fluid, 'Ts', 'Ph', 'Pv' or 'hs'), optionally with the two arrays of the states (vertical first) and 'cycle'";
        if (args.length < 2 || !args[0].text || !args[1].text) throw new Error(`propertyplot(): use ${use}`);
        const fluid = args[0].text, D = PlotLines.DIAGRAMS[args[1].text];
        if (!D) throw new Error(`propertyplot(): the diagram is 'Ts', 'Ph', 'Pv' or 'hs', not '${args[1].text}'`);
        let rest = args.slice(2), cycle = false;
        if (rest.length && rest[rest.length - 1].text !== undefined) {
            const t = rest.pop().text;
            if (t !== 'cycle') throw new Error(`propertyplot(): the last argument may be 'cycle' (to join the last state to the first), not '${t}'`);
            cycle = true;
        }
        if (rest.length !== 0 && rest.length !== 2) throw new Error(`propertyplot(): give both arrays of the states, vertical first, or neither; use ${use}`);
        const own = rest.length === 2;   // arrays given: only they are known for the paths (the arrays P, T, s, h may be other states)
        if (rest.length === 0 && Array.isArray(ctx.scope[D.y]) && Array.isArray(ctx.scope[D.x]))   // the arrays named by the diagram
            rest = [D.y, D.x].map(n => ({ v: PlotLines.plain(ctx.scope[n]), unit: ctx.units[n] || '', name: n }));
        const QY = PlotLines.QTY[D.y], QX = PlotLines.QTY[D.x];
        let ys = null, xs = null, uy = '', ux = '', names = [D.y, D.x];
        if (rest.length === 2) {
            ys = PlotLines.numbers(rest[0], 'the states', 'propertyplot'); xs = PlotLines.numbers(rest[1], 'the states', 'propertyplot');
            uy = rest[0].unit; ux = rest[1].unit; names = [rest[0].name, rest[1].name];
            if (ys.length !== xs.length) throw new Error(`propertyplot(): '${names[0]}' has ${ys.length} values and '${names[1]}' has ${xs.length}`);
        }
        uy = uy || QY.unit; ux = ux || QX.unit;
        const sat = PlotLines.dome(fluid, D);
        const conv = (a, u) => a.map(v => PlotLines.fromSI(v, u));
        const data = [{ type: 'scatter', mode: 'lines', name: 'saturation', x: conv(sat.x, ux), y: conv(sat.y, uy), line: { color: '#888888', width: 1.5 }, hoverinfo: 'x+y' }];
        let curved = 0, straight = 0, nbars = 0;
        if (xs) {
            const idx = ys.map((v, i) => i).filter(i => Number.isFinite(ys[i]) && Number.isFinite(xs[i]));
            const segs = idx.slice(1).map((j, k) => [idx[k], j]);
            if (cycle && idx.length > 2) segs.push([idx[idx.length - 1], idx[0]]);
            const solid = { x: [], y: [] }, dash = { x: [], y: [] };
            for (const [a, b] of segs) {
                const p = PlotLines.path(fluid, D, own ? { [D.y]: ys, [D.x]: xs } : ctx.scope, a, b);
                const t = p ? solid : dash, px = p ? p.x : [xs[a], xs[b]], py = p ? p.y : [ys[a], ys[b]];
                if (p) curved++; else straight++;
                t.x.push(...conv(px, ux), null); t.y.push(...conv(py, uy), null);
            }
            data.push({ type: 'scatter', mode: 'lines', name: 'processes', x: solid.x, y: solid.y, line: { color: '#1f77b4', width: 2 }, hoverinfo: 'skip' });
            data.push({ type: 'scatter', mode: 'lines', name: 'other processes (straight)', x: dash.x, y: dash.y, line: { color: '#1f77b4', width: 1.5, dash: 'dash' }, hoverinfo: 'skip' });
            // error bars from the propagated uncertainties (ctx.unc: name -> u in SI), for arrays given by name
            const bars = (names_, vals, unit) => {
                const sym = names_ && /^[A-Za-z_]\w*$/.test(names_);
                const e = idx.map(i => { const u = sym && ctx.unc ? ctx.unc.get(`${names_}[${i + 1}]`) : 0; return u > 0 ? Math.abs(PlotLines.fromSI(vals[i] + u, unit) - PlotLines.fromSI(vals[i], unit)) : 0; });
                return e.some(v => v > 0) ? { type: 'data', array: e, visible: true, thickness: 1.2, width: 4 } : undefined;
            };
            const ey = bars(names[0], ys, uy), ex = bars(names[1], xs, ux);
            if (ey || ex) nbars = (ey ? 1 : 0) + (ex ? 1 : 0);
            data.push({
                type: 'scatter', mode: 'markers+text', name: 'states', error_x: ex, error_y: ey, x: idx.map(i => PlotLines.fromSI(xs[i], ux)), y: idx.map(i => PlotLines.fromSI(ys[i], uy)),
                text: idx.map(i => String(i + 1)), textposition: 'top right', cliponaxis: false, marker: { size: 7, color: '#1f77b4' },
            });
        }
        const lab = (Q, u) => `${Q.label} [${u}]`;
        return {
            data, logx: D.logx, logy: D.logy,
            layout: { xaxis: { title: lab(QX, ux) }, yaxis: { title: lab(QY, uy) }, showlegend: false, title: { text: `${fluid}: ${D.y}-${D.x} diagram`, font: { size: 13 }, x: 0.02, xanchor: 'left' } },
            note: xs ? `${xs.length} state(s) from ${names.join(' and ')}; ${curved} process(es) drawn at constant P, T, s or h, ${straight} joined by straight dashed lines${nbars ? '; error bars from the uncertainties' : ''}`
                : `no arrays ${names.join(' and ')} in the results: the dome only`,
        };
    }
    // The path from state a to state b (0-based) when one of P, T, s or h is the same at both (as found in the arrays of
    // those names in the results), in SI: the other axis quantities are computed along it. null if none is constant.
    static path(fluid, D, sc, a, b, n = 40) {
        const KEY = { P: 'P', T: 'T', s: 'S', h: 'H' }, val = (q, i) => (Array.isArray(sc[q]) && Number.isFinite(sc[q][i])) ? sc[q][i] : null;
        if ([D.x, D.y].some(q => val(q, a) === null || val(q, b) === null)) return null;
        const same = (q) => { const u = val(q, a), w = val(q, b); return u !== null && w !== null && Math.abs(u - w) <= 1e-6 * Math.max(Math.abs(u), Math.abs(w), 1e-30); };
        const c = ['P', 's', 'T', 'h'].find(same);
        if (!c) return null;
        if (c === D.x || c === D.y) return { x: [val(D.x, a), val(D.x, b)], y: [val(D.y, a), val(D.y, b)], exact: true };   // a straight line on this diagram
        const w = ['s', 'h', 'P', 'T'].find(q => q !== c && val(q, a) !== null && val(q, b) !== null && !same(q) && !(c === 'P' && q === 'T') && !(c === 'T' && q === 'P'));
        if (!w) return null;
        const cv = val(c, a), w0 = val(w, a), w1 = val(w, b), logw = w === 'P', x = [], y = [];
        try {
            for (let k = 0; k <= n; k++) {
                const f = k / n, wv = logw ? w0 * (w1 / w0) ** f : w0 + (w1 - w0) * f;
                const get = (q) => q === c ? cv : q === w ? wv : ThermoEngine.call(PlotLines.QTY[q].fn, [fluid, KEY[c], cv, KEY[w], wv]);
                x.push(get(D.x)); y.push(get(D.y));
            }
        } catch (e) { return null; }
        return x.every(Number.isFinite) && y.every(Number.isFinite) ? { x, y } : null;
    }
    // The saturation line from the triple point (or the lowest temperature of the fluid) to just below the critical
    // point, then the critical point: liquid up, then vapor down, in SI. Points crowd towards the critical point, where the dome turns.
    static dome(fluid, D, n = 70) {
        const call = (f, a) => ThermoEngine.call(f, a);
        let Tc, Tt;
        try { Tc = call('criticaltemperature', [fluid]); Tt = Math.max(call('triplepointtemperature', [fluid]), call('mintemperature', [fluid])); }
        catch (e) { throw new Error(`propertyplot(): '${fluid}' has no saturation dome here (${e.message})`); }
        if (!(Tc > Tt)) throw new Error(`propertyplot(): '${fluid}' has no saturation dome here`);
        const QY = PlotLines.QTY[D.y], QX = PlotLines.QTY[D.x], liq = [], vap = [];
        for (let k = 0; k <= n; k++) {
            const u = k / n, T = Tc - (Tc - Tt) * (1 - u) ** 2 - (k === n ? 1e-4 * (Tc - Tt) : 0);
            const at = (Q, q) => q.fn === 'temperature' ? T : call(q.fn, [fluid, 'T', T, 'Q', Q]);
            try { liq.push([at(0, QX), at(0, QY)]); vap.push([at(1, QX), at(1, QY)]); } catch (e) { /* a point CoolProp cannot do: left out */ }
        }
        if (liq.length < 5) throw new Error(`propertyplot(): could not compute the saturation line of '${fluid}'`);
        let crit = [];   // the critical point closes the dome
        try {
            const rc = call('criticaldensity', [fluid]), at = (q) => q.fn === 'temperature' ? Tc : call(q.fn, [fluid, 'T', Tc, 'D', rc]);
            crit = [[at(QX), at(QY)]].filter(p => p.every(Number.isFinite));
        } catch (e) { /* drawn without it */ }
        const pts = [...liq, ...crit, ...vap.reverse()];
        return { x: pts.map(p => p[0]), y: pts.map(p => p[1]) };
    }

    // contourplot / heatmapplot / surfaceplot(Z) or (x, y, Z): Z[i][j] is the value at x[i], y[j] (the first index
    // runs along x, as in T[i, j] for a grid of nodes). Without x and y, the indices are used.
    // Arrows (u, v) at the points (x, y) as one line trace: the longest is 80 % of the mean spacing, the heads are open
    static arrows(x, y, u, v, name) {
        const ok = x.map((_, i) => [x[i], y[i], u[i], v[i]].every(Number.isFinite) ? i : -1).filter(i => i >= 0);
        if (!ok.length) throw new Error('quiver: no finite arrows to draw');
        const lo = (a) => Math.min(...ok.map(i => a[i])), hi = (a) => Math.max(...ok.map(i => a[i]));
        const rx = (hi(x) - lo(x)) || 1, ry = (hi(y) - lo(y)) || 1, m = Math.max(...ok.map(i => Math.hypot(u[i], v[i]))) || 1;
        const L = 0.8 / Math.sqrt(ok.length), c = Math.cos(0.45), sn = Math.sin(0.45), X = [], Y = [];
        ok.forEach((i) => {
            const dx = u[i] / m * L, dy = v[i] / m * L, h = 0.3;   // in the plot's own scale: 1 is the width (height) of the data
            const bx = (x[i] - lo(x)) / rx, by = (y[i] - lo(y)) / ry, tx = bx + dx, ty = by + dy;
            const hl = [tx - h * (dx * c - dy * sn), ty - h * (dx * sn + dy * c)], hr = [tx - h * (dx * c + dy * sn), ty - h * (-dx * sn + dy * c)];
            const px = (q) => lo(x) + q * rx, py = (q) => lo(y) + q * ry;
            X.push(px(bx), px(tx), px(hl[0]), px(tx), px(hr[0]), null); Y.push(py(by), py(ty), py(hl[1]), py(ty), py(hr[1]), null);
        });
        return { type: 'scatter', mode: 'lines', x: X, y: Y, name, line: { width: 1.6 } };
    }

    // Plots of an expression given as a text, evaluated point by point (so x^2 and the other operators need no dots):
    //   fplot('f(x)', a, b)  fplot('x(t)', 'y(t)', a, b)  fplot3('x(t)', 'y(t)', 'z(t)', a, b)  fsurf('f(x, y)', x0, x1, y0, y1)
    //   fsurf('x(u, v)', 'y(u, v)', 'z(u, v)', u0, u1, v0, v1)  fcontour('f(x, y)', x0, x1, y0, y1)  fimplicit('f(x, y)', x0, x1, y0, y1)
    //   fquiver('u(x, y)', 'v(x, y)', x0, x1, y0, y1 [, n]);  a trailing count of points is allowed, and a style after fplot and fplot3
    static functions(fn, args, ctx) {
        let i = 0; const ex = [], nm = [];
        while (i < args.length && args[i].text !== undefined) ex.push(args[i++].text);
        while (i < args.length && args[i].text === undefined) nm.push(args[i++]);
        const sty = i < args.length ? args[i++].text : null;
        const USE = {
            fplot: "fplot('f(x)', a, b) or, for a curve given by a parameter t, fplot('x(t)', 'y(t)', a, b); optionally the number of points, then a style such as 'r--'",
            fplot3: "fplot3('x(t)', 'y(t)', 'z(t)', a, b)",
            fsurf: "fsurf('f(x, y)', x0, x1, y0, y1) or, for a surface given by u and v, fsurf('x(u, v)', 'y(u, v)', 'z(u, v)', u0, u1, v0, v1)",
            fcontour: "fcontour('f(x, y)', x0, x1, y0, y1)", fimplicit: "fimplicit('f(x, y)', x0, x1, y0, y1), the curve f = 0; 'g(x, y) = h(x, y)' is allowed",
            fquiver: "fquiver('u(x, y)', 'v(x, y)', x0, x1, y0, y1), optionally the number of arrows along each side",
        };
        const bad = () => new Error(`${fn}(): use ${USE[fn]}`);
        if (i < args.length) throw bad();
        const nv = nm.map(a => { if (typeof a.v !== 'number' || !Number.isFinite(a.v)) throw new Error(`${fn}(): '${a.name}' must be a number`); return a.v; });
        const range = (a, b, what) => { if (!(b > a)) throw new Error(`${fn}(): the ${what} range ${a} to ${b} is empty; give the smaller value first`); };
        const evaluator = (src, vars) => {   // src evaluated at numbers; unusable points (a domain error, a complex number) are gaps
            let code; const text = String(src);
            try { code = math.parse(text).compile(); } catch (e) { throw new Error(`${fn}(): '${text}': ${e.message}`); }
            const sc = Object.assign({}, ctx.scope); let first = null, good = 0, tried = 0;
            const f = (...vals) => {
                tried++; vars.forEach((v, k) => { sc[v] = vals[k]; });
                try { let r = code.evaluate(sc); if (r && r.isUnit) r = r.toSI().toNumber(); if (typeof r === 'number' && Number.isFinite(r)) { good++; return r; } if (!first) first = 'it is not a real number there'; }
                catch (e) { if (!first) first = e.message; }
                return null;
            };
            f.check = () => { if (tried && !good) throw new Error(`${fn}(): '${text}' gives no number in the range: ${first}`); };
            return f;
        };
        const lin = (a, b, n) => Array.from({ length: n }, (_, k) => a + (b - a) * k / (n - 1));
        const count = (v, dflt, what) => { if (v === undefined) return dflt; if (!(Number.isInteger(v) && v >= 2 && v <= 2000)) throw new Error(`${fn}(): the number of ${what} must be a whole number from 2 to 2000, not ${v}`); return v; };
        const style = (d) => sty === null ? d : PlotLines.style(sty, fn);
        let data, layout, extra = {}, note;
        if (fn === 'fplot') {
            if (!(ex.length === 1 || ex.length === 2) || nv.length < 2 || nv.length > 3) throw bad();
            range(nv[0], nv[1], ex.length === 1 ? 'x' : 't'); const n = count(nv[2], 400, 'points');
            if (ex.length === 1) {
                const f = evaluator(ex[0], ['x']), x = lin(nv[0], nv[1], n), y = x.map(v => f(v)); f.check();
                data = [PlotLines.trace(x, y, ex[0], style({}))]; layout = { xaxis: { title: 'x' }, yaxis: { title: ex[0] }, showlegend: false };
            } else {
                const fx = evaluator(ex[0], ['t']), fy = evaluator(ex[1], ['t']), t = lin(nv[0], nv[1], n), x = t.map(v => fx(v)), y = t.map(v => fy(v)); fx.check(); fy.check();
                data = [PlotLines.trace(x, y, `(${ex[0]}, ${ex[1]})`, style({}))]; layout = { xaxis: { title: ex[0] }, yaxis: { title: ex[1], scaleanchor: 'x' }, showlegend: false };
            }
            note = `fplot: ${n} point(s)`;
        } else if (fn === 'fplot3') {
            if (ex.length !== 3 || nv.length < 2 || nv.length > 3) throw bad();
            range(nv[0], nv[1], 't'); const n = count(nv[2], 400, 'points'), t = lin(nv[0], nv[1], n);
            const fs = ex.map(e => evaluator(e, ['t'])), [x, y, z] = fs.map(f => t.map(v => f(v))); fs.forEach(f => f.check());
            const tr = PlotLines.trace(x, y, `(${ex.join(', ')})`, style({})); tr.type = 'scatter3d'; tr.z = z;
            data = [tr]; layout = { scene: { xaxis: { title: ex[0] }, yaxis: { title: ex[1] }, zaxis: { title: ex[2] } }, showlegend: false }; extra = { three: true }; note = `fplot3: ${n} point(s)`;
        } else if (fn === 'fsurf' && ex.length === 3) {
            if (nv.length < 4 || nv.length > 5) throw bad();
            range(nv[0], nv[1], 'u'); range(nv[2], nv[3], 'v'); const n = count(nv[4], 50, 'points along each side'), u = lin(nv[0], nv[1], n), v = lin(nv[2], nv[3], n);
            const fs = ex.map(e => evaluator(e, ['u', 'v'])), g = (f) => v.map(b => u.map(a => f(a, b)));
            const [X, Y, Z] = fs.map(g); fs.forEach(f => f.check());
            data = [{ type: 'surface', x: X, y: Y, z: Z, colorscale: 'Viridis', showscale: false }];
            layout = { scene: { xaxis: { title: ex[0] }, yaxis: { title: ex[1] }, zaxis: { title: ex[2] } }, showlegend: false }; extra = { three: true }; note = `fsurf: ${n} x ${n} point(s)`;
        } else if (fn === 'fsurf' || fn === 'fcontour' || fn === 'fimplicit') {
            if (ex.length !== 1 || nv.length < 4 || nv.length > 5) throw bad();
            range(nv[0], nv[1], 'x'); range(nv[2], nv[3], 'y');
            const n = count(nv[4], fn === 'fimplicit' ? 160 : fn === 'fsurf' ? 50 : 80, 'points along each side'), x = lin(nv[0], nv[1], n), y = lin(nv[2], nv[3], n);
            let src = ex[0];
            if (fn === 'fimplicit') { const eq = /^([^=<>!]+)=([^=].*)$/.exec(src); if (eq) src = `(${eq[1]}) - (${eq[2]})`; }
            const f = evaluator(src, ['x', 'y']), z = y.map(b => x.map(a => f(a, b))); f.check();
            const lbl = { xaxis: { title: 'x' }, yaxis: { title: 'y' }, showlegend: false };
            if (fn === 'fsurf') { data = [{ type: 'surface', x, y, z, colorscale: 'Viridis', colorbar: { title: { text: ex[0] } } }]; layout = { scene: { xaxis: { title: 'x' }, yaxis: { title: 'y' }, zaxis: { title: ex[0] } }, showlegend: false }; extra = { three: true }; }
            else if (fn === 'fcontour') { data = [{ type: 'contour', x, y, z, colorscale: 'Viridis', contours: { showlabels: true }, colorbar: { title: { text: ex[0] } } }]; layout = lbl; }
            else {
                data = [{ type: 'contour', x, y, z, name: ex[0], showscale: false, autocontour: false, contours: { start: 0, end: 0, size: 1, coloring: 'lines', showlabels: false }, line: { width: 2.5, color: '#1f77b4' }, hoverinfo: 'x+y' }];
                layout = { xaxis: { title: 'x' }, yaxis: { title: 'y', scaleanchor: 'x' }, showlegend: false };
            }
            note = `${fn}: ${n} x ${n} point(s)`;
        } else {   // fquiver
            if (ex.length !== 2 || nv.length < 4 || nv.length > 5) throw bad();
            range(nv[0], nv[1], 'x'); range(nv[2], nv[3], 'y'); const n = count(nv[4], 15, 'arrows along each side');
            const fu = evaluator(ex[0], ['x', 'y']), fv = evaluator(ex[1], ['x', 'y']), gx = lin(nv[0], nv[1], n), gy = lin(nv[2], nv[3], n), X = [], Y = [], U = [], V = [];
            gy.forEach(b => gx.forEach(a => { X.push(a); Y.push(b); const uu = fu(a, b), vv = fv(a, b); U.push(uu === null ? NaN : uu); V.push(vv === null ? NaN : vv); }));
            fu.check(); fv.check();
            data = [PlotLines.arrows(X, Y, U, V, `(${ex[0]}, ${ex[1]})`)]; layout = { xaxis: { title: 'x' }, yaxis: { title: 'y' }, showlegend: false }; note = `fquiver: ${n} x ${n} arrow(s)`;
        }
        return Object.assign({ data, layout, logx: false, logy: false, three: false, polar: false, note }, extra);
    }

    static grid(fn, args, as) {
        const nameShown = as || fn, use = `${nameShown}(Z) or ${nameShown}(x, y, Z), with Z a two-dimensional array (Z[i, j] at x[i], y[j])` + (fn === 'surfaceplot' ? `; or ${nameShown}(X, Y, Z) with three arrays of the same size (a parametric surface)` : '');
        if (args.length !== 1 && args.length !== 3) throw new Error(`${nameShown}(): use ${use}`);
        const isM = (a) => Array.isArray(a.v) && Array.isArray(a.v[0]);
        if (fn === 'surfaceplot' && args.length === 3 && isM(args[0]) && isM(args[1]) && isM(args[2])) {   // X[i, j], Y[i, j], Z[i, j]
            const M = args.map((a, k) => {
                const v = a.v; if (!v.every(r => Array.isArray(r) && r.length === v[0].length && r.every(x => typeof x === 'number'))) throw new Error(`${nameShown}(): '${a.name}' must be a two-dimensional array of numbers`);
                return v;
            });
            if (M.some(m => m.length !== M[0].length || m[0].length !== M[0][0].length)) throw new Error(`${nameShown}(): X, Y and Z must have the same size`);
            const T = M.map((m, k) => Array.from({ length: m[0].length }, (_, j) => m.map(r => PlotLines.fromSI(r[j], args[k].unit))));   // Plotly: row = second index
            const nms = args.map((a, k) => a.sym ? a.name : 'XYZ'[k]), ttl = args.map((a, k) => PlotLines.lab(nms[k], a.unit));
            const tr = { type: 'surface', x: T[0], y: T[1], z: T[2], colorscale: 'Viridis', colorbar: { title: { text: ttl[2] } } };
            if (as === 'mesh') Object.assign(tr, { hidesurface: true, contours: { x: { show: true, color: '#333', width: 1 }, y: { show: true, color: '#333', width: 1 } } });
            return { data: [tr], layout: { scene: { xaxis: { title: ttl[0] }, yaxis: { title: ttl[1] }, zaxis: { title: ttl[2] } }, showlegend: false }, logx: false, logy: false, three: true, note: `${M[0].length} x ${M[0][0].length} values` };
        }
        const Za = args[args.length - 1], Z = Za.v;
        if (!Array.isArray(Z) || !Array.isArray(Z[0]) || !Z.every(r => Array.isArray(r) && r.length === Z[0].length && r.every(x => typeof x === 'number')))
            throw new Error(`${nameShown}(): '${Za.name || 'Z'}' must be a two-dimensional array of numbers; use ${use}`);
        const ni = Z.length, nj = Z[0].length;
        if (ni < 2 || nj < 2) throw new Error(`${nameShown}(): '${Za.name}' needs at least 2 values along each index`);
        let x = Array.from({ length: ni }, (_, i) => i + 1), y = Array.from({ length: nj }, (_, j) => j + 1), ux = '', uy = '', nx = 'i', ny = 'j';
        if (args.length === 3) {
            x = PlotLines.numbers(args[0], 'x', fn); y = PlotLines.numbers(args[1], 'y', fn);
            if (x.length !== ni || y.length !== nj) throw new Error(`${nameShown}(): '${Za.name}' is ${ni} x ${nj}, so x needs ${ni} values and y ${nj} (it has ${x.length} and ${y.length})`);
            ux = args[0].unit; uy = args[1].unit; nx = args[0].sym ? args[0].name : 'x'; ny = args[1].sym ? args[1].name : 'y';
            x = x.map(v => PlotLines.fromSI(v, ux)); y = y.map(v => PlotLines.fromSI(v, uy));
        }
        const uz = Za.unit, z = Array.from({ length: nj }, (_, j) => Z.map(r => PlotLines.fromSI(r[j], uz)));   // Plotly: z[row = y][col = x]
        const lab = (n, u) => u ? `${n} [${u}]` : n, zn = Za.sym ? Za.name : 'Z', zt = lab(zn, uz);
        const tr = { x, y, z, colorscale: 'Viridis', colorbar: { title: { text: zt } } };
        if (fn === 'contourplot') Object.assign(tr, { type: 'contour', contours: { showlabels: true } });
        else if (fn === 'heatmapplot') tr.type = 'heatmap';
        else { tr.type = 'surface'; if (as === 'mesh') { const sp = (v) => ({ show: true, color: '#333', width: 1, start: v[0], end: v[v.length - 1], size: (v[v.length - 1] - v[0]) / (v.length - 1) || 1 }); Object.assign(tr, { hidesurface: true, contours: { x: sp(x), y: sp(y) } }); } }
        const layout = fn === 'surfaceplot'
            ? { scene: { xaxis: { title: lab(nx, ux) }, yaxis: { title: lab(ny, uy) }, zaxis: { title: zt } }, showlegend: false }
            : { xaxis: { title: lab(nx, ux) }, yaxis: { title: lab(ny, uy) }, showlegend: false };
        return { data: [tr], layout, logx: false, logy: false, three: fn === 'surfaceplot', note: `${ni} x ${nj} values of ${zn}` };
    }
}
