/**
 * Text-turn end-to-end check for the *workflow*, not the microphone.
 *
 * The browser test (`browser-e2e.mjs`) proves audio in/out. This one proves the
 * business flow that fills the Action Plan card:
 *   greeting -> seller answers -> 3 grounded recommendations.
 *
 * It sends the same `clientContent` turns the app's debug input sends, executes
 * the tool calls the model makes against the real API, and asserts that
 * `create_action_plan` is actually called and returns 3 actions with rupee
 * impact — i.e. the figures on screen come from the tool, not the prompt.
 *
 *   node --experimental-websocket scripts/action-plan-e2e.mjs
 */
const API = process.env.API_BASE || 'http://localhost:8080';
const LANG = process.env.E2E_LANG || 'hinglish';

if (typeof WebSocket === 'undefined') {
  console.error('FATAL: no global WebSocket. Run with: node --experimental-websocket scripts/action-plan-e2e.mjs');
  process.exit(1);
}

const T0 = Date.now();
const log = (...a) => console.log(`[${String(Date.now() - T0).padStart(6)}ms]`, ...a);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const session = await (
  await fetch(`${API}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: LANG, mode: 'reactive' }),
  })
).json();
if (!session.ok) {
  console.error('Token mint failed:', session);
  process.exit(1);
}
log(`token ok (${session.model} / ${session.apiVersion})`);

const ws = new WebSocket(
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${session.apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${session.token}`
);

let setupDone = false;
let pendingToolResponses = 0;
let turnCompletions = 0;
let pendingTurn = null;
let lastActivityAt = Date.now();
const toolCalls = [];
const outputTranscript = [];
let planActions = null;

/**
 * Resolves only once the model is genuinely idle: turnComplete seen, no tool
 * run in flight, and no new frames for 2s. Sending the next turn earlier
 * triggers `interrupted` and truncates the recommendation mid-sentence.
 */
function settleTurn(turn) {
  if (pendingTurn !== turn || turn.settling) return;
  turn.settling = true;
  const stabilise = () => {
    if (pendingToolResponses > 0 || Date.now() - lastActivityAt < 2000) {
      setTimeout(stabilise, 400);
      return;
    }
    pendingTurn = null;
    turn.resolve();
  };
  setTimeout(stabilise, 400);
}

const sendTurn = (text) =>
  new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) return reject(new Error('socket closed'));
    const turn = { resolve, settling: false };
    const timer = setTimeout(() => {
      if (pendingTurn === turn) pendingTurn = null;
      reject(new Error(`No settled turn within 60s for: "${text.slice(0, 40)}"`));
    }, 60000);
    const origResolve = turn.resolve;
    turn.resolve = () => {
      clearTimeout(timer);
      origResolve();
    };
    pendingTurn = turn;
    log(`SELLER: ${text}`);
    ws.send(
      JSON.stringify({
        clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true },
      })
    );
  });

const setupReady = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('setupComplete timeout')), 30000);
  ws.onopen = () => ws.send(JSON.stringify({ setup: { model: `models/${session.model}` } }));
  ws.onerror = (e) => reject(new Error(`ws error: ${e.message || e.type}`));
  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text());
    } catch {
      return;
    }
    lastActivityAt = Date.now();

    if (msg.setupComplete) {
      setupDone = true;
      clearTimeout(timer);
      log('setupComplete');
      resolve();
      return;
    }

    if (msg.serverContent?.outputTranscription?.text) {
      outputTranscript.push(msg.serverContent.outputTranscription.text);
    }
    if (msg.serverContent?.interrupted) log('interrupted');
    if (msg.goAway) log('goAway');

    if (msg.toolCall?.functionCalls) {
      for (const fc of msg.toolCall.functionCalls) {
        toolCalls.push(fc.name);
        log(`TOOL: ${fc.name} ${JSON.stringify(fc.args)}`);
      }
      void respondToTools(msg.toolCall.functionCalls);
    }

    if (msg.serverContent?.turnComplete) {
      turnCompletions++;
      log(`turnComplete #${turnCompletions}`);
      if (pendingTurn) settleTurn(pendingTurn);
    }
  };
});

async function respondToTools(functionCalls) {
  pendingToolResponses += functionCalls.length;
  const responses = [];
  try {
    for (const fc of functionCalls) {
      const args = { ...(fc.args || {}) };
      if (!args.sellerId && fc.name !== 'advance_stage') args.sellerId = 'SD-48213';
      const res = await fetch(`${API}/api/tools/${fc.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const json = await res.json();
      if (fc.name === 'create_action_plan' && json.ok) {
        planActions = json.data?.actions || [];
        log(`plan created: ${planActions.length} actions`);
      }
      responses.push({ id: fc.id, name: fc.name, response: { result: json.data ?? { error: json.error } } });
    }
  } catch (err) {
    log(`TOOL_ERR: ${err.message}`);
  } finally {
    pendingToolResponses -= functionCalls.length;
  }
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
  }
}

try {
  await setupReady;
  await sendTurn(
    'Call connected. Open now with your grounded greeting from VERIFIED FACTS, then ask exactly ONE question about the cause. Do not call any tool first.'
  );
  check('greeting turn completed', true);

  await sendTurn(
    'Haan, stock out ki wajah se orders gir gaye hain. Supplier ko payment karne mein 10 din lag rahe hain.'
  );
  await sendTurn('Theek hai. Mujhe exact 3 actions aur unka rupee impact batao. Plan bana do.');
} catch (err) {
  console.error('E2E error:', err.message);
}

const transcript = outputTranscript.join('').trim();
console.log('\n================ SPOKEN TRANSCRIPT ================');
console.log(transcript || '(none)');

console.log('\n================ TOOL CALLS ================');
console.log(toolCalls.length ? toolCalls.join(' -> ') : '(none)');

if (planActions) {
  console.log('\n================ ACTION PLAN ================');
  for (const a of planActions) {
    console.log(
      `${a.id}. ${a.title}\n   +up to ₹${Number(a.estimatedRecoveryRupees).toLocaleString('en-IN')}/mo · ${a.owner} · ${a.timeline}`
    );
  }
}

console.log('\n================ RESULT ================');
check('setupComplete received', setupDone);
check('model called create_action_plan', toolCalls.includes('create_action_plan'), toolCalls.join(', '));
check('plan has exactly 3 actions', planActions?.length === 3, String(planActions?.length ?? 0));
check(
  'every action has grounded rupee impact',
  Boolean(planActions?.length) && planActions.every((a) => Number(a.estimatedRecoveryRupees) > 0),
  planActions?.map((a) => `${a.id}:${a.estimatedRecoveryRupees}`).join(', ') || 'n/a'
);
check('every action has owner + timeline', Boolean(planActions?.length) && planActions.every((a) => a.owner && a.timeline));
check('model spoke the recommendation', /action|stock|restock|promotion|sku|cancel/i.test(transcript));

try {
  ws.close();
} catch {}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
