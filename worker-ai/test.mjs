// Checks every gate in the AI Worker without touching anything real: Supabase's keys, the members
// table, KV and the Claude API are all stand-ins, and the sign-ins are signed with a test key.
//   node worker-ai/test.mjs
import worker, { pacificDay, verifySignIn } from './src/index.js';

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
};
const kv = new Map();
const USAGE = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } };
let claudeCalls = 0, claudeReply = null, lastClaudeBody = null;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === `${SUPA}/auth/v1/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
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
r = await call({ auth: good });
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
claudeReply = null;

r = await call({ auth: good, path: '/v1/anything-else' });
check('unknown path → 404', r.status === 404);
check('verifySignIn returns claims for a good token', (await verifySignIn(good, env))?.sub === 'user-a');

console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
