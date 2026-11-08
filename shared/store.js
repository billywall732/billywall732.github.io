// The data layer both apps use. One async API, whatever the backend:
//   list(collection)            every record in a collection (trips, stays…)
//   put(collection, record)     add or replace a record (gives it an id if it has none)
//   remove(collection, id)
//   getDoc(name) / setDoc(name, value)   single documents (profile, wallet)
//   subscribe(fn)               called after any change, with the collection or doc name
//   reset(seed)                 replace everything (demo: load sample data; import)
//
// Two backends:
//   demo     in memory: nothing is saved and a reload starts over (everyone not approved)
//   account  the signed-in member's own rows in Supabase (app_records / app_docs), for people
//            approved for that app. Row-level security keeps each member to their own rows;
//            the tables and their tests live in the private offthewall-db repo.
// connectStore(app) picks the backend once, when the page starts.
import { loadAuth, mightBeSignedIn } from './auth-loader.js';

const copy = (v) => (v === undefined ? v : structuredClone(v));
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function memoryBackend() {
  let cols = {}, docs = {};
  return {
    mode: 'demo',
    async list(c) { return Object.values(cols[c] ?? {}).map(copy); },
    async put(c, rec) { const r = { ...copy(rec) }; r.id ||= newId(); (cols[c] ??= {})[r.id] = r; return copy(r); },
    async remove(c, id) { if (cols[c]) delete cols[c][id]; },
    async getDoc(n) { return copy(docs[n] ?? null); },
    async setDoc(n, v) { docs[n] = copy(v); },
    async reset(seed = {}) {
      cols = {}; docs = {};
      for (const [c, recs] of Object.entries(seed.collections ?? {})) for (const r of recs) (cols[c] ??= {})[r.id ||= newId()] = copy(r);
      for (const [n, v] of Object.entries(seed.docs ?? {})) docs[n] = copy(v);
    },
  };
}

// Supabase answers { data, error } instead of throwing: make errors throw
async function must(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

function accountBackend(app, db, userId) {
  const records = () => db.from('app_records');
  const documents = () => db.from('app_docs');
  const asRecord = (c, r) => ({ user_id: userId, app, collection: c, id: String(r.id), data: r });
  return {
    mode: 'account',
    async list(c) {
      return (await must(records().select('id, data').eq('app', app).eq('collection', c))).map((row) => ({ ...row.data, id: row.id }));
    },
    async put(c, rec) {
      const r = { ...copy(rec) };
      r.id ||= newId();
      await must(records().upsert(asRecord(c, r)));
      return copy(r);
    },
    async remove(c, id) { await must(records().delete().eq('app', app).eq('collection', c).eq('id', String(id))); },
    async getDoc(n) {
      const row = await must(documents().select('data').eq('app', app).eq('name', n).maybeSingle());
      return row ? copy(row.data) : null;
    },
    async setDoc(n, v) { await must(documents().upsert({ user_id: userId, app, name: n, data: copy(v) })); },
    // Restoring a backup: write the new data first, then remove what it doesn't have, so a
    // failure part-way never leaves the account empty.
    async reset(seed = {}) {
      const keep = new Set();
      const rows = [];
      for (const [c, recs] of Object.entries(seed.collections ?? {})) {
        for (const rec of recs) { const r = { ...copy(rec) }; r.id ||= newId(); rows.push(asRecord(c, r)); keep.add(`${c}\u0000${r.id}`); }
      }
      for (let i = 0; i < rows.length; i += 500) await must(records().upsert(rows.slice(i, i + 500)));
      const docRows = Object.entries(seed.docs ?? {}).map(([n, v]) => ({ user_id: userId, app, name: n, data: copy(v) }));
      if (docRows.length) await must(documents().upsert(docRows));
      const existing = await must(records().select('collection, id').eq('app', app));
      const stale = existing.filter((row) => !keep.has(`${row.collection}\u0000${row.id}`));
      for (const c of new Set(stale.map((row) => row.collection))) {
        const ids = stale.filter((row) => row.collection === c).map((row) => row.id);
        for (let i = 0; i < ids.length; i += 200) await must(records().delete().eq('app', app).eq('collection', c).in('id', ids.slice(i, i + 200)));
      }
      const docNames = new Set(docRows.map((row) => row.name));
      const oldDocs = (await must(documents().select('name').eq('app', app))).filter((row) => !docNames.has(row.name));
      for (const row of oldDocs) await must(documents().delete().eq('app', app).eq('name', row.name));
    },
  };
}

let backend = memoryBackend();
const listeners = new Set();
const changed = (what) => { for (const fn of listeners) fn(what); };

export const store = {
  get mode() { return backend.mode; },
  list: (c) => backend.list(c),
  put: async (c, rec) => { const r = await backend.put(c, rec); changed(c); return r; },
  remove: async (c, id) => { await backend.remove(c, id); changed(c); },
  getDoc: (n) => backend.getDoc(n),
  setDoc: async (n, v) => { await backend.setDoc(n, v); changed(n); },
  reset: async (seed) => { await backend.reset(seed); changed('*'); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// Where the visitor stands, for the banner:
//   signed-out | not-approved | requested | member | error
export const access = { app: null, state: 'signed-out', user: null };

// Decide the backend for this page: the member's own data if they're signed in and approved
// for this app, otherwise the demo.
export async function connectStore(app) {
  access.app = app;
  if (!mightBeSignedIn()) return access;
  try {
    const auth = await loadAuth();
    const user = await auth.ready;
    if (!user) return access;
    access.user = user;
    if (await must(auth.db.rpc('is_app_member', { p_app: app }))) {
      backend = accountBackend(app, auth.db, user.id);
      access.state = 'member';
    } else {
      const asked = await must(auth.db.from('access_requests').select('app').eq('app', app).maybeSingle());
      access.state = asked ? 'requested' : 'not-approved';
    }
  } catch (err) {
    console.error('Couldn’t check access', err);
    access.state = 'error';
  }
  return access;
}

// Another app's data for the same member (Wallet reads Contrail's trips for its travel
// profile). null unless the signed-in person is approved for that app too.
export async function readAppData(app) {
  if (access.state !== 'member') return null;
  try {
    const auth = await loadAuth();
    if (!(await must(auth.db.rpc('is_app_member', { p_app: app })))) return null;
    const other = accountBackend(app, auth.db, access.user.id);
    return { collections: { trips: await other.list('trips'), stays: await other.list('stays') }, docs: { profile: await other.getDoc('profile') } };
  } catch {
    return null;
  }
}
