// Every environment value the apps (Contrail, What's in My Wallet?) need, in one place.
// Nothing here is secret. API keys, service accounts and OAuth client secrets never go in this
// repo. Sign-in and saved data use the shared Supabase project (see /shared/auth.js).
// Empty values mean "not set up yet".
export const config = {
  // The AI Worker (worker-ai/): reads booking emails for Contrail's Gmail import
  workerUrl: 'https://otw-ai.offthewall-dev.workers.dev',
  // Google OAuth client ID (a Web application client, public by design) for Gmail import.
  // Empty = Gmail import shows "not set up yet" even for members with the Gmail switch on.
  googleClientId: '1024899082340-jf8khevb83oi5ca3c5oqn7auvfvilbpr.apps.googleusercontent.com',
  // The stats Worker (worker-stats/) that the hidden /stats/ page reads; empty = not set up yet
  statsUrl: 'https://otw-stats.offthewall-dev.workers.dev',
  // Where "Request access" goes until the real request flow exists
  // The contact address in two parts, joined only when a link is tapped, so it isn't sitting
  // in the page's code for address-harvesting bots to pick up
  contactEmail: { user: 'WallWorks732', host: 'gmail.com' },
};
