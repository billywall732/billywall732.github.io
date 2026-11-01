// Every environment value the apps (Contrail, What's in My Wallet?) need, in one place.
// Nothing here is secret: Firebase web config is meant to be public. API keys, service
// accounts and OAuth client secrets never go in this repo.
// Empty values mean "not set up yet": the apps run in demo mode until Phase 2 fills them in.
export const config = {
  // Firebase web app config (Phase 2): apiKey, authDomain, projectId, appId
  firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
  // Cloudflare Worker that talks to Claude (Phase 3)
  workerUrl: '',
  // Google OAuth client ID for Gmail import (Phase 3)
  googleClientId: '',
  // Billy's sign-in email; gets the Admin page (Phase 2)
  adminEmail: '',
  // The stats Worker (worker-stats/) that the hidden /stats/ page reads; empty = not set up yet
  statsUrl: 'https://otw-stats.offthewall-dev.workers.dev',
  // Where "Request access" goes until the real request flow exists
  contactEmail: 'WallWorks732@gmail.com',
};
