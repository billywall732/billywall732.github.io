// What every app page shares: the site's header and footer behavior (color mode, board cursor,
// footer strip) and the demo banner. The header and footer HTML are copied into each app page
// from home/index.html by tools/make-pages.mjs.
import { setUpPage } from '/js/ui.js';
import { config } from './config.js';
import { store } from './store.js';

// "You're looking at a demo…" with a Request access link (Phase 1: an email to Billy)
export function demoBanner(slot, appName) {
  if (!slot || store.mode !== 'demo') return;
  const subject = encodeURIComponent(`Access to ${appName}`);
  // Never ask for anyone's Google account address by email
  const body = encodeURIComponent(`Hi Billy,\n\nI'd like access to ${appName}.\n\nThanks!`);
  const to = `${config.contactEmail.user}@${config.contactEmail.host}`;
  slot.innerHTML = `<div class="demo-banner" role="note">
    <p><b>You're looking at a demo with sample data.</b> Changes aren't saved.</p>
    <a class="demo-access" href="mailto:${to}?subject=${subject}&amp;body=${body}">Request access</a>
  </div>`;
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
