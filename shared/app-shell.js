// What every app page shares: the site's header and footer behavior (color mode, board cursor,
// footer strip) and the demo banner. The header and footer HTML are copied into each app page
// from home/index.html by tools/make-pages.mjs.
import { setUpPage } from '/js/ui.js?v=2';
import { config } from './config.js';
import { store } from './store.js';
import { loadAuth } from './auth-loader.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The note above the app: demo or not, and what to do about it.
//   signed out     demo; "Request access" signs you in first, approved members sign in here too
//   not approved   demo; "Request access" records the request (Billy approves it)
//   requested      demo; says the request is waiting
//   member         your own data, and a way to sign out
// access comes from connectStore() in store.js.
export function demoBanner(slot, appName, access = { state: 'signed-out' }) {
  if (!slot) return;
  const to = `${config.contactEmail.user}@${config.contactEmail.host}`;
  const mail = `mailto:${to}?subject=${encodeURIComponent(`Access to ${appName}`)}&amp;body=${encodeURIComponent(`Hi Billy,\n\nI just asked for access to ${appName}.\n\nThanks!`)}`;
  const who = access.user?.email ? esc(access.user.email) : '';
  const signOut = '<button type="button" class="demo-access demo-link" data-auth="out">Sign out</button>';
  let html;
  if (store.mode !== 'demo') {
    html = `<div class="demo-banner member-banner" role="note">
      <p>Signed in as <b>${who}</b>. Everything you change saves to your account.</p>${signOut}</div>`;
  } else if (access.state === 'not-approved') {
    html = `<div class="demo-banner" role="note">
      <p><b>You're signed in as ${who}, but not approved for ${esc(appName)} yet,</b> so this is the demo with sample data. Changes aren't saved.</p>
      <button type="button" class="demo-access" data-auth="request">Request access</button>${signOut}</div>`;
  } else if (access.state === 'requested') {
    html = `<div class="demo-banner" role="note">
      <p><b>You've asked for access to ${esc(appName)}.</b> Once it's approved, your own data saves here. Until then this is the demo, signed in as ${who}.</p>${signOut}</div>`;
  } else if (access.state === 'error') {
    html = `<div class="demo-banner" role="note">
      <p><b>Couldn't check your access just now,</b> so this is the demo with sample data. Reload the page to try again.</p></div>`;
  } else {
    html = `<div class="demo-banner" role="note">
      <p><b>You're looking at a demo with sample data.</b> Changes aren't saved. Approved? Sign in to use your own.</p>
      <button type="button" class="demo-access" data-auth="in">Sign in</button>
      <button type="button" class="demo-access demo-link" data-auth="in">Request access</button></div>`;
  }
  slot.innerHTML = html;
  slot.onclick = async (e) => {
    const b = e.target.closest('[data-auth]');
    if (!b) return;
    b.disabled = true;
    try {
      const auth = await loadAuth();
      if (b.dataset.auth === 'in') {
        const res = await auth.signIn();
        if (res?.error) throw res.error;
      } else if (b.dataset.auth === 'out') {
        await auth.signOut();
        location.reload();
      } else if (b.dataset.auth === 'request') {
        const { error } = await auth.db.from('access_requests').insert({ app: access.app });
        if (error && error.code !== '23505') throw error;
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
