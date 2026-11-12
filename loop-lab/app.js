// Loop Lab: a 16-step loop maker. Six sounds, all synthesized with Web Audio (no samples).
// Patterns are saved in this browser only; the WAV export renders offline and downloads a file.
import { setUpPage } from '/js/ui.js?v=2';

const $ = (s) => document.querySelector(s);
const STEPS = 16;
const NOTES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const hz = (name) => { const [, n, o] = name.match(/^([A-G]#?)(\d)$/); return 440 * 2 ** ((NOTES[n] + (+o + 1) * 12 - 69) / 12); };
const PITCHES = { bass: ['C2', 'D#2', 'F2', 'G2', 'A#2', 'C3'], lead: ['C4', 'D#4', 'F4', 'G4', 'A#4', 'C5'] };

// ---------- the sounds: each plays one hit at time t into out ----------
function noise(ctx, dur) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; return src;
}
function env(ctx, t, peak, attack, decay) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}
const SOUNDS = {
  kick: { name: 'Kick', play(ctx, out, t) {
    const o = ctx.createOscillator(), g = env(ctx, t, 0.85, 0.003, 0.42);
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
  } },
  snare: { name: 'Snare', play(ctx, out, t) {
    const n = noise(ctx, 0.25), f = ctx.createBiquadFilter(), g = env(ctx, t, 0.55, 0.002, 0.18);
    f.type = 'highpass'; f.frequency.value = 1200; n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + 0.25);
    const o = ctx.createOscillator(), og = env(ctx, t, 0.35, 0.002, 0.09);
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.15);
  } },
  hat: { name: 'Hi-hat', play(ctx, out, t) {
    const n = noise(ctx, 0.08), f = ctx.createBiquadFilter(), g = env(ctx, t, 0.28, 0.001, 0.05);
    f.type = 'highpass'; f.frequency.value = 7500; n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + 0.08);
  } },
  clap: { name: 'Clap', play(ctx, out, t) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.9; f.connect(out);
    [0, 0.011, 0.022, 0.034].forEach((d, i) => {
      const n = noise(ctx, 0.2), g = env(ctx, t + d, i === 3 ? 0.5 : 0.35, 0.001, i === 3 ? 0.16 : 0.012);
      n.connect(g).connect(f); n.start(t + d); n.stop(t + d + 0.2);
    });
  } },
  bass: { name: 'Bass', pitched: true, play(ctx, out, t, note, step) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = env(ctx, t, 0.42, 0.005, Math.max(0.12, step * 0.9));
    o.type = 'sawtooth'; o.frequency.value = hz(note);
    f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(140, t + 0.25);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + step + 0.1);
  } },
  lead: { name: 'Lead', pitched: true, play(ctx, out, t, note) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = env(ctx, t, 0.16, 0.004, 0.22);
    o.type = 'square'; o2.type = 'square'; o.frequency.value = hz(note); o2.frequency.value = hz(note) * 1.006;
    f.type = 'lowpass'; f.frequency.value = 2600; o.connect(f); o2.connect(f); f.connect(g).connect(out);
    o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
  } },
};
const TRACKS = Object.keys(SOUNDS);
// A gentle limiter on the way out, so stacked hits don't clip (live and in the WAV)
function limiter(c) { const l = c.createDynamicsCompressor(); l.threshold.value = -10; l.knee.value = 6; l.ratio.value = 12; l.attack.value = 0.003; l.release.value = 0.12; l.connect(c.destination); return l; }

// ---------- the pattern ----------
const empty = () => ({ bpm: 110, steps: Object.fromEntries(TRACKS.map((k) => [k, Array(STEPS).fill(false)])), notes: { bass: 'C2', lead: 'G4' }, mute: {} });
function starter() {
  const p = empty(), on = (k, list) => list.forEach((i) => { p.steps[k][i] = true; });
  on('kick', [0, 6, 8, 11]); on('snare', [4, 12]); on('hat', [0, 2, 4, 6, 8, 10, 12, 14, 15]); on('clap', [12]);
  on('bass', [0, 3, 6, 10]); on('lead', [7, 14]); return p;
}
let P = starter();
function valid(p) {
  return p && typeof p.bpm === 'number' && p.steps && TRACKS.every((k) => Array.isArray(p.steps[k]) && p.steps[k].length === STEPS);
}

// ---------- playback: a short look-ahead scheduler ----------
let ctx = null, master = null, playing = false, nextTime = 0, step = 0, tick = null;
const queue = [];
const stepDur = () => 60 / P.bpm / 4;
function audio() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = +$('#vol').value * 0.7; master.connect(limiter(ctx)); }
  return ctx;
}
function playStep(c, out, i, t) {
  for (const k of TRACKS) if (P.steps[k][i] && !P.mute[k]) SOUNDS[k].play(c, out, t, P.notes[k], stepDur());
}
function scheduler() {
  while (nextTime < ctx.currentTime + 0.12) { playStep(ctx, master, step, nextTime); queue.push({ step, time: nextTime }); nextTime += stepDur(); step = (step + 1) % STEPS; }
}
function start() {
  audio(); ctx.resume();
  playing = true; step = 0; nextTime = ctx.currentTime + 0.05; scheduler(); tick = setInterval(scheduler, 25);
  $('#play').setAttribute('aria-pressed', 'true'); $('.ll-play-t').textContent = 'Pause';
  requestAnimationFrame(draw);
}
function stop() {
  playing = false; clearInterval(tick); queue.length = 0;
  $('#play').setAttribute('aria-pressed', 'false'); $('.ll-play-t').textContent = 'Play';
  document.querySelectorAll('.ll-cell.now').forEach((c) => c.classList.remove('now'));
}
let shown = -1;
function draw() {
  if (!playing) return;
  while (queue.length && queue[0].time <= ctx.currentTime) shown = queue.shift().step;
  document.querySelectorAll('.ll-cell').forEach((c) => c.classList.toggle('now', +c.dataset.i === shown));
  requestAnimationFrame(draw);
}

// ---------- the grid ----------
function renderGrid() {
  $('#grid').innerHTML = TRACKS.map((k) => `<div class="ll-track${P.mute[k] ? ' muted' : ''}" role="row" data-k="${k}">
    <div class="ll-name" role="rowheader">
      <button type="button" class="ll-mute" data-mute="${k}" aria-pressed="${!!P.mute[k]}" title="Mute ${SOUNDS[k].name}">${SOUNDS[k].name}</button>
      ${SOUNDS[k].pitched ? `<select data-note="${k}" aria-label="${SOUNDS[k].name} note">${PITCHES[k].map((n) => `<option${n === P.notes[k] ? ' selected' : ''}>${n}</option>`).join('')}</select>` : ''}
    </div>
    <div class="ll-steps">${P.steps[k].map((on, i) => `<button type="button" role="gridcell" class="ll-cell${i % 4 === 0 ? ' beat' : ''}" data-k="${k}" data-i="${i}" aria-pressed="${on}" aria-label="${SOUNDS[k].name}, step ${i + 1}"></button>`).join('')}</div>
  </div>`).join('');
  $('#bpm').value = P.bpm; $('#bpmOut').textContent = `${P.bpm} BPM`;
}
// Tapping a step plays it, so you hear what you're adding
function preview(k) { if (P.mute[k]) return; const c = audio(); c.resume(); SOUNDS[k].play(c, master, c.currentTime + 0.01, P.notes[k], stepDur()); }

// ---------- saving in this browser ----------
const KEY = 'loop-lab.v1', SLOTS = ['A', 'B', 'C'];
const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
function renderSlots() {
  const s = saved();
  $('#slots').innerHTML = SLOTS.map((id) => `<div class="ll-slot"><b>${id}</b>
    <button class="pill-btn" type="button" data-save="${id}">Save</button>
    <button class="pill-btn" type="button" data-load="${id}"${s[id] ? '' : ' disabled'}>Load</button></div>`).join('');
}
const say = (t) => { $('#msg').textContent = t; };

// ---------- WAV export: render 4 loops offline, write 16-bit PCM ----------
async function exportWav() {
  const sr = 44100, loops = 4, len = stepDur() * STEPS * loops + 0.6;
  const off = new OfflineAudioContext(2, Math.ceil(sr * len), sr), out = off.createGain(); out.gain.value = 0.7; out.connect(limiter(off));
  for (let l = 0; l < loops; l++) for (let i = 0; i < STEPS; i++) playStep(off, out, i, (l * STEPS + i) * stepDur());
  const buf = await off.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)], n = buf.length, data = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++) for (const c of ch) { const v = Math.max(-1, Math.min(1, c[i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  const url = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `loop-lab-${P.bpm}bpm.wav` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  return n;
}

// ---------- controls ----------
document.addEventListener('click', async (e) => {
  const cell = e.target.closest('.ll-cell');
  if (cell) { const { k, i } = cell.dataset; P.steps[k][i] = !P.steps[k][i]; cell.setAttribute('aria-pressed', String(P.steps[k][i])); if (P.steps[k][i] && !playing) preview(k); return; }
  const m = e.target.closest('[data-mute]'); if (m) { P.mute[m.dataset.mute] = !P.mute[m.dataset.mute]; renderGrid(); return; }
  if (e.target.closest('#play')) { playing ? stop() : start(); return; }
  const sv = e.target.closest('[data-save]'); if (sv) { const s = saved(); s[sv.dataset.save] = P; try { localStorage.setItem(KEY, JSON.stringify(s)); say(`Saved to slot ${sv.dataset.save}.`); } catch { say('This browser won’t let the page save (private window?).'); } renderSlots(); return; }
  const ld = e.target.closest('[data-load]'); if (ld) { const p = saved()[ld.dataset.load]; if (valid(p)) { P = structuredClone(p); P.mute ??= {}; P.notes ??= { bass: 'C2', lead: 'G4' }; renderGrid(); say(`Loaded slot ${ld.dataset.load}.`); } return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'starter') { P = { ...starter(), bpm: P.bpm }; renderGrid(); say('Starter beat loaded.'); }
  if (act === 'clear') { const bpm = P.bpm; P = empty(); P.bpm = bpm; renderGrid(); say('Cleared.'); }
  if (act === 'wav') { say('Rendering…'); try { await exportWav(); say('WAV downloaded: 4 loops.'); } catch (err) { say(`Couldn’t export (${err.message}).`); } }
});
document.addEventListener('change', (e) => { const n = e.target.closest('[data-note]'); if (n) { P.notes[n.dataset.note] = n.value; preview(n.dataset.note); } });
$('#bpm').addEventListener('input', (e) => { P.bpm = +e.target.value; $('#bpmOut').textContent = `${P.bpm} BPM`; });
$('#vol').addEventListener('input', (e) => { if (master) master.gain.value = +e.target.value * 0.7; });
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest('input, select, textarea, button')) return;
  e.preventDefault(); playing ? stop() : start();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop(); });

renderGrid(); renderSlots();
setUpPage();
