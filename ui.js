// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// User interface: console, panes, buttons, plots, files. Runs when the page has loaded.
document.addEventListener('DOMContentLoaded', () => {
    const consoleOutput = document.getElementById('console-output');
    const solveButton = document.getElementById('btn-solve');
    const editor = document.getElementById('editor');
    const variablesContainer = document.getElementById('variables-container');
    const parametricContainer = document.getElementById('parametric-container');

    // ==========================================
    // 1. CONSOLE REDIRECTION SYSTEM
    // ==========================================
    // Redirects console.log and console.error messages directly into the UI Console panel
    // Console text is escaped; 'line 12' and 'lines 3, 5' become links that select that line in the editor
    function appendConsole(text, cls) {
        const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = esc.replace(/\b([Ll]ines?) (\d+(?:, \d+)*)/g, (all, w, nums) =>
            w + ' ' + nums.split(', ').map(n => `<span class="lineref" data-line="${n}" title="Show line ${n}">${n}</span>`).join(', '));
        consoleOutput.insertAdjacentHTML('beforeend', cls ? `<span class="${cls}">${html}</span>` : html);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
    // Line and column of the cursor, next to the Equations title
    const cursorPos = document.getElementById('cursor-pos');
    function showCursor() {
        const before = editor.value.slice(0, editor.selectionStart).split('\n');
        if (cursorPos) cursorPos.textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
    }
    ['input', 'keyup', 'click', 'select', 'focus'].forEach(ev => editor.addEventListener(ev, showCursor));
    function selectLine(n) {
        const lines = editor.value.split('\n');
        if (!(n >= 1 && n <= lines.length)) return;
        const start = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
        editor.focus();
        editor.setSelectionRange(start, start + lines[n - 1].length);
        const cs = getComputedStyle(editor), lh = parseFloat(cs.lineHeight) || 1.2 * parseFloat(cs.fontSize);
        editor.scrollTop = Math.max(0, (n - 1) * lh - editor.clientHeight / 3);
        showCursor();
    }
    consoleOutput.addEventListener('click', (e) => {
        const n = e.target.dataset && e.target.dataset.line; if (n) selectLine(Number(n));
        const a = e.target.dataset && e.target.dataset.ai; if (a !== undefined && a !== '' && typeof ai !== 'undefined') ai.insert(a);
    });

    // ---- Tab and Shift+Tab indent and unindent (the selected lines, or at the cursor), by two spaces, undoably.
    // Esc and then Tab leaves the editor, as the Tab key does elsewhere.
    let tabLeaves = false;
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { tabLeaves = true; return; }
        if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || tabLeaves) { tabLeaves = false; return; }
        e.preventDefault();
        const v = editor.value, a = editor.selectionStart, b = editor.selectionEnd;
        const put = (from, to, text, selA, selB) => {
            editor.setSelectionRange(from, to);
            if (!document.execCommand('insertText', false, text)) { editor.setRangeText(text, from, to); editor.dispatchEvent(new Event('input')); }
            editor.setSelectionRange(selA, selB);
        };
        if (a === b && !e.shiftKey) { put(a, a, '  ', a + 2, a + 2); return; }
        const s0 = v.lastIndexOf('\n', a - 1) + 1, e0 = (b > a && v[b - 1] === '\n') ? b - 1 : (v.indexOf('\n', b) < 0 ? v.length : v.indexOf('\n', b));
        const lines = v.slice(s0, e0).split('\n');
        const out = lines.map(l => e.shiftKey ? l.replace(/^ {1,2}|^\t/, '') : '  ' + l);
        const first = out[0].length - lines[0].length, total = out.join('\n').length - lines.join('\n').length;
        if (!total) return;
        put(s0, e0, out.join('\n'), Math.max(s0, a + first), b + total);
    });

    // ---- Line numbers beside the editor. Lines named in an error or a warning ('line 12', 'lines 3, 5') are marked
    // until the next Solve, Check, table or Min/Max, or until the number of lines changes. Click a number to select the line.
    const gutter = document.querySelector('#editor-gutter > div');
    const flagged = new Map();            // line -> 'err' or 'warn'
    let nLines = 0, curLine = 0;
    function drawGutter() {
        const n = editor.value.split('\n').length;
        if (n !== nLines && nLines) flagged.clear();   // lines moved: the marks would point at the wrong ones
        nLines = n;
        curLine = editor.value.slice(0, editor.selectionStart).split('\n').length;
        let html = '';
        for (let i = 1; i <= n; i++) {
            const c = [i === curLine ? 'cur' : '', flagged.get(i) || ''].filter(Boolean).join(' ');
            html += c ? `<div class="${c}">${i}</div>` : `<div>${i}</div>`;
        }
        gutter.innerHTML = html;
        gutter.style.transform = `translateY(${-editor.scrollTop}px)`;
    }
    function flagLines(message, kind) {
        for (const m of String(message).matchAll(/\b[Ll]ines? (\d+(?:, \d+)*)/g))
            m[1].split(', ').forEach(k => { if (flagged.get(+k) !== 'err') flagged.set(+k, kind); });
        drawGutter();
    }
    ['input', 'keyup', 'click', 'select', 'focus'].forEach(ev => editor.addEventListener(ev, () => {
        const n = editor.value.split('\n').length, c = editor.value.slice(0, editor.selectionStart).split('\n').length;
        if (n !== nLines || c !== curLine) drawGutter();
    }));
    editor.addEventListener('scroll', () => { gutter.style.transform = `translateY(${-editor.scrollTop}px)`; });
    gutter.parentElement.addEventListener('click', (e) => { const n = +e.target.textContent; if (e.target.parentElement === gutter && n) selectLine(n); });
    ['btn-solve', 'btn-check-units', 'btn-run-table', 'btn-run-optimization'].forEach(id =>
        document.getElementById(id).addEventListener('click', () => { flagged.clear(); drawGutter(); }));
    drawGutter();

    // ---- Find and Replace in the Equations pane: Ctrl+F, Ctrl+R or Ctrl+H (see the keyboard shortcuts), or the Find... button ----
    // A textarea hides its selection while the focus is in the bar, so the matches are drawn in a layer behind it.
    // Replacements go through the browser's own editing, so Ctrl+Z undoes them.
    const fb = {};
    ['bar', 'text', 'count', 'case', 'word'].forEach(k => { fb[k] = document.getElementById(k === 'bar' ? 'find-bar' : 'find-' + k); });
    fb.repl = document.getElementById('replace-text');
    const marks = document.querySelector('#editor-marks > div');
    let found = [], cur = -1, findFrom = 0;
    function findRegex() {
        if (!fb.text.value) return null;
        const esc = fb.text.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(fb.word.checked ? `(?<![A-Za-z0-9_])${esc}(?![A-Za-z0-9_])` : esc, fb.case.checked ? 'g' : 'gi');
    }
    const syncMarks = () => { marks.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`; };
    function drawMarks() {
        const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        let html = '', at = 0;
        found.forEach((m, k) => {
            html += esc(editor.value.slice(at, m[0])) + `<mark${k === cur ? ' class="cur"' : ''}>${esc(editor.value.slice(m[0], m[1]))}</mark>`;
            at = m[1];
        });
        marks.innerHTML = found.length ? html + esc(editor.value.slice(at)) + '\n' : '';
        syncMarks();
        fb.count.textContent = !fb.text.value ? '' : found.length ? `${cur + 1} of ${found.length}` : 'no match';
    }
    // Finds every match; with 'from', the current one becomes the first at or after that position (wrapping around)
    function refreshFind(from) {
        const re = fb.bar.hidden ? null : findRegex();
        found = re ? [...editor.value.matchAll(re)].map(m => [m.index, m.index + m[0].length]) : [];
        if (from !== undefined) cur = found.length ? Math.max(0, found.findIndex(m => m[0] >= from)) : -1;
        else cur = Math.min(cur, found.length - 1);
        drawMarks();
    }
    function showMatch() {
        if (cur < 0) return;
        drawMarks();
        editor.setSelectionRange(found[cur][0], found[cur][1]);   // selected when the editor gets the focus back
        const el = marks.querySelector('mark.cur');
        if (el.offsetTop < editor.scrollTop || el.offsetTop + el.offsetHeight > editor.scrollTop + editor.clientHeight)
            editor.scrollTop = el.offsetTop - editor.clientHeight / 3;
        if (el.offsetLeft < editor.scrollLeft || el.offsetLeft + el.offsetWidth > editor.scrollLeft + editor.clientWidth)
            editor.scrollLeft = Math.max(0, el.offsetLeft - editor.clientWidth / 3);
        syncMarks();
        showCursor();
    }
    function step(d) {
        refreshFind();
        if (!found.length) return;
        cur = cur < 0 ? 0 : (cur + d + found.length) % found.length;
        showMatch();
    }
    function replaceText(a, b, text) {
        const back = document.activeElement, top = editor.scrollTop, left = editor.scrollLeft;
        editor.focus(); editor.setSelectionRange(a, b);
        const done = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
        if (!done) { editor.setRangeText(text, a, b, 'end'); editor.dispatchEvent(new Event('input')); }
        editor.scrollTop = top; editor.scrollLeft = left;
        if (back && back !== editor) back.focus();
    }
    function replaceOne() {
        refreshFind();
        if (cur < 0) return;
        const [a, b] = found[cur];
        replaceText(a, b, fb.repl.value);
        refreshFind(a + fb.repl.value.length);
        showMatch();
    }
    function replaceAll() {
        refreshFind();
        const n = found.length;
        if (!n) return;
        const re = findRegex();
        replaceText(0, editor.value.length, editor.value.replace(re, () => fb.repl.value));
        console.log(`Replaced ${n} occurrence${n > 1 ? 's' : ''} of '${fb.text.value}' (Ctrl+Z in the Equations pane undoes this).`);
        refreshFind(0);
    }
    function openFind(toReplace) {
        const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
        if (sel && !sel.includes('\n')) fb.text.value = sel;
        fb.bar.hidden = false;
        findFrom = editor.selectionStart;
        refreshFind(findFrom);
        const box = toReplace && fb.text.value ? fb.repl : fb.text;
        box.focus(); box.select();
    }
    function closeFind() {
        fb.bar.hidden = true; found = []; cur = -1; drawMarks();
        editor.focus();
    }
    editor.addEventListener('scroll', syncMarks);
    editor.addEventListener('input', () => { if (!fb.bar.hidden) refreshFind(); });
    fb.text.addEventListener('input', () => { refreshFind(findFrom); showMatch(); });
    [fb.case, fb.word].forEach(c => c.addEventListener('change', () => { refreshFind(cur >= 0 ? found[cur][0] : findFrom); showMatch(); }));
    document.getElementById('find-next').addEventListener('click', () => step(1));
    document.getElementById('find-prev').addEventListener('click', () => step(-1));
    document.getElementById('find-replace').addEventListener('click', replaceOne);
    document.getElementById('find-all').addEventListener('click', replaceAll);
    document.getElementById('find-close').addEventListener('click', closeFind);
    document.getElementById('btn-find').addEventListener('click', () => openFind(false));
    fb.text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
        else if (e.key === 'Escape') closeFind();
    });
    fb.repl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
        else if (e.key === 'Escape') closeFind();
    });

    // The latest warnings and errors since the last Solve or Check, for the AI assistant (ai.js); its own messages are left out
    const aiMsgs = []; let inAI = false;
    const originalLog = console.log;
    console.log = function (...args) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        if (/^\s*--- /.test(message)) aiMsgs.length = 0;
        appendConsole(message + '\n');
        originalLog.apply(console, args);
    };

    const originalError = console.error;
    console.error = function (...args) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        appendConsole('ERROR: ' + message + '\n', 'con-error');
        if (!inAI) { aiMsgs.push('ERROR: ' + message); if (aiMsgs.length > 20) aiMsgs.shift(); }
        flagLines(message, 'err');
        originalError.apply(console, args);
    };
    const originalWarn = console.warn;
    console.warn = function (...args) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        appendConsole('WARNING: ' + message + '\n', 'con-warn');
        if (!inAI) { aiMsgs.push('WARNING: ' + message); if (aiMsgs.length > 20) aiMsgs.shift(); }
        flagLines(message, 'warn');
        originalWarn.apply(console, args);
    };

    // ==========================================
    // 6. UI MODAL INSPECTOR & RENDER HOOKS
    // ==========================================
    const parser = new EESParser();
    // Results of the last successful Solve or Min/Max (or of an opened session file). Other actions re-parse the
    // equations and clear the values stored in the parser, so Export, Save and the Variables pane read this snapshot,
    // and only while the equation text is still the one that produced it.
    let lastResults = null;
    let savedText = '';   // the equations as last opened or saved: leaving the page with other text asks first
    const sameText = (a, b) => { const n = (t) => String(t).replace(/\r\n?/g, '\n').replace(/\s+$/, ''); return n(a) === n(b); };
    function snapshotResults() {
        const values = new Map();
        parser.variables.forEach((m, n) => { if (m.value !== null && m.value !== undefined) values.set(n, m.value); });
        lastResults = { text: editor.value, values };
    }
    function currentResults() { return (lastResults && sameText(lastResults.text, editor.value)) ? lastResults.values : null; }
    // The table last shown in the Parametric Table pane, for its Export button: header cells 'name [unit]' and rows in display units
    let lastTable = null;
    function headerCell(name) {
        const m = parser.variables.get(name);
        const u = unitOf(name) || (m && m.inferredUnit) || '';
        return u ? `${name} [${u}]` : name;
    }
    // The SI units Check Units found at the last Solve or Check: kept by name, since other actions parse the equations again
    // (which makes new variable records), so that the Variables pane can still show them and check typed units against them
    const inferredKept = new Map();
    function keepInferred() { inferredKept.clear(); parser.variables.forEach((m, n) => { if (m.inferredUnit) inferredKept.set(n, m.inferredUnit); }); }
    const inferredOf = (name, meta) => (meta && meta.inferredUnit) || inferredKept.get(name) || '';
    function unitOf(name) { const m = parser.variables.get(name); return (m && UnitConv.isValid(m.unit)) ? (m.unit || '') : ''; }
    function toDisp(name, si) { return (typeof si === 'number' && Number.isFinite(si)) ? UnitConv.fromSI(si, unitOf(name)) : si; }
    function unitTag(name) { const u = unitOf(name); return u ? ` [${u}]` : ''; }
    // Display order: alphabetical, ignoring case and with numbers in natural order (T2 before T10), with the elements
    // of each array (x[1], x[2], ..., T[1, 2]) together under the array's name, in index order (row by row for two indices)
    function displayOrder(names) {
        const key = (n) => { const m = /^(.*?)\[(.+)\]$/.exec(n); return m ? { g: m[1], idx: m[2].split(',').map(Number) } : { g: n, idx: [] }; };
        const keys = new Map(names.map(n => [n, key(n)]));
        const byName = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
        return names.slice().sort((a, b) => {
            const ka = keys.get(a), kb = keys.get(b);
            if (ka.g !== kb.g) return byName(ka.g, kb.g);
            if (ka.idx.length !== kb.idx.length) return ka.idx.length - kb.idx.length;   // plain x before x[1]
            for (let i = 0; i < ka.idx.length; i++) {
                const d = ka.idx[i] - kb.idx[i];
                if (d) return d;
            }
            return 0;
        });
    }
    function fmtNum(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
        if (v !== 0 && Math.abs(v) < 1e-3) return v.toExponential(5);
        return String(+v.toPrecision(7));
    }
    function inputNum(v) { return (typeof v === 'number' && Number.isFinite(v)) ? String(+v.toPrecision(10)) : ''; }
    const modal = document.getElementById('inspector-modal');

    document.getElementById('inspector-close').addEventListener('click', () => { modal.style.display = 'none'; });

    // Interactive Modal for viewing matrices and array structures
    window.openVariableInspector = function (varName, valueStr) {
        document.getElementById('inspector-title').innerText = `Inspecting: ${varName}`;
        const data = JSON.parse(valueStr);

        let html = '';
        if (data.data && Array.isArray(data.data[0])) { // Matrix Table Grid
            html = '<table class="matrix-table">';
            data.data.forEach(row => {
                html += '<tr>';
                row.forEach(val => html += `<td>${typeof val === 'number' ? val.toFixed(4) : val}</td>`);
                html += '</tr>';
            });
            html += '</table>';
        } else if (Array.isArray(data)) { // Vector/ODE Array List
            html = '<table class="matrix-table"><tr><th>Index</th><th>Value</th></tr>';
            data.forEach((val, idx) => {
                html += `<tr><td>[${idx}]</td><td>${typeof val === 'number' ? val.toFixed(4) : val}</td></tr>`;
            });
            html += '</table>';
        }
        document.getElementById('inspector-body').innerHTML = html;
        modal.style.display = 'flex';
    };

    // Bounds limit the search for unknowns solved iteratively; a value computed directly from others is not held to them,
    // so one that lands outside its bounds is reported
    function warnOutOfBounds() {
        parser.variables.forEach((m, name) => {
            const x = m.value;
            if (typeof x !== 'number' || !Number.isFinite(x) || (x >= m.lower && x <= m.upper)) return;
            const b = (y) => Number.isFinite(y) ? fmtNum(toDisp(name, y)) : (y > 0 ? 'inf' : '-inf');
            console.warn(`${name} = ${fmtNum(toDisp(name, x))}${unitTag(name)} is outside its bounds, ${b(m.lower)} to ${b(m.upper)}. ` +
                `Bounds limit the search for unknowns solved by iteration; this value is computed directly from other ones.`);
        });
    }

    // Update guesses box: remembered in this browser
    const updateBox = document.getElementById('update-guesses');
    try { updateBox.checked = localStorage.getItem('ses-update-guesses') === '1'; } catch (e) { }
    const adopt = () => { if (updateBox.checked) BoundedSolver.adoptGuesses(parser.variables); };
    updateBox.addEventListener('change', () => {
        try { localStorage.setItem('ses-update-guesses', updateBox.checked ? '1' : '0'); } catch (e) { }
        const cur = currentResults();
        if (updateBox.checked && cur) {   // ticked after a solve: take that solution now
            parser.variables.forEach((m, n) => { if (cur.has(n)) m.value = cur.get(n); });
            adopt(); updateVariablesUI(parser.variables);
        }
    });

    // Uncertainty box (off at every visit): after each Solve, the uncertainties given with ± are propagated (Uncertainty in
    // solver.js). The result is kept with the text that produced it, like lastResults.
    const uncBox = document.getElementById('uncertainty');
    let lastUnc = null;
    const curUnc = () => (lastUnc && sameText(lastUnc.text, editor.value)) ? lastUnc : null;
    const fmtUnc = (v) => v === 0 ? '0' : v >= 10 ? String(+v.toPrecision(2)) : v >= 1e-3 ? v.toPrecision(2) : v.toExponential(1);   // two significant digits
    const dispDelta = (unit, si) => Math.abs(UnitConv.fromSI(si, unit) - UnitConv.fromSI(0, unit));   // a difference, in a display unit
    function runUncertainty(base) {
        lastUnc = null;
        try {
            lastUnc = { text: editor.value, ...Uncertainty.run(parser, base) };
            showUncertainty(base);
        } catch (e) { lastUnc = null; console.error(e.message); }
    }
    function showUncertainty(base) {
        try {
            console.log('Uncertainties (first order, independent inputs):');
            displayOrder([...lastUnc.u.keys()]).forEach(n => {
                const u = lastUnc.u.get(n);
                if (u > 0) console.log(`  ${n} = ${fmtNum(toDisp(n, base[n]))} ± ${fmtUnc(dispDelta(unitOf(n), u))}${unitTag(n)}`);
            });
            lastUnc.warnings.forEach(w => console.warn(w));
        } catch (e) { lastUnc = null; console.error(e.message); }
    }
    uncBox.addEventListener('change', () => {
        lastUnc = null;
        const cur = currentResults();
        if (uncBox.checked && cur) {   // ticked after a solve: propagate now
            try { parser.parse(editor.value); } catch (e) { console.error(e.message); return; }
            if (parser.specs.length) { console.log('With spec lines, the uncertainties are propagated at every Solve, ticked or not.'); updateVariablesUI(parser.variables); return; }
            if (parser.uncertain.size) runUncertainty(Object.fromEntries(cur));
        }
        updateVariablesUI(parser.variables);
    });
    // Which inputs make up the uncertainty of a variable: their sensitivities and shares of u^2
    function openUncertainty(name) {
        const uc = curUnc();
        if (!uc || !uc.parts.get(name)) return;
        const parts = uc.parts.get(name).slice().sort((a, b) => b.c - a.c), tot = parts.reduce((s, p) => s + p.c, 0);
        const uy = unitOf(name), per = (ux) => (uy || ux) ? ` [${uy || '-'}/${ux || '-'}]` : '';
        document.getElementById('inspector-title').innerText = `Uncertainty of ${name}: ± ${fmtUnc(dispDelta(uy, uc.u.get(name)))}${unitTag(name)}`;
        document.getElementById('inspector-body').innerHTML = '<table class="matrix-table"><tr><th>Input</th><th>Given ±</th><th>Sensitivity</th><th>Share of u²</th></tr>' +
            parts.map(p => {
                const ux = unitOf(p.input), s = p.s * dispDelta(uy, 1) / dispDelta(ux, 1);
                return `<tr><td>${p.input}</td><td>${fmtUnc(dispDelta(ux, uc.inputs.find(i => i.name === p.input).u))}${unitTag(p.input)}</td><td>${s !== 0 && Math.abs(s) < 1e-3 ? s.toExponential(3) : String(+s.toPrecision(4))}${per(ux)}</td><td>${(100 * p.c / tot).toFixed(1)} %</td></tr>`;
            }).join('') + '</table>';
        modal.style.display = 'flex';
    }

    // Render Variables UI Pane
    function updateVariablesUI(variablesMap) {
        variablesContainer.innerHTML = '';
        const table = document.createElement('table');
        const uc = curUnc(), showUnc = parser.uncertain.size > 0 || !!uc;

        table.innerHTML = `<thead><tr style="background:#eee; text-align:left;">
            <th style="padding:4px;" title="Variable name">Var</th>
            <th style="padding:4px;" title="Starting value for the solver">Guess</th>
            <th style="padding:4px;" title="Lower bound (blank: none)">Min</th>
            <th style="padding:4px;" title="Upper bound (blank: none)">Max</th>
            <th style="padding:4px;" title="Unit for display and input (blank: SI; the gray text is the unit Check found)">Unit</th>
            <th style="padding:4px;" title="Result of the last Solve or Min/Max (click a magnifier to see an array)">Value</th>${showUnc ? `
            <th style="padding:4px;" title="Uncertainty: gray, given with ± in the equations; black, propagated after Solve with Uncertainty ticked (click it to see where it comes from)">±</th>` : ''}</tr></thead><tbody></tbody>`;

        const tbody = table.querySelector('tbody');
        displayOrder([...variablesMap.keys()]).forEach((name) => {
            const meta = variablesMap.get(name);
            const tr = document.createElement('tr');
            const unit = UnitConv.isValid(meta.unit) ? (meta.unit || '') : '';
            const disp = (si) => (typeof si === 'number' && Number.isFinite(si)) ? UnitConv.fromSI(si, unit) : si;

            let solvedDisplay = '-';
            const cur = currentResults();
            const value = cur ? cur.get(name) : meta.value;
            if (value !== null && value !== undefined) {
                if (typeof value === 'object') {
                    const isMatrix = value.isMatrix;
                    const valStr = JSON.stringify(value).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                    solvedDisplay = `<span class="clickable-badge" onclick="openVariableInspector('${name}', '${valStr}')">🔍 ${isMatrix ? 'Matrix' : `Array [${value.length}]`}</span>`;
                } else {
                    solvedDisplay = fmtNum(disp(value));
                }
            }

            tr.innerHTML = `<td style="padding:2px; font-weight:bold;">${name}</td>
                <td style="padding:2px;"><input type="number" step="any" value="${inputNum(disp(meta.guess))}" data-var="${name}" data-field="guess" title="Starting value of ${name} for the solver" style="width:100px; text-align:center;"></td>
                <td style="padding:2px;"><input type="number" step="any" value="${inputNum(disp(meta.lower))}" placeholder="-inf" data-var="${name}" data-field="lower" title="Lower bound of ${name} (blank: none)" style="width:100px; text-align:center;"></td>
                <td style="padding:2px;"><input type="number" step="any" value="${inputNum(disp(meta.upper))}" placeholder="inf" data-var="${name}" data-field="upper" title="Upper bound of ${name} (blank: none)" style="width:100px; text-align:center;"></td>
                <td style="padding:2px; white-space:nowrap;"><input type="text" value="${meta.unit || ''}" placeholder="${inferredOf(name, meta) || '[-]'}" data-var="${name}" data-field="unit" title="Unit of ${name} for display and input. Ctrl+D (or the arrow beside it) copies it to the next row; Ctrl+Shift+D (or Shift+click on the arrow) to every row below with the same dimensions" style="width:100px; text-align:center;"><button type="button" class="fill-down" tabindex="-1" title="Copy this unit to the next row (Ctrl+D); Shift+click: to every row below with the same dimensions (Ctrl+Shift+D)">&darr;</button></td>
                <td class="val" style="padding:2px 4px;">${solvedDisplay}</td>`;
            if (showUnc) {
                const g = parser.uncertain.get(name), u = uc && uc.u.get(name), td = document.createElement('td');
                td.className = 'unc'; td.style.padding = '2px 4px';
                if (g) { td.classList.add('unc-given'); td.textContent = fmtUnc(dispDelta(unit, g.u)); td.title = `Given in the equations (line ${g.line}): ± ${g.given}`; }
                else if (u > 0) td.innerHTML = `<span class="clickable-badge" data-unc="${name}" title="Click to see which inputs contribute">${fmtUnc(dispDelta(unit, u))}</span>`;
                else if (u === 0) td.textContent = '0';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        variablesContainer.appendChild(table);
        table.querySelectorAll('[data-unc]').forEach(el => el.addEventListener('click', () => openUncertainty(el.dataset.unc)));

        // Fill down in the Unit column: Ctrl+D copies the unit to the next row; Ctrl+Shift+D to every row below whose variable
        // has the same dimensions (as Check Units found them). Rows whose dimensions differ are skipped.
        const unitInputs = [...table.querySelectorAll('input[data-field="unit"]')];
        unitInputs.forEach((input, idx) => {
            input.addEventListener('keydown', (e) => {
                if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'd') return;
                e.preventDefault();
                fillDown(input, idx, e.shiftKey);
            });
            const btn = input.nextElementSibling;   // the arrow: the same, by mouse (it keeps the focus in the cell)
            if (btn) { btn.addEventListener('mousedown', (e) => e.preventDefault()); btn.addEventListener('click', (e) => fillDown(input, idx, e.shiftKey)); }
        });
        function fillDown(input, idx, all) {
            const e = { shiftKey: all };
            // dimensions of a row: from the SI unit shown as its placeholder (what Check Units found at the last Solve or Check),
            // or else from the unit already in the row (a unit tag in the equations leaves no placeholder)
            const dimsOf = (unit) => { try { return UnitConsistencyChecker.dimsOfUnit(unit === '-' ? '' : unit).join(); } catch (er) { return null; } };
            const dims = (name) => {
                const el = unitInputs.find(t => t.dataset.var === name);
                if (!el) return null;
                if (el.placeholder && el.placeholder !== '[-]') return dimsOf(el.placeholder);
                const own = ((parser.variables.get(name) || {}).unit || '').trim();
                return own && UnitConv.isValid(own) ? dimsOf(own) : null;
            };
            const u = input.value.trim();
            if (u !== ((parser.variables.get(input.dataset.var) || {}).unit || '')) input.dispatchEvent(new Event('change'));   // this row first
            if (u !== ((parser.variables.get(input.dataset.var) || {}).unit || '')) return;   // refused (unknown unit or wrong dimensions)
            const d0 = u ? dimsOf(u) : dims(input.dataset.var), targets = e.shiftKey ? unitInputs.slice(idx + 1).filter(t => d0 && dims(t.dataset.var) === d0) : unitInputs.slice(idx + 1, idx + 2);
            let n = 0;
            targets.forEach(t => { const m = parser.variables.get(t.dataset.var); if (!m || !UnitConv.isValid(u)) return; if (u && d0 && dims(t.dataset.var) && dims(t.dataset.var) !== d0) return; m.unit = u; n++; });
            if (n) { updateVariablesUI(parser.variables); console.log(`Unit ${u || '(none)'} copied to ${n} variable(s) below.`); }
            else if (e.shiftKey) console.log(`No row below ${input.dataset.var} has the dimensions of ${u || 'its unit'} (as found by Check).`);
            const again = [...variablesContainer.querySelectorAll('input[data-field="unit"]')][e.shiftKey ? idx : idx + 1];
            if (again) again.focus();
        }
        // Edits are entered in the variable's display unit and stored in SI
        table.querySelectorAll('input[data-var]').forEach(input => {
            input.addEventListener('change', (e) => {
                const meta = parser.variables.get(e.target.getAttribute('data-var'));
                if (!meta) return;
                const field = e.target.getAttribute('data-field');
                const raw = e.target.value.trim();
                if (field === 'unit') {
                    if (!UnitConv.isValid(raw)) {
                        console.error(`Unit '${raw}' is not recognized by math.js (use e.g. kPa, kJ/(kg K), W/(m^2 K), degC).`);
                        e.target.value = meta.unit || '';
                        return;
                    }
                    // the dimensions must be those Check Units found for the variable (its SI unit), when it found them
                    const si = inferredOf(e.target.getAttribute('data-var'), meta), U = UnitConsistencyChecker;
                    if (raw && si && si !== '?') {
                        let ok = true;
                        try { const a = U.dimsOfUnit(raw === '-' ? '' : raw), b = U.dimsOfUnit(si === '-' ? '' : si); ok = a.every((v, i) => Math.abs(v - (b[i] || 0)) < 1e-9); } catch (err) { ok = true; }
                        if (!ok) {
                            console.error(`${e.target.getAttribute('data-var')}: '${raw}' does not fit this variable, whose SI unit is ${si}; the unit was not changed.`);
                            e.target.value = meta.unit || '';
                            return;
                        }
                    }
                    meta.unit = raw;
                    updateVariablesUI(parser.variables);   // redisplay guess/min/max/value in the new unit
                    return;
                }
                const v = parseFloat(raw);
                if (field === 'guess') { if (Number.isFinite(v)) meta.guess = UnitConv.toSI(v, meta.unit); return; }
                const name = e.target.getAttribute('data-var'), old = meta[field];
                meta[field] = Number.isFinite(v) ? UnitConv.toSI(v, meta.unit) : (field === 'lower' ? -Infinity : Infinity);
                if (meta.lower > meta.upper) {   // impossible bounds: refused
                    console.error(`${name}: Min (${fmtNum(toDisp(name, meta.lower))}) cannot be above Max (${fmtNum(toDisp(name, meta.upper))})${unitTag(name)}; the change was undone.`);
                    meta[field] = old;
                    e.target.value = inputNum(toDisp(name, old));
                }
            });
        });
    }

    // Global storage to retain sweep/ODE data for dynamic axis/type switching
    window.lastPlotDataset = null;

    // Render Plotly line chart
    // Plot appearance: Light colors (default, for reports) or Dark, text size, log axes, straight or smooth lines between
    // the points (a spline drawn through them: only the drawing changes). Not remembered between visits.
    const plotStyle = { theme: 'light', font: 12, logX: false, logY: false, line: 'linear' };
    const PLOT_THEMES = {
        light: { paper: '#ffffff', plot: '#ffffff', text: '#000000', grid: '#dddddd', zero: '#999999' },
        dark: { paper: '#181825', plot: '#11111b', text: '#cdd6f4', grid: '#313244', zero: '#6c7086' },
    };
    // Plotly layout changes for the current style (applied with relayout, so overlaid curves are kept)
    function plotStyleUpdate() {
        const t = PLOT_THEMES[plotStyle.theme];
        const u = { paper_bgcolor: t.paper, plot_bgcolor: t.plot, 'font.color': t.text, 'font.size': plotStyle.font };
        const pc = document.getElementById('plot-container'), axes = [['xaxis', plotStyle.logX], ['yaxis', plotStyle.logY]];
        if (pc && pc.layout && pc.layout.yaxis2) axes.push(['yaxis2', plotStyle.logY]);   // the second vertical axis (Y2)
        axes.forEach(([a, log]) => Object.assign(u, {
            [a + '.type']: log ? 'log' : 'linear', [a + '.autorange']: true, [a + '.color']: t.text, [a + '.gridcolor']: t.grid, [a + '.zerolinecolor']: t.zero,
            [a + '.linecolor']: t.text, [a + '.showline']: true, [a + '.mirror']: !(pc && pc.layout && pc.layout.yaxis2), [a + '.ticks']: 'outside', [a + '.automargin']: true,
        }));
        return u;
    }
    // A log axis cannot show values <= 0: say how many points are left out
    function warnLogPoints(pc) {
        [['x', plotStyle.logX], ['y', plotStyle.logY]].forEach(([ax, log]) => {
            if (!log) return;
            const n = pc.data.reduce((s, tr) => s + (tr[ax] || []).filter(v => v !== null && !(v > 0)).length, 0);
            if (n) console.warn(`Log ${ax} axis: ${n} point(s) with ${ax} <= 0 cannot be shown.`);
        });
    }
    function applyPlotStyle() {
        const pc = document.getElementById('plot-container');
        if (!pc.data || !pc.data.length) return;
        Plotly.relayout(pc, plotStyleUpdate());
        warnLogPoints(pc);
    }

    function renderPlot(dataArray, xKey, yKey, chartType = 'lines+markers', isOverlay = false) {
        if (typeof Plotly === 'undefined' || !dataArray || dataArray.length === 0) return;

        // Cache dataset so user can switch dropdown axes without re-running sweeps
        window.lastPlotDataset = dataArray;

        const container = document.getElementById('plot-container');

        // Extract numeric arrays for Plotly
        const xVals = dataArray.map(r => r[xKey]);
        const yVals = dataArray.map(r => r[yKey]);

        // Configure trace type
        const style = (tr) => {
            if (chartType === 'bar') {
                tr.type = 'bar';
                tr.marker = { opacity: 0.8 };
            } else {
                tr.type = 'scatter';
                tr.mode = chartType;
                tr.line = { width: 2, shape: plotStyle.line };
                tr.marker = { size: 6 };
            }
            return tr;
        };
        const trace = style({ x: xVals, y: yVals, name: `${yKey} vs ${xKey}` });
        // Y2: a second column on its own vertical axis, on the right
        const y2Key = (document.getElementById('plot-y2-select') || {}).value || '';
        const traces = [trace];
        if (y2Key && y2Key !== yKey && dataArray[0] && y2Key in dataArray[0]) {
            traces.push(style({ x: xVals, y: dataArray.map(r => r[y2Key]), name: `${y2Key} vs ${xKey} (right axis)`, yaxis: 'y2' }));
            if (chartType !== 'bar') traces[1].line.dash = 'dash';
        }

        // Layout: axis titles here; colors, text size and axis types come from plotStyle (plotStyleUpdate)
        const layout = {
            margin: { t: 25, r: 25, l: 50, b: 45 },
            xaxis: { title: headerCell(xKey) },
            yaxis: { title: headerCell(yKey) },
            showlegend: isOverlay || traces.length > 1 // Enable legend automatically when overlaying traces
        };
        if (traces.length > 1) {
            layout.yaxis2 = { title: headerCell(y2Key), overlaying: 'y', side: 'right', showgrid: false };
            layout.margin.r = 60;
            layout.legend = { x: 0.02, y: 0.98 };
        }

        // Plotly modebar (zoom, pan, reset); its camera button is replaced by Save image, which sets size and format
        // The legend can be dragged anywhere, and a curve renamed by clicking its name in the legend
        const config = {
            displayModeBar: true,
            responsive: true,
            modeBarButtonsToRemove: ['toImage'],
            edits: { legendPosition: true, legendText: true }
        };

        // Handle plot overlay vs fresh plot redraw
        if (isOverlay && container.data && container.data.length > 0) {
            Plotly.addTraces('plot-container', traces);
            const more = { showlegend: true };   // two curves or more: show which is which
            if (traces.length > 1 && !container.layout.yaxis2) Object.assign(more, { yaxis2: layout.yaxis2, 'margin.r': 60 });
            Plotly.relayout('plot-container', more);
            if (traces.length > 1) Plotly.relayout('plot-container', plotStyleUpdate());
        } else {
            if (plotStyle.saved) {   // after a plot line: the log axes chosen before it
                Object.assign(plotStyle, plotStyle.saved); plotStyle.saved = null;
                document.getElementById('plot-logx').checked = plotStyle.logX; document.getElementById('plot-logy').checked = plotStyle.logY;
            }
            // PURGE FIX: Wipe previous Plotly instance and bindings from DOM element
            Plotly.purge('plot-container');
            Plotly.newPlot('plot-container', traces, layout, config);
            Plotly.relayout('plot-container', plotStyleUpdate());
        }
        warnLogPoints(container);
    }

    // A plot line (propertyplot, contourplot, heatmapplot, surfaceplot; plots.js), drawn from a set of results in SI.
    // It replaces the plot shown; log x and log y follow the diagram (log P on P-h, for example).
    function drawPlotLine(src, values, noUnit) {   // noUnit: names (kept on the command line) whose values are plain, in SI
        const { sc, units } = PlotLines.scope(values, (k) => (noUnit && noUnit.has(k)) ? '' : unitOf(k));
        const out = PlotLines.build(src, { scope: BoundedSolver.prototype.createScopeWithCoolProp(sc), units, unc: (curUnc() || {}).u });
        if (!plotStyle.saved) plotStyle.saved = { logX: plotStyle.logX, logY: plotStyle.logY };   // put back for the next table plot
        plotStyle.logX = out.logx; plotStyle.logY = out.logy;
        document.getElementById('plot-logx').checked = out.logx; document.getElementById('plot-logy').checked = out.logy;
        const pc = document.getElementById('plot-container');
        Plotly.purge(pc);
        Plotly.newPlot(pc, out.data, Object.assign({ margin: { t: out.layout.title ? 35 : 25, r: 25, l: 55, b: 45 } }, out.layout),
            { displayModeBar: true, responsive: true, modeBarButtonsToRemove: ['toImage'] });
        const st = plotStyleUpdate();
        if (out.three || out.polar) Object.keys(st).forEach(k => { if (/^[xy]axis\./.test(k)) delete st[k]; });
        Plotly.relayout(pc, st);
        return out.note;
    }
    function drawPlotLines(list, values) {
        list.forEach(pl => {
            try { console.log(`Plot, line ${pl.lineNo}: ${drawPlotLine(pl.src, values)}.`); }
            catch (err) { console.error(`Plot, line ${pl.lineNo}: ${err.message}`); }
        });
        if (list.length > 1) console.log(`${list.length} plot lines: the Plot pane shows the last. Type another one on the command line to show it.`);
    }

    // ==========================================
    // 7. EVENT LISTENERS & INITIALIZATION
    // ==========================================
    // Solve Button Click Handler
    solveButton.addEventListener('click', () => {
        try {
            console.log("\n--- Executing Solver Engine ---");
            const result = parser.parse(editor.value);

            // Collect active variables referenced across all parsed AST equations
            const activeVars = new Set();
            parser.parsedASTs.forEach(eq => eq.vars.forEach(v => activeVars.add(v)));

            const numActiveEqs = parser.parsedASTs.length;
            const numActiveVars = activeVars.size;

            // --- DEGREE OF FREEDOM CHECK FOR SOLVE BUTTON ---
            if (numActiveEqs < numActiveVars) {
                const dof = numActiveVars - numActiveEqs;
                const errorMsg = `Under-constrained system (${dof} Degree(s) of Freedom).\n\nYou have ${numActiveEqs} equation(s) and ${numActiveVars} variable(s) [${Array.from(activeVars).join(', ')}].\n\nPlease add ${dof} more equation(s) or uncomment fixed variable assignments to solve.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }
            else if (numActiveEqs > numActiveVars) {
                const errorMsg = `Over-constrained system (${numActiveEqs - numActiveVars} extra equation(s)).\n\nYou have ${numActiveEqs} equation(s) for ${numActiveVars} variable(s).\n\nPlease remove or comment out (//) redundant equations.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }

            console.log(`System Determinate: ${numActiveEqs} equation(s) and ${numActiveVars} variable(s). Solving...`);

            UnitConsistencyChecker.run(parser.parsedASTs, parser.variables); keepInferred();
            const solver = new BoundedSolver(parser.parsedASTs, parser.variables, parser.odeCalls);
            // spec lines: the design value is found by solving again with the propagated uncertainty (DesignSpec, solver.js)
            const ds = parser.specs.length ? DesignSpec.solve(parser, BoundedSolver) : null;
            const solution = ds ? ds.solution : solver.solve();

            // The values are in the Variables pane (as after Min/Max); the Console only confirms, to stay uncluttered
            console.log(`Solution Converged: ${Object.keys(solution).length} variable(s), in the Variables pane.`);

            snapshotResults();
            warnOutOfBounds();
            adopt();
            lastUnc = null;
            if (ds) {
                lastUnc = { text: editor.value, ...ds.unc };
                showUncertainty(solution);
                ds.specs.forEach(sp => {
                    const d = (n, v) => fmtNum(toDisp(n, v)) + unitTag(n), du = fmtUnc(dispDelta(unitOf(sp.name), sp.u)) + unitTag(sp.name);
                    console.log(`Spec, line ${sp.lineNo}: ${sp.name} ${sp.op} ${d(sp.name, sp.value)} with probability ${sp.p}: the equations use ${sp.name} = ${d(sp.name, sp.design)}, a margin of ${sp.z.toFixed(3)} × ${du} (the uncertainty of ${sp.name} with ${sp.by} = ${d(sp.by, solution[sp.by])} held fixed, as in the built design; first order, normal; ${ds.passes} passes).`);
                });
            } else if (parser.uncertain.size) {
                if (uncBox.checked) runUncertainty(solution);
                else console.log(`${parser.uncertain.size} given value(s) carry an uncertainty (±); tick Uncertainty in the Variables pane to propagate them.`);
            }
            updateVariablesUI(parser.variables);

            // Auto-plot ODE output if present
            if (parser.odeCalls.length > 0) {
                const ode = parser.odeCalls[0];
                const plotData = solution[ode.timeVar].map((tVal, idx) => ({
                    [ode.timeVar]: tVal,
                    [ode.stateVar]: solution[ode.stateVar][idx]
                }));

                updatePlotControls(plotData, ode.timeVar, ode.stateVar);
                renderPlot(plotData, plotXSelect.value, plotYSelect.value, plotTypeSelect.value, plotOverlayCheck.checked);
                console.log(`Plotted ODE output: ${ode.stateVar} vs ${ode.timeVar}`);
            }

            // ode blocks: their tables go to the Parametric Table pane; the first state of the first block is plotted
            if (OdeBlocks.tables.length > 0) {
                const cell = 'padding:4px; border:1px solid #ccc; text-align:center;';
                let html = '';
                OdeBlocks.tables.forEach(tb => {
                    html += `<div style="font-size:var(--fs-small); margin:6px 0 2px;"><b>ode block, line ${tb.no}</b>: ${tb.rows.length} rows, ${tb.steps} internal steps</div>`;
                    html += '<table style="width:100%; border-collapse:collapse; font-size:var(--fs-small);"><thead><tr style="background:#eee;">' +
                        tb.cols.map(k => `<th style="${cell}">${k}${unitTag(k)}</th>`).join('') + '</tr></thead><tbody>' +
                        tb.rows.map(r => '<tr>' + r.map((v, i) => `<td style="${cell}">${fmtNum(toDisp(tb.cols[i], v))}</td>`).join('') + '</tr>').join('') +
                        '</tbody></table>';
                });
                parametricContainer.innerHTML = html;
                lastTable = {
                    text: editor.value, tables: OdeBlocks.tables.map(tb => ({
                        title: `ode block, line ${tb.no}`,
                        header: tb.cols.map(headerCell), rows: tb.rows.map(r => r.map((v, i) => toDisp(tb.cols[i], v)))
                    }))
                };
                const tb = OdeBlocks.tables[0];
                const plotData = tb.rows.map(r => Object.fromEntries(tb.cols.map((k, i) => [k, toDisp(k, r[i])])));
                updatePlotControls(plotData, tb.indep, tb.states[0]);
                renderPlot(plotData, plotXSelect.value, plotYSelect.value, plotTypeSelect.value, plotOverlayCheck.checked);
                console.log(`ode block, line ${tb.no}: ${tb.rows.length} output rows (${tb.steps} internal steps); plotted ${plotYSelect.value} vs ${plotXSelect.value}.`);
            }
            if (parser.plots.length) drawPlotLines(parser.plots, currentResults());
        } catch (err) {
            console.error("Solver Error: " + err.message);
        }
    });

    // Run Parametric Table Sweep Button Click Handler
    document.getElementById('btn-run-table').addEventListener('click', () => {
        const pVar = document.getElementById('param-var').value;
        const pStart = parseFloat(document.getElementById('param-start').value);
        const pEnd = parseFloat(document.getElementById('param-end').value);
        const pSteps = parseInt(document.getElementById('param-steps').value);

        try {
            // --- REVISED: AST-Level Degree of Freedom & Variable Sweep Lock Check ---
            parser.parse(editor.value);
            if (parser.specs.length) throw new Error(`Line ${parser.specs[0].lineNo}: spec lines (atleast, atmost) work with Solve only; for a parametric table, write ${parser.specs[0].name} as an ordinary equation.`);

            // Collect all variables referenced across parsed AST equations
            const activeVars = new Set();
            parser.parsedASTs.forEach(eq => eq.vars.forEach(v => activeVars.add(v)));

            if (!activeVars.has(pVar)) {
                const errorMsg = `Parametric variable '${pVar}' was not found in the parsed equations.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }

            const numActiveEqs = parser.parsedASTs.length;
            const numActiveVars = activeVars.size;

            // Degree of Freedom Check: equations must be strictly less than active variables
            if (numActiveEqs >= numActiveVars) {
                const errorMsg = `Parametric sweep requires at least 1 degree of freedom (0 DOF detected).\n\nActive System: ${numActiveEqs} equation(s) and ${numActiveVars} variable(s).\n\nPlease comment out (//) the equation defining '${pVar}' (e.g., // ${pVar} = ...) to unlock it for sweeping.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }

            console.log(`\n--- Running Parametric Sweep for ${pVar} ---`);
            const controller = new ParametricController(parser, BoundedSolver);
            const sUnit = unitOf(pVar);
            const results = controller.runTable(pVar, UnitConv.toSI(pStart, sUnit), UnitConv.toSI(pEnd, sUnit), pSteps, updateBox.checked)
                .map(row => {   // convert every numeric column to its display unit
                    const o = {};
                    for (const k of Object.keys(row)) o[k] = (typeof row[k] === 'number') ? toDisp(k, row[k]) : row[k];
                    return o;
                });

            if (results && results.length > 0) {
                const keys = Object.keys(results[0]).filter(k => typeof results[0][k] === 'number');
                let html = '<table style="width:100%; border-collapse:collapse; font-size:var(--fs-small);"><thead><tr style="background:#eee;">';
                keys.forEach(k => html += `<th style="padding:4px; border:1px solid #ccc;">${k}${unitTag(k)}</th>`);
                html += '</tr></thead><tbody>';

                results.forEach(row => {
                    html += '<tr>';
                    keys.forEach(k => html += `<td style="padding:4px; border:1px solid #ccc; text-align:center;">${fmtNum(row[k])}</td>`);
                    html += '</tr>';
                });
                html += '</tbody></table>';
                parametricContainer.innerHTML = html;
                lastTable = { text: editor.value, tables: [{ title: `parametric table of ${pVar}`, header: keys.map(headerCell), rows: results.map(r => keys.map(k => r[k])) }] };
                if (updateBox.checked) updateVariablesUI(parser.variables);   // the last row's values are now the guesses

                // Plot independent variable vs first dependent variable
                const yVar = keys.find(k => k !== pVar);
                if (yVar) {
                    updatePlotControls(results, pVar, yVar);
                    renderPlot(results, plotXSelect.value, plotYSelect.value, plotTypeSelect.value, plotOverlayCheck.checked);
                    console.log(`Sweep Complete. Plotted ${plotYSelect.value} vs ${plotXSelect.value}.`);
                }
            }
        } catch (err) {
            console.error("Parametric error: " + err.message);
        }
    });

    // --- Optimization Dialog UI Logic ---
    // Free variables are ticked in a list, with Min and Max taken from the Variables pane. Changes made in the dialog
    // apply to Min/Max only; each is kept for this session while the pane's own value of that bound is unchanged.
    const optModal = document.getElementById('optimize-modal');
    const optTarget = document.getElementById('opt-target');
    const optFreeList = document.getElementById('opt-free-list');
    const optEdits = new Map();     // name -> { lo, hi, paneLo, paneHi } (display-unit text)
    let optTicked = new Set();
    const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

    document.getElementById('optimize-close').addEventListener('click', () => { optModal.style.display = 'none'; });

    // Active variables and degrees of freedom of the equations as written
    function activeInfo() {
        const active = new Set();
        parser.parsedASTs.forEach(eq => eq.vars.forEach(v => active.add(v)));
        return { active, dof: active.size - parser.parsedASTs.length };
    }

    // When the "Min/Max" button is clicked, parse equations and fill the target list and the free-variable table
    document.getElementById('btn-optimize').addEventListener('click', () => {
        try {
            parser.parse(editor.value);
            if (parser.specs.length) { console.error(`Line ${parser.specs[0].lineNo}: spec lines (atleast, atmost) work with Solve only; for Min/Max, write ${parser.specs[0].name} as an ordinary equation.`); return; }
            const vars = displayOrder(Array.from(parser.variables.keys()));
            if (vars.length === 0) { alert("No variables found. Please enter equations first."); return; }

            const prevTarget = optTarget.value;
            optTarget.innerHTML = vars.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
            if (vars.includes(prevTarget)) optTarget.value = prevTarget;

            const cell = 'padding: 2px 4px;';
            optFreeList.innerHTML = '<table style="width: 100%; border-collapse: collapse; font-size: 13px;"><thead><tr style="background: #eee;">' +
                `<th style="${cell}"></th><th style="${cell} text-align: left;">Variable</th><th style="${cell}">Min</th><th style="${cell}">Max</th></tr></thead><tbody>` +
                vars.map(v => {
                    const m = parser.variables.get(v), paneLo = inputNum(toDisp(v, m.lower)), paneHi = inputNum(toDisp(v, m.upper));
                    const ed = optEdits.get(v), useLo = ed && ed.paneLo === paneLo, useHi = ed && ed.paneHi === paneHi;
                    return `<tr data-v="${escHtml(v)}" data-pane-lo="${paneLo}" data-pane-hi="${paneHi}">` +
                        `<td style="${cell}"><input type="checkbox" ${optTicked.has(v) ? 'checked' : ''}></td>` +
                        `<td style="${cell}">${escHtml(v)}${unitTag(v)}</td>` +
                        `<td style="${cell}"><input type="number" step="any" class="opt-lo" value="${useLo ? ed.lo : paneLo}" placeholder="-inf" style="width: 90px;"></td>` +
                        `<td style="${cell}"><input type="number" step="any" class="opt-hi" value="${useHi ? ed.hi : paneHi}" placeholder="inf" style="width: 90px;"></td></tr>`;
                }).join('') + '</tbody></table>';

            const { dof } = activeInfo();
            document.getElementById('opt-dof').textContent = dof > 0 ? `the equations leave ${dof} degree(s) of freedom: tick ${dof}.`
                : 'no degree of freedom left: comment out (//) the equations that fix the variables to be optimized.';
            optModal.style.display = 'flex';
        } catch (err) {
            console.error("Modal initialization error: " + err.message);
        }
    });
    // Remember ticks and bound edits made in the dialog
    optFreeList.addEventListener('change', (e) => {
        const tr = e.target.closest('tr[data-v]'); if (!tr) return;
        const v = tr.dataset.v;
        if (e.target.type === 'checkbox') { if (e.target.checked) optTicked.add(v); else optTicked.delete(v); return; }
        optEdits.set(v, { lo: tr.querySelector('.opt-lo').value, hi: tr.querySelector('.opt-hi').value, paneLo: tr.dataset.paneLo, paneHi: tr.dataset.paneHi });
    });

    // Execute the optimization run
    document.getElementById('btn-run-optimization').addEventListener('click', () => {
        const isMax = document.getElementById('opt-direction').value === 'max';
        const objVar = optTarget.value;
        const algo = document.getElementById('opt-algo').value;      // 'auto' (BFGS, Brent for one variable), 'nm' or 'golden'
        const multi = document.getElementById('opt-multistart').checked;
        const rows = [...optFreeList.querySelectorAll('tr[data-v]')].filter(tr => tr.querySelector('input[type=checkbox]').checked);
        const free = rows.map(tr => tr.dataset.v);
        const lo = rows.map(tr => parseFloat(tr.querySelector('.opt-lo').value)), hi = rows.map(tr => parseFloat(tr.querySelector('.opt-hi').value));
        const stop = (msg) => { console.error(msg); alert(msg); };

        if (free.length === 0) return stop('Tick the free variable(s) to vary.');
        if (free.includes(objVar)) return stop(`The target ${objVar} cannot also be a free variable.`);
        const bad = free.findIndex((v, k) => !(Number.isFinite(lo[k]) && Number.isFinite(hi[k]) && lo[k] < hi[k]));
        if (bad >= 0) return stop(`Give ${free[bad]} a finite Min below its Max.`);
        if (algo === 'golden' && (free.length > 1 || multi)) return stop('Golden section works with one free variable and no multistart; choose BFGS or Nelder-Mead.');

        try {
            parser.parse(editor.value);
            const { active, dof } = activeInfo();
            for (const v of [objVar, ...free]) if (!active.has(v)) return stop(`'${v}' was not found in the equations.`);
            if (dof < free.length) {
                return stop(`${free.length} free variable(s) are ticked, but the equations leave ${Math.max(dof, 0)} degree(s) of freedom.\n\n` +
                    `Comment out (//) the equations that fix ${free.join(', ')}, so that each ticked variable is free.`);
            }
            if (dof > free.length) return stop(`The equations leave ${dof} degrees of freedom, but ${free.length} variable(s) are ticked: tick ${dof - free.length} more, or add equations.`);

            const loSI = lo.map((v, k) => UnitConv.toSI(v, unitOf(free[k]))), hiSI = hi.map((v, k) => UnitConv.toSI(v, unitOf(free[k])));
            const show = (v, x) => `${fmtNum(toDisp(v, x))}${unitTag(v)}`;

            if (free.length === 1 && !multi && algo !== 'nm') {
                // One variable: Brent's method (or golden section) on the bracket [Min, Max]
                const optVar = free[0], name = algo === 'golden' ? 'golden section' : "Brent's method";
                console.log(`\n--- Min/Max: ${isMax ? 'maximize' : 'minimize'} ${objVar} over ${optVar} (${name}) ---`);
                const optimizer = new Optimizer1D(parser, BoundedSolver);
                const result = algo === 'golden' ? optimizer.goldenSection(optVar, objVar, loSI[0], hiSI[0], isMax, editor.value)
                    : optimizer.brentsMethod(optVar, objVar, loSI[0], hiSI[0], isMax, editor.value);
                optimizer.evaluateObjective(optVar, result.x, objVar, editor.value);   // leaves the final state in the parser
                console.log(`Optimization Converged in ${result.iter} iterations: Optimal ${optVar} = ${show(optVar, result.x)}, Yielding ${objVar} = ${show(objVar, result.y)}`);
            } else {
                const method = algo === 'nm' ? 'nm' : 'bfgs';
                console.log(`\n--- Min/Max: ${isMax ? 'maximize' : 'minimize'} ${objVar} over ${free.join(', ')} (${method === 'nm' ? 'Nelder-Mead' : 'BFGS'}${multi ? ', multistart' : ''}) ---`);
                const O = new OptimizerND(parser, BoundedSolver, editor.value, free, loSI, hiSI, objVar, isMax);
                const x0 = free.map((v, k) => { const g = O.guess0.get(v); return (g >= loSI[k] && g <= hiSI[k]) ? g : (loSI[k] + hiSI[k]) / 2; });
                const r = O.run(method, x0, multi);
                O.finish(r.x);
                console.log(`${r.converged ? 'Converged' : 'Stopped'} after ${r.iter} iterations (${r.nSolves} solves): ${objVar} = ${show(objVar, r.value)}`);
                free.forEach((v, k) => console.log(`  ${v} = ${show(v, r.x[k])}` +
                    (r.atBound.includes(v) ? (r.x[k] <= loSI[k] ? '   (at its Min)' : '   (at its Max)') : '')));
                if (!r.converged) console.warn('The convergence test was not met within the iteration limit: these values are the best point found.');
                if (multi) {
                    const no = r.optima.length;
                    const failed = r.failedStarts ? ` (${r.failedStarts} could not be solved)` : '';
                    console.log(no > 1 ? `Multistart: ${r.starts} starts${failed}, ${no} different optima found:` : `Multistart: ${r.starts} starts${failed}, all ending at this optimum.`);
                    if (no > 1) r.optima.slice(0, 5).forEach(o => console.log(`  ${objVar} = ${show(objVar, o.value)} at ` +
                        free.map((v, k) => `${v} = ${show(v, o.x[k])}`).join(', ') + ` (from ${o.count} start${o.count > 1 ? 's' : ''})`));
                }
            }
            optModal.style.display = 'none';
            snapshotResults();
            adopt();
            updateVariablesUI(parser.variables);
        } catch (err) {
            console.error("Optimization Error: " + err.message);
        }
    });

    // --- Plot pane logic ---
    const plotXSelect = document.getElementById('plot-x-select');
    const plotYSelect = document.getElementById('plot-y-select');
    const plotTypeSelect = document.getElementById('plot-type-select');
    const plotOverlayCheck = document.getElementById('plot-overlay-check');

    // Populate X/Y selector dropdowns from result keys
    function updatePlotControls(dataset, defaultX, defaultY) {
        if (!dataset || dataset.length === 0) return;

        // Numerical columns only, in the order of the other lists (alphabetical)
        const keys = displayOrder(Object.keys(dataset[0]).filter(k => typeof dataset[0][k] === 'number' || Array.isArray(dataset[0][k])));

        // Keep the user's current Y choice if it still exists in the new dataset
        const prevY = plotYSelect.value;
        const ySel = keys.includes(prevY) ? prevY : defaultY;
        const y2Select = document.getElementById('plot-y2-select'), prevY2 = y2Select.value;

        plotXSelect.innerHTML = '';
        plotYSelect.innerHTML = '';
        y2Select.innerHTML = '<option value="">(none)</option>';

        keys.forEach(k => {
            plotXSelect.innerHTML += `<option value="${k}" ${k === defaultX ? 'selected' : ''}>${k}</option>`;
            plotYSelect.innerHTML += `<option value="${k}" ${k === ySel ? 'selected' : ''}>${k}</option>`;
            y2Select.innerHTML += `<option value="${k}" ${k === prevY2 ? 'selected' : ''}>${k}</option>`;
        });
    }

    // Manual "Replot" button listener
    document.getElementById('btn-update-plot').addEventListener('click', () => {
        if (!window.lastPlotDataset) {
            console.error("No dataset available to plot. Run a parametric sweep or ODE solve first.");
            return;
        }
        const xKey = plotXSelect.value;
        const yKey = plotYSelect.value;
        const chartType = plotTypeSelect.value;
        const isOverlay = plotOverlayCheck.checked;

        renderPlot(window.lastPlotDataset, xKey, yKey, chartType, isOverlay);
        console.log(`Replotted: ${yKey} vs ${xKey} [Type: ${chartType}, Overlay: ${isOverlay}]`);
    });

    // "Clear Plot" button listener
    document.getElementById('btn-clear-table').addEventListener('click', () => {
        parametricContainer.innerHTML = '';
        lastTable = null;
        console.log("Parametric table cleared.");
    });

    document.getElementById('btn-clear-plot').addEventListener('click', () => {
        Plotly.purge('plot-container');
        console.log("Plot canvas cleared.");
    });

    // Log axes, colors and text size: applied at once to the plot shown
    document.getElementById('plot-logx').addEventListener('change', (e) => { plotStyle.logX = e.target.checked; plotStyle.saved = null; applyPlotStyle(); });
    document.getElementById('plot-logy').addEventListener('change', (e) => { plotStyle.logY = e.target.checked; plotStyle.saved = null; applyPlotStyle(); });
    document.getElementById('plot-theme').addEventListener('change', (e) => { plotStyle.theme = e.target.value; applyPlotStyle(); });
    document.getElementById('plot-line').addEventListener('change', (e) => {
        plotStyle.line = e.target.value;
        const pc = document.getElementById('plot-container');
        if (pc.data && pc.data.length) Plotly.restyle(pc, { 'line.shape': plotStyle.line });
    });
    document.getElementById('plot-font-down').addEventListener('click', () => { plotStyle.font = Math.max(8, plotStyle.font - 2); applyPlotStyle(); });
    document.getElementById('plot-font-up').addEventListener('click', () => { plotStyle.font = Math.min(32, plotStyle.font + 2); applyPlotStyle(); });

    // --- Keep the parametric-variable list in sync with the equations ---
    const paramVarSelect = document.getElementById('param-var');
    function refreshParamVarList() {
        let names;
        try {
            parser.parse(editor.value);
            names = displayOrder(Array.from(parser.variables.keys()));
        } catch (err) {
            return;   // equations are mid-edit and don't parse yet: keep the current list
        }
        const prev = paramVarSelect.value;
        paramVarSelect.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
        if (names.includes(prev)) paramVarSelect.value = prev;
    }
    let paramListTimer = null;
    editor.addEventListener('input', () => {
        clearTimeout(paramListTimer);
        paramListTimer = setTimeout(refreshParamVarList, 400);
    });
    refreshParamVarList();

    // --- Replot automatically when any plot control changes ---
    function autoReplot(freshPlot) {
        if (!window.lastPlotDataset) return;
        renderPlot(window.lastPlotDataset, plotXSelect.value, plotYSelect.value,
            plotTypeSelect.value, freshPlot ? false : plotOverlayCheck.checked);
    }
    plotXSelect.addEventListener('change', () => autoReplot(false));
    plotYSelect.addEventListener('change', () => autoReplot(false));
    document.getElementById('plot-y2-select').addEventListener('change', () => autoReplot(false));
    plotTypeSelect.addEventListener('change', () => autoReplot(true));

    document.getElementById('btn-check-units').addEventListener('click', () => {
        try {
            console.log("\n--- Check ---");
            parser.parse(editor.value);
            const { active, dof } = activeInfo();
            const nEq = parser.parsedASTs.length;
            console.log(`Syntax OK: ${nEq} equation(s) and ${active.size} variable(s)` +
                (dof === 0 ? '.' : dof > 0 ? `: ${dof} degree(s) of freedom (fine for Min/Max and Parametric Table, not for Solve).` : `: ${-dof} equation(s) too many.`));
            UnitConsistencyChecker.run(parser.parsedASTs, parser.variables); keepInferred();
            updateVariablesUI(parser.variables);
        } catch (err) {
            console.error("Check error: " + err.message);
        }
    });

    // --- Formatted equations (display only; eqformat.js). The text stays in the editor; click again to edit ---
    const fmtBtn = document.getElementById('btn-format'), fmtView = document.getElementById('formatted');
    let fmtItems = [];
    fmtBtn.addEventListener('click', () => {
        const on = fmtView.hidden;
        if (on) {
            try { fmtItems = EqFormat.render(editor.value); } catch (e) { console.error('Formatted view: ' + e.message); return; }
            document.getElementById('formatted-body').innerHTML = EqFormat.html(fmtItems) || '<p class="fe-empty">No equations.</p>';
            document.getElementById('fe-note').textContent = '';
        }
        fmtView.hidden = !on;
        document.getElementById('editor-gutter').hidden = on;
        document.getElementById('editor-box').hidden = on;
        fmtBtn.textContent = on ? 'Text' : 'Formatted';
        if (!on) editor.focus();
    });
    const copyEqs = (items, what) => {   // as web content (Word makes equations of the MathML) and as LaTeX text
        const note = document.getElementById('fe-note'), blob = (t, type) => new Blob([t], { type });
        const done = () => { note.textContent = `${what} copied: paste into Word, or into a LaTeX editor.`; };
        const fail = () => { note.textContent = 'The browser did not allow copying; select the equations and press Ctrl+C instead.'; };
        if (window.ClipboardItem && navigator.clipboard.write) {
            navigator.clipboard.write([new ClipboardItem({ 'text/html': blob(EqFormat.clipboardHtml(items), 'text/html'), 'text/plain': blob(EqFormat.clipboard(items), 'text/plain') })]).then(done).catch(fail);
        } else navigator.clipboard.writeText(EqFormat.clipboard(items)).then(done).catch(fail);
    };
    document.getElementById('btn-copy-word').addEventListener('click', () => copyEqs(fmtItems, `${fmtItems.filter(it => it.math).length} equation(s)`));
    document.getElementById('formatted-body').addEventListener('click', (e) => {
        const eq = e.target.closest('.fe-eq');
        if (eq) copyEqs([fmtItems.filter(it => it.math)[[...document.querySelectorAll('#formatted-body .fe-eq')].indexOf(eq)]], 'The equation');
    });

    // --- Close modals by clicking the dark backdrop (or pressing Escape) ---
    ['inspector-modal', 'optimize-modal', 'image-modal'].forEach(id => {
        const overlay = document.getElementById(id);
        let downOnBackdrop = false;
        overlay.addEventListener('mousedown', (e) => { downOnBackdrop = (e.target === overlay); });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && downOnBackdrop) overlay.style.display = 'none';
            downOnBackdrop = false;
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('inspector-modal').style.display = 'none';
            document.getElementById('optimize-modal').style.display = 'none';
            document.getElementById('image-modal').style.display = 'none';
        }
    });

    // --- Resizable panes: two columns, drag the gutters; double-click a gutter to reset ---
    (function setupResizablePanes() {
        const container = document.querySelector('.container');
        const byId = (id) => document.getElementById(id);
        const mkDiv = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
        const colL = mkDiv('col'), colR = mkDiv('col');
        colL.append(byId('editor-panel'), mkDiv('gutter gutter-h'), byId('console-panel'));
        colR.append(byId('variables-panel'), mkDiv('gutter gutter-h'), byId('parametric-panel'),
            mkDiv('gutter gutter-h'), byId('plot-panel'));
        container.append(colL, mkDiv('gutter gutter-v'), colR);

        const replot = () => {
            try { const pc = byId('plot-container'); if (pc && pc.data) Plotly.Plots.resize(pc); } catch (e) { }
        };

        function attach(gutter, vertical) {
            const prev = gutter.previousElementSibling, next = gutter.nextElementSibling;
            const siblings = Array.from(gutter.parentElement.children).filter(n => !n.classList.contains('gutter'));
            gutter.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                gutter.setPointerCapture(e.pointerId);
                document.body.style.userSelect = 'none';
                const dim = vertical ? 'width' : 'height';
                const start = vertical ? e.clientX : e.clientY;
                const sizes = siblings.map(n => n.getBoundingClientRect()[dim]);
                const iPrev = siblings.indexOf(prev), iNext = siblings.indexOf(next);
                const total = sizes[iPrev] + sizes[iNext];
                const min = vertical ? 220 : 90;
                siblings.forEach((n, i) => { n.style.flex = `${sizes[i]} 1 0px`; });   // freeze current proportions
                const move = (ev) => {
                    const d = (vertical ? ev.clientX : ev.clientY) - start;
                    const a = Math.min(Math.max(sizes[iPrev] + d, min), total - min);
                    prev.style.flex = `${a} 1 0px`;
                    next.style.flex = `${total - a} 1 0px`;
                    replot();
                };
                const up = (ev) => {
                    gutter.removeEventListener('pointermove', move);
                    gutter.removeEventListener('pointerup', up);
                    document.body.style.userSelect = '';
                    replot();
                };
                gutter.addEventListener('pointermove', move);
                gutter.addEventListener('pointerup', up);
            });
            gutter.addEventListener('dblclick', () => { siblings.forEach(n => { n.style.flex = ''; }); replot(); });
        }
        container.querySelectorAll('.gutter').forEach(g => attach(g, g.classList.contains('gutter-v')));
    })();

    // --- Files: save/open sessions (.ses) and export results ---
    // A session file is plain text: the equations, then one trailing block comment /*@SESSION ... @*/ holding the variable
    // settings and results (the equation parser ignores it like any comment).
    (function () {
        // Saves text (or a Blob) through the native Save dialog when the browser has one (Chrome, Edge); otherwise asks for a
        // name and downloads. Returns the file name, or null if the user cancelled.
        async function saveTextFile(text, suggestedName, exts, description, mime = 'text/plain') {
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description, accept: { [mime]: exts } }] });
                    const w = await handle.createWritable();
                    await w.write(text); await w.close();
                    return handle.name;
                } catch (e) { if (e && e.name === 'AbortError') return null; }   // anything else: use the download fallback
            }
            let name = window.prompt('File name:', suggestedName);
            if (!name || !name.trim()) return null;
            name = name.trim();
            if (!/\.[A-Za-z0-9]+$/.test(name)) name += exts[0];
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));   // keeps browsers from adding .txt
            a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            return name;
        }

        const fileInput = document.getElementById('file-load');
        const SES = /\n?\/\*@SESSION\s*([\s\S]*?)\s*@\*\/\s*$/;
        let lastName = 'equations.ses';

        const norm = (t) => String(t).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
        const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(16); };
        const finite = (x) => (typeof x === 'number' && Number.isFinite(x)) ? x : null;

        function buildFile() {
            const eq = norm(editor.value);
            const cur = currentResults(), withResults = cur !== null;
            const vars = {};
            parser.variables.forEach((m, name) => {
                const v = { guess: finite(m.guess), min: finite(m.lower), max: finite(m.upper), unit: m.unit || '' };
                if (withResults && cur.has(name)) v.value = cur.get(name);
                vars[name] = v;
            });
            const json = JSON.stringify({ v: 1, hash: hash(eq), vars }).replace(/\*\//g, '*\\/');
            return { text: eq + '\n\n/*@SESSION\n' + json + '\n@*/\n', withResults };
        }

        function restore(session, eq) {
            parser.variables = new Map(); parser.saved = new Map();   // start clean: no guesses left over from the previous file
            try { parser.parse(eq); }
            catch (e) { console.error('The equations in this file do not parse: ' + e.message); return; }
            const valid = session && session.hash === hash(norm(eq));
            const vars = (session && session.vars) || {};
            let nRes = 0;
            parser.variables.forEach((m, name) => {
                const s = vars[name]; if (!s) return;
                if (typeof s.guess === 'number') m.guess = s.guess;
                m.lower = (typeof s.min === 'number') ? s.min : -Infinity;
                m.upper = (typeof s.max === 'number') ? s.max : Infinity;
                m.unit = s.unit || '';
                if (valid && s.value !== undefined && s.value !== null) { m.value = s.value; nRes++; }
            });
            lastResults = null;
            if (nRes > 0) snapshotResults();
            if (typeof refreshParamVarList === 'function') refreshParamVarList();
            updateVariablesUI(parser.variables);
            if (session && !valid) console.warn('The equations were edited after this file was saved: guesses, bounds and units were restored, the old results were not.');
            return nRes;
        }

        document.getElementById('btn-load').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
        fileInput.addEventListener('change', () => {
            const f = fileInput.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
                let text = String(reader.result).replace(/\r\n?/g, '\n');
                let session = null;
                const m = text.match(SES);
                if (m) {
                    try { session = JSON.parse(m[1], math.reviver); } catch (e) { console.warn('The saved settings in this file are damaged and were skipped.'); }
                    text = text.slice(0, m.index);
                }
                editor.value = text.replace(/\s+$/, '') + '\n';
                savedText = editor.value;
                lastName = f.name;
                const nRes = restore(session, editor.value);
                console.log(`Opened '${f.name}' (${norm(editor.value).split('\n').length} lines)` +
                    (nRes ? `, with saved results for ${nRes} variable(s).` : '. Press Solve.'));
            };
            reader.onerror = () => console.error(`Could not read '${f.name}'.`);
            reader.readAsText(f);
        });

        document.getElementById('btn-save').addEventListener('click', async () => {
            const { text, withResults } = buildFile();
            const name = await saveTextFile(text, lastName, ['.ses', '.txt', '.eqn'], 'Session file');
            if (!name) return;
            lastName = name; savedText = editor.value;
            console.log(`Saved '${name}': ` + (withResults ? 'equations and results.' : 'equations only (the results are out of date, so they were not saved; Solve first to include them).'));
        });

        // --- Export results: Variable <TAB> Value <TAB> Unit, in the units shown in the Variables pane ---
        let lastResultsName = 'results.txt';
        document.getElementById('btn-export').addEventListener('click', async () => {
            const cur = currentResults();
            if (!cur) {
                console.warn(lastResults ? 'The equations changed after the last Solve: press Solve, then Export.' : 'Nothing to export yet: press Solve first.');
                return;
            }
            const rows = [];
            displayOrder([...parser.variables.keys()]).forEach((name) => {
                const meta = parser.variables.get(name);
                const v = cur.get(name);
                if (v === null || v === undefined) return;
                const declared = UnitConv.isValid(meta.unit) ? (meta.unit || '') : '';
                const unit = declared || meta.inferredUnit || '';
                let val;
                if (typeof v === 'number') val = fmtNum(declared ? UnitConv.fromSI(v, declared) : v);
                else val = math.format(v, { precision: 7 });       // arrays and matrices, in SI
                rows.push(`${name}\t${val}\t${unit}`);
            });
            if (rows.length === 0) { console.warn('Nothing to export yet: press Solve first.'); return; }
            const name = await saveTextFile('Variable\tValue\tUnit\n' + rows.join('\n') + '\n', lastResultsName, ['.txt', '.tsv'], 'Results (tab-separated text)');
            if (!name) return;
            lastResultsName = name;
            console.log(`Exported ${rows.length} result(s) to '${name}'.`);
        });

        // --- Export the Parametric Table pane: a header row 'name [unit]', then one row per line, tab-separated.
        // Several ode blocks: each table under a title line, separated by a blank line ---
        let lastTableName = 'table.txt';
        document.getElementById('btn-export-table').addEventListener('click', async () => {
            if (!lastTable) { console.warn('No table to export yet: run a parametric table, or Solve equations with an ode block.'); return; }
            if (!sameText(lastTable.text, editor.value)) { console.warn('The equations changed after this table was made: run it again, then Export.'); return; }
            const many = lastTable.tables.length > 1;
            const text = lastTable.tables.map(tb => (many ? tb.title + '\n' : '') + tb.header.join('\t') + '\n' +
                tb.rows.map(r => r.map(fmtNum).join('\t')).join('\n') + '\n').join('\n');
            const name = await saveTextFile(text, lastTableName, ['.txt', '.tsv'], 'Table (tab-separated text)');
            if (!name) return;
            lastTableName = name;
            const n = lastTable.tables.reduce((s, tb) => s + tb.rows.length, 0);
            console.log(`Exported ${many ? lastTable.tables.length + ' tables, ' : ''}${n} row(s) to '${name}'.`);
        });

        // --- Save the plot as an image (PNG or SVG), as it looks in the pane but without the controls ---
        const imgModal = document.getElementById('image-modal');
        const imgW = document.getElementById('img-width'), imgH = document.getElementById('img-height');
        const imgFormat = document.getElementById('img-format'), imgScale = document.getElementById('img-scale');
        let lastImageName = 'plot';
        document.getElementById('btn-save-image').addEventListener('click', () => {
            const pc = document.getElementById('plot-container');
            if (!pc.data || !pc.data.length) { console.warn('Nothing to save yet: make a plot first.'); return; }
            if (!imgW.value) { imgW.value = 800; imgH.value = 500; }   // a report-friendly default; later choices are kept
            imgModal.style.display = 'flex';
        });
        document.getElementById('image-close').addEventListener('click', () => { imgModal.style.display = 'none'; });
        imgFormat.addEventListener('change', () => { imgScale.disabled = imgFormat.value === 'svg'; });
        document.getElementById('btn-image-ok').addEventListener('click', async () => {
            const w = Math.round(+imgW.value), h = Math.round(+imgH.value), fmt = imgFormat.value, scale = fmt === 'png' ? +imgScale.value : 1;
            if (!(w >= 100 && w <= 4000 && h >= 100 && h <= 4000)) { alert('Width and height must be between 100 and 4000 pixels.'); return; }
            imgModal.style.display = 'none';
            try {
                const url = await Plotly.toImage(document.getElementById('plot-container'), { format: fmt, width: w, height: h, scale });
                const blob = await (await fetch(url)).blob();
                const name = await saveTextFile(blob, `${lastImageName}.${fmt}`, ['.' + fmt], fmt === 'png' ? 'PNG image' : 'SVG image', fmt === 'png' ? 'image/png' : 'image/svg+xml');
                if (!name) return;
                lastImageName = name.replace(/\.[A-Za-z0-9]+$/, '');
                console.log(`Saved the plot as '${name}' (${w * scale} x ${h * scale} pixels${fmt === 'svg' ? ', vector' : ''}).`);
            } catch (e) { console.error('Could not save the image: ' + e.message); }
        });
    })();

    // --- Console command line: an expression for a quick answer. Everything the equations can use is available
    // (math.js, property functions, user functions) plus the results of the last Solve, in SI. 'x = ...' keeps a
    // value for later lines. derivative(), simplify() and rationalize() also take unquoted formulas.
    // --- AI assistant (ai.js): typed on the command line as  AI: question. It is given the equations, the last results, the
    // variable settings and the latest messages; proposed equations are checked on a copy and inserted only on request.
    const ai = SESAI.create({
        local: (() => { try { return localStorage; } catch (e) { return null; } })(),
        session: (() => { try { return sessionStorage; } catch (e) { return null; } })(),
        env: { EESParser, UnitConsistencyChecker, BoundedSolver, DesignSpec, OdeBlocks, console },
        context() {
            const results = [], settings = [], settingsRaw = [], res = currentResults();
            if (res) res.forEach((v, n) => {
                if (typeof v !== 'number' || !Number.isFinite(v)) return;
                results.push({ name: n, value: +Number(toDisp(n, v)).toPrecision(8), unit: unitOf(n) || inferredKept.get(n) || '' });
            });
            parser.variables.forEach((m, n) => {
                const s = [];
                if (m.guess !== 1 && typeof m.guess === 'number') s.push('guess ' + +Number(toDisp(n, m.guess)).toPrecision(6));
                if (Number.isFinite(m.lower)) s.push('min ' + +Number(toDisp(n, m.lower)).toPrecision(6));
                if (Number.isFinite(m.upper)) s.push('max ' + +Number(toDisp(n, m.upper)).toPrecision(6));
                if (m.unit && unitOf(n)) s.push('display unit [' + m.unit + ']');
                if (!s.length) return;
                settings.push(n + ': ' + s.join(', '));
                settingsRaw.push({ name: n, guess: (typeof m.guess === 'number' && m.guess !== 1) ? m.guess : undefined, lower: Number.isFinite(m.lower) ? m.lower : undefined, upper: Number.isFinite(m.upper) ? m.upper : undefined });
            });
            return { equations: editor.value, results, settings, settingsRaw, messages: aiMsgs.slice() };
        },
        link(id) {
            consoleOutput.insertAdjacentHTML('beforeend', `<span class="ai-insert" data-ai="${id}" role="button" title="Replace the Equations pane with these equations (Ctrl+Z there undoes it)">[Insert these equations]</span>\n`);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        },
        setEquations(t) {
            editor.focus(); editor.setSelectionRange(0, editor.value.length);
            if (!document.execCommand('insertText', false, t)) { editor.setRangeText(t, 0, editor.value.length, 'end'); editor.dispatchEvent(new Event('input')); }
        },
    });

    (function () {
        const input = document.getElementById('console-input');
        if (!input) return;
        const kept = {}, history = [];
        let hpos = 0;
        const SYMBOLIC = { derivative: [0, 1], simplify: [0], rationalize: [0] };   // arguments that are formulas
        const quote = (node) => node.transform((n) => {
            if (!(n.isFunctionNode && n.fn.isSymbolNode && SYMBOLIC[n.fn.name])) return n;
            const args = n.args.map((a, i) => (SYMBOLIC[n.fn.name].includes(i) && !(a.isConstantNode && typeof a.value === 'string'))
                ? new math.ConstantNode(a.toString()) : a);
            return new math.FunctionNode(n.fn, args);
        });
        const show = (v) => {
            if (v && v.isNode) return v.toString();
            if (typeof v === 'function') return `function ${v.name || ''}`.trim();
            if (typeof v === 'number') return String(+v.toPrecision(10));
            if (math.isBigNumber(v)) return v.isInteger() && v.abs().lt(math.bignumber(10).pow(math.config().precision)) ? math.format(v, { notation: 'fixed' }) : v.toString();
            return math.format(v, { precision: 10 });
        };
        // The box grows with its text, up to 8 lines (then it scrolls)
        const fit = () => {
            input.style.height = 'auto';
            const cs = getComputedStyle(input), lh = parseFloat(cs.lineHeight) || 20, pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 2;
            input.style.height = Math.min(input.scrollHeight + 2, 8 * lh + pad) + 'px';
        };
        input.addEventListener('input', fit);
        // Several lines typed or pasted: each is run in turn (a line whose ( or [ is open continues on the next, as in the
        // equations); after AI: the whole text is the question
        const entries = (text) => {
            const out = []; let cur = '', depth = 0;
            text.split('\n').forEach((l) => {
                cur = cur ? cur + ' ' + l.trim() : l.trim();
                for (const ch of l.replace(/'[^']*'|"[^"]*"/g, '')) { if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; }
                if (depth <= 0 && cur) { out.push(cur); cur = ''; depth = 0; }
            });
            if (cur) out.push(cur);
            return out;
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                // only from the first line (up) or the last line (down), so that the arrows still move within several lines
                const v = input.value, at = input.selectionStart;
                if (e.key === 'ArrowUp' ? v.lastIndexOf('\n', at - 1) >= 0 : v.indexOf('\n', input.selectionEnd) >= 0) return;
                if (!history.length) return;
                hpos = Math.min(history.length, Math.max(0, hpos + (e.key === 'ArrowUp' ? -1 : 1)));
                input.value = history[hpos] || '';
                fit();
                e.preventDefault();
                return;
            }
            if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
            e.preventDefault();
            const text = input.value.replace(/\r\n?/g, '\n').trim();
            if (!text) return;
            const secret = /^ai\s*:\s*setup\s+key\s+\S/i.test(text);   // an API key is neither echoed nor kept in the history
            if (!secret) history.push(text);
            hpos = history.length; input.value = ''; fit();
            if (/^ai\s*:/i.test(text)) {
                console.log('> ' + (secret ? text.replace(/(key\s+)\S[\s\S]*$/i, '$1********') : text.replace(/\n/g, '\n  ')));
                inAI = true;
                ai.command(text.replace(/^ai\s*:/i, '')).catch((err) => console.error(err.message)).finally(() => { inAI = false; });
                return;
            }
            entries(text).forEach(run);
        });
        function run(src) {
            console.log('> ' + src);
            if (src === '?') { listShortcuts(); return; }
            if (PlotLines.isCall(src)) {   // a plot line: drawn from the last Solve and from what the command line has kept (x = linspace(0, 1, 20))
                const res = currentResults(), vals = new Map(res || []), mine = new Set();
                Object.keys(kept).forEach((k) => { const v = kept[k]; if (typeof v !== 'function' && !(v && v.isNode)) { vals.set(k, v); mine.add(k); } });
                try { console.log('  ' + drawPlotLine(src, vals, mine)); } catch (err) { console.error(err.message); }
                if (!res && !mine.size) console.warn('  No current results (press Solve first): only what needs none is drawn.');
                return;
            }
            try {
                const node = quote(math.parse(src));
                node.traverse((c) => {
                    if (c.isFunctionNode && c.fn.isSymbolNode && ['createUnit', 'import', 'config'].includes(c.fn.name)) {
                        throw new Error(`${c.fn.name}() is not available: it would change the settings of the solver`);
                    }
                });
                const base = {};
                (currentResults() || new Map()).forEach((v, k) => { base[k] = v; });
                const scope = Object.assign(BoundedSolver.prototype.createScopeWithCoolProp(base), kept);
                // digits(n): significant digits of bignumber() arithmetic (math.js's precision; 64 at the start), console only
                scope.digits = (n) => {
                    n = Number(n);
                    if (!(Number.isInteger(n) && n >= 1 && n <= 100000)) throw new Error('digits(): give a whole number of digits, 1 to 100000');
                    math.config({ precision: n });
                    return `bignumber() arithmetic now keeps ${n} significant digits`;
                };
                const v = Interp.collect(() => node.compile().evaluate(scope));
                if (node.isAssignmentNode && node.object.isSymbolNode && !node.index) kept[node.object.name] = v;
                if (node.isFunctionAssignmentNode) kept[node.name] = v;
                console.log('  ' + show(v));
            } catch (err) {
                console.error(err.message);
            }
        }
    })();

    // ==========================================
    // Keyboard shortcuts: those of EES wherever the browser allows (F1 to F10, Ctrl+K, Ctrl+G, Ctrl+E, Ctrl+U, Ctrl+R, ...),
    // so that its users can keep their habits, and a few of SES's own. Ctrl is Cmd on a Mac, except where a key says Ctrl
    // only (Cmd+H hides the browser). This table is also what ? prints on the command line and what the tooltips show.
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    const conIn = document.getElementById('console-input');
    const uncBoxEl = document.getElementById('uncertainty');
    const modalOpen = () => ['inspector-modal', 'optimize-modal', 'image-modal'].some(id => { const m = document.getElementById(id); return m && getComputedStyle(m).display !== 'none'; });
    // a click on a button, as if by mouse: a Guess, Min, Max or Unit being typed takes effect first
    const press = (id) => {
        const a = document.activeElement;
        if (a && a.tagName === 'INPUT' && a.closest('#variables-container')) a.blur();
        document.getElementById(id).click();
    };
    // the selected lines of the Equations pane (whole lines): [start, end]
    const selLines = () => {
        const v = editor.value, a = editor.selectionStart, b = editor.selectionEnd;
        let e = (b > a && v[b - 1] === '\n') ? b - 1 : v.indexOf('\n', b);
        return [v.lastIndexOf('\n', a - 1) + 1, e < 0 ? v.length : e];
    };
    function toggleLineComments() {
        const [s, e] = selLines(), lines = editor.value.slice(s, e).split('\n');
        if (!lines.some(l => l.trim())) return;
        const all = lines.filter(l => l.trim()).every(l => /^\s*\/\//.test(l));
        const out = lines.map(l => !l.trim() ? l : all ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.replace(/^(\s*)/, '$1// ')).join('\n');
        replaceText(s, e, out); editor.focus(); editor.setSelectionRange(s, s + out.length);
    }
    function toggleBraces() {   // EES's Shift+Ctrl+[: the selection (or the line) between { }, or out of them
        let [s, e] = editor.selectionStart !== editor.selectionEnd ? [editor.selectionStart, editor.selectionEnd] : selLines();
        const t = editor.value.slice(s, e);
        if (!t.trim()) return;
        const m = t.match(/^(\s*)\{\s?([\s\S]*?)\s?\}(\s*)$/), out = m ? m[1] + m[2] + m[3] : '{' + t + '}';
        replaceText(s, e, out); editor.focus(); editor.setSelectionRange(s, s + out.length);
    }
    function updateGuessesNow() {   // EES's Ctrl+G: the last solution becomes the guesses, once
        const cur = currentResults();
        if (!cur) { console.warn(lastResults ? 'The equations changed after the last Solve: Solve first, then Ctrl+G.' : 'Nothing to take as guesses yet: Solve first.'); return; }
        parser.variables.forEach((m, n) => { if (cur.has(n)) m.value = cur.get(n); });
        BoundedSolver.adoptGuesses(parser.variables); updateVariablesUI(parser.variables);
        console.log('The results of the last Solve are now the guesses.');
    }
    function focusVariables(name) {
        const sel = name ? `input[data-var="${CSS.escape(name)}"][data-field="guess"]` : 'input[data-field="guess"]';
        const el = variablesContainer.querySelector(sel);
        if (!el) { console.warn(name ? `${name} has no row in the Variables pane (press Check to bring the pane up to date).` : 'The Variables pane is empty: press Check or Solve.'); return; }
        el.scrollIntoView({ block: 'nearest' }); el.focus(); el.select();
    }
    function nameAtCursor() {   // the variable name around the cursor in the Equations pane, with an index (T[2]) if it has one
        const v = editor.value, at = editor.selectionStart, s = v.lastIndexOf('\n', at - 1) + 1, line = v.slice(s, (v.indexOf('\n', at) + 1 || v.length + 1) - 1);
        const re = /[A-Za-z_][A-Za-z0-9_]*(\[[^\]\n]*\])?/g; let m;
        while ((m = re.exec(line))) if (s + m.index <= at && at <= s + m.index + m[0].length) return m[0].replace(/\s+/g, '');
        return null;
    }
    const SHORTCUTS = [
        { keys: ['F1'], what: 'Help', run: () => window.open('help.html', '_blank'), btn: 'btn-help' },
        { keys: ['F2', 'Ctrl+Enter'], what: 'Solve', run: () => press('btn-solve'), btn: 'btn-solve' },
        { keys: ['F3', 'Ctrl+Shift+Enter'], what: 'Run the parametric table', run: () => press('btn-run-table'), btn: 'btn-run-table' },
        { keys: ['F4'], what: 'Min/Max', run: () => press('btn-optimize'), btn: 'btn-optimize' },
        { keys: ['F5'], what: '(Min/Max Table in EES: not in SES; the page is not reloaded)', run: () => console.warn('F5: SES has no Min/Max Table (and F5 does not reload the page here). Run Min/Max (F4) for each case.') },
        { keys: ['F6'], what: 'Tick Uncertainty and Solve', run: () => { uncBoxEl.checked = true; press('btn-solve'); } },
        { keys: ['F7'], what: '(Uncertainty Propagation Table in EES: not in SES)', run: () => console.warn('F7: SES has no Uncertainty Propagation Table. Tick Uncertainty and Solve (F6) for each case.') },
        { keys: ['F8', 'Ctrl+K'], what: 'Check (syntax, counts, units)', run: () => press('btn-check-units'), btn: 'btn-check-units' },
        { keys: ['F9', 'Ctrl+U'], what: 'Go to the Variables pane', run: () => focusVariables() },
        { keys: ['Ctrl+Shift+V'], what: 'Go to the row, in the Variables pane, of the variable at the cursor', run: () => { const n = nameAtCursor(); if (n) focusVariables(n); else console.warn('Put the cursor on a variable name in the Equations pane first.'); } },
        { keys: ['F10'], what: 'Formatted equations, or back to the text', run: () => press('btn-format'), btn: 'btn-format' },
        { keys: ['Ctrl+E'], what: 'Go to the Equations pane', run: () => editor.focus() },
        { keys: ['Ctrl+I'], what: 'Ask the AI assistant (AI: in the console box)', run: () => { conIn.focus(); if (!conIn.value.trim()) conIn.value = 'AI: '; conIn.setSelectionRange(conIn.value.length, conIn.value.length); } },
        { keys: ['Ctrl+F'], what: 'Find in the equations', run: () => openFind(false), btn: 'btn-find' },
        { keys: ['Ctrl+R', 'Ctrl+H'], what: 'Replace in the equations', ctrlOnly: ['Ctrl+H'], run: () => openFind(true) },
        { keys: ['Ctrl+G'], what: 'Update guesses: the last solution becomes the guesses', run: updateGuessesNow },
        { keys: ['Ctrl+O'], what: 'Open...', run: () => press('btn-load'), btn: 'btn-load' },
        { keys: ['Ctrl+S'], what: 'Save...', run: () => press('btn-save'), btn: 'btn-save' },
        { keys: ['Ctrl+/'], what: 'Comment or uncomment the selected lines with //', editor: true, run: toggleLineComments },
        { keys: ['Ctrl+Shift+['], what: 'Put the selection (or the line) between { }, or take it out', editor: true, run: toggleBraces },
    ];
    const keyName = (k) => isMac ? k.replace(/^Ctrl\+/, 'Cmd+') : k;
    const shown = (s) => s.keys.map(k => (s.ctrlOnly || []).includes(k) ? k : keyName(k));
    function matches(spec, e, ctrlOnly) {
        const parts = spec.split('+'), key = parts.pop() || '+', want = (m) => parts.includes(m);
        const ctrl = ctrlOnly ? (e.ctrlKey && !e.metaKey) : (e.ctrlKey || e.metaKey);
        if (want('Ctrl') !== ctrl || want('Shift') !== e.shiftKey || e.altKey) return false;
        if (key === '/') return e.code === 'Slash' || e.key === '/';
        if (key === '[') return e.code === 'BracketLeft';
        if (key === 'Enter') return e.key === 'Enter';
        return e.key.toLowerCase() === key.toLowerCase();
    }
    document.addEventListener('keydown', (e) => {
        if (e.isComposing || modalOpen()) return;
        for (const s of SHORTCUTS) {
            const k = s.keys.find(spec => matches(spec, e, (s.ctrlOnly || []).includes(spec)));
            if (!k) continue;
            if (s.editor && document.activeElement !== editor) return;
            e.preventDefault(); e.stopPropagation();
            s.run();
            return;
        }
        if (e.key === 'Escape' && document.activeElement === conIn) editor.focus();   // from the console box back to the equations
    }, true);
    SHORTCUTS.forEach(s => { const b = s.btn && document.getElementById(s.btn); if (b) b.title += ` (${shown(s).join(', ')})`; });
    function listShortcuts() {
        console.log('Keyboard shortcuts' + (isMac ? ' (Cmd is Ctrl on Windows and Linux)' : ' (Cmd on a Mac)') + ':\n' +
            SHORTCUTS.map(s => '  ' + shown(s).join(', ').padEnd(24) + s.what).join('\n') +
            '\n  ' + keyName('Ctrl+D').padEnd(24) + 'In a Unit cell: copy the unit to the next row (Shift: to every row below with the same dimensions)' +
            '\n  ' + 'Esc'.padEnd(24) + 'In the console box: back to the Equations pane');
    }
    window.SESShortcuts = SHORTCUTS.map(s => ({ keys: s.keys.slice(), what: s.what }));   // for the tests: every key is in the help
    window.addEventListener('beforeunload', (e) => {
        if (editor.value.trim() && !sameText(editor.value, savedText)) { e.preventDefault(); e.returnValue = ''; }
    });

    // The EES converter (convert.html), opened from this page, sends its result back by a message (pages opened from files
    // cannot call each other directly). Only messages from the converter window opened here are taken.
    let converterWin = null;
    document.getElementById('btn-ees').addEventListener('click', () => { converterWin = window.open('convert.html', '_blank'); });
    window.addEventListener('message', (ev) => {
        if (!converterWin || ev.source !== converterWin || !ev.data || typeof ev.data.sesImport !== 'string') return;
        if (editor.value.trim() && !window.confirm('Replace the equations in the Equations pane with the converted ones?')) return;
        editor.value = ev.data.sesImport;
        editor.dispatchEvent(new Event('input'));
        console.log('Equations converted from EES. Check the converter\'s report, then Check and Solve.');
    });

    console.log("Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz. Free software under the GNU General Public License v3 or later, with no warranty; see Help, About.");
});
