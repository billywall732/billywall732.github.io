// Asking Claude from an app page, through the AI Worker (worker-ai/). The Worker owns the prompt,
// the model and the answer's shape; a page only sends its question and data. Members only: the
// Worker checks the sign-in, the member's AI switch, app approval and the daily limit itself.
//
//   askWallet({ question, wallet, thread, signal })  →  { result: { summary, suggestions[] }, remaining }
//
// Failures throw an AiError with a code and a message that's fine to show as is:
//   sign_in · not_enabled · daily_limit · ai_paused · busy · too_long · bad_request · failed
//   · network · cancelled
import { config } from '/shared/config.js?v=2';
import { loadAuth } from '/shared/auth-loader.js';

export class AiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function post(path, payload, signal) {
  if (!config.workerUrl) throw new AiError('failed', "Asking Claude isn't set up yet.");
  const auth = await loadAuth();
  const session = (await auth.db.auth.getSession()).data.session;
  if (!session?.access_token) throw new AiError('sign_in', 'Sign in again to ask Claude.');
  let res;
  try {
    res = await fetch(`${config.workerUrl}${path}`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new AiError('cancelled', 'Stopped.');
    throw new AiError('network', "Couldn't reach Claude. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiError(body.error || 'failed', body.message || "Claude couldn't answer just now. Try again in a moment.");
  return body;
}

// thread: earlier turns, oldest first, as [{ q, a }] (a = the answer's summary); the Worker uses
// the last 4
export function askWallet({ question, wallet, thread = [], signal } = {}) {
  return post('/v1/wallet/ask', { question, wallet, thread: thread.slice(-4) }, signal);
}
