// Keeps /stats/ private: the page stays hidden until the site owner is signed in with Google (the
// same Supabase sign-in as the apps). Signed out → a sign-in button only; signed in as anyone
// else → "This page is private." The counts script (stats.js) isn't even loaded until then.
// Note: this keeps visitors off the page, but the stats Worker itself doesn't check sign-in yet.
import { loadAuth, mightBeSignedIn } from '/shared/auth-loader.js';

const OWNER = 'billywall732@gmail.com';
const gate = document.getElementById('st-gate');
const main = document.querySelector('main.stats-page');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (html) => { gate.innerHTML = `<section class="st-gate-card">${html}</section>`; };

let auth = null, me = null;
try {
  if (mightBeSignedIn()) {
    auth = await loadAuth();
    me = await auth.ready;
  }
} catch (err) {
  console.error(err);
}

if (me && String(me.email).toLowerCase() === OWNER) {
  gate.remove();
  main.hidden = false;
  await import(`/stats/stats.js?t=${Date.now()}`);
} else if (me) {
  show(`<h1>This page is private.</h1>
    <p class="stats-note">Signed in as <b>${esc(me.email)}</b>. <button type="button" class="st-link" data-gate="sign-out">Sign out</button></p>
    <p><a href="/home/">← Back to Off the Wall</a></p>`);
} else {
  show(`<h1>Sign in</h1>
    <p class="stats-note">This page is private. Sign in with Google to continue.</p>
    <button type="button" class="button primary" data-gate="sign-in">Sign in with Google</button>`);
}

gate?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-gate]');
  if (!b) return;
  b.disabled = true;
  if (b.dataset.gate === 'sign-in') (auth || await loadAuth()).signIn({ chooseAccount: true });
  else { await auth.signOut(); location.reload(); }
});
