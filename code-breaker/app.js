// Krillion Code Breaker: a practice companion for krillion.io's daily dive. It never talks to
// krillion.io: practice uses my own prompts (prompts.js), and real scores are typed in by the player.
// The score log is kept in this browser only.
import { setUpPage } from '/js/ui.js';
import { PROMPTS, TIERS } from './prompts.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GOAL = 700, PER_PROMPT = 25, ROUND = 7, METERS = 10;
const TIER = Object.fromEntries(TIERS.map((t) => [t.key, t]));

// ---------- answers ----------
// Lowercase, no accents or punctuation (keeping # and + for C# and C++), no leading "the" or "a"
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`.]/g, '')
  .replace(/[^a-z0-9#+]+/g, ' ').trim().replace(/^(the|a|an) /, '');
function lev(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// The tier an answer lands in: an exact match (or alias) first, then a near miss on a longer word
function judge(prompt, raw) {
  const a = norm(raw); if (!a) return null;
  const all = TIERS.flatMap((t) => (prompt[t.key] || []).map((entry) => ({ tier: t.key, names: entry.split('|').map(norm), shown: entry.split('|')[0] })));
  const exact = all.find((x) => x.names.includes(a));
  if (exact) return exact;
  let best = null, bestD = 9;
  for (const x of all) for (const nm of x.names) {
    const allow = nm.length >= 9 ? 2 : nm.length >= 5 ? 1 : 0;
    const d = lev(a, nm); if (d <= allow && d < bestD) { best = x; bestD = d; }
  }
  return best;
}

// ---------- the practice dive ----------
// Today's dive: 7 prompts picked from the date, the same all day. "New dive" picks at random.
function seeded(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const todayKey = () => new Date().toLocaleDateString('en-CA');
function pick(rand) { const idx = PROMPTS.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, ROUND); }

let dive = null, timer = null;
function newDive(kind) {
  const rand = kind === 'today' ? seeded([...todayKey()].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) : Math.random;
  dive = { kind, order: pick(rand), i: 0, results: [], timed: $('#cbTimed')?.checked ?? true };
  showPrompt();
}
function practiceShell() {
  $('[data-panel="practice"]').innerHTML = `
    <div class="cb-start card-box">
      <h2>Practice dive</h2>
      <p>Seven prompts, ${PER_PROMPT} seconds each, one typed answer per prompt. Rarer accepted answers score more; a perfect dive is ${GOAL} points (${GOAL * METERS} meters).</p>
      <div class="cb-row">
        <button class="button" type="button" data-act="today">Start today’s practice dive</button>
        <button class="button ghost" type="button" data-act="random">New random dive</button>
        <label class="cb-check"><input type="checkbox" id="cbTimed" checked> ${PER_PROMPT}-second timer</label>
      </div>
      <p class="cb-small">Practice prompts and tiers are mine, made for training. They aren’t krillion.io’s prompts or answers.</p>
    </div>
    <div id="cbStage"></div>`;
}
function showPrompt() {
  clearInterval(timer);
  const stage = $('#cbStage'), pr = PROMPTS[dive.order[dive.i]];
  const score = dive.results.reduce((a, r) => a + r.points, 0);
  stage.innerHTML = `<div class="card-box cb-q">
    <div class="cb-qtop"><span>Prompt ${dive.i + 1} of ${ROUND}</span><span class="cb-depth">${score} pts · ${score * METERS} m</span></div>
    <h3>${esc(pr.q)}</h3>
    ${dive.timed ? `<div class="cb-timer" aria-hidden="true"><i style="--t:${PER_PROMPT}s"></i></div><p class="cb-secs" aria-live="off"><span id="cbSecs">${PER_PROMPT}</span>s left</p>` : ''}
    <form class="cb-answer" id="cbForm" autocomplete="off">
      <label class="sr" for="cbIn">Your answer</label>
      <input id="cbIn" type="text" maxlength="60" placeholder="Type one answer" autocapitalize="off" spellcheck="false">
      <button class="button" type="submit">Lock it in</button>
    </form>
  </div>`;
  $('#cbIn').focus();
  $('#cbForm').addEventListener('submit', (e) => { e.preventDefault(); answer($('#cbIn').value); });
  if (dive.timed) {
    const end = Date.now() + PER_PROMPT * 1000;
    timer = setInterval(() => { const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); const el = $('#cbSecs'); if (el) el.textContent = left; if (left <= 0) answer($('#cbIn')?.value || '', true); }, 200);
  }
}
function answer(raw, timeUp = false) {
  clearInterval(timer);
  const pr = PROMPTS[dive.order[dive.i]], hit = judge(pr, raw);
  const r = { q: pr.q, raw: raw.trim(), tier: hit?.tier || null, shown: hit?.shown || '', points: hit ? TIER[hit.tier].points : 0, timeUp: timeUp && !raw.trim() };
  dive.results.push(r);
  const kList = (pr.k || []).slice(0, 3).map((x) => x.split('|')[0]);
  $('#cbStage').innerHTML = `<div class="card-box cb-q cb-res">
    <div class="cb-qtop"><span>Prompt ${dive.i + 1} of ${ROUND}</span></div>
    <h3>${esc(pr.q)}</h3>
    <p class="cb-verdict ${r.tier ? 'tier-' + r.tier : 'tier-none'}">${r.tier
      ? `<b>${esc(TIER[r.tier].name)}</b> · +${r.points} pts <span>(${esc(r.shown)})</span>`
      : `<b>${r.timeUp ? 'Out of time' : r.raw ? 'Not on my list' : 'No answer'}</b> · 0 pts${r.raw && !r.timeUp ? ` <span>(“${esc(r.raw)}”)</span>` : ''}`}</p>
    ${r.tier !== 'k' && kList.length ? `<p class="cb-small">One in a Krillion here: ${kList.map(esc).join(', ')}${(pr.k || []).length > 3 ? '…' : ''}</p>` : ''}
    <button class="button" type="button" data-act="next">${dive.i + 1 < ROUND ? 'Next prompt' : 'See my dive'}</button>
  </div>`;
  $('[data-act="next"]').focus();
}
function finish() {
  const total = dive.results.reduce((a, r) => a + r.points, 0);
  const counts = TIERS.map((t) => [t, dive.results.filter((r) => r.tier === t.key).length]).filter(([, n]) => n);
  saveSet('practice', (list) => [...list, { date: todayKey(), score: total, kind: dive.kind }].slice(-200));
  $('#cbStage').innerHTML = `<div class="card-box cb-sum">
    <h3>${total} points · ${total * METERS} meters</h3>
    <div class="cb-meter" role="img" aria-label="${total} of ${GOAL} points"><i style="--w:${Math.round(total / GOAL * 100)}%"></i></div>
    <p>${total === GOAL ? 'A perfect dive. Seven Krillions.' : `${GOAL - total} points short of a perfect ${GOAL}.`} ${counts.map(([t, n]) => `${n}× ${t.name}`).join(' · ')}</p>
    <ol class="cb-list">${dive.results.map((r) => `<li><span>${esc(r.q)}</span><b>${r.tier ? `${esc(r.shown)} · ${esc(TIER[r.tier].name)}` : '—'}</b><em>${r.points}</em></li>`).join('')}</ol>
    <div class="cb-row"><button class="button" type="button" data-act="random">Dive again</button><button class="button ghost" type="button" data-tab-go="strategy">Read the strategy guide</button></div>
    <p class="cb-small">Practice scores stay here as practice; your real krillion.io scores go in the Score log.</p>
  </div>`;
}

// ---------- the strategy guide ----------
const breakEven = (sure, risky) => Math.round(sure / risky * 1000) / 10;
function renderStrategy() {
  $('[data-panel="strategy"]').innerHTML = `
    <div class="cb-guide">
      <div class="card-box"><h2>What 700 takes</h2>
        <p>700 is the ceiling: seven prompts × 100 points. It means a One in a Krillion answer on <b>every</b> prompt, with nothing to spare. One Deep Cut drops you to 685, and one Rare to 660. So treat 700 as a stretch goal, and track your average and your Krillion count along the way.</p></div>
      <div class="card-box"><h2>Opening moves (the first 5 seconds)</h2><ol>
        <li><b>Read the boundary.</b> Category, conditions, dates (“in the 1990s”, “recognized by…”). Most zeros come from answers just outside it.</li>
        <li><b>Lock a safe answer in your head</b>, then spend the remaining time hunting for something rarer. If the clock runs low, type the safe one: anything beats 0.</li>
        <li><b>Skip the first two things that come to mind.</b> Everyone else thought of them too: they’re Plankton and Schooler.</li>
        <li><b>Drill into a subcategory.</b> Not “a bone” but “a wrist bone”; not “a dog” but “an Italian water dog”.</li></ol></div>
      <div class="card-box"><h2>High-value patterns</h2><ul>
        <li><b>The second shelf of a list:</b> the 8th–15th items people can name (lanthanides, small capitals, minor gods).</li>
        <li><b>Technical names for everyday things:</b> “hamate” instead of “wrist bone”, “virga” instead of “rain that doesn’t land”.</li>
        <li><b>Official-but-forgotten members</b> of a set: dwarf planets that aren’t Pluto, the plays nobody stages.</li>
        <li><b>Full proper names</b>, typed exactly. Practice recalling them cold; generous spell-checking helps, but only with something close.</li></ul></div>
      <div class="card-box"><h2>Common traps</h2><ul>
        <li><b>“Too Clever”:</b> the famous obscure answer (Pluto, zugzwang, the dodo). Everyone reaches for it, so it scores 15, less than an honest Schooler.</li>
        <li><b>Out of bounds:</b> right category, wrong condition (a city that hosted the Olympics, but not in the decade asked).</li>
        <li><b>Ambiguous answers</b> that might not be on the list (crossbreeds, disputed countries, slang names).</li>
        <li><b>Running the clock out</b> while hunting. A typed Rare (60) beats an empty box (0).</li></ul></div>
      <div class="card-box"><h2>The risk math</h2>
        <p>When you have a sure answer and a riskier, rarer one, the rarer one is worth it only if you think it’ll be accepted at least this often:</p>
        <table class="cb-table"><thead><tr><th>Sure answer</th><th>Riskier answer</th><th>Worth it if accepted at least</th></tr></thead><tbody>
          ${[[60, 85], [60, 100], [85, 100], [30, 60], [30, 100]].map(([a, b]) => `<tr><td>${a} pts</td><td>${b} pts</td><td>${breakEven(a, b)}%</td></tr>`).join('')}
        </tbody></table>
        <p class="cb-small">From expected points: sure × 1 vs risky × chance. Chasing 700 means taking the 100-point swing more often, but from a Rare (60) you need only 60% confidence.</p></div>
    </div>`;
}

// ---------- the score log (typed in by the player; kept in this browser) ----------
const KEY = 'cb.v1';
function loadAll() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function saveSet(name, fn) { const all = loadAll(); all[name] = fn(all[name] || []); try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private window */ } }
const scores = () => (loadAll().scores || []).slice().sort((a, b) => b.date.localeCompare(a.date));
function renderLog() {
  const list = scores();
  $('[data-panel="log"]').innerHTML = `
    <div class="card-box"><h2>Log a real dive</h2>
      <p class="cb-small">Play the daily dive on <a href="https://krillion.io" rel="noopener">krillion.io</a> yourself, then type your result here. This app never reads or sends anything to krillion.io; your log stays in this browser.</p>
      <form id="cbLog" class="cb-logform">
        <label>Date <input type="date" name="date" value="${todayKey()}" required max="${todayKey()}"></label>
        <label>Score <input type="number" name="score" min="0" max="${GOAL}" step="1" required inputmode="numeric" placeholder="0–700"></label>
        <label>Krillions <input type="number" name="k" min="0" max="7" step="1" inputmode="numeric" placeholder="optional"></label>
        <label class="wide">Notes <input type="text" name="notes" maxlength="200" placeholder="What worked, what missed"></label>
        <button class="button" type="submit">Save</button>
      </form>
      <p class="cb-msg" id="cbMsg" role="status"></p></div>
    <div class="card-box"><h2>Your dives</h2>
      ${list.length ? `<table class="cb-table"><thead><tr><th>Date</th><th>Score</th><th>Depth</th><th>Krillions</th><th>Notes</th><th></th></tr></thead><tbody>
        ${list.map((s) => `<tr><td>${esc(s.date)}</td><td><b>${s.score}</b></td><td>${s.score * METERS} m</td><td>${s.k ?? '—'}</td><td>${esc(s.notes || '')}</td><td><button type="button" class="linkbtn" data-del="${esc(s.date)}" aria-label="Delete ${esc(s.date)}">Delete</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="cb-small">No dives logged yet. Your first one will show up here and on the Progress tab.</p>'}</div>`;
  $('#cbLog').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target), date = f.get('date'), score = Math.round(Number(f.get('score')));
    if (!date || !(score >= 0 && score <= GOAL)) { $('#cbMsg').textContent = `Score must be between 0 and ${GOAL}.`; return; }
    const k = f.get('k') === '' ? null : Math.max(0, Math.min(7, Math.round(Number(f.get('k')))));
    saveSet('scores', (l) => [...l.filter((s) => s.date !== date), { date, score, k, notes: String(f.get('notes') || '').slice(0, 200) }]);
    renderLog(); $('#cbMsg').textContent = `Saved ${date}: ${score} points.`;
  });
}

// ---------- progress toward 700 ----------
function renderProgress() {
  const list = scores().slice().reverse(), el = $('[data-panel="progress"]');
  if (!list.length) { el.innerHTML = `<div class="card-box"><h2>Progress toward ${GOAL}</h2><p class="cb-small">Log a few real dives on the Score log tab and your trend, best and average show up here.</p>${chart([])}</div>`; return; }
  const best = Math.max(...list.map((s) => s.score)), last7 = list.slice(-7), avg = Math.round(last7.reduce((a, s) => a + s.score, 0) / last7.length);
  const ks = list.filter((s) => s.k != null);
  el.innerHTML = `<div class="card-box"><h2>Progress toward ${GOAL}</h2>
    <div class="cb-kpis">
      <div><b>${best}</b><span>best (${GOAL - best ? `${GOAL - best} to go` : 'perfect!'})</span></div>
      <div><b>${avg}</b><span>average, last ${last7.length} dive${last7.length === 1 ? '' : 's'}</span></div>
      <div><b>${list.length}</b><span>dives logged</span></div>
      <div><b>${ks.length ? (ks.reduce((a, s) => a + s.k, 0) / ks.length).toFixed(1) : '—'}</b><span>Krillions per dive${ks.length ? '' : ' (log them to see)'}</span></div>
    </div>
    <div class="cb-meter big" role="img" aria-label="Best ${best} of ${GOAL}"><i style="--w:${Math.round(best / GOAL * 100)}%"></i></div>
    ${chart(list)}</div>`;
}
function chart(list) {
  const w = 640, h = 220, pad = { l: 40, r: 12, t: 16, b: 26 }, n = list.length;
  const x = (i) => (n <= 1 ? (pad.l + w - pad.r) / 2 : pad.l + i * (w - pad.l - pad.r) / (n - 1)), y = (v) => h - pad.b - v / GOAL * (h - pad.t - pad.b);
  const line = list.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.score).toFixed(1)}`).join('');
  return `<svg class="cb-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${n ? `Scores over time: ${list.map((s) => `${s.date} ${s.score}`).join(', ')}` : 'No scores yet'}">
    ${[0, 175, 350, 525, 700].map((v) => `<line class="g" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    <line class="goal" x1="${pad.l}" x2="${w - pad.r}" y1="${y(GOAL)}" y2="${y(GOAL)}"/><text class="ax goal-t" x="${w - pad.r}" y="${y(GOAL) - 5}" text-anchor="end">goal ${GOAL}</text>
    ${n ? `<path class="ln" d="${line}"/>${list.map((s, i) => `<circle class="dt" cx="${x(i)}" cy="${y(s.score)}" r="4"><title>${esc(s.date)}: ${s.score}</title></circle>`).join('')}
      <text class="ax" x="${x(0)}" y="${h - 6}" text-anchor="${n > 1 ? 'start' : 'middle'}">${esc(list[0].date)}</text>${n > 1 ? `<text class="ax" x="${x(n - 1)}" y="${h - 6}" text-anchor="end">${esc(list[n - 1].date)}</text>` : ''}`
      : `<text class="ax" x="${w / 2}" y="${h / 2}" text-anchor="middle">No dives logged yet</text>`}
  </svg>`;
}

// ---------- rules ----------
function renderRules() {
  $('[data-panel="rules"]').innerHTML = `<div class="card-box"><h2>How krillion.io’s daily dive scores</h2>
    <ul>
      <li><b>Seven prompts</b> a day, the same for everyone, with <b>${PER_PROMPT} seconds</b> to type one answer to each.</li>
      <li>An accepted answer scores by <b>rarity</b>; a wrong answer or an empty box scores 0.</li>
      <li>Every point is <b>${METERS} meters</b> of depth, so a perfect ${GOAL} is a ${GOAL * METERS} m dive.</li>
      <li>One scored daily dive per day; other modes (Unlimited, packs) are for extra play.</li>
    </ul>
    <table class="cb-table"><thead><tr><th>Tier</th><th>Points</th><th>Depth</th></tr></thead><tbody>
      ${TIERS.slice().sort((a, b) => b.points - a.points).map((t) => `<tr><td>${t.name}</td><td>${t.points}</td><td>${t.points * METERS} m</td></tr>`).join('')}
    </tbody></table>
    <p class="cb-small">From krillion.io’s FAQ: rarity comes from a familiarity database for some prompts and from AI help plus manual review for others; “Too Clever” is the go-to “obscure” pick that isn’t actually obscure. Point values and timing are from published player guides, so check krillion.io if anything changes.</p></div>`;
}

// ---------- tabs ----------
const TABS = ['practice', 'strategy', 'log', 'progress', 'rules'];
function setTab(t, push = true) {
  if (!TABS.includes(t)) t = 'practice';
  document.querySelectorAll('.cb-tablist [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  document.querySelectorAll('.cb-panel').forEach((p) => { p.hidden = p.dataset.panel !== t; });
  if (t === 'log') renderLog();
  if (t === 'progress') renderProgress();
  if (push) try { history.replaceState(null, '', '#' + t); } catch { /* ignore */ }
}
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]'); if (tab) return setTab(tab.dataset.tab);
  const go = e.target.closest('[data-tab-go]'); if (go) { setTab(go.dataset.tabGo); scrollTo(0, 0); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'today' || act === 'random') newDive(act);
  if (act === 'next') { dive.i += 1; dive.i < ROUND ? showPrompt() : finish(); }
  const del = e.target.closest('[data-del]'); if (del) { saveSet('scores', (l) => l.filter((s) => s.date !== del.dataset.del)); renderLog(); }
});
addEventListener('hashchange', () => setTab(location.hash.slice(1), false));

practiceShell(); renderStrategy(); renderRules();
setTab(location.hash.slice(1) || 'practice', false);
setUpPage();
