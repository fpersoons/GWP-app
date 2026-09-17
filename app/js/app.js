import { DOMAINS, CRITICALITY, ANSWERS, ORG_FIELDS, SITE_FIELDS, BUILDING_TYPES, criteriaCount, allCriteria, isOrg } from '../data/criteria.js';
import { computeScores, scoreBuilding, scoreSiteOnly, scoreOrg, nonConformities, pct, isAnswered, criterionValue, isDetached } from './scoring.js';
import * as store from './store.js';
import { exportJSON, exportCSV, importJSONFile } from './export.js';
import { icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n === null || n === undefined || n === '' || isNaN(n)) ? '—' : Number(n).toLocaleString('fr-FR');
const critById = Object.fromEntries(allCriteria().map(c => [c.id, c]));
const domainOf = {}; for (const d of DOMAINS) for (const s of d.sections) for (const c of s.criteria) domainOf[c.id] = d;

let current = null;   // centrale en cours d'édition
let building = null;  // entrepôt en cours d'édition (null au niveau centrale)
let saveTimer = null;
function persist() {
  if (!current) return;
  clearTimeout(saveTimer);
  setSync('saving');
  saveTimer = setTimeout(() => { store.saveEvaluation(current); setSync('saved'); }, 300);
}
// §8.7 Indicateur de synchronisation dans le header
function setSync(state) {
  const el = $('#sync'); if (!el) return;
  el.className = 'sync ' + state;
  el.innerHTML = state === 'saving' ? 'Synchronisation…' : `${icon('cloudCheck', 12)} Sauvegardé`;
}
function flash(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1500);
}

// ---------------- Router ----------------
async function route() {
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  building = null;
  if (parts[0] === 'eval' && parts[1]) {
    current = store.getEvaluation(parts[1]);
    if (!current) { location.hash = '/'; return; }
    if (current.photosMigrated === false) await store.migratePhotos(current);
    const view = parts[2] || 'info';
    if (view === 'info') return renderInfo();
    if (view === 'org') return renderOrgDomain(parts[3] || DOMAINS[0].id);
    if (view === 'buildings') return renderBuildings();
    if (view === 'b' && parts[3]) {
      building = current.buildings.find(b => b.id === parts[3]);
      if (!building) { location.hash = `/eval/${current.id}/buildings`; return; }
      const sub = parts[4] || 'info';
      if (sub === 'info') return renderBuildingInfo();
      if (sub === 'domain') return renderBuildingDomain(parts[5] || DOMAINS[0].id);
    }
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
function shell(title, body, { nav = true, back = null, subnav = '' } = {}) {
  const hash = location.hash;
  app.innerHTML = `
    <header class="topbar">
      ${back ? `<a class="back" href="#${back}" aria-label="Retour">${icon('chevronLeft', 18)}</a>` : ''}
      <h1><span class="brand">${icon('warehouse', 16)}<span class="brand-text">GWP</span></span><span class="title-text">${title}</span></h1>
      ${current ? '<span id="sync" class="sync saved">' + icon('cloudCheck', 12) + ' Sauvegardé</span>' : ''}
      <nav class="topnav" aria-label="Navigation principale">
        <a href="#/" class="${hash === '' || hash === '#/' ? 'active' : ''}" title="Accueil" aria-label="Accueil">${icon('home', 16)}</a>
        <a href="#/compare" class="${hash.startsWith('#/compare') ? 'active' : ''}" title="Comparer les centrales" aria-label="Comparer les centrales">${icon('chart', 16)}</a>
        <a href="#/referentiel" class="${hash.startsWith('#/referentiel') ? 'active' : ''}" title="Référentiel des critères" aria-label="Référentiel des critères">${icon('book', 16)}</a>
        <a href="#/settings" class="${hash.startsWith('#/settings') ? 'active' : ''}" title="Paramètres" aria-label="Paramètres">${icon('settings', 16)}</a>
      </nav>
    </header>
    ${nav && current ? evalTabs() : ''}
    ${subnav}
    <main class="content">${body}</main>`;
  scrollActiveTabs();
}
function scrollActiveTabs() { app.querySelectorAll('.tabs .tab.active').forEach(a => a.scrollIntoView({ inline: 'center', block: 'nearest' })); }

const tabLink = (href, label, active) => `<a class="tab ${active ? 'active' : ''}" href="#${href}">${label}</a>`;
function evalTabs() {
  const hash = location.hash, id = current.id;
  const org = scoreOrg(current);
  const nb = current.buildings.length;
  return `<nav class="tabs" aria-label="Sections de l’évaluation">
    ${tabLink(`/eval/${id}/info`, 'Identification', hash.startsWith(`#/eval/${id}/info`))}
    ${tabLink(`/eval/${id}/org/${DOMAINS[0].id}`, `${icon('list', 12)} Organisation <small>${org.answered}/${org.total}</small>`, hash.startsWith(`#/eval/${id}/org`))}
    ${tabLink(`/eval/${id}/buildings`, `${icon('warehouse', 12)} Entrepôts <small>${nb}</small>`, hash.startsWith(`#/eval/${id}/buildings`) || hash.startsWith(`#/eval/${id}/b/`))}
    ${tabLink(`/eval/${id}/summary`, `${icon('chart', 12)} Synthèse`, hash.startsWith(`#/eval/${id}/summary`))}
    ${tabLink(`/eval/${id}/report`, `${icon('printer', 12)} Rapport`, hash.startsWith(`#/eval/${id}/report`))}
  </nav>`;
}
// Sous-onglets par domaine (organisation ou entrepôt)
function domainTabs(base, counts, activeId, extra = '') {
  return `<nav class="tabs sub" aria-label="Domaines">${extra}${DOMAINS.map(d => { const c = counts[d.id]; if (!c || !c.total) return ''; return tabLink(`${base}/${d.id}`, `<span class="code" style="--c:${d.color}">${d.code}</span> ${d.short} <small>${c.answered}/${c.total}</small>`, activeId === d.id); }).join('')}</nav>`;
}
function tierVars(t) { return t ? `--c:${t.color};--bg:${t.bg};--fg:${t.fg}` : '--c:#ADB2B6;--bg:#EBECED;--fg:#56565A'; }
const typeLabel = t => (BUILDING_TYPES.find(x => x.id === t) || BUILDING_TYPES[0]).label;
const scoreNum = r => r.overall === null || r.overall === undefined ? '—' : Math.round(r.overall * 100);

// ---------------- Accueil ----------------
function renderHome() {
  const list = store.loadAll();
  const cards = list.map(e => {
    const sc = computeScores(e);
    const c = sc.consolidated;
    const totalCrit = sc.org.total + sc.buildings.reduce((a, b) => a + b.site.total, 0);
    const doneCrit = sc.org.answered + sc.buildings.reduce((a, b) => a + b.site.answered, 0);
    const prog = totalCrit ? Math.round(100 * doneCrit / totalCrit) : 0;
    return `<a class="card eval-card" href="#/eval/${e.id}/info">
      <div class="card-head">
        <div>
          <div class="card-title">${esc(e.info.organisation || 'Centrale sans nom')}</div>
          <div class="muted">${e.info.location ? esc(e.info.location) + ' · ' : ''}${e.buildings.length} entrepôt${e.buildings.length > 1 ? 's' : ''}${e.buildings.length ? ' : ' + esc(e.buildings.map(b => b.name || '?').join(', ')) : ''}</div>
        </div>
        <div class="score-bubble" style="${tierVars(c.tier)}" title="Score consolidé">${scoreNum(c)}</div>
      </div>
      <div class="muted small">Évaluation du ${esc(e.info.date || '?')} · ${doneCrit}/${totalCrit} critères (${prog} %)</div>
      <div class="progress"><div style="width:${prog}%"></div></div>
      <div class="mini-domains">${c.domains.map(d => `<span class="code" title="${esc(d.title)}" style="--c:${d.color}">${d.code} ${d.score === null ? '—' : Math.round(d.score * 100)}</span>`).join('')}</div>
      <div class="card-actions">
        <button class="btn small" data-action="dup" data-id="${e.id}">${icon('copy', 11)} Dupliquer</button>
        <button class="btn small" data-action="export" data-id="${e.id}">${icon('download', 11)} Exporter JSON</button>
        <button class="btn small danger" data-action="del" data-id="${e.id}">${icon('trash', 11)} Supprimer</button>
      </div>
    </a>`;
  }).join('');
  shell('Évaluation des Bonnes Pratiques d’Entreposage', `
    <div class="hero">
      <div class="title">Évaluation des Bonnes Pratiques d’Entreposage</div>
      <p>Conformité des entrepôts de produits de santé aux Bonnes Pratiques de Stockage et de Distribution (OMS TRS 1025, Annexe 7) — ${criteriaCount()} critères en ${DOMAINS.length} domaines : 68 répondus une fois par centrale (organisation, procédures, système qualité), 86 constatés dans chaque entrepôt.</p>
      <div class="row">
        <button class="btn primary big" id="new-eval">${icon('plus', 14)} Nouvelle évaluation</button>
        <label class="btn big" tabindex="0">${icon('upload', 14)} Importer (JSON)<input type="file" id="import" accept="application/json" hidden></label>
      </div>
    </div>
    <h2>${icon('list', 14)} Centrales évaluées ${list.length ? `<small>(${list.length})</small>` : ''}</h2>
    ${list.length ? `<div class="cards">${cards}</div>` : '<p class="empty">Aucune évaluation — cliquez sur « Nouvelle évaluation ».</p>'}
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
    if (b.dataset.action === 'del') { if (confirm(`Supprimer l’évaluation « ${e.info.organisation || 'sans nom'} » (${e.buildings.length} entrepôt(s)) ?\nToutes les réponses et photos seront perdues.`)) { store.deleteEvaluation(id); renderHome(); } }
    if (b.dataset.action === 'dup') { const c = structuredClone(e); c.id = store.uid(); c.createdAt = new Date().toISOString(); c.photosMigrated = true; c.info = { ...c.info, organisation: (c.info.organisation || '') + ' (copie)', date: new Date().toISOString().slice(0, 10) }; c.buildings.forEach(b => { b.id = store.uid(); for (const a of Object.values(b.answers)) delete a.photos; }); for (const a of Object.values(c.orgAnswers)) delete a.photos; store.saveEvaluation(c); renderHome(); }
    if (b.dataset.action === 'export') exportJSON(e);
  });
}

// ---------------- Champs de formulaire ----------------
function fieldHTML(f, obj) {
  const v = obj[f.id] ?? '';
  let input;
  if (f.type === 'select') input = `<select data-field="${f.id}"><option value="">—</option>${f.options.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') input = `<textarea data-field="${f.id}" rows="2">${esc(v)}</textarea>`;
  else input = `<input type="${f.type}" data-field="${f.id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.type === 'number' ? 'inputmode="decimal" step="any"' : ''}>`;
  return `<label class="field ${f.type === 'textarea' ? 'wide' : ''}"><span>${esc(f.label)}${f.required ? ' *' : ''}</span>${input}</label>`;
}
function bindFields(obj, onChange) {
  app.querySelectorAll('[data-field]').forEach(el => el.oninput = () => { obj[el.dataset.field] = el.value; persist(); if (onChange) onChange(el.dataset.field); });
}

// ---------------- Identification de la centrale ----------------
function renderInfo() {
  const info = current.info;
  shell(esc(info.organisation || 'Nouvelle évaluation'), `
    <section class="panel">
      <h2>${icon('warehouse', 14)} Centrale / organisation évaluée</h2>
      <p class="muted small">Une évaluation couvre une centrale (organisation, procédures, système qualité — répondues une fois) et ses entrepôts (constats propres à chaque bâtiment).</p>
      <div class="grid">${ORG_FIELDS.map(f => fieldHTML(f, info)).join('')}</div>
    </section>
    <section class="panel">
      <h2>${icon('settings', 14)} Pondération des domaines</h2>
      <p class="muted small">Par défaut : Infrastructure 15 %, Équipements 15 %, Opérations 15 %, Contrôle des stocks 25 %, Rappels 5 %, Management 25 %. Le total doit faire 100 %.</p>
      <div class="weights">${DOMAINS.map(d => `<label><span class="code" style="--c:${d.color}">${d.code}</span> ${esc(d.short)} <input type="number" min="0" max="100" data-weight="${d.id}" value="${Math.round((current.weights[d.id] ?? d.weight) * 100)}"> %</label>`).join('')}
      <div class="muted" id="wsum"></div></div>
      <h3>Consolidation des entrepôts</h3>
      <label class="chk"><input type="radio" name="consol" value="area" ${current.consolidation !== 'mean' ? 'checked' : ''}> Pondérée par la surface de stockage de chaque entrepôt (recommandé)</label>
      <label class="chk"><input type="radio" name="consol" value="mean" ${current.consolidation === 'mean' ? 'checked' : ''}> Moyenne simple des entrepôts</label>
    </section>
    <div class="row end">
      <a class="btn" href="#/eval/${current.id}/buildings">${icon('warehouse', 12)} Entrepôts (${current.buildings.length})</a>
      <a class="btn primary big" href="#/eval/${current.id}/org/${DOMAINS[0].id}">Évaluer l’organisation ${icon('chevronRight', 14)}</a>
    </div>
  `, { back: '/' });
  bindFields(info, f => { if (f === 'organisation') $('.title-text').textContent = info.organisation || 'Nouvelle évaluation'; });
  const updW = () => { const s = DOMAINS.reduce((a, d) => a + (parseFloat(app.querySelector(`[data-weight="${d.id}"]`).value) || 0), 0); $('#wsum').innerHTML = `Total : <b class="${Math.round(s) === 100 ? 'ok' : 'warn'}">${s} %</b>${Math.round(s) !== 100 ? ' — ajustez pour atteindre 100 %' : ''}`; };
  app.querySelectorAll('[data-weight]').forEach(el => el.oninput = () => { current.weights[el.dataset.weight] = (parseFloat(el.value) || 0) / 100; persist(); updW(); });
  app.querySelectorAll('[name="consol"]').forEach(r => r.onchange = () => { current.consolidation = r.value; persist(); });
  updW();
}

// ---------------- Liste des entrepôts ----------------
function renderBuildings() {
  const sc = computeScores(current);
  const wtot = sc.weights.reduce((a, w) => a + w.w, 0);
  const rows = current.buildings.map((b, i) => {
    const r = sc.buildings[i];
    const nDet = Object.keys(b.detached || {}).length;
    return `<div class="card bcard">
      <div class="card-head">
        <div>
          <a class="card-title" href="#/eval/${current.id}/b/${b.id}/info">${esc(b.name || 'Entrepôt sans nom')}</a>
          <div class="muted small">${esc(typeLabel(b.type))}${b.info.area_storage ? ` · ${fmt(b.info.area_storage)} m² de stockage` : ''} · poids ${wtot ? Math.round(100 * sc.weights[i].w / wtot) : 0} %</div>
        </div>
        <div class="row" title="Score spécifique (constats) · score complet (avec organisation héritée)">
          <div class="score-bubble small" style="${tierVars(r.site.tier)}">${scoreNum(r.site)}</div>
          <div class="score-bubble small" style="${tierVars(r.full.tier)}">${scoreNum(r.full)}</div>
        </div>
      </div>
      <div class="muted small">${r.site.answered}/${r.site.total} constats renseignés${nDet ? ` · ${nDet} critère(s) d’organisation détaché(s)` : ''}</div>
      <div class="progress"><div style="width:${r.site.total ? Math.round(100 * r.site.answered / r.site.total) : 0}%"></div></div>
      <div class="mini-domains">${r.site.domains.filter(d => d.total).map(d => `<span class="code" title="${esc(d.title)} (constats)" style="--c:${d.color}">${d.code} ${d.score === null ? '—' : Math.round(d.score * 100)}</span>`).join('')}</div>
      <div class="card-actions">
        <a class="btn small primary" href="#/eval/${current.id}/b/${b.id}/domain/${DOMAINS[0].id}">${icon('chevronRight', 11)} Évaluer</a>
        <a class="btn small" href="#/eval/${current.id}/b/${b.id}/info">Fiche</a>
        <button class="btn small" data-bdup="${b.id}">${icon('copy', 11)} Dupliquer</button>
        <button class="btn small danger" data-bdel="${b.id}">${icon('trash', 11)} Supprimer</button>
      </div>
    </div>`;
  }).join('');
  shell(esc(current.info.organisation || 'Évaluation'), `
    <section class="panel">
      <h2>${icon('plus', 14)} Ajouter un entrepôt / bâtiment</h2>
      <div class="row">
        <input type="text" id="bname" placeholder="Nom (ex. Magasin K, Chambre froide 2–8 °C)" style="flex:2;min-width:220px">
        <select id="btype" style="flex:2;min-width:220px">${BUILDING_TYPES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select>
        <button class="btn primary" id="badd">${icon('plus', 12)} Ajouter</button>
      </div>
      <p class="muted small">Le type pré-coche « N/A » sur les critères sans objet (chaîne du froid, racks, chariots…) ; chaque réponse reste modifiable.</p>
    </section>
    <h2>${icon('warehouse', 14)} Entrepôts (${current.buildings.length}) <small class="muted">— bulles : score spécifique (constats) · score complet</small></h2>
    ${rows ? `<div class="cards">${rows}</div>` : '<p class="empty">Aucun entrepôt — ajoutez le premier bâtiment ci-dessus.</p>'}
  `, { back: `/eval/${current.id}/info` });
  const add = () => { const name = $('#bname').value.trim(); if (!name) { $('#bname').focus(); return; } const b = store.newBuilding(current, name, $('#btype').value); current.buildings.push(b); store.saveEvaluation(current); location.hash = `/eval/${current.id}/b/${b.id}/info`; };
  $('#badd').onclick = add; $('#bname').onkeydown = e => { if (e.key === 'Enter') add(); };
  app.querySelectorAll('[data-bdel]').forEach(b => b.onclick = () => { const x = current.buildings.find(y => y.id === b.dataset.bdel); if (confirm(`Supprimer l’entrepôt « ${x.name} » ?\nSes constats et photos seront perdus.`)) { current.buildings = current.buildings.filter(y => y.id !== x.id); store.saveEvaluation(current); renderBuildings(); } });
  app.querySelectorAll('[data-bdup]').forEach(b => b.onclick = () => { const x = current.buildings.find(y => y.id === b.dataset.bdup); const c = structuredClone(x); c.id = store.uid(); c.name = x.name + ' (copie)'; for (const a of Object.values(c.answers)) delete a.photos; current.buildings.push(c); store.saveEvaluation(current); renderBuildings(); });
}

// ---------------- Fiche d'un entrepôt ----------------
function buildingSubnav(activeDomain) {
  const site = scoreSiteOnly(current, building);
  const counts = Object.fromEntries(site.domains.map(d => [d.id, { answered: d.answered, total: d.total }]));
  // les critères d'organisation détachés comptent dans le domaine de l'entrepôt
  for (const id of Object.keys(building.detached || {})) { const c = critById[id], d = domainOf[id]; if (!c) continue; counts[d.id].total++; if (isAnswered(c, building.answers[id])) counts[d.id].answered++; }
  const sel = `<select class="bselect" id="bswitch" aria-label="Changer d’entrepôt">${current.buildings.map(b => `<option value="${b.id}" ${b.id === building.id ? 'selected' : ''}>${esc(b.name || 'Sans nom')}</option>`).join('')}</select>`;
  const fiche = tabLink(`/eval/${current.id}/b/${building.id}/info`, 'Fiche', activeDomain === null);
  return domainTabs(`/eval/${current.id}/b/${building.id}/domain`, counts, activeDomain, sel + fiche);
}
function bindBuildingSwitch(sub) { const s = $('#bswitch'); if (s) s.onchange = () => { location.hash = `/eval/${current.id}/b/${s.value}/${sub}`; }; }

function renderBuildingInfo() {
  const info = building.info;
  const general = SITE_FIELDS.filter(f => !f.group && f.id !== 'warehouse'), surfaces = SITE_FIELDS.filter(f => f.group === 'Surfaces');
  const total = () => ['area_receiving', 'area_storage', 'area_dispatch', 'area_quarantine', 'area_unusable'].reduce((a, k) => a + (parseFloat(info[k]) || 0), 0);
  const vol = () => info.height ? ` · Volume approximatif : <b>${fmt(Math.round(total() * parseFloat(info.height)))} m³</b>` : '';
  shell(esc(building.name || 'Entrepôt'), `
    <section class="panel">
      <h2>${icon('warehouse', 14)} Fiche de l’entrepôt</h2>
      <div class="grid">
        <label class="field"><span>Nom de l’entrepôt / bâtiment *</span><input type="text" id="bname" value="${esc(building.name)}"></label>
        <label class="field"><span>Type</span><select id="btype">${BUILDING_TYPES.map(t => `<option value="${t.id}" ${t.id === building.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
        ${general.map(f => fieldHTML(f, info)).join('')}
      </div>
    </section>
    <section class="panel">
      <h2>${icon('list', 14)} Surfaces et capacités</h2>
      <div class="grid">${surfaces.map(f => fieldHTML(f, info)).join('')}</div>
      <p class="muted">Surface totale : <b id="tot-area">${fmt(total())} m²</b><span id="vol">${vol()}</span> — la surface de stockage sert de poids dans la consolidation de la centrale.</p>
    </section>
    <div class="row end"><a class="btn primary big" href="#/eval/${current.id}/b/${building.id}/domain/${DOMAINS[0].id}">Évaluer cet entrepôt ${icon('chevronRight', 14)}</a></div>
  `, { back: `/eval/${current.id}/buildings`, subnav: buildingSubnav(null) });
  bindBuildingSwitch('info');
  bindFields(info, () => { $('#tot-area').textContent = fmt(total()) + ' m²'; $('#vol').innerHTML = vol(); });
  $('#bname').oninput = () => { building.name = $('#bname').value; persist(); $('.title-text').textContent = building.name || 'Entrepôt'; };
  $('#btype').onchange = () => { building.type = $('#btype').value; store.applyTypePreset(building, building.type); persist(); };
}

// ---------------- Questionnaires ----------------
// Réponses où écrire pour un critère : celles de l'entrepôt (critère 'site' ou 'org' détaché), sinon celles de la centrale
function answersFor(c) {
  if (building && (!isOrg(c) || isDetached(building, c))) return building.answers;
  return current.orgAnswers;
}
function criterionCard(c) {
  const inherited = !!building && isOrg(c) && !isDetached(building, c);
  const ans = (inherited ? current.orgAnswers[c.id] : answersFor(c)[c.id]) || {};
  const cr = CRITICALITY[c.crit];
  const glyph = { yes: 'checkCircle', partial: 'halfCircle', no: 'xCircle', na: 'minusCircle' };
  const btn = (k, label) => `<button class="ans ${k} ${ans.a === k ? 'on' : ''}" data-ans="${k}" data-crit="${c.id}" aria-pressed="${ans.a === k}" ${inherited ? 'disabled' : ''}>${icon(glyph[k], 16)} ${label}</button>`;
  let answerUI;
  if (c.type === 'checklist') {
    const items = ans.items || [];
    answerUI = `<div class="checklist">${c.items.map((it, i) => `<label class="chk"><input type="checkbox" data-chk="${c.id}" data-i="${i}" ${items[i] ? 'checked' : ''} ${inherited ? 'disabled' : ''}> ${esc(it)}</label>`).join('')}</div>
      <div class="answers">${btn('na', 'N/A')}<span class="muted small">Score = proportion d’items cochés</span></div>`;
  } else {
    answerUI = `<div class="answers">${btn('yes', 'Conforme')}${btn('partial', 'Partiel')}${btn('no', 'Non conforme')}${c.na ? btn('na', 'N/A') : ''}</div>`;
  }
  const scopeBadge = isOrg(c)
    ? (inherited ? `<span class="badge scope-org" title="Réponse de la centrale, héritée par cet entrepôt">${icon('list', 9)} Hérité de l’organisation</span>`
      : building ? `<span class="badge scope-detached" title="Réponse propre à cet entrepôt">${icon('warehouse', 9)} Spécifique à cet entrepôt</span>`
      : `<span class="badge scope-org">${icon('list', 9)} Organisation</span>`)
    : '';
  const detachBtn = building && isOrg(c)
    ? (inherited ? `<button class="btn small" data-detach="${c.id}">Réponse spécifique à cet entrepôt</button>` : `<button class="btn small" data-reattach="${c.id}">Reprendre la réponse de l’organisation</button>`)
    : '';
  const extra = inherited
    ? `<div class="crit-extra inherited-note"><span class="muted small">${ans.note ? icon('note', 10) + ' ' + esc(ans.note) : 'Se modifie dans l’onglet Organisation — ou détacher pour ce bâtiment.'}</span>${detachBtn}</div>`
    : `<div class="crit-extra">
      <textarea class="note" data-note="${c.id}" rows="1" placeholder="Observations, preuves, constats…">${esc(ans.note || '')}</textarea>
      <label class="btn small photo-btn" tabindex="0" aria-label="Ajouter une photo — ${c.id}">${icon('camera', 14)} <span id="pc-${c.id}">${ans.photos ? ans.photos : ''}</span><input type="file" accept="image/*" capture="environment" data-photo="${c.id}" hidden></label>
      ${detachBtn}
    </div>
    <div class="thumbs" id="thumbs-${c.id}"></div>`;
  return `<article class="criterion ${isAnswered(c, ans) ? 'answered' : ''} ${ans.a || ''} ${inherited ? 'inherited' : ''}" id="crit-${c.id}">
    <div class="crit-head">
      <span class="crit-id">${c.id}</span>
      <span class="badge crit-${c.crit}" title="${cr.label} (poids ${cr.weight})">${cr.label}</span>
      ${scopeBadge}
      <button class="help" data-help="${c.id}" title="Aide — ${c.id}" aria-label="Aide — ${c.id}" aria-expanded="false">${icon('info', 16)}</button>
    </div>
    <p class="crit-text">${esc(c.text)}</p>
    <div class="crit-help" id="help-${c.id}" hidden>
      <p><b>Comment vérifier :</b> ${esc(c.guide || '')}</p>
      <p><b>Référence :</b> ${esc(c.ref || '')}</p>
      <p><b>Recommandation si non conforme :</b> ${esc(c.reco || '')}</p>
    </div>
    ${answerUI}
    ${extra}
  </article>`;
}

function bindCriteria(onChange) {
  app.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => {
    const id = b.dataset.crit, k = b.dataset.ans, c = critById[id], bag = answersFor(c);
    const ans = bag[id] || (bag[id] = {});
    ans.a = ans.a === k ? null : k;
    if (!ans.a) delete ans.a;
    persist();
    const card = $(`#crit-${id}`);
    card.querySelectorAll('[data-ans]').forEach(x => { x.classList.toggle('on', x.dataset.ans === ans.a); x.setAttribute('aria-pressed', x.dataset.ans === ans.a); });
    card.className = `criterion ${isAnswered(c, ans) ? 'answered' : ''} ${ans.a || ''}`;
    onChange();
  });
  app.querySelectorAll('[data-chk]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.chk, i = +cb.dataset.i, c = critById[id], bag = answersFor(c);
    const ans = bag[id] || (bag[id] = {});
    ans.items = ans.items || c.items.map(() => false);
    ans.items[i] = cb.checked;
    if (ans.a === 'na') { delete ans.a; $(`#crit-${id} [data-ans="na"]`).classList.remove('on'); }
    persist();
    $(`#crit-${id}`).classList.add('answered');
    onChange();
  });
  app.querySelectorAll('[data-note]').forEach(t => {
    const grow = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
    grow();
    t.oninput = () => { const c = critById[t.dataset.note], bag = answersFor(c); const ans = bag[c.id] || (bag[c.id] = {}); ans.note = t.value; persist(); grow(); };
  });
  app.querySelectorAll('[data-help]').forEach(b => b.onclick = () => { const h = $(`#help-${b.dataset.help}`); h.hidden = !h.hidden; b.setAttribute('aria-expanded', String(!h.hidden)); });
  app.querySelectorAll('[data-photo]').forEach(inp => inp.onchange = async () => {
    const id = inp.dataset.photo, f = inp.files[0]; if (!f) return;
    const c = critById[id], bag = answersFor(c);
    const dataUrl = await store.resizeImage(f);
    await store.addPhoto(current.id, store.photoKey(bag === current.orgAnswers ? null : building, id), dataUrl);
    const ans = bag[id] || (bag[id] = {});
    ans.photos = (ans.photos || 0) + 1; persist();
    inp.value = '';
    loadThumbs(id);
  });
  app.querySelectorAll('[data-detach]').forEach(b => b.onclick = () => {
    const id = b.dataset.detach; building.detached = building.detached || {}; building.detached[id] = true;
    building.answers[id] = structuredClone(current.orgAnswers[id] || {}); delete building.answers[id].photos;
    persist(); rerenderCard(id, onChange);
  });
  app.querySelectorAll('[data-reattach]').forEach(b => b.onclick = () => {
    const id = b.dataset.reattach;
    if (!confirm('Reprendre la réponse de l’organisation ?\nLa réponse spécifique de cet entrepôt sera supprimée.')) return;
    delete building.detached[id]; delete building.answers[id];
    persist(); rerenderCard(id, onChange);
  });
  app.querySelectorAll('.criterion:not(.inherited)').forEach(card => { const id = card.id.replace('crit-', ''); const c = critById[id]; if ((answersFor(c)[id] || {}).photos) loadThumbs(id); });
}
function rerenderCard(id, onChange) {
  const c = critById[id], old = $(`#crit-${id}`);
  old.outerHTML = criterionCard(c);
  bindCriteria(onChange); onChange();
}

async function loadThumbs(critId) {
  const c = critById[critId];
  const key = store.photoKey(answersFor(c) === current.orgAnswers ? null : building, critId);
  const photos = await store.getPhotos(current.id, key);
  const el = $(`#thumbs-${critId}`); if (!el) return;
  const pc = $(`#pc-${critId}`); if (pc) pc.textContent = photos.length || '';
  el.innerHTML = photos.map(p => `<div class="thumb"><img src="${p.dataUrl}" alt="Photo ${critId}"><button data-delphoto="${p.id}" title="Supprimer la photo" aria-label="Supprimer la photo">${icon('x', 12)}</button></div>`).join('');
  el.querySelectorAll('[data-delphoto]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette photo ?')) return;
    await store.deletePhoto(b.dataset.delphoto);
    const ans = answersFor(c)[critId]; if (ans) ans.photos = Math.max(0, (ans.photos || 1) - 1); persist();
    loadThumbs(critId);
  });
  el.querySelectorAll('img').forEach(img => img.onclick = () => openLightbox(img.src));
}
function openLightbox(src) {
  const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${src}" alt="">`;
  lb.onclick = () => lb.remove(); document.body.appendChild(lb);
}

function sectionsHTML(d, filter) {
  return d.sections.map(s => { const cs = s.criteria.filter(filter); if (!cs.length) return ''; return `<section class="section"><h3>${esc(s.title)} <small id="sec-${s.id}" class="muted"></small></h3>${cs.map(criterionCard).join('')}</section>`; }).join('');
}
let currentSubnav = () => '';
function refreshSectionScores(result, domainId) {
  for (const dom of result.domains) for (const s of dom.sections) { const el = $(`#sec-${CSS.escape(s.id)}`); if (el) el.textContent = `${s.answered}/${s.total} · ${pct(s.score)}`; }
  const dd = result.domains.find(x => x.id === domainId), dh = $('.domain-stats');
  if (dd && dh) dh.innerHTML = `<span>Score : <b>${pct(dd.score)}</b></span><span>Répondu : <b>${dd.answered}/${dd.total}</b></span><span>Poids : <b>${Math.round(dd.weight * 100)} %</b></span>`;
  const main = $('.tabs:not(.sub)'), sub = $('.tabs.sub');
  if (main) main.outerHTML = evalTabs();
  if (sub) { const left = sub.scrollLeft; sub.outerHTML = currentSubnav(); $('.tabs.sub').scrollLeft = left; }
  if (building) bindBuildingSwitch(location.hash.split('/').slice(5).join('/'));
}

// Organisation : critères 'org', par domaine
function renderOrgDomain(domainId) {
  const d = DOMAINS.find(x => x.id === domainId) || DOMAINS[0];
  const org = scoreOrg(current);
  const counts = Object.fromEntries(org.domains.map(x => [x.id, { answered: x.answered, total: x.total }]));
  currentSubnav = () => domainTabs(`/eval/${current.id}/org`, counts, d.id);
  const idx = DOMAINS.indexOf(d);
  const nextD = DOMAINS.slice(idx + 1).find(x => counts[x.id].total), prevD = DOMAINS.slice(0, idx).reverse().find(x => counts[x.id].total);
  const sc = org.domains.find(x => x.id === d.id);
  shell(esc(current.info.organisation || 'Organisation'), `
    <div class="domain-head" style="--c:${d.color}">
      <h2><span class="code" style="--c:${d.color}">${d.code}</span> ${esc(d.title)} — organisation</h2>
      <div class="domain-stats"><span>Score : <b>${pct(sc.score)}</b></span><span>Répondu : <b>${sc.answered}/${sc.total}</b></span><span>Poids : <b>${Math.round(sc.weight * 100)} %</b></span></div>
      <p class="muted small">Politiques, procédures, système, programmes : répondus une fois, hérités par les ${current.buildings.length} entrepôt(s).</p>
    </div>
    ${sectionsHTML(d, isOrg)}
    <div class="row between pager">
      ${prevD ? `<a class="btn" href="#/eval/${current.id}/org/${prevD.id}">${icon('chevronLeft', 12)} ${esc(prevD.short)}</a>` : `<a class="btn" href="#/eval/${current.id}/info">${icon('chevronLeft', 12)} Identification</a>`}
      ${nextD ? `<a class="btn primary" href="#/eval/${current.id}/org/${nextD.id}">${esc(nextD.short)} ${icon('chevronRight', 12)}</a>` : `<a class="btn primary" href="#/eval/${current.id}/buildings">Entrepôts ${icon('chevronRight', 12)}</a>`}
    </div>`, { back: `/eval/${current.id}/info`, subnav: currentSubnav() });
  const refresh = () => { const o = scoreOrg(current); for (const x of o.domains) counts[x.id] = { answered: x.answered, total: x.total }; refreshSectionScores(o, d.id); };
  bindCriteria(refresh); refresh();
}

// Entrepôt : critères 'site' + critères 'org' détachés ; les hérités sont repliés en bas
function renderBuildingDomain(domainId) {
  const d = DOMAINS.find(x => x.id === domainId) || DOMAINS[0];
  currentSubnav = () => buildingSubnav(d.id);
  const own = c => !isOrg(c) || isDetached(building, c);
  const inheritedList = d.sections.flatMap(s => s.criteria).filter(c => isOrg(c) && !isDetached(building, c));
  const idx = DOMAINS.indexOf(d);
  const has = x => x.sections.some(s => s.criteria.some(own));
  const nextD = DOMAINS.slice(idx + 1).find(has), prevD = DOMAINS.slice(0, idx).reverse().find(has);
  const full = scoreBuilding(current, building);
  const sc = full.domains.find(x => x.id === d.id);
  shell(esc(building.name || 'Entrepôt'), `
    <div class="domain-head" style="--c:${d.color}">
      <h2><span class="code" style="--c:${d.color}">${d.code}</span> ${esc(d.title)} — ${esc(building.name)}</h2>
      <div class="domain-stats"><span>Score : <b>${pct(sc.score)}</b></span><span>Répondu : <b>${sc.answered}/${sc.total}</b></span><span>Poids : <b>${Math.round(sc.weight * 100)} %</b></span></div>
    </div>
    ${sectionsHTML(d, own) || '<p class="empty">Aucun constat propre à l’entrepôt dans ce domaine.</p>'}
    ${inheritedList.length ? `<details class="inherited-block"><summary>${icon('list', 12)} ${inheritedList.length} critère(s) d’organisation hérité(s) dans ce domaine — consulter ou détacher pour ce bâtiment</summary>${inheritedList.map(criterionCard).join('')}</details>` : ''}
    <div class="row between pager">
      ${prevD ? `<a class="btn" href="#/eval/${current.id}/b/${building.id}/domain/${prevD.id}">${icon('chevronLeft', 12)} ${esc(prevD.short)}</a>` : `<a class="btn" href="#/eval/${current.id}/b/${building.id}/info">${icon('chevronLeft', 12)} Fiche</a>`}
      ${nextD ? `<a class="btn primary" href="#/eval/${current.id}/b/${building.id}/domain/${nextD.id}">${esc(nextD.short)} ${icon('chevronRight', 12)}</a>` : `<a class="btn primary" href="#/eval/${current.id}/buildings">Entrepôts ${icon('chevronRight', 12)}</a>`}
    </div>`, { back: `/eval/${current.id}/buildings`, subnav: currentSubnav() });
  bindBuildingSwitch(`domain/${d.id}`);
  const refresh = () => refreshSectionScores(scoreBuilding(current, building), d.id);
  bindCriteria(refresh); refresh();
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
  return `<svg viewBox="0 0 ${size} ${size}" class="radar" role="img" aria-label="Profil par domaine">${rings}${axes}<polygon points="${poly}" class="area"/>${dots}${labels}</svg>`;
}
// Cellule de score teintée par palier : r = résultat global ({overall}) ou de domaine ({score})
function cellHTML(r, title = '') { const v = r.overall !== undefined ? r.overall : r.score; return `<span class="cell" style="${tierVars(r.tier)}" title="${esc(title)}">${v === null || v === undefined ? '—' : Math.round(v * 100)}</span>`; }

function ncTable(list, go) {
  if (!list.length) return '<p class="empty">Aucune non-conformité parmi les critères renseignés.</p>';
  return `<table class="tbl nc"><thead><tr><th>#</th><th>Crit.</th><th>Dom.</th><th>Constat</th><th>Réponse</th><th>Recommandation</th></tr></thead><tbody>
    ${list.map(c => `<tr class="clickable" data-go="${go(c)}" data-anchor="crit-${c.id}">
      <td>${c.id}</td><td><span class="badge crit-${c.crit}">${CRITICALITY[c.crit].short}</span></td>
      <td><span class="code" style="--c:${c.domain.color}">${c.domain.code}</span></td>
      <td>${esc(c.text)}${c.note ? `<div class="note-preview">${icon('note', 10)} ${esc(c.note)}</div>` : ''}</td>
      <td>${c.value === 0 ? '<span class="tag no">Non conforme</span>' : `<span class="tag partial">${c.value === 0.5 ? 'Partiel' : Math.round(c.value * 100) + ' %'}</span>`}</td>
      <td class="small">${esc(c.reco || '')}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderSummary() {
  const sc = computeScores(current);
  const cons = sc.consolidated, org = sc.org;
  const ncs = nonConformities(current);
  const nb = current.buildings.length;
  const wtot = sc.weights.reduce((a, w) => a + w.w, 0);
  const maxP = Math.max(...cons.domains.map(x => x.priority || 0)) || 1;
  const shownDomains = DOMAINS.filter((d, i) => sc.buildings.some(b => b.site.domains[i].total));
  const body = `
    <div class="summary-top">
      <div class="panel overall">
        <div class="gauge" style="${tierVars(cons.tier)};--v:${cons.overall === null ? 0 : Math.round(cons.overall * 100)}"><span>${scoreNum(cons)}<small>%</small></span></div>
        <div>
          <h2>Score consolidé de la centrale</h2>
          <p>${cons.tier ? `<span class="tier-label" style="${tierVars(cons.tier)}">${cons.tier.label}</span> <span class="muted">(${cons.tier.min}–${cons.tier.max} %)</span>` : 'Non calculé'}</p>
          <p class="muted">Organisation : ${org.answered}/${org.total} critères · ${nb} entrepôt${nb > 1 ? 's' : ''} : ${sc.buildings.reduce((a, b) => a + b.site.answered, 0)}/${sc.buildings.reduce((a, b) => a + b.site.total, 0)} constats</p>
          <p class="muted small">Chaque critère est moyenné sur les entrepôts, ${current.consolidation === 'mean' ? 'en moyenne simple' : 'pondéré par leur surface de stockage'} ; les critères d’organisation ont la même valeur partout. Criticité ×3/×2/×1, N/A exclus, domaines pondérés.</p>
        </div>
      </div>
      <div class="panel">${radarSVG(cons.domains)}</div>
    </div>

    <section class="panel">
      <h2>${icon('chart', 14)} Scores par domaine et priorités d’amélioration</h2>
      <table class="tbl">
        <thead><tr><th>Domaine</th><th>Consolidé</th><th>Organisation</th><th>Palier</th><th>Poids</th><th>Priorité</th><th>Critiques NC</th></tr></thead>
        <tbody>${cons.domains.map((d, i) => { const o = org.domains[i]; return `<tr>
          <td><span class="code" style="--c:${d.color}">${d.code}</span> ${esc(d.title)}</td>
          <td>${pct(d.score)}<div class="bar"><div style="width:${(d.score || 0) * 100}%;background:${d.color}"></div></div></td>
          <td>${o.total ? pct(o.score) : '<span class="muted">—</span>'}<div class="muted small">${o.total ? o.total + ' crit. org.' : 'aucun'}</div></td>
          <td>${d.tier ? `<span class="tier" style="${tierVars(d.tier)}">${d.tier.label}</span>` : '—'}</td>
          <td>${Math.round(d.weight * 100)} %</td>
          <td>${d.priority === null ? '—' : `${(d.priority * 100).toFixed(1)}<div class="bar"><div style="width:${d.priority / maxP * 100}%;background:var(--negative-icon)"></div></div>`}</td>
          <td>${d.critFails.length ? `<span class="badge crit-C">${d.critFails.length}</span>` : '0'}</td></tr>`; }).join('')}</tbody>
      </table>
      <p class="muted small">Priorité = poids × (1 − score consolidé). Approche par paliers : viser d’abord 36 % dans tous les domaines, puis 71 %, puis 100 %.</p>
    </section>

    ${nb ? `<section class="panel">
      <h2>${icon('warehouse', 14)} Matrice entrepôts × domaines</h2>
      <p class="muted small">Score <b>spécifique</b> (constats du bâtiment seuls) : c’est lui qui départage les entrepôts. Le score complet inclut l’organisation héritée.</p>
      <div class="scroll"><table class="tbl compare"><thead><tr><th>Entrepôt</th><th>Poids</th><th>Spécifique</th><th>Complet</th>${shownDomains.map(d => `<th><span class="code" style="--c:${d.color}">${d.code}</span></th>`).join('')}<th>NC crit.</th></tr></thead>
      <tbody>${sc.buildings.map((b, bi) => `<tr>
        <td><a href="#/eval/${current.id}/b/${b.building.id}/info"><b>${esc(b.building.name)}</b></a><div class="muted small">${esc(typeLabel(b.building.type))}</div></td>
        <td>${wtot ? Math.round(100 * sc.weights[bi].w / wtot) : 0} %</td>
        <td>${cellHTML(b.site)}</td><td>${cellHTML(b.full)}</td>
        ${shownDomains.map(d => { const x = b.site.domains.find(y => y.id === d.id); return `<td>${x.total && x.score !== null ? cellHTML(x, d.title) : '<span class="muted">—</span>'}</td>`; }).join('')}
        <td>${b.site.critFails.length}</td></tr>`).join('')}
      </tbody></table></div>
    </section>` : '<section class="panel"><p class="empty">Aucun entrepôt — ajoutez-en dans l’onglet Entrepôts pour obtenir la consolidation.</p></section>'}

    <section class="panel">
      <h2>${icon('alert', 14)} Non-conformités — organisation (${ncs.org.length})</h2>
      <p class="muted small">Relèvent de la direction et s’appliquent à tous les entrepôts. Cliquez pour revenir au critère.</p>
      ${ncTable(ncs.org, c => `/eval/${current.id}/org/${c.domain.id}`)}
    </section>
    ${ncs.buildings.map(x => `<section class="panel">
      <h2>${icon('warehouse', 14)} Non-conformités — ${esc(x.building.name)} (${x.list.length})</h2>
      ${ncTable(x.list, c => `/eval/${current.id}/b/${x.building.id}/domain/${c.domain.id}`)}
    </section>`).join('')}

    <section class="panel">
      <h2>${icon('download', 14)} Exporter</h2>
      <div class="row">
        <button class="btn" id="exp-json">${icon('download', 12)} JSON (sauvegarde / partage)</button>
        <button class="btn" id="exp-csv">${icon('fileText', 12)} CSV (Excel)</button>
        <a class="btn" href="#/eval/${current.id}/report">${icon('printer', 12)} Rapport imprimable / PDF</a>
        <a class="btn" href="#/eval/${current.id}/photos">${icon('image', 12)} Photos</a>
      </div>
    </section>`;
  shell(esc(current.info.organisation || 'Synthèse'), body, { back: '/' });
  $('#exp-json').onclick = () => exportJSON(current);
  $('#exp-csv').onclick = () => exportCSV(current);
  app.querySelectorAll('[data-go]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.go; setTimeout(() => { const el = document.getElementById(tr.dataset.anchor); if (el) { const det = el.closest('details'); if (det) det.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); } }, 150); });
}

// ---------------- Rapport imprimable ----------------
function answerLabel(c, a) { const v = criterionValue(c, a); return a?.a === 'na' ? 'N/A' : v === null ? 'Non renseigné' : c.type === 'checklist' ? Math.round(v * 100) + ' %' : ANSWERS[a.a].label; }
async function renderReport() {
  const sc = computeScores(current), cons = sc.consolidated, org = sc.org;
  const ncs = nonConformities(current);
  const info = current.info;
  const photos = await store.getPhotos(current.id);
  const ranked = [...cons.domains].filter(d => d.priority !== null).sort((a, b) => b.priority - a.priority);
  const nb = current.buildings.length;
  const wtot = sc.weights.reduce((a, w) => a + w.w, 0);
  const ncRows = list => list.length ? `<table class="tbl nc"><thead><tr><th>#</th><th>Crit.</th><th>Constat</th><th>Réponse</th><th>Observation</th><th>Action recommandée</th><th>Resp.</th><th>Échéance</th></tr></thead><tbody>${list.map(c => `<tr><td>${c.id}</td><td>${CRITICALITY[c.crit].label}</td><td>${esc(c.text)}</td><td>${c.value === 0 ? 'Non conforme' : 'Partiel'}</td><td>${esc(c.note)}</td><td>${esc(c.reco || '')}</td><td></td><td></td></tr>`).join('')}</tbody></table>` : '<p class="empty">Aucune non-conformité.</p>';
  const detailRows = (filter, answersOf) => DOMAINS.map(d => { const secs = d.sections.map(s => { const cs = s.criteria.filter(filter); if (!cs.length) return ''; return `<tr class="sec"><td colspan="4">${esc(s.title)}</td></tr>` + cs.map(c => { const a = answersOf(c) || {}; return `<tr><td>${c.id}</td><td>${CRITICALITY[c.crit].short}</td><td>${esc(c.text)}${a.note ? `<div class="muted small">${icon('note', 10)} ${esc(a.note)}</div>` : ''}</td><td class="${a.a || ''}">${answerLabel(c, a)}</td></tr>`; }).join(''); }).join(''); return secs ? `<h4>${d.code} ${esc(d.title)}</h4><table class="tbl small"><tbody>${secs}</tbody></table>` : ''; }).join('');
  const photoBlock = (prefix, title) => { const ph = photos.filter(p => p.critId.startsWith(prefix)); return ph.length ? `<h4>Photos — ${esc(title)} (${ph.length})</h4><div class="photo-grid">${ph.map(p => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${p.critId.split(':')[1]}</figcaption></figure>`).join('')}</div>` : ''; };
  const base = nb ? 3 : 2;
  const body = `
    <div class="report">
      <div class="no-print row end"><button class="btn primary" onclick="window.print()">${icon('printer', 12)} Imprimer / Enregistrer en PDF</button></div>
      <h1>Rapport d’évaluation des Bonnes Pratiques d’Entreposage</h1>
      <p class="muted"><b>${esc(info.organisation || '')}</b> ${info.location ? '· ' + esc(info.location) : ''} · ${esc(info.date || '')} · ${nb} entrepôt${nb > 1 ? 's' : ''}</p>
      <div class="report-cols">
        <table class="tbl info"><tbody>${ORG_FIELDS.filter(f => info[f.id]).map(f => `<tr><th>${esc(f.label)}</th><td>${esc(info[f.id])}</td></tr>`).join('')}<tr><th>Entrepôts</th><td>${current.buildings.map(b => esc(b.name) + (b.info.area_storage ? ` (${fmt(b.info.area_storage)} m²)` : '')).join(' · ') || '—'}</td></tr></tbody></table>
        <div class="center">
          <div class="gauge" style="${tierVars(cons.tier)};--v:${cons.overall === null ? 0 : Math.round(cons.overall * 100)}"><span>${scoreNum(cons)}<small>%</small></span></div>
          <p><span class="tier-label" style="${tierVars(cons.tier)}">${cons.tier ? cons.tier.label : ''}</span><br><span class="muted small">score consolidé</span></p>
          ${radarSVG(cons.domains, 280)}
        </div>
      </div>
      <h2>1. Scores consolidés par domaine</h2>
      <table class="tbl"><thead><tr><th>Domaine</th><th>Consolidé</th><th>Organisation</th><th>Palier</th><th>Poids</th><th>Priorité</th></tr></thead><tbody>
        ${cons.domains.map((d, i) => `<tr><td>${d.code} ${esc(d.title)}</td><td>${pct(d.score)}</td><td>${org.domains[i].total ? pct(org.domains[i].score) : '—'}</td><td>${d.tier ? d.tier.label : '—'}</td><td>${Math.round(d.weight * 100)} %</td><td>${d.priority === null ? '—' : (d.priority * 100).toFixed(1)}</td></tr>`).join('')}
      </tbody></table>
      <p><b>Ordre de priorité d’amélioration :</b> ${ranked.map((d, i) => `${i + 1}. ${d.code} ${esc(d.short)}`).join(' · ')}</p>
      ${nb ? `<h2>2. Entrepôts</h2>
      <table class="tbl"><thead><tr><th>Entrepôt</th><th>Type</th><th>Surface stockage</th><th>Poids</th><th>Spécifique</th><th>Complet</th>${DOMAINS.map(d => `<th>${d.code}</th>`).join('')}<th>NC crit.</th></tr></thead><tbody>
        ${sc.buildings.map((b, bi) => `<tr><td>${esc(b.building.name)}</td><td>${esc(typeLabel(b.building.type))}</td><td>${b.building.info.area_storage ? fmt(b.building.info.area_storage) + ' m²' : '—'}</td><td>${wtot ? Math.round(100 * sc.weights[bi].w / wtot) : 0} %</td><td>${pct(b.site.overall)}</td><td>${pct(b.full.overall)}</td>${b.site.domains.map(d => `<td>${d.total ? pct(d.score) : '—'}</td>`).join('')}<td>${b.site.critFails.length}</td></tr>`).join('')}
      </tbody></table>` : ''}
      <h2>${base}. Organisation — non-conformités et plan d’action (${ncs.org.length})</h2>
      ${ncRows(ncs.org)}
      <h3>Détail des critères d’organisation</h3>
      ${detailRows(isOrg, c => current.orgAnswers[c.id])}
      ${photoBlock('org:', 'organisation')}
      ${sc.buildings.map((b, bi) => { const x = ncs.buildings[bi]; return `
      <h2 class="page-break">${base + bi + 1}. ${esc(b.building.name)} — ${esc(typeLabel(b.building.type))}</h2>
      <table class="tbl info"><tbody>${SITE_FIELDS.filter(f => f.id !== 'warehouse' && b.building.info[f.id]).map(f => `<tr><th>${esc(f.label)}</th><td>${esc(b.building.info[f.id])}</td></tr>`).join('')}<tr><th>Score spécifique / complet</th><td>${pct(b.site.overall)} / ${pct(b.full.overall)}</td></tr></tbody></table>
      <h3>Non-conformités et plan d’action (${x.list.length})</h3>
      ${ncRows(x.list)}
      <h3>Détail des constats</h3>
      ${detailRows(c => !isOrg(c) || isDetached(b.building, c), c => b.building.answers[c.id])}
      ${photoBlock(b.building.id + ':', b.building.name)}`; }).join('')}
      <p class="muted small">Référentiel : OMS TRS 1025 Annexe 7 (2020) ; OMS TRS 961 Annexe 9 ; USAID | DELIVER Guidelines for Warehousing Health Commodities ; PFSCM Pharmaceutical Wholesaler Site Inspection Checklist ; outil GWP GHSC-FTA.</p>
    </div>`;
  shell('Rapport', body, { back: `/eval/${current.id}/summary` });
}

async function renderPhotos() {
  const photos = await store.getPhotos(current.id);
  const where = key => { const [p, cid] = key.split(':'); const b = current.buildings.find(x => x.id === p); return { where: p === 'org' ? 'Organisation' : (b ? b.name : '?'), cid: cid || key }; };
  shell('Photos', `<section class="panel"><h2>${icon('image', 14)} ${photos.length} photo(s)</h2><div class="photo-grid">${photos.map(p => { const w = where(p.critId); return `<figure><img src="${p.dataUrl}" alt=""><figcaption><b>${esc(w.where)} · ${w.cid}</b> — ${esc(critById[w.cid]?.text.slice(0, 70) || '')}…</figcaption></figure>`; }).join('') || '<p class="empty">Aucune photo.</p>'}</div></section>`, { back: `/eval/${current.id}/summary` });
  app.querySelectorAll('.photo-grid img').forEach(img => img.onclick = () => openLightbox(img.src));
}

// ---------------- Comparaison ----------------
function renderCompare() {
  const list = store.loadAll();
  const rows = list.map(e => ({ e, sc: computeScores(e) }));
  const body = list.length < 1 ? '<p class="empty">Aucune évaluation à comparer.</p>' : `
    <section class="panel">
      <h2>${icon('chart', 14)} Comparaison des centrales (scores consolidés)</h2>
      <div class="scroll"><table class="tbl compare"><thead><tr><th>Centrale</th><th>Date</th><th>Entrepôts</th><th>Global</th>${DOMAINS.map(d => `<th><span class="code" style="--c:${d.color}">${d.code}</span><br><small>${esc(d.short)}</small></th>`).join('')}<th>NC crit.</th></tr></thead>
      <tbody>${rows.map(({ e, sc }) => `<tr><td><a href="#/eval/${e.id}/summary"><b>${esc(e.info.organisation || 'Sans nom')}</b></a><div class="muted small">${esc(e.info.location || '')}</div></td><td>${esc(e.info.date || '')}</td><td>${e.buildings.length}</td>
        <td>${cellHTML(sc.consolidated)}</td>
        ${sc.consolidated.domains.map(d => `<td>${d.score === null ? '<span class="muted">—</span>' : cellHTML(d)}</td>`).join('')}
        <td>${sc.consolidated.critFails.length}</td></tr>`).join('')}
      ${rows.length > 1 ? `<tr class="avg"><td colspan="3"><b>Moyenne</b></td><td>${avg(rows.map(r => r.sc.consolidated.overall))}</td>${DOMAINS.map((d, i) => `<td>${avg(rows.map(r => r.sc.consolidated.domains[i].score))}</td>`).join('')}<td></td></tr>` : ''}
      </tbody></table></div>
    </section>
    <section class="panel">
      <h2>${icon('warehouse', 14)} Tous les entrepôts (scores spécifiques)</h2>
      <div class="scroll"><table class="tbl compare"><thead><tr><th>Entrepôt</th><th>Centrale</th><th>Type</th><th>Spécifique</th><th>Complet</th>${DOMAINS.map(d => `<th><span class="code" style="--c:${d.color}">${d.code}</span></th>`).join('')}</tr></thead>
      <tbody>${rows.flatMap(({ e, sc }) => sc.buildings.map(b => `<tr><td><a href="#/eval/${e.id}/b/${b.building.id}/info"><b>${esc(b.building.name)}</b></a></td><td class="muted">${esc(e.info.organisation || '')}</td><td class="muted small">${esc(typeLabel(b.building.type))}</td><td>${cellHTML(b.site)}</td><td>${cellHTML(b.full)}</td>${b.site.domains.map(d => `<td>${d.total && d.score !== null ? cellHTML(d) : '<span class="muted">—</span>'}</td>`).join('')}</tr>`)).join('') || '<tr><td colspan="11" class="empty">Aucun entrepôt.</td></tr>'}
      </tbody></table></div>
    </section>
    <section class="panel"><h2>${icon('chart', 14)} Profils</h2><div class="radars">${rows.map(({ e, sc }) => `<div><h4>${esc(e.info.organisation || 'Sans nom')}</h4>${radarSVG(sc.consolidated.domains, 240)}</div>`).join('')}</div></section>`;
  shell('Comparaison', body, { back: '/' });
}
function avg(vals) { const v = vals.filter(x => x !== null && x !== undefined); return v.length ? Math.round(100 * v.reduce((a, b) => a + b, 0) / v.length) : '—'; }

// ---------------- Paramètres ----------------
function renderSettings() {
  const s = store.loadSettings();
  shell('Paramètres', `
    <section class="panel">
      <h2>${icon('settings', 14)} Pondération par défaut des domaines</h2>
      <p class="muted small">Appliquée aux nouvelles évaluations (chaque évaluation peut ensuite ajuster ses poids).</p>
      <div class="weights">${DOMAINS.map(d => `<label><span class="code" style="--c:${d.color}">${d.code}</span> ${esc(d.short)} <input type="number" min="0" max="100" data-w="${d.id}" value="${Math.round((s.weights[d.id] ?? d.weight) * 100)}"> %</label>`).join('')}</div>
      <div class="row"><button class="btn primary" id="save-w">Enregistrer</button><button class="btn" id="reset-w">Valeurs par défaut</button></div>
    </section>
    <section class="panel">
      <h2>${icon('download', 14)} Données</h2>
      <div class="row"><button class="btn" id="exp-all">${icon('download', 12)} Exporter toutes les évaluations (JSON)</button>
      <button class="btn danger" id="wipe">${icon('trash', 12)} Effacer toutes les données locales</button></div>
    </section>
    <section class="panel">
      <h2>${icon('info', 14)} À propos</h2>
      <p>Version 2.0 — ${criteriaCount()} critères (68 organisation, 86 entrepôt). <a href="#/about">Méthodologie et sources</a>.</p>
    </section>`, { back: '/' });
  $('#save-w').onclick = () => { const w = {}; app.querySelectorAll('[data-w]').forEach(i => w[i.dataset.w] = (parseFloat(i.value) || 0) / 100); const tot = Object.values(w).reduce((a, b) => a + b, 0); if (Math.abs(tot - 1) > 0.001) { alert(`Le total doit être 100 % (actuellement ${Math.round(tot * 100)} %).`); return; } store.saveSettings({ ...s, weights: w }); flash('Enregistré'); };
  $('#reset-w').onclick = () => { store.saveSettings({ ...s, weights: Object.fromEntries(DOMAINS.map(d => [d.id, d.weight])) }); renderSettings(); };
  $('#exp-all').onclick = async () => { const { exportAllJSON } = await import('./export.js'); exportAllJSON(); };
  $('#wipe').onclick = () => { if (confirm('Effacer TOUTES les évaluations et photos de cet appareil ?\nExportez d’abord vos données.')) { localStorage.clear(); indexedDB.deleteDatabase('gwp-photos'); location.hash = '/'; location.reload(); } };
}

// ---------------- Référentiel ----------------
function renderReferentiel() {
  shell('Référentiel des critères', `
    <section class="panel">
      <p>${criteriaCount()} critères. Criticité : <span class="badge crit-C">Critique ×3</span> <span class="badge crit-M">Majeur ×2</span> <span class="badge crit-m">Mineur ×1</span> · Portée : <span class="badge scope-org">Organisation</span> (répondu une fois par centrale) ou entrepôt. <a href="#/about">Méthodologie et sources ›</a></p>
      <input type="search" id="q" placeholder="Rechercher un critère, une référence (ex. TRS 1025 §12.23, FEFO, incendie)…" class="search">
    </section>
    <div id="ref-list">${DOMAINS.map(d => `<section class="panel ref-dom" data-dom="${d.id}"><h2><span class="code" style="--c:${d.color}">${d.code}</span> ${esc(d.title)} <small class="muted">(poids ${Math.round(d.weight * 100)} %)</small></h2>
      ${d.sections.map(s => `<h3>${esc(s.title)}</h3><table class="tbl small ref"><tbody>${s.criteria.map(c => `<tr class="refrow"><td>${c.id}</td><td><span class="badge crit-${c.crit}">${CRITICALITY[c.crit].short}</span>${isOrg(c) ? '<div class="badge scope-org" style="margin-top:3px">Org.</div>' : ''}${c.na ? '<div class="muted small">N/A possible</div>' : ''}</td><td><b>${esc(c.text)}</b>${c.items ? `<ul class="small">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}<div class="small"><i>Vérification :</i> ${esc(c.guide || '')}</div><div class="small muted">${esc(c.ref || '')}</div></td></tr>`).join('')}</tbody></table>`).join('')}</section>`).join('')}</div>`, { back: '/' });
  $('#q').oninput = () => { const q = $('#q').value.toLowerCase(); app.querySelectorAll('.refrow').forEach(r => r.hidden = q && !r.textContent.toLowerCase().includes(q)); };
}

function renderAbout() {
  shell('Méthodologie', `
    <section class="panel about">
      <h2>Objectif</h2>
      <p>Cet outil permet aux gestionnaires d’entrepôts de produits de santé et aux évaluateurs d’apprécier le degré de conformité aux Bonnes Pratiques d’Entreposage (Good Storage Practices), d’identifier les non-conformités et de prioriser les investissements et efforts d’amélioration. Il est conçu pour une utilisation sur tablette, en visite de site, y compris hors connexion.</p>
      <h2>Modèle « centrale → entrepôts »</h2>
      <p>Une centrale d’achat gère souvent plusieurs bâtiments (magasins, chambres froides, annexes) sous une même direction, un même système et les mêmes procédures. Chaque critère a donc une <b>portée</b> :</p>
      <ul>
        <li><b>Organisation</b> (68 critères) : politiques, procédures, système, programmes, formation, système qualité — répondus une fois pour la centrale et hérités par tous ses entrepôts. Un entrepôt peut <i>détacher</i> un critère quand sa réalité diffère (annexe louée, équipe partenaire…).</li>
        <li><b>Entrepôt</b> (86 critères) : constats physiques et application observée, y compris les utilités propres au site (génératrice, périmètre, zone inflammables) — répondus pour chaque bâtiment. Le type de bâtiment pré-coche les critères sans objet en N/A.</li>
      </ul>
      <h2>Notation</h2>
      <ul>
        <li>Chaque critère est noté <b>Conforme</b> (1), <b>Partiellement conforme</b> (0,5) ou <b>Non conforme</b> (0) ; <b>N/A</b> exclut le critère du calcul.</li>
        <li><b>Criticité</b> (logique PFSCM/OMS) : Critique ×3, Majeur ×2, Mineur ×1. Score = Σ(criticité × note) / Σ(criticité).</li>
        <li><b>Score spécifique</b> d’un entrepôt = ses constats seuls (pour comparer les bâtiments) ; <b>score complet</b> = constats + organisation héritée (comparable à une évaluation classique).</li>
        <li><b>Score consolidé</b> de la centrale = chaque critère moyenné sur les entrepôts, pondéré par leur surface de stockage (ou moyenne simple), puis domaines pondérés (15/15/15/25/5/25 par défaut, modifiables).</li>
        <li><b>Priorité d’amélioration</b> = poids × (1 − score). Paliers : 0–35 %, 36–70 %, 71–100 %. Les critères <b>critiques non conformes</b> sont mis en évidence quel que soit le score.</li>
      </ul>
      <h2>Sources</h2>
      <ul>
        <li>OMS, <i>Good storage and distribution practices for medical products</i>, TRS 1025, Annexe 7, 2020.</li>
        <li>OMS, <i>Model guidance for the storage and transport of time- and temperature-sensitive pharmaceutical products</i>, TRS 961, Annexe 9, 2011, et suppléments techniques.</li>
        <li>USAID | DELIVER PROJECT, <i>Guidelines for Warehousing Health Commodities</i>, 2014.</li>
        <li>USAID | DELIVER PROJECT, <i>Warehouse Assessment Tool Questionnaire</i>, 2009.</li>
        <li>PFSCM, <i>Pharmaceutical Wholesaler Site Inspection Checklist</i>.</li>
        <li>GHSC-FTA, <i>Outil d’analyse de la conformité aux bonnes pratiques d’entreposage</i> (Excel).</li>
        <li>GHSC-PSM, <i>National Supply Chain Assessment 2.0</i> — module Entreposage & Stockage.</li>
      </ul>
    </section>`, { back: '/' });
}

// ---------------- Init ----------------
document.body.insertAdjacentHTML('beforeend', '<div id="toast" role="status" aria-live="polite"></div>');
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
