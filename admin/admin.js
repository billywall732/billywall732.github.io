// The admin page at /admin/: approve or decline access requests, and set each member's apps and
// switches. Everything goes through the database's admin_* functions, which check admin rights on
// every call; this page is only the view. Signed out → a sign-in button; signed in but not an
// admin → "not available". Nothing here is counted or indexed.
import { loadAuth, mightBeSignedIn } from '/shared/auth-loader.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const APPS = { contrail: 'Contrail', wallet: 'Wallet' };
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const root = $('#admin');

let auth = null, me = null, data = null;
const show = (html) => { root.innerHTML = html; };

async function start() {
  try {
    if (mightBeSignedIn()) {
      auth = await loadAuth();
      me = await auth.ready;
    }
  } catch (err) {
    console.error(err);
  }
  if (!me) {
    show(`<section class="ad-panel ad-center">
      <h2>Sign in</h2>
      <p>This page is for the site's admin. Sign in with the Google account that runs Off the Wall.</p>
      <button type="button" class="button primary" data-act="sign-in">Sign in with Google</button></section>`);
    return;
  }
  const who = $('#ad-who');
  who.innerHTML = `Signed in as <b>${esc(me.email)}</b> · <button type="button" class="ad-link" data-act="sign-out">Sign out</button>`;
  who.hidden = false;
  await load();
}

async function load() {
  const { data: o, error } = await auth.db.rpc('admin_overview');
  if (error) {
    if (error.code === '42501' || /admins only/i.test(error.message || '')) {
      show(`<section class="ad-panel ad-center"><h2>Not available</h2>
        <p>This page is only for the site's admin. If you're looking for Contrail or What’s in My Wallet?, they're on the <a href="/home/#workshop">Workshop</a>.</p></section>`);
    } else {
      console.error(error);
      show(`<div class="ad-notice warn" role="alert"><b>Couldn’t load access just now</b> (${esc(error.message)}). <button type="button" class="ad-link" data-act="reload">Try again</button></div>`);
    }
    return;
  }
  data = o;
  render();
}

function render() {
  const pending = data.requests.filter((r) => r.status === 'pending');
  const decided = data.requests.filter((r) => r.status !== 'pending');
  const person = (x) => `<span class="ad-person"><b>${esc(x.name || x.email)}</b>${x.name ? `<span class="ad-sub">${esc(x.email)}</span>` : ''}</span>`;
  const sw = (label, on, attrs, disabled = false, note = '') => `<label class="ad-switch${disabled ? ' is-disabled' : ''}" title="${esc(note)}">
      <input type="checkbox" role="switch" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${attrs}><span class="ad-track" aria-hidden="true"></span><span class="ad-sr">${esc(label)}</span></label>`;

  const requests = pending.length
    ? `<ul class="ad-requests">${pending.map((r) => `<li class="ad-request">
        ${person(r)}
        <span class="ad-app">${esc(APPS[r.app] || r.app)}</span>
        <span class="ad-sub">Asked ${esc(when(r.requested_at))}</span>
        <span class="ad-actions">
          <button type="button" class="button primary small" data-act="approve" data-user="${esc(r.user_id)}" data-app="${esc(r.app)}">Approve</button>
          <button type="button" class="button small" data-act="decline" data-user="${esc(r.user_id)}" data-app="${esc(r.app)}">Decline</button>
        </span></li>`).join('')}</ul>`
    : '<p class="ad-note">No requests waiting.</p>';

  const earlier = decided.length
    ? `<details class="ad-earlier"><summary>Earlier requests (${decided.length})</summary><ul class="ad-requests">${decided.map((r) => `<li class="ad-request is-done">
        ${person(r)}<span class="ad-app">${esc(APPS[r.app] || r.app)}</span>
        <span class="ad-sub">${r.status === 'approved' ? 'Approved' : 'Declined'} ${esc(when(r.decided_at))}</span>
        ${r.status === 'declined' ? `<span class="ad-actions"><button type="button" class="button small" data-act="approve" data-user="${esc(r.user_id)}" data-app="${esc(r.app)}">Approve now</button></span>` : ''}</li>`).join('')}</ul></details>`
    : '';

  const members = data.members.length
    ? `<div class="ad-table-wrap"><table class="ad-table">
        <thead><tr><th>Person</th><th>Contrail</th><th>Wallet</th><th>Active</th><th>AI</th><th>Gmail</th><th>AI a day</th></tr></thead>
        <tbody>${data.members.map((m) => {
          const self = m.user_id === me.id, u = `data-user="${esc(m.user_id)}"`;
          return `<tr${m.active ? '' : ' class="is-paused"'}>
            <td data-label="Person">${person(m)}${m.role === 'admin' ? '<span class="ad-badge">Admin</span>' : ''}${m.active ? '' : '<span class="ad-badge is-off">Paused</span>'}</td>
            <td data-label="Contrail">${sw(`Contrail access for ${m.email}`, m.apps.includes('contrail'), `data-act="app" data-app="contrail" ${u}`)}</td>
            <td data-label="Wallet">${sw(`Wallet access for ${m.email}`, m.apps.includes('wallet'), `data-act="app" data-app="wallet" ${u}`)}</td>
            <td data-label="Active">${sw(`${m.email} is active`, m.active, `data-act="member" data-field="active" ${u}`, self, self ? 'You can’t pause your own access' : '')}</td>
            <td data-label="AI">${sw(`AI features for ${m.email}`, m.flags?.ai, `data-act="member" data-field="ai" ${u}`)}</td>
            <td data-label="Gmail">${sw(`Gmail import for ${m.email}`, m.flags?.gmail, `data-act="member" data-field="gmail" ${u}`)}</td>
            <td data-label="AI a day"><input class="ad-limit" type="number" min="0" max="1000" step="1" value="${Number(m.daily_ai_limit) || 0}" aria-label="Daily AI limit for ${esc(m.email)}" data-act="member" data-field="limit" ${u}></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
    : '<p class="ad-note">No members yet. Approve a request above to add one.</p>';

  show(`<section class="ad-panel"><h2>Waiting for you <span class="ad-count">${pending.length}</span></h2>${requests}${earlier}</section>
    <section class="ad-panel"><h2>Members <span class="ad-count">${data.members.length}</span></h2>
      <p class="ad-sub ad-help">Turning an app off keeps that person's saved data; they just can't open it until it's back on. Paused people can't open any app. AI and Gmail cost money per use: the daily limit caps it.</p>
      ${members}</section>
    <p class="ad-status" id="ad-status" role="status"></p>`);
}

const status = (text, bad = false) => { const el = $('#ad-status'); if (el) { el.textContent = text; el.classList.toggle('is-bad', bad); } };

// One change, then a fresh view from the database (so the page never shows something it isn't)
async function change(rpc, args, okText) {
  const { error } = await auth.db.rpc(rpc, args);
  if (error) { console.error(error); render(); status(`Couldn’t save: ${error.message}`, true); return; }
  await load();
  status(okText);
}

function memberArgs(userId, field, value) {
  const m = data.members.find((x) => x.user_id === userId);
  return {
    p_user: userId,
    p_active: field === 'active' ? value : m.active,
    p_ai: field === 'ai' ? value : !!m.flags?.ai,
    p_gmail: field === 'gmail' ? value : !!m.flags?.gmail,
    p_daily_ai_limit: field === 'limit' ? value : Number(m.daily_ai_limit) || 0,
  };
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const { act, user, app } = b.dataset;
  if (act === 'sign-in') { b.disabled = true; (auth || await loadAuth()).signIn({ chooseAccount: true }); return; }
  if (act === 'sign-out') { await auth.signOut(); location.reload(); return; }
  if (act === 'reload') { load(); return; }
  if (act === 'approve' || act === 'decline') {
    b.disabled = true;
    const r = data.requests.find((x) => x.user_id === user && x.app === app);
    await change('admin_decide_request', { p_user: user, p_app: app, p_approve: act === 'approve' },
      `${act === 'approve' ? 'Approved' : 'Declined'}: ${r?.email || 'request'} for ${APPS[app] || app}.`);
  }
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-act="app"], [data-act="member"]');
  if (!el) return;
  el.disabled = true;
  const m = data.members.find((x) => x.user_id === el.dataset.user);
  if (el.dataset.act === 'app') {
    await change('admin_set_app', { p_user: el.dataset.user, p_app: el.dataset.app, p_on: el.checked },
      `${APPS[el.dataset.app]} ${el.checked ? 'on' : 'off'} for ${m?.email}.`);
  } else {
    const field = el.dataset.field;
    const value = field === 'limit' ? Math.max(0, Math.min(1000, Math.round(Number(el.value) || 0))) : el.checked;
    const label = { active: value ? 'active' : 'paused', ai: `AI ${value ? 'on' : 'off'}`, gmail: `Gmail ${value ? 'on' : 'off'}`, limit: `AI limit ${value} a day` }[field];
    await change('admin_update_member', memberArgs(el.dataset.user, field, value), `${m?.email}: ${label}.`);
  }
});

start();
