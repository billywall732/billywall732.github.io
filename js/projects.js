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
//   status      which tab it's on: 'live' (Polished Projects), 'rough' (Rough Around
//               the Edges: works, but not finished) or 'workshop' (still being built)
//   statusNote  where it stands right now
//   next        what's next
//   tags        what it's built with
//   url         where it lives ('/my-repo/' for another GitHub Pages repo), or null
//   code        its GitHub repo, or null
//   follow      false hides the "Follow along" link (shown when there's no repo yet)
//   image       a screenshot of its cover page in img/ (1280 x 800), or null
//   art         when there's no image: 'chart', 'trivia', 'snowboard', 'wedding', 'dive' or 'steps'
//
// Polished and rough projects show as big cards, in the order below; the first
// polished one is the widest. Workshop projects go in the compact list.
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
    url: '/snow-surf-report/?cover',
    code: 'https://github.com/billywall732/snow-surf-report',
    image: '/img/snow-surf.webp',
  },
  {
    slug: 'fantasy-football',
    name: 'Fantasy Football',
    kicker: 'League Site',
    icon: '🏈',
    accent: '#5cc95f',
    tagline: 'Standings, live scores, awards and who owes an ice, for one fantasy league.',
    blurb: 'Everything about our fantasy league in one place: standings, live scores, awards, and who owes a Smirnoff Ice.',
    highlights: [
      'Live scores, updated every hour on Sundays',
      'Ices worked out automatically from every box score',
      'Standings and season awards at a glance',
    ],
    why: 'ESPN’s app answers “who won?” but not the questions our league actually argues about: who had the worst week, who’s on a heater, and who owes an ice. So I built the league its own site.',
    how: [
      'A script pulls the league’s scores and rosters from ESPN.',
      'A build step turns that data into a single fast page and publishes it to GitHub Pages.',
      'Scheduled refreshes run twice a day, and every hour on Sundays during games.',
      'Ices are worked out from the box scores the moment they lock in.',
    ],
    status: 'live',
    statusNote: 'Live for the 2026 season.',
    next: [
      'More season awards and head-to-head history',
      'A recap of each week’s best and worst moments',
    ],
    tags: ['Node', 'ESPN API', 'GitHub Actions'],
    url: '/fantasy-football/',
    code: null,
    image: '/img/fantasy-football.webp',
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
    url: '/my-budget-ledger/cover.html',
    code: 'https://github.com/billywall732/my-budget-ledger',
    image: '/img/budget-ledger.webp',
  },
  {
    slug: 'contrail',
    name: 'Contrail',
    kicker: 'Travel Log',
    icon: '✈️',
    accent: '#9775fa',
    tagline: 'Every flight and hotel on one map, with the lounges my cards get me into.',
    blurb: 'A flight and hotel log: trips as flight strips, routes on a world map, a countdown to the next departure, and which lounges your cards open at every airport.',
    highlights: [
      'Routes on a world map, colored by how soon you fly',
      'Lounge access at each airport, based on the cards you carry',
      'A travel analytics page: miles, airlines, airports, countries',
    ],
    why: 'My trips lived in a hundred confirmation emails, and I could never remember which lounges my cards actually get me into. I wanted one page that answers “where have I been, where am I going, and where can I sit before the flight?”',
    how: [
      'Plain JavaScript and D3 draw the maps and charts. There’s no framework and no build step.',
      'Airports come from OurAirports’ public data, with time zones, so flight times and distances are worked out in the page.',
      'Lounge details are a hand-checked list. Each airport shows when it was last checked.',
      'The demo runs on made-up trips for “Alex & Jordan” that move with the calendar, so there’s always a trip coming up.',
      'Approved users will get their own saved log and an import that reads booking confirmations from their Gmail, using Claude for emails without structured data.',
    ],
    status: 'live',
    statusNote: 'Live as a demo with sample data; sign-in for approved users is next.',
    next: [
      'Sign-in so approved users keep their own trips',
      'Gmail import of flight and hotel confirmations',
    ],
    tags: ['JavaScript', 'D3', 'OurAirports'],
    url: '/contrail/cover/',
    code: 'https://github.com/billywall732/billywall732.github.io/tree/main/contrail',
    image: '/img/contrail.webp',
  },
  {
    slug: 'wallet',
    name: 'What’s in My Wallet?',
    kicker: 'Card Tracker',
    icon: '💳',
    accent: '#d9ab52',
    tagline: 'Every card I carry, which one to use, and when to keep, call or downgrade.',
    blurb: 'A credit card tracker: the best card for each kind of spending, credits used and left, sign-up bonus progress, 5/24, and a dated plan for every annual fee.',
    highlights: [
      'The best card for each category, by points value',
      'A renewal plan for every annual fee: when to call, what to downgrade to',
      'Credits, sign-up bonuses and 5/24 for everyone in the household',
    ],
    why: 'I kept paying annual fees I meant to cancel and forgetting which card earns what at the grocery store. I wanted a tracker that tells me what to do and when, not just a list of cards.',
    how: [
      'Plain JavaScript with no framework and no build step. Every rule (renewals, 5/24, retention timing) is ordinary code that runs in the page.',
      'Cards can be filled in from a catalog of common cards. Terms change often, so it says to check the issuer.',
      'The travel profile comes straight from Contrail, so card advice can weigh where you actually fly and stay.',
      'For approved users, Claude will research cards and answer questions about their wallet, through a small server that keeps the API key off the page and caps daily use.',
    ],
    status: 'live',
    statusNote: 'Live as a demo with sample data; sign-in for approved users is next.',
    next: [
      'Sign-in so approved users keep their own wallet',
      'Claude card research and chat for approved users',
    ],
    tags: ['JavaScript', 'Rules engine', 'Claude'],
    url: '/wallet/cover/',
    code: 'https://github.com/billywall732/billywall732.github.io/tree/main/wallet',
    image: '/img/wallet.webp',
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
    status: 'rough',
    statusNote: 'Imports and live prices work; getting it ready to publish.',
    next: [
      'Publish it',
      'Charts of portfolio value over time',
      'A short weekly summary of what changed',
    ],
    tags: ['Cloudflare Workers', 'Live prices', 'Google Drive'],
    url: null,
    code: null,
    follow: false, // no repo yet
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
    follow: false, // no repo yet
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
  {
    slug: 'krillion-code-breaker',
    name: 'Krillion Code Breaker',
    kicker: 'Practice Companion',
    icon: '🤿',
    accent: '#23b5c4',
    tagline: 'A practice companion for krillion.io’s daily dive, aiming for 700.',
    blurb: 'A trainer for krillion.io’s daily trivia dive: practice rounds with my own prompts, a strategy guide, and a log of your real scores on the way to a perfect 700. Practice companion: scores are entered by you, this app does not play krillion.io for you.',
    highlights: [
      'Practice dives: seven prompts, 25 seconds each, scored by rarity',
      'A strategy guide: opening moves, high-value patterns, common traps',
      'A score log and progress chart toward 700',
    ],
    // Extra sections on the project page (optional): { title, text, items }
    notes: [
      {
        title: 'The rules I’m training for',
        text: 'Krillion’s daily dive, as described in its FAQ and in published player guides (checked Nov 1, 2026):',
        items: [
          'Seven open-ended prompts a day, the same for everyone, with 25 seconds to type one answer to each.',
          'An accepted answer scores by how rare it is: Plankton 10, Too Clever 15, Schooler 30, Rare 60, Deep Cut 85, One in a Krillion 100. A wrong or empty answer scores 0.',
          '“Too Clever” is the go-to “obscure” pick that isn’t actually obscure, so it scores less than an honest Schooler.',
          'Rarity comes from a familiarity database for some prompts and from AI help plus manual review for others.',
          'Each point is 10 meters of depth. One scored daily dive per day.',
        ],
      },
      {
        title: 'What a 700 takes',
        text: '700 is the maximum: seven prompts at 100 points each, so a One in a Krillion answer on every prompt with nothing to spare. One Deep Cut makes it 685. The trainer tracks your best, your average and your Krillions per dive along the way.',
      },
      {
        title: 'What it doesn’t do',
        text: 'It never connects to krillion.io: no scraping, no auto-play, no submitting scores and no getting around any of its controls. The practice prompts and their rarity tiers are mine, and your real scores are typed in by you and stay in your browser.',
      },
    ],
    why: 'I play Krillion most mornings and kept landing in the 400s. I wanted somewhere to practice the habit of skipping the obvious answer, and to see whether I’m actually getting better.',
    how: [
      'Practice: a dive of seven of my own prompts, picked by date (or at random), with a 25-second timer and answers scored by rarity tier.',
      'Strategy: what wins points, what traps cost them, and the break-even math for swinging at a rarer answer.',
      'Score log: you play krillion.io yourself, then type in your score, date and notes. Saved in your browser.',
      'Progress: best, recent average and a chart against the 700 line.',
    ],
    status: 'workshop',
    statusNote: 'A first working version: practice, guide, log and progress.',
    next: [
      'More practice prompts, so dives repeat less',
      'Track which tiers you land most, per category',
    ],
    tags: ['JavaScript', 'Daily puzzles', 'SVG'],
    url: '/code-breaker/',
    code: null,
    image: null,
    art: 'dive',
  },
  {
    slug: 'loop-lab',
    name: 'Loop Lab',
    kicker: 'Music Toy',
    icon: '🎛️',
    accent: '#ff4fa3',
    tagline: 'A 16-step loop maker with sounds built from scratch in the browser.',
    blurb: 'A one-bar step sequencer: six sounds, a 16-step grid, tempo, and play. Every sound is synthesized with Web Audio, so there are no samples, no sign-in and nothing uploaded.',
    highlights: [
      'Kick, snare, hi-hat, clap, bass and lead, all synthesized',
      'Tempo from 60 to 180 BPM, with mute and pitch per sound',
      'Save three patterns in your browser, or export a WAV',
    ],
    why: 'I wanted to understand how drum machines make sound without samples, and a step grid is the most fun way to hear it.',
    how: [
      'Each sound is a few Web Audio nodes: oscillators and noise, shaped by filters and envelopes.',
      'A look-ahead scheduler queues each step a fraction of a second early, so timing stays tight.',
      'Patterns save to three slots in your browser; the WAV export renders four loops offline.',
    ],
    status: 'workshop',
    statusNote: 'One working instrument and one pattern, playing cleanly.',
    next: [
      'Swing and per-step velocity',
      'Chain patterns into a short song',
    ],
    tags: ['JavaScript', 'Web Audio'],
    url: '/loop-lab/',
    code: null,
    image: null,
    art: 'steps',
  },
];

// "Off the clock". rating is how good I am, out of 5. photos are the ones in
// clockPhotos below that tapping the block shows (tap again for the next one).
export const hobbies = [
  { icon: '🏂', name: 'Snowboarding', rating: 4, photos: ['snowboarding', 'ski-mountain'] },
  { icon: '🚵', name: 'Mountain biking', rating: 4, photos: ['mountain-biking', 'mtb-crash'] },
  { icon: '🏄', name: 'Surfing', rating: 2, photos: ['surfing'] },
  { icon: '⛳', name: 'Golf', rating: 1, photos: ['golfing'] },
  { icon: '🥾', name: 'Hiking', rating: 4, photos: ['hiking'] },
  { icon: '🦞', name: 'Lobstering', rating: 3, photos: ['lobstering'] },
  { icon: '🛶', name: 'Kayaking', rating: 4, photos: ['kayaking', 'sea-cave-kayaking', 'river-kayaking'] },
  { icon: '🏹', name: 'Archery', rating: 4, photos: ['archery-group'] },
];

// The photo carousel on "Off the clock", in the order it plays. Each is
// img/clock/<id>.webp. To add one: put the original in photos/ (not committed)
// and run, from the repo folder:
//   ffmpeg -i photos/Name.jpeg -map_metadata -1 -vf "scale='if(gt(iw,ih),min(1400,iw),-2)':'if(gt(iw,ih),-2,min(1400,ih))'" -c:v libwebp -quality 72 img/clock/name.webp
// -map_metadata -1 strips the location and camera data from the photo.
// focus: [where the people are, where the top person's head is], as fractions of the photo's
// height (0 top, 1 bottom). The carousel frames each photo on the people, keeping that head in view.
export const clockPhotos = [
  { id: 'snowboarding', focus: [0.66, 0.34], caption: 'Snowboarding', alt: 'Snowboarding down a groomed run with snowy peaks behind' },
  { id: 'mountain-biking', focus: [0.62, 0.45], caption: 'Mountain biking', alt: 'A selfie with a mountain bike on one shoulder, green canyons behind' },
  { id: 'surfing', focus: [0.63, 0.42], caption: 'Surfing', alt: 'Carrying a surfboard down the beach in a wetsuit' },
  { id: 'golfing', focus: [0.58, 0.33], caption: 'Golf (mostly the cart)', alt: 'A selfie in a golf cart on the course' },
  { id: 'lobstering', focus: [0.5, 0.25], caption: 'Lobstering', alt: 'Diving headfirst toward the sea floor in clear blue water' },
  { id: 'kayaking', focus: [0.55, 0.33], caption: 'Kayaking', alt: 'Two people paddling a red kayak with an American flag paddle' },
  { id: 'hiking-peak', focus: [0.67, 0.59], caption: 'Hiking', alt: 'Two hikers sitting on a rocky summit above the clouds' },
  { id: 'horses', focus: [0.52, 0.07], caption: 'Horseback riding', alt: 'Riding a horse along a bluff above the ocean' },
  { id: 'ski-mountain', focus: [0.55, 0.3], caption: 'Snowboarding', alt: 'A chairlift climbing toward snowy mountain peaks' },
  { id: 'sea-cave-kayaking', focus: [0.8, 0.6], caption: 'Sea cave kayaking', alt: 'Two kayakers cheering under the orange rock of a sea cave' },
  { id: 'skydiving', focus: [0.5, 0.4], caption: 'Skydiving', alt: 'A parachute coming in to land over a green field' },
  { id: 'atv', focus: [0.62, 0.34], caption: 'Dune riding', alt: 'Riding a yellow ATV on sand dunes' },
  { id: 'mtb-crash', focus: [0.55, 0.28], caption: 'Mountain biking, the other half', alt: 'Sitting on a rocky trail next to a fallen mountain bike' },
  { id: 'stand-up-paddle', focus: [0.53, 0.47], caption: 'Stand-up paddling', alt: 'Paddleboarding down a turquoise river through mangroves' },
  { id: 'archery-group', focus: [0.6, 0.25], caption: 'Archery with the crew', alt: 'A group selfie at an archery range, bows in hand' },
  { id: 'hiking-dog', focus: [0.6, 0.42], caption: 'Hiking with a trail buddy', alt: 'A hiker crouching to pet a dog on a dry hillside trail' },
  { id: 'river-kayaking', focus: [0.82, 0.65], caption: 'River kayaking', alt: 'Kayaking down a river past trees with a flag paddle' },
  { id: 'horsebackriding', focus: [0.62, 0.36], caption: 'Horseback riding', alt: 'A selfie on horseback at sunset with another rider behind' },
  { id: 'hiking', focus: [0.65, 0.51], caption: 'Hiking', alt: 'Hikers on a trail above a sea of clouds' },
  { id: 'scuba-diving', focus: [0.72, 0.62], caption: 'Scuba diving', alt: 'A diver far below in deep green-blue water' },
  { id: 'mountains', focus: [0.65, 0.45], caption: 'Road trip', alt: 'A highway leading toward snowy mountains' },
  { id: 'billy', focus: [0.62, 0.32], caption: 'Off the clock, officially', alt: 'Standing on a balcony above palm trees with a drink' },
];

// The footer strip
export const contact = {
  email: 'WallWorks732@gmail.com', // your public email address; the "Email me" button shows up once it's set
  github: 'https://github.com/billywall732',
  issues: 'https://github.com/billywall732/billywall732.github.io/issues/new',
};
