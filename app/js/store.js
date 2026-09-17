// Persistance locale : évaluations dans localStorage, photos dans IndexedDB
import { DOMAINS } from '../data/criteria.js';

const KEY = 'gwp.evaluations.v1';
const SETTINGS_KEY = 'gwp.settings.v1';

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

export function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
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
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    info: { date: new Date().toISOString().slice(0, 10) },
    answers: {},
    weights: { ...settings.weights },
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
