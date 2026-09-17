// Persistance locale : évaluations dans localStorage, photos dans IndexedDB
import { DOMAINS, BUILDING_TYPES, allCriteria, isOrg, SITE_FIELDS } from '../data/criteria.js';

const KEY = 'gwp.evaluations.v1';
const SETTINGS_KEY = 'gwp.settings.v1';

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

export function loadAll() {
  let list; try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { list = []; }
  let changed = false;
  list = list.map(e => { if (e.schema === 2) return e; changed = true; return migrate(e); });
  if (changed) saveAll(list);
  return list;
}

// Migration v1 → v2 : une évaluation « un entrepôt » devient une centrale à un seul entrepôt.
// Les réponses de portée 'org' passent au niveau centrale, les autres restent sur l'entrepôt.
export function migrate(e) {
  if (e.schema === 2) return e;
  const orgAnswers = {}, siteAnswers = {};
  for (const c of allCriteria()) { const a = (e.answers || {})[c.id]; if (!a) continue; (isOrg(c) ? orgAnswers : siteAnswers)[c.id] = a; }
  const info = { ...(e.info || {}) };
  const bInfo = {};
  for (const f of SITE_FIELDS) if (info[f.id] !== undefined) { bInfo[f.id] = info[f.id]; delete info[f.id]; }
  if (info.notes && !bInfo.site_notes) { /* les remarques générales restent au niveau centrale */ }
  const building = { id: uid(), name: bInfo.warehouse || 'Entrepôt principal', type: 'sec', info: bInfo, answers: siteAnswers, detached: {} };
  return { id: e.id, schema: 2, createdAt: e.createdAt, updatedAt: e.updatedAt, info, weights: e.weights, consolidation: 'area', orgAnswers, buildings: [building], photosMigrated: false };
}

// Migration des photos v1 (clé = critId) vers les clés v2 (« org:I01 » ou « <bid>:I01 »). Appelée à l'ouverture.
export async function migratePhotos(ev) {
  if (ev.photosMigrated !== false) return;
  const b = ev.buildings[0];
  const photos = await getPhotos(ev.id);
  for (const p of photos) {
    if (p.critId.includes(':')) continue;
    const c = allCriteria().find(x => x.id === p.critId);
    p.critId = c && isOrg(c) ? `org:${p.critId}` : `${b.id}:${p.critId}`;
    await tx('readwrite', st => st.put(p));
  }
  ev.photosMigrated = true; saveEvaluation(ev);
}

export function newBuilding(ev, name = '', type = 'sec') {
  const b = { id: uid(), name, type, info: {}, answers: {}, detached: {} };
  applyTypePreset(b, type);
  return b;
}
// Pré-réglage N/A du type d'entrepôt (n'écrase pas une réponse déjà donnée)
export function applyTypePreset(b, type) {
  const t = BUILDING_TYPES.find(x => x.id === type); if (!t) return;
  for (const id of t.na) { if (!b.answers[id] || !b.answers[id].a) b.answers[id] = { ...(b.answers[id] || {}), a: 'na' }; }
}
export function saveAll(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

export function getEvaluation(id) { return loadAll().find(e => e.id === id) || null; }

export function saveEvaluation(ev) {
  const list = loadAll();
  ev.updatedAt = new Date().toISOString();
  const i = list.findIndex(e => e.id === ev.id);
  if (i >= 0) list[i] = ev; else list.unshift(ev);
  saveAll(list);
  return ev;
}

export function deleteEvaluation(id) {
  saveAll(loadAll().filter(e => e.id !== id));
  deletePhotosOf(id);
}

export function newEvaluation() {
  const settings = loadSettings();
  return {
    id: uid(), schema: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    info: { date: new Date().toISOString().slice(0, 10) },
    weights: { ...settings.weights },
    consolidation: 'area',
    orgAnswers: {},
    buildings: [],
  };
}

export function loadSettings() {
  const def = { weights: Object.fromEntries(DOMAINS.map(d => [d.id, d.weight])) };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
}
export function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ---------- Photos (IndexedDB) ----------
const DB_NAME = 'gwp-photos', STORE = 'photos';
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const st = db.createObjectStore(STORE, { keyPath: 'id' });
      st.createIndex('byEval', 'evalId');
      st.createIndex('byCrit', ['evalId', 'critId']);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const r = fn(st);
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : r);
    t.onerror = () => reject(t.error);
  }));
}
export async function addPhoto(evalId, critId, dataUrl) {
  const p = { id: uid(), evalId, critId, dataUrl, at: new Date().toISOString() };
  await tx('readwrite', st => st.put(p));
  return p;
}
export function photoKey(building, critId) { return building ? `${building.id}:${critId}` : `org:${critId}`; }
export function getPhotos(evalId, critId) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const st = db.transaction(STORE).objectStore(STORE);
    const req = critId ? st.index('byCrit').getAll([evalId, critId]) : st.index('byEval').getAll(evalId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}
export function deletePhoto(id) { return tx('readwrite', st => st.delete(id)); }
export async function deletePhotosOf(evalId) {
  const list = await getPhotos(evalId);
  for (const p of list) await deletePhoto(p.id);
}
export async function importPhotos(list) {
  for (const p of list) await tx('readwrite', st => st.put(p));
}

// Redimensionne une image (File) en dataURL JPEG ≤ maxSide px
export function resizeImage(file, maxSide = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}
