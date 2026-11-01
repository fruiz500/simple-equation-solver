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
    function appendConsole(text) {
        const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        consoleOutput.insertAdjacentHTML('beforeend', esc.replace(/\b([Ll]ines?) (\d+(?:, \d+)*)/g, (all, w, nums) =>
            w + ' ' + nums.split(', ').map(n => `<span class="lineref" data-line="${n}" title="Show line ${n}">${n}</span>`).join(', ')));
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
    consoleOutput.addEventListener('click', (e) => { const n = e.target.dataset && e.target.dataset.line; if (n) selectLine(Number(n)); });

    const originalLog = console.log;
    console.log = function (...args) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        appendConsole(message + '\n');
        originalLog.apply(console, args);
    };

    const originalError = console.error;
    console.error = function (...args) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        appendConsole('ERROR: ' + message + '\n');
        originalError.apply(console, args);
    };
    const originalWarn = console.warn;
    console.warn = function (...args) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        appendConsole('WARNING: ' + message + '\n');
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
    function unitOf(name) { const m = parser.variables.get(name); return (m && UnitConv.isValid(m.unit)) ? (m.unit || '') : ''; }
    function toDisp(name, si) { return (typeof si === 'number' && Number.isFinite(si)) ? UnitConv.fromSI(si, unitOf(name)) : si; }
    function unitTag(name) { const u = unitOf(name); return u ? ` [${u}]` : ''; }
    // Display order: order of first appearance, with the elements of each array (x[1], x[2], ..., T[1, 2]) together,
    // at the place of the first one, and in index order (row by row for two indices)
    function displayOrder(names) {
        const key = (n) => { const m = /^(.*?)\[(.+)\]$/.exec(n); return m ? { g: m[1] + '[', idx: m[2].split(',').map(Number) } : { g: n, idx: [] }; };
        const keys = new Map(names.map(n => [n, key(n)])), first = new Map();
        names.forEach((n, i) => { const g = keys.get(n).g; if (!first.has(g)) first.set(g, i); });
        return names.slice().sort((a, b) => {
            const ka = keys.get(a), kb = keys.get(b);
            if (ka.g !== kb.g) return first.get(ka.g) - first.get(kb.g);
            for (let i = 0; i < Math.max(ka.idx.length, kb.idx.length); i++) {
                const d = (ka.idx[i] || 0) - (kb.idx[i] || 0);
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

    // Render Variables UI Pane
    function updateVariablesUI(variablesMap) {
        variablesContainer.innerHTML = '';
        const table = document.createElement('table');
        table.style.width = '100%'; table.style.fontSize = '16px'; table.style.borderCollapse = 'collapse';

        table.innerHTML = `<thead><tr style="background:#eee; text-align:left;">
            <th style="padding:4px;">Var</th>
            <th style="padding:4px;">Guess</th>
            <th style="padding:4px;">Min</th>
            <th style="padding:4px;">Max</th>
            <th style="padding:4px;">Unit</th>
            <th style="padding:4px;">Value</th></tr></thead><tbody></tbody>`;

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
                <td style="padding:2px;"><input type="number" step="any" value="${inputNum(disp(meta.guess))}" data-var="${name}" data-field="guess" style="width:100px; text-align:center;"></td>
                <td style="padding:2px;"><input type="number" step="any" value="${inputNum(disp(meta.lower))}" placeholder="-inf" data-var="${name}" data-field="lower" style="width:100px; text-align:center;"></td>
                <td style="padding:2px;"><input type="number" step="any" value="${inputNum(disp(meta.upper))}" placeholder="inf" data-var="${name}" data-field="upper" style="width:100px; text-align:center;"></td>
                <td style="padding:2px;"><input type="text" value="${meta.unit || ''}" placeholder="${meta.inferredUnit || '[-]'}" data-var="${name}" data-field="unit" style="width:100px; text-align:center;"></td>
                <td style="padding:2px 4px; font-family:monospace; font-size:14px; font-weight:bold; color:#0056b3;">${solvedDisplay}</td>`;
            tbody.appendChild(tr);
        });
        variablesContainer.appendChild(table);

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
                    meta.unit = raw;
                    updateVariablesUI(parser.variables);   // redisplay guess/min/max/value in the new unit
                    return;
                }
                const v = parseFloat(raw);
                if (field === 'guess') { if (Number.isFinite(v)) meta.guess = UnitConv.toSI(v, meta.unit); }
                else if (field === 'lower') meta.lower = Number.isFinite(v) ? UnitConv.toSI(v, meta.unit) : -Infinity;
                else if (field === 'upper') meta.upper = Number.isFinite(v) ? UnitConv.toSI(v, meta.unit) : Infinity;
            });
        });
    }

    // Global storage to retain sweep/ODE data for dynamic axis/type switching
    window.lastPlotDataset = null;

    // Render Plotly line chart
    // Plot appearance: Light colors (default, for reports) or Dark, text size, log axes. Not remembered between visits.
    const plotStyle = { theme: 'light', font: 12, logX: false, logY: false };
    const PLOT_THEMES = {
        light: { paper: '#ffffff', plot: '#ffffff', text: '#000000', grid: '#dddddd', zero: '#999999' },
        dark: { paper: '#181825', plot: '#11111b', text: '#cdd6f4', grid: '#313244', zero: '#6c7086' },
    };
    // Plotly layout changes for the current style (applied with relayout, so overlaid curves are kept)
    function plotStyleUpdate() {
        const t = PLOT_THEMES[plotStyle.theme];
        const u = { paper_bgcolor: t.paper, plot_bgcolor: t.plot, 'font.color': t.text, 'font.size': plotStyle.font };
        [['xaxis', plotStyle.logX], ['yaxis', plotStyle.logY]].forEach(([a, log]) => Object.assign(u, {
            [a + '.type']: log ? 'log' : 'linear', [a + '.autorange']: true, [a + '.color']: t.text, [a + '.gridcolor']: t.grid, [a + '.zerolinecolor']: t.zero,
            [a + '.linecolor']: t.text, [a + '.showline']: true, [a + '.mirror']: true, [a + '.ticks']: 'outside', [a + '.automargin']: true,
        }));
        return u;
    }
    // A log axis cannot show values <= 0: say how many points are left out
    function warnLogPoints(pc) {
        [['x', plotStyle.logX], ['y', plotStyle.logY]].forEach(([ax, log]) => {
            if (!log) return;
            const n = pc.data.reduce((s, tr) => s + (tr[ax] || []).filter(v => !(v > 0)).length, 0);
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
        let trace = {
            x: xVals,
            y: yVals,
            name: `${yKey} vs ${xKey}`
        };

        if (chartType === 'bar') {
            trace.type = 'bar';
            trace.marker = { opacity: 0.8 };
        } else {
            trace.type = 'scatter';
            trace.mode = chartType;
            trace.line = { width: 2 };
            trace.marker = { size: 6 };
        }

        // Layout: axis titles here; colors, text size and axis types come from plotStyle (plotStyleUpdate)
        const layout = {
            margin: { t: 25, r: 25, l: 50, b: 45 },
            xaxis: { title: headerCell(xKey) },
            yaxis: { title: headerCell(yKey) },
            showlegend: isOverlay // Enable legend automatically when overlaying traces
        };

        // Plotly modebar (zoom, pan, reset); its camera button is replaced by Save image, which sets size and format
        const config = {
            displayModeBar: true,
            responsive: true,
            modeBarButtonsToRemove: ['toImage']
        };

        // Handle plot overlay vs fresh plot redraw
        if (isOverlay && container.data && container.data.length > 0) {
            Plotly.addTraces('plot-container', trace);
        } else {
            // PURGE FIX: Wipe previous Plotly instance and bindings from DOM element
            Plotly.purge('plot-container');
            Plotly.newPlot('plot-container', [trace], layout, config);
            Plotly.relayout('plot-container', plotStyleUpdate());
        }
        warnLogPoints(container);
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

            UnitConsistencyChecker.run(parser.parsedASTs, parser.variables);
            const solver = new BoundedSolver(parser.parsedASTs, parser.variables, parser.odeCalls);
            const solution = solver.solve();

            console.log("Solution Converged:");
            displayOrder(Object.keys(solution)).forEach((varName) => {
                const val = solution[varName];
                if (typeof val === 'number') {
                    const u = unitOf(varName);
                    console.log(`  ${varName} = ${fmtNum(toDisp(varName, val))}${u ? ' [' + u + ']' : ''}`);
                }
                else console.log(`  ${varName} = [Data Structure]`);
            });

            snapshotResults();
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
                    html += `<div style="font-size:12px; margin:6px 0 2px;"><b>ode block, line ${tb.no}</b>: ${tb.rows.length} rows, ${tb.steps} internal steps</div>`;
                    html += '<table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#eee;">' +
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
            const results = controller.runTable(pVar, UnitConv.toSI(pStart, sUnit), UnitConv.toSI(pEnd, sUnit), pSteps)
                .map(row => {   // convert every numeric column to its display unit
                    const o = {};
                    for (const k of Object.keys(row)) o[k] = (typeof row[k] === 'number') ? toDisp(k, row[k]) : row[k];
                    return o;
                });

            if (results && results.length > 0) {
                const keys = Object.keys(results[0]).filter(k => typeof results[0][k] === 'number');
                let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#eee;">';
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
            updateVariablesUI(parser.variables);
        } catch (err) {
            console.error("Optimization Error: " + err.message);
        }
    });

    // --- Plot Control Logic ---
    const plotXSelect = document.getElementById('plot-x-select');
    const plotYSelect = document.getElementById('plot-y-select');
    const plotTypeSelect = document.getElementById('plot-type-select');
    const plotOverlayCheck = document.getElementById('plot-overlay-check');

    // Populate X/Y selector dropdowns from result keys
    function updatePlotControls(dataset, defaultX, defaultY) {
        if (!dataset || dataset.length === 0) return;

        // Get numerical keys only
        const keys = Object.keys(dataset[0]).filter(k => typeof dataset[0][k] === 'number' || Array.isArray(dataset[0][k]));

        // Keep the user's current Y choice if it still exists in the new dataset
        const prevY = plotYSelect.value;
        const ySel = keys.includes(prevY) ? prevY : defaultY;

        plotXSelect.innerHTML = '';
        plotYSelect.innerHTML = '';

        keys.forEach(k => {
            plotXSelect.innerHTML += `<option value="${k}" ${k === defaultX ? 'selected' : ''}>${k}</option>`;
            plotYSelect.innerHTML += `<option value="${k}" ${k === ySel ? 'selected' : ''}>${k}</option>`;
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
    document.getElementById('btn-clear-plot').addEventListener('click', () => {
        Plotly.purge('plot-container');
        console.log("Plot canvas cleared.");
    });

    // Log axes, colors and text size: applied at once to the plot shown
    document.getElementById('plot-logx').addEventListener('change', (e) => { plotStyle.logX = e.target.checked; applyPlotStyle(); });
    document.getElementById('plot-logy').addEventListener('change', (e) => { plotStyle.logY = e.target.checked; applyPlotStyle(); });
    document.getElementById('plot-theme').addEventListener('change', (e) => { plotStyle.theme = e.target.value; applyPlotStyle(); });
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
    plotTypeSelect.addEventListener('change', () => autoReplot(true));

    document.getElementById('btn-check-units').addEventListener('click', () => {
        try {
            console.log("\n--- Unit Check ---");
            parser.parse(editor.value);
            UnitConsistencyChecker.run(parser.parsedASTs, parser.variables);
            updateVariablesUI(parser.variables);
        } catch (err) {
            console.error("Unit check error: " + err.message);
        }
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
            parser.variables = new Map();             // start clean: no guesses left over from the previous file
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
            lastName = name;
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
            return math.format(v, { precision: 10 });
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                if (!history.length) return;
                hpos = Math.min(history.length, Math.max(0, hpos + (e.key === 'ArrowUp' ? -1 : 1)));
                input.value = history[hpos] || '';
                e.preventDefault();
                return;
            }
            if (e.key !== 'Enter') return;
            const src = input.value.trim();
            if (!src) return;
            history.push(src); hpos = history.length; input.value = '';
            console.log('> ' + src);
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
                const v = Interp.collect(() => node.compile().evaluate(scope));
                if (node.isAssignmentNode && node.object.isSymbolNode && !node.index) kept[node.object.name] = v;
                if (node.isFunctionAssignmentNode) kept[node.name] = v;
                console.log('  ' + show(v));
            } catch (err) {
                console.error(err.message);
            }
        });
    })();

    console.log("SES Engine Initialized (Complete Build with Documentation).");
});
