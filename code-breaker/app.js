// Krillion Code Breaker: Billy vs. a Claude-powered bot on krillion.io's daily dive.
// This page only talks to the bot's own API (a Cloudflare Worker). The bot itself runs on
// GitHub Actions, plays on its own Krillion account, and sends a play-by-play and screenshots
// here while it dives. Prompts, answers and screenshots stay hidden until Billy has played.
import { setUpPage } from '/js/ui.js';

// The Worker. Empty = demo data. On localhost, ?api=http://localhost:8788 points at a local Worker
// and ?api=demo shows the demo.
const API_URL = 'https://krillion-code-breaker.offthewall-dev.workers.dev';
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const params = new URLSearchParams(location.search);
const API = (LOCAL && params.get('api')) || API_URL;
const DEMO = !API || API === 'demo';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

let revealed = false; // the visitor pressed "Reveal anyway"
let today = null;
let todayTimer = null;
const live = { since: 0, revealed: false, frameAt: null, timer: null, count: 0 };

// ---------- data ----------
async function api(path, opts = {}) {
  if (DEMO) return demo(path, opts);
  try {
    const res = await fetch(API.replace(/\/$/, '') + path, opts);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}
const q = () => (revealed ? '?reveal=1' : '');

async function load() {
  const [t, l] = await Promise.all([api('/api/today' + q()), api('/api/leaderboard')]);
  if (t.ok) { today = t.body; renderToday(t.body); } else setStatus('error', 'Couldn’t reach the bot right now.');
  if (l.ok) renderBoard(l.body);
  clearTimeout(todayTimer);
  if (t.ok && (t.body.status === 'running' || t.body.boardPending)) todayTimer = setTimeout(load, 10000);
  pollLive();
}

// ---------- today ----------
function renderToday(t) {
  $('cbTodayH').textContent = `Today · ${t.day}`;
  $('meHandle').textContent = `Billy (@${t.me.handle})`;
  $('botHandle').textContent = `The bot (@${t.bot.handle})`;
  $('meScore').textContent = fmt(t.me.score);
  $('botScore').textContent = fmt(t.bot.score);
  $('meSub').textContent = t.me.score == null && t.status === 'done' ? 'hasn’t played yet' : '';
  $('botSub').textContent = t.bot.depthM != null ? `${fmt(t.bot.depthM)} m down` : '';
  const max = Math.max(t.me.score || 0, t.bot.score || 0, 1);
  $('meBar').style.width = `${((t.me.score || 0) / max) * 100}%`;
  $('botBar').style.width = `${((t.bot.score || 0) / max) * 100}%`;

  const msgs = {
    idle: 'The bot hasn’t dived today. Press Run to watch it play.',
    running: 'Diving now. A whole dive takes about 3 minutes.',
    done: verdict(t),
    error: t.message || 'The last run failed. You can try again.',
    'needs-login': t.message || 'The bot needs to sign in to Krillion again.',
    blocked: t.message || 'Krillion stopped the bot, so it sits out until tomorrow.',
  };
  const dot = { running: 'running', done: 'done', error: 'error', 'needs-login': 'error', blocked: 'error' }[t.status] || '';
  setStatus(dot, t.boardPending ? 'Refreshing scores…' : msgs[t.status] || t.status);

  const run = $('runBtn');
  run.disabled = ['running', 'done', 'blocked', 'needs-login'].includes(t.status);
  run.textContent = t.status === 'error' ? 'Try again' : t.status === 'done' ? 'Done for today' : t.status === 'running' ? 'Diving…' : 'Run today’s dive';
  const ref = $('refreshBtn');
  ref.disabled = t.status !== 'done' || t.boardPending || t.refreshesLeft <= 0;
  ref.title = `${t.refreshesLeft} refreshes left today`;
  renderDive(t);
}

function verdict(t) {
  const m = t.me.score, b = t.bot.score;
  if (b == null) return 'The bot finished, but its score isn’t on the board yet.';
  if (m == null) return 'The bot is done. Billy’s move: play, then refresh scores.';
  if (m > b) return `Billy beat the bot by ${fmt(m - b)}.`;
  if (b > m) return `The bot wins today by ${fmt(b - m)}.`;
  return 'Dead even today.';
}

function tierClass(t) {
  const s = String(t || '').toUpperCase();
  if (/KRILL/.test(s)) return 't-top';
  if (/RARE|DEEP/.test(s)) return 't-hi';
  if (/^(TOO CLEVER|MISS|NOT|UNKNOWN|INVALID|WRONG)/.test(s)) return 't-low';
  return '';
}

function renderDive(t) {
  const el = $('cbDive');
  if (!t.prompts.length) {
    el.innerHTML = `<p class="cb-small">${t.status === 'running' ? 'Diving now: answers land here when it’s done.' : 'No dive yet today.'}</p>`;
    return;
  }
  const rows = t.prompts.map((p) => `<div class="cb-prow">
      <span class="cb-n">${String(p.n).padStart(2, '0')}</span>
      <div><span class="cb-tier ${tierClass(p.tier)}">${esc(p.tier || '—')}</span>
        <div class="cb-q">${p.prompt == null ? '<span class="cb-hidden">hidden prompt text</span>' : esc(p.prompt)}</div>
        <div class="cb-a">${p.answer == null ? '<span class="cb-hidden">answer</span>' : `“${esc(p.answer)}”`}</div></div>
      <span class="cb-pts">+${fmt(p.points)}<small>${p.depthM != null ? `${fmt(p.depthM)} m` : ''}</small></span>
    </div>`).join('');
  el.innerHTML = rows + (t.spoilersHidden
    ? `<p class="cb-spoiler"><span>Prompts and answers stay hidden until Billy has played today.</span><button class="button ghost" type="button" data-reveal>Reveal anyway</button></p>`
    : '');
}

// ---------- the live view ----------
async function pollLive() {
  clearTimeout(live.timer);
  const r = await api(`/api/live?since=${live.since}${revealed ? '&reveal=1' : ''}`);
  if (!r.ok) return;
  const L = r.body;
  if (L.revealed !== live.revealed) { // spoiler state changed: start the feed over with the right text
    live.revealed = L.revealed;
    if (live.since) { live.since = 0; live.count = 0; $('cbFeed').innerHTML = ''; return pollLive(); }
  }
  for (const e of L.events) {
    live.since = Math.max(live.since, e.seq);
    live.count++;
    const li = document.createElement('li');
    li.innerHTML = `<time>${clock(e.at)}</time><span class="k-${esc(e.kind)}">${esc(e.text)}</span>`;
    $('cbFeed').append(li);
  }
  if (L.events.length) $('cbFeed').scrollTop = $('cbFeed').scrollHeight;

  const running = L.status === 'running';
  $('cbLive').hidden = !running && !live.count;
  $('cbLiveH').lastChild.textContent = running ? 'Watch the bot' : 'How today’s dive went';
  $('cbLiveDot').className = `cb-dot ${running ? 'running' : L.status === 'done' ? 'done' : ['error', 'blocked', 'needs-login'].includes(L.status) ? 'error' : ''}`;
  $('cbLiveSpoiler').hidden = L.revealed;
  renderFrame(L);

  if (running) live.timer = setTimeout(pollLive, 2000);
  else if (today?.status === 'running') load(); // it just finished: pick up the final scores
}

function renderFrame(L) {
  const img = $('cbFrame'), msg = $('cbScreenMsg');
  if (!L.revealed) {
    img.hidden = true;
    msg.hidden = false;
    msg.textContent = 'The bot’s screen shows today’s prompts, so it’s hidden until Billy has played.';
    return;
  }
  if (!L.frameAt) {
    img.hidden = true;
    msg.hidden = false;
    msg.textContent = DEMO ? 'Screenshots of the bot’s browser show up here during a real dive.' : 'Waiting for the first screenshot…';
    return;
  }
  if (L.frameAt !== live.frameAt) {
    live.frameAt = L.frameAt;
    const next = new Image();
    next.onload = () => { img.src = next.src; img.hidden = false; msg.hidden = true; };
    next.src = `${API.replace(/\/$/, '')}/api/live/frame?reveal=1&t=${L.frameAt}`;
  }
}

// ---------- record and history ----------
function renderBoard(l) {
  const s = l.stats;
  const streak = s.streak.who ? `${s.streak.who === 'me' ? 'Billy' : 'Bot'} ×${s.streak.length}` : '—';
  const stat = (k, v, d) => `<div class="card-box cb-stat"><span class="k">${k}</span><span class="v">${v}</span><span class="d">${d}</span></div>`;
  $('cbStats').innerHTML = [
    stat('Record', `<span class="m">${s.record.me}</span><span class="s">–</span><span class="b">${s.record.bot}</span>${s.record.tie ? `<span class="s">–${s.record.tie}</span>` : ''}`, 'Billy – bot – ties'),
    stat('Streak', esc(streak), 'current run of wins'),
    stat('Average', `<span class="m">${fmt(s.average.me)}</span><span class="s"> / </span><span class="b">${fmt(s.average.bot)}</span>`, `over ${s.headToHeadDays} head-to-head day${s.headToHeadDays === 1 ? '' : 's'}`),
    stat('Best dive', `<span class="m">${fmt(s.best.me?.score)}</span><span class="s"> / </span><span class="b">${fmt(s.best.bot?.score)}</span>`, 'Billy / bot'),
  ].join('');
  if (!l.days.length) { $('cbHistory').innerHTML = '<p class="cb-small">Nothing yet.</p>'; return; }
  $('cbHistory').innerHTML = `<table class="cb-table"><thead><tr><th>Day</th><th>Billy</th><th>Bot</th></tr></thead><tbody>${
    l.days.map((d) => {
      const both = d.me != null && d.bot != null;
      return `<tr><td>${esc(d.day)}</td><td class="${both && d.me > d.bot ? 'win-me' : ''}">${fmt(d.me)}</td><td class="${both && d.bot > d.me ? 'win-bot' : ''}">${fmt(d.bot)}</td></tr>`;
    }).join('')
  }</tbody></table>`;
}

function setStatus(cls, text) {
  $('cbDot').className = `cb-dot ${cls || ''}`;
  $('cbStatus').textContent = text;
}

// ---------- actions ----------
$('runBtn').addEventListener('click', async () => {
  $('runBtn').disabled = true;
  setStatus('running', 'Starting the bot…');
  const r = await api('/api/run', { method: 'POST' });
  if (!r.ok && r.status !== 202 && r.status !== 409) setStatus('error', r.body.message || 'Couldn’t start the bot.');
  live.since = 0; live.count = 0; live.frameAt = null; $('cbFeed').innerHTML = '';
  load();
});
$('refreshBtn').addEventListener('click', async () => {
  $('refreshBtn').disabled = true;
  const r = await api('/api/refresh', { method: 'POST' });
  if (!r.ok && r.status !== 202) setStatus('', r.body.message || 'Couldn’t refresh right now.');
  load();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-reveal]')) return;
  revealed = true;
  load();
});

// ---------- demo (until the bot is connected) ----------
const demoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const DEMO_PROMPTS = [
  ['Name a noodle dish', 'Kuksu', 'RARE', 60],
  ['Name a bird of prey', 'Laggar falcon', 'DEEP CUT', 85],
  ['Name a constellation', 'Camelopardalis', 'RARE', 60],
  ['Name a type of cheese', 'Bryndza', 'RARE', 60],
  ['Name a card game', 'Skat', 'SCHOOLER', 30],
  ['Name a mountain range', 'Brooks Range', 'SCHOOLER', 30],
  ['Name a musical instrument', 'Hurdy-gurdy', 'SCHOOLER', 30],
];
const DEMO_TOTAL = DEMO_PROMPTS.reduce((s, p) => s + p[3], 0);
const demoState = { runAt: null, me: null };
function demoScript() { // the play-by-play of the made-up dive, one line every 1.5 s
  const lines = [['start', 'The bot is awake'], ['open', 'Opening today’s dive'], ['begin', 'Beginning the descent']];
  let depth = 0;
  DEMO_PROMPTS.forEach(([p, a, tier, pts], i) => {
    depth += pts * 10;
    lines.push(['prompt', `Prompt ${i + 1} of 7: ${p}`, `Prompt ${i + 1} of 7`], ['thinking', 'Thinking…'],
      ['answer', `Answered “${a}” (1.${i + 2} s to think)`, `Answered (1.${i + 2} s to think)`], ['result', `${tier} · +${pts} pts · ${depth.toLocaleString()} m`]);
  });
  lines.push(['board', 'Checking the friends leaderboard'], ['done', `Finished: ${DEMO_TOTAL} points`]);
  return lines;
}
function demo(path) {
  const ok = (body, status = 200) => ({ ok: status < 300, status, body });
  if (path === '/api/run') { demoState.runAt = Date.now(); return ok({ status: 'running' }, 202); }
  if (path === '/api/refresh') { demoState.me = 402; return ok({ status: 'refreshing' }, 202); }
  const script = demoScript();
  const shown = demoState.runAt == null ? 0 : Math.min(script.length, Math.floor((Date.now() - demoState.runAt) / 1500) + 1);
  const status = demoState.runAt == null ? 'idle' : shown < script.length ? 'running' : 'done';
  const finished = status === 'done';
  const reveal = demoState.me != null || path.includes('reveal=1');
  if (path.startsWith('/api/live')) {
    const since = Number(new URLSearchParams(path.split('?')[1]).get('since')) || 0;
    return ok({ day: demoDay, status, revealed: reveal, frameAt: null,
      events: script.slice(0, shown).map(([kind, text, safe], i) => ({ seq: i + 1, at: demoState.runAt + i * 1500, kind, text: reveal ? text : safe ?? text })).filter((e) => e.seq > since) });
  }
  if (path.startsWith('/api/today')) {
    let depth = 0;
    return ok({ day: demoDay, status, message: null,
      me: { handle: 'bigkril', score: demoState.me }, bot: { handle: 'offthewall', score: finished ? DEMO_TOTAL : null, depthM: finished ? DEMO_TOTAL * 10 : null },
      spoilersHidden: !reveal, boardPending: false, refreshesLeft: 5,
      prompts: finished ? DEMO_PROMPTS.map(([p, a, tier, pts], i) => ({ n: i + 1, tier, points: pts, depthM: (depth += pts * 10), prompt: reveal ? p : null, answer: reveal ? a : null })) : [] });
  }
  if (path === '/api/leaderboard') {
    const days = [{ day: '2026-11-04', me: 310, bot: 395 }, { day: '2026-11-03', me: 402, bot: 330 }, { day: '2026-11-02', me: 275, bot: 275 }];
    if (finished) days.unshift({ day: demoDay, me: demoState.me, bot: DEMO_TOTAL });
    const both = days.filter((d) => d.me != null && d.bot != null);
    const record = { me: 0, bot: 0, tie: 0 };
    both.forEach((d) => record[d.me > d.bot ? 'me' : d.bot > d.me ? 'bot' : 'tie']++);
    const avg = (k) => Math.round(both.reduce((s, d) => s + d[k], 0) / both.length);
    return ok({ me: 'bigkril', bot: 'offthewall', days, stats: { headToHeadDays: both.length, record,
      streak: demoState.me != null ? { who: 'me', length: 1 } : { who: 'bot', length: 1 },
      average: { me: avg('me'), bot: avg('bot') }, best: { me: { score: Math.max(...both.map((d) => d.me)) }, bot: { score: Math.max(...both.map((d) => d.bot)) } } } });
  }
  return ok({}, 404);
}

if (DEMO) $('cbDemo').hidden = false;
load();
setUpPage();
