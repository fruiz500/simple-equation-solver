// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// AI assistant, used from the Console command line:  AI: question.  The user brings a key for Anthropic, OpenAI, Gemini or
// OpenRouter, or the address of a local server (Ollama, LM Studio, ...). The key is kept only in this browser and goes only to
// the provider. A request carries the question, the equations, the last results, the variable settings and the latest error
// messages; `AI: show` prints exactly that. Equations the model proposes are checked on a copy (parse, Check Units, Solve),
// the problems are sent back for a few rounds, and the answer is inserted into the Equations pane only when the user asks.
// This file has no dependence on the page: ui.js passes in what it needs (SESAI.create), so tests can use a mock provider.
const SESAI = (() => {
    // ---- providers ---------------------------------------------------------------------------------------------------
    // style: how the request and the reply are shaped. fixed: the address cannot be changed. tokens: name of the output limit.
    const PROVIDERS = {
        anthropic: { label: 'Anthropic', style: 'anthropic', base: 'https://api.anthropic.com/v1', fixed: true, key: true, model: 'claude-sonnet-5-5' },
        openai: { label: 'OpenAI', style: 'compat', base: 'https://api.openai.com/v1', fixed: true, key: true, tokens: 'max_completion_tokens' },
        gemini: { label: 'Google Gemini', style: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', fixed: true, key: true },
        openrouter: { label: 'OpenRouter', style: 'compat', base: 'https://openrouter.ai/api/v1', fixed: true, key: true, tokens: 'max_tokens' },
        ollama: { label: 'Ollama (this computer)', style: 'compat', base: 'http://localhost:11434/v1', key: false, tokens: 'max_tokens' },
        custom: { label: 'an OpenAI-compatible server', style: 'compat', base: '', key: false, tokens: 'max_tokens' },
    };
    const MAX_OUT = 4096, TIMEOUT_MS = 180000, MAX_HISTORY = 12;

    // The request for one call: { url, headers, body }. messages = [{ role: 'user'|'assistant', content }].
    function buildRequest(provider, o, system, messages) {
        const P = PROVIDERS[provider], base = (o.base || P.base).replace(/\/+$/, '');
        if (P.style === 'anthropic') {
            return { url: base + '/messages', headers: { 'content-type': 'application/json', 'x-api-key': o.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
                body: { model: o.model, max_tokens: MAX_OUT, system, messages } };
        }
        if (P.style === 'gemini') {
            return { url: `${base}/models/${encodeURIComponent(o.model)}:generateContent`, headers: { 'content-type': 'application/json', 'x-goog-api-key': o.key },
                body: { systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens: MAX_OUT },
                    contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) } };
        }
        const headers = { 'content-type': 'application/json' };
        if (o.key) headers.authorization = 'Bearer ' + o.key;
        return { url: base + '/chat/completions', headers,
            body: { model: o.model, messages: [{ role: 'system', content: system }, ...messages], [P.tokens || 'max_tokens']: MAX_OUT } };
    }
    // { text, truncated } from the JSON reply
    function parseReply(provider, j) {
        const style = PROVIDERS[provider].style;
        let text = '', cut = false;
        if (style === 'anthropic') { text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''); cut = j.stop_reason === 'max_tokens'; }
        else if (style === 'gemini') {
            const c = (j.candidates || [])[0];
            text = c && c.content && c.content.parts ? c.content.parts.map(p => p.text || '').join('') : ''; cut = !!c && c.finishReason === 'MAX_TOKENS';
            if (!text && j.promptFeedback && j.promptFeedback.blockReason) throw new Error('The request was blocked by the provider (' + j.promptFeedback.blockReason + ').');
        } else {
            const c = (j.choices || [])[0];
            const m = c && c.message ? c.message.content : '';
            text = Array.isArray(m) ? m.map(p => p.text || '').join('') : (m || ''); cut = !!c && c.finish_reason === 'length';
        }
        if (!text.trim()) throw new Error('The model returned no text' + (cut ? ' (the output limit was reached while it was still reasoning; try another model).' : '.'));
        return { text, truncated: cut };
    }
    // The message of an error reply
    function errorText(status, body) {
        let msg = '';
        try {
            let j = JSON.parse(body); if (Array.isArray(j)) j = j[0];
            msg = (j && j.error && (j.error.message || (typeof j.error === 'string' ? j.error : ''))) || (j && j.message) || '';
        } catch (e) { msg = String(body || '').slice(0, 300); }
        return `${status}${msg ? ': ' + msg : ''}`;
    }
    function modelsRequest(provider, o) {
        const P = PROVIDERS[provider], base = (o.base || P.base).replace(/\/+$/, '');
        if (P.style === 'anthropic') return { url: base + '/models?limit=1000', headers: { 'x-api-key': o.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } };
        if (P.style === 'gemini') return { url: base + '/models?pageSize=1000', headers: { 'x-goog-api-key': o.key } };
        return { url: base + '/models', headers: o.key ? { authorization: 'Bearer ' + o.key } : {} };
    }
    function parseModels(provider, j) {
        if (PROVIDERS[provider].style === 'gemini') return (j.models || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''));
        let ids = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
        if (provider === 'openai') ids = ids.filter(i => /^(gpt|o\d|chatgpt)/.test(i) && !/(embed|whisper|tts|audio|realtime|image|transcribe|moderation|search|instruct)/.test(i));
        return ids;
    }

    // ---- what the model is told ---------------------------------------------------------------------------------------
    // The syntax card. The function lists come from the program itself, so they are always the ones that exist.
    // Added only when the question is about symbolic work, so that the other questions do not carry it
    const SYMBOLIC_RE = /deriv|differentiat|integra|antiderivative|symbolic|simplif|identity|prove|expand|factor|closed form/i;
    const SYMBOLIC = ' SES can differentiate a written-out formula (derivative(expression, x)) and integrate numerically (integral()), but cannot simplify, integrate or solve symbolically: do that yourself, step by step, then give a ses block comparing your result with derivative() or integral() (an identity: both sides) at three or more values, not with a finite difference. Show the differences and say only that they should be near zero, within rounding, with no size. In derivative() the variable is a plain or subscripted name (x, x_1), not x[1]; never name a variable e or pi.';
    function systemPrompt(question) {
        const symbolic = SYMBOLIC_RE.test(String(question || '')) ? SYMBOLIC : '';
        const names = (typeof ThermoEngine !== 'undefined' && ThermoEngine.FUNCS) ? Object.keys(ThermoEngine.FUNCS).join(', ') : '';
        let corr = '';
        if (typeof CORRELATIONS !== 'undefined') {
            const g = new Map();
            Object.keys(CORRELATIONS).forEach(n => {
                const c = CORRELATIONS[n], k = c.group || 'Other';
                if (!g.has(k)) g.set(k, []);
                g.get(k).push(`${n}(${(c.argn || c.args || []).join(', ')})`);
            });
            corr = [...g].map(([k, v]) => `${k}: ${v.join('; ')}`).join('\n');
        }
        return `You are the assistant inside SES (Simple Equation Solver), a browser program that solves systems of equations numerically, with property data, units, plots and a Matlab-like command line. It is used in courses in thermodynamics and heat transfer, and equally for any other engineering, science or mathematics problem. The user types equations in any order, one per line, and SES solves them together. Answer concisely and with care. For a numerical problem, never state a result as if you had solved it: SES computes; say what to Solve, or use the results the user sent.

HOW TO PROPOSE EQUATIONS
- Put the COMPLETE set of equations that should be in the Equations pane in ONE fenced block tagged ses (three backticks, then ses; not <ses> tags), like this:
\`\`\`ses
P_1 = 10 [kPa]          // condenser pressure
h_1 = enthalpy('water', 'P', P_1, 'Q', 0)
\`\`\`
  When the user inserts it, it replaces the pane, so keep the user's existing lines and comments unless you change them. Nothing but equations and comments in that block; explain outside it, briefly.
- The number of equations must equal the number of unknowns. List every input with its value and unit. Comment the source of data and the assumptions with //.
- Guesses, bounds and display units are set by the user in the Variables pane, not in the equations. When a property function needs a good starting value, say so in your text (for example: set the guess of T_2 to about 400 K).
- Do not invent property data: use the property functions, or give the source in a comment. Use only the functions listed below; if unsure what the arguments of one are, say so instead of guessing.
- SES checks a proposed block on a copy (syntax, units, Solve) and may send you the problems to fix. Reply to those with the complete corrected block.

EQUATION SYNTAX
- One equation per line with exactly one =; either side may be an expression (x^2 + y = 7). Order does not matter. Several per line with ";". Comments: // to the end of the line, /* ... */, { ... }. A line whose ( or [ is open continues on the next line.
- Variable names: letters, digits, underscores, starting with a letter; case sensitive (T_1, m_dot, h_fg). Arrays: x[1], x[2], index from 1; x[1:N] is a list (sum(x[1:N])). Text variables end in $: fluid$ = 'water'.
- Everything is computed in SI. A unit tag on a number converts it: P = 2 [bar], T = 77 [degF], h = 100 [kJ/kg], U = 5 [W/(m^2 K)]. Untagged values are SI. Temperatures in degC and degF are absolute temperatures; label differences in K. SES checks dimensional consistency (Check).
- Operators + - * / ^ and parentheses. Every math.js function; ln(x) is the natural log, log10 base 10; pi, e; if(cond, a, b); comparison < > <= >= == != with and, or, not. Physical constants: constant('sigma'), constant('gravity'), constant('gasconstant'). Values must stay real (use cbrt for a real cube root).
- Uncertainty: T_1 = 400 [degC] +- 1 [K]  or  P_1 = 3000 [kPa] +- 1 %.
- integral(expression, x, a, b); derivative(expression, x) (symbolic, for written-out formulas); interpolate(x_table, y_table, x) with an optional 'spline' fourth argument, for data typed as lists: T_tab = [100, 200, 300].
- Plot lines (a call alone on a line, drawn in the Plot pane after Solve, from arrays of the results such as T[1], T[2], ...): plot(x, y), plot(x, y, 'r--'), semilogx, semilogy, loglog, scatter(x, y), bar(x, y), hist(data, bins), errorbar(x, y, e), stairs(x, y), polarplot(theta, r), plot3(x, y, z), contourplot(x, y, Z), heatmapplot(x, y, Z), surfaceplot(x, y, Z), fplot('sin(x)', 0, 6) and fsurf, fcontour, fimplicit, fquiver for an expression given as a text, text(x, y, 'label') and arrow(x1, y1, x2, y2) for notes on the plot above them, propertyplot('water', 'Ts', 'cycle') for a property diagram with the saturation dome. Use them only when a plot is asked for.
- Repeated equations: duplicate i = 2 : N-1 ... end writes the lines for each i (finite differences; no loops that run in order).
- ODE: ode t = 0 : t_end : interval  with lines  T' = expression  and  T(0) = value  and optional helper lines, then end. After the block T holds the end value. Add , stiff to the header for stiff systems.
- Steps, loops and branches that must run in order go in a user function:  function y = name(a, b) ... end  with if/elseif/else/end, for, while, return; it sees only its arguments.
- Property functions take SI inputs and give SI results. Forms: f(fluid, T, P)  or  f(fluid, 'key1', v1, 'key2', v2)  with keys 'T' 'P' 'H' 'S' 'D' 'v' 'U' 'Q' (quality, 0 to 1). Fluids are CoolProp names ('water', 'R134a', 'air', 'nitrogen', ...). Saturation: saturationtemperature(fluid, P), saturationpressure(fluid, T), enthalpyvaporization(fluid, 'T', T). Humid air: humidair('output', 'key1', v1, 'key2', v2, 'key3', v3). Any CoolProp output: props('output', fluid, 'key1', v1, 'key2', v2).
- Functions available (names; the arguments of the state properties are as above): ${names}
- Correlations and other functions, with their arguments (a trailing ? marks an optional one):
${corr}

Questions on any subject are welcome (other engineering and science, mathematics, programming, how to use SES): do not refuse one for being outside thermodynamics or heat transfer. The rules above about equation blocks apply only when you propose equations for the Equations pane.${symbolic}`;
    }

    // The user turn: the question with the current state of the program.
    function buildTurn(prompt, ctx) {
        const parts = [];
        const eq = String(ctx.equations || '').replace(/\s+$/, '');
        parts.push('Equations in the Equations pane now:\n' + (eq ? '```ses\n' + eq.slice(0, 30000) + '\n```' : '(empty)'));
        if (ctx.results && ctx.results.length) parts.push('Results of the last Solve (display units):\n' + ctx.results.slice(0, 300).map(r => `${r.name} = ${r.value}${r.unit ? ' [' + r.unit + ']' : ''}`).join('\n'));
        else parts.push('There are no current results (Solve has not been pressed since the last change).');
        if (ctx.settings && ctx.settings.length) parts.push('Variable settings (those changed from the default):\n' + ctx.settings.slice(0, 100).join('\n'));
        if (ctx.messages && ctx.messages.length) parts.push('Latest Console warnings and errors:\n' + ctx.messages.slice(-12).map(m => String(m).slice(0, 400)).join('\n'));
        return '<ses-state>\n' + parts.join('\n\n') + '\n</ses-state>\n\n' + prompt;
    }

    // The last block of equations in an answer, or null: a fence tagged ses (as asked), or <ses> ... </ses> tags, which some
    // models write instead (with or without a fence inside)
    function extractEquations(text) {
        const re = /```[ \t]*ses[ \t]*\r?\n([\s\S]*?)```|<ses>([\s\S]*?)<\/ses>/gi;
        let m, last = null, at = -1;
        while ((m = re.exec(text))) if (m.index > at) { at = m.index; last = m[1] !== undefined ? m[1] : m[2]; }
        if (last === null) return null;
        const inner = last.match(/^\s*```[^\n]*\n([\s\S]*?)```\s*$/);   // <ses>```...```</ses>
        if (inner) last = inner[1];
        last = last.replace(/^\s*\n/, '').replace(/\s+$/, '');
        return last.trim() ? last : null;
    }

    // ---- the check of a proposal -------------------------------------------------------------------------------------
    // Parse, Check Units and Solve on a copy, with nothing shown in the page. env = the engine classes; settings = { name: {guess, lower, upper} }
    // from the user's Variables pane, so that the copy starts where the user's problem does. Returns { problems: [text], steps: {...} }.
    function checkEquations(text, env, settings) {
        const problems = [], steps = { parsed: false, units: false, solved: false, nEq: 0, nVar: 0 };
        const con = env.console || console, keep = { log: con.log, warn: con.warn, error: con.error };
        const OB = env.OdeBlocks, keepTables = OB ? OB.tables : null, keepActive = OB ? OB.active : null;
        con.log = con.warn = con.error = () => { };
        try {
            let p;
            try { p = new env.EESParser(); p.parse(text); steps.parsed = true; }
            catch (e) { problems.push('Syntax: ' + e.message); return { problems, steps }; }
            if (settings) p.variables.forEach((m, n) => {
                const s = settings[n]; if (!s) return;
                if (typeof s.guess === 'number') m.guess = s.guess;
                if (typeof s.lower === 'number') m.lower = s.lower;
                if (typeof s.upper === 'number') m.upper = s.upper;
            });
            const active = new Set(); p.parsedASTs.forEach(eq => eq.vars.forEach(v => active.add(v)));
            steps.nEq = p.parsedASTs.length; steps.nVar = active.size;
            try {
                const r = env.UnitConsistencyChecker.run(p.parsedASTs, p.variables);
                (r.issues || []).forEach(i => problems.push('Units: ' + i));
                steps.units = !(r.issues && r.issues.length);
            } catch (e) { problems.push('Units check: ' + e.message); }
            if (steps.nEq !== steps.nVar) {
                const d = steps.nVar - steps.nEq;
                problems.push(d > 0
                    ? `${steps.nEq} equation(s) for ${steps.nVar} variable(s): ${d} too few, so Solve cannot run (leave it so only if the equations are meant for Min/Max or a Parametric Table, and say so). Variables: ${[...active].slice(0, 40).join(', ')}.`
                    : `${steps.nEq} equation(s) for ${steps.nVar} variable(s): ${-d} too many. Variables: ${[...active].slice(0, 40).join(', ')}.`);
            } else {
                try {
                    if (p.specs && p.specs.length) env.DesignSpec.solve(p, env.BoundedSolver);
                    else new env.BoundedSolver(p.parsedASTs, p.variables, p.odeCalls).solve();
                    steps.solved = true;
                } catch (e) { problems.push('Solve: ' + e.message); }
            }
            return { problems, steps };
        } finally {
            con.log = keep.log; con.warn = keep.warn; con.error = keep.error;
            if (OB) { OB.tables = keepTables; OB.active = keepActive; }
        }
    }
    // line numbers of a proposal are not lines of the Equations pane: written so that the Console does not link them there
    const noLines = (s) => String(s).replace(/\b[Ll]ines?\s+(?=\d)/g, 'proposal ln ');
    function feedback(problems) {
        return 'SES checked your proposed equations on a copy (syntax, Check Units, and a Solve) and found:\n' + problems.map((p, i) => `${i + 1}. ${p}`).join('\n') +
            '\n\nReturn the complete corrected equations in one ses block, with a line on what changed. If a problem is not a real error, say why and return the same block.';
    }

    // ---- the assistant -------------------------------------------------------------------------------------------------
    // deps: { fetch, local, session (storages), context() -> {equations, results, settings, messages}, env (engine classes), link(id), setEquations(text) }
    function create(deps) {
        const SUBS = ['provider', 'key', 'model', 'models', 'url', 'rounds', 'remember', 'forget', 'status'];
        const proposals = [];
        let history = [], busy = null, noticed = {};
        const cfg = { provider: 'anthropic', models: {}, urls: {}, rounds: 2, remember: true };
        let keys = {};
        const store = (s) => { try { return s || null; } catch (e) { return null; } };
        const local = store(deps.local), session = store(deps.session);
        const rd = (s, k) => { try { return s && s.getItem(k); } catch (e) { return null; } };
        const wr = (s, k, v) => { try { if (s) s.setItem(k, v); } catch (e) { } };
        const rm = (s, k) => { try { if (s) s.removeItem(k); } catch (e) { } };
        try { Object.assign(cfg, JSON.parse(rd(local, 'ses-ai') || '{}')); } catch (e) { }
        try { keys = JSON.parse(rd(cfg.remember ? local : session, 'ses-ai-keys') || '{}'); } catch (e) { keys = {}; }
        if (!PROVIDERS[cfg.provider]) cfg.provider = 'anthropic';
        const saveCfg = () => wr(local, 'ses-ai', JSON.stringify(cfg));
        const saveKeys = () => { rm(local, 'ses-ai-keys'); rm(session, 'ses-ai-keys'); wr(cfg.remember ? local : session, 'ses-ai-keys', JSON.stringify(keys)); };

        const opts = () => {
            const P = PROVIDERS[cfg.provider];
            return { key: keys[cfg.provider] || '', model: cfg.models[cfg.provider] || P.model || '', base: P.fixed ? P.base : (cfg.urls[cfg.provider] || P.base) };
        };
        const http = (url, init) => (deps.fetch || fetch)(url, init);
        const reach = (e) => {
            if (e && e.name === 'AbortError') return new Error(busy && busy.timedOut ? 'No answer within ' + TIMEOUT_MS / 1000 + ' s.' : 'Stopped.');
            const P = PROVIDERS[cfg.provider];
            return new Error(`Could not reach ${P.label}${cfg.provider === 'ollama' || cfg.provider === 'custom' ? ': is the server running, and does it allow this page (for Ollama, start it with OLLAMA_ORIGINS=*)?' : ': check the connection.'}`);
        };

        async function call(system, messages, signal) {
            const o = opts(), r = buildRequest(cfg.provider, o, system, messages);
            let res;
            try { res = await http(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body), signal }); } catch (e) { throw reach(e); }
            const body = await res.text();
            if (!res.ok) throw new Error(`${PROVIDERS[cfg.provider].label} replied ${errorText(res.status, body)}`);
            let j; try { j = JSON.parse(body); } catch (e) { throw new Error('The reply was not JSON: ' + body.slice(0, 200)); }
            return parseReply(cfg.provider, j);
        }
        async function listModels(filter) {
            const o = opts(), r = modelsRequest(cfg.provider, o);
            let res;
            try { res = await http(r.url, { headers: r.headers }); } catch (e) { throw reach(e); }
            const body = await res.text();
            if (!res.ok) throw new Error(`${PROVIDERS[cfg.provider].label} replied ${errorText(res.status, body)}`);
            let ids = parseModels(cfg.provider, JSON.parse(body)).sort();
            if (filter) ids = ids.filter(i => i.toLowerCase().includes(filter.toLowerCase()));
            return ids;
        }
        const needKey = () => {
            const P = PROVIDERS[cfg.provider];
            if (P.key && !keys[cfg.provider]) { console.error(`No key for ${P.label}. Get one from the provider, then type  AI: setup key <your key>  (it stays in this browser). Other providers:  AI: setup provider openai | gemini | openrouter | ollama | custom.`); return true; }
            if (cfg.provider === 'custom' && !cfg.urls.custom) { console.error('Give the address of the server:  AI: setup url http://localhost:1234/v1'); return true; }
            return false;
        };
        const sayModels = async (filter) => {
            const ids = await listModels(filter);
            if (!ids.length) { console.log('  No models' + (filter ? ' match ' + filter : '') + '.'); return; }
            console.log(ids.slice(0, 40).map(i => '  ' + i).join('\n') + (ids.length > 40 ? `\n  ... ${ids.length - 40} more: narrow the list with  AI: setup models <part of a name>` : '') + '\nChoose one with  AI: setup model <name>.');
        };

        function status() {
            const P = PROVIDERS[cfg.provider], o = opts();
            console.log(`AI: provider ${cfg.provider} (${P.label}), model ${o.model || '(not chosen)'}, key ${P.key ? (keys[cfg.provider] ? 'set' : 'NOT set') : 'not needed'}` +
                `${P.fixed ? '' : ', address ' + (o.base || '(not set)')}, up to ${cfg.rounds} correction round(s), key kept ${cfg.remember ? 'in this browser' : 'for this tab only'}.`);
        }
        function help() {
            console.log('AI: <question>   ask about the equations, the results or the problem (the equations and last results go with it; AI: show prints exactly what is sent)\n' +
                'AI: new          start a new conversation        AI: stop      cancel the request in progress\n' +
                'AI: insert       put the last proposed equations in the Equations pane (or click the link under the answer)\n' +
                'AI: setup        show the settings; then  provider <anthropic|openai|gemini|openrouter|ollama|custom>,  key <key>,  model <name>,\n' +
                '                 url <address> (ollama, custom),  models [filter] (list the models),  rounds <0-5>,  remember on|off,  forget (erase keys and settings)');
        }

        async function setup(arg) {
            let m;
            if ((m = arg.match(/^setup\s+key(?:\s+(.+))?$/i))) {
                if (!m[1]) { console.log('Type  AI: setup key <your key>.'); return; }
                keys[cfg.provider] = m[1].trim(); saveKeys();
                console.log(`Key for ${PROVIDERS[cfg.provider].label} saved ${cfg.remember ? 'in this browser' : 'for this tab'} (ends in ...${keys[cfg.provider].slice(-4)}).`);
                return;
            }
            const w = arg.split(/\s+/), sub = (w[1] || 'status').toLowerCase(), val = w.slice(2).join(' ');
            if (sub === 'status') return status();
            if (sub === 'provider') {
                if (!PROVIDERS[val.toLowerCase()]) { console.error('Providers: ' + Object.keys(PROVIDERS).join(', ') + '.'); return; }
                cfg.provider = val.toLowerCase(); saveCfg(); history = []; status();
                if (PROVIDERS[cfg.provider].key && !keys[cfg.provider]) console.log('Now  AI: setup key <your key>.');
                else if (!opts().model) console.log('Now choose a model:  AI: setup models  lists them.');
                return;
            }
            if (sub === 'model') { if (!val) { console.error('AI: setup model <name>   (AI: setup models lists them)'); return; } cfg.models[cfg.provider] = val; saveCfg(); console.log(`Model: ${val}.`); return; }
            if (sub === 'models') { if (needKey()) return; console.log('Models of ' + PROVIDERS[cfg.provider].label + ':'); await sayModels(val); return; }
            if (sub === 'url') {
                if (PROVIDERS[cfg.provider].fixed) { console.error(`${PROVIDERS[cfg.provider].label} has a fixed address. For another server:  AI: setup provider custom.`); return; }
                if (!/^https?:\/\//i.test(val)) { console.error('AI: setup url http://localhost:1234/v1   (the address up to and including /v1)'); return; }
                cfg.urls[cfg.provider] = val.replace(/\/+$/, ''); saveCfg(); console.log('Address: ' + cfg.urls[cfg.provider] + '.'); return;
            }
            if (sub === 'rounds') {
                const n = Number(val);
                if (!(Number.isInteger(n) && n >= 0 && n <= 5)) { console.error('AI: setup rounds <0 to 5>   (how many times a proposal that fails the check is sent back; 0 turns the correction off)'); return; }
                cfg.rounds = n; saveCfg(); console.log(`Up to ${n} correction round(s).`); return;
            }
            if (sub === 'remember') {
                if (!/^(on|off)$/i.test(val)) { console.error('AI: setup remember on|off   (off: keys live only in this tab; use it on a shared computer)'); return; }
                cfg.remember = /^on$/i.test(val); saveCfg(); saveKeys(); console.log(cfg.remember ? 'Keys are kept in this browser.' : 'Keys are kept for this tab only.'); return;
            }
            if (sub === 'forget') {
                keys = {}; rm(local, 'ses-ai-keys'); rm(session, 'ses-ai-keys'); rm(local, 'ses-ai');
                Object.assign(cfg, { provider: 'anthropic', models: {}, urls: {}, rounds: 2, remember: true }); history = []; noticed = {};
                console.log('Keys and AI settings erased from this browser.'); return;
            }
        }

        function show(prompt) {
            const o = opts(), P = PROVIDERS[cfg.provider];
            const sys = systemPrompt(prompt), turn = buildTurn(prompt || '(your question)', deps.context());
            console.log(`Sent to ${P.label}, model ${o.model || '(not chosen)'}, at ${(o.base || '(no address)')}; the key is sent only as the provider's header.\n` +
                `Conversation so far: ${history.length / 2} exchange(s) (AI: new clears it). A request is the instructions, then the conversation, then the new question with the state:\n\n` +
                `--- instructions (${sys.length} characters) ---\n${sys}\n\n--- new question ---\n${turn}\n--- end ---`);
        }

        async function ask(prompt) {
            if (needKey()) return;
            const o = opts();
            if (!o.model) {
                console.error(`Choose a model for ${PROVIDERS[cfg.provider].label} first:  AI: setup model <name>.  Available:`);
                try { await sayModels(''); } catch (e) { console.error(e.message); }
                return;
            }
            if (busy) { console.warn('Still waiting for the previous answer (AI: stop cancels it).'); return; }
            const ctl = new AbortController(); busy = ctl;
            const timer = setTimeout(() => { ctl.timedOut = true; ctl.abort(); }, TIMEOUT_MS);
            try {
                if (!noticed[cfg.provider]) { noticed[cfg.provider] = true; console.log(`The question, the equations, the last results and the latest messages are sent to ${PROVIDERS[cfg.provider].label}. AI: show prints exactly what is sent.`); }
                const ctx = deps.context(), sys = systemPrompt(prompt);
                const base = history.concat([{ role: 'user', content: buildTurn(prompt, ctx) }]);
                let msgs = base, reply, eq = null, chk = null, prevEq = null, round = 0;
                const settings = {}; (ctx.settingsRaw || []).forEach(s => { settings[s.name] = s; });
                for (; ; round++) {
                    console.log(round === 0 ? `Asking ${PROVIDERS[cfg.provider].label} (${o.model}) ...` : `Asking again (correction ${round}) ...`);
                    reply = await call(sys, msgs, ctl.signal);
                    eq = extractEquations(reply.text);
                    chk = null;
                    if (!eq) break;
                    chk = deps.env ? checkEquations(eq, deps.env, settings) : null;
                    if (!chk || !chk.problems.length || round >= cfg.rounds || eq === prevEq) break;
                    prevEq = eq;
                    console.log(`  The check found ${chk.problems.length} problem(s) in the proposal; asking for a correction.`);
                    msgs = msgs.concat([{ role: 'assistant', content: reply.text }, { role: 'user', content: feedback(chk.problems) }]);
                }
                history.push({ role: 'user', content: prompt }, { role: 'assistant', content: reply.text });
                if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
                console.log('\n' + reply.text.trim() + '\n');
                if (reply.truncated) console.warn('The answer was cut at the output limit.');
                if (eq) {
                    proposals.push(eq);
                    if (!chk) console.log('(The proposal could not be checked here.)');
                    else if (!chk.problems.length) console.log(`Checked on a copy: it parses, the units are consistent${chk.steps.solved ? ' and it solves' : ''}${chk.steps.nEq ? ` (${chk.steps.nEq} equation(s), ${chk.steps.nVar} variable(s))` : ''}.`);
                    else { console.warn(`The proposal still has ${chk.problems.length} problem(s) after ${round} correction(s):`); chk.problems.forEach(p => console.warn('  ' + noLines(p))); }
                    if (deps.link) deps.link(proposals.length - 1);
                }
            } catch (e) {
                console.error(e.message);
            } finally { clearTimeout(timer); busy = null; }
        }

        function insert(id) {
            const n = (id === undefined || id === '') ? proposals.length - 1 : Number(id);
            if (!(n >= 0 && n < proposals.length)) { console.warn(proposals.length ? `There is no proposal ${id}.` : 'No answer so far held a block of equations to insert. Ask for the complete equations; they come in a block marked ses, with a link to insert them under the answer.'); return; }
            deps.setEquations(proposals[n] + '\n');
            console.log('Inserted in the Equations pane (Ctrl+Z there undoes it). Press Check, then Solve.');
        }

        // The text after "AI:"
        async function command(arg) {
            arg = String(arg || '').trim();
            const w = arg.split(/\s+/), first = w[0].toLowerCase();
            if (!arg) return help();
            if (w.length === 1 && first === 'help') return help();
            if (w.length === 1 && first === 'new') { history = []; console.log('New conversation.'); return; }
            if (w.length === 1 && first === 'show') return show();
            if (w.length === 1 && first === 'stop') { if (busy) busy.abort(); else console.log('Nothing is in progress.'); return; }
            if (first === 'insert' && w.length <= 2) return insert(w[1]);
            if (first === 'setup' && (w.length === 1 || SUBS.includes(w[1].toLowerCase()))) { try { await setup(arg); } catch (e) { console.error(e.message); } return; }
            return ask(arg);
        }
        return { command, insert, proposals, cfg, get history() { return history; } };
    }
    return { create, PROVIDERS, buildRequest, parseReply, errorText, modelsRequest, parseModels, systemPrompt, buildTurn, extractEquations, checkEquations, feedback };
})();
