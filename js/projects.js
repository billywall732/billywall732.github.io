// Everything the site shows: the project cards on the home page, each project's
// page at /projects/<slug>/, the "In the workshop" list, "Proudly mediocre at"
// and the "Currently tinkering with" line in the footer strip.
//
// To add a project, copy one entry and change it, then run
//   node tools/make-pages.mjs
// to create its page at /projects/<slug>/.
//
//   slug        its address: /projects/<slug>/
//   name        the title
//   kicker      a short label ("Web App", "Game", ...)
//   icon        an emoji for its little tile
//   accent      its color (icon tile, badge, bullets, glow and Open App button)
//   tagline     one line, used in lists and as the page description
//   blurb       what it is: one or two sentences for a visitor
//   highlights  up to 3 short points: what they can do with it
//   why         why I built it
//   how         how it works, as a few short steps
//   status      'live' or 'workshop' (still being built)
//   statusNote  where it stands right now
//   next        what's next
//   tags        what it's built with
//   url         where it lives ('/my-repo/' for another GitHub Pages repo), or null
//   code        its GitHub repo, or null
//   image       a screenshot of its cover page in img/ (1280 x 800), or null
//   art         when there's no image: 'chart', 'trivia', 'snowboard' or 'wedding'
//
// Live projects show first, as big cards, in the order below; the first one is
// the widest. Workshop projects go in the compact list.
export const projects = [
  {
    slug: 'snow-and-surf-report',
    name: 'Snow and Surf Report',
    kicker: 'Web App',
    icon: '🌊',
    accent: '#14a39a',
    tagline: 'Hourly snow and surf ratings for 76 mountains and 52 beaches.',
    blurb: 'Find the best snow and surf every morning. Ratings for 76 mountains and 52 beaches, matched to your level, your board and your ski pass.',
    highlights: [
      'Today’s best bets for snow and surf at a glance',
      'Pin favorite spots to see snow, swell, tide and what to wear',
      'Morning alerts by email or phone when conditions line up',
    ],
    why: 'I was checking four different forecast sites every morning to decide whether to go to the mountains or the beach. I wanted one page with a simple 1–5 “should I go?” rating for every spot I care about.',
    how: [
      'Every hour, a GitHub Action pulls free public forecasts: Open-Meteo for snow and swell, NOAA for tides and buoys.',
      'It scores every mountain and beach from 1 to 5 and writes the results to a single report file.',
      'The site reads that file and draws the cards, charts and maps. There’s no server and no API key.',
      'Your profile (level, board, pass, home base) tunes the picks, and morning alerts go out when conditions line up.',
    ],
    status: 'live',
    statusNote: 'Live and updating every hour.',
    next: [
      'A mountain bike trail conditions tab, based on recent rain',
      'A one-sentence morning verdict written by AI',
    ],
    tags: ['JavaScript', 'GitHub Actions', 'Firebase', 'NOAA data'],
    url: '/snow-surf-report/',
    code: 'https://github.com/billywall732/snow-surf-report',
    image: '/img/snow-surf.webp',
  },
  {
    slug: 'fantasy-feetpics',
    name: 'Fantasy Feetpics',
    kicker: 'League Site',
    icon: '🏈',
    accent: '#5cc95f',
    tagline: 'Standings, live scores, awards and who owes an ice, for one fantasy league.',
    blurb: 'Everything about the Fantasy Feetpics league in one place: standings, live scores, awards, and who owes a Smirnoff Ice.',
    highlights: [
      'Live scores, updated every hour on Sundays',
      'An email the moment you owe an ice',
      'Standings and season awards at a glance',
    ],
    why: 'ESPN’s app answers “who won?” but not the questions our league actually argues about: who had the worst week, who’s on a heater, and who owes an ice. So I built the league its own site.',
    how: [
      'A script pulls the league’s scores and rosters from ESPN.',
      'A build step turns that data into a single fast page and publishes it to GitHub Pages.',
      'Scheduled refreshes run twice a day, and every hour on Sundays during games.',
      'When a manager locks in an ice, they get an email with the reason and the deadline.',
    ],
    status: 'live',
    statusNote: 'Live for the 2026 season.',
    next: [
      'More season awards and head-to-head history',
      'A recap of each week’s best and worst moments',
    ],
    tags: ['Node', 'ESPN API', 'GitHub Actions'],
    url: '/fantasy-feetpics/',
    code: 'https://github.com/billywall732/fantasy-feetpics',
    image: '/img/fantasy-feetpics.webp',
  },
  {
    slug: 'budget-ledger',
    name: 'Budget Ledger',
    kicker: 'Money Tool',
    icon: '💸',
    accent: '#e8b130',
    tagline: 'Everyday and wedding budgets side by side, saved to your own Google Drive.',
    blurb: 'Track everyday spending and a wedding budget side by side. Everything saves to your own Google Drive, so your numbers stay yours.',
    highlights: [
      'Budget vs. spending and cash flow at a glance',
      'Bring in months of expenses from Excel in one go',
      'Plan paychecks and see your take-home pay',
    ],
    why: 'Budgeting apps want your bank login and a monthly fee, and none of them handle planning a wedding next to normal life. I wanted something free, private, and shaped exactly the way I track money.',
    how: [
      'It’s one HTML file with no server and no database.',
      'Sign in with Google and it saves a single file to your own Drive. It can’t see anything else there.',
      'Without signing in, it still works offline in your browser.',
      'Import months of expenses from an Excel template, with a preview and duplicate check before anything is added.',
    ],
    status: 'live',
    statusNote: 'Live and in daily use.',
    next: [
      'Yearly summaries and year-over-year comparisons',
      'Smarter categories for imported expenses',
    ],
    tags: ['HTML', 'Google Drive', 'Charts'],
    url: '/my-budget-ledger/',
    code: 'https://github.com/billywall732/my-budget-ledger',
    image: '/img/budget-ledger.webp',
  },
  {
    slug: 'portfolio-ledger',
    name: 'Portfolio Ledger',
    kicker: 'Investing Tool',
    icon: '📈',
    accent: '#6e7ff3',
    tagline: 'Schwab and Robinhood accounts in one place, with live prices.',
    blurb: 'See your Schwab and Robinhood accounts in one place, with live prices and how your mix compares to your targets.',
    highlights: [
      'Import your broker statements in a couple of clicks',
      'Live prices, daily change and total gain or loss',
      'Saves privately to your own Google Drive',
    ],
    why: 'My investments are split across two brokers, and neither one shows the whole picture or how my mix compares to the targets I set. This puts it all on one page.',
    how: [
      'Import Schwab and Robinhood exports. Each import shows a preview, checked against the broker’s own totals, before anything is saved.',
      'Live prices come through a small Cloudflare Worker, which keeps API keys out of the page.',
      'Holdings save to your own Google Drive, the same way Budget Ledger does.',
    ],
    status: 'workshop',
    statusNote: 'Imports and live prices work; getting it ready to publish.',
    next: [
      'Publish it',
      'Charts of portfolio value over time',
      'A short weekly summary of what changed',
    ],
    tags: ['Cloudflare Workers', 'Live prices', 'Google Drive'],
    url: null,
    code: null,
    image: null,
    art: 'chart',
  },
  {
    slug: 'quizzical',
    name: 'Quizzical',
    kicker: 'Daily Game',
    icon: '❓',
    accent: '#b46cf2',
    tagline: 'A daily round of trivia, the same questions for everyone.',
    blurb: 'A fresh round of trivia every day, the same questions for everyone. Keep your streak alive and see how you stack up against friends.',
    highlights: [
      'New questions every day at midnight',
      'Streaks and stats that track your best runs',
      'Share your score without spoiling the answers',
    ],
    why: 'I like daily games that take two minutes and give the group chat something to argue about. Trivia felt like the right one to build.',
    how: [
      'Everyone gets the same round each day, picked from a shared question bank.',
      'Your streak and stats are saved in your browser.',
      'A share button copies your score without giving away the answers.',
    ],
    status: 'workshop',
    statusNote: 'Sketching the question format.',
    next: [
      'Build the question bank',
      'A first playable version',
    ],
    tags: ['JavaScript', 'Daily puzzles'],
    url: null,
    code: null,
    image: null,
    art: 'trivia',
  },
  {
    slug: 'shred-lab',
    name: 'Shred Lab',
    kicker: 'Video Game',
    icon: '🏂',
    accent: '#38b6ff',
    tagline: 'A snowboarding game where your setup changes how you ride.',
    blurb: 'A snowboarding game where your setup matters. Build your board, bindings and stance, then feel the difference on every run.',
    highlights: [
      'Build and tune your own board setups',
      'Every setup rides differently: carve, float or pop',
      'Unlock new gear as you ride',
    ],
    why: 'In most snowboarding games, gear is just a skin. I wanted one where board flex, bindings and stance change how the run feels, the way they do on the mountain.',
    how: [
      'Each piece of gear has a few stats, like flex, edge hold and pop.',
      'Those stats change how the board turns, floats and jumps.',
      'Runs earn new gear to try.',
    ],
    status: 'workshop',
    statusNote: 'Prototyping how the board handles.',
    next: [
      'A first playable run',
      'The gear builder',
    ],
    tags: ['JavaScript', 'Game'],
    url: null,
    code: null,
    image: null,
    art: 'snowboard',
  },
  {
    slug: 'happily-ever-wall',
    name: 'Happily Ever Wall',
    kicker: 'Wedding Site',
    icon: '💍',
    accent: '#ef6f8c',
    tagline: 'Schedule, travel, registry and RSVPs for our wedding guests.',
    blurb: 'Everything guests need for the big day: the schedule, travel and places to stay, the registry, and RSVPs, all in one place.',
    highlights: [
      'RSVP online in about a minute',
      'Schedule, maps and travel tips',
      'A countdown to the big day',
    ],
    why: 'Wedding website builders are fine, but this one is ours and fits right in with everything else here.',
    how: [
      'A simple site with the schedule, travel tips, places to stay and the registry.',
      'Guests RSVP with a short form.',
      'A countdown keeps everyone excited.',
    ],
    status: 'workshop',
    statusNote: 'Planning the pages.',
    next: [
      'The RSVP form',
      'Travel and places to stay',
    ],
    tags: ['HTML', 'CSS', 'RSVPs'],
    url: null,
    code: null,
    image: null,
    art: 'wedding',
  },
];

// "Off the clock". rating is how good I am, out of 5.
export const hobbies = [
  { icon: '🏂', name: 'Snowboarding', rating: 3 },
  { icon: '🚵', name: 'Mountain biking', rating: 3 },
  { icon: '🏄', name: 'Surfing', rating: 2 },
  { icon: '⛳', name: 'Golf', rating: 2 },
  { icon: '🧗', name: 'Rock climbing', rating: 3 },
  { icon: '🦞', name: 'Lobstering', rating: 3 },
  { icon: '🤿', name: 'Spearfishing', rating: 2 },
  { icon: '🥍', name: 'Lacrosse', rating: 3 },
];

// The footer strip
export const contact = {
  email: '', // your public email address; the "Email me" button shows up once it's set
  github: 'https://github.com/billywall732',
  issues: 'https://github.com/billywall732/billywall732.github.io/issues/new',
};
