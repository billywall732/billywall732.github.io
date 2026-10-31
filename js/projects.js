// Every project on the site, in the order shown. The first one gets the big card.
//
// To add a project, copy one entry and change it:
//   name        the title on the card
//   kicker      a short label above the title ("Web App", "Game", ...)
//   blurb       one or two sentences: what it is and why it exists
//   highlights  up to 3 short points
//   tags        what it's built with
//   status      'live' or 'workshop' (still being built)
//   url         where the app lives ('/my-repo/' for another GitHub Pages repo), or null
//   code        its GitHub repo, or null
//   image       a screenshot in img/ (1280 x 800 works best), or null for a placeholder
//   accent      the card's color
//   live        optional: 'snow-surf' shows today's best bets from that app's data
export const projects = [
  {
    name: 'Snow and Surf Report',
    kicker: 'Web App',
    blurb: 'Morning conditions for 76 mountains and 52 beaches, rated for how I actually ride. Built so I stop opening six tabs before a dawn patrol.',
    highlights: [
      'Refreshes every hour from free NOAA, SNOTEL and Open-Meteo data',
      'Picks and “fits you” ratings from your level, board and pass',
      'Morning alerts by email or phone notification',
    ],
    tags: ['JavaScript', 'GitHub Actions', 'Firebase', 'NOAA APIs'],
    status: 'live',
    url: '/snow-surf-report/',
    code: 'https://github.com/billywall732/snow-surf-report',
    image: 'img/snow-surf.webp',
    accent: '#0f8a7e',
    live: 'snow-surf',
  },
  {
    name: 'Fantasy Feetpics',
    kicker: 'League Site',
    blurb: 'The home of my ESPN fantasy football league: standings, live scores, awards, and a strict accounting of who owes a Smirnoff Ice.',
    highlights: [
      'Refreshes twice a day, and hourly on Sundays',
      'Emails whoever owes an ice the moment it locks in',
      'Stats baked into the page, so it opens instantly',
    ],
    tags: ['Node', 'ESPN API', 'GitHub Actions'],
    status: 'live',
    url: '/fantasy-feetpics/',
    code: 'https://github.com/billywall732/fantasy-feetpics',
    image: 'img/fantasy-feetpics.webp',
    accent: '#3fbf5f',
  },
  {
    name: 'Budget Ledger',
    kicker: 'Money Tool',
    blurb: 'Personal spending and wedding costs, tracked side by side. Your data lives in your own Google Drive, not on anyone’s server.',
    highlights: [
      'Dashboards for budget vs. spending and cash flow',
      'Excel bulk import with a preview before anything saves',
      'Paycheck and net-pay breakdowns',
    ],
    tags: ['HTML', 'Google Drive API', 'Charts'],
    status: 'live',
    url: '/my-budget-ledger/',
    code: 'https://github.com/billywall732/my-budget-ledger',
    image: 'img/budget-ledger.webp',
    accent: '#2f6b57',
  },
  {
    name: 'Portfolio Ledger',
    kicker: 'Investing Tool',
    blurb: 'Schwab and Robinhood accounts in one view, with live prices and allocation targets. For tracking and learning, not advice.',
    highlights: [
      'Imports broker exports, reconciled against their totals',
      'Live prices through my own Cloudflare Worker',
      'Synced to your Google Drive, offline copy in the browser',
    ],
    tags: ['Cloudflare Workers', 'Finnhub', 'IndexedDB'],
    status: 'workshop',
    url: null,
    code: null,
    image: null,
    accent: '#4a6cf7',
  },
];

// The "Off the clock" strip
export const hobbies = [
  ['🏂', 'Snowboarding'],
  ['🚵', 'Mountain biking'],
  ['🏄', 'Surfing'],
  ['⛳', 'Golf'],
  ['🧗', 'Rock climbing'],
  ['🦞', 'Lobstering'],
  ['🤿', 'Spearfishing'],
];
