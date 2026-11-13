// Gmail import for Contrail members with the Gmail switch on (set on /admin/).
//
// Everything happens in the member's browser:
//   - Google's sign-in library asks for read-only Gmail access (gmail.readonly). The access token
//     lasts about an hour and is kept only in this tab (sessionStorage). No server ever holds it.
//   - Contrail searches for booking emails (email-import.js has the list), oldest first, and
//     skips any it has already checked (the processed_emails collection: message ID + outcome).
//   - Booking markup in the email (schema.org) is used as is. Otherwise the email's plain text is
//     sent to the AI Worker (worker-ai/), which returns the flight, stay or cancellation.
//   - The result is merged into trips and stays. Email text is never saved; only what was found.
// After connecting, a sync runs each time Contrail opens while this tab still has Google's
// access (browsers block Google's pop-up unless you tap), and "Sync now" runs one any time.
import { config } from '/shared/config.js';
import { loadAuth } from '/shared/auth-loader.js';
import { gmailQuery, markupItems, fromMarkup, messageParts, plainText, senderDomain, mergeBooking } from '/contrail/email-import.js';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CAP = 500; // emails per sync; a longer backfill carries on next time
const TOKEN_KEY = 'contrail-gmail-token';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');

class Stop extends Error { constructor(message, code) { super(message); this.code = code; } }

// null unless this member can use Gmail import here
export async function setUpGmail({ store, airport, placeName, home, geocode, toast, rerender }) {
  if (store.mode !== 'account') return null;
  let flags = null;
  try {
    const auth = await loadAuth();
    const { data } = await auth.db.from('members').select('active, flags').maybeSingle();
    flags = data;
  } catch { return null; }
  if (!flags?.active || !flags.flags?.gmail) return null;
  const ready = Boolean(config.googleClientId && config.workerUrl);

  let doc = (await store.getDoc('gmail')) || { connected: false, years: 3, log: [] };
  let running = false, progress = null, lastNote = '';
  const save = async (patch) => { doc = { ...doc, ...patch }; await store.setDoc('gmail', doc); };

  // ---------- Google access token (this tab only) ----------
  const readToken = () => { try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); return t && t.exp > Date.now() + 60000 ? t.token : null; } catch { return null; } };
  const keepToken = (token, secs) => { try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + (secs - 60) * 1000 })); } catch { /* storage blocked */ } };
  const dropToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };
  let gis = null;
  const loadGis = () => (gis ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(window.google); s.onerror = () => { gis = null; reject(new Error("Couldn't reach Google")); };
    document.head.append(s);
  }));
  // Must start from a tap (Google opens a small window)
  async function askGoogle(first) {
    const google = await loadGis();
    const auth = await loadAuth();
    const user = await auth.ready;
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: config.googleClientId, scope: SCOPE, login_hint: doc.email || user?.email || '',
        callback: (r) => {
          if (r.error) return reject(new Error(r.error_description || r.error));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return reject(new Error('Contrail needs the "Read your email" box ticked to find bookings.'));
          keepToken(r.access_token, Number(r.expires_in) || 3600);
          resolve(r.access_token);
        },
        error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'The Google window was closed.' : e?.type === 'popup_failed_to_open' ? 'Your browser blocked the Google window. Allow pop-ups for offthewall.dev and try again.' : 'Google sign-in didn’t finish.')),
      });
      client.requestAccessToken({ prompt: first ? 'consent' : '' });
    });
  }

  // ---------- Gmail and the Worker ----------
  async function gmail(path, token) {
    const res = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { dropToken(); throw new Stop('Google access ran out. Tap Sync now to carry on.', 'token'); }
    if (!res.ok) throw new Error(`Gmail ${res.status}`);
    return res.json();
  }
  async function worker(email) {
    const auth = await loadAuth();
    const session = (await auth.db.auth.getSession()).data.session;
    const res = await fetch(`${config.workerUrl}/v1/contrail/parse-email`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify(email),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body.result;
    // Stop the whole sync for these; the emails stay unchecked and are tried next time
    if ([401, 403, 429, 503].includes(res.status)) throw new Stop(body.message || 'Email reading is unavailable right now.', body.error);
    return null; // this one email failed; it's marked failed and retried next sync
  }

  // ---------- one sync ----------
  async function sync({ interactive = false } = {}) {
    if (running || !ready || !doc.connected) return;
    let token = readToken();
    if (!token) {
      if (!interactive) { lastNote = 'Tap Sync now to check Gmail for new bookings.'; rerender(); return; }
      try { token = await askGoogle(false); } catch (err) { lastNote = err.message; rerender(); return; }
    }
    running = true; lastNote = ''; progress = { done: 0, total: 0, phase: 'Searching Gmail…' }; rerender();
    const started = new Date().toISOString();
    const counts = { added: 0, updated: 0, ignored: 0, failed: 0 };
    const entries = [];
    let capped = false, stopped = null;
    try {
      const since = doc.backfillDone && doc.lastSyncAt ? Date.parse(doc.lastSyncAt) - 2 * 864e5 : Date.now() - (Number(doc.years) || 3) * 365.25 * 864e5;
      const done = new Map((await store.list('processed_emails')).filter((p) => p.status !== 'failed').map((p) => [p.id, p.status]));
      // Gmail lists newest first; collect the unchecked ones, then work oldest first so a
      // change or cancellation lands after the booking it changes
      const todo = [];
      let page = '';
      do {
        const r = await gmail(`/messages?maxResults=100&q=${encodeURIComponent(gmailQuery(since))}${page ? `&pageToken=${page}` : ''}`, token);
        for (const m of r.messages || []) if (!done.has(m.id)) { if (todo.length < CAP) todo.push(m.id); else capped = true; }
        if (todo.length >= CAP && r.nextPageToken) capped = true;
        page = todo.length < CAP ? r.nextPageToken : '';
      } while (page);
      todo.reverse();
      progress = { done: 0, total: todo.length, phase: todo.length ? 'Reading bookings…' : '' }; rerender();

      let trips = await store.list('trips'), stays = await store.list('stays');
      for (const id of todo) {
        const msg = await gmail(`/messages/${id}?format=full`, token);
        const parts = messageParts(msg);
        const domain = senderDomain(parts.from);
        let result = fromMarkup(markupItems(parts.html), airport);
        if (!result) {
          const text = plainText(parts.html, parts.text);
          result = text ? await worker({ subject: parts.subject, from: parts.from, date: parts.date, text }) : { kind: 'none' };
        }
        let outcome;
        if (result === null) outcome = { status: 'failed', label: `Couldn't read an email from ${domain || 'unknown sender'}` };
        else {
          outcome = mergeBooking(result, trips, stays, { msgId: id, domain, airport, placeName, home: home(), now: new Date().toISOString() });
          if (outcome.put) {
            const [col, rec] = outcome.put;
            if (col === 'stays' && rec.lat == null && rec.name) Object.assign(rec, (await geocode([rec.name, rec.city, rec.country].filter(Boolean).join(', '))) || (await geocode([rec.city, rec.country].filter(Boolean).join(', '))) || {});
            const saved = await store.put(col, rec);
            outcome.ref = `${col}:${saved.id}`;
            if (col === 'trips') trips = [...trips.filter((t) => t.id !== saved.id), saved];
            else stays = [...stays.filter((s) => s.id !== saved.id), saved];
          }
        }
        await store.put('processed_emails', { id, status: outcome.status, ref: outcome.ref || '', processedAt: new Date().toISOString() });
        counts[outcome.status]++;
        if (outcome.status !== 'ignored' || entries.length < 60) entries.push({ at: new Date().toISOString(), status: outcome.status, label: outcome.label, ref: outcome.ref || '' });
        progress.done++; paintProgress();
      }
    } catch (err) {
      if (err instanceof Stop) stopped = err; else { console.error(err); stopped = new Stop("Sync stopped: couldn't reach Gmail or the email reader. Try again in a bit."); }
    }
    const finished = !stopped && !capped;
    const summary = `${counts.added} added, ${counts.updated} updated, ${counts.ignored} skipped${counts.failed ? `, ${counts.failed} couldn't be read` : ''}`;
    lastNote = stopped ? stopped.message : capped ? `Checked ${CAP} emails; Sync now carries on with the rest.` : '';
    await save({
      lastSyncAt: finished ? started : doc.lastSyncAt, backfillDone: doc.backfillDone || finished, lastResult: summary, lastRunAt: new Date().toISOString(),
      log: [...entries.reverse(), ...(doc.log || [])].slice(0, 80),
    });
    running = false; progress = null; rerender();
    if (counts.added || counts.updated) toast(`From Gmail: ${summary}`);
  }

  function paintProgress() {
    const bar = document.getElementById('gmailProgress'), label = document.getElementById('gmailProgressLabel');
    if (!bar || !progress) return;
    bar.max = Math.max(1, progress.total); bar.value = progress.done;
    label.textContent = progress.total ? `${progress.phase} ${progress.done} of ${progress.total}` : progress.phase;
  }

  // ---------- Settings panel ----------
  function panelHTML() {
    const head = '<h3 style="font-size:20px;text-transform:uppercase">Import from Gmail</h3>';
    if (!ready) return `<div class="panel gmail">${head}<p class="lw" style="margin:0">Gmail import is switched on for your account but isn't set up on the site yet. Check back soon.</p></div>`;
    if (!doc.connected) {
      return `<div class="panel gmail">${head}
        <p class="lw" style="margin:0">Contrail can find your flight and hotel confirmations in Gmail and add them for you. It asks Google for read-only access, reads only booking emails from airlines, hotels and travel sites, and saves just the trip details, never the emails. <a href="/privacy/#gmail">How it works</a>.</p>
        <label class="fl" for="gmailYears">Look back
          <select id="gmailYears">${[1, 2, 3, 5].map((y) => `<option value="${y}" ${Number(doc.years || 3) === y ? 'selected' : ''}>${y} year${y === 1 ? '' : 's'}</option>`).join('')}</select></label>
        <div class="row" style="justify-content:flex-start"><button type="button" class="btn primary" data-gmail="connect">Connect Gmail</button></div>
        ${lastNote ? `<p class="lw gmail-note" role="status">${esc(lastNote)}</p>` : ''}</div>`;
    }
    const log = (doc.log || []).slice(0, 25);
    return `<div class="panel gmail">${head}
      <p class="lw" style="margin:0">Connected${doc.email ? ` as <b>${esc(doc.email)}</b>` : ''}. Last checked ${esc(when(doc.lastRunAt))}${doc.lastResult ? `: ${esc(doc.lastResult)}` : ''}.</p>
      ${progress ? `<div class="gmail-progress"><progress id="gmailProgress" max="${Math.max(1, progress.total)}" value="${progress.done}"></progress><span class="lw" id="gmailProgressLabel" aria-live="polite">${esc(progress.total ? `${progress.phase} ${progress.done} of ${progress.total}` : progress.phase)}</span></div>` : ''}
      ${lastNote ? `<p class="lw gmail-note" role="status">${esc(lastNote)}</p>` : ''}
      <div class="row" style="justify-content:flex-start"><button type="button" class="btn primary" data-gmail="sync" ${running ? 'disabled' : ''}>${running ? 'Syncing…' : 'Sync now'}</button><button type="button" class="btn" data-gmail="disconnect" ${running ? 'disabled' : ''}>Disconnect</button></div>
      ${log.length ? `<details class="gmail-log"><summary>Sync log</summary><ul class="tl">${log.map((e) => `<li><span class="chip gm-${esc(e.status)}">${esc({ added: 'Added', updated: 'Updated', ignored: 'Skipped', failed: 'Not read' }[e.status] || e.status)}</span> ${esc(e.label)} <span class="lw">${esc(when(e.at))}</span></li>`).join('')}</ul></details>` : ''}
    </div>`;
  }

  async function onClick(b) {
    const act = b.dataset.gmail;
    if (act === 'connect') {
      b.disabled = true;
      try {
        await askGoogle(true);
        const user = await (await loadAuth()).ready;
        await save({ connected: true, email: user?.email || '', years: Number(document.getElementById('gmailYears')?.value) || 3, backfillDone: false, lastSyncAt: null });
        lastNote = ''; rerender();
        await sync({ interactive: true });
      } catch (err) { lastNote = err.message; b.disabled = false; rerender(); }
    }
    if (act === 'sync') await sync({ interactive: true });
    if (act === 'disconnect') {
      // Revoking any live token from the grant removes Contrail's Gmail access at Google. With no
      // live token in this tab there's nothing to revoke with, so say where to remove it.
      const token = readToken();
      let revoked = false;
      try { if (token) { (await loadGis()).accounts.oauth2.revoke(token, () => {}); revoked = true; } } catch { /* already gone */ }
      dropToken();
      await save({ connected: false, backfillDone: false, lastSyncAt: null });
      lastNote = revoked ? 'Disconnected. Contrail no longer has access to your Gmail.'
        : 'Disconnected here. To remove Contrail’s Gmail permission at Google too, open myaccount.google.com/permissions.';
      rerender();
    }
  }

  return { panelHTML, onClick, sync };
}
