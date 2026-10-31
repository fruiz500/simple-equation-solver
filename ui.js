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

        // Layout styling matching app theme
        const layout = {
            margin: { t: 25, r: 25, l: 50, b: 45 },
            paper_bgcolor: '#181825',
            plot_bgcolor: '#11111b',
            font: { color: '#cdd6f4', size: 11 },
            xaxis: { title: xKey + unitTag(xKey), color: '#cdd6f4', gridcolor: '#313244', autorange: true },
            yaxis: { title: yKey + unitTag(yKey), color: '#cdd6f4', gridcolor: '#313244', autorange: true },
            showlegend: isOverlay // Enable legend automatically when overlaying traces
        };

        // Standard Plotly configuration with active modebar & native double-click reset
        const config = {
            displayModeBar: true,
            responsive: true
        };

        // Handle plot overlay vs fresh plot redraw
        if (isOverlay && container.data && container.data.length > 0) {
            Plotly.addTraces('plot-container', trace);
        } else {
            // PURGE FIX: Wipe previous Plotly instance and bindings from DOM element
            Plotly.purge('plot-container');
            Plotly.newPlot('plot-container', [trace], layout, config);
        }
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
                lastTable = { text: editor.value, tables: OdeBlocks.tables.map(tb => ({ title: `ode block, line ${tb.no}`,
                    header: tb.cols.map(headerCell), rows: tb.rows.map(r => r.map((v, i) => toDisp(tb.cols[i], v))) })) };
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
    const optModal = document.getElementById('optimize-modal');
    const btnOptimize = document.getElementById('btn-optimize');
    const optTarget = document.getElementById('opt-target');
    const optFree = document.getElementById('opt-free');

    // Close modal handler
    document.getElementById('optimize-close').addEventListener('click', () => {
        optModal.style.display = 'none';
    });

    // When the "Min/Max" button is clicked, parse equations and populate dropdowns
    document.getElementById('btn-optimize').addEventListener('click', () => {
        try {
            parser.parse(editor.value);
            const vars = displayOrder(Array.from(parser.variables.keys()));

            if (vars.length === 0) {
                alert("No variables found. Please enter equations first.");
                return;
            }

            const targetSelect = document.getElementById('opt-target');
            const freeSelect = document.getElementById('opt-free');

            const prevTarget = targetSelect.value, prevFree = freeSelect.value;
            const options = vars.map(v => `<option value="${v}">${v}</option>`).join('');
            targetSelect.innerHTML = options;
            freeSelect.innerHTML = options;

            // Keep the previous choices if those variables still exist; otherwise target = first, free = second
            if (vars.includes(prevTarget)) targetSelect.value = prevTarget;
            if (vars.includes(prevFree)) freeSelect.value = prevFree;
            else if (vars.length > 1) freeSelect.selectedIndex = 1;

            document.getElementById('optimize-modal').style.display = 'flex';
        } catch (err) {
            console.error("Modal initialization error: " + err.message);
        }
    });

    // Execute the optimization run
    document.getElementById('btn-run-optimization').addEventListener('click', () => {
        const optDirection = document.getElementById('opt-direction').value; // 'max' or 'min'
        const objVar = document.getElementById('opt-target').value;    // Target / Objective
        const optVar = document.getElementById('opt-free').value;      // Free / Independent
        const lower = parseFloat(document.getElementById('opt-lower').value);
        const upper = parseFloat(document.getElementById('opt-upper').value);
        if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) {
            alert('Enter numeric bounds with lower < upper.'); return;
        }
        const algo = document.getElementById('opt-algo').value;      // 'brent' or 'golden'

        try {
            console.log(`\n--- Executing 1D Optimization (${optDirection.toUpperCase()} ${objVar} w.r.t. ${optVar} using ${algo}) ---`);
            parser.parse(editor.value);

            // Collect active variables referenced across all parsed AST equations
            const activeVars = new Set();
            parser.parsedASTs.forEach(eq => eq.vars.forEach(v => activeVars.add(v)));

            if (!activeVars.has(optVar)) {
                const errorMsg = `Free variable '${optVar}' was not found in the parsed equations.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }

            if (!activeVars.has(objVar)) {
                const errorMsg = `Target objective variable '${objVar}' was not found in the parsed equations.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }

            const numActiveEqs = parser.parsedASTs.length;
            const numActiveVars = activeVars.size;

            // --- DEGREE OF FREEDOM CHECK ---
            // Optimization requires exactly 1 free variable (1 Degree of Freedom)
            if (numActiveEqs >= numActiveVars) {
                const errorMsg = `Optimization requires 1 degree of freedom (0 DOF detected).\n\nYou currently have ${numActiveEqs} equation(s) and ${numActiveVars} variable(s).\n\nPlease comment out (//) or remove the equation defining '${optVar}' (e.g., // ${optVar} = ...) to unlock it for optimization.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            } else if ((numActiveVars - numActiveEqs) > 1) {
                const dof = numActiveVars - numActiveEqs;
                const errorMsg = `System is under-constrained for 1D optimization (${dof} Degrees of Freedom detected).\n\nPlease add ${dof - 1} more equation(s) so that exactly 1 degree of freedom remains for '${optVar}'.`;
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }

            const isMax = optDirection === 'max';
            const fUnit = unitOf(optVar);
            const lowerSI = UnitConv.toSI(lower, fUnit), upperSI = UnitConv.toSI(upper, fUnit);
            const optimizer = new Optimizer1D(parser, BoundedSolver);

            let result;
            if (algo === 'golden') {
                result = optimizer.goldenSection(optVar, objVar, lowerSI, upperSI, isMax, editor.value);
            } else {
                result = optimizer.brentsMethod(optVar, objVar, lowerSI, upperSI, isMax, editor.value);
            }

            // Re-evaluate objective at the final optimal value to set final state in parser
            optimizer.evaluateObjective(optVar, result.x, objVar, editor.value);

            console.log(`Optimization Converged in ${result.iter} iterations: Optimal ${optVar} = ${fmtNum(toDisp(optVar, result.x))}${unitTag(optVar)}, Yielding ${objVar} = ${fmtNum(toDisp(objVar, result.y))}${unitTag(objVar)}`);

            // Hide modal after successful run
            document.getElementById('optimize-modal').style.display = 'none';

            // Refresh UI table
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
    ['inspector-modal', 'optimize-modal'].forEach(id => {
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
        // Saves text through the native Save dialog when the browser has one (Chrome, Edge); otherwise asks for a name and downloads.
        // Returns the file name, or null if the user cancelled.
        async function saveTextFile(text, suggestedName, exts, description) {
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description, accept: { 'text/plain': exts } }] });
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
                const v = node.compile().evaluate(scope);
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
