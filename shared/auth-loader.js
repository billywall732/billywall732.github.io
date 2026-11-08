// Loads the shared sign-in (/shared/auth.js and the Supabase library) only when a page needs it:
// someone signed in before, just came back from Google, or tapped Sign in. Everyone else never
// downloads it.
const SCRIPTS = ['/shared/vendor/supabase-2.118.0.js', '/shared/auth.js'];
const SESSION_KEY = 'sb-yxdmuznxcqcauyehhfmp-auth-token';
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.append(s);
  });
}

// Was someone signed in on this browser before (or is the page finishing a sign-in)?
export function mightBeSignedIn() {
  try { if (localStorage.getItem(SESSION_KEY)) return true; } catch { /* storage blocked */ }
  return /[?&]code=/.test(location.search);
}

// window.otwAuth (see /shared/auth.js)
export function loadAuth() {
  loading ??= (async () => {
    if (!window.otwAuth) {
      if (!window.supabase) await loadScript(SCRIPTS[0]);
      await loadScript(SCRIPTS[1]);
    }
    if (!window.otwAuth) throw new Error('Sign-in is unavailable');
    return window.otwAuth;
  })().catch((err) => { loading = null; throw err; });
  return loading;
}
