// One sign-in for every app on offthewall.dev (Supabase Auth with Google).
//
// Load after the Supabase library:
//   <script src="/shared/vendor/supabase-2.118.0.js"></script>
//   <script src="/shared/auth.js"></script>
//
// Then use window.otwAuth:
//   otwAuth.ready             a promise for the signed-in user, or null (finishes the Google
//                             round trip first if the page was just opened by it)
//   otwAuth.signIn(opts)      off to Google, back to this page. opts.chooseAccount shows the picker
//   otwAuth.signOut()
//   otwAuth.onChange(fn)      fn(user or null) whenever someone signs in or out (in any tab)
//   otwAuth.profile(user)     { name, firstName, email, picture } for showing who's signed in
//   otwAuth.db                the Supabase client, for reading and writing the signed-in user's rows
//
// Sessions live in this browser's localStorage (not cookies) and are shared by every app on the
// site, so signing in once covers all of them. The publishable key below is meant to be public:
// what each person can read or change is enforced by row-level security in the database.
(function () {
  'use strict';
  var SUPABASE_URL = 'https://yxdmuznxcqcauyehhfmp.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_wq-M9vvKebeudJjhiuZicA_-SSeSAgu';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('auth.js: load /shared/vendor/supabase-2.118.0.js first');
    return;
  }

  var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  var listeners = [];
  var current = null;

  // getSession() waits for the code from Google to be exchanged when the page was opened by the
  // sign-in redirect, so `ready` always reflects the final state.
  var ready = db.auth.getSession().then(function (res) {
    current = (res && res.data && res.data.session && res.data.session.user) || null;
    cleanUrl();
    return current;
  }, function (err) {
    console.error('Sign-in check failed', err);
    cleanUrl();
    return null;
  });

  db.auth.onAuthStateChange(function (event, session) {
    var user = (session && session.user) || null;
    var changed = (user && user.id) !== (current && current.id);
    current = user;
    if (changed || event === 'SIGNED_OUT') listeners.forEach(function (fn) { try { fn(user); } catch (e) { console.error(e); } });
  });

  // Drop ?code= / #error= left by the Google round trip so a reload or a shared link doesn't carry them.
  function cleanUrl() {
    try {
      var u = new URL(window.location.href);
      var dirty = false;
      ['code', 'error', 'error_code', 'error_description'].forEach(function (k) { if (u.searchParams.has(k)) { u.searchParams.delete(k); dirty = true; } });
      if (/(^#|&)(error|access_token)=/.test(u.hash)) { u.hash = ''; dirty = true; }
      if (dirty) window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* old browser: leave it */ }
  }

  function signIn(opts) {
    opts = opts || {};
    var back = window.location.origin + window.location.pathname;
    return db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: back, queryParams: opts.chooseAccount ? { prompt: 'select_account' } : {} },
    });
  }

  function signOut() {
    return db.auth.signOut();
  }

  function profile(user) {
    if (!user) return null;
    var m = user.user_metadata || {};
    var name = m.full_name || m.name || (user.email ? user.email.split('@')[0] : 'You');
    return { name: name, firstName: String(name).split(' ')[0], email: user.email || '', picture: m.avatar_url || m.picture || '' };
  }

  window.otwAuth = {
    ready: ready,
    signIn: signIn,
    signOut: signOut,
    onChange: function (fn) { listeners.push(fn); },
    profile: profile,
    user: function () { return current; },
    db: db,
  };
})();
