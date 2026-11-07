// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// The AI assistant (ai.js) with a mock provider: the requests and replies of each provider, the instructions, the check of a
// proposal on a copy, the correction rounds, the settings commands and the messages. Live calls can only be tested with a key.
import { E, logs } from '../lib/engine.mjs';
import { ok, done } from '../lib/check.mjs';
const A = E.SESAI;

// ---- requests and replies of each provider
const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'again' }];
let r = A.buildRequest('anthropic', { key: 'K', model: 'm1' }, 'SYS', msgs);
ok('anthropic: address, headers and body', r.url === 'https://api.anthropic.com/v1/messages' && r.headers['x-api-key'] === 'K' && r.headers['anthropic-version'] === '2023-06-01'
    && r.headers['anthropic-dangerous-direct-browser-access'] === 'true' && r.body.system === 'SYS' && r.body.messages.length === 3 && r.body.model === 'm1' && r.body.max_tokens > 0, r);
r = A.buildRequest('openai', { key: 'K', model: 'm1' }, 'SYS', msgs);
ok('openai: bearer key, system message first, max_completion_tokens', r.url === 'https://api.openai.com/v1/chat/completions' && r.headers.authorization === 'Bearer K'
    && r.body.messages[0].role === 'system' && r.body.messages.length === 4 && r.body.max_completion_tokens > 0 && !('max_tokens' in r.body), r);
r = A.buildRequest('openrouter', { key: 'K', model: 'a/b' }, 'SYS', msgs);
ok('openrouter: its own address and max_tokens', r.url === 'https://openrouter.ai/api/v1/chat/completions' && r.body.max_tokens > 0, r.url);
r = A.buildRequest('gemini', { key: 'K', model: 'g1' }, 'SYS', msgs);
ok('gemini: key in a header (not the address), roles user/model, system instruction', r.url === 'https://generativelanguage.googleapis.com/v1beta/models/g1:generateContent' && r.headers['x-goog-api-key'] === 'K'
    && r.body.contents.map(c => c.role).join() === 'user,model,user' && r.body.systemInstruction.parts[0].text === 'SYS' && !r.url.includes('K='), r);
r = A.buildRequest('ollama', { key: '', model: 'llama' }, 'SYS', msgs);
ok('ollama: local address, no authorization header', r.url === 'http://localhost:11434/v1/chat/completions' && !('authorization' in r.headers), r);
r = A.buildRequest('custom', { key: '', model: 'x', base: 'http://localhost:1234/v1/' }, 'SYS', msgs);
ok('custom server: the given address, trailing slash removed', r.url === 'http://localhost:1234/v1/chat/completions', r.url);

ok('anthropic reply text', A.parseReply('anthropic', { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], stop_reason: 'end_turn' }).text === 'ab');
ok('anthropic reply cut at the limit is flagged', A.parseReply('anthropic', { content: [{ type: 'text', text: 'a' }], stop_reason: 'max_tokens' }).truncated === true);
ok('openai reply text', A.parseReply('openai', { choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }).text === 'x');
ok('gemini reply text', A.parseReply('gemini', { candidates: [{ content: { parts: [{ text: 'p' }, { text: 'q' }] }, finishReason: 'STOP' }] }).text === 'pq');
let e1 = null; try { A.parseReply('openai', { choices: [{ message: { content: '' }, finish_reason: 'length' }] }); } catch (e) { e1 = e.message; }
ok('an empty reply is an error that mentions the output limit', /no text.*limit/.test(e1), e1);
ok('error text from JSON', A.errorText(401, '{"error":{"message":"bad key"}}') === '401: bad key' && A.errorText(429, '[{"error":{"message":"slow down"}}]') === '429: slow down' && A.errorText(500, 'oops') === '500: oops');
ok('model lists: anthropic/openai/gemini', A.parseModels('anthropic', { data: [{ id: 'c1' }] }).join() === 'c1'
    && A.parseModels('openai', { data: [{ id: 'gpt-x' }, { id: 'text-embedding-3' }, { id: 'whisper-1' }, { id: 'o3' }] }).join() === 'gpt-x,o3'
    && A.parseModels('gemini', { models: [{ name: 'models/g1', supportedGenerationMethods: ['generateContent'] }, { name: 'models/e', supportedGenerationMethods: ['embedContent'] }] }).join() === 'g1');
ok('the Gemini model list asks with the key in a header', A.modelsRequest('gemini', { key: 'K' }).headers['x-goog-api-key'] === 'K');

// ---- instructions and the turn
const sys = A.systemPrompt();
ok('instructions list the functions that exist, with arguments', /enthalpy,/.test(sys) && /nu_gnielinski\(Re, Pr, f\?\)/.test(sys) && !/undefined|\[object/.test(sys), sys.slice(0, 200));
ok('instructions tell how to return equations (a ses block) and that SES computes', /fenced block tagged ses/.test(sys) && /SES computes/.test(sys));
ok('instructions put the inputs first, where they are easily seen (some models listed them last)', /every input with its value and unit at the top of the block, before the equations/.test(sys));
ok('the assistant is not confined to thermodynamics and heat transfer: any subject is welcome', /any other engineering, science or mathematics problem/.test(sys) && /do not refuse one for being outside thermodynamics or heat transfer/.test(sys) && !/say that this assistant is for SES/.test(sys));
const symSys = A.systemPrompt('derive the derivative of x^2*sin(x) and check it numerically');
ok('the symbolic guidance is added only to questions about symbolic work, and kept short', /derivative\(expression, x\)/.test(symSys) && /three or more values/.test(symSys) && /never name a variable e or pi/.test(symSys) && !/three or more values/.test(sys) && !/three or more values/.test(A.systemPrompt('why does Solve not converge?')) && symSys.length - sys.length < 700, symSys.length - sys.length);
ok('instructions stay compact: under 11 000 characters (10 949 now), under 11 600 with the symbolic guidance (11 511 now); every addition must pay for itself', sys.length < 11000 && symSys.length < 11600, [sys.length, symSys.length]);
const turn = A.buildTurn('why?', { equations: 'x = 1', results: [{ name: 'x', value: 1, unit: 'm' }], settings: ['x: guess 2'], messages: ['ERROR: boom'] });
ok('the turn carries equations, results with units, settings, messages and the question', /```ses\nx = 1\n```/.test(turn) && /x = 1 \[m\]/.test(turn) && /x: guess 2/.test(turn) && /ERROR: boom/.test(turn) && /why\?$/.test(turn), turn);
ok('without results the turn says so', /no current results/.test(A.buildTurn('q', { equations: 'x=1', results: [] })));
ok('the ses block of an answer is found: the last one, case-insensitive', A.extractEquations('a\n```ses\nx=1\n```\nb\n```SES\ny=2\nz=3\n```') === 'y=2\nz=3');
ok('<ses> tags, as some models write, are taken too (regression: no insert link after a <ses> answer)', A.extractEquations('Here:\n<ses>\nx = 1\ny = 2\n</ses>\nok') === 'x = 1\ny = 2'
    && A.extractEquations('<ses>\n```\nx = 1\n```\n</ses>') === 'x = 1' && A.extractEquations('```ses\na = 1\n```\nthen <ses>b = 2</ses>') === 'b = 2');
ok('the example in the instructions tells to use the fence, not tags, and the example itself solves', /not <ses> tags/.test(sys)
    && A.checkEquations(sys.match(/like this:\n```ses\n([\s\S]*?)```/)[1], E, {}).steps.solved);
ok('no ses block: null; an untagged block is not taken', A.extractEquations('```\nx=1\n```') === null && A.extractEquations('text') === null && A.extractEquations('```ses\n\n```') === null);

// ---- the check of a proposal
const GOOD = `P = 100 [kPa]\nT = 300 [K]\nh = enthalpy('water', T, P)`;
const before = logs.length;
let c = A.checkEquations(GOOD, E, {});
ok('a good proposal: no problems, solved', c.problems.length === 0 && c.steps.solved && c.steps.nEq === 3, c);
ok('the check prints nothing', logs.length === before, logs.slice(before));
c = A.checkEquations('x = 1 +', E, {});
ok('a syntax error is reported', c.problems.length === 1 && /^Syntax: /.test(c.problems[0]) && !c.steps.parsed, c);
c = A.checkEquations('P = 100 [kPa]\nT = 300 [K]\nx = P + T', E, {});
ok('a unit error is reported', c.problems.some(p => /^Units: /.test(p)), c);
c = A.checkEquations('a = 1\nb = a + c', E, {});
ok('too few equations: reported with the variables', c.problems.some(p => /1 too few/.test(p) && /a, b, c|b, c|a, b|c/.test(p)), c);
c = A.checkEquations('a = 1\na = 2\nb = 3\nb = 3.5\nc = 1', E, {});
ok('too many equations (or inconsistent) is reported', c.problems.length > 0, c);
c = A.checkEquations('y = nosuchfunction(2)', E, {});
ok('an unknown function is reported', c.problems.length > 0 && /nosuchfunction/.test(c.problems.join()), c);
c = A.checkEquations(`h = enthalpy('water', T_2, 1e5)\nh = 2.7e6`, E, {});
ok('without a guess the copy starts from the default and may fail (the reason a pane guess is passed on)', c.problems.length === 0 || /^Solve: /.test(c.problems[0]), c);
c = A.checkEquations(`h = enthalpy('water', T_2, 1e5)\nh = 2.7e6`, E, { T_2: { guess: 400 } });
ok('a guess from the Variables pane is applied to the copy', c.problems.length === 0 && c.steps.solved, c);
const keepLog = E.OdeBlocks.tables; E.OdeBlocks.tables = ['mine'];
A.checkEquations(`ode t = 0 : 1 : 0.5\n  y' = -y\n  y(0) = 1\nend`, E, {});
ok('the ODE tables of the page survive a check', E.OdeBlocks.tables.length === 1 && E.OdeBlocks.tables[0] === 'mine', E.OdeBlocks.tables);
E.OdeBlocks.tables = keepLog;

// ---- the assistant with a mock provider
function mem() { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, d }; }
function make(replies, extra = {}) {
    const calls = [], local = mem(), session = mem(); let n = 0, set = null, links = [];
    const fetch = async (url, init) => {
        calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
        const rep = typeof replies === 'function' ? replies(calls.length, calls) : replies[Math.min(n++, replies.length - 1)];
        if (rep.status) return { ok: false, status: rep.status, text: async () => rep.body };
        return { ok: true, status: 200, text: async () => JSON.stringify(rep.json || { content: [{ type: 'text', text: rep.text }], stop_reason: 'end_turn' }) };
    };
    const ctx = { equations: extra.equations || '', results: [], settings: [], settingsRaw: [], messages: [] };
    const ai = A.create({ fetch, local, session, env: E, context: () => ctx, link: id => links.push(id), setEquations: t => { set = t; } });
    return { ai, calls, local, session, ctx, get set() { return set; }, links };
}
const since = (i) => logs.slice(i).join('\n');
const say = async (t, cmd) => { const i = logs.length; await t.ai.command(cmd); return since(i); };
const fence = (s) => '```ses\n' + s + '\n```';

let t = make([{ text: 'x' }]);
let out = await say(t, 'what is entropy?');
ok('no key: the question is not sent, the way to set one is explained', t.calls.length === 0 && /No key for Anthropic.*AI: setup key/.test(out), out);
out = await say(t, 'setup key sk-test-1234');
ok('a key is stored (in the browser storage) and only its last four characters are printed', /ends in \.\.\.1234/.test(out) && !/sk-test-1234/.test(out) && t.local.d['ses-ai-keys'].includes('sk-test-1234'), out);
out = await say(t, 'setup');
ok('setup shows the state without the key', /provider anthropic/.test(out) && /key set/.test(out) && /claude-/.test(out) && !/sk-test/.test(out), out);
out = await say(t, 'what is entropy?');
ok('a question is sent with the key in the header and the state in the last message', t.calls.length === 1 && t.calls[0].init.headers['x-api-key'] === 'sk-test-1234' && !JSON.stringify(t.calls[0].body).includes('sk-test-1234')
    && /<ses-state>/.test(t.calls[0].body.messages[0].content), t.calls[0]);
ok('the answer is printed, with the notice on what is sent', /^The question, the equations/m.test(out) && /\nx\n/.test(out), out);
await say(t, 'and enthalpy?');
ok('the conversation continues (history before the new turn), without the old state', t.calls[1].body.messages.length === 3 && t.calls[1].body.messages[0].content === 'what is entropy?' && /<ses-state>/.test(t.calls[1].body.messages[2].content), t.calls[1].body.messages.map(m => m.content.slice(0, 30)));
await say(t, 'new');
await say(t, 'third');
ok('AI: new clears the conversation', t.calls[2].body.messages.length === 1, t.calls[2].body.messages.length);

// a question that begins with a command word is a question
t = make([{ text: 'ok' }]); await say(t, 'setup key KEY-SHOW-77');
await say(t, 'show the energy balance of a turbine'); await say(t, 'setup a Rankine cycle'); await say(t, 'new heat exchanger please');
ok('a question that starts with show / setup / new is sent as a question', t.calls.length === 3 && /show the energy balance/.test(t.calls[0].body.messages[0].content), t.calls.length);
out = await say(t, 'show');
ok('AI: show prints the instructions and the state, and the key not at all', /--- instructions/.test(out) && /<ses-state>/.test(out) && !/KEY-SHOW-77/.test(out), out.slice(0, 300));

// the correction loop: a bad first proposal, a corrected second
const BAD = 'P = 100 [kPa]\nT = 300 [K]\nx = P + T', FIXED = GOOD;
t = make([{ text: 'Try this:\n' + fence(BAD) }, { text: 'Fixed.\n' + fence(FIXED) }]); await say(t, 'setup key K');
out = await say(t, 'enthalpy of water at 300 K');
ok('the problem found by the check is sent back, with the proposal as the previous answer', t.calls.length === 2 && /\n1\. Units: /.test(t.calls[1].body.messages[2].content) && t.calls[1].body.messages[1].role === 'assistant', t.calls[1] && t.calls[1].body.messages.map(m => m.role));
ok('the corrected proposal is what is kept, and it is announced as checked', /Checked on a copy: it parses, the units are consistent and it solves/.test(out) && t.links.length === 1 && !/still has/.test(out) && /The check found 1 problem/.test(out), out);
ok('only the question and the final answer are kept in the conversation', t.ai.history.length === 2 && /Fixed\./.test(t.ai.history[1].content), t.ai.history.length);
await say(t, 'insert');
ok('AI: insert puts the checked equations in the pane', t.set === FIXED + '\n', t.set);
t.ai.insert(0);

// no endless loops: rounds, and an unchanged block
t = make(() => ({ text: fence(BAD) })); await say(t, 'setup key K');
out = await say(t, 'q');
ok('the same proposal twice stops the loop; the problems are shown', t.calls.length === 2 && /still has \d+ problem/.test(out) && /Units: /.test(out), [t.calls.length, out]);
let k = 0; t = make(() => ({ text: fence(BAD + '\n// v' + (++k)) })); await say(t, 'setup key K');
out = await say(t, 'q');
ok('at most 2 correction rounds by default (3 calls)', t.calls.length === 3, t.calls.length);
await say(t, 'setup rounds 0'); t.calls.length = 0; await say(t, 'q');
ok('rounds 0: one call, no correction', t.calls.length === 1);
out = await say(t, 'setup rounds 9');
ok('rounds out of range are refused', /AI: setup rounds <0 to 5>/.test(out));

// errors
t = make([{ status: 401, body: '{"error":{"message":"invalid x-api-key"}}' }]); await say(t, 'setup key K');
out = await say(t, 'q');
ok('an HTTP error shows the status and the provider message', /Anthropic replied 401: invalid x-api-key/.test(out), out);
const t2 = { ...make([{ text: 'x' }]) };
const down = A.create({ fetch: async () => { throw new TypeError('Failed to fetch'); }, local: mem(), session: mem(), env: E, context: () => ({ equations: '' }), link() { }, setEquations() { } });
await down.command('setup provider ollama'); await down.command('setup model llama3');
const i0 = logs.length; await down.command('hello');
ok('an unreachable local server: the message names OLLAMA_ORIGINS', /Could not reach Ollama.*OLLAMA_ORIGINS/.test(since(i0)), since(i0));

// providers, models, settings
t = make((i, calls) => /\/models/.test(calls[i - 1].url) ? { json: { data: [{ id: 'm-a' }, { id: 'm-b' }, { id: 'zz' }] } } : { text: 'hi' });
await say(t, 'setup provider openrouter'); await say(t, 'setup key OR');
out = await say(t, 'q');
ok('no model chosen: asked to choose, with the list', t.calls.length === 1 && /Choose a model for OpenRouter/.test(out) && /m-a/.test(out), out);
out = await say(t, 'setup models m-');
ok('the model list can be filtered', /m-a/.test(out) && /m-b/.test(out) && !/zz/.test(out), out);
await say(t, 'setup model m-a'); t.calls.length = 0; await say(t, 'q');
ok('OpenRouter call: bearer key, chosen model', t.calls[0].init.headers.authorization === 'Bearer OR' && t.calls[0].body.model === 'm-a', t.calls[0]);
out = await say(t, 'setup url http://x/v1');
ok('a fixed address cannot be changed', /fixed address/.test(out), out);
t = make([{ text: 'x' }]); await say(t, 'setup provider custom');
out = await say(t, 'q');
ok('custom server without an address: asks for it', /AI: setup url/.test(out), out);
await say(t, 'setup url http://localhost:1234/v1'); await say(t, 'setup model local-1'); await say(t, 'q');
ok('custom server: no key needed, the given address', t.calls.length === 1 && t.calls[0].url === 'http://localhost:1234/v1/chat/completions' && !t.calls[0].init.headers.authorization, t.calls[0]);
await say(t, 'setup remember off');
ok('remember off moves the keys to the tab only', t.local.d['ses-ai-keys'] === undefined, t.local.d);
await say(t, 'setup provider openai'); await say(t, 'setup key SECRET'); 
ok('with remember off the key is in session storage only', t.local.d['ses-ai-keys'] === undefined && t.session.d['ses-ai-keys'].includes('SECRET'));
await say(t, 'setup forget');
ok('forget erases keys and settings', t.local.d['ses-ai'] === undefined && t.session.d['ses-ai-keys'] === undefined && t.ai.cfg.provider === 'anthropic');
out = await say(t, 'setup provider nowhere');
ok('an unknown provider is refused with the list', /Providers: anthropic, openai, gemini/.test(out), out);
const t3 = make([{ text: 'x' }]); await say(t3, 'setup key KEEP'); const again = A.create({ fetch: async () => ({}), local: t3.local, session: t3.session, env: E, context: () => ({}), setEquations() { } });
ok('settings and key survive a reload', again.cfg.provider === 'anthropic' && JSON.parse(t3.local.d['ses-ai-keys']).anthropic === 'KEEP');
out = await say(make([{ text: 'x' }]), 'insert');
ok('AI: insert with nothing to insert says how equations arrive', /No answer so far held a block of equations/.test(out), out);
out = await say(make([{ text: 'x' }]), '');
ok('AI: alone prints the commands', /AI: <question>/.test(out) && /AI: insert/.test(out) && /AI: copy/.test(out), out);

// AI: copy: for a chat on a provider's web site, with no key; nothing is sent
{
    let clip = null; const calls = [];
    const c = A.create({ fetch: async (...x) => { calls.push(x); return {}; }, local: mem(), session: mem(), env: E, copy: async (t) => { clip = t; },
        context: () => ({ equations: 'P_1 = 10 [kPa]', results: [{ name: 'P_1', value: 10, unit: 'kPa' }], settings: [], messages: [] }), setEquations() { } });
    await c.command('setup key KEY-COPY-55');
    out = await (async () => { const i = logs.length; await c.command('copy'); return since(i); })();
    ok('AI: copy copies the instructions with all the guidance, then the state, ready for the question, and sends nothing', clip !== null && calls.length === 0
        && /^Follow these instructions in this conversation/.test(clip) && clip.includes(A.systemPrompt('', true)) && /three or more values/.test(clip)
        && /```ses\nP_1 = 10 \[kPa\]\n```/.test(clip) && /P_1 = 10 \[kPa\]$/m.test(clip) && /<\/ses-state>\n\n$/.test(clip) && !/KEY-COPY-55/.test(clip), (clip || '').slice(0, 120));
    ok('AI: copy says what to do with the answer', /^Copied the instructions and the state of SES \(\d+ characters\)/m.test(out) && /paste them into the Equations pane, then Check and Solve/.test(out), out);
    const n = A.create({ fetch: async () => ({}), local: mem(), session: mem(), env: E, copy: async () => { throw new Error('denied'); }, context: () => ({ equations: 'x = 1' }), setEquations() { } });
    out = await (async () => { const i = logs.length; await n.command('copy'); return since(i); })();
    ok('when copying is not allowed, AI: copy prints the text to select', /^Follow these instructions/m.test(out) && /did not allow copying/.test(out) && /^That is the instructions/m.test(out), out.slice(-300));
    const q = make([{ text: 'ok' }]); await say(q, 'setup key K'); await say(q, 'copy the energy balance into a table');
    ok('a question that starts with copy is a question', q.calls.length === 1, q.calls.length);
}
done();
