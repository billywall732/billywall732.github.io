// The data layer both apps use. One async API, whatever the backend:
//   list(collection)            every record in a collection (trips, stays…)
//   put(collection, record)     add or replace a record (gives it an id if it has none)
//   remove(collection, id)
//   getDoc(name) / setDoc(name, value)   single documents (profile, wallet)
//   subscribe(fn)               called after any change, with the collection or doc name
//   reset(seed)                 replace everything (demo: load sample data; import)
// Phase 1 has only the in-memory demo backend: nothing is saved and a reload starts over.
// Phase 2 adds a Firestore backend behind the same functions.

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

const backend = memoryBackend();
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
