import { DOMAINS, CRITICALITY, ANSWERS, TIERS, IDENTIFICATION_FIELDS, criteriaCount, allCriteria } from '../data/criteria.js';
import { computeScores, nonConformities, pct, tierOf, isAnswered, criterionValue } from './scoring.js';
import * as store from './store.js';
import { exportJSON, exportCSV, importJSONFile } from './export.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let current = null; // évaluation en cours d'édition
let saveTimer = null;
function persist() {
  if (!current) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store.saveEvaluation(current); flash('Enregistré'); }, 300);
}
function flash(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1200);
}

// ---------------- Router ----------------
function route() {
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (parts[0] === 'eval' && parts[1]) {
    current = store.getEvaluation(parts[1]);
    if (!current) { location.hash = '/'; return; }
    const view = parts[2] || 'info';
    if (view === 'info') return renderInfo();
    if (view === 'domain') return renderDomain(parts[3] || DOMAINS[0].id);
    if (view === 'summary') return renderSummary();
    if (view === 'report') return renderReport();
    if (view === 'photos') return renderPhotos();
  }
  current = null;
  if (parts[0] === 'compare') return renderCompare();
  if (parts[0] === 'settings') return renderSettings();
  if (parts[0] === 'referentiel') return renderReferentiel();
  if (parts[0] === 'about') return renderAbout();
  return renderHome();
}
window.addEventListener('hashchange', route);

// ---------------- Layout ----------------
function shell(title, body, { nav = true, back = null } = {}) {
  app.innerHTML = `
    <header class="topbar">
      ${back ? `<a class="back" href="#${back}" aria-label="Retour">‹</a>` : `<span class="logo">GWP</span>`}
      <h1>${title}</h1>
      <nav class="topnav">
        <a href="#/" title="Accueil">🏠</a>
        <a href="#/compare" title="Comparer">📊</a>
        <a href="#/referentiel" title="Référentiel">📚</a>
        <a href="#/settings" title="Paramètres">⚙️</a>
      </nav>
    </header>
    ${nav && current ? evalTabs() : ''}
    <main class="content">${body}</main>`;
  scrollActiveTab();
}
function scrollActiveTab() {
  const active = app.querySelector('.tab.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function evalTabs() {
  const sc = computeScores(current);
  const hash = location.hash;
  const tab = (href, label, extra = '') => `<a class="tab ${hash.startsWith('#' + href) ? 'active' : ''}" href="#${href}">${label}${extra}</a>`;
  const id = current.id;
  return `<nav class="tabs">
    ${tab(`/eval/${id}/info`, 'Identification')}
    ${sc.domains.map(d => tab(`/eval/${id}/domain/${d.id}`, `<span class="code" style="background:${d.color}">${d.code}</span> ${d.short}`, ` <small>${d.answered}/${d.total}</small>`)).join('')}
    ${tab(`/eval/${id}/summary`, '📈 Synthèse')}
    ${tab(`/eval/${id}/report`, '🖨 Rapport')}
  </nav>`;
}

// ---------------- Accueil ----------------
function renderHome() {
  const list = store.loadAll();
  const cards = list.map(e => {
    const sc = computeScores(e);
    const prog = Math.round(100 * sc.answered / sc.total);
    return `<a class="card eval-card" href="#/eval/${e.id}/info">
      <div class="card-head">
        <div>
          <div class="card-title">${esc(e.info.warehouse || 'Entrepôt sans nom')}</div>
          <div class="muted">${esc(e.info.organisation || '')} ${e.info.location ? '· ' + esc(e.info.location) : ''}</div>
        </div>
        <div class="score-bubble" style="background:${sc.tier ? sc.tier.color : '#999'}">${sc.overall === null ? '—' : Math.round(sc.overall * 100)}</div>
      </div>
      <div class="muted small">Évaluation du ${esc(e.info.date || '?')} · ${sc.answered}/${sc.total} critères (${prog} %)</div>
      <div class="progress"><div style="width:${prog}%"></div></div>
      <div class="mini-domains">${sc.domains.map(d => `<span title="${esc(d.title)}" style="background:${d.color}">${d.code} ${d.score === null ? '—' : Math.round(d.score * 100)}</span>`).join('')}</div>
      <div class="card-actions">
        <button class="btn small" data-action="dup" data-id="${e.id}">Dupliquer</button>
        <button class="btn small" data-action="export" data-id="${e.id}">Exporter JSON</button>
        <button class="btn small danger" data-action="del" data-id="${e.id}">Supprimer</button>
      </div>
    </a>`;
  }).join('');
  shell('Évaluation des Bonnes Pratiques d’Entreposage', `
    <div class="hero">
      <p>Outil d’évaluation de la conformité des entrepôts de produits de santé aux Bonnes Pratiques de Stockage et de Distribution (OMS TRS 1025, Annexe 7). ${criteriaCount()} critères répartis en ${DOMAINS.length} domaines fonctionnels.</p>
      <div class="row">
        <button class="btn primary big" id="new-eval">＋ Nouvelle évaluation</button>
        <label class="btn big">📂 Importer (JSON)<input type="file" id="import" accept="application/json" hidden></label>
      </div>
    </div>
    <h2>Évaluations enregistrées ${list.length ? `<small>(${list.length})</small>` : ''}</h2>
    ${list.length ? `<div class="cards">${cards}</div>` : '<p class="muted">Aucune évaluation. Créez-en une pour commencer.</p>'}
    <p class="muted small footnote">Les données sont stockées localement sur cet appareil (navigateur). Exportez régulièrement vos évaluations en JSON pour les sauvegarder ou les partager.</p>
  `, { nav: false });
  $('#new-eval').onclick = () => { const ev = store.saveEvaluation(store.newEvaluation()); location.hash = `/eval/${ev.id}/info`; };
  $('#import').onchange = async e => {
    try { const ev = await importJSONFile(e.target.files[0]); flash('Importé'); location.hash = `/eval/${ev.id}/info`; }
    catch (err) { alert('Import impossible : ' + err.message); }
  };
  app.querySelectorAll('[data-action]').forEach(b => b.onclick = async ev => {
    ev.preventDefault(); ev.stopPropagation();
    const id = b.dataset.id, e = store.getEvaluation(id);
    if (b.dataset.action === 'del') { if (confirm(`Supprimer l’évaluation « ${e.info.warehouse || 'sans nom'} » ? Cette action est irréversible.`)) { store.deleteEvaluation(id); renderHome(); } }
    if (b.dataset.action === 'dup') { const c = { ...structuredClone(e), id: store.uid(), createdAt: new Date().toISOString() }; c.info = { ...c.info, warehouse: (c.info.warehouse || '') + ' (copie)', date: new Date().toISOString().slice(0, 10) }; store.saveEvaluation(c); renderHome(); }
    if (b.dataset.action === 'export') exportJSON(e);
  });
}

// ---------------- Identification ----------------
function renderInfo() {
  const info = current.info;
  const field = f => {
    const v = info[f.id] ?? '';
    let input;
    if (f.type === 'select') input = `<select data-field="${f.id}"><option value="">—</option>${f.options.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea data-field="${f.id}" rows="2">${esc(v)}</textarea>`;
    else input = `<input type="${f.type}" data-field="${f.id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.type === 'number' ? 'inputmode="decimal" step="any"' : ''}>`;
    return `<label class="field ${f.type === 'textarea' ? 'wide' : ''}"><span>${esc(f.label)}${f.required ? ' *' : ''}</span>${input}</label>`;
  };
  const general = IDENTIFICATION_FIELDS.filter(f => !f.group);
  const surfaces = IDENTIFICATION_FIELDS.filter(f => f.group === 'Surfaces');
  const tot = ['area_receiving', 'area_storage', 'area_dispatch', 'area_quarantine', 'area_unusable'].reduce((a, k) => a + (parseFloat(info[k]) || 0), 0);
  shell('Identification', `
    <section class="panel">
      <h2>Entrepôt évalué</h2>
      <div class="grid">${general.map(field).join('')}</div>
    </section>
    <section class="panel">
      <h2>Surfaces et capacités</h2>
      <div class="grid">${surfaces.map(field).join('')}</div>
      <p class="muted">Surface totale (réception + stockage + expédition + quarantaine + inutilisables) : <b id="tot-area">${tot.toLocaleString('fr-FR')} m²</b>
      ${info.height ? ` · Volume approximatif : <b>${Math.round(tot * parseFloat(info.height)).toLocaleString('fr-FR')} m³</b>` : ''}</p>
    </section>
    <section class="panel">
      <h2>Pondération des domaines pour cette évaluation</h2>
      <p class="muted small">Par défaut : Infrastructure 15 %, Équipements 15 %, Opérations 15 %, Contrôle des stocks 25 %, Rappels 5 %, Management 25 %. Le total doit faire 100 %.</p>
      <div class="weights">${DOMAINS.map(d => `<label><span class="code" style="background:${d.color}">${d.code}</span> ${esc(d.short)} <input type="number" min="0" max="100" data-weight="${d.id}" value="${Math.round((current.weights[d.id] ?? d.weight) * 100)}"> %</label>`).join('')}
      <div class="muted" id="wsum"></div></div>
    </section>
    <div class="row end"><a class="btn primary big" href="#/eval/${current.id}/domain/${DOMAINS[0].id}">Commencer l’évaluation ›</a></div>
  `, { back: '/' });
  app.querySelectorAll('[data-field]').forEach(el => el.oninput = () => {
    current.info[el.dataset.field] = el.value; persist();
    if (el.dataset.field.startsWith('area') || el.dataset.field === 'height') {
      const t = ['area_receiving', 'area_storage', 'area_dispatch', 'area_quarantine', 'area_unusable'].reduce((a, k) => a + (parseFloat(current.info[k]) || 0), 0);
      $('#tot-area').textContent = t.toLocaleString('fr-FR') + ' m²';
    }
  });
  const updW = () => { const s = DOMAINS.reduce((a, d) => a + (parseFloat(app.querySelector(`[data-weight="${d.id}"]`).value) || 0), 0); $('#wsum').innerHTML = `Total : <b class="${Math.round(s) === 100 ? 'ok' : 'warn'}">${s} %</b>${Math.round(s) !== 100 ? ' — ajustez pour atteindre 100 %' : ''}`; };
  app.querySelectorAll('[data-weight]').forEach(el => el.oninput = () => { current.weights[el.dataset.weight] = (parseFloat(el.value) || 0) / 100; persist(); updW(); });
  updW();
}

// ---------------- Domaine (questionnaire) ----------------
function renderDomain(domainId) {
  const d = DOMAINS.find(x => x.id === domainId) || DOMAINS[0];
  const sc = computeScores(current).domains.find(x => x.id === d.id);
  const idx = DOMAINS.indexOf(d);
  const prev = DOMAINS[idx - 1], next = DOMAINS[idx + 1];
  const body = `
    <div class="domain-head" style="border-color:${d.color}">
      <h2><span class="code" style="background:${d.color}">${d.code}</span> ${esc(d.title)}</h2>
      <div class="domain-stats">
        <span>Score : <b>${pct(sc.score)}</b></span>
        <span>Répondu : <b>${sc.answered}/${sc.total}</b></span>
        <span>Poids : <b>${Math.round(sc.weight * 100)} %</b></span>
      </div>
    </div>
    ${d.sections.map(s => `
      <section class="section">
        <h3>${esc(s.title)} <small id="sec-${s.id}" class="muted"></small></h3>
        ${s.criteria.map(c => criterionCard(c)).join('')}
      </section>`).join('')}
    <div class="row between pager">
      ${prev ? `<a class="btn" href="#/eval/${current.id}/domain/${prev.id}">‹ ${esc(prev.short)}</a>` : `<a class="btn" href="#/eval/${current.id}/info">‹ Identification</a>`}
      ${next ? `<a class="btn primary" href="#/eval/${current.id}/domain/${next.id}">${esc(next.short)} ›</a>` : `<a class="btn primary" href="#/eval/${current.id}/summary">Synthèse ›</a>`}
    </div>`;
  shell(esc(current.info.warehouse || 'Évaluation'), body, { back: '/' });
  bindCriteria();
  refreshSectionScores(d);
}

function criterionCard(c) {
  const ans = current.answers[c.id] || {};
  const cr = CRITICALITY[c.crit];
  const btn = (k, label) => `<button class="ans ${k} ${ans.a === k ? 'on' : ''}" data-ans="${k}" data-crit="${c.id}">${label}</button>`;
  let answerUI;
  if (c.type === 'checklist') {
    const items = ans.items || [];
    answerUI = `<div class="checklist">${c.items.map((it, i) => `<label class="chk"><input type="checkbox" data-chk="${c.id}" data-i="${i}" ${items[i] ? 'checked' : ''}> ${esc(it)}</label>`).join('')}</div>
      <div class="answers">${btn('na', 'N/A')}<span class="muted small">Score = proportion d’items cochés</span></div>`;
  } else {
    answerUI = `<div class="answers">${btn('yes', '✓ Conforme')}${btn('partial', '◐ Partiel')}${btn('no', '✗ Non conforme')}${c.na ? btn('na', 'N/A') : ''}</div>`;
  }
  return `<article class="criterion ${isAnswered(c, ans) ? 'answered' : ''} ${ans.a || ''}" id="crit-${c.id}">
    <div class="crit-head">
      <span class="crit-id">${c.id}</span>
      <span class="badge crit-${c.crit}" title="${cr.label} (poids ${cr.weight})">${cr.label}</span>
      <button class="help" data-help="${c.id}" title="Aide / source">?</button>
    </div>
    <p class="crit-text">${esc(c.text)}</p>
    <div class="crit-help" id="help-${c.id}" hidden>
      <p><b>Comment vérifier :</b> ${esc(c.guide || '')}</p>
      <p><b>Référence :</b> ${esc(c.ref || '')}</p>
      <p><b>Recommandation si non conforme :</b> ${esc(c.reco || '')}</p>
    </div>
    ${answerUI}
    <div class="crit-extra">
      <textarea class="note" data-note="${c.id}" rows="1" placeholder="Observations, preuves, constats…">${esc(ans.note || '')}</textarea>
      <label class="btn small photo-btn">📷 <span id="pc-${c.id}">${ans.photos ? ans.photos : ''}</span><input type="file" accept="image/*" capture="environment" data-photo="${c.id}" hidden></label>
    </div>
    <div class="thumbs" id="thumbs-${c.id}"></div>
  </article>`;
}

function bindCriteria() {
  const map = Object.fromEntries(allCriteria().map(c => [c.id, c]));
  app.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => {
    const id = b.dataset.crit, k = b.dataset.ans;
    const ans = current.answers[id] || (current.answers[id] = {});
    ans.a = ans.a === k ? null : k;
    if (!ans.a) delete ans.a;
    persist();
    const card = $(`#crit-${id}`);
    card.querySelectorAll('[data-ans]').forEach(x => x.classList.toggle('on', x.dataset.ans === ans.a));
    card.className = `criterion ${isAnswered(map[id], ans) ? 'answered' : ''} ${ans.a || ''}`;
    refreshSectionScores();
  });
  app.querySelectorAll('[data-chk]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.chk, i = +cb.dataset.i;
    const ans = current.answers[id] || (current.answers[id] = {});
    ans.items = ans.items || map[id].items.map(() => false);
    ans.items[i] = cb.checked;
    if (ans.a === 'na') { delete ans.a; $(`#crit-${id} [data-ans="na"]`).classList.remove('on'); }
    persist();
    $(`#crit-${id}`).classList.add('answered');
    refreshSectionScores();
  });
  app.querySelectorAll('[data-note]').forEach(t => {
    const grow = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
    grow();
    t.oninput = () => { const ans = current.answers[t.dataset.note] || (current.answers[t.dataset.note] = {}); ans.note = t.value; persist(); grow(); };
  });
  app.querySelectorAll('[data-help]').forEach(b => b.onclick = () => { const h = $(`#help-${b.dataset.help}`); h.hidden = !h.hidden; });
  app.querySelectorAll('[data-photo]').forEach(inp => inp.onchange = async () => {
    const id = inp.dataset.photo, f = inp.files[0]; if (!f) return;
    const dataUrl = await store.resizeImage(f);
    await store.addPhoto(current.id, id, dataUrl);
    const ans = current.answers[id] || (current.answers[id] = {});
    ans.photos = (ans.photos || 0) + 1; persist();
    inp.value = '';
    loadThumbs(id);
  });
  // charger les vignettes existantes
  app.querySelectorAll('.criterion').forEach(card => { const id = card.id.replace('crit-', ''); if ((current.answers[id] || {}).photos) loadThumbs(id); });
}

async function loadThumbs(critId) {
  const photos = await store.getPhotos(current.id, critId);
  const el = $(`#thumbs-${critId}`); if (!el) return;
  $(`#pc-${critId}`).textContent = photos.length || '';
  el.innerHTML = photos.map(p => `<div class="thumb"><img src="${p.dataUrl}" alt="photo"><button data-delphoto="${p.id}" title="Supprimer">×</button></div>`).join('');
  el.querySelectorAll('[data-delphoto]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette photo ?')) return;
    await store.deletePhoto(b.dataset.delphoto);
    const ans = current.answers[critId]; ans.photos = Math.max(0, (ans.photos || 1) - 1); persist();
    loadThumbs(critId);
  });
  el.querySelectorAll('img').forEach(img => img.onclick = () => openLightbox(img.src));
}
function openLightbox(src) {
  const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${src}">`;
  lb.onclick = () => lb.remove(); document.body.appendChild(lb);
}

function refreshSectionScores(d) {
  const sc = computeScores(current);
  for (const dom of sc.domains) for (const s of dom.sections) {
    const el = $(`#sec-${CSS.escape(s.id)}`); if (el) el.textContent = `${s.answered}/${s.total} · ${pct(s.score)}`;
  }
  const dh = $('.domain-stats');
  if (dh) {
    const dd = sc.domains.find(x => location.hash.endsWith('/' + x.id));
    if (dd) dh.innerHTML = `<span>Score : <b>${pct(dd.score)}</b></span><span>Répondu : <b>${dd.answered}/${dd.total}</b></span><span>Poids : <b>${Math.round(dd.weight * 100)} %</b></span>`;
  }
  const tabs = $('.tabs');
  if (tabs) { const left = tabs.scrollLeft; tabs.outerHTML = evalTabs(); $('.tabs').scrollLeft = left; }
}

// ---------------- Synthèse ----------------
function radarSVG(domains, size = 320) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 40, n = domains.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * v * Math.cos(a), cy + r * v * Math.sin(a)]; };
  const rings = [0.25, 0.5, 0.75, 1].map(v => `<polygon points="${domains.map((_, i) => pt(i, v).join(',')).join(' ')}" class="ring"/>`).join('');
  const axes = domains.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="axis"/>`; }).join('');
  const poly = domains.map((d, i) => pt(i, d.score ?? 0).join(',')).join(' ');
  const labels = domains.map((d, i) => { const [x, y] = pt(i, 1.18); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="lbl" fill="${d.color}">${d.code} ${d.score === null ? '' : Math.round(d.score * 100)}</text>`; }).join('');
  const dots = domains.map((d, i) => { const [x, y] = pt(i, d.score ?? 0); return `<circle cx="${x}" cy="${y}" r="5" fill="${d.color}"/>`; }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="radar">${rings}${axes}<polygon points="${poly}" class="area"/>${dots}${labels}</svg>`;
}

function renderSummary() {
  const sc = computeScores(current);
  const ncs = nonConformities(current);
  const ranked = [...sc.domains].filter(d => d.priority !== null).sort((a, b) => b.priority - a.priority);
  const maxP = ranked[0]?.priority || 1;
  const body = `
    <div class="summary-top">
      <div class="panel overall">
        <div class="gauge" style="--c:${sc.tier ? sc.tier.color : '#999'}"><span>${sc.overall === null ? '—' : Math.round(sc.overall * 100)}<small>%</small></span></div>
        <div>
          <h2>Score global pondéré</h2>
          <p>${sc.tier ? `<b style="color:${sc.tier.color}">${sc.tier.label}</b> (${sc.tier.min}–${sc.tier.max} %)` : 'Non calculé'}</p>
          <p class="muted">${sc.answered}/${sc.total} critères renseignés${sc.answered < sc.total ? ` — <span class="warn">évaluation incomplète</span>` : ''}</p>
          <p class="muted small">Le score de chaque domaine pondère les critères par criticité (Critique ×3, Majeur ×2, Mineur ×1). Les critères « N/A » sont exclus. Le score global pondère les domaines selon les poids définis.</p>
        </div>
      </div>
      <div class="panel">${radarSVG(sc.domains)}</div>
    </div>

    <section class="panel">
      <h2>Scores par domaine et priorités d’amélioration</h2>
      <table class="tbl">
        <thead><tr><th>Domaine</th><th>Score</th><th>Palier</th><th>Poids</th><th>Priorité</th><th>Critiques NC</th></tr></thead>
        <tbody>${sc.domains.map(d => `<tr>
          <td><span class="code" style="background:${d.color}">${d.code}</span> ${esc(d.title)}<div class="muted small">${d.answered}/${d.total} répondus</div></td>
          <td><b>${pct(d.score)}</b><div class="bar"><div style="width:${(d.score || 0) * 100}%;background:${d.color}"></div></div></td>
          <td>${d.tier ? `<span class="tier" style="background:${d.tier.color}">${d.tier.label}</span>` : '—'}</td>
          <td>${Math.round(d.weight * 100)} %</td>
          <td>${d.priority === null ? '—' : `<b>${(d.priority * 100).toFixed(1)}</b><div class="bar"><div style="width:${d.priority / maxP * 100}%;background:#c0392b"></div></div>`}</td>
          <td>${d.critFails.length ? `<span class="badge crit-C">${d.critFails.length}</span>` : '0'}</td>
        </tr>`).join('')}</tbody>
      </table>
      <p class="muted small">Priorité = poids × (1 − score) : plus la valeur est élevée, plus le domaine mérite un effort de renforcement. Approche par paliers recommandée : viser d’abord 36 % dans tous les domaines, puis 71 %, puis 100 %.</p>
      <h3>Détail par section</h3>
      <div class="sections-grid">${sc.domains.map(d => `<div><h4 style="color:${d.color}">${d.code} ${esc(d.short)}</h4>${d.sections.map(s => `<div class="secline"><span>${esc(s.title)}</span><b>${pct(s.score)}</b><div class="bar"><div style="width:${(s.score || 0) * 100}%;background:${d.color}"></div></div></div>`).join('')}</div>`).join('')}</div>
    </section>

    <section class="panel">
      <h2>Non-conformités (${ncs.length}) ${sc.critFails.length ? `<span class="badge crit-C">${sc.critFails.length} critiques</span>` : ''}</h2>
      <p class="muted small">Classées par criticité. Cliquez sur une ligne pour retourner au critère.</p>
      ${ncs.length ? `<table class="tbl nc"><thead><tr><th>#</th><th>Crit.</th><th>Domaine</th><th>Constat</th><th>Réponse</th><th>Recommandation</th></tr></thead><tbody>
        ${ncs.map(c => `<tr class="clickable" data-go="/eval/${current.id}/domain/${c.domain.id}" data-anchor="crit-${c.id}">
          <td>${c.id}</td><td><span class="badge crit-${c.crit}">${CRITICALITY[c.crit].short}</span></td>
          <td><span class="code" style="background:${c.domain.color}">${c.domain.code}</span></td>
          <td>${esc(c.text)}${c.note ? `<div class="note-preview">📝 ${esc(c.note)}</div>` : ''}</td>
          <td>${c.value === 0 ? '<span class="tag no">Non conforme</span>' : c.value === 0.5 ? '<span class="tag partial">Partiel</span>' : `<span class="tag partial">${Math.round(c.value * 100)} %</span>`}</td>
          <td class="small">${esc(c.reco || '')}</td></tr>`).join('')}
      </tbody></table>` : '<p class="ok">Aucune non-conformité identifiée parmi les critères renseignés.</p>'}
    </section>

    <section class="panel">
      <h2>Exporter</h2>
      <div class="row">
        <button class="btn" id="exp-json">💾 JSON (sauvegarde / partage)</button>
        <button class="btn" id="exp-csv">📄 CSV (Excel)</button>
        <a class="btn" href="#/eval/${current.id}/report">🖨 Rapport imprimable / PDF</a>
        <a class="btn" href="#/eval/${current.id}/photos">🖼 Photos</a>
      </div>
    </section>`;
  shell(esc(current.info.warehouse || 'Synthèse'), body, { back: '/' });
  $('#exp-json').onclick = () => exportJSON(current);
  $('#exp-csv').onclick = () => exportCSV(current);
  app.querySelectorAll('[data-go]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.go; setTimeout(() => { const el = document.getElementById(tr.dataset.anchor); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); } }, 100); });
}

// ---------------- Rapport imprimable ----------------
async function renderReport() {
  const sc = computeScores(current);
  const ncs = nonConformities(current);
  const info = current.info;
  const photos = await store.getPhotos(current.id);
  const ranked = [...sc.domains].filter(d => d.priority !== null).sort((a, b) => b.priority - a.priority);
  const infoRows = IDENTIFICATION_FIELDS.filter(f => info[f.id]).map(f => `<tr><th>${esc(f.label)}</th><td>${esc(info[f.id])}</td></tr>`).join('');
  const body = `
    <div class="report">
      <div class="no-print row end"><button class="btn primary" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button></div>
      <h1>Rapport d’évaluation des Bonnes Pratiques d’Entreposage</h1>
      <p class="muted">${esc(info.organisation || '')} — <b>${esc(info.warehouse || '')}</b> ${info.location ? '· ' + esc(info.location) : ''} · ${esc(info.date || '')}</p>
      <div class="report-cols">
        <table class="tbl info"><tbody>${infoRows}</tbody></table>
        <div class="center">
          <div class="gauge" style="--c:${sc.tier ? sc.tier.color : '#999'}"><span>${sc.overall === null ? '—' : Math.round(sc.overall * 100)}<small>%</small></span></div>
          <p><b>${sc.tier ? sc.tier.label : ''}</b><br><span class="muted small">${sc.answered}/${sc.total} critères renseignés</span></p>
          ${radarSVG(sc.domains, 280)}
        </div>
      </div>
      <h2>1. Scores par domaine</h2>
      <table class="tbl"><thead><tr><th>Domaine</th><th>Score</th><th>Palier</th><th>Poids</th><th>Priorité</th><th>Répondus</th></tr></thead><tbody>
        ${sc.domains.map(d => `<tr><td>${d.code} ${esc(d.title)}</td><td><b>${pct(d.score)}</b></td><td>${d.tier ? d.tier.label : '—'}</td><td>${Math.round(d.weight * 100)} %</td><td>${d.priority === null ? '—' : (d.priority * 100).toFixed(1)}</td><td>${d.answered}/${d.total}</td></tr>`).join('')}
      </tbody></table>
      <p><b>Ordre de priorité d’amélioration :</b> ${ranked.map((d, i) => `${i + 1}. ${d.code} ${esc(d.short)}`).join(' · ')}</p>
      <h2>2. Scores par section</h2>
      <table class="tbl"><tbody>${sc.domains.map(d => d.sections.map(s => `<tr><td>${esc(s.title)}</td><td>${pct(s.score)}</td><td>${s.answered}/${s.total}</td></tr>`).join('')).join('')}</tbody></table>
      <h2>3. Non-conformités et plan d’action (${ncs.length})</h2>
      <table class="tbl nc"><thead><tr><th>#</th><th>Crit.</th><th>Constat</th><th>Réponse</th><th>Observation</th><th>Action recommandée</th><th>Resp.</th><th>Échéance</th></tr></thead><tbody>
        ${ncs.map(c => `<tr><td>${c.id}</td><td>${CRITICALITY[c.crit].label}</td><td>${esc(c.text)}</td><td>${c.value === 0 ? 'Non conforme' : 'Partiel'}</td><td>${esc(c.note)}</td><td>${esc(c.reco || '')}</td><td></td><td></td></tr>`).join('')}
      </tbody></table>
      <h2>4. Détail de tous les critères</h2>
      ${DOMAINS.map(d => `<h3>${d.code} ${esc(d.title)}</h3><table class="tbl small"><tbody>${d.sections.map(s => `<tr class="sec"><td colspan="4">${esc(s.title)}</td></tr>` + s.criteria.map(c => { const a = current.answers[c.id] || {}; const v = criterionValue(c, a); const lab = a.a === 'na' ? 'N/A' : v === null ? 'Non renseigné' : c.type === 'checklist' ? Math.round(v * 100) + ' %' : ANSWERS[a.a].label; return `<tr><td>${c.id}</td><td>${CRITICALITY[c.crit].short}</td><td>${esc(c.text)}${a.note ? `<div class="muted small">📝 ${esc(a.note)}</div>` : ''}</td><td class="${a.a || ''}">${lab}</td></tr>`; }).join('')).join('')}</tbody></table>`).join('')}
      ${photos.length ? `<h2>5. Photos (${photos.length})</h2><div class="photo-grid">${photos.map(p => `<figure><img src="${p.dataUrl}"><figcaption>${p.critId}</figcaption></figure>`).join('')}</div>` : ''}
      <p class="muted small">Référentiel : OMS TRS 1025 Annexe 7 (2020) — Bonnes pratiques de stockage et de distribution des produits médicaux ; OMS TRS 961 Annexe 9 ; USAID | DELIVER Guidelines for Warehousing Health Commodities ; PFSCM Pharmaceutical Wholesaler Site Inspection Checklist ; outil GWP GHSC-FTA.</p>
    </div>`;
  shell('Rapport', body, { back: `/eval/${current.id}/summary` });
}

async function renderPhotos() {
  const photos = await store.getPhotos(current.id);
  const map = Object.fromEntries(allCriteria().map(c => [c.id, c]));
  shell('Photos', `<section class="panel"><h2>${photos.length} photo(s)</h2><div class="photo-grid">${photos.map(p => `<figure><img src="${p.dataUrl}"><figcaption><b>${p.critId}</b> — ${esc(map[p.critId]?.text.slice(0, 80) || '')}…</figcaption></figure>`).join('') || '<p class="muted">Aucune photo.</p>'}</div></section>`, { back: `/eval/${current.id}/summary` });
  app.querySelectorAll('.photo-grid img').forEach(img => img.onclick = () => openLightbox(img.src));
}

// ---------------- Comparaison ----------------
function renderCompare() {
  const list = store.loadAll();
  const rows = list.map(e => ({ e, sc: computeScores(e) }));
  const body = list.length < 1 ? '<p class="muted">Aucune évaluation à comparer.</p>' : `
    <section class="panel">
      <h2>Comparaison des entrepôts</h2>
      <div class="scroll"><table class="tbl compare"><thead><tr><th>Entrepôt</th><th>Date</th><th>Global</th>${DOMAINS.map(d => `<th><span class="code" style="background:${d.color}">${d.code}</span><br><small>${esc(d.short)}</small></th>`).join('')}<th>NC crit.</th></tr></thead>
      <tbody>${rows.map(({ e, sc }) => `<tr><td><a href="#/eval/${e.id}/summary"><b>${esc(e.info.warehouse || 'Sans nom')}</b></a><div class="muted small">${esc(e.info.organisation || '')}</div></td><td>${esc(e.info.date || '')}</td>
        <td><span class="score-bubble small" style="background:${sc.tier ? sc.tier.color : '#999'}">${sc.overall === null ? '—' : Math.round(sc.overall * 100)}</span></td>
        ${sc.domains.map(d => `<td><span class="cell" style="background:${d.tier ? d.tier.color : '#ccc'}">${d.score === null ? '—' : Math.round(d.score * 100)}</span></td>`).join('')}
        <td>${sc.critFails.length}</td></tr>`).join('')}
      ${rows.length > 1 ? `<tr class="avg"><td colspan="2"><b>Moyenne</b></td><td><b>${avg(rows.map(r => r.sc.overall))}</b></td>${DOMAINS.map((d, i) => `<td><b>${avg(rows.map(r => r.sc.domains[i].score))}</b></td>`).join('')}<td></td></tr>` : ''}
      </tbody></table></div>
    </section>
    <section class="panel"><h2>Profils</h2><div class="radars">${rows.map(({ e, sc }) => `<div><h4>${esc(e.info.warehouse || 'Sans nom')}</h4>${radarSVG(sc.domains, 240)}</div>`).join('')}</div></section>`;
  shell('Comparaison', body, { back: '/' });
}
function avg(vals) { const v = vals.filter(x => x !== null && x !== undefined); return v.length ? Math.round(100 * v.reduce((a, b) => a + b, 0) / v.length) : '—'; }

// ---------------- Paramètres ----------------
function renderSettings() {
  const s = store.loadSettings();
  shell('Paramètres', `
    <section class="panel">
      <h2>Pondération par défaut des domaines</h2>
      <p class="muted small">Appliquée aux nouvelles évaluations (chaque évaluation peut ensuite ajuster ses poids).</p>
      <div class="weights">${DOMAINS.map(d => `<label><span class="code" style="background:${d.color}">${d.code}</span> ${esc(d.short)} <input type="number" min="0" max="100" data-w="${d.id}" value="${Math.round((s.weights[d.id] ?? d.weight) * 100)}"> %</label>`).join('')}</div>
      <div class="row"><button class="btn primary" id="save-w">Enregistrer</button><button class="btn" id="reset-w">Valeurs par défaut</button></div>
    </section>
    <section class="panel">
      <h2>Données</h2>
      <div class="row"><button class="btn" id="exp-all">💾 Exporter toutes les évaluations (JSON)</button>
      <button class="btn danger" id="wipe">Effacer toutes les données locales</button></div>
    </section>
    <section class="panel">
      <h2>À propos</h2>
      <p>Version 1.0 — ${criteriaCount()} critères. <a href="#/about">Méthodologie et sources</a>.</p>
    </section>`, { back: '/' });
  $('#save-w').onclick = () => { const w = {}; app.querySelectorAll('[data-w]').forEach(i => w[i.dataset.w] = (parseFloat(i.value) || 0) / 100); const tot = Object.values(w).reduce((a, b) => a + b, 0); if (Math.abs(tot - 1) > 0.001) { alert(`Le total doit être 100 % (actuellement ${Math.round(tot * 100)} %).`); return; } store.saveSettings({ ...s, weights: w }); flash('Enregistré'); };
  $('#reset-w').onclick = () => { store.saveSettings({ ...s, weights: Object.fromEntries(DOMAINS.map(d => [d.id, d.weight])) }); renderSettings(); };
  $('#exp-all').onclick = async () => { const { exportAllJSON } = await import('./export.js'); exportAllJSON(); };
  $('#wipe').onclick = () => { if (confirm('Effacer TOUTES les évaluations et photos de cet appareil ? Exportez d’abord vos données.')) { localStorage.clear(); indexedDB.deleteDatabase('gwp-photos'); location.hash = '/'; location.reload(); } };
}

// ---------------- Référentiel ----------------
function renderReferentiel() {
  shell('Référentiel des critères', `
    <section class="panel">
      <p>${criteriaCount()} critères. Criticité : <span class="badge crit-C">Critique ×3</span> <span class="badge crit-M">Majeur ×2</span> <span class="badge crit-m">Mineur ×1</span>. <a href="#/about">Méthodologie et sources ›</a></p>
      <input type="search" id="q" placeholder="Rechercher un critère, une référence (ex. TRS 1025 §12.23, FEFO, incendie)…" class="search">
    </section>
    <div id="ref-list">${DOMAINS.map(d => `<section class="panel ref-dom" data-dom="${d.id}"><h2><span class="code" style="background:${d.color}">${d.code}</span> ${esc(d.title)} <small class="muted">(poids ${Math.round(d.weight * 100)} %)</small></h2>
      ${d.sections.map(s => `<h3>${esc(s.title)}</h3><table class="tbl small ref"><tbody>${s.criteria.map(c => `<tr class="refrow"><td>${c.id}</td><td><span class="badge crit-${c.crit}">${CRITICALITY[c.crit].short}</span>${c.na ? '<div class="muted small">N/A possible</div>' : ''}</td><td><b>${esc(c.text)}</b>${c.items ? `<ul class="small">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}<div class="small"><i>Vérification :</i> ${esc(c.guide || '')}</div><div class="small muted">${esc(c.ref || '')}</div></td></tr>`).join('')}</tbody></table>`).join('')}</section>`).join('')}</div>`, { back: '/' });
  $('#q').oninput = () => { const q = $('#q').value.toLowerCase(); app.querySelectorAll('.refrow').forEach(r => r.hidden = q && !r.textContent.toLowerCase().includes(q)); };
}

function renderAbout() {
  shell('Méthodologie', `
    <section class="panel about">
      <h2>Objectif</h2>
      <p>Cet outil permet aux gestionnaires d’entrepôts de produits de santé et aux évaluateurs d’apprécier le degré de conformité aux Bonnes Pratiques d’Entreposage (Good Storage Practices), d’identifier les non-conformités et de prioriser les investissements et efforts d’amélioration. Il est conçu pour une utilisation sur tablette, en visite de site, y compris hors connexion.</p>
      <h2>Structure</h2>
      <p>Six domaines fonctionnels, hérités de l’outil GWP GHSC-FTA, enrichis des exigences de l’OMS (TRS 1025, Annexe 7, 2020) :</p>
      <ol>${DOMAINS.map(d => `<li><b>${esc(d.title)}</b> — ${d.sections.length} sections, ${d.sections.reduce((a, s) => a + s.criteria.length, 0)} critères, poids par défaut ${Math.round(d.weight * 100)} %</li>`).join('')}</ol>
      <h2>Notation</h2>
      <ul>
        <li>Chaque critère est noté <b>Conforme</b> (1), <b>Partiellement conforme</b> (0,5) ou <b>Non conforme</b> (0). Certains critères acceptent <b>N/A</b> (ex. chaîne du froid absente) et sont alors exclus du calcul.</li>
        <li>Chaque critère a une <b>criticité</b> issue de la logique PFSCM/OMS : Critique (×3, impact direct sur la qualité du produit ou la sécurité), Majeur (×2), Mineur (×1).</li>
        <li>Score d’un domaine = Σ(criticité × note) / Σ(criticité) sur les critères renseignés et applicables.</li>
        <li>Score global = moyenne des domaines pondérée par les poids (modifiables).</li>
        <li><b>Priorité d’amélioration</b> = poids × (1 − score). Approche par paliers : 0–35 %, 36–70 %, 71–100 % ; progresser palier par palier dans tous les domaines plutôt que d’exceller dans un seul.</li>
        <li>Les critères <b>critiques non conformes</b> sont mis en évidence quel que soit le score global : ils appellent une action immédiate.</li>
      </ul>
      <h2>Sources</h2>
      <ul>
        <li>OMS, <i>Good storage and distribution practices for medical products</i>, TRS 1025, Annexe 7, 2020.</li>
        <li>OMS, <i>Model guidance for the storage and transport of time- and temperature-sensitive pharmaceutical products</i>, TRS 961, Annexe 9, 2011, et ses suppléments techniques (cartographie, calibration, capacité de stockage).</li>
        <li>USAID | DELIVER PROJECT, <i>Guidelines for Warehousing Health Commodities</i>, 2014 (auto-évaluation et métriques).</li>
        <li>USAID | DELIVER PROJECT, <i>Warehouse Assessment Tool Questionnaire</i> (Nigeria TB Warehousing Assessment, 2009).</li>
        <li>PFSCM, <i>Pharmaceutical Wholesaler Site Inspection Checklist</i> (criticité C/M/O).</li>
        <li>GHSC-FTA, <i>Outil d’analyse de la conformité aux bonnes pratiques d’entreposage</i> (GWP_Assessment_FR.xlsx).</li>
        <li>GHSC-PSM, <i>National Supply Chain Assessment 2.0</i> — module Entreposage & Stockage du CMM.</li>
      </ul>
    </section>`, { back: '/' });
}

// ---------------- Init ----------------
document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
