// What's in My Wallet?: a credit card tracker. Ported from the claude.ai version: every card
// feature works as before; storage goes through shared/store.js, the travel profile comes
// straight from Contrail's trips and stays, and the Claude features are off in the demo
// ("Pick from the catalog" fills in a card instead).
import { connectStore, readAppData, store } from "/shared/store.js?v=3";
import { demoBanner, saveFile, setUpApp } from "/shared/app-shell.js?v=4";
import { airport, deriveTrip, loadAirports } from "/shared/trips.js";
import { travelSummary } from "/shared/travel.js";
import { contrailDemo } from "/contrail/demo-data.js";
import { walletDemo } from "/wallet/demo-data.js";

setUpApp();
const AI_OFF = "Claude features are available to approved users.";
let CATALOG = [];
// Claude-only controls are disabled in the demo, with the reason on hover and beside them
function aiOff() {
  document.querySelectorAll('.wallet-app [data-act="watch-research"], .wallet-app [data-act="travel-ask"], .wallet-app [data-act="ask-downgrade"], .wallet-app #askBtn, .wallet-app #chatForm [type=submit], .wallet-app [data-chatpreset], .wallet-app [data-act="chat-to-recs"], .wallet-app [data-act="recs-to-chat"]')
    .forEach(b => { b.disabled = true; b.title = AI_OFF; });
}
document.addEventListener("change", e => { if (e.target.id === "f_catalog" && e.target.value) fillFromCatalog(e.target.value); });
// ---------- constants ----------
const CATS = [
  ["dining","Dining"],["groceries","Groceries"],["travel","Travel (general)"],["flights","Flights"],["hotels","Hotels"],
  ["gas","Gas & EV"],["transit","Transit & rideshare"],["streaming","Streaming"],["drugstore","Drugstores"],
  ["online","Online shopping"],["rotating","Rotating 5% category"],["rent","Rent / mortgage"],["other","Everything else"]
];
const CAT_LABEL = Object.fromEntries(CATS);
const PROGRAMS = {
  "Chase Ultimate Rewards": 1.5, "Amex Membership Rewards": 1.6, "Capital One Miles": 1.5, "Citi ThankYou": 1.5,
  "Bilt Rewards": 1.6, "Cash back": 1.0, "Airline miles": 1.2, "Hotel points": 0.6, "Other": 1.0
};
const PERK_KINDS = ["Lounge access","Travel protection","Purchase & return protection","Elite status","Insurance","Foreign transaction","Other"];
const PERIODS = { monthly: "Monthly", quarterly: "Quarterly", semiannual: "Every 6 months", annual: "Yearly" };
const COLORS = ["#1e3a5f","#0f4c45","#5b1f2e","#2d2d34","#7a5a1a","#3b2a63","#8a8f98","#b0743a","#174f8a","#0b0b0d"];
// [key, label, emoji]: short labels so every tab and its emoji fit on one row (the panels keep the full names)
const TABS = [["overview","Overview","🧭"],["cards","Cards","💳"],["matrix","Multipliers","📈"],["perks","Perks","🎁"],["timeline","Timeline","🗓️"],["travel","Travel","✈️"],["research","Research","🔎"],["data","Settings","⚙️"]];
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
// Common no-fee or lower-fee product-change targets, matched on issuer + card name. Suggestions only; issuers change these.
const DOWNGRADES = [
  [/chase/i, /sapphire/i, "Freedom Unlimited or Freedom Flex"],
  [/chase/i, /ink (business )?preferred/i, "Ink Business Cash or Ink Business Unlimited"],
  [/chase/i, /united/i, "United Gateway"],
  [/chase/i, /southwest/i, "another Southwest card (no no-fee version; consider cancelling)"],
  [/chase/i, /marriott|bonvoy/i, "Marriott Bonvoy Bold"],
  [/chase/i, /hyatt/i, "no no-fee Hyatt card; Freedom Unlimited may be offered"],
  [/american express|amex/i, /platinum/i, "Gold or Green (Amex has no no-fee charge card)"],
  [/american express|amex/i, /gold/i, "Green, or Blue Cash Everyday if offered"],
  [/american express|amex/i, /delta/i, "Delta SkyMiles Blue"],
  [/american express|amex/i, /hilton/i, "Hilton Honors (no annual fee)"],
  [/american express|amex/i, /blue cash preferred/i, "Blue Cash Everyday"],
  [/capital one/i, /venture x/i, "Venture or VentureOne"],
  [/capital one/i, /venture/i, "VentureOne"],
  [/capital one/i, /savor/i, "Savor (no-fee version)"],
  [/citi/i, /premier|strata/i, "Custom Cash or Double Cash"],
  [/citi/i, /aadvantage|platinum select/i, "AAdvantage MileUp"],
  [/wells fargo/i, /journey/i, "Autograph"],
  [/bank of america|bofa/i, /premium rewards/i, "Travel Rewards or Customized Cash"]
];
function suggestDowngrade(c) {
  const hit = DOWNGRADES.find(([i, n]) => i.test(c.issuer || "") && n.test(c.name || ""));
  return hit ? hit[2] : "";
}

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const money = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n || 0)).toLocaleString("en-US");
const pts = n => Math.round(n || 0).toLocaleString("en-US");
const parseD = s => { if (!s) return null; const [y,m,d] = s.split("-").map(Number); if (!y) return null; return new Date(y, (m||1)-1, d||1); };
const iso = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";
const fmtD = d => d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtMY = d => d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";
const addMonths = (d, n) => { const r = new Date(d); const day = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + n); r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth()+1, 0).getDate())); return r; };
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
function relDays(n) { if (n === 0) return "today"; if (n > 0) return n === 1 ? "tomorrow" : `in ${n} days`; return n === -1 ? "yesterday" : `${-n} days ago`; }
// Folded sections: remembers what the reader opened or closed this visit, so re-renders keep it.
const FOLD = new Map();
const isOpen = (k, def) => FOLD.has(k) ? FOLD.get(k) : !!def;
function fold(key, sum, body, o = {}) {
  return `<details class="fold ${o.cls || ""}" data-keep="${esc(key)}"${o.id ? ` id="${esc(o.id)}"` : ""} ${o.attrs || ""} ${isOpen(key, o.open) ? "open" : ""}><summary>${sum}</summary><div class="fold-body">${body}</div></details>`;
}
const clampText = (html, style = "") => `<div class="clamp" style="${style}">${html}</div><button type="button" class="btn sm ghost more-btn" data-act="clamp">Show more</button>`;
// Short card name for tight spaces: drops the issuer prefix and words like "Rewards Credit Card".
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function shortName(c) {
  let n = String(c.name || ""); const iss = (c.issuer || "").trim();
  if (iss) n = n.replace(new RegExp("^" + reEsc(iss) + "\\s+", "i"), "");
  n = n.replace(/\s*\(.*?\)\s*/g, " ").replace(/\b(Rewards\s+)?Credit Card\b|\bCard\b|\bby Citi\b|\bRewards\b|\bVisa\b/gi, " ").replace(/\s+/g, " ").trim();
  return n || c.name || "";
}
const CAT_SHORT = { travel: "Travel", transit: "Transit", rotating: "Rotating 5%", rent: "Rent", online: "Online", drugstore: "Drugstores", other: "Everything else" };

// ---------- state ----------
function exampleState() {
  return {
    version: 2, examples: true,
    settings: { pointValues: { ...PROGRAMS } },
    profiles: [{ id: "me", name: "Me" }], activeProfile: "all",
    cards: [
      { id: uid(), example: true, name: "Sapphire Preferred", issuer: "Chase", network: "Visa", last4: "4417", kind: "personal", status: "open",
        color: "#1e3a5f", openDate: "2023-11-05", annualFee: 95, program: "Chase Ultimate Rewards", base: 1,
        mult: { dining: 3, travel: 2, streaming: 3, groceries: 3, online: 1 },
        sub: { amount: 75000, standard: 60000, promo: true, spendReq: 4000, spent: 4000, deadline: "2024-02-05", received: true, receivedDate: "2024-01-20" },
        credits: [{ id: uid(), name: "Hotel credit (Chase Travel)", value: 50, period: "annual", used: 50 }],
        perks: [{ label: "Primary rental car coverage", kind: "Travel protection" }, { label: "Trip delay reimbursement", kind: "Travel protection" }, { label: "No foreign transaction fees", kind: "Foreign transaction" }],
        perkValue: 30, downgradeTo: "Freedom Unlimited", reapplyMonths: 48, role: "rotating", strategy: "Example: bonus earned, so rotate. Ask for a retention offer; if under $50, product change to Freedom Unlimited to keep the points and the account age.", creditLimit: 15000, notes: "Example card. Verify current terms." },
      { id: uid(), example: true, name: "Gold Card", issuer: "American Express", network: "Amex", last4: "1009", kind: "personal", status: "open",
        color: "#7a5a1a", openDate: "2026-08-20", annualFee: 325, program: "Amex Membership Rewards", base: 1,
        mult: { dining: 4, groceries: 4, flights: 3 },
        sub: { amount: 100000, standard: 60000, promo: true, spendReq: 6000, spent: 3400, deadline: "2027-02-20", received: false, receivedDate: "" },
        credits: [{ id: uid(), name: "Dining credit", value: 120, period: "monthly", used: 20, log: [{ id: uid(), date: "2026-09-12", amount: 10, place: "Shake Shack", note: "Example entry" }, { id: uid(), date: "2026-10-03", amount: 10, place: "Grubhub order", note: "" }] },
          { id: uid(), name: "Uber Cash", value: 120, period: "monthly", used: 20, log: [] }, { id: uid(), name: "Resy credit", value: 100, period: "semiannual", used: 0, log: [] }],
        perks: [{ label: "Purchase protection", kind: "Purchase & return protection" }, { label: "No foreign transaction fees", kind: "Foreign transaction" }],
        perkValue: 0, downgradeTo: "Green or Everyday", reapplyMonths: 0, creditLimit: 0, notes: "Example card. Amex bonuses are typically once per lifetime." },
      { id: uid(), example: true, name: "Double Cash", issuer: "Citi", network: "Mastercard", last4: "7782", kind: "personal", status: "open",
        color: "#174f8a", openDate: "2019-06-01", annualFee: 0, program: "Cash back", base: 2, mult: {},
        sub: { amount: 0, standard: 0, promo: false, spendReq: 0, spent: 0, deadline: "", received: false, receivedDate: "" },
        credits: [], perks: [{ label: "Citi Entertainment presales", kind: "Other" }],
        perkValue: 0, downgradeTo: "", reapplyMonths: 0, creditLimit: 9000, notes: "Example card." }
    ],
    pulls: [{ id: uid(), example: true, date: "2026-08-18", bureau: "Experian", issuer: "American Express", note: "Gold Card application" }],
    research: [{ id: uid(), example: true, name: "Venture X", issuer: "Capital One", annualFee: 395, bonus: "75,000 miles", status: "considering", notes: "Example. Lounge access and a yearly travel credit could offset most of the fee." }],
    updatedAt: Date.now()
  };
}
function blankCard() {
  return { id: uid(), name: "", issuer: "", network: "Visa", last4: "", kind: "personal", status: "open", color: COLORS[0], openDate: iso(TODAY),
    annualFee: 0, program: "Cash back", base: 1, mult: {}, sub: { amount: 0, standard: 0, promo: false, spendReq: 0, spent: 0, deadline: "", received: false, receivedDate: "" },
    credits: [], perks: [], perkValue: 0, downgradeTo: "", reapplyMonths: 0, creditLimit: 0, notes: "", role: "keeper",
    owner: S && S.activeProfile !== "all" ? S.activeProfile : (S && S.profiles[0].id) || "me" };
}
let S = null;
// Fill in fields added after version 1 so older saves and backups keep working.
function normalize(st) {
  st.settings ||= { pointValues: { ...PROGRAMS } };
  if (!Array.isArray(st.profiles) || !st.profiles.length) st.profiles = [{ id: "me", name: "Me" }];
  if (st.activeProfile !== "all" && !st.profiles.some(p => p.id === st.activeProfile)) st.activeProfile = "all";
  const first = st.profiles[0].id, ok = id => st.profiles.some(p => p.id === id);
  st.cards ||= []; st.pulls ||= []; st.research ||= []; if (!Array.isArray(st.chat)) st.chat = [];
  for (const c of st.cards) {
    c.role ||= "keeper"; if (!ok(c.owner)) c.owner = first;
    if (c.status === "downgraded") { c.status = "open"; c.origin ||= "productChange"; }
    c.origin ||= "new";
    c.credits ||= []; for (const x of c.credits) { x.id ||= uid(); x.log ||= []; }
    c.perks ||= []; c.mult ||= {}; c.sub ||= { amount: 0, standard: 0, promo: false, spendReq: 0, spent: 0, deadline: "", received: false, receivedDate: "" };
  }
  for (const p of st.pulls) if (!ok(p.owner)) p.owner = first;
  // One-time: add the rent/mortgage category to existing cards (Bilt earns 1x, everything else 0x).
  if (!st.settings.rentAdded) {
    for (const c of st.cards) if (c.mult.rent == null || c.mult.rent === "") c.mult.rent = /bilt/i.test(`${c.issuer} ${c.name} ${c.program}`) ? 1 : 0;
    st.settings.rentAdded = true;
  }
  st.version = 2;
  return st;
}
const profName = id => (S.profiles.find(p => p.id === id) || { name: "?" }).name;
const multiPeople = () => S.profiles.length > 1;
// Cards and pulls for the person picked in the profile bar ("all" = everyone).
const VC = () => S.activeProfile === "all" ? S.cards : S.cards.filter(c => c.owner === S.activeProfile);
const VP = () => S.activeProfile === "all" ? S.pulls : S.pulls.filter(p => p.owner === S.activeProfile);
const viewPeople = () => S.activeProfile === "all" ? S.profiles : S.profiles.filter(p => p.id === S.activeProfile);

// ---------- persistence ----------
// shared/store.js: in the demo nothing outlives the page; approved members save to their account.
// timer: a save waiting its 300 ms; saving: the save in progress; deleting: "Delete my saved data"
// is running, so nothing may be saved (it would put the wallet back)
const P = { timer: null, saving: Promise.resolve(), deleting: false };
function setSaveState(kind, text) {
  const el = $("#saveState"); if (!el) return;
  el.innerHTML = `<span class="dot ${kind}"></span><span>${esc(text)}</span>`;
}
const saveLabel = () => store.mode === "demo" ? ["local", "Demo: changes aren't saved"] : ["ok", "Saved to your account"];
function persist() {
  S.updatedAt = Date.now();
  clearTimeout(P.timer);
  if (P.deleting) return;
  P.timer = setTimeout(() => { P.saving = store.setDoc("wallet", JSON.parse(JSON.stringify(S))).catch(err => console.error("Couldn't save", err)); }, 300);
  setSaveState(...saveLabel());
}
async function initStorage() {
  const catalog = (await (await fetch("/shared/data/cards.json")).json()).cards;
  CATALOG = catalog;
  // Approved members get their own wallet; everyone else gets the sample one
  demoBanner(document.getElementById("demoBanner"), "What's in My Wallet?", await connectStore("wallet"));
  if (store.mode === "demo") await store.reset({ docs: { wallet: walletDemo(catalog) } });
  S = normalize((await store.getDoc("wallet")) || {});
  render(); setSaveState(...saveLabel());
  await loadTravel(); render();
}

// ---------- travel profile (from Contrail's trips and stays) ----------
const CONTRAIL_URL = "/contrail/";
let TRAVEL = null;
async function loadTravel() {
  // Demo: Contrail's sample trips. Members: their own Contrail trips, if they're approved for
  // Contrail too (otherwise no travel profile).
  try {
    await loadAirports();
    const data = store.mode === "demo" ? contrailDemo(airport) : await readAppData("contrail");
    TRAVEL = data ? travelSummary(data.collections.trips.map(deriveTrip).filter(Boolean), data.collections.stays, data.docs.profile || {}) : null;
  } catch (e) { TRAVEL = null; }
}
// Compact version for Claude prompts.
function travelBrief() {
  const t = TRAVEL; if (!t) return null;
  const top = (a, n) => (a || []).slice(0, n);
  return { asOf: t.syncedAt || t.generatedAt, home: t.home, span: t.span, totals: t.totals,
    airlinesByFlights: top(t.airlines, 6), departureAirports: top(t.departureAirports, 6), destinations: top(t.destinations, 8), international: t.international,
    upcomingTrips: t.upcoming, hotelBrandsByNights: top(t.hotelBrands, 8), staysBookedThrough: top(t.stayBooking, 6),
    howFlightsWerePaid: top(t.flightPayment, 6), pointsRedeemed: top(t.pointsUsed, 8), paidBySomeoneElse: t.paidBySomeoneElse };
}
function travelFit() {
  const t = TRAVEL; if (!t) return [];
  const oc = openCards(), has = re => oc.filter(c => re.test(`${c.issuer} ${c.name}`)).map(c => c.name);
  const out = [];
  const air = (t.airlines || [])[0];
  if (air) { const held = has(new RegExp(air.name.split(" ")[0], "i")); out.push({ tone: held.length ? "good" : "warn", title: `${air.name} is your main airline (${air.flights} flights)`, text: held.length ? `You hold ${held.join(", ")}, which pairs with it.` : `No ${air.name} co-branded card in this view. Worth comparing against your transferable points cards.` }); }
  const hb = (t.hotelBrands || []).find(h => !/independent|airbnb|vrbo|vacation|other/i.test(h.brand));
  if (hb) { const held = has(new RegExp(hb.brand === "IHG" ? "ihg" : hb.brand, "i")); const total = (t.totals && t.totals.nights) || 0; out.push({ tone: held.length ? "good" : "", title: `${hb.brand} is your most-used hotel chain (${hb.nights} of ${total} nights)`, text: held.length ? `You hold ${held.join(", ")}.` : `That's a small share of your nights, so a hotel card only pays off if you plan more ${hb.brand} stays.` }); }
  const portals = (t.stayBooking || []).filter(b => /travel$/i.test(b.channel));
  for (const p of portals) { const iss = p.channel.replace(/ travel$/i, ""); const held = has(new RegExp(iss, "i")); out.push({ tone: held.length ? "good" : "warn", title: `${p.nights} hotel nights booked through ${p.channel}`, text: held.length ? `Covered by ${held.join(", ")}.` : `You don't hold a ${iss} card in this view.` }); }
  const lax = (t.departureAirports || [])[0];
  if (lax) { const lounge = oc.filter(c => (c.perks || []).some(p => p.kind === "Lounge access")).map(c => c.name); out.push({ tone: lounge.length ? "good" : "warn", title: `${lax.code} is where you fly from most (${lax.flights} departures)`, text: lounge.length ? `Lounge access from ${lounge.join(", ")}.` : "No card in this view lists lounge access." }); }
  return out;
}
function rankList(title, rows, label, val, unit) {
  if (!rows || !rows.length) return "";
  const max = Math.max(...rows.map(r => num(r[val])), 1);
  const rk = r => `<div class="rk"><span title="${esc(r[label])}">${esc(r[label])}</span><div class="bar"><i style="width:${Math.round(num(r[val]) / max * 100)}%"></i></div><b class="num">${esc(r[val])}</b></div>`;
  const head = rows.slice(0, 4), rest = rows.slice(4);
  return `<div class="panel"><div class="spread" style="margin-bottom:8px"><span class="eyebrow">${esc(title)}</span>${unit ? `<span class="note">${esc(unit)}</span>` : ""}</div><div class="rank">${head.map(rk).join("")}</div>${rest.length ? fold("rk-" + title, `${rest.length} more`, `<div class="rank">${rest.map(rk).join("")}</div>`, { cls: "mini" }) : ""}</div>`;
}
function vTravel() {
  const t = TRAVEL;
  if (!t) return `<div class="empty"><b>No travel profile yet.</b><br>It comes from the trips and stays in Contrail. Once there are some, research here weighs your airlines, airports, hotels and booking habits. <br><a href="${CONTRAIL_URL}">Open Contrail</a></div>`;
  const T = t.totals || {}, when = parseD(String(t.syncedAt || t.generatedAt || "").slice(0, 10));
  const fit = travelFit();
  return `<div class="section-head"><div><h2>Travel profile</h2><div class="muted">From your trips and stays in Contrail. Research uses this to judge airline, hotel and lounge fit.</div></div><a class="btn sm" href="${CONTRAIL_URL}">Open Contrail</a></div>
  <div class="stats">
    <div class="stat"><div class="eyebrow">Flights</div><div class="v">${pts(T.flights)}</div><div class="s">${pts(T.trips)} trips · ${esc(t.span || "")}</div></div>
    <div class="stat"><div class="eyebrow">Miles flown</div><div class="v">${pts(T.milesFlown)}</div><div class="s">${pts(T.internationalTrips)} international trips</div></div>
    <div class="stat"><div class="eyebrow">Hotel nights</div><div class="v">${pts(T.hotelNights)}</div><div class="s">${pts(T.rentalNights)} more in rentals · ${pts(T.stays)} stays</div></div>
    <div class="stat"><div class="eyebrow">Home airport</div><div class="v">${esc(String(t.home || "").split(" ")[0] || "—")}</div><div class="s">${esc(t.home || "")}</div></div>
    <div class="stat"><div class="eyebrow">Next trip</div><div class="v">${t.upcoming && t.upcoming[0] ? esc(fmtD(parseD(t.upcoming[0].start)).replace(/, \d{4}$/, "")) : "—"}</div><div class="s">${t.upcoming && t.upcoming[0] ? esc(t.upcoming[0].trip + " · " + t.upcoming[0].carrier) : "Nothing booked"}</div></div>
  </div>
  ${fit.length ? `<div style="margin-bottom:16px">${fold("tv-fit", `<h2>How your wallet fits your travel</h2><span class="sumr">${fit.filter(f => f.tone === "good").length ? `<span class="pill good">${fit.filter(f => f.tone === "good").length} covered</span>` : ""}${fit.filter(f => f.tone === "warn").length ? `<span class="pill warn">${fit.filter(f => f.tone === "warn").length} gaps</span>` : ""}</span>`,
    `${fit.map(f => `<div class="advice ${f.tone}" style="margin-top:8px"><b>${esc(f.title)}.</b> ${esc(f.text)}</div>`).join("")}
    <div class="row" style="margin-top:12px"><button class="btn sm primary" data-act="travel-ask">Ask Claude what card fits how I travel</button></div>`, { cls: "panel" })}</div>` : ""}
  <div class="travelgrid">
    ${rankList("Airlines", t.airlines, "name", "flights", "Flights")}
    ${rankList("Departure airports", t.departureAirports, "code", "flights", "Departures")}
    ${rankList("Destinations", t.destinations, "place", "trips", "Trips")}
    ${rankList("Hotel brands", t.hotelBrands, "brand", "nights", "Nights")}
    ${rankList("How stays were booked", t.stayBooking, "channel", "nights", "Nights")}
    ${rankList("How flights were paid", t.flightPayment, "method", "trips", "Trips with payment recorded")}
  </div>
  <div class="two" style="margin-top:16px">
    <div class="panel"><h2 style="margin-bottom:8px">Upcoming trips</h2>${(t.upcoming || []).length ? `<div class="list">${t.upcoming.map(u => `<div class="li"><div class="when">${esc(fmtD(parseD(u.start)).replace(/, \d{4}$/, ""))}</div><div><b>${esc(u.trip)}</b> <span class="note">${esc(u.route)}</span></div><span class="pill">${esc(u.carrier)}</span></div>`).join("")}</div>` : `<p class="muted">Nothing booked.</p>`}</div>
    ${fold("tv-points", `<h2>Points redeemed for travel</h2><span class="sumr"><span class="pill">${(t.pointsUsed || []).length} redemptions</span><span class="num note">${pts((t.pointsUsed || []).reduce((a, p) => a + num(p.points), 0))} pts</span></span>`,
      `${(t.pointsUsed || []).length ? `<div class="list">${t.pointsUsed.map(p => `<div class="spread" style="padding:6px 0;border-top:1px solid var(--line)"><span>${esc(p.for)}</span><span class="num">${pts(p.points)} <span class="note">${esc(p.program)}</span></span></div>`).join("")}</div>` : `<p class="muted">None recorded.</p>`}
      ${(t.paidBySomeoneElse || []).length ? `<p class="note" style="margin-bottom:0">Paid by someone else: ${esc(t.paidBySomeoneElse.join("; "))}</p>` : ""}`, { cls: "panel" })}
  </div>
  <p class="note">Edit trips, stays and payments in Contrail. Changes there show up here.</p>`;
}

// ---------- Claude ----------
let samplePromise = null;
function getSample() { return Promise.resolve(null); } // Phase 3: shared/ai.js, for approved users
function sampleErr(e) {
  const c = e && e.code;
  if (c === "not_granted") return "Claude access was declined for this page. Reload the page to be asked again.";
  if (c === "rate_limited") return "Too many questions at once. Wait a minute and try again.";
  if (c === "invalid_json") return "Claude's answer didn't come back in the expected format. Try again or rephrase.";
  if (c === "cancelled") return "Stopped.";
  if (c === "session_expired") return "Your session expired. Reload the page.";
  return "Claude couldn't answer just now. Try again in a moment.";
}

// ---------- derived ----------
const cpp = c => (S.settings.pointValues[c.program] ?? PROGRAMS[c.program] ?? 1);
// Rent/mortgage defaults to 0x when blank: most cards can't pay it without a fee.
const blankRate = (c, cat) => cat === "rent" ? 0 : num(c.base || 1);
const multOf = (c, cat) => (c.mult && c.mult[cat] != null && c.mult[cat] !== "") ? num(c.mult[cat]) : blankRate(c, cat);
// "changed" = this card was product-changed into another card record, so the account lives on there.
const isGone = c => c.status === "closed" || c.status === "changed";
const openCards = () => VC().filter(c => !isGone(c));
// A renewal whose date has passed stays "open" for up to 60 days (fees often post a statement later)
// until it's marked handled, so the downgrade plan doesn't jump ahead a year before you've acted.
const PENDING_DAYS = 60;
function nextRenewal(c) {
  const o = parseD(c.openDate); if (!o) return null;
  const floor = new Date(TODAY.valueOf() - PENDING_DAYS * 86400000);
  let k = 1, r = addMonths(o, 12);
  while (r < floor) r = addMonths(o, 12 * ++k);
  if (r < TODAY && (num(c.annualFee) === 0 || c.renewalDone === iso(r))) r = addMonths(o, 12 * ++k);
  return r;
}
const renewalPending = c => { const r = nextRenewal(c); return !!r && r < TODAY && num(c.annualFee) > 0 && !isGone(c); };
const stepDone = (c, ren, key) => !!(c.planDone && (c.planDone[iso(ren)] || []).includes(key));
const creditTotals = c => (c.credits || []).reduce((a, x) => ({ value: a.value + num(x.value), used: a.used + Math.min(num(x.used), num(x.value)) }), { value: 0, used: 0 });
function fiveTwentyFour(pid) {
  const cutoff = addMonths(TODAY, -24);
  // A product change keeps the same account, so the record that was changed away is skipped when its successor is tracked.
  const hasSuccessor = c => c.status === "changed" && S.cards.some(n => n.owner === c.owner && n.origin === "productChange" && (n.fromId === c.id || (n.fromCard || "").trim().toLowerCase() === (c.name || "").trim().toLowerCase()));
  const list = S.cards.filter(c => c.owner === pid && c.kind === "personal" && !hasSuccessor(c) && parseD(c.openDate) && parseD(c.openDate) > cutoff)
    .map(c => ({ card: c, drop: addMonths(parseD(c.openDate), 24) })).sort((a, b) => a.drop - b.drop);
  return { count: list.length, list };
}
const downgradeFor = c => c.downgradeTo || suggestDowngrade(c);
function pointsTip(c) {
  const p = c.program || "";
  if (/Chase/.test(p)) return "Move Ultimate Rewards points to another Chase card that earns them (Freedom, Sapphire, Ink) before closing. A product change keeps them in place.";
  if (/Amex/.test(p)) return "If this is your only card earning Membership Rewards, closing it forfeits the points. Transfer or redeem them first, or keep another MR card open.";
  if (/Capital One/.test(p)) return "Capital One miles move only to another Capital One card you hold. Redeem or transfer them first if you're closing.";
  if (/Citi/.test(p)) return "Citi ThankYou points on a closed card expire after about 60 days. Combine them to another ThankYou card first.";
  if (/Hotel|Airline/.test(p)) return "Points already sit in your airline or hotel account, so closing the card doesn't lose them.";
  return "Cash back can disappear when an account closes. Redeem it before you cancel.";
}
function advise(c) {
  const fee = num(c.annualFee), o = parseD(c.openDate), ren = nextRenewal(c);
  const days = ren ? daysBetween(TODAY, ren) : null;
  const age = o ? monthsBetween(o, TODAY) : 0;
  const ct = creditTotals(c), value = ct.used + num(c.perkValue), net = fee - value;
  const extra = [];
  if (c.sub && c.sub.received && num(c.reapplyMonths) > 0 && c.sub.receivedDate) {
    const el = addMonths(parseD(c.sub.receivedDate), num(c.reapplyMonths));
    extra.push(el <= TODAY ? `Bonus rule clock has passed (${fmtMY(el)}), so a fresh bonus may be possible if you no longer hold the card.` : `Bonus eligible again around ${fmtMY(el)} under a ${c.reapplyMonths}-month rule.`);
  }
  if (c.status === "changed") return { verdict: "Product-changed", tone: "", text: `Changed to ${c.changedTo || "another card"}${c.closedDate ? " on " + fmtD(parseD(c.closedDate)) : ""}. The account, its age and history carry over. ` + extra.join(" "), days: null };
  if (isGone(c)) return { verdict: "Closed", tone: "", text: "Account closed. " + extra.join(" "), days: null };
  if (fee === 0) return { verdict: "Keep", tone: "good", days, text: "No annual fee. Keep it open for credit age and utilization, and put a small charge on it every few months so it isn't closed for inactivity." };
  const timing = days != null && days < 0 ? ` The renewal date passed ${relDays(days)}${c.feePosted === iso(ren) ? " and the fee has posted, so act inside the refund window." : " but the fee hasn't posted yet, so this is the time to call."}` : days != null && days <= 45 ? ` Renewal is ${relDays(days)}, so act now.` : "";
  const ageTxt = `${age} month${age === 1 ? "" : "s"}`;
  if (age < 12) return { verdict: "Hold", tone: "", days, text: `Still in the first cardmember year (${ageTxt} in). Closing or downgrading before 12 months can trigger a bonus clawback, and most issuers won't product change before then. ${c.role === "rotating" ? "The rotation plan below starts about 45 days before the fee." : "Revisit about a month before renewal."}${timing}` };
  if (c.role === "rotating") {
    const dg = downgradeFor(c);
    if (net <= 0) return { verdict: "Keep this year", tone: "good", days, text: `Marked as a rotating card, but it still returned about ${money(value)} against the ${money(fee)} fee. Keeping it one more year is reasonable; re-check next renewal.${timing} ${extra.join(" ")}` };
    if (dg) return { verdict: "Rotate: downgrade", tone: "warn", days, text: `Net cost about ${money(net)}. Ask for a retention offer, and if it doesn't cover the gap, product change to ${dg} before the fee posts.${timing} ${extra.join(" ")}` };
    return { verdict: "Rotate: cancel", tone: "bad", days, text: `Net cost about ${money(net)} and no downgrade path known. Ask for retention; otherwise cancel within the refund window after the fee posts.${timing} ${extra.join(" ")}` };
  }
  if (net <= 0) return { verdict: "Keep", tone: "good", days, text: `You got about ${money(value)} of value against a ${money(fee)} fee. Worth renewing.${timing} ${extra.join(" ")}` };
  if (net <= fee * 0.35) return { verdict: "Ask for retention", tone: "warn", days, text: `Close call: net cost about ${money(net)} after ${money(value)} of value. Call before the fee posts and ask for a retention offer; keep the card if the offer covers the gap.${timing} ${extra.join(" ")}` };
  if (c.downgradeTo) return { verdict: "Downgrade", tone: "warn", days, text: `Net cost about ${money(net)}. Ask for a retention offer first. If there's nothing good, product change to ${c.downgradeTo} to keep the credit line and account age.${timing} ${extra.join(" ")}` };
  return { verdict: "Cancel or switch", tone: "bad", days, text: `Net cost about ${money(net)} and no downgrade option saved. Ask for retention; if nothing, many issuers refund the fee when you close within about 30 days after it posts (check your terms). Closing lowers available credit, so watch utilization.${timing} ${extra.join(" ")}` };
}
// Dated steps for a rotating card's next renewal.
function rotationPlan(c) {
  const ren = nextRenewal(c); if (!ren || isGone(c) || num(c.annualFee) === 0) return null;
  const dg = downgradeFor(c), a = advise(c);
  const d = n => new Date(ren.valueOf() + n * 86400000);
  const firstAnniv = monthsBetween(parseD(c.openDate), ren) <= 12;
  const pcDay = firstAnniv ? 3 : -14, wait = firstAnniv ? " This is the first anniversary, so wait until the account is a full year old (most issuers require that). The fee may post first; a downgrade inside the refund window usually gets it back." : "";
  const steps = [
    { date: d(-45), title: "Clear out points and credits", body: pointsTip(c) + " Use any statement credits left for this cardmember year." },
    { date: d(-30), title: "Call for a retention offer", body: `Call the number on the back of the card (or use secure chat) and ask what offers are on the account. Accept if it covers the gap between the ${money(c.annualFee)} fee and what you actually use.` },
    dg ? { date: d(pcDay), title: `Product change to ${dg}`, body: "Ask for a product change rather than a cancellation. It keeps the account, its age and credit line, with no hard pull and no new bonus. Confirm the new card's fee and that your points stay put." + wait }
       : { date: d(pcDay), title: "Pick your exit", body: "No downgrade path is saved for this card. Ask the rep which no-fee products you can switch to; if there are none, plan to cancel after the fee posts." },
    { date: d(30), title: "Refund window closes (about)", body: "If the fee posts before you act, most issuers refund it when you downgrade or close within about 30 days of the statement. Check your card's terms for the exact window." }
  ];
  if (c.sub && c.sub.received && c.sub.receivedDate && num(c.reapplyMonths)) {
    const e = addMonths(parseD(c.sub.receivedDate), num(c.reapplyMonths));
    steps.push({ date: e, title: "Bonus clock resets", body: `Around now you may qualify for this card's bonus again under its ${c.reapplyMonths}-month rule, if you no longer hold it and pass other issuer rules (like Chase 5/24).` });
  }
  steps.sort((x, y) => x.date - y.date);
  return { ren, dg, verdict: a, steps };
}
function events() {
  const ev = [], horizon = addMonths(TODAY, 12), tag = c => multiPeople() && S.activeProfile === "all" ? ` (${profName(c.owner)})` : "";
  for (const c of VC()) {
    if (isGone(c)) continue;
    const r = nextRenewal(c);
    if (r && num(c.annualFee) > 0 && r <= horizon && c.feePosted !== iso(r)) ev.push({ date: r, ren: iso(r), kind: "renew", card: c, text: `${c.issuer} ${c.name} annual fee ${money(c.annualFee)}${tag(c)}`, tone: "warn", act: r < TODAY ? `Annual fee ${money(c.annualFee)} due, not posted yet` : `Annual fee ${money(c.annualFee)} posts` });
    if (c.role === "rotating" && monthsBetween(parseD(c.openDate), r || TODAY) >= 12) {
      const plan = rotationPlan(c);
      if (plan) for (const s of plan.steps) if (s.date <= horizon && s.title !== "Bonus clock resets" && !stepDone(c, plan.ren, s.title)) ev.push({ date: s.date, ren: iso(plan.ren), step: s.title, kind: "rotate", card: c, text: `${c.name}: ${s.title}${tag(c)}`, tone: "accent", act: s.title });
    } else if (r && num(c.annualFee) > 0) { const call = addMonths(r, -1); if (call <= horizon && !stepDone(c, r, "call") && (call >= TODAY || r >= addMonths(TODAY, -2))) ev.push({ date: call, ren: iso(r), step: "call", kind: "call", card: c, text: `Decide on ${c.name}: ${advise(c).verdict.toLowerCase()}${tag(c)}`, tone: "", act: `Call and decide: ${advise(c).verdict.toLowerCase()}` }); }
    const sd = parseD(c.sub && c.sub.deadline);
    if (sd && !c.sub.received && sd >= TODAY) ev.push({ date: sd, kind: "sub", card: c, text: `${c.name} bonus spend deadline (${money(Math.max(0, num(c.sub.spendReq) - num(c.sub.spent)))} left)${tag(c)}`, tone: "bad", act: `Bonus spend deadline · ${money(Math.max(0, num(c.sub.spendReq) - num(c.sub.spent)))} left` });
    if (c.sub && c.sub.received && c.sub.receivedDate && num(c.reapplyMonths)) { const e = addMonths(parseD(c.sub.receivedDate), num(c.reapplyMonths)); if (e >= TODAY && e <= horizon) ev.push({ date: e, kind: "elig", card: c, text: `${c.name} bonus clock resets${tag(c)}`, tone: "good", act: "Bonus clock resets" }); }
  }
  for (const p of viewPeople()) for (const x of fiveTwentyFour(p.id).list) if (x.drop >= TODAY && x.drop <= horizon) ev.push({ date: x.drop, kind: "524", card: x.card, text: `${x.card.name} drops off ${multiPeople() ? profName(p.id) + "'s" : "your"} 5/24 count`, tone: "good", act: `Drops off ${multiPeople() && profName(p.id) !== "Me" ? profName(p.id) + "'s" : "your"} 5/24 count` });
  return ev.sort((a, b) => a.date - b.date);
}

// ---------- rendering ----------
let tab = "overview";
try { const h = location.hash.slice(1); if (TABS.some(t => t[0] === h)) tab = h; } catch {}
function renderTabs() {
  $("#tabs").innerHTML = TABS.map(([k, l, e]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}"><span class="emoji" aria-hidden="true">${e}</span>${l}</button>`).join("");
  // Keep the active tab in view when the row scrolls sideways, without moving the page
  const bar = $("#tabs"), on = bar.querySelector("[aria-selected=true]");
  if (on && (on.offsetLeft < bar.scrollLeft || on.offsetLeft + on.offsetWidth > bar.scrollLeft + bar.clientWidth - 24)) bar.scrollLeft = on.offsetLeft - 8;
}
function renderProfiles() {
  const opts = (multiPeople() ? [["all", "Everyone"]] : []).concat(S.profiles.map(p => [p.id, p.name]));
  const cur = multiPeople() ? S.activeProfile : S.profiles[0].id;
  $("#profileBar").innerHTML = `<span class="lbl">Cards for</span>` + opts.map(([id, n]) => `<button data-profile="${esc(id)}" aria-pressed="${cur === id}">${esc(n)}</button>`).join("") + `<button data-act="add-profile" class="btn ghost sm">+ Add person</button>`;
}
function render() {
  if (!multiPeople()) S.activeProfile = "all";
  renderProfiles();
  renderTabs();
  const v = $("#view");
  v.innerHTML = ({ overview: vOverview, cards: vCards, matrix: vMatrix, perks: vPerks, timeline: vTimeline, travel: vTravel, research: vResearch, data: vData })[tab]();
  if (tab === "research") wireResearch();
  aiOff();
  try { document.documentElement.style.setProperty("--tabs-h", $("nav.tabs").offsetHeight + "px"); document.body.classList.toggle("on-tl", tab === "timeline"); } catch {}
  if (tab === "timeline") { const w = $(".tl-wrap"), svg = w && w.querySelector("svg[data-today]"); if (svg && svg.scrollWidth > w.clientWidth) w.scrollLeft = Math.max(0, +svg.dataset.today - w.clientWidth / 2); }
}
function exampleBanner() {
  if (!VC().some(c => c.example) && !S.research.some(r => r.example) && !S.pulls.some(p => p.example)) return "";
  return `<div class="panel spread" style="margin-bottom:16px;background:var(--accent-soft);border-color:transparent">
    <div><b>These are example cards.</b> <span class="muted">Add your own, then clear the examples. Terms on examples may be out of date.</span></div>
    <div class="row"><button class="btn sm" data-act="add">+ Add my first card</button><button class="btn sm" data-act="clear-examples">Clear examples</button></div></div>`;
}
function vOverview() {
  const oc = openCards(), fees = oc.reduce((a, c) => a + num(c.annualFee), 0);
  const ct = oc.reduce((a, c) => { const t = creditTotals(c); return { v: a.v + t.value, u: a.u + t.used }; }, { v: 0, u: 0 });
  const ppl = viewPeople().map(p => ({ p, f: fiveTwentyFour(p.id) })), evAll = events().slice(0, 10), ev = evAll.slice(0, 5), evMore = evAll.slice(5);
  const subs = oc.filter(c => c.sub && num(c.sub.amount) > 0 && !c.sub.received);
  const limit = oc.reduce((a, c) => a + num(c.creditLimit), 0);
  const nextRen = events().find(e => e.kind === "renew" && e.date >= TODAY);
  return exampleBanner() + `
  <div class="stats">
    <div class="stat"><div class="eyebrow">Open cards</div><div class="v">${oc.length}</div><div class="s">${VC().length - oc.length} closed or changed</div></div>
    <div class="stat"><div class="eyebrow">Annual fees</div><div class="v">${money(fees)}</div><div class="s">${money(ct.u)} of ${money(ct.v)} credits used</div></div>
    <div class="stat"><div class="eyebrow">Chase 5/24</div>${ppl.length === 1 ? `<div class="v">${ppl[0].f.count}/5</div><div class="s">${ppl[0].f.count >= 5 ? "Over the line for Chase" : `${5 - ppl[0].f.count} new personal card${5 - ppl[0].f.count === 1 ? "" : "s"} of room`}</div>` : `<div class="v">${ppl.map(x => x.f.count).join(" · ")}</div><div class="s">${ppl.map(x => esc(x.p.name) + " " + x.f.count + "/5").join(" · ")}</div>`}</div>
    <div class="stat"><div class="eyebrow">Next fee</div><div class="v">${nextRen ? esc(fmtD(nextRen.date).replace(/, \d{4}$/, "")) : "—"}</div><div class="s">${nextRen ? esc(nextRen.card.name) + " · " + relDays(daysBetween(TODAY, nextRen.date)) : "No fees in the next year"}</div></div>
    <div class="stat"><div class="eyebrow">Total credit line</div><div class="v">${limit ? money(limit) : "—"}</div><div class="s">Across open cards</div></div>
  </div>
  <div class="two">
    <div class="panel"><div class="section-head"><h2>Coming up</h2><button class="btn sm ghost" data-goto="timeline">Full timeline →</button></div>
      ${ev.length ? `<div class="list">${ev.map(evRow).join("")}</div>${evMore.length ? fold("ov-more", `${evMore.length} more`, `<div class="list">${evMore.map(evRow).join("")}</div>`, { cls: "mini" }) : ""}` : `<div class="empty">Nothing in the next 12 months.</div>`}</div>
    <div class="stack">
      <div class="panel"><h2 style="margin-bottom:12px">Sign-up bonuses in progress</h2>
        ${subs.length ? subs.map(subProgress).join("") : `<p class="muted" style="margin:0">No open bonus spend right now.</p>`}</div>
      ${fold("ov-best", `<h2>Best card by category</h2><span class="sumr note">${CATS.length} categories</span>`, bestList(), { cls: "panel" })}
    </div>
  </div>`;
}
function evRow(e) {
  const d = daysBetween(TODAY, e.date);
  const tag = { renew: "Fee", call: "Decide", rotate: "Rotate", sub: "Bonus", elig: "Bonus", "524": "5/24" }[e.kind];
  return `<div class="li"><div class="when">${esc(fmtD(e.date).replace(/, \d{4}$/, ""))}<br><span class="faint">${esc(relDays(d))}</span></div><div>${esc(e.text)}</div><span class="pill ${e.tone}">${tag}</span></div>`;
}
function subProgress(c) {
  const s = c.sub, pct = s.spendReq ? Math.min(100, num(s.spent) / num(s.spendReq) * 100) : 0;
  const d = parseD(s.deadline), left = d ? daysBetween(TODAY, d) : null, need = Math.max(0, num(s.spendReq) - num(s.spent));
  const perDay = left > 0 ? need / left : 0;
  return `<div style="display:grid;gap:6px;margin-bottom:14px">
    <div class="spread"><b>${esc(c.name)}</b><span class="num">${pts(s.amount)} pts ${s.promo ? `<span class="pill accent">promo</span>` : ""}</span></div>
    <div class="bar ${pct >= 100 ? "good" : ""}"><i style="width:${pct}%"></i></div>
    <div class="spread note"><span class="num">${money(s.spent)} / ${money(s.spendReq)}</span><span>${left == null ? "No deadline set" : left < 0 ? "Deadline passed" : `${money(need)} to go · ${left} days · about ${money(perDay * 30)}/mo`}</span></div>
    <div class="row"><input type="number" class="used-in" placeholder="+ $" id="spend-${c.id}" aria-label="Add spend to ${esc(c.name)}"><button class="btn sm" data-act="add-spend" data-id="${c.id}">Log spend</button>${pct >= 100 ? `<button class="btn sm" data-act="sub-received" data-id="${c.id}">Mark bonus received</button>` : ""}</div></div>`;
}
function bestList() {
  const oc = openCards(); if (!oc.length) return `<p class="muted">Add a card to see this.</p>`;
  return `<div class="list">` + CATS.map(([k, l]) => {
    const best = oc.map(c => ({ c, r: multOf(c, k) * cpp(c) })).sort((a, b) => b.r - a.r)[0];
    if (best.r <= 0) return `<div class="spread" style="padding:5px 0;border-top:1px solid var(--line)"><span>${l}</span><span class="muted">No card earns here</span></div>`;
    return `<div class="spread" style="padding:5px 0;border-top:1px solid var(--line)"><span>${l}</span><span><span class="swatch" style="background:${esc(best.c.color)}"></span>${esc(best.c.name)} <span class="num muted">${best.r.toFixed(1)}%</span></span></div>`;
  }).join("") + `</div><p class="note" style="margin:8px 0 0">Return uses your point values from Settings.</p>`;
}
function vCards() {
  const sorted = [...VC()].sort((a, b) => (isGone(a)) - (isGone(b)) || (parseD(b.openDate) - parseD(a.openDate)));
  return exampleBanner() + `<div class="section-head"><div><h2>Your cards</h2><div class="muted">${openCards().length} open · open Details for multipliers, credits and strategy</div></div><div class="row"><button class="btn sm" data-act="cards-all" data-open="1">Expand all</button><button class="btn sm" data-act="cards-all" data-open="">Collapse all</button><button class="btn primary" data-act="add">+ Add card</button></div></div>
  ${sorted.length ? `<div class="wallet">${sorted.map(cardTile).join("")}</div>` : `<div class="empty">No cards yet. <button class="btn sm" data-act="add">Add your first card</button></div>`}`;
}
function cardTile(c) {
  const a = advise(c), ren = nextRenewal(c), ct = creditTotals(c);
  const top = CATS.map(([k, l]) => ({ k, l, m: multOf(c, k) })).filter(x => x.m > num(c.base || 1)).sort((x, y) => y.m - x.m).slice(0, 5);
  return `<article class="cc" style="${isGone(c) ? "opacity:.65" : ""}">
    <div class="plastic" style="--card-bg:${esc(c.color)}">
      <div class="tagrow">${c.example ? `<span class="pill">Example</span>` : ""}${multiPeople() ? `<span class="pill">${esc(profName(c.owner))}</span>` : ""}${num(c.annualFee) > 0 ? `<span class="pill">${c.role === "rotating" ? "Rotating" : "Keeper"}</span>` : ""}${c.kind === "business" ? `<span class="pill">Business</span>` : ""}${c.status !== "open" ? `<span class="pill">${c.status === "changed" ? "Changed" : esc(c.status)}</span>` : ""}${c.origin === "productChange" ? `<span class="pill">PC</span>` : ""}</div>
      <div><div class="issuer">${esc(c.issuer)}</div><div class="nm" title="${esc(c.name)}">${esc(shortName(c))}</div></div>
      <div class="chipm"></div>
      <div class="spread"><span class="emb">•••• ${esc(c.last4 || "0000")}</span><span class="issuer">${esc(c.network)}</span></div>
    </div>
    <div class="cc-body">
      <div class="kv" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><span>Fee</span><b>${money(c.annualFee)}</b></div><div><span>Renews</span><b>${isGone(c) ? "—" : esc(fmtMY(ren))}</b></div></div>
      ${fold("card-" + c.id, `Details<span class="sumr"><span class="pill ${a.tone}">${esc(a.verdict)}</span></span>`, `
      <div class="kv"><div><span>Opened</span><b>${esc(fmtMY(parseD(c.openDate)))}</b></div><div><span>Program</span><b style="font-family:var(--f-body);font-size:.84rem">${esc(c.program)}</b></div><div><span>Credits</span><b>${ct.value ? money(ct.used) + " / " + money(ct.value) : "—"}</b></div></div>
      <div class="note">${c.origin === "productChange" ? `Product change${c.fromCard ? " from " + esc(c.fromCard) : ""}${c.changeDate ? " · " + esc(fmtMY(parseD(c.changeDate))) : ""}` : "New application"}${c.status === "changed" ? ` · now ${esc(c.changedTo || "another card")}` : ""}${isGone(c) && c.closedDate ? ` · ended ${esc(fmtD(parseD(c.closedDate)))}` : ""}</div>
      <div class="multis">${top.map(x => `<span class="pill accent">${x.m}× ${esc(x.l)}</span>`).join("")}<span class="pill">${num(c.base)}× else</span></div>
      ${ct.value ? `<div class="bar good"><i style="width:${Math.min(100, ct.used / ct.value * 100)}%"></i></div>` : ""}
      ${c.sub && num(c.sub.amount) ? `<div class="note">Sign-up bonus: <span class="num">${pts(c.sub.amount)}</span> pts${c.sub.promo && num(c.sub.standard) ? ` (promo, usually ${pts(c.sub.standard)})` : ""} · ${c.sub.received ? "received" : "in progress"}</div>` : ""}
      <div class="advice ${a.tone}"><b>${esc(a.verdict)}.</b> ${esc(a.text)}</div>
      ${c.strategy ? `<div>${clampText(`<b>Your strategy:</b> ${esc(c.strategy)}`, "font-size:.86rem;color:var(--ink-2)")}</div>` : ""}`, { cls: "ccmore" })}
    </div>
    <div class="cc-foot"><button class="btn sm" data-act="edit" data-id="${c.id}">Edit</button></div>
  </article>`;
}
let matrixEdit = false, matrixMode = "pct";
function vMatrix() {
  const oc = openCards();
  if (!oc.length) return `<div class="empty">Add a card to build your multiplier matrix.</div>`;
  const showOwner = multiPeople() && S.activeProfile === "all";
  const rows = CATS.map(([k, l]) => {
    const vals = oc.map(c => ({ c, m: multOf(c, k), r: multOf(c, k) * cpp(c) }));
    const best = Math.max(...vals.map(v => v.r));
    return `<tr><th scope="row" class="cat" title="${esc(l)}">${esc(CAT_SHORT[k] || l)}</th>${vals.map(v => `<td class="c ${!matrixEdit && best > 0 && v.r === best ? "best" : ""} ${!matrixEdit && v.m === 0 ? "zero" : ""}" title="${esc(shortName(v.c))} · ${esc(l)}: ${v.m}× = ${v.r.toFixed(1)}%">${matrixEdit
      ? `<input type="number" step="0.5" min="0" value="${c_val(v.c, k)}" placeholder="${blankRate(v.c, k)}" data-mx="${v.c.id}" data-cat="${k}" aria-label="${esc(v.c.name)} ${l}">`
      : v.m === 0 ? "—" : (matrixMode === "pct" ? `${v.r.toFixed(1)}%` : `${v.m}×`)}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="section-head"><div><h2>Multipliers</h2><div class="muted">Outlined = best card for that category. ${matrixMode === "pct" ? "Return % = multiplier × your point value." : "Points per dollar."} Hover a cell for both.</div></div>
    <div class="row"><button class="btn sm ${matrixMode === "pct" ? "primary" : ""}" data-act="mx-mode" data-mode="pct">Return %</button><button class="btn sm ${matrixMode === "x" ? "primary" : ""}" data-act="mx-mode" data-mode="x">Multiplier</button><button class="btn sm" data-act="mx-edit">${matrixEdit ? "Done editing" : "Edit values"}</button></div></div>
  <div class="tscroll"><table class="matrix mx-fit"><thead><tr><th class="cat">Category</th>${oc.map(c => `<th class="cardh" title="${esc(fullName(c))} · ${esc(c.program)} · ${cpp(c)}¢ per point"><span class="swatch" style="background:${esc(c.color)}"></span>${esc(shortName(c))}${showOwner ? `<div class="own">${esc(profName(c.owner))}</div>` : ""}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
  ${matrixEdit ? `<p class="note">Leave a cell blank to use the card's base rate. Changes save as you type.</p>` : ""}
  <div style="margin-top:14px">${fold("mx-quick", `<h2>Quick reference</h2><span class="muted" style="font-size:.88rem">Which card to use for each category</span>`, quickRef(oc), { cls: "panel" })}</div>`;
}
// Quick reference: each category with the card(s) tied for the best return.
function quickRef(oc) {
  const showOwner = multiPeople() && S.activeProfile === "all";
  const items = CATS.map(([k, l]) => {
    const vals = oc.map(c => ({ c, m: multOf(c, k), r: multOf(c, k) * cpp(c) }));
    const top = Math.max(...vals.map(v => v.r));
    const best = top > 0 ? vals.filter(v => Math.abs(v.r - top) < 1e-9) : [];
    return `<div class="qr"><div class="qr-cat">${l}</div>${best.length ? `<div class="qr-cards">${best.map(v => `<span class="qr-card"><span class="swatch" style="background:${esc(v.c.color)}"></span>${esc(v.c.name)}${showOwner ? ` <span class="faint">· ${esc(profName(v.c.owner))}</span>` : ""}</span>`).join("")}</div><div class="qr-rate num">${best[0].m}× · ${top.toFixed(1)}%</div>` : `<div class="muted">No card earns here</div><div></div>`}</div>`;
  }).join("");
  return `<div class="qr-grid">${items}</div><p class="note" style="margin-bottom:0">Ties list every card that matches.</p>`;
}
const c_val = (c, k) => (c.mult && c.mult[k] != null && c.mult[k] !== "") ? c.mult[k] : "";
let openLog = null;
function vPerks() {
  const oc = openCards();
  const byKind = {};
  for (const g of mergePerks(oc)) (byKind[g.kind] ||= []).push(g);
  const credits = oc.flatMap(c => (c.credits || []).map(x => ({ c, x })));
  const tv = credits.reduce((a, r) => a + num(r.x.value), 0), tu = credits.reduce((a, r) => a + Math.min(num(r.x.used), num(r.x.value)), 0);
  const recent = credits.flatMap(({ c, x }) => (x.log || []).map(l => ({ c, x, l }))).sort((a, b) => (b.l.date || "").localeCompare(a.l.date || "")).slice(0, 8);
  // One folded row per card; open it to edit amounts and log use.
  const byCard = oc.filter(c => (c.credits || []).length);
  const creditRows = c => `<div class="tscroll"><table><thead><tr><th>Credit</th><th>Cadence</th><th style="text-align:right">Per year</th><th style="text-align:right">Used</th><th style="min-width:90px">Progress</th><th></th></tr></thead><tbody>
    ${c.credits.map(x => { const pct = num(x.value) ? Math.min(100, num(x.used) / num(x.value) * 100) : 0; const n = (x.log || []).length; return `<tr><td>${esc(x.name)}</td><td>${esc(PERIODS[x.period] || x.period)}</td><td class="num" style="text-align:right">${money(x.value)}</td>
      <td style="text-align:right"><input class="used-in" type="number" min="0" value="${num(x.used)}" data-credit="${x.id}" data-card="${c.id}" aria-label="Used of ${esc(x.name)}"></td><td><div class="bar good"><i style="width:${pct}%"></i></div></td>
      <td><button class="btn sm" data-act="toggle-log" data-id="${x.id}" aria-expanded="${openLog === x.id}">${openLog === x.id ? "Close" : n ? `Log (${n})` : "Log use"}</button></td></tr>
      ${openLog === x.id ? `<tr class="logrow"><td colspan="6">${logPanel(c, x)}</td></tr>` : ""}`; }).join("")}
  </tbody></table></div>`;
  const cardSum = c => { const t = creditTotals(c), pct = t.value ? Math.min(100, t.used / t.value * 100) : 0; return `<b><span class="swatch" style="background:${esc(c.color)}"></span>${esc(shortName(c))}</b>${multiPeople() ? `<span class="faint">${esc(profName(c.owner))}</span>` : ""}<span class="sumr"><span class="note">${c.credits.length} credit${c.credits.length === 1 ? "" : "s"}</span><span class="num" style="font-size:.88rem">${money(t.used)} / ${money(t.value)}</span><div class="bar good mbar"><i style="width:${pct}%"></i></div></span>`; };
  return `<div class="section-head"><div><h2>Statement credits</h2><div class="muted">Open a card to update amounts or log where you used a credit.</div></div><span class="pill ${tu >= tv * .8 ? "good" : "warn"}">${money(tu)} of ${money(tv)} captured</span></div>
  ${byCard.length ? `<div class="panel fold-list" style="margin-bottom:16px;padding-block:6px">${byCard.map(c => fold("cr-" + c.id, cardSum(c), creditRows(c))).join("")}</div>` : `<div class="empty" style="margin-bottom:16px">No statement credits on your open cards.</div>`}
  ${recent.length ? `<div style="margin-bottom:24px">${fold("cr-recent", `<h3>Recent credit use</h3><span class="sumr pill">${recent.length}</span>`, `<div class="loglist">${recent.map(({ c, x, l }) => `<div><span class="num note">${esc(l.date)}</span><span class="num">${money(l.amount)}</span><span>${esc(l.place || "—")} <span class="faint">· ${esc(x.name)}, ${esc(c.name)}</span>${l.note ? `<br><span class="note">${esc(l.note)}</span>` : ""}</span><span></span></div>`).join("")}</div>`, { cls: "panel" })}</div>` : ""}
  <div class="section-head"><h2>Perks across your wallet</h2><button class="btn sm ghost" data-act="reset-credits">Reset all credit usage for a new year</button></div>
  ${Object.keys(byKind).length ? `<div class="perkgrid" style="align-items:start">${PERK_KINDS.filter(k => byKind[k]).map(k => fold("pk-" + k, `<span class="eyebrow">${esc(k)}</span><span class="sumr pill">${byKind[k].length}</span>`, `<ul>${byKind[k].map(g => `<li><span>${esc(g.label)}${g.cards.length > 1 ? ` <span class="faint">· ${g.cards.length} cards</span>` : ""}</span><span class="holders">${g.cards.map(c => `<span class="pill"><span class="swatch" style="background:${esc(c.color)}"></span>${esc(shortName(c))}</span>`).join("")}</span></li>`).join("")}</ul>`, { cls: "panel" })).join("")}</div>` : `<div class="empty">Add perks to a card to see them here.</div>`}`;
}
// Merge the same perk listed on several cards ("No foreign transaction fees" vs "No FTF") into one row.
const PERK_STOP = new Set(["no", "the", "a", "an", "and", "of", "on", "for", "with", "to", "your", "card", "cardholder", "fee", "fees", "benefit", "benefits", "access", "complimentary", "free", "included", "insurance", "reimbursement", "coverage", "protection"]);
const PERK_ALIAS = { ftf: "foreign transaction", ftfs: "foreign transaction", pp: "priority pass", tsa: "tsa", "precheck/global": "precheck global" };
function perkTokens(label) {
  let t = String(label || "").toLowerCase().replace(/[’']/g, "");
  for (const [a, b] of Object.entries(PERK_ALIAS)) t = t.replace(new RegExp("\\b" + a + "\\b", "g"), b);
  return new Set(t.split(/[^a-z0-9]+/).filter(w => w && !PERK_STOP.has(w)).map(w => w.length > 3 ? w.replace(/(ies)$/, "y").replace(/s$/, "") : w));
}
function mergePerks(cards) {
  const groups = [];
  for (const c of cards) for (const p of (c.perks || [])) {
    if (!String(p.label || "").trim()) continue;
    const tk = perkTokens(p.label);
    const g = groups.find(g => { const inter = [...tk].filter(w => g.tokens.has(w)).length, uni = new Set([...tk, ...g.tokens]).size; return uni && (inter / uni >= 0.6 || (inter >= 2 && (inter === tk.size || inter === g.tokens.size))); });
    if (g) { if (!g.cards.includes(c)) g.cards.push(c); g.kinds.push(p.kind || "Other"); g.labels.push(p.label.trim()); }
    else groups.push({ tokens: tk, cards: [c], kinds: [p.kind || "Other"], labels: [p.label.trim()] });
  }
  for (const g of groups) {
    // Show the wording used most often; on a tie, the most descriptive one.
    const lc = {}; g.labels.forEach(l => lc[l] = (lc[l] || 0) + 1);
    g.label = Object.entries(lc).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    const n = {}; g.kinds.forEach(k => n[k] = (n[k] || 0) + 1); g.kind = Object.entries(n).sort((a, b) => b[1] - a[1])[0][0]; if (!PERK_KINDS.includes(g.kind)) g.kind = "Other"; }
  return groups.sort((a, b) => b.cards.length - a.cards.length || a.label.localeCompare(b.label));
}
function logPanel(c, x) {
  const log = [...(x.log || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<form class="logform" data-logform="${x.id}" data-card="${c.id}">
    <label class="f">Date<input type="date" name="date" value="${iso(TODAY)}" required></label>
    <label class="f">Amount ($)<input type="number" name="amount" min="0" step="0.01" required></label>
    <label class="f">Where<input type="text" name="place" placeholder="Restaurant, event, venue…" required></label>
    <label class="f">Note<input type="text" name="note" placeholder="Who you went with, game, etc."></label>
    <button class="btn sm primary" type="submit">Add</button></form>
  ${log.length ? `<div class="loglist">${log.map(l => `<div><span class="num note">${esc(l.date)}</span><span class="num">${money(l.amount)}</span><span>${esc(l.place)}${l.note ? ` <span class="note">· ${esc(l.note)}</span>` : ""}</span><button class="btn sm ghost" data-act="del-log" data-card="${c.id}" data-credit="${x.id}" data-id="${l.id}" aria-label="Remove entry">✕</button></div>`).join("")}</div>` : `<p class="note" style="margin:8px 0 0">Nothing logged yet for this credit.</p>`}`;
}
function rotationCard(c) {
  const plan = rotationPlan(c); if (!plan) return "";
  const nx = plan.steps.find(st => st.title !== "Bonus clock resets" && !stepDone(c, plan.ren, st.title));
  // Plans start folded; the summary line already shows the next step and date.
  const open = tlOpen.has(c.id);
  const ri = iso(plan.ren), posted = c.feePosted === ri, late = plan.ren < TODAY;
  const status = `<div class="renstat ${late ? "late" : ""}"><div><b>${late ? `Renewal ${esc(fmtD(plan.ren))} is still open.` : `Renewal ${esc(fmtD(plan.ren))}.`}</b> ${posted ? "Fee has posted. Downgrade or cancel inside the refund window to get it back." : late ? "Fee hasn't posted yet, so you can still call and downgrade before it does." : "Tick steps off as you do them."}</div>
    <div class="row"><button type="button" class="btn sm" data-act="fee-posted" data-id="${esc(c.id)}" data-ren="${ri}">${posted ? "Undo: fee not posted" : "Fee has posted"}</button><button type="button" class="btn sm primary" data-act="renewal-done" data-id="${esc(c.id)}" data-ren="${ri}">Renewal handled</button></div></div>`;
  return `<details class="panel rp" id="rp-${esc(c.id)}" data-plan="${esc(c.id)}" data-tlsec ${open ? "open" : ""}><summary><div class="spread"><div><h3><span class="chev" aria-hidden="true">▸</span>${esc(fullName(c))}${multiPeople() ? ` <span class="faint" style="font-weight:400">· ${esc(profName(c.owner))}</span>` : ""}</h3><div class="note">Fee ${money(c.annualFee)} renews ${esc(fmtD(plan.ren))} (${esc(relDays(daysBetween(TODAY, plan.ren)))})</div></div><span class="pill ${plan.verdict.tone}">${esc(plan.verdict.verdict)}</span></div>
    ${nx ? `<div class="nextline"><b>Next:</b> ${esc(nx.title.replace(/\s*\(.*$/, ""))} · <span class="num">${esc(fmtD(nx.date))}</span> <span class="${nx.date < TODAY ? "" : "faint"}" style="${nx.date < TODAY ? "color:var(--bad);font-weight:600" : ""}">(${nx.date < TODAY ? "overdue, " : ""}${esc(relDays(daysBetween(TODAY, nx.date)))})</span></div>` : `<div class="nextline"><b>All steps done.</b> Mark the renewal handled to move to next year.</div>`}</summary>
    ${c.strategy ? `<div class="script" style="margin-top:10px"><div class="clamp"><b>Your strategy:</b> ${esc(c.strategy)}</div><button type="button" class="btn sm ghost more-btn" data-act="clamp">Show more</button></div>` : ""}
    <div class="grid2" style="margin-top:10px"><div><div class="eyebrow">Downgrade to</div><div>${plan.dg ? esc(plan.dg) : "No known no-fee version"}${!c.downgradeTo && plan.dg ? ` <span class="note">(suggested)</span>` : ""}</div></div><div><div class="eyebrow">Or cancel</div><div>${plan.dg ? "Only if the product change isn't offered" : "Cancel within the refund window"}</div></div></div>
    ${status}
    <ol class="steps">${plan.steps.map(st => { const dn = stepDone(c, plan.ren, st.title), od = !dn && st.date < TODAY && st.title !== "Bonus clock resets"; return `<li class="${dn ? "done" : od ? "overdue" : ""}"><div class="when">${esc(fmtD(st.date))}<br><span class="${od ? "" : "faint"}">${od ? "overdue · " : ""}${esc(relDays(daysBetween(TODAY, st.date)))}</span></div><div><b>${esc(st.title)}</b><div style="font-size:.92rem">${esc(st.body)}</div></div>${st.title !== "Bonus clock resets" ? `<button type="button" class="btn sm" data-act="step-done" data-id="${esc(c.id)}" data-ren="${ri}" data-step="${esc(st.title)}" aria-pressed="${dn}">${dn ? "✓ Done" : "Mark done"}</button>` : "<span></span>"}</li>`; }).join("")}</ol>
    <details style="margin-top:8px"><summary class="btn sm ghost" style="display:inline-flex">What to say on the call</summary><div class="script" style="margin-top:8px">
      <div>“My annual fee is coming up and I'm deciding whether to keep the card. Are there any retention offers on my account?”</div>
      <div>If the offer is weak: “What cards can I product change to without a new credit check?${plan.dg ? ` I'm interested in the ${esc(plan.dg)}.` : ""}”</div>
      <div>Before agreeing, confirm: the account number and history stay the same, there's no hard pull, your points carry over, and whether the fee (if already posted) will be refunded.</div>
      <div>Then log the result in this card's notes, including any retention offer, so you have it next year.</div></div></details>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-act="ask-downgrade" data-id="${c.id}">Ask Claude for the best downgrade</button><span class="note" id="dg-${c.id}"></span></div>
  </details>`;
}
// Card picked in the Timeline filter (null = all cards); kept for this visit only.
let tlCard = null, tlZoom = "1y";
// Rotation plans the reader opened or closed this visit (others open when a step is within 90 days).
const tlOpen = new Set(), tlClosed = new Set(); let tlLaterOpen = false;
const AG_TONE = { warn: "var(--warn)", accent: "var(--accent)", bad: "var(--bad)", good: "var(--good)", "": "var(--ink-3)" };
function agendaHTML(ev) {
  const groups = [["Overdue or waiting on you", -9999, -1], ["Next 30 days", 0, 30], ["31 to 90 days", 31, 90], ["Later this year", 91, 400]];
  const target = e => e.kind === "524" ? "tl-524" : rotationPlanFor(e.card) ? "rp-" + e.card.id : (num(e.card.annualFee) > 0 && !isGone(e.card) ? "kp-" + e.card.id : "tl-chart");
  const doneBtn = e => e.kind === "renew" ? `<button type="button" class="btn sm" data-act="fee-posted" data-id="${esc(e.card.id)}" data-ren="${esc(e.ren)}">Fee posted</button>`
    : e.step ? `<button type="button" class="btn sm" data-act="step-done" data-id="${esc(e.card.id)}" data-ren="${esc(e.ren)}" data-step="${esc(e.step)}">Done</button>` : "";
  const item = e => { const d = daysBetween(TODAY, e.date); return `<div role="button" tabindex="0" class="ag ${d < 0 ? "late" : ""}" style="--c:${d < 0 ? "var(--bad)" : AG_TONE[e.tone] || AG_TONE[""]}" data-jump="${esc(target(e))}">
      <div class="dt"><span>${esc(e.date.toLocaleDateString("en-US", { month: "short" }))}</span><b>${e.date.getDate()}</b></div>
      <div><div class="what">${esc(String(e.act || e.text).replace(/\s*\(.*$/, ""))}</div><div class="sub"><span class="swatch" style="background:${esc(e.card.color)}"></span>${esc(e.card.issuer ? e.card.issuer + " " : "")}${esc(shortName(e.card))}${multiPeople() && S.activeProfile === "all" ? ` · ${esc(profName(e.card.owner))}` : ""}</div></div>
      <div class="in">${esc(relDays(d))}<small>${esc(e.date.getFullYear())}</small>${doneBtn(e)}</div></div>`; };
  let shown = 0;
  const out = groups.map(([t, a, b], gi) => { const list = ev.filter(e => { const d = daysBetween(TODAY, e.date); return d >= a && d <= b; }); if (!list.length) return "";
    const body = `<div class="ag-list">${list.map(item).join("")}</div>`;
    // Anything past 30 days folds when sooner items exist, so the page stays short.
    const folded = gi >= 2 && shown > 0; shown += list.length;
    return folded ? fold("ag-" + gi, `<h3>${t} <span class="pill">${list.length}</span></h3>`, body, { cls: "ag-group" }) : `<div class="ag-group"><h3>${t} <span class="pill">${list.length}</span></h3>${body}</div>`; }).join("");
  return out ? `<div class="agenda">${out}</div>` : `<div class="empty">Nothing to do in the next 12 months.</div>`;
}
const fullName = c => { const n = c.name || "", i = (c.issuer || "").trim(); return !i || n.toLowerCase().includes(i.toLowerCase()) ? n : i + " " + n; };
const rotationPlanFor = c => c.role === "rotating" && !isGone(c) && num(c.annualFee) > 0;
const tlMatch = c => !tlCard || c.id === tlCard;
function tlFilter() {
  const cards = [...VC()].sort((a, b) => isGone(a) - isGone(b) || (a.name || "").localeCompare(b.name || ""));
  const opt = c => `<option value="${esc(c.id)}" ${tlCard === c.id ? "selected" : ""}>${esc(c.issuer ? c.issuer + " " : "")}${esc(c.name)}${multiPeople() ? ` (${esc(profName(c.owner))})` : ""}${isGone(c) ? (c.status === "changed" ? " · changed" : " · closed") : ""}</option>`;
  return `<div class="row" style="margin-bottom:14px"><label class="f" for="tlSelect" style="flex-direction:row;display:flex;align-items:center;gap:8px"><span class="eyebrow">Show</span></label>
    <select id="tlSelect" style="width:auto;min-width:220px;max-width:100%"><option value="">All cards</option>${cards.map(opt).join("")}</select>
    ${tlCard ? `<button class="btn sm ghost" data-tlcard="">Clear</button>` : ""}</div>`;
}
function vTimeline() {
  if (tlCard && !VC().some(c => c.id === tlCard)) tlCard = null;
  const ev = events().filter(e => tlMatch(e.card));
  const pulls = [...VP()].sort((a, b) => parseD(b.date) - parseD(a.date));
  const yAgo = addMonths(TODAY, -12), y2 = addMonths(TODAY, -24);
  const focus = tlCard && S.cards.find(c => c.id === tlCard);
  const people = focus ? S.profiles.filter(p => p.id === focus.owner) : viewPeople();
  const bureauRows = people.flatMap(p => ["Experian", "Equifax", "TransUnion"].map(b => { const mine = S.pulls.filter(x => x.owner === p.id && x.bureau === b); return { who: p.name, b, n12: mine.filter(x => parseD(x.date) > yAgo).length, n24: mine.filter(x => parseD(x.date) > y2).length }; }));
  const rot = openCards().filter(tlMatch).filter(c => c.role === "rotating" && num(c.annualFee) > 0).sort((a, b) => nextRenewal(a) - nextRenewal(b));
  const keepers = focus ? (rot.length ? [] : [focus]) : openCards().filter(c => c.role !== "rotating" && num(c.annualFee) > 0);
  const nav = [["tl-actions", "Action plan", ev.filter(e => daysBetween(TODAY, e.date) <= 90).length], ["tl-chart", "Chart"], ["tl-plans", "Rotation plans", rot.length], ["tl-keepers", focus ? "Renewal advice" : "Keepers", focus ? 0 : keepers.length], ["tl-524", "5/24"], ["tl-pulls", "Credit pulls"]];
  return tlFilter() + `<nav class="tl-nav" aria-label="Timeline sections">${nav.map(([id, l, n]) => `<button type="button" data-jump="${id}">${l}${n ? `<span class="ct">${n}</span>` : ""}</button>`).join("")}</nav>
  <div class="panel" id="tl-actions" data-tlsec style="margin-bottom:16px"><div class="section-head"><div><h2>Action plan</h2><div class="muted">Soonest first. Tap an item for its full plan.</div></div></div>${agendaHTML(ev)}</div>
  <div style="margin-bottom:16px">${fold("tl-chart", `<h2>Card history chart</h2><span class="sumr note">${VC().filter(tlMatch).filter(c => !isGone(c)).length} open cards</span>`,
    `<div class="spread" style="margin-bottom:10px"><div class="muted" style="font-size:.88rem">Bars run from the open date. Markers show renewals, bonus deadlines and bonus clock resets; hover or tap one for its date.</div>
    <div class="profiles" role="group" aria-label="Timeline zoom"><span class="lbl">Zoom</span>${[["4m", "4 months"], ["1y", "1 year"], ["2y", "2 years"], ["fit", "All history"]].map(([k, l]) => `<button data-tlzoom="${k}" aria-pressed="${tlZoom === k}">${l}</button>`).join("")}</div></div>${timelineSvg()}`, { cls: "panel", id: "tl-chart", attrs: "data-tlsec" })}</div>
  <div class="section-head" id="tl-plans" data-tlsec><div><h2>Rotation plans</h2><div class="muted">Tap a card to see its dated steps and call script.</div></div></div>
  ${rot.length ? `<div class="stack" style="margin-bottom:16px">${rot.map(rotationCard).join("")}</div>` : focus ? `<p class="muted" style="margin:0 0 16px">${esc(focus.name)} isn't set as a rotating fee card, so there's no rotation plan. Its renewal advice is below.</p>` : `<div class="empty" style="margin-bottom:16px">No rotating cards yet. Edit a fee card and set its role to Rotating to get a plan here.</div>`}
  <div class="two">
    <div class="stack">
      <div class="panel" id="tl-keepers" data-tlsec><h2 style="margin-bottom:4px">${focus ? "Renewal advice" : "Long-term keepers"}</h2><div class="note" style="margin-bottom:6px">Tap a card for its advice and your strategy.</div>
        <div class="fold-list">${keepers.map(c => { const a = advise(c), pend = renewalPending(c); return fold("kp-" + c.id,
          `<b>${esc(shortName(c))}</b>${multiPeople() && S.activeProfile === "all" ? `<span class="faint">${esc(profName(c.owner))}</span>` : ""}<span class="sumr"><span class="note">${isGone(c) ? "Closed" : (pend ? "Was due " : "Renews ") + esc(fmtMY(nextRenewal(c)))}</span><span class="pill ${a.tone}">${esc(a.verdict)}</span></span>`,
          `<div class="note" style="margin-bottom:6px">${money(c.annualFee)} fee · ${c.downgradeTo ? "downgrade to " + esc(c.downgradeTo) : "no downgrade path saved"}</div><div style="font-size:.92rem">${esc(a.text)}</div>${c.strategy ? `<div style="margin-top:6px">${clampText(`<b>Your strategy:</b> ${esc(c.strategy)}`, "font-size:.86rem;color:var(--ink-2)")}</div>` : ""}${pend ? `<div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-act="fee-posted" data-id="${esc(c.id)}" data-ren="${iso(nextRenewal(c))}">${c.feePosted === iso(nextRenewal(c)) ? "Undo: fee not posted" : "Fee has posted"}</button><button type="button" class="btn sm primary" data-act="renewal-done" data-id="${esc(c.id)}" data-ren="${iso(nextRenewal(c))}">Renewal handled</button></div>` : ""}`,
          { id: "kp-" + c.id, attrs: "data-tlsec", open: pend }); }).join("") || `<p class="muted">No long-term fee cards.</p>`}</div>
        <p class="note" style="margin-bottom:0">Product change instead of closing when you can, to keep account age and credit line.</p></div>
    </div>
    <div class="stack">
      ${people.map((p, pi) => { const f = fiveTwentyFour(p.id); return fold("524-" + p.id, `<h2>${(people.length > 1 || multiPeople()) && p.name !== "Me" ? esc(p.name) + "'s 5/24" : "Your 5/24"}</h2><span class="sumr"><span class="pill ${f.count >= 5 ? "bad" : f.count >= 4 ? "warn" : "good"}">${f.count}/5</span></span>`,
        `<p class="note" style="margin-top:0">Personal cards opened in the last 24 months, from any issuer. Chase usually declines applicants at 5 or more. Authorized-user cards often count too.</p>
        ${f.list.length ? f.list.map(x => `<div class="spread" style="padding:5px 0;border-top:1px solid var(--line)"><span>${esc(x.card.name)}</span><span class="note">drops off ${esc(fmtD(x.drop))}</span></div>`).join("") : `<p class="muted" style="margin:0">No recent personal cards.</p>`}`,
        { cls: "panel", id: pi === 0 ? "tl-524" : "", attrs: pi === 0 ? "data-tlsec" : "" }); }).join("")}
      ${fold("tl-pulls", `<h2>Credit pulls</h2><span class="sumr"><span class="note">${pulls.filter(p => parseD(p.date) > yAgo).length} in 12 mo</span></span>`,
        `<div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="add-pull">+ Log pull</button></div>
        <div class="tscroll" style="margin-bottom:10px"><table><thead><tr>${people.length > 1 ? "<th>Person</th>" : ""}<th>Bureau</th><th>12 mo</th><th>24 mo</th></tr></thead><tbody>${bureauRows.map(b => `<tr>${people.length > 1 ? `<td>${esc(b.who)}</td>` : ""}<td>${b.b}</td><td class="num">${b.n12}</td><td class="num">${b.n24}</td></tr>`).join("")}</tbody></table></div>
        <div id="pullForm"></div>
        ${pulls.map(p => `<div class="spread" style="padding:6px 0;border-top:1px solid var(--line)"><span><span class="num note">${esc(p.date)}</span> ${esc(p.issuer)} <span class="faint">· ${esc(p.bureau)}${multiPeople() ? " · " + esc(profName(p.owner)) : ""}</span>${p.example ? ` <span class="pill">Example</span>` : ""}${p.note ? `<br><span class="note">${esc(p.note)}</span>` : ""}</span><button class="btn sm ghost" data-act="del-pull" data-id="${p.id}" aria-label="Remove pull">✕</button></div>`).join("")}`,
        { cls: "panel", id: "tl-pulls", attrs: "data-tlsec" })}
    </div>
  </div>`;
}
let tlShowClosed = false;
const tlCompact = () => window.innerWidth < 700;
let tlWasCompact = tlCompact();
window.addEventListener("resize", () => { const c = tlCompact(); if (c !== tlWasCompact) { tlWasCompact = c; if (tab === "timeline") render(); } });
// Phone layout: each card gets its own row with the name on top, a bar sized to the screen and its next dates in words.
function timelineCompact(cards, hidden) {
  const R = { "4m": [-1, 4], "1y": [-1, 12], "2y": [-6, 18] }[tlZoom];
  let start, end;
  if (R) { start = addMonths(TODAY, R[0]); end = addMonths(TODAY, R[1]); }
  else { start = new Date(Math.min(...cards.map(c => parseD(c.openDate))).valueOf()); start.setMonth(0, 1); end = new Date(TODAY.getFullYear() + 1, 11, 31); }
  const pct = d => Math.max(0, Math.min(100, (d - start) / (end - start) * 100)), inR = d => d && d >= start && d <= end;
  const months = Math.round((end - start) / (30.4 * 86400000)), step = months <= 6 ? 1 : months <= 14 ? 3 : months <= 26 ? 6 : 12;
  let scale = "";
  for (let m = new Date(start.getFullYear(), start.getMonth() + 1, 1); m <= end; m = addMonths(m, step)) {
    if (step >= 12 && m.getMonth() !== 0) { m = new Date(m.getFullYear() + 1, 0, 1); if (m > end) break; }
    const p = pct(m); if (p < 4 || p > 94) continue;
    scale += `<span style="left:${p}%">${step >= 12 ? m.getFullYear() : m.toLocaleDateString("en-US", { month: "short" }) + (m.getMonth() === 0 || step >= 6 ? " '" + String(m.getFullYear()).slice(2) : "")}</span>`;
  }
  const ev = events();
  const sh = d => esc(fmtD(d).replace(/, \d{4}$/, "")) + (d.getFullYear() !== TODAY.getFullYear() ? " '" + String(d.getFullYear()).slice(2) : "");
  const rows = cards.map(c => {
    const o = parseD(c.openDate), endBar = isGone(c) ? (parseD(c.closedDate) || TODAY) : end;
    let marks = "";
    const mk = (d, cls, title, style = "") => { if (inR(d)) marks += `<i class="${cls}" style="left:${pct(d)}%;${style}" title="${esc(title)}"></i>`; };
    let plan = null;
    if (c.role === "rotating" && !isGone(c)) plan = rotationPlan(c);
    if (num(c.annualFee) > 0 && !isGone(c)) for (let k = 1; k < 80; k++) { const r = addMonths(o, 12 * k); if (r > end) break; if (!(plan && iso(r) === iso(plan.ren))) mk(r, "m-fee", "Annual fee " + fmtD(r)); }
    if (plan) {
      const call = plan.steps.find(st => /retention/i.test(st.title)), pc = plan.steps.find(st => /^Product change|^Pick your exit/.test(st.title));
      if (inR(plan.steps[0].date) || inR(plan.ren)) marks = `<span class="win" style="left:${pct(plan.steps[0].date)}%;width:${pct(plan.ren) - pct(plan.steps[0].date)}%"></span>` + marks;
      if (call) mk(call.date, "m-call", "Call " + fmtD(call.date));
      if (pc) mk(pc.date, "m-pc", pc.title + " by " + fmtD(pc.date));
      mk(plan.ren, "m-feeR", "Annual fee " + fmtD(plan.ren));
    }
    const sd = parseD(c.sub && c.sub.deadline); if (sd && num(c.sub.amount)) mk(sd, "m-sub", "Bonus deadline " + fmtD(sd), `background:${c.sub.received ? "var(--good)" : "var(--bad)"}`);
    if (c.sub && c.sub.received && c.sub.receivedDate && num(c.reapplyMonths)) mk(addMonths(parseD(c.sub.receivedDate), num(c.reapplyMonths)), "m-reset", "Bonus clock resets");
    const mine = ev.filter(e => e.card === c && e.kind !== "524");
    const line = (e, lead) => { const d = daysBetween(TODAY, e.date); return `<b>${lead}</b> ${esc(String(e.act || e.text).replace(/\s*\(.*$/, ""))} · ${sh(e.date)} <span class="${d < 0 ? "late" : "faint"}">(${d < 0 ? "overdue, " : ""}${esc(relDays(d))})</span>`; };
    const next = mine[0] ? `<div>${line(mine[0], "Next:")}</div>${mine[1] ? `<div class="then">${line(mine[1], "Then:")}</div>` : ""}` : `<div class="faint">${isGone(c) ? (c.status === "changed" ? "Product-changed" : "Closed") + (c.closedDate ? " " + esc(fmtD(parseD(c.closedDate))) : "") : num(c.annualFee) ? "Nothing due in the next year" : "No annual fee · nothing to do"}</div>`;
    return `<div class="tlc-row" style="${isGone(c) ? "opacity:.6" : ""}"><div class="tlc-head"><b><span class="swatch" style="background:${esc(c.color)}"></span>${esc(fullName(c))}</b>${num(c.annualFee) ? `<span class="pill">${money(c.annualFee)}/yr</span>` : `<span class="pill good">No fee</span>`}</div>
      <div class="tlc-track"><span class="bar0" style="left:${pct(o)}%;width:${Math.max(1, pct(endBar) - pct(o))}%;background:${esc(c.color)};opacity:${isGone(c) ? .4 : .85}"></span>${inR(TODAY) ? `<span class="today" style="left:${pct(TODAY)}%" title="Today"></span>` : ""}${marks}</div>
      <div class="tlc-next">${next}</div></div>`;
  }).join("");
  return `<div class="tl-tools"><label class="chk"><input type="checkbox" data-tlclosed ${tlShowClosed ? "checked" : ""} ${tlCard ? "disabled" : ""}> Show closed cards${hidden && !tlShowClosed ? ` <span class="faint">(${hidden} hidden)</span>` : ""}</label></div>
  <div class="tlc"><div class="tlc-scale">${scale}${inR(TODAY) ? `<span style="left:${pct(TODAY)}%;color:var(--accent);font-weight:600">today</span>` : ""}</div>${rows}</div>
  <div class="legend"><span><i style="background:var(--surface);border:2px solid var(--warn)"></i>Annual fee</span><span><i style="background:var(--warn)"></i>Fee (rotating card)</span><span><i style="background:var(--accent);border-radius:0;clip-path:polygon(0 0,100% 0,50% 100%)"></i>Call</span><span><i style="background:var(--ink);border-radius:0"></i>Downgrade by</span><span><i style="background:var(--bad)"></i>Bonus deadline</span><span><i style="background:var(--accent);border-radius:1px;transform:rotate(45deg)"></i>Bonus clock resets</span></div>`;
}
function timelineSvg() {
  const all = [...VC()].filter(tlMatch).filter(c => parseD(c.openDate));
  const hidden = tlCard ? 0 : all.filter(isGone).length;
  const cards = all.filter(c => tlCard || tlShowClosed || !isGone(c)).sort((a, b) => isGone(a) - isGone(b) || parseD(a.openDate) - parseD(b.openDate));
  if (!cards.length) return `<div class="empty">Add cards to see the timeline.</div>`;
  if (tlCompact()) return timelineCompact(cards, hidden);
  // Zoom sets the visible range and pixels per year; "fit" shows all history (or two years when one card is picked).
  const lvl = tlZoom === "fit" ? (tlCard ? "2y" : "all") : tlZoom;
  const Z = { all: { px: 90 }, "2y": { px: 380, from: new Date(TODAY.getFullYear() - 1, 0, 1), to: new Date(TODAY.getFullYear() + 1, 11, 31) },
    "1y": { px: 1300, from: addMonths(TODAY, -3), to: addMonths(TODAY, 13) }, "4m": { px: 4400, from: addMonths(TODAY, -1), to: addMonths(TODAY, 4) } }[lvl];
  let start = new Date(Math.min(...cards.map(c => parseD(c.openDate))).valueOf()); start.setMonth(0, 1);
  let end = new Date(TODAY.getFullYear() + 1, 11, 31);
  if (Z.from) { start = Z.from; end = Z.to; }
  const zoom = Z.px >= 380, years = (end - start) / (365.25 * 86400000);
  const L = 210, W = Math.max(640, Math.round(Z.px * years)) + L, rowH = zoom ? 66 : 44, top = zoom ? 52 : 30, lbl = Z.px >= 1000;
  const H = top + cards.length * rowH + 10;
  const x = d => L + (d - start) / (end - start) * (W - L - 10);
  let labels = "";
  let g = "";
  if (zoom) for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = addMonths(m, 1)) {
    const xx = x(m); if (xx < L) continue;
    const every = Z.px >= 1000 ? 1 : 3;
    g += `<line class="grid" x1="${xx}" x2="${xx}" y1="${top - 6}" y2="${H}" opacity=".45"/>`;
    if (m.getMonth() % every === 0) g += `<text x="${xx + 3}" y="36" style="font-size:12px">${m.toLocaleDateString("en-US", { month: "short" })}${Z.px >= 4000 ? "" : ""}</text>`;
    if (Z.px >= 4000) for (const d of [8, 15, 22]) { const w = x(new Date(m.getFullYear(), m.getMonth(), d)); g += `<line class="grid" x1="${w}" x2="${w}" y1="${top - 2}" y2="${H}" opacity=".2"/><text x="${w + 2}" y="36" style="font-size:11px;opacity:.7">${d}</text>`; }
  }
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) { const xx = Math.max(L, x(new Date(y, 0, 1))); g += `<line class="grid" x1="${xx}" x2="${xx}" y1="${top - 6}" y2="${H}"/><text x="${xx + 4}" y="16" style="font-weight:600;fill:var(--ink)">${y}</text>`; }
  g += `<line class="today" x1="${x(TODAY)}" x2="${x(TODAY)}" y1="${top - 6}" y2="${H}"/><text x="${x(TODAY) + 4}" y="${H - 2}" style="fill:var(--accent)">today</text>`;
  cards.forEach((c, i) => {
    const y = top + i * rowH + rowH / 2, o = parseD(c.openDate);
    if (i % 2 === 0) { g = `<rect class="zebra" x="${L - 8}" y="${y - rowH / 2}" width="${W}" height="${rowH}"/>` + g; labels += `<rect class="zebra" x="0" y="${y - rowH / 2}" width="${L}" height="${rowH}"/>`; }
    labels += `<text class="lbl" x="12" y="${y + 5}"><title>${esc(c.issuer + " " + c.name)}</title>${esc(c.name.length > 24 ? c.name.slice(0, 23) + "…" : c.name)}</text>`;
    g += `<rect x="${Math.max(L - 8, x(o))}" y="${y - 7}" width="${Math.max(4, x(isGone(c) ? (parseD(c.closedDate) || TODAY) : end) - Math.max(L - 8, x(o)))}" height="14" rx="7" fill="${esc(c.color)}" opacity="${isGone(c) ? .35 : .85}"/>`;
    const cd = c.origin === "productChange" && parseD(c.changeDate); if (cd) g += `<line x1="${x(cd)}" x2="${x(cd)}" y1="${y - 10}" y2="${y + 10}" stroke="var(--ink)" stroke-width="2"><title>Product change from ${esc(c.fromCard || "previous card")} ${fmtD(cd)}</title></line>`;
    if (num(c.annualFee) > 0 && !isGone(c)) for (let k = 1; ; k++) { const r = addMonths(o, 12 * k); if (r > end) break; g += `<circle cx="${x(r)}" cy="${y}" r="6" fill="var(--surface)" stroke="var(--warn)" stroke-width="2.5"><title>Renewal ${fmtD(r)}</title></circle>`; if (lbl && c.role !== "rotating" && r >= start) g += `<text class="mk warn" x="${x(r)}" y="${y + 24}" text-anchor="middle">Fee ${esc(fmtD(r).replace(/, \d{4}$/, ""))}</text>`; }
    if (c.role === "rotating" && !isGone(c)) {
      const plan = rotationPlan(c);
      if (plan && plan.ren <= end) {
        const call = plan.steps.find(st => /retention/i.test(st.title)), pc = plan.steps.find(st => /^Product change|^Pick your exit/.test(st.title));
        const win0 = plan.steps[0].date;
        g += `<rect x="${x(win0)}" y="${y - 13}" width="${Math.max(3, x(plan.ren) - x(win0))}" height="4" rx="2" fill="var(--accent)" opacity=".75"><title>Rotation window ${fmtD(win0)} to ${fmtD(plan.ren)}</title></rect>`;
        if (call) g += `<path d="M ${x(call.date) - 7} ${y - 11} L ${x(call.date) + 7} ${y - 11} L ${x(call.date)} ${y - 1} Z" fill="var(--accent)" stroke="var(--surface)" stroke-width="1"><title>Call for retention or downgrade ${fmtD(call.date)}</title></path>`;
        if (pc) g += `<rect x="${x(pc.date) - 5}" y="${y - 5}" width="10" height="10" fill="var(--ink)" stroke="var(--surface)" stroke-width="1"><title>${esc(pc.title)} by ${fmtD(pc.date)}</title></rect>`;
        g += `<circle cx="${x(plan.ren)}" cy="${y}" r="7.5" fill="var(--warn)" stroke="var(--surface)" stroke-width="1.5"><title>Annual fee ${money(c.annualFee)} hits ${fmtD(plan.ren)}</title></circle>`;
        const sh = d => esc(fmtD(d).replace(/, \d{4}$/, ""));
        if (lbl) { if (call) g += `<text class="mk" x="${x(call.date)}" y="${y - 17}" text-anchor="middle" style="fill:var(--accent)">Call ${sh(call.date)}</text>`;
          g += `<text class="mk warn" x="${x(plan.ren)}" y="${y + 24}" text-anchor="end">Fee ${sh(plan.ren)}${c.feePosted === iso(plan.ren) ? " (posted)" : plan.ren < TODAY ? " (not posted)" : ""}</text>`;
          if (pc) g += `<text class="mk" x="${x(pc.date) + 8}" y="${y + 24}" text-anchor="start">${/^Product/.test(pc.title) ? "Downgrade by" : "Decide by"} ${sh(pc.date)}</text>`; }
        else if (zoom) g += `<text x="${Math.min(x(win0), W - 360)}" y="${y - 19}" style="fill:var(--accent);font-size:13px;font-weight:500">call ${sh(call ? call.date : plan.ren)} · fee ${sh(plan.ren)}</text>`;
      }
    }
    const sd = parseD(c.sub && c.sub.deadline); if (sd && num(c.sub.amount)) { g += `<circle cx="${x(sd)}" cy="${y}" r="6" fill="${c.sub.received ? "var(--good)" : "var(--bad)"}"><title>Bonus deadline ${fmtD(sd)}</title></circle>`; if (lbl && !c.sub.received && sd >= start) g += `<text class="mk bad" x="${x(sd)}" y="${y + 24}" text-anchor="middle">Bonus by ${esc(fmtD(sd).replace(/, \d{4}$/, ""))}</text>`; }
    if (c.sub && c.sub.received && c.sub.receivedDate && num(c.reapplyMonths)) { const e = addMonths(parseD(c.sub.receivedDate), num(c.reapplyMonths)); if (e <= end) g += `<rect x="${x(e) - 5}" y="${y - 5}" width="10" height="10" transform="rotate(45 ${x(e)} ${y})" fill="var(--accent)"><title>Bonus clock resets ${fmtD(e)}</title></rect>`; }
  });
  // Card names sit in their own column so they stay put while the dates scroll sideways.
  const PW = W - L + 8;
  return `<div class="tl-tools"><label class="chk"><input type="checkbox" data-tlclosed ${tlShowClosed ? "checked" : ""} ${tlCard ? "disabled" : ""}> Show closed and changed cards${hidden && !tlShowClosed ? ` <span class="faint">(${hidden} hidden)</span>` : ""}</label><span class="note">Scroll the chart sideways; card names stay in place.</span></div>
  <div class="tl-grid"><svg class="tl-svg tl-side" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" aria-hidden="true">${labels}</svg>
  <div class="tl-wrap"><svg class="tl-svg" width="${PW}" height="${H}" viewBox="${L - 8} 0 ${PW} ${H}" role="img" aria-label="Card history timeline" data-today="${x(TODAY) - (L - 8)}"><g>${g}</g></svg></div></div>
  <div class="legend"><span><i style="background:var(--surface);border:2px solid var(--warn)"></i>Annual fee</span><span><i style="background:var(--bad)"></i>Bonus deadline (open)</span><span><i style="background:var(--good)"></i>Bonus earned</span><span><i style="background:var(--accent);border-radius:1px;transform:rotate(45deg)"></i>Bonus clock resets</span><span><i style="background:var(--ink);width:3px;border-radius:0"></i>Product change</span><span><i style="background:var(--warn)"></i>Fee hits (rotating)</span><span><i style="background:var(--accent);border-radius:0;clip-path:polygon(0 0,100% 0,50% 100%)"></i>Call for retention or downgrade</span><span><i style="background:var(--ink);border-radius:0"></i>Downgrade by</span></div>`;
}

// research
let research = { busy: false, ctl: null, result: null, error: "", stream: "", question: "" };
// Research has two modes: one-shot card recommendations, or a back-and-forth chat (saved with your data).
let rxMode = (() => { try { return localStorage.getItem("hub-rx-mode") === "chat" ? "chat" : "recs"; } catch { return "recs"; } })();
let chat = { busy: false, ctl: null, draft: "", err: "" };
const CHAT_MAX = 40;
function setRxMode(m) { rxMode = m; try { localStorage.setItem("hub-rx-mode", m); } catch {} render(); if (m === "chat") setTimeout(() => { const q = $("#chatQ"); if (q) q.focus(); const box = $("#chatMsgs"); if (box) box.scrollTop = box.scrollHeight; }, 0); }
function mdLite(t) {
  const lines = esc(t).split(/\n/); let html = "", inList = false;
  for (const raw of lines) {
    const l = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const li = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (li) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    const h = l.match(/^#{1,4}\s+(.*)/); if (h) { html += `<h4>${h[1]}</h4>`; continue; }
    if (l.trim()) html += `<p>${l}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}
function chatMsgsHTML() {
  const m = S.chat || [];
  if (!m.length) return `<div class="hint empty" style="padding:18px;text-align:left"><b>Talk cards through with Claude.</b><br><span class="note">Ask anything, then follow up: "what about the annual fee?", "compare it with my Venture X", "what if I only fly United twice a year?" Claude sees your wallet${TRAVEL ? " and travel profile" : ""}.</span></div>`;
  return m.map(x => `<div class="cmsg ${x.role}">${x.role === "user" ? `<p>${esc(x.content)}</p>` : x.content ? mdLite(x.content) : `<p class="note">Thinking…</p>`}</div>`).join("") + (chat.err ? `<div class="cmsg err">${esc(chat.err)}</div>` : "");
}
function paintChat() { const box = $("#chatMsgs"); if (!box) return; const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80; box.innerHTML = chatMsgsHTML(); if (atEnd || chat.busy) box.scrollTop = box.scrollHeight; }
const CHAT_PRESETS = ["Should I keep my Sapphire Reserve after this year?", "Is the Amex Gold worth it for how I spend?", "What should my next card be, and why?", "Which of my cards should I use abroad?"];
function vChat() {
  const has = (S.chat || []).length;
  return `<div class="panel chatp"><div class="spread"><div><h2>Chat with Claude</h2><div class="muted">Go back and forth on card questions. Claude sees your wallet${TRAVEL ? " and travel profile" : ""}; the conversation is saved with your data.</div></div>
      ${has ? `<div class="row"><button class="btn sm" data-act="chat-to-recs" ${chat.busy ? "disabled" : ""}>Get card picks for this</button><button class="btn sm ghost" data-act="chat-new" ${chat.busy ? "disabled" : ""}>New conversation</button></div>` : ""}</div>
    <div class="cmsgs" id="chatMsgs" aria-live="polite">${chatMsgsHTML()}</div>
    ${has ? "" : `<div class="presets">${[...travelPresets(), ...CHAT_PRESETS].slice(0, 6).map(p => `<button data-chatpreset="${esc(p)}">${esc(p)}</button>`).join("")}</div>`}
    <form class="chatform" id="chatForm"><label class="sr" for="chatQ" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Message</label>
      <textarea id="chatQ" rows="2" maxlength="2000" placeholder="${has ? "Ask a follow-up…" : "Ask about a card, your wallet, a trip…"}">${esc(chat.draft)}</textarea>
      <div class="row"><span class="note" id="chatAvail" style="margin-right:auto">${matchMedia("(pointer: fine)").matches ? "Enter to send · Shift+Enter for a new line" : ""}</span>${chat.busy ? `<button type="button" class="btn" data-act="chat-stop">Stop</button>` : ""}<button type="submit" class="btn primary" ${chat.busy ? "disabled" : ""}>Send</button></div></form>
    <p class="note" style="margin:0">General information, not financial advice. Claude can't browse live offers, so check current terms with the issuer.</p></div>`;
}
function chatContext() {
  return `You are a friendly, sharp US credit card advisor inside the user's personal card tracker, having an ongoing conversation. Today is ${iso(TODAY)}.
Their wallet, people, 5/24 counts, point valuations (cents) and watchlist as JSON:\n${JSON.stringify(walletSummary())}
If the JSON includes "travel", it summarizes their real flights, airports, hotel stays and how they booked and paid; use it when relevant.
Guidelines: answer the latest message directly and conversationally; refer back to earlier turns when helpful; use their actual cards, fees and multipliers; mention issuer rules (Chase 5/24, Amex once-per-lifetime, Capital One limits, Citi 48-month) when they matter; keep it short (under about 200 words) with bullets only when they help; end with a brief follow-up question only when it would genuinely help. Your knowledge of offers may be dated, so say so briefly when quoting fees or bonuses. General information, not financial advice; never ask for card numbers, income or credit scores.`;
}
async function sendChat(text) {
  const q = String(text || "").trim(); if (!q || chat.busy) return;
  const sample = await getSample();
  if (!sample) { chat.err = AI_OFF; paintChat(); return; }
  S.chat ||= []; chat.err = ""; chat.draft = "";
  S.chat.push({ role: "user", content: q }); S.chat.push({ role: "assistant", content: "" });
  chat.busy = true; chat.ctl = new AbortController(); render();
  const hist = S.chat.slice(0, -1).slice(-20);
  // Fresh wallet context goes on the first turn sent, so it reflects any edits since the chat began.
  const turns = hist.map((m, i) => ({ role: m.role, content: i === 0 ? `${chatContext()}\n\n${m.role === "user" ? "User" : "Earlier reply"}: ${m.content}` : m.content }));
  if (turns[0].role !== "user") turns.unshift({ role: "user", content: chatContext() + "\n\n(Conversation so far follows.)" });
  const cur = S.chat[S.chat.length - 1];
  try {
    const r = await sample(turns, { modelTier: "default", signal: chat.ctl.signal, onText: ({ text }) => { cur.content = text; paintChat(); } });
    cur.content = (r && r.text) || cur.content || "";
  } catch (e) {
    if (!cur.content) S.chat.pop();
    chat.err = sampleErr(e);
  }
  if (S.chat.length > CHAT_MAX) S.chat = S.chat.slice(-CHAT_MAX);
  chat.busy = false; chat.ctl = null; persist();
  if (tab === "research") { render(); setTimeout(() => { const q = $("#chatQ"); if (q) q.focus(); const box = $("#chatMsgs"); if (box) box.scrollTop = box.scrollHeight; }, 0); }
}
function walletSummary() {
  return { people: viewPeople().map(p => ({ name: p.name, fiveTwentyFour: fiveTwentyFour(p.id).count })), cards: VC().map(c => ({ name: `${c.issuer} ${c.name}`, holder: profName(c.owner), role: c.role, status: c.status, type: c.kind, opened: c.openDate, annualFee: num(c.annualFee), program: c.program, multipliers: Object.fromEntries(CATS.map(([k, l]) => [l, multOf(c, k)])), bonusReceived: c.sub && c.sub.received ? c.sub.receivedDate : null })),
    watchlist: S.research.map(r => r.name), pointValuesCents: S.settings.pointValues, travel: travelBrief() };
}
function vResearch() {
  const r = research;
  const sw = `<div class="modesw" role="group" aria-label="Research mode"><button type="button" data-rxmode="recs" aria-pressed="${rxMode === "recs"}">Get recommendations<small>Card picks for one question</small></button><button type="button" data-rxmode="chat" aria-pressed="${rxMode === "chat"}">Chat<small>Back-and-forth with Claude</small></button></div>`;
  if (rxMode === "chat") return `<div class="two"><div class="stack"><div>${sw}</div>${vChat()}</div>${watchlistPanel()}</div>`;
  return `<div class="two">
  <div class="stack">
    <div>${sw}</div>
    <div class="panel ask"><div><h2>Get card recommendations</h2><div class="muted">Claude sees your wallet (names, fees, multipliers, open dates, 5/24)${TRAVEL ? " and your travel profile (airlines, airports, hotels, how you book and pay)" : ""} and suggests cards to look at.</div></div>
      <div class="presets">${[...travelPresets(), "What card fills my weakest category?", "Best next card while I'm under 5/24", "A premium travel card that pays for itself for me", "No-fee cards to keep long-term", "Which of my cards should I downgrade, and to what?"].map(p => `<button data-preset="${esc(p)}">${esc(p)}</button>`).join("")}</div>
      <label class="f" for="askQ">Your question or goal</label>
      <textarea id="askQ" placeholder="e.g. I spend about $800/mo on groceries and fly United twice a year. What should I get next?">${esc(r.question)}</textarea>
      <div class="row"><button class="btn primary" id="askBtn" ${r.busy ? "disabled" : ""}>Research cards</button>${r.busy ? `<button class="btn" id="stopBtn">Stop</button>` : ""}<span class="note" id="askAvail"></span></div>
      <p class="note" style="margin:0">Claude works from what it already knows and can't browse live offers, so bonuses and fees may have changed. Check the issuer's site before applying.</p>
    </div>
    <div id="askOut">${researchOut()}</div>
  </div>
  ${watchlistPanel()}</div>`;
}
function watchlistPanel() {
  return `<div class="panel"><div class="spread" style="margin-bottom:10px"><h2>Watchlist</h2><button class="btn sm" data-act="add-research">+ Add</button></div>
    <div id="resForm"></div>
    ${S.research.length ? `<div class="fold-list">${S.research.map(x => fold("wl-" + x.id,
      `<b>${esc(x.issuer)} ${esc(x.name)}</b><span class="sumr"><span class="note num">${money(x.annualFee)}</span>${x.claude && x.claude.verdict ? `<span class="pill ${VERDICT_TONE[x.claude.verdict] || ""}">${esc(x.claude.verdict)}</span>` : ""}${zeroAFPill(x.claude)}${x.example ? `<span class="pill">Example</span>` : ""}</span>`,
      `<div style="display:grid;gap:6px">
      <div class="note">${money(x.annualFee)} fee${x.bonus ? " · bonus " + esc(x.bonus) : ""} · ${esc(x.status || "considering")}</div>
      ${x.notes ? clampText(esc(x.notes), "font-size:.88rem") : ""}
      ${watchResearch(x)}
      <div class="row"><button class="btn sm ${x.claude && !x.claude.partial ? "" : "primary"}" data-act="watch-research" data-id="${x.id}" ${wBusy[x.id] ? "disabled" : ""}>${wBusy[x.id] ? "Researching…" : x.claude && !x.claude.partial ? "Refresh research" : "Research with Claude"}</button><span class="note" id="wr-${x.id}">${esc(wErr[x.id] || "")}</span></div>
      <div class="row"><select data-rstatus="${x.id}" style="width:auto" aria-label="Status">${["considering", "applied", "approved", "passed"].map(s => `<option ${x.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <button class="btn sm" data-act="research-to-wallet" data-id="${x.id}">Move to my cards</button><button class="btn sm ghost danger" data-act="del-research" data-id="${x.id}">Remove</button></div></div>`)).join("")}</div>` : `<p class="muted">Cards you're considering land here.</p>`}
  </div>`;
}
function travelPresets() {
  const t = TRAVEL; if (!t) return [];
  const a = (t.airlines || [])[0], h = (t.hotelBrands || []).find(x => !/independent|airbnb|vrbo|vacation|other/i.test(x.brand));
  return ["Best card for how I fly and where I stay", a ? `Is a ${a.name} card worth it for me?` : "", h ? `Would a ${h.brand} card pay off for my stays?` : ""].filter(Boolean);
}
// Per-entry Claude research on the watchlist.
const wBusy = {}, wErr = {};
const VERDICT_TONE = { "Apply now": "good", "Wait": "warn", "Skip": "bad" };
function watchResearch(x) {
  const r = x.claude; if (!r) return "";
  if (r.partial) return zeroAF(r.zeroFeeDowngrade, r.annualFee);
  const mult = Object.entries(r.multipliers || {}).filter(([k, v]) => CAT_LABEL[k] && num(v) > 0).sort((a, b) => b[1] - a[1]);
  const list = (title, arr) => arr && arr.length ? `<div><div class="eyebrow">${title}</div><ul style="margin:2px 0 0;padding-left:18px;font-size:.86rem">${arr.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>` : "";
  return `<details ${wOpen === x.id ? "open" : ""} style="background:var(--surface-2);border-radius:10px;padding:8px 10px"><summary style="cursor:pointer;display:flex;flex-wrap:wrap;gap:6px;align-items:center"><b style="font-size:.88rem">Claude's research</b>${r.verdict ? `<span class="pill ${VERDICT_TONE[r.verdict] || ""}">${esc(r.verdict)}</span>` : ""}<span class="note">${esc(r.date || "")}</span></summary>
    <div style="display:grid;gap:8px;margin-top:8px;font-size:.88rem">
      ${r.fit ? `<div>${esc(r.fit)}</div>` : ""}
      <div class="note">${money(r.annualFee)} fee${r.typicalBonus ? " · " + esc(r.typicalBonus) : ""}${r.program ? " · " + esc(r.program) : ""}</div>
      ${mult.length ? `<div class="multis">${mult.map(([k, v]) => `<span class="pill accent">${v}× ${esc(CAT_LABEL[k])}</span>`).join("")}<span class="pill">${num(r.base) || 1}× else</span></div>` : ""}
      ${(r.credits || []).length ? `<div class="note">Credits: ${r.credits.map(c => `${esc(c.name)} (${money(c.value)}/yr)`).join(", ")}</div>` : ""}
      ${(r.perks || []).length ? `<div class="note">Perks: ${r.perks.map(p => esc(p.label || p)).join(", ")}</div>` : ""}
      ${zeroAF(r.zeroFeeDowngrade, r.annualFee)}
      ${list("Pros for you", r.pros)}${list("Cons for you", r.cons)}
      ${r.rules ? `<div class="note"><b>Approval rules:</b> ${esc(r.rules)}</div>` : ""}
      ${r.caveat ? `<div class="note">${esc(r.caveat)}</div>` : ""}
    </div></details>`;
}
// "$0 AF exit" line: can this card be product-changed to a no-fee card later?
function zeroAF(z, fee) {
  if (num(fee) === 0) return `<div class="note"><span class="pill good">No annual fee</span></div>`;
  if (!z) return "";
  const opts = (z.options || []).filter(Boolean);
  return z.available && opts.length
    ? `<div><span class="pill good">$0 AF downgrade</span> <span style="font-size:.86rem">${opts.map(esc).join(" or ")}</span>${z.note ? `<div class="note">${esc(z.note)}</div>` : ""}</div>`
    : `<div><span class="pill bad">No $0 AF downgrade</span>${z.note ? ` <span class="note">${esc(z.note)}</span>` : ""}</div>`;
}
const zeroAFPill = r => !r || num(r.annualFee) === 0 ? "" : r.zeroFeeDowngrade ? (r.zeroFeeDowngrade.available && (r.zeroFeeDowngrade.options || []).length ? `<span class="pill good">$0 AF exit</span>` : `<span class="pill bad">No $0 AF exit</span>`) : "";
let wOpen = null;
async function researchWatch(x) {
  const sample = await getSample();
  if (!sample) { wErr[x.id] = AI_OFF; render(); return; }
  wBusy[x.id] = true; wErr[x.id] = ""; render();
  const prompt = `Research the US credit card "${x.issuer} ${x.name}" for someone deciding whether to apply. Their wallet and point valuations as JSON:\n${JSON.stringify(walletSummary())}\nToday is ${iso(TODAY)}.${x.notes ? " Their notes: " + x.notes : ""} If the JSON includes "travel", it summarizes their real flights, airports, hotel stays and how they booked and paid: weigh airline, airport lounge, hotel brand and booking-portal fit against it, and treat upcoming trips as near-term spend.
Give the card's standard terms as you best know them and judge how it fits THIS wallet and travel pattern: which categories it would beat their current best card in, whether the fee pays for itself for them, and issuer approval rules that apply to them (Chase 5/24, Amex lifetime bonus, Capital One limits, Citi 48-month, etc). verdict is "Apply now", "Wait" or "Skip". Multiplier keys only from: ${CATS.map(c => c[0]).join(", ")} (omit base-rate categories). Program one of: ${Object.keys(PROGRAMS).join("; ")}. Credit value is dollars per year. Also say whether the card can later be product-changed to a $0 annual fee card from the same issuer, and to which. Keep text short. Your knowledge may be dated, so note in caveat what to verify.
Reply with only JSON: {"name":"","issuer":"","annualFee":0,"typicalBonus":"","standardBonusPoints":0,"program":"","base":1,"multipliers":{"dining":3},"credits":[{"name":"","value":0,"period":"monthly|quarterly|semiannual|annual"}],"perks":[{"label":"","kind":""}],"downgradeTo":"","reapplyMonths":0,"zeroFeeDowngrade":{"available":true,"options":["card names with a $0 annual fee this card can be product-changed to, same issuer"],"note":"one short sentence, e.g. points kept or lost"},"verdict":"Apply now|Wait|Skip","fit":"2-3 sentences","pros":["..."],"cons":["..."],"rules":"one sentence","caveat":""}`;
  try {
    const r = await sample.json(prompt, { modelTier: "default" });
    const cur = S.research.find(y => y.id === x.id); if (!cur) return;
    cur.claude = { ...r, date: fmtD(TODAY) };
    if (r.annualFee != null) cur.annualFee = num(r.annualFee);
    if (r.typicalBonus && !cur.bonus) cur.bonus = String(r.typicalBonus);
    wOpen = x.id; FOLD.set("wl-" + x.id, true); persist();
  } catch (e) { wErr[x.id] = sampleErr(e); }
  wBusy[x.id] = false; if (tab === "research") render();
}
function researchOut() {
  const r = research;
  if (r.busy) return `<div class="panel thinking">${r.stream ? "Writing suggestions…" : "Thinking…"}</div>`;
  if (r.error) return `<div class="panel advice bad">${esc(r.error)}</div>`;
  if (!r.result) return "";
  const res = r.result;
  return `<div class="sugg">${res.summary ? `<div class="panel">${esc(res.summary)}<div class="row" style="margin-top:10px"><button class="btn sm" data-act="recs-to-chat">Ask follow-ups in chat</button></div></div>` : `<div class="row"><button class="btn sm" data-act="recs-to-chat">Ask follow-ups in chat</button></div>`}${(res.suggestions || []).map((s, i) => `<div class="sg">
    <div class="spread"><h3>${esc(s.issuer)} ${esc(s.name)}</h3><span class="pill">${money(num(s.annualFee))} fee</span></div>
    ${s.typicalBonus ? `<div class="note">Typical bonus: ${esc(s.typicalBonus)}</div>` : ""}
    <div class="multis">${Object.entries(s.multipliers || {}).slice(0, 6).map(([k, v]) => `<span class="pill accent">${esc(v)}× ${esc(k)}</span>`).join("")}</div>
    <div style="font-size:.92rem">${esc(s.why)}</div>
    ${(s.keyPerks || []).length ? `<div class="note">Perks: ${esc(s.keyPerks.join(", "))}</div>` : ""}
    ${zeroAF(s.zeroFeeDowngrade, s.annualFee)}
    ${s.watchOut ? `<div class="note">Watch out: ${esc(s.watchOut)}</div>` : ""}
    <div class="row"><button class="btn sm" data-act="sugg-add" data-i="${i}">Add to watchlist</button></div></div>`).join("")}</div>`;
}
async function wireResearch() {
  const s = await getSample(); const cv = $("#chatAvail"); if (!s && cv) cv.textContent = AI_OFF;
  const av = $("#askAvail");
  if (!s && av) { av.textContent = AI_OFF; const b = $("#askBtn"); if (b) b.disabled = true; }
}
async function runResearch() {
  const q = ($("#askQ").value || "").trim(); research.question = q;
  const sample = await getSample(); if (!sample) return;
  research = { ...research, busy: true, error: "", result: null, stream: "", ctl: new AbortController() };
  render();
  const prompt = `You are a US credit card research assistant. Here is the person's current wallet as JSON:\n${JSON.stringify(walletSummary())}\n\nToday is ${iso(TODAY)}. Their question or goal: ${q || "Suggest the most useful next card for this wallet."} If the JSON includes "travel", it summarizes their real flights, airports, hotel stays and how they booked and paid: weigh airline, airport lounge, hotel brand and booking-portal fit against it, and treat upcoming trips as near-term spend.\n\nSuggest up to 5 cards (not ones they already hold unless the question asks about their own cards). Account for gaps in their multipliers, annual fee value, issuer application rules such as Chase 5/24 and Amex once-per-lifetime bonuses, and their point valuations. Your knowledge may be out of date, so mention in watchOut when an offer changes often.\nReply with only JSON in this shape:\n{"summary":"2-3 sentences of overall advice","suggestions":[{"name":"card name without issuer","issuer":"","annualFee":0,"typicalBonus":"e.g. 60,000 points after $4,000 in 3 months","program":"","multipliers":{"Dining":3},"keyPerks":["..."],"why":"why it fits this wallet, 1-2 sentences","watchOut":"rules or caveats","zeroFeeDowngrade":{"available":true,"options":["$0 annual fee card(s) from the same issuer it can be product-changed to"],"note":""}}]}`;
  try {
    const res = await sample.json(prompt, { signal: research.ctl.signal, onText: ({ text }) => { if (!research.stream && text) { research.stream = text; const o = $("#askOut"); if (o) o.innerHTML = researchOut(); } } });
    research = { ...research, busy: false, result: res && typeof res === "object" ? res : { summary: String(res), suggestions: [] } };
  } catch (e) { research = { ...research, busy: false, error: sampleErr(e) }; }
  if (tab === "research") render();
}

function vData() {
  const pv = S.settings.pointValues;
  return `<div class="two"><div class="stack">
    <div class="panel"><div class="spread" style="margin-bottom:6px"><h2>People</h2><button class="btn sm" data-act="add-profile">+ Add person</button></div><p class="note" style="margin-top:0">Each person has their own cards, 5/24 count and credit pulls. Removing a person deletes their cards.</p>
      ${S.profiles.map(p => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><input type="text" id="pn-${esc(p.id)}" value="${esc(p.name)}" style="flex:1;min-width:0;width:auto" aria-label="Name"><span class="note">${S.cards.filter(c => c.owner === p.id).length} cards</span><button class="btn sm" data-act="rename-profile" data-id="${esc(p.id)}">Rename</button>${S.profiles.length > 1 ? `<button class="btn sm ghost danger" data-act="del-profile" data-id="${esc(p.id)}">Remove</button>` : ""}</div>`).join("")}</div>
    <div class="panel"><h2 style="margin-bottom:6px">Point values</h2><p class="note" style="margin-top:0">Cents per point you expect when redeeming. These drive the return % in the matrix and the best-card picks.</p>
      <div class="grid2">${Object.keys(PROGRAMS).map(k => `<label class="f">${esc(k)}<input type="number" step="0.05" min="0" value="${pv[k] ?? PROGRAMS[k]}" data-pv="${esc(k)}"></label>`).join("")}</div></div>
  </div><div class="stack">
    <div class="panel"><h2 style="margin-bottom:6px">Back up your data</h2><p class="note" style="margin-top:0">Export everything as a JSON file, or copy it, so you have a copy outside this page.</p>
      <div class="row"><button class="btn" data-act="export">Download backup</button><button class="btn" data-act="copy-json">Copy as text</button></div>
      <h3 style="margin-top:18px">Restore</h3>
      <label class="f" for="importFile">From a backup file</label><input type="file" id="importFile" accept="application/json,.json">
      <label class="f" for="importText" style="margin-top:8px">Or paste backup text</label><textarea id="importText" placeholder='{"version":1,...}'></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="import-text">Restore from text</button></div>
      <p class="note">Restoring replaces everything currently in the hub.</p></div>
    <div class="panel"><h2 style="margin-bottom:6px">Start over</h2><p class="note" style="margin-top:0">Removes every card, pull and watchlist entry.</p><button class="btn danger" data-act="wipe">Erase all data</button></div>
    ${store.mode === "account" ? `<div class="panel"><h2 style="margin-bottom:6px">Delete my saved data</h2><p class="note" style="margin-top:0">Your wallet (cards, people, pulls, watchlist and settings) is saved to your account. Deleting it removes it from the server for good, so download a backup first if you might want it back. Copies in older nightly backups remain until those are cleared; to have them removed too, email me from the <a href="/contact/">Contact page</a>.</p><button class="btn danger" data-act="delete-saved">Delete my saved wallet</button></div>` : ""}
  </div></div>`;
}

// ---------- card editor ----------
let draft = null, draftIsNew = false;
function openEditor(c, isNew) { draft = JSON.parse(JSON.stringify(c)); draftIsNew = isNew; renderEditor(); }
function closeEditor() { draft = null; $("#modalRoot").innerHTML = ""; document.body.style.overflow = ""; }
function renderEditor() {
  const d = draft; document.body.style.overflow = "hidden";
  $("#modalRoot").innerHTML = `<div class="overlay" id="ovl"><form class="drawer" id="cardForm" aria-label="Card details">
    <div class="spread"><h2>${draftIsNew ? "Add a card" : "Edit " + esc(d.name)}</h2><button type="button" class="btn ghost" data-act="close" aria-label="Close">✕</button></div>
    <div class="fs" style="border-color:var(--accent);background:var(--accent-soft)"><h3>Pick from the catalog</h3>
      <label class="f">Fill in a card's terms<select id="f_catalog"><option value="">Choose a card…</option>${CATALOG.map(c => `<option value="${esc(c.key)}">${esc(c.issuer)} ${esc(c.name)}</option>`).join("")}</select></label>
      <div class="grid2">
        <label class="f">Card name<input type="text" id="f_name" value="${esc(d.name)}" placeholder="Sapphire Reserve" required></label>
        <label class="f">Issuer<input type="text" id="f_issuer" value="${esc(d.issuer)}" placeholder="Chase"></label>
      </div>
      <div class="row"><button type="button" class="btn sm" data-act="fill-claude" id="fillBtn" disabled>Research with Claude</button></div>
      <div class="note" id="fillNote" style="color:var(--ink-2)">Picking a card fills in its fee, multipliers, credits, perks and downgrade path. Catalog terms are from 2026 and change often, so check the issuer. Everything stays editable below. ${AI_OFF}</div>
    </div>
    <div class="fs"><h3>Basics</h3>
      <div class="grid2">
        <label class="f">Network<select id="f_network">${["Visa", "Mastercard", "Amex", "Discover"].map(n => `<option ${d.network === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="f">Last 4 digits<input type="text" id="f_last4" maxlength="4" inputmode="numeric" value="${esc(d.last4)}"></label>
        <label class="f">Personal or business<select id="f_kind"><option value="personal" ${d.kind === "personal" ? "selected" : ""}>Personal</option><option value="business" ${d.kind === "business" ? "selected" : ""}>Business</option></select></label>
        <label class="f">Whose card<select id="f_owner">${S.profiles.map(p => `<option value="${esc(p.id)}" ${d.owner === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
        <label class="f">Role in your wallet<select id="f_role"><option value="keeper" ${d.role !== "rotating" ? "selected" : ""}>Long-term keeper</option><option value="rotating" ${d.role === "rotating" ? "selected" : ""}>Rotating (downgrade or cancel at the fee)</option></select></label>
        <label class="f">Status<select id="f_status">${[["open", "Open"], ["changed", "Product-changed to another card"], ["closed", "Closed"]].map(([v, l]) => `<option value="${v}" ${d.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f" data-ended ${isGone(d) ? "" : "hidden"}>Ended on<input type="date" id="f_closed" value="${esc(d.closedDate || "")}"></label>
        <label class="f">How you got it<select id="f_origin"><option value="new" ${d.origin !== "productChange" ? "selected" : ""}>New application</option><option value="productChange" ${d.origin === "productChange" ? "selected" : ""}>Product change (downgrade or upgrade)</option></select></label>
        <label class="f">Account opened<input type="date" id="f_open" value="${esc(d.openDate)}"></label>
        <label class="f" data-pc ${d.origin === "productChange" ? "" : "hidden"}>Changed from<input type="text" id="f_from" value="${esc(d.fromCard || "")}" placeholder="Sapphire Reserve"></label>
        <label class="f" data-pc ${d.origin === "productChange" ? "" : "hidden"}>Changed on<input type="date" id="f_changed" value="${esc(d.changeDate || "")}"></label>
        <label class="f">Annual fee ($)<input type="number" min="0" id="f_fee" value="${num(d.annualFee)}"></label>
        <label class="f">Credit limit ($)<input type="number" min="0" id="f_limit" value="${num(d.creditLimit) || ""}"></label>
      </div>
      <div class="note" data-pc ${d.origin === "productChange" ? "" : "hidden"}>For a product change, keep the original account open date. It's the same account, so it doesn't add a new 5/24 entry and the fee anniversary stays the same.</div>
      ${!draftIsNew && d.status !== "changed" ? `<div class="row"><button type="button" class="btn sm" data-act="record-pc">Record a product change of this card</button><span class="note">${d.status === "closed" ? "Use this if the issuer converted this card instead of closing it. " : ""}Marks this card as changed and starts the new card with the same account date.</span></div>` : ""}
      <div class="f" style="font-size:.8rem;color:var(--ink-2)">Card color<div class="colors">${COLORS.map(c => `<button type="button" style="background:${c}" aria-label="Color ${c}" aria-pressed="${d.color === c}" data-color="${c}"></button>`).join("")}</div></div>
    </div>
    <div class="fs"><h3>Rewards</h3>
      <div class="grid2"><label class="f">Rewards program<select id="f_program">${Object.keys(PROGRAMS).map(p => `<option ${d.program === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
      <label class="f">Base rate (× on everything)<input type="number" step="0.25" min="0" id="f_base" value="${num(d.base)}"></label></div>
      <div class="note">Category multipliers. Leave blank to use the base rate.</div>
      <div class="mgrid">${CATS.filter(([k]) => k !== "other").map(([k, l]) => `<label class="f">${l}<input type="number" step="0.5" min="0" data-mult="${k}" value="${c_val(d, k)}" placeholder="${blankRate(d, k)}"></label>`).join("")}</div>
    </div>
    <div class="fs"><h3>Sign-up bonus</h3>
      <div class="grid2">
        <label class="f">Bonus you got (points)<input type="number" min="0" id="s_amount" value="${num(d.sub.amount) || ""}"></label>
        <label class="f">Standard public offer<input type="number" min="0" id="s_standard" value="${num(d.sub.standard) || ""}" placeholder="for comparison"></label>
        <label class="f">Spend required ($)<input type="number" min="0" id="s_req" value="${num(d.sub.spendReq) || ""}"></label>
        <label class="f">Spent so far ($)<input type="number" min="0" id="s_spent" value="${num(d.sub.spent) || ""}"></label>
        <label class="f">Spend deadline<input type="date" id="s_deadline" value="${esc(d.sub.deadline)}"></label>
        <label class="f">Bonus posted on<input type="date" id="s_recdate" value="${esc(d.sub.receivedDate)}"></label>
      </div>
      <div class="row"><label class="chk"><input type="checkbox" id="s_promo" ${d.sub.promo ? "checked" : ""}> Promo or elevated offer</label><label class="chk"><input type="checkbox" id="s_received" ${d.sub.received ? "checked" : ""}> Bonus received</label></div>
    </div>
    <div class="fs"><div class="spread"><h3>Statement credits</h3><button type="button" class="btn sm" data-act="add-credit">+ Credit</button></div>
      ${d.credits.length ? d.credits.map((x, i) => `<div class="subrow"><input type="text" value="${esc(x.name)}" data-cr="${i}" data-k="name" placeholder="Dining credit" aria-label="Credit name"><input type="number" value="${num(x.value)}" data-cr="${i}" data-k="value" aria-label="Value per year" title="Value per year"><select data-cr="${i}" data-k="period" aria-label="Cadence">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${x.period === k ? "selected" : ""}>${l}</option>`).join("")}</select><button type="button" class="btn sm ghost" data-act="del-credit" data-i="${i}" aria-label="Remove credit">✕</button></div>`).join("") : `<div class="note">None yet. Value is the total per year.</div>`}
    </div>
    <div class="fs"><div class="spread"><h3>Perks</h3><button type="button" class="btn sm" data-act="add-perk">+ Perk</button></div>
      ${d.perks.length ? d.perks.map((p, i) => `<div class="subrow" style="grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) auto"><input type="text" value="${esc(p.label)}" data-pk="${i}" data-k="label" placeholder="Priority Pass lounges" aria-label="Perk"><select data-pk="${i}" data-k="kind" aria-label="Perk type">${PERK_KINDS.map(k => `<option ${p.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select><button type="button" class="btn sm ghost" data-act="del-perk" data-i="${i}" aria-label="Remove perk">✕</button></div>`).join("") : `<div class="note">None yet.</div>`}
    </div>
    <div class="fs"><h3>Renewal strategy</h3>
      <div class="grid2">
        <label class="f">Other value per year ($)<input type="number" min="0" id="f_perkval" value="${num(d.perkValue) || ""}" placeholder="lounges, status, insurance"></label>
        <label class="f">Downgrade option<input type="text" id="f_down" value="${esc(d.downgradeTo)}" placeholder="${esc(suggestDowngrade(d) || "Freedom Unlimited")}"></label>
        <label class="f">Bonus reapply rule (months)<input type="number" min="0" id="f_reapply" value="${num(d.reapplyMonths) || ""}" placeholder="48 for some Chase cards"></label>
      </div>
      <label class="f">Renewal strategy<textarea id="f_strategy" placeholder="e.g. Keep while I use the travel credit and lounges; downgrade to Freedom Unlimited if I stop flying monthly.">${esc(d.strategy || "")}</textarea></label>
      <label class="f">Notes<textarea id="f_notes" placeholder="Retention offers, product changes, anything to remember">${esc(d.notes)}</textarea></label>
    </div>
    <div class="spread" style="position:sticky;bottom:0;background:var(--bg);padding-block:10px">
      <div>${draftIsNew ? "" : `<button type="button" class="btn danger" data-act="del-card" id="delBtn">Delete card</button>`}</div>
      <div class="row"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary">Save card</button></div>
    </div>
  </form></div>`;
}
function readForm() {
  const v = id => $("#" + id).value;
  Object.assign(draft, { name: v("f_name").trim(), issuer: v("f_issuer").trim(), network: v("f_network"), last4: v("f_last4").replace(/\D/g, ""), kind: v("f_kind"), status: v("f_status"), owner: v("f_owner"), role: v("f_role"), origin: v("f_origin"), fromCard: v("f_from").trim(), changeDate: v("f_changed"),
    openDate: v("f_open"), annualFee: num(v("f_fee")), creditLimit: num(v("f_limit")), program: v("f_program"), base: num(v("f_base")) || 1,
    perkValue: num(v("f_perkval")), downgradeTo: v("f_down").trim(), reapplyMonths: num(v("f_reapply")), notes: v("f_notes"), strategy: v("f_strategy").trim() });
  draft.closedDate = isGone(draft) ? (v("f_closed") || draft.closedDate || iso(TODAY)) : "";
  if (draft.origin !== "productChange") { draft.fromCard = ""; draft.changeDate = ""; delete draft.fromId; }
  draft.mult = {}; document.querySelectorAll("[data-mult]").forEach(i => { if (i.value !== "") draft.mult[i.dataset.mult] = num(i.value); });
  draft.sub = { amount: num(v("s_amount")), standard: num(v("s_standard")), spendReq: num(v("s_req")), spent: num(v("s_spent")), deadline: v("s_deadline"), receivedDate: v("s_recdate"), promo: $("#s_promo").checked, received: $("#s_received").checked };
  document.querySelectorAll("[data-cr]").forEach(i => { const x = draft.credits[+i.dataset.cr]; x[i.dataset.k] = i.dataset.k === "value" ? num(i.value) : i.value; });
  document.querySelectorAll("[data-pk]").forEach(i => { draft.perks[+i.dataset.pk][i.dataset.k] = i.value; });
}
// Fill the editor from shared/data/cards.json (the demo's stand-in for "Research with Claude")
function fillFromCatalog(key) {
  const r = CATALOG.find(c => c.key === key); if (!r || !draft) return;
  readForm();
  const kept = [];
  draft.name = r.name; draft.issuer = r.issuer;
  if (["Visa", "Mastercard", "Amex", "Discover"].includes(r.network)) draft.network = r.network;
  draft.annualFee = num(r.annualFee);
  if (PROGRAMS[r.program] != null) draft.program = r.program;
  draft.base = num(r.base) || 1;
  draft.mult = {}; for (const [k, v] of Object.entries(r.mult || {})) if (CAT_LABEL[k] && num(v) > 0) draft.mult[k] = num(v);
  if (!draft.credits.length) draft.credits = (r.credits || []).map(x => ({ id: uid(), name: x.name, value: num(x.value), period: PERIODS[x.period] ? x.period : "annual", used: 0, log: [] })); else kept.push("credits");
  if (!draft.perks.length) draft.perks = (r.perks || []).map(p => ({ label: p.label, kind: PERK_KINDS.includes(p.kind) ? p.kind : "Other" })); else kept.push("perks");
  if (r.downgradeTo) draft.downgradeTo = r.downgradeTo;
  if (r.reapplyMonths) draft.reapplyMonths = num(r.reapplyMonths);
  renderEditor();
  $("#fillNote").textContent = `Filled from the catalog${kept.length ? `. Kept your existing ${kept.join(" and ")}` : ""}. Check the issuer's current terms, then edit anything below and save.`;
}
function showProfileForm() {
  const renameMe = S.profiles.length === 1 && S.profiles[0].name === "Me";
  $("#modalRoot").innerHTML = `<div class="overlay" id="ovl"><form class="drawer" id="profForm" style="height:auto;max-height:100%;align-self:center;margin-inline:auto;border-radius:14px">
    <div class="spread"><h2>Add a person</h2><button type="button" class="btn ghost" data-act="close" aria-label="Close">✕</button></div>
    <p class="muted" style="margin:0">Track another person's cards, 5/24 count and credit pulls separately. Switch between people with the bar above the tabs.</p>
    ${renameMe ? `<label class="f">Your name (optional)<input type="text" id="prof_me" placeholder="Billy"></label>` : `<input type="hidden" id="prof_me" value="">`}
    <label class="f">Their name<input type="text" id="prof_name" placeholder="e.g. your fiancé's name" required></label>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary">Add person</button></div></form></div>`;
  draft = {}; $("#prof_name").focus();
}
async function askDowngrade(c) {
  const out = $("#dg-" + c.id); const sample = await getSample();
  if (!sample) { out.textContent = AI_OFF; return; }
  out.textContent = "Asking Claude…";
  const others = S.cards.filter(x => x.owner === c.owner && x.id !== c.id && !isGone(x)).map(x => `${x.issuer} ${x.name} (${x.program})`).join("; ");
  try {
    const r = await sample.json(`A US cardholder wants to stop paying the annual fee on the ${c.issuer} ${c.name} (fee $${num(c.annualFee)}, earns ${c.program}). Their other open cards: ${others || "none"}.\nRecommend the best product-change (downgrade) target from the same issuer, considering which no-fee card would keep their points usable and fill a gap in their wallet. If no downgrade exists, say cancel. Your knowledge may be dated, so keep it brief.\nReply with only JSON: {"target":"card name or Cancel","reason":"one sentence"}`, { modelTier: "quick" });
    out.textContent = `${r.target}: ${r.reason}`;
    if (r.target && !/^cancel/i.test(r.target) && !c.downgradeTo) { c.downgradeTo = String(r.target); persist(); }
  } catch (e) { out.textContent = sampleErr(e); }
}

// ---------- events ----------
let toastT;
function toast(msg) { let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); $(".wallet-app").appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function setTab(k) { tab = k; try { history.replaceState(null, "", "#" + k); } catch {} render(); window.scrollTo(0, 0); }
// Typing or following a #tab address switches tabs too
addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h !== tab && TABS.some(t => t[0] === h)) { tab = h; render(); } });
const armed = new Set();
function twoStep(btn, key, label) {
  if (armed.has(key)) { armed.delete(key); return true; }
  armed.add(key); const old = btn.textContent; btn.textContent = label; setTimeout(() => { armed.delete(key); if (btn.isConnected) btn.textContent = old; }, 3500); return false;
}
function download(filename, data) { saveFile(filename, data); }
function importState(obj) {
  if (!obj || !Array.isArray(obj.cards)) { toast("That doesn't look like a What's in My Wallet backup."); return; }
  S = normalize({ settings: obj.settings, profiles: obj.profiles, activeProfile: obj.activeProfile, cards: obj.cards, pulls: obj.pulls || [], research: obj.research || [] });
  persist(); render(); toast("Restored " + S.cards.length + " cards");
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab],[data-goto],[data-act],[data-preset],[data-color],[data-profile],[data-tlcard],[data-tlzoom],[data-rxmode],[data-chatpreset]"); if (!t) return;
  if (t.dataset.rxmode) { setRxMode(t.dataset.rxmode); return; }
  if (t.dataset.chatpreset) { sendChat(t.dataset.chatpreset); return; }
  if (t.dataset.tlzoom) { tlZoom = t.dataset.tlzoom; render(); return; }
  if (t.dataset.tlcard !== undefined) { tlCard = t.dataset.tlcard || null; render(); return; }
  if (t.dataset.profile) { S.activeProfile = t.dataset.profile; persist(); render(); return; }
  if (t.dataset.tab) return setTab(t.dataset.tab);
  if (t.dataset.goto) return setTab(t.dataset.goto);
  if (t.dataset.preset) { $("#askQ").value = t.dataset.preset; research.question = t.dataset.preset; return; }
  if (t.dataset.color) { readForm(); draft.color = t.dataset.color; renderEditor(); return; }
  const a = t.dataset.act, id = t.dataset.id;
  const card = id && S.cards.find(c => c.id === id);
  switch (a) {
    case "add": openEditor(blankCard(), true); break;
    case "edit": openEditor(card, false); break;
    case "close": closeEditor(); break;
    case "add-credit": readForm(); draft.credits.push({ id: uid(), name: "", value: 0, period: "annual", used: 0 }); renderEditor(); break;
    case "del-credit": readForm(); draft.credits.splice(+t.dataset.i, 1); renderEditor(); break;
    case "add-perk": readForm(); draft.perks.push({ label: "", kind: "Other" }); renderEditor(); break;
    case "del-perk": readForm(); draft.perks.splice(+t.dataset.i, 1); renderEditor(); break;
    case "record-pc": { readForm(); const old = draft; const i = S.cards.findIndex(c => c.id === old.id); if (i >= 0) S.cards[i] = old;
      const n = blankCard(); Object.assign(n, { owner: old.owner, issuer: old.issuer, network: old.network, last4: old.last4, kind: old.kind, color: old.color, creditLimit: old.creditLimit, openDate: old.openDate, program: old.program,
        origin: "productChange", fromId: old.id, fromCard: old.name, changeDate: iso(TODAY), role: "keeper" });
      openEditor(n, true); $("#fillNote").textContent = `New card for the ${old.name} account. Type its name and research it with Claude, or fill it in. ${old.name} is marked as changed when you save.`; break; }
    case "del-card": if (twoStep(t, "del" + draft.id, "Tap again to delete")) { S.cards = S.cards.filter(c => c.id !== draft.id); closeEditor(); persist(); render(); toast("Card deleted"); } break;
    case "clear-examples": S.cards = S.cards.filter(c => !c.example); S.pulls = S.pulls.filter(p => !p.example); S.research = S.research.filter(r => !r.example); persist(); render(); toast("Examples cleared"); break;
    case "add-spend": { const inp = $("#spend-" + id); const v = num(inp && inp.value); if (v) { card.sub.spent = num(card.sub.spent) + v; persist(); render(); toast(`Logged ${money(v)}`); } break; }
    case "sub-received": card.sub.received = true; card.sub.receivedDate = card.sub.receivedDate || iso(TODAY); persist(); render(); toast("Bonus marked received"); break;
    case "toggle-log": openLog = openLog === id ? null : id; render(); break;
    case "del-log": { const c = S.cards.find(x => x.id === t.dataset.card), cr = c.credits.find(x => x.id === t.dataset.credit), l = cr.log.find(x => x.id === id);
      cr.log = cr.log.filter(x => x.id !== id); cr.used = Math.max(0, num(cr.used) - num(l && l.amount)); persist(); render(); break; }
    case "ask-downgrade": askDowngrade(card); break;
    case "chat-new": S.chat = []; chat.err = ""; persist(); render(); setTimeout(() => { const q = $("#chatQ"); if (q) q.focus(); }, 0); break;
    case "chat-stop": if (chat.ctl) chat.ctl.abort(); break;
    case "chat-to-recs": { const last = [...(S.chat || [])].reverse().find(m => m.role === "user"); research.question = last ? last.content : ""; setRxMode("recs"); if (research.question) runResearch(); break; }
    case "recs-to-chat": { const res = research.result || {}; const picks = (res.suggestions || []).map(x => `- **${x.issuer ? x.issuer + " " : ""}${x.name}** (${money(num(x.annualFee))} fee): ${x.why || ""}`).join("\n");
      S.chat = [{ role: "user", content: research.question || "Suggest the most useful next card for my wallet." }, { role: "assistant", content: `${res.summary || "Here are the cards I'd look at:"}\n${picks}\n\nWhat would you like to dig into?` }];
      chat.err = ""; persist(); setRxMode("chat"); break; }
    case "clamp": { const el = t.previousElementSibling; if (el) { const on = el.classList.toggle("unclamped"); t.textContent = on ? "Show less" : "Show more"; } break; }
    case "step-done": { const ren = t.dataset.ren, k = t.dataset.step; card.planDone ||= {}; const l = card.planDone[ren] ||= []; const i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k);
      // Drop records for old renewals so the saved card stays small.
      for (const r of Object.keys(card.planDone)) if (r !== ren && parseD(r) < addMonths(TODAY, -14)) delete card.planDone[r];
      persist(); render(); toast(i >= 0 ? "Marked not done" : `Done: ${k === "call" ? "call" : k.replace(/\s*\(.*$/, "")}`); break; }
    case "fee-posted": card.feePosted = card.feePosted === t.dataset.ren ? "" : t.dataset.ren; persist(); render(); toast(card.feePosted ? "Fee marked as posted" : "Fee marked as not posted"); break;
    case "renewal-done": card.renewalDone = t.dataset.ren; persist(); render(); toast(`${card.name}: renewal handled. Plan moved to next year.`); break;
    case "travel-ask": research.question = "Based on my travel profile and current wallet, which card would add the most value for how I fly and stay? Consider my main airline, home airport lounges, hotel brands and the booking portals I use."; setTab("research"); runResearch(); break;
    case "add-profile": showProfileForm(); break;
    case "rename-profile": { const p = S.profiles.find(x => x.id === id), inp = $("#pn-" + id); if (p && inp.value.trim()) { p.name = inp.value.trim(); persist(); render(); toast("Saved"); } break; }
    case "del-profile": if (S.profiles.length > 1 && twoStep(t, "dp" + id, "Tap again: deletes their cards too")) { S.profiles = S.profiles.filter(p => p.id !== id); S.cards = S.cards.filter(c => c.owner !== id); S.pulls = S.pulls.filter(p => p.owner !== id); S.activeProfile = "all"; persist(); render(); toast("Person removed"); } break;
    case "cards-all": for (const c of VC()) FOLD.set("card-" + c.id, !!t.dataset.open); render(); break;
    case "mx-mode": matrixMode = t.dataset.mode; render(); break;
    case "mx-edit": matrixEdit = !matrixEdit; render(); break;
    case "reset-credits": if (twoStep(t, "reset", "Tap again to reset every credit to $0 used")) { S.cards.forEach(c => (c.credits || []).forEach(x => x.used = 0)); persist(); render(); toast("Credit usage reset"); } break;
    case "add-pull": $("#pullForm").innerHTML = `<form id="pf" class="grid2" style="margin-bottom:10px"><label class="f">Date<input type="date" id="p_date" value="${iso(TODAY)}"></label><label class="f">Bureau<select id="p_bureau"><option>Experian</option><option>Equifax</option><option>TransUnion</option></select></label><label class="f">Issuer<input type="text" id="p_issuer" required></label><label class="f">Note<input type="text" id="p_note"></label>${multiPeople() ? `<label class="f">Person<select id="p_owner">${S.profiles.map(p => `<option value="${esc(p.id)}" ${S.activeProfile === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : ""}<div class="row"><button class="btn sm primary" type="submit">Save pull</button></div></form>`; break;
    case "del-pull": S.pulls = S.pulls.filter(p => p.id !== id); persist(); render(); break;
    case "add-research": $("#resForm").innerHTML = `<form id="rf" class="grid2" style="margin-bottom:10px"><label class="f">Card<input type="text" id="r_name" required></label><label class="f">Issuer<input type="text" id="r_issuer"></label><label class="f">Annual fee<input type="number" id="r_fee" min="0"></label><label class="f">Bonus<input type="text" id="r_bonus"></label><label class="f" style="grid-column:1/-1">Notes<input type="text" id="r_notes"></label><div class="row"><button class="btn sm primary" type="submit">Add</button></div></form>`; break;
    case "del-research": S.research = S.research.filter(r => r.id !== id); persist(); render(); break;
    case "research-to-wallet": { const r = S.research.find(x => x.id === id); const c = blankCard(); Object.assign(c, { name: r.name, issuer: r.issuer, annualFee: num(r.annualFee), notes: r.notes || "" });
      const cr = r.claude; if (cr) {
        if (PROGRAMS[cr.program] != null) c.program = cr.program; if (cr.base) c.base = num(cr.base);
        if (cr.multipliers) for (const [k, v] of Object.entries(cr.multipliers)) if (CAT_LABEL[k] && num(v) > 0) c.mult[k] = num(v);
        if (Array.isArray(cr.credits)) c.credits = cr.credits.map(z => ({ id: uid(), name: String(z.name || ""), value: num(z.value), period: PERIODS[z.period] ? z.period : "annual", used: 0, log: [] }));
        if (Array.isArray(cr.perks)) c.perks = cr.perks.map(p => ({ label: String(p.label || p || ""), kind: PERK_KINDS.includes(p.kind) ? p.kind : "Other" }));
        const z = cr.zeroFeeDowngrade; c.downgradeTo = (z && z.available && (z.options || [])[0]) || cr.downgradeTo || ""; c.reapplyMonths = num(cr.reapplyMonths); c.sub.standard = num(cr.standardBonusPoints);
        if (cr.fit) c.strategy = String(cr.fit);
      }
      r.status = "approved"; openEditor(c, true); break; }
    case "watch-research": { const x = S.research.find(y => y.id === id); if (x && !wBusy[id]) researchWatch(x); break; }
    case "sugg-add": { const s = research.result.suggestions[+t.dataset.i]; S.research.push({ id: uid(), name: s.name, issuer: s.issuer, annualFee: num(s.annualFee), bonus: s.typicalBonus || "", status: "considering", notes: s.why || "", claude: s.zeroFeeDowngrade ? { annualFee: num(s.annualFee), zeroFeeDowngrade: s.zeroFeeDowngrade, partial: true } : undefined }); persist(); render(); toast("Added to watchlist"); break; }
    case "export": download(`whats-in-my-wallet-backup-${iso(TODAY)}.json`, JSON.stringify(S, null, 2)); break;
    case "copy-json": { const txt = JSON.stringify(S, null, 2); navigator.clipboard.writeText(txt).then(() => toast("Copied"), () => { const ta = $("#importText"); ta.value = txt; ta.select(); toast("Selected below; copy it with your keyboard"); }); break; }
    case "import-text": try { importState(JSON.parse($("#importText").value)); } catch { toast("That text isn't valid backup JSON."); } break;
    case "wipe": if (twoStep(t, "wipe", "Tap again to erase everything")) { S = normalize({ settings: S.settings, profiles: S.profiles, activeProfile: "all", cards: [], pulls: [], research: [] }); persist(); render(); toast("All data erased"); } break;
    case "delete-saved": deleteSaved(t); break;
  }
});

// "Delete my saved data" (members only): removes the wallet from the server, unlike "Erase all
// data", which saves an empty wallet. Two checks, like Budget Ledger's, because it can't be undone.
async function deleteSaved(btn) {
  if (store.mode !== "account") return;
  if (!confirm("Delete your saved wallet from your account? This can't be undone. Download a backup first if you might want it back.")) return;
  if (!confirm("Last check: permanently delete every card, person, pull and setting saved to your account?")) return;
  // A change made just before this may still be waiting to save (typing in a number field waits
  // 500 ms before persist(), which waits 300 ms more) or be on its way to the server. Drop the
  // waiting ones and let the one in flight land first, so none can write the wallet back after
  // the delete; no new saves start until it's done.
  P.deleting = true;
  clearTimeout(inputT); clearTimeout(P.timer);
  btn.disabled = true;
  try {
    await P.saving;
    await store.deleteAll();
    // Start the page empty, without saving: nothing is written back until something changes
    S = normalize({});
    render(); toast("Your saved wallet is deleted");
  } catch (err) {
    console.error(err); btn.disabled = false; toast("Couldn't delete everything. Try again; nothing extra is lost.");
  } finally {
    P.deleting = false;
  }
}
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "cardForm") {
    readForm(); if (!draft.name) { $("#f_name").focus(); return; }
    delete draft.example;
    if (draft.fromId && draft.origin === "productChange") { const old = S.cards.find(c => c.id === draft.fromId); if (old && old.status !== "changed") { old.status = "changed"; old.changedTo = draft.name; old.closedDate = draft.changeDate || iso(TODAY); } }
    const i = S.cards.findIndex(c => c.id === draft.id);
    if (i >= 0) S.cards[i] = draft; else S.cards.push(draft);
    const n = draft.name; closeEditor(); persist(); render(); toast("Saved " + n);
  } else if (e.target.dataset.logform) {
    const f = e.target, c = S.cards.find(x => x.id === f.dataset.card), cr = c.credits.find(x => x.id === f.dataset.logform);
    const amt = num(f.amount.value); if (!amt) return;
    cr.log ||= []; cr.log.push({ id: uid(), date: f.date.value, amount: amt, place: f.place.value.trim(), note: f.note.value.trim() });
    cr.used = num(cr.used) + amt; persist(); render(); toast(`Logged ${money(amt)} at ${f.place.value.trim()}`);
  } else if (e.target.id === "profForm") {
    const n = $("#prof_name").value.trim(); if (!n) return;
    if (S.profiles.length === 1 && S.profiles[0].name === "Me" && $("#prof_me").value.trim()) S.profiles[0].name = $("#prof_me").value.trim();
    const id = uid(); S.profiles.push({ id, name: n }); S.activeProfile = id; closeEditor(); persist(); render(); toast(`Added ${n}. Add their cards with + Add card.`);
  } else if (e.target.id === "pf") {
    S.pulls.push({ id: uid(), date: $("#p_date").value, bureau: $("#p_bureau").value, issuer: $("#p_issuer").value.trim(), note: $("#p_note").value.trim(), owner: $("#p_owner") ? $("#p_owner").value : (S.activeProfile !== "all" ? S.activeProfile : S.profiles[0].id) }); persist(); render();
  } else if (e.target.id === "chatForm") {
    sendChat($("#chatQ").value);
  } else if (e.target.id === "rf") {
    S.research.push({ id: uid(), name: $("#r_name").value.trim(), issuer: $("#r_issuer").value.trim(), annualFee: num($("#r_fee").value), bonus: $("#r_bonus").value.trim(), status: "considering", notes: $("#r_notes").value.trim() }); persist(); render();
  }
});
let inputT;
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "askQ") { research.question = t.value; return; }
  if (t.id === "chatQ") { chat.draft = t.value; return; }
  if (t.dataset.mx) { const c = S.cards.find(x => x.id === t.dataset.mx); c.mult ||= {}; if (t.value === "") delete c.mult[t.dataset.cat]; else c.mult[t.dataset.cat] = num(t.value); clearTimeout(inputT); inputT = setTimeout(persist, 500); }
  if (t.dataset.credit) { const c = S.cards.find(x => x.id === t.dataset.card); const cr = c.credits.find(x => x.id === t.dataset.credit); cr.used = num(t.value); clearTimeout(inputT); inputT = setTimeout(persist, 500); }
  if (t.dataset.pv) { S.settings.pointValues[t.dataset.pv] = num(t.value); clearTimeout(inputT); inputT = setTimeout(persist, 500); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.credit) render();
  if (t.id === "f_status") { const gone = t.value !== "open"; document.querySelectorAll("[data-ended]").forEach(el => el.hidden = !gone); const i = $("#f_closed"); if (gone && i && !i.value) i.value = iso(TODAY); }
  if (t.id === "f_origin") document.querySelectorAll("[data-pc]").forEach(el => el.hidden = t.value !== "productChange");
  if (t.id === "tlSelect") { tlCard = t.value || null; render(); return; }
  if (t.dataset.tlclosed !== undefined) { tlShowClosed = t.checked; render(); return; }
  if (t.dataset.rstatus) { S.research.find(x => x.id === t.dataset.rstatus).status = t.value; persist(); }
  if (t.id === "importFile" && t.files[0]) { const r = new FileReader(); r.onload = () => { try { importState(JSON.parse(r.result)); } catch { toast("That file isn't a valid backup."); } }; r.readAsText(t.files[0]); }
});
document.addEventListener("keydown", e => { if (e.target && e.target.id === "chatQ" && e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) { e.preventDefault(); sendChat(e.target.value); return; } if (e.key === "Escape" && draft) closeEditor(); if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("ag")) { e.preventDefault(); e.target.click(); } });
document.addEventListener("click", e => {
  if (e.target.closest("[data-act]")) return;
  const j = e.target.closest("[data-jump]"); if (!j) return;
  const el = document.getElementById(j.dataset.jump); if (!el) return;
  if (el.tagName === "DETAILS" && !el.open) el.open = true;
  el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400);
});
document.addEventListener("toggle", e => { const d = e.target;
  if (d.dataset && d.dataset.keep) { FOLD.set(d.dataset.keep, d.open);
    if (d.dataset.keep === "tl-chart" && d.open) { const w = d.querySelector(".tl-wrap"), svg = w && w.querySelector("svg[data-today]"); if (svg && svg.scrollWidth > w.clientWidth) w.scrollLeft = Math.max(0, +svg.dataset.today - w.clientWidth / 2); }
    return; }
  if (d.dataset && d.dataset.later !== undefined) { tlLaterOpen = d.open; return; } if (!d.dataset || !d.dataset.plan) return; const id = d.dataset.plan; if (d.open) { tlOpen.add(id); tlClosed.delete(id); } else { tlOpen.delete(id); tlClosed.add(id); } }, true);
document.addEventListener("click", e => { if (e.target.id === "ovl") closeEditor(); });
$("#addCardTop").addEventListener("click", () => openEditor(blankCard(), true));
document.addEventListener("click", e => { if (e.target.id === "askBtn") runResearch(); if (e.target.id === "stopBtn" && research.ctl) research.ctl.abort(); });

initStorage();
