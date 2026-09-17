// Export / import
import { DOMAINS, CRITICALITY, ANSWERS, isOrg } from '../data/criteria.js';
import { computeScores, criterionValue, pct, effectiveAnswer, isDetached } from './scoring.js';
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
  const payload = { format: 'gwp-evaluation', version: 2, exportedAt: new Date().toISOString(), evaluation: ev, photos };
  download(`GWP_${slug(ev.info.organisation)}_${ev.info.date || ''}.json`, JSON.stringify(payload), 'application/json');
}

export async function exportAllJSON() {
  const list = store.loadAll();
  const all = [];
  for (const ev of list) all.push({ evaluation: ev, photos: await store.getPhotos(ev.id) });
  download(`GWP_toutes_evaluations_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'gwp-evaluations', version: 2, items: all }), 'application/json');
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
          const ev = store.migrate(it.evaluation);
          if (store.getEvaluation(ev.id) && !confirm(`Une évaluation « ${ev.info.organisation || ev.id} » existe déjà. La remplacer ?`)) continue;
          store.saveEvaluation(ev);
          if (it.photos?.length) { await store.deletePhotosOf(ev.id); await store.importPhotos(it.photos); }
          await store.migratePhotos(ev);
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

// CSV : un bloc de scores, puis une ligne par critère et par niveau (Organisation, puis chaque entrepôt)
export function exportCSV(ev) {
  const sc = computeScores(ev);
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const label = (c, a) => { const v = criterionValue(c, a); return a?.a === 'na' ? 'N/A' : v === null ? '' : c.type === 'checklist' ? Math.round(v * 100) + ' %' : ANSWERS[a.a].label; };
  const rows = [];
  rows.push(['Centrale', ev.info.organisation, 'Localisation', ev.info.location, 'Date', ev.info.date, 'Score consolidé', pct(sc.consolidated.overall), 'Entrepôts', ev.buildings.length].map(q).join(';'));
  rows.push('');
  rows.push(['Niveau', 'Domaine', 'Score complet', 'Score spécifique (constats)', 'Poids', 'Priorité', 'Répondus', 'Total'].map(q).join(';'));
  for (const d of sc.consolidated.domains) rows.push(['Centrale (consolidé)', d.code + ' ' + d.title, pct(d.score), '', Math.round(d.weight * 100) + ' %', d.priority === null ? '' : (d.priority * 100).toFixed(1), d.answered, d.total].map(q).join(';'));
  for (const b of sc.buildings) for (let i = 0; i < b.full.domains.length; i++) { const d = b.full.domains[i], s = b.site.domains[i]; rows.push([b.building.name, d.code + ' ' + d.title, pct(d.score), pct(s.score), Math.round(d.weight * 100) + ' %', d.priority === null ? '' : (d.priority * 100).toFixed(1), d.answered, d.total].map(q).join(';')); }
  rows.push('');
  rows.push(['Niveau', 'ID', 'Portée', 'Domaine', 'Section', 'Criticité', 'Critère', 'Réponse', 'Valeur', 'Observation', 'Référence', 'Recommandation'].map(q).join(';'));
  for (const d of DOMAINS) for (const s of d.sections) for (const c of s.criteria) {
    if (!isOrg(c)) continue;
    const a = ev.orgAnswers[c.id] || {}; const v = criterionValue(c, a);
    rows.push(['Organisation', c.id, 'Organisation', d.code + ' ' + d.title, s.title, CRITICALITY[c.crit].label, c.text, label(c, a), v === null ? '' : v, a.note || '', c.ref || '', v !== null && v < 1 ? c.reco || '' : ''].map(q).join(';'));
  }
  for (const b of ev.buildings) for (const d of DOMAINS) for (const s of d.sections) for (const c of s.criteria) {
    if (isOrg(c) && !isDetached(b, c)) continue;
    const a = effectiveAnswer(ev, b, c) || {}; const v = criterionValue(c, a);
    rows.push([b.name, c.id, isOrg(c) ? 'Organisation (détaché)' : 'Entrepôt', d.code + ' ' + d.title, s.title, CRITICALITY[c.crit].label, c.text, label(c, a), v === null ? '' : v, a.note || '', c.ref || '', v !== null && v < 1 ? c.reco || '' : ''].map(q).join(';'));
  }
  download(`GWP_${slug(ev.info.organisation)}_${ev.info.date || ''}.csv`, '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
}
