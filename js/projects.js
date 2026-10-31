// Every project on the site, in the order shown. The first one gets the big card.
//
// To add a project, copy one entry and change it:
//   name        the title on the card
//   kicker      a short label above the title ("Web App", "Game", ...)
//   blurb       one or two sentences for a visitor: what it does for them
//   highlights  up to 3 short points: what they can do with it
//   tags        what it's built with
//   status      'live' or 'workshop' (still being built)
//   url         where it lives ('/my-repo/' for another GitHub Pages repo), or null
//   code        its GitHub repo, or null
//   image       a screenshot of its cover page in img/ (1280 x 800), or null
//   art         when there's no image: 'chart', 'trivia', 'snowboard' or 'wedding'
//   accent      the card's color
export const projects = [
  {
    name: 'Snow and Surf Report',
    kicker: 'Web App',
    blurb: 'Find the best snow and surf every morning. Ratings for 76 mountains and 52 beaches, matched to your level, your board and your ski pass.',
    highlights: [
      'Today’s best bets for snow and surf at a glance',
      'Pin favorite spots to see snow, swell, tide and what to wear',
      'Morning alerts by email or phone when conditions line up',
    ],
    tags: ['JavaScript', 'GitHub Actions', 'Firebase', 'NOAA data'],
    status: 'live',
    url: '/snow-surf-report/',
    code: 'https://github.com/billywall732/snow-surf-report',
    image: 'img/snow-surf.webp',
    accent: '#0f8a7e',
  },
  {
    name: 'Fantasy Feetpics',
    kicker: 'League Site',
    blurb: 'Everything about the Fantasy Feetpics league in one place: standings, live scores, awards, and who owes a Smirnoff Ice.',
    highlights: [
      'Live scores, updated every hour on Sundays',
      'An email the moment you owe an ice',
      'Standings and season awards at a glance',
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
    blurb: 'Track everyday spending and a wedding budget side by side. Everything saves to your own Google Drive, so your numbers stay yours.',
    highlights: [
      'Budget vs. spending and cash flow at a glance',
      'Bring in months of expenses from Excel in one go',
      'Plan paychecks and see your take-home pay',
    ],
    tags: ['HTML', 'Google Drive', 'Charts'],
    status: 'live',
    url: '/my-budget-ledger/',
    code: 'https://github.com/billywall732/my-budget-ledger',
    image: 'img/budget-ledger.webp',
    accent: '#2f6b57',
  },
  {
    name: 'Portfolio Ledger',
    kicker: 'Investing Tool',
    blurb: 'See your Schwab and Robinhood accounts in one place, with live prices and how your mix compares to your targets.',
    highlights: [
      'Import your broker statements in a couple of clicks',
      'Live prices, daily change and total gain or loss',
      'Saves privately to your own Google Drive',
    ],
    tags: ['Cloudflare Workers', 'Live prices', 'Google Drive'],
    status: 'workshop',
    url: null,
    code: null,
    image: null,
    art: 'chart',
    accent: '#4a6cf7',
  },
  {
    name: 'Quizzical',
    kicker: 'Daily Game',
    blurb: 'A fresh round of trivia every day, the same questions for everyone. Keep your streak alive and see how you stack up against friends.',
    highlights: [
      'New questions every day at midnight',
      'Streaks and stats that track your best runs',
      'Share your score without spoiling the answers',
    ],
    tags: ['JavaScript', 'Daily puzzles'],
    status: 'workshop',
    url: null,
    code: null,
    image: null,
    art: 'trivia',
    accent: '#c04df9',
  },
  {
    name: 'Shred Lab',
    kicker: 'Video Game',
    blurb: 'A snowboarding game where your setup matters. Build your board, bindings and stance, then feel the difference on every run.',
    highlights: [
      'Build and tune your own board setups',
      'Every setup rides differently: carve, float or pop',
      'Unlock new gear as you ride',
    ],
    tags: ['JavaScript', 'Game'],
    status: 'workshop',
    url: null,
    code: null,
    image: null,
    art: 'snowboard',
    accent: '#ff8a1f',
  },
  {
    name: 'Happily Ever Wall',
    kicker: 'Wedding Site',
    blurb: 'Everything guests need for the big day: the schedule, travel and places to stay, the registry, and RSVPs, all in one place.',
    highlights: [
      'RSVP online in about a minute',
      'Schedule, maps and travel tips',
      'A countdown to the big day',
    ],
    tags: ['HTML', 'CSS', 'RSVPs'],
    status: 'workshop',
    url: null,
    code: null,
    image: null,
    art: 'wedding',
    accent: '#e0567a',
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
