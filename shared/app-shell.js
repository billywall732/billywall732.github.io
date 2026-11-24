// What every app page shares: the site's header and footer behavior (color mode, board cursor,
// footer strip) and the demo banner. The header and footer HTML are copied into the app pages
// that have them from home/index.html by tools/make-pages.mjs (Contrail has neither).
import { nextTheme, setUpPage, themeLabel } from '/js/ui.js?v=3';
import { config } from '/shared/config.js?v=2';
import { store } from '/shared/store.js?v=4';
import { loadAuth } from './auth-loader.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The note above the app: demo or not, and what to do about it.
//   signed out     demo; "Request access" signs you in first, approved members sign in here too
//   not approved   demo; "Request access" records the request (Billy approves it)
//   requested      demo; says the request is waiting
//   declined       demo; says the request wasn't approved (and how to ask again)
//   paused         demo; approved before, but access is paused for now (their data is kept)
//   member         your own data, and a way to sign out
// access comes from connectStore() in store.js.
//
// Opt-in compact mode (Contrail): opts = { compact: true, profileSlot, items }. A signed-in member
// then gets no banner, just their round photo in profileSlot, which opens a small menu (email,
// "Saved to your account", color mode, Off the Wall home, the app's own items, Sign out).
// items: [{ label, href }] or [{ label, onClick }]. Every other state still gets the full banner,
// since it asks the person to do something.
// Add { anySignedIn: true } (Wallet) and everyone signed in gets the round icon, approved or not:
// the banners keep their words but lose their "Sign out" button, which lives in the menu instead.
// { photo: false } keeps the plain initial instead of the Google photo.
export function demoBanner(slot, appName, access = { state: 'signed-out' }, opts = {}) {
  if (!slot) return;
  // Back from Google after tapping "Request access" while signed out: send the request now, so
  // it's one tap. Any other outcome (already a member, already asked) just drops the intent.
  const intent = takeRequestIntent(access.app);
  if (intent && access.state === 'not-approved') {
    access.state = 'requested';
    access.justRequested = true;
    sendRequest(access.app).catch((err) => {
      console.error(err);
      access.state = 'not-approved';
      access.justRequested = false;
      demoBanner(slot, appName, access, opts);
    });
  }
  if (opts.compact && opts.profileSlot && store.mode !== 'demo') {
    slot.hidden = true;
    slot.innerHTML = '';
    profileMenu(opts.profileSlot, access, opts.items ?? [], opts.photo !== false);
    return;
  }
  const iconMenu = opts.anySignedIn && opts.profileSlot && access.user;
  if (iconMenu) profileMenu(opts.profileSlot, access, opts.items ?? [], opts.photo !== false);
  const to = `${config.contactEmail.user}@${config.contactEmail.host}`;
  const mail = `mailto:${to}?subject=${encodeURIComponent(`Access to ${appName}`)}&amp;body=${encodeURIComponent(`Hi Billy,\n\nI just asked for access to ${appName}.\n\nThanks!`)}`;
  const who = access.user?.email ? esc(access.user.email) : '';
  const signOut = iconMenu ? '' : '<button type="button" class="demo-access demo-link" data-auth="out">Sign out</button>';
  let html;
  if (access.justRequested && store.mode === 'demo') {
    html = `<div class="demo-banner" role="note">
      <p><b>Requested.</b> You're signed in as ${who}. Once it's approved, your own data saves here; until then this is the demo. Want it sooner? <a href="${mail}">Email Billy</a>.</p>${signOut}</div>`;
  } else if (store.mode !== 'demo') {
    html = `<div class="demo-banner member-banner" role="note">
      <p>Signed in as <b>${who}</b>. Everything you change saves to your account.</p>${signOut}</div>`;
  } else if (access.state === 'not-approved') {
    html = `<div class="demo-banner" role="note">
      <p><b>You're signed in as ${who}, but not approved for ${esc(appName)} yet,</b> so this is the demo with sample data. Changes aren't saved.</p>
      <button type="button" class="demo-access" data-auth="request">Request access</button>${signOut}</div>`;
  } else if (access.state === 'requested') {
    html = `<div class="demo-banner" role="note">
      <p><b>You've asked for access to ${esc(appName)}.</b> Once it's approved, your own data saves here. Until then this is the demo, signed in as ${who}.</p>${signOut}</div>`;
  } else if (access.state === 'declined') {
    html = `<div class="demo-banner" role="note">
      <p><b>Your request for ${esc(appName)} wasn't approved,</b> so this is the demo with sample data, signed in as ${who}. Think that's a mistake? <a href="${mail}">Email Billy</a>.</p>${signOut}</div>`;
  } else if (access.state === 'paused') {
    html = `<div class="demo-banner" role="note">
      <p><b>Your access to ${esc(appName)} is paused for now.</b> Your saved data is kept; until it's back on, this is the demo, signed in as ${who}. <a href="${mail}">Email Billy</a> with any questions.</p>${signOut}</div>`;
  } else if (access.state === 'error') {
    html = `<div class="demo-banner" role="note">
      <p><b>Couldn't check your access just now,</b> so this is the demo with sample data. Reload the page to try again.</p></div>`;
  } else {
    html = `<div class="demo-banner" role="note">
      <p><b>You're looking at a demo with sample data.</b> Changes aren't saved. Approved? Sign in to use your own.</p>
      <button type="button" class="demo-access" data-auth="in">Sign in</button>
      <button type="button" class="demo-access demo-link" data-auth="in-request">Request access</button></div>`;
  }
  slot.innerHTML = html;
  slot.onclick = async (e) => {
    const b = e.target.closest('[data-auth]');
    if (!b) return;
    b.disabled = true;
    try {
      const auth = await loadAuth();
      if (b.dataset.auth === 'in' || b.dataset.auth === 'in-request') {
        if (b.dataset.auth === 'in-request') saveRequestIntent(access.app);
        const res = await auth.signIn();
        if (res?.error) throw res.error;
      } else if (b.dataset.auth === 'out') {
        await auth.signOut();
        location.reload();
      } else if (b.dataset.auth === 'request') {
        await sendRequest(access.app);
        slot.querySelector('p').innerHTML = `<b>Requested.</b> Once it's approved, your own data saves here. Want it sooner? <a href="${mail}">Email Billy</a>.`;
        b.remove();
      }
    } catch (err) {
      console.error(err);
      b.disabled = false;
      b.textContent = 'Try again';
    }
  };
}

// "Request access" while signed out: remember it across the Google round trip (this tab only,
// for 15 minutes, so a cancelled sign-in doesn't send a request on some later visit).
const INTENT_KEY = 'otw-request-access';
function saveRequestIntent(app) {
  try { sessionStorage.setItem(INTENT_KEY, JSON.stringify({ app, at: Date.now() })); } catch { /* storage blocked */ }
}
function takeRequestIntent(app) {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return false;
    const { app: want, at } = JSON.parse(raw);
    sessionStorage.removeItem(INTENT_KEY);
    return !!app && want === app && Date.now() - at < 15 * 60 * 1000;
  } catch { return false; }
}
// The access_requests row (23505 = already asked, which is fine)
async function sendRequest(app) {
  const auth = await loadAuth();
  const { error } = await auth.db.from('access_requests').insert({ app });
  if (error && error.code !== '23505') throw error;
}

// The signed-in member's photo (or first initial) and its menu. A plain disclosure: the button
// opens a list of links and buttons; a choice, a tap outside or Escape closes it.
let menuCount = 0;
function profileMenu(host, access, items, photo = true) {
  const p = window.otwAuth?.profile?.(access.user) ?? { name: access.user?.email || 'You', email: access.user?.email || '', picture: '' };
  const initial = (String(p.name || p.email || '?').trim()[0] || '?').toUpperCase();
  const id = `profile-menu-${++menuCount}`;
  const rows = [
    `<a class="pm-row" href="/home/">Off the Wall home</a>`,
    ...items.map((it, i) => (it.href ? `<a class="pm-row" href="${esc(it.href)}">${esc(it.label)}</a>` : `<button type="button" class="pm-row" data-item="${i}">${esc(it.label)}</button>`)),
  ];
  host.innerHTML = `<div class="profile">
    <button type="button" class="profile-btn" aria-expanded="false" aria-controls="${id}" title="${esc(p.email || p.name)}">
      <span class="profile-initial" aria-hidden="true">${esc(initial)}</span><span class="sr">Account menu for ${esc(p.email || p.name)}</span>
    </button>
    <div class="profile-menu" id="${id}" hidden>
      <p class="pm-who"><b>${esc(p.email || p.name)}</b><span>${store.mode === 'demo' ? 'Demo: changes aren’t saved' : 'Saved to your account'}</span></p>
      <button type="button" class="pm-row" data-theme-cycle>Color mode: <span class="pm-theme">${esc(themeLabel())}</span></button>
      ${rows.join('')}
      <button type="button" class="pm-row pm-out" data-auth="out">Sign out</button>
    </div></div>`;
  const btn = host.querySelector('.profile-btn'), menu = host.querySelector('.profile-menu');
  // The photo, once it loads (Google's photo addresses refuse some referrers, so send none); the
  // initial stays if it can't
  if (photo && p.picture) {
    const img = Object.assign(new Image(), { alt: '', referrerPolicy: 'no-referrer', decoding: 'async' });
    img.className = 'profile-photo';
    img.addEventListener('load', () => btn.prepend(img), { once: true });
    img.src = p.picture;
  }
  const open = () => !menu.hidden;
  const set = (on, focus = false) => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (!on && focus) btn.focus(); };
  btn.addEventListener('click', () => set(!open()));
  document.addEventListener('click', (e) => { if (open() && !host.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open()) set(false, true); });
  menu.addEventListener('click', async (e) => {
    const b = e.target.closest('.pm-row');
    if (!b) return;
    if (b.dataset.themeCycle !== undefined) { menu.querySelector('.pm-theme').textContent = nextTheme(); return; }
    if (b.dataset.auth === 'out') {
      b.disabled = true;
      try { await (await loadAuth()).signOut(); location.reload(); } catch (err) { console.error(err); b.disabled = false; b.textContent = 'Try again'; }
      return;
    }
    if (b.dataset.item !== undefined) { set(false); items[+b.dataset.item].onClick?.(); return; }
    set(false); // a link: it navigates
  });
}

export function setUpApp() {
  setUpPage();
}

// A file the visitor saves (exports, backups)
export function saveFile(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
