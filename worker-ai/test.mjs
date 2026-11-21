// Checks every gate in the AI Worker without touching anything real: Supabase's keys, the members
// table, KV and the Claude API are all stand-ins, and the sign-ins are signed with a test key.
//   node worker-ai/test.mjs
import worker, { pacificDay, SCHEMA, verifySignIn, WALLET_SCHEMA } from './src/index.js';

const SUPA = 'https://test.supabase.co';
const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const otherPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };

async function token(claims = {}, { key = pair.privateKey, kid = 'k1' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { sub: 'user-a', role: 'authenticated', aud: 'authenticated', iss: `${SUPA}/auth/v1`, exp: now + 3600, iat: now, email: 'a@example.test',
    app_metadata: { provider: 'google' }, user_metadata: { email_verified: true }, is_anonymous: false, ...claims };
  const h = b64url(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }))), p = b64url(enc.encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

// Stand-ins
const members = {
  'user-a': { active: true, flags: { ai: false, gmail: true }, daily_ai_limit: 20 },
  'user-nogmail': { active: true, flags: { ai: true, gmail: false }, daily_ai_limit: 20 },
  'user-paused': { active: false, flags: { ai: true, gmail: true }, daily_ai_limit: 20 },
  'user-w': { active: true, flags: { ai: true, gmail: false }, daily_ai_limit: 3 },
  'user-ai-only': { active: true, flags: { ai: true, gmail: false }, daily_ai_limit: 20 },
};
// Who is approved for Wallet (is_app_member('wallet')); user-ai-only has the AI switch but not Wallet
const walletMembers = new Set(['user-a', 'user-w', 'user-nogmail', 'user-paused']);
let rpcCalls = 0;
const kv = new Map();
let kvPutFailures = 0, kvPutAttempts = 0;
const USAGE = {
  get: async (k) => kv.get(k) ?? null,
  put: async (k, v) => {
    kvPutAttempts++;
    if (kvPutFailures) { kvPutFailures--; throw new Error('KV PUT failed: 429 Too Many Requests'); }
    kv.set(k, v);
  },
};
let claudeCalls = 0, claudeReply = null, lastClaudeBody = null;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === `${SUPA}/auth/v1/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
  if (url === `${SUPA}/rest/v1/rpc/is_app_member`) {
    rpcCalls++;
    const sub = JSON.parse(Buffer.from(init.headers.Authorization.split(' ')[1].split('.')[1], 'base64url')).sub;
    return Response.json(JSON.parse(init.body).p_app === 'wallet' && walletMembers.has(sub));
  }
  if (url.startsWith(`${SUPA}/rest/v1/members`)) {
    // The real table only shows a person their own row; mimic that from the bearer token's sub
    const bearer = init.headers.Authorization.split(' ')[1];
    const sub = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url')).sub;
    const want = new URL(url).searchParams.get('user_id').replace('eq.', '');
    return Response.json(sub === want && members[sub] ? [members[sub]] : []);
  }
  if (url === 'https://api.anthropic.com/v1/messages') {
    claudeCalls++; lastClaudeBody = JSON.parse(init.body);
    if (!init.headers['x-api-key']) return new Response('no key', { status: 401 });
    return Response.json(claudeReply ?? { stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 120 }, content: [{ type: 'text', text: JSON.stringify({
      kind: 'flight', confirmation: 'abc123', cancel_kind: null, stay: null,
      legs: [{ airline: 'ua', flight_no: 'UA 1215', from: 'lax', to: 'SEA', dep_local: '2027-03-01T08:00', arr_local: '2027-03-01T10:45', aircraft: null, cabin: 'Economy' }],
    }) }] });
  }
  throw new Error('unexpected fetch ' + url);
};

const env = { SUPABASE_URL: SUPA, SUPABASE_KEY: 'pub', ALLOWED_ORIGINS: 'https://offthewall.dev,http://localhost:8080', AI_ENABLED: 'true', MODEL: 'claude-haiku-5-5',
  BACKFILL_LIMIT: '300', BACKFILL_DAYS: '7', ANTHROPIC_API_KEY: 'test-key', USAGE };
const email = { subject: 'Your trip to Seattle', from: 'United <unitedairlines@united.com>', date: 'Mon, 1 Feb 2027 10:00:00 -0800', text: 'Confirmation ABC123. UA 1215 LAX to SEA, Mar 1 8:00 AM.' };
async function call({ origin = 'https://offthewall.dev', auth, body = email, method = 'POST', path = '/v1/contrail/parse-email', e = env } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await worker.fetch(new Request(`https://otw-ai.example${path}`, { method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }), e);
  return { status: res.status, cors: res.headers.get('access-control-allow-origin'), json: res.status === 204 ? null : await res.json() };
}

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
function countSchemaUnions(schema) {
  if (Array.isArray(schema)) return schema.reduce((sum, item) => sum + countSchemaUnions(item), 0);
  if (!schema || typeof schema !== 'object') return 0;
  const own = Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.type) ? 1 : 0;
  return own + Object.values(schema).reduce((sum, value) => sum + countSchemaUnions(value), 0);
}
const unionCount = countSchemaUnions(SCHEMA);
check('Claude schema stays within the 16-union limit', unionCount <= 16, `${unionCount} union fields`);
const good = await token();

let r = await call({ origin: 'https://evil.example', auth: good });
check('another website is refused (403, no CORS header)', r.status === 403 && !r.cors);
r = await call({ origin: null, auth: good });
check('no Origin (curl, a server) is refused', r.status === 403);
r = await call({ method: 'OPTIONS' });
check('preflight from offthewall.dev', r.status === 204 && r.cors === 'https://offthewall.dev');
r = await call({ origin: 'http://localhost:8080', auth: good });
check('localhost:8080 allowed for testing', r.status === 200 && r.cors === 'http://localhost:8080');

r = await call({});
check('signed out → 401', r.status === 401 && r.json.error === 'sign_in');
r = await call({ auth: await token({}, { key: otherPair.privateKey }) });
check('forged signature → 401', r.status === 401);
r = await call({ auth: await token({ exp: Math.floor(Date.now() / 1000) - 10 }) });
check('expired → 401', r.status === 401);
r = await call({ auth: await token({ iss: 'https://other.supabase.co/auth/v1' }) });
check('another project’s token → 401', r.status === 401);
r = await call({ auth: await token({ is_anonymous: true }) });
check('anonymous account → 401', r.status === 401);
r = await call({ auth: await token({ app_metadata: { provider: 'email' }, user_metadata: { email_verified: false } }) });
check('unverified email → 401', r.status === 401);
r = await call({ auth: (await token()).replace(/\.[^.]+\./, `.${b64url(enc.encode(JSON.stringify({ sub: 'user-a', role: 'service_role' })))}.`) });
check('tampered claims → 401', r.status === 401);

r = await call({ auth: await token({ sub: 'stranger' }) });
check('signed in, not a member → 403', r.status === 403 && r.json.error === 'not_enabled');
r = await call({ auth: await token({ sub: 'user-nogmail' }) });
check('member without the Gmail switch → 403', r.status === 403);
r = await call({ auth: await token({ sub: 'user-paused' }) });
check('paused member → 403', r.status === 403);

const before = claudeCalls;
r = await call({ auth: good, e: { ...env, AI_ENABLED: 'false' } });
check('AI_ENABLED=false → 503, Claude not called', r.status === 503 && r.json.error === 'ai_paused' && claudeCalls === before);

r = await call({ auth: good, body: { ...email, text: 'x'.repeat(13000) } });
check('over-long email → 413, Claude not called', r.status === 413 && claudeCalls === before);
r = await call({ auth: good, body: '{nope' });
check('not JSON → 400', r.status === 400);

kv.clear();
kvPutFailures = 1;
const putAttemptsBeforeRetry = kvPutAttempts;
r = await call({ auth: good });
check('a transient KV 429 is retried', r.status === 200 && kvPutFailures === 0 && kvPutAttempts === putAttemptsBeforeRetry + 3);
check('member with Gmail on → 200 with a tidy result', r.status === 200 && r.json.result.kind === 'flight' && r.json.result.confirmation === 'ABC123'
  && r.json.result.legs[0].airline === 'UA' && r.json.result.legs[0].flight_no === '1215' && r.json.result.legs[0].from === 'LAX', JSON.stringify(r.json.result.legs[0]));
check('request uses Haiku, strict JSON schema, no API key leak in reply', lastClaudeBody.model === 'claude-haiku-5-5' && lastClaudeBody.output_config.format.type === 'json_schema' && !JSON.stringify(r.json).includes('test-key'));
check('backfill week: limit is 300', r.json.remaining === 299, `remaining ${r.json.remaining}`);

// Past the backfill week, the member's own 20 a day applies; at the limit → 429 and no Claude call
kv.set('first:email:user-a', String(Date.now() - 8 * 864e5));
kv.set(`usage:email:user-a:${pacificDay()}`, '19');
r = await call({ auth: good });
check('after backfill: 20th of 20 allowed', r.status === 200 && r.json.remaining === 0);
const atLimit = claudeCalls;
r = await call({ auth: good });
check('21st → 429, Claude not called', r.status === 429 && r.json.error === 'daily_limit' && claudeCalls === atLimit);
check('the count resets the next day (new Pacific-day key)', pacificDay(Date.now() + 864e5) !== pacificDay() && !kv.has(`usage:email:user-a:${pacificDay(Date.now() + 864e5)}`));

kv.clear();
claudeReply = { stop_reason: 'refusal', usage: { input_tokens: 10, output_tokens: 0 }, content: [] };
r = await call({ auth: good });
check('a refusal comes back as kind "none"', r.status === 200 && r.json.result.kind === 'none');
claudeReply = { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify({ kind: 'flight', confirmation: 'X', cancel_kind: null, stay: null, legs: [{ airline: 'UA', flight_no: '1', from: 'LOS ANGELES', to: 'SEA', dep_local: 'tomorrow', arr_local: null, aircraft: null, cabin: null }] }) }] };
r = await call({ auth: good });
check('malformed legs are dropped (kind becomes "none")', r.status === 200 && r.json.result.kind === 'none');
// Prices (Nov 19, 2026): the whole booking's total, points and program; never card digits
const reply = (result) => ({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(result) }] });
const flight = { kind: 'flight', confirmation: 'AS7FR6', cancel_kind: null, stay: null,
  legs: [{ airline: 'AS', flight_no: '1234', from: 'LAX', to: 'SEA', dep_local: '2027-03-01T08:00', arr_local: '2027-03-01T10:45', aircraft: '', cabin: '' }] };
check('schema asks for paid and travelers', !!SCHEMA.properties.paid && !!SCHEMA.properties.travelers && SCHEMA.required.includes('paid') && SCHEMA.required.includes('travelers'));
claudeReply = reply({ ...flight, paid: { total: 11.2, currency: 'usd', points: 25000, program: 'Alaska Mileage Plan' }, travelers: ['WILLIAM WALL'] });
r = await call({ auth: good });
check('cash plus points comes through', r.status === 200 && r.json.result.paid?.total === 11.2 && r.json.result.paid.currency === 'USD' && r.json.result.paid.points === 25000 && r.json.result.paid.program === 'Alaska Mileage Plan', JSON.stringify(r.json.result.paid));
claudeReply = reply({ ...flight, paid: { total: 0, currency: '', points: 0, program: 'Visa ending 4242' }, travelers: ['William Wall', 'Card 4242 4242 4242 4242', 'Serena Tramm'] });
r = await call({ auth: good });
check('nothing paid → paid is null; card digits never get through', r.json.result.paid === null && !JSON.stringify(r.json.result).includes('4242'), JSON.stringify(r.json.result));
check('travelers kept, names only', JSON.stringify(r.json.result.travelers) === JSON.stringify(['William Wall', 'Serena Tramm']));
claudeReply = reply({ kind: 'none', confirmation: null, cancel_kind: null, legs: [], stay: null, paid: { total: 50, currency: 'USD', points: 0, program: '' }, travelers: [] });
r = await call({ auth: good });
check('no booking → no paid', r.json.result.kind === 'none' && r.json.result.paid === null);
// Stays: region and address (Nov 19, 2026); a car rental is not a stay
const stayReply = (stay) => reply({ kind: 'stay', confirmation: 'C1', cancel_kind: null, legs: [], paid: { total: 0, currency: '', points: 0, program: '' }, travelers: [],
  stay: { brand: null, city: 'Winter Park', country: 'United States', check_in: '2026-01-22', check_out: '2026-01-25', booked_via: null, region: 'CO', address: '', ...stay } });
check('stay schema asks for region and address', ['region', 'address'].every((k) => SCHEMA.properties.stay.anyOf[0].properties[k]?.type === 'string'));
claudeReply = stayReply({ name: 'High-End Mountain Cabin', address: '123 Vasquez Rd' });
r = await call({ auth: good });
check('region and address come through', r.json.result.stay?.region === 'CO' && r.json.result.stay.address === '123 Vasquez Rd', JSON.stringify(r.json.result.stay));
claudeReply = stayReply({ name: '', region: '', address: '' });
for (const name of ['Alamo Fullsize Pickup AWD/4X4 (Denver International Airport rental)', 'Hertz', 'Enterprise Rent-A-Car', 'Rental car at DEN', 'Sixt SUV']) {
  claudeReply = stayReply({ name });
  r = await call({ auth: good });
  check(`car rental is not a stay: ${name}`, r.json.result.kind === 'none' && r.json.result.stay === null, JSON.stringify(r.json.result));
}
for (const name of ['Budget Inn Sacramento', 'National Hotel Miami Beach', 'Hilton Garden Inn Avis Way']) {
  claudeReply = stayReply({ name });
  r = await call({ auth: good });
  check(`a hotel is still a stay: ${name}`, r.json.result.kind === 'stay', JSON.stringify(r.json.result));
}
claudeReply = null;

r = await call({ auth: good, path: '/v1/anything-else' });
check('unknown path → 404', r.status === 404);
check('verifySignIn returns claims for a good token', (await verifySignIn(good, env))?.sub === 'user-a');

// ---------- POST /v1/wallet/ask (Nov 21, 2026) ----------
const wallet = { cards: [{ name: 'Chase Sapphire Preferred', annualFee: 95 }], people: [{ name: 'Me', fiveTwentyFour: 2 }] };
const ask = { question: 'What should my next card be?', wallet, thread: [{ q: 'Earlier question', a: 'Earlier answer' }] };
const walletReply = (result) => ({ stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 300 }, content: [{ type: 'text', text: JSON.stringify(result) }] });
const askCall = (o = {}) => call({ path: '/v1/wallet/ask', body: ask, ...o });
const wUser = await token({ sub: 'user-w' });
check('wallet schema: summary and suggestions, no unions', WALLET_SCHEMA.required.join() === 'summary,suggestions' && countSchemaUnions(WALLET_SCHEMA) === 0);

r = await askCall({ origin: 'https://evil.example', auth: wUser });
check('wallet: another website is refused', r.status === 403 && !r.cors);
r = await askCall({});
check('wallet: signed out → 401', r.status === 401 && r.json.error === 'sign_in');
r = await askCall({ auth: await token({ sub: 'user-w', exp: Math.floor(Date.now() / 1000) - 10 }) });
check('wallet: expired sign-in → 401', r.status === 401);
r = await askCall({ auth: await token({ sub: 'stranger' }) });
check('wallet: not a member → 403', r.status === 403 && r.json.error === 'not_enabled');
r = await askCall({ auth: good });
check('wallet: AI switch off (Gmail on) → 403', r.status === 403 && r.json.error === 'not_enabled');
r = await askCall({ auth: await token({ sub: 'user-paused' }) });
check('wallet: paused member → 403', r.status === 403);
const rpcBefore = rpcCalls;
r = await askCall({ auth: await token({ sub: 'user-ai-only' }) });
check('wallet: AI on but not approved for Wallet → 403 (asked the database)', r.status === 403 && r.json.error === 'not_enabled' && rpcCalls === rpcBefore + 1);

let c0 = claudeCalls;
r = await askCall({ auth: wUser, e: { ...env, AI_ENABLED: 'false' } });
check('wallet: AI_ENABLED=false → 503, Claude not called', r.status === 503 && r.json.error === 'ai_paused' && claudeCalls === c0);
r = await askCall({ auth: wUser, body: '{nope' });
check('wallet: not JSON → 400', r.status === 400);
r = await askCall({ auth: wUser, body: { ...ask, question: '   ' } });
check('wallet: empty question → 400', r.status === 400);
r = await askCall({ auth: wUser, body: { ...ask, wallet: null } });
check('wallet: no wallet → 400', r.status === 400);
r = await askCall({ auth: wUser, body: { ...ask, question: 'x'.repeat(700) } });
check('wallet: over-long question → 413', r.status === 413);
r = await askCall({ auth: wUser, body: { ...ask, wallet: { notes: 'x'.repeat(9500) } } });
check('wallet: over-big wallet → 413', r.status === 413);
r = await askCall({ auth: wUser, body: 'x'.repeat(21000) });
check('wallet: over-long body → 413, Claude not called', r.status === 413 && claudeCalls === c0);

kv.clear();
claudeReply = walletReply({ summary: 'Add a grocery card.', suggestions: [
  { name: 'Gold Card', issuer: 'American Express', annualFee: 325, typicalBonus: '60,000 points', why: 'You spend a lot on groceries.', watchOut: 'Once-per-lifetime bonus.' },
  { name: '', issuer: 'Nobody', annualFee: 0, typicalBonus: '', why: 'dropped: no name', watchOut: '' },
  { name: 'Card 4111 1111 1111 1111', issuer: 'X', annualFee: -5, typicalBonus: '', why: '', watchOut: '' }] });
r = await askCall({ auth: wUser });
check('wallet: member with AI on → 200 { result, remaining }', r.status === 200 && r.json.result.summary === 'Add a grocery card.' && r.json.remaining === 2, JSON.stringify(r.json));
check('wallet: suggestions tidied (no blank names, no card digits)', r.json.result.suggestions.length === 1 && r.json.result.suggestions[0].annualFee === 325 && !JSON.stringify(r.json).includes('4111'));
check('wallet: Worker owns the prompt and the schema', lastClaudeBody.system.includes("What's in My Wallet") && JSON.stringify(lastClaudeBody.output_config.format.schema) === JSON.stringify(WALLET_SCHEMA)
  && lastClaudeBody.messages[0].content.includes('<question>\nWhat should my next card be?') && lastClaudeBody.messages[0].content.includes('Earlier answer') && lastClaudeBody.model === 'claude-haiku-5-5');
check('wallet: its own daily count, not the email one', kv.get(`usage:wallet:user-w:${pacificDay()}`) === '1' && !kv.has(`usage:email:user-w:${pacificDay()}`) && !kv.has('first:wallet:user-w'));
await askCall({ auth: wUser }); r = await askCall({ auth: wUser });
check('wallet: 3rd of 3 allowed', r.status === 200 && r.json.remaining === 0);
c0 = claudeCalls;
r = await askCall({ auth: wUser });
check('wallet: 4th → 429, Claude not called', r.status === 429 && r.json.error === 'daily_limit' && claudeCalls === c0);
kv.set(`usage:email:user-a:${pacificDay()}`, '999');
walletMembers.add('user-a'); members['user-a'].flags.ai = true;
r = await askCall({ auth: good });
check('wallet: a full email count doesn’t block Wallet', r.status === 200);
members['user-a'].flags.ai = false;

kv.clear();
claudeReply = { stop_reason: 'refusal', usage: {}, content: [] };
r = await askCall({ auth: wUser });
check('wallet: a refusal is a polite summary, no suggestions', r.status === 200 && r.json.result.suggestions.length === 0 && /can't help/.test(r.json.result.summary));
claudeReply = { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'not json' }] };
r = await askCall({ auth: wUser });
check('wallet: unreadable answer → 502', r.status === 502 && r.json.error === 'failed');
claudeReply = null;
let wasBusy = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => (String(u).includes('anthropic') ? (wasBusy = true, new Response('{}', { status: 529 })) : realFetch(u, i));
r = await askCall({ auth: wUser });
check('wallet: Claude overloaded → 503 busy', wasBusy && r.status === 503 && r.json.error === 'busy');
globalThis.fetch = realFetch;

console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
