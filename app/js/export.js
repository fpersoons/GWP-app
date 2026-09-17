// Export / import
import { DOMAINS, CRITICALITY, ANSWERS } from '../data/criteria.js';
import { computeScores, criterionValue, pct } from './scoring.js';
import * as store from './store.js';

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const slug = s => (s || 'evaluation').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export async function exportJSON(ev) {
  const photos = await store.getPhotos(ev.id);
  const payload = { format: 'gwp-evaluation', version: 1, exportedAt: new Date().toISOString(), evaluation: ev, photos };
  download(`GWP_${slug(ev.info.warehouse)}_${ev.info.date || ''}.json`, JSON.stringify(payload), 'application/json');
}

export async function exportAllJSON() {
  const list = store.loadAll();
  const all = [];
  for (const ev of list) all.push({ evaluation: ev, photos: await store.getPhotos(ev.id) });
  download(`GWP_toutes_evaluations_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'gwp-evaluations', version: 1, items: all }), 'application/json');
}

export function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const data = JSON.parse(r.result);
        const items = data.format === 'gwp-evaluations' ? data.items : data.format === 'gwp-evaluation' ? [data] : null;
        if (!items) throw new Error('format non reconnu');
        let last = null;
        for (const it of items) {
          const ev = it.evaluation;
          if (store.getEvaluation(ev.id) && !confirm(`Une évaluation « ${ev.info.warehouse || ev.id} » existe déjà. La remplacer ?`)) continue;
          store.saveEvaluation(ev);
          if (it.photos?.length) { await store.deletePhotosOf(ev.id); await store.importPhotos(it.photos); }
          last = ev;
        }
        if (!last) throw new Error('rien importé');
        resolve(last);
      } catch (e) { reject(e); }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function exportCSV(ev) {
  const sc = computeScores(ev);
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const rows = [];
  rows.push(['Entrepôt', ev.info.warehouse, 'Organisation', ev.info.organisation, 'Date', ev.info.date, 'Score global', pct(sc.overall)].map(q).join(';'));
  rows.push('');
  rows.push(['Domaine', 'Score', 'Poids', 'Priorité', 'Répondus', 'Total'].map(q).join(';'));
  for (const d of sc.domains) rows.push([d.code + ' ' + d.title, pct(d.score), Math.round(d.weight * 100) + ' %', d.priority === null ? '' : (d.priority * 100).toFixed(1), d.answered, d.total].map(q).join(';'));
  rows.push('');
  rows.push(['ID', 'Domaine', 'Section', 'Criticité', 'Critère', 'Réponse', 'Valeur', 'Observation', 'Référence', 'Recommandation'].map(q).join(';'));
  for (const d of DOMAINS) for (const s of d.sections) for (const c of s.criteria) {
    const a = ev.answers[c.id] || {};
    const v = criterionValue(c, a);
    const lab = a.a === 'na' ? 'N/A' : v === null ? '' : c.type === 'checklist' ? Math.round(v * 100) + ' %' : ANSWERS[a.a].label;
    rows.push([c.id, d.code + ' ' + d.title, s.title, CRITICALITY[c.crit].label, c.text, lab, v === null ? '' : v, a.note || '', c.ref || '', v !== null && v < 1 ? c.reco || '' : ''].map(q).join(';'));
  }
  download(`GWP_${slug(ev.info.warehouse)}_${ev.info.date || ''}.csv`, '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
}
