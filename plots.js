// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Plot lines in the equations (and on the console): propertyplot, contourplot, heatmapplot, surfaceplot.
// A plot line is not an equation: the parser sets it aside, and after Solve it is drawn from the results.
// PlotLines.build returns the Plotly traces and layout; the UI draws them. Nothing here touches the page.
class PlotLines {
    static NAMES = ['propertyplot', 'contourplot', 'heatmapplot', 'surfaceplot'];
    static RE = /^(propertyplot|contourplot|heatmapplot|surfaceplot)\s*\((.*)\)$/s;
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
        const sc = {}, units = {}, fam = {};
        values.forEach((v, k) => {
            const m = /^([A-Za-z_]\w*)\[\s*(\d+)\s*(?:,\s*(\d+)\s*)?\]$/.exec(k);
            if (!m) { sc[k] = v; units[k] = unitOf(k); return; }
            (fam[m[1]] = fam[m[1]] || []).push({ i: +m[2], j: m[3] === undefined ? null : +m[3], v, k });
        });
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

    static plain(v) { return (v && typeof v.toArray === 'function') ? v.toArray() : v; }
    // An argument: a quoted text, or an expression of the results. A bare name keeps its display unit.
    static arg(node, ctx) {
        if (node.isConstantNode && typeof node.value === 'string') return { text: node.value };
        let v;
        try { v = PlotLines.plain(node.compile().evaluate(ctx.scope)); }
        catch (e) { throw new Error(`'${node.toString()}': ${e.message}`); }
        if (v && v.isUnit) v = v.toSI().toNumber();
        return { v, unit: node.isSymbolNode ? (ctx.units[node.name] || '') : '', name: node.toString(), sym: node.isSymbolNode };
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
        const m = PlotLines.RE.exec(src.trim());
        if (!m) throw new Error(`not a plot line: '${src}'`);
        const node = math.parse(src.trim()), fn = m[1];
        const args = node.args.map(a => PlotLines.arg(a, ctx));
        return fn === 'propertyplot' ? PlotLines.property(args, ctx) : PlotLines.grid(fn, args);
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
    static grid(fn, args) {
        const use = `${fn}(Z) or ${fn}(x, y, Z), with Z a two-dimensional array (Z[i, j] at x[i], y[j])`;
        if (args.length !== 1 && args.length !== 3) throw new Error(`${fn}(): use ${use}`);
        const Za = args[args.length - 1], Z = Za.v;
        if (!Array.isArray(Z) || !Array.isArray(Z[0]) || !Z.every(r => Array.isArray(r) && r.length === Z[0].length && r.every(x => typeof x === 'number')))
            throw new Error(`${fn}(): '${Za.name || 'Z'}' must be a two-dimensional array of numbers; use ${use}`);
        const ni = Z.length, nj = Z[0].length;
        if (ni < 2 || nj < 2) throw new Error(`${fn}(): '${Za.name}' needs at least 2 values along each index`);
        let x = Array.from({ length: ni }, (_, i) => i + 1), y = Array.from({ length: nj }, (_, j) => j + 1), ux = '', uy = '', nx = 'i', ny = 'j';
        if (args.length === 3) {
            x = PlotLines.numbers(args[0], 'x', fn); y = PlotLines.numbers(args[1], 'y', fn);
            if (x.length !== ni || y.length !== nj) throw new Error(`${fn}(): '${Za.name}' is ${ni} x ${nj}, so x needs ${ni} values and y ${nj} (it has ${x.length} and ${y.length})`);
            ux = args[0].unit; uy = args[1].unit; nx = args[0].sym ? args[0].name : 'x'; ny = args[1].sym ? args[1].name : 'y';
            x = x.map(v => PlotLines.fromSI(v, ux)); y = y.map(v => PlotLines.fromSI(v, uy));
        }
        const uz = Za.unit, z = Array.from({ length: nj }, (_, j) => Z.map(r => PlotLines.fromSI(r[j], uz)));   // Plotly: z[row = y][col = x]
        const lab = (n, u) => u ? `${n} [${u}]` : n, zn = Za.sym ? Za.name : 'Z', zt = lab(zn, uz);
        const tr = { x, y, z, colorscale: 'Viridis', colorbar: { title: { text: zt } } };
        if (fn === 'contourplot') Object.assign(tr, { type: 'contour', contours: { showlabels: true } });
        else if (fn === 'heatmapplot') tr.type = 'heatmap';
        else tr.type = 'surface';
        const layout = fn === 'surfaceplot'
            ? { scene: { xaxis: { title: lab(nx, ux) }, yaxis: { title: lab(ny, uy) }, zaxis: { title: zt } }, showlegend: false }
            : { xaxis: { title: lab(nx, ux) }, yaxis: { title: lab(ny, uy) }, showlegend: false };
        return { data: [tr], layout, logx: false, logy: false, three: fn === 'surfaceplot', note: `${ni} x ${nj} values of ${zn}` };
    }
}
