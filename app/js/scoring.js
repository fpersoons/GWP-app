// Moteur de notation — modèle à deux niveaux « centrale → entrepôts »
//
// Une évaluation = une centrale (orgAnswers : critères de portée 'org', répondus une fois)
// + N entrepôts (answers : critères de portée 'site', et critères 'org' détachés).
// Trois lectures :
//   - scoreBuilding   : score complet d'un entrepôt (ses constats + les réponses organisation héritées)
//   - scoreSiteOnly   : score « spécifique » d'un entrepôt (constats de portée 'site' seulement)
//   - scoreConsolidated : centrale = moyenne de tous les critères sur les entrepôts, pondérée par la
//                       surface de stockage (les critères 'org' non détachés ont la même valeur partout)
import { DOMAINS, CRITICALITY, ANSWERS, TIERS, allCriteria, isOrg } from '../data/criteria.js';

// answer : { a: 'yes'|'partial'|'no'|'na', items: [bool…], note: '', photos: n }
export function criterionValue(criterion, answer) {
  if (!answer) return null; // non répondu
  if (criterion.type === 'checklist') {
    if (answer.a === 'na') return null;
    const items = answer.items || [];
    if (!answer.a && items.length === 0) return null;
    const checked = items.filter(Boolean).length;
    return criterion.items.length ? checked / criterion.items.length : null;
  }
  if (!answer.a || answer.a === 'na') return null;
  return ANSWERS[answer.a].value;
}

export function isAnswered(criterion, answer) {
  if (!answer) return false;
  if (criterion.type === 'checklist') return answer.a === 'na' || (answer.items && answer.items.length > 0) || !!answer.a;
  return !!answer.a;
}

// Réponse effective d'un critère pour un entrepôt : la sienne s'il est de portée 'site' ou détaché,
// sinon celle de la centrale.
export function effectiveAnswer(ev, building, c) {
  if (!isOrg(c)) return building ? building.answers[c.id] : undefined;
  if (building && building.detached && building.detached[c.id]) return building.answers[c.id];
  return (ev.orgAnswers || {})[c.id];
}
export function isDetached(building, c) { return !!(building && building.detached && building.detached[c.id]); }

// Agrégation générique : values = [{ c, v (0..1 | null), w (poids d'échantillon, défaut 1), answered }]
function aggregate(entries) {
  let num = 0, den = 0, answered = 0, total = entries.length; const critFails = [];
  for (const e of entries) {
    if (e.answered) answered++;
    if (e.v === null || e.v === undefined) continue;
    const w = CRITICALITY[e.c.crit].weight;
    num += w * e.v; den += w;
    if (e.v < 1 && e.c.crit === 'C') critFails.push(e.c.id);
  }
  return { score: den ? num / den : null, answered, total, critFails };
}

function buildResult(ev, entriesByCrit) {
  const weights = ev.weights || Object.fromEntries(DOMAINS.map(d => [d.id, d.weight]));
  const domains = DOMAINS.map(d => {
    const sections = d.sections.map(s => ({ id: s.id, title: s.title, ...aggregate(s.criteria.map(c => entriesByCrit[c.id]).filter(Boolean)) }));
    const all = d.sections.flatMap(s => s.criteria).map(c => entriesByCrit[c.id]).filter(Boolean);
    const agg = aggregate(all);
    const weight = weights[d.id] ?? d.weight;
    return { id: d.id, code: d.code, title: d.title, short: d.short, color: d.color, weight, ...agg, sections,
      priority: agg.score === null ? null : weight * (1 - agg.score), tier: agg.score === null ? null : tierOf(agg.score * 100) };
  });
  let wsum = 0, wnum = 0, answered = 0, total = 0; const critFails = [];
  for (const d of domains) {
    answered += d.answered; total += d.total; critFails.push(...d.critFails);
    if (d.score !== null) { wsum += d.weight; wnum += d.weight * d.score; }
  }
  const overall = wsum ? wnum / wsum : null;
  return { domains, overall, answered, total, critFails, tier: overall === null ? null : tierOf(overall * 100) };
}

// Score complet d'un entrepôt (constats + organisation héritée)
export function scoreBuilding(ev, building) {
  const entries = {};
  for (const c of allCriteria()) { const a = effectiveAnswer(ev, building, c); entries[c.id] = { c, v: criterionValue(c, a), answered: isAnswered(c, a) }; }
  return buildResult(ev, entries);
}

// Score « spécifique » : critères de portée 'site' uniquement
export function scoreSiteOnly(ev, building) {
  const entries = {};
  for (const c of allCriteria()) { if (isOrg(c)) continue; const a = building.answers[c.id]; entries[c.id] = { c, v: criterionValue(c, a), answered: isAnswered(c, a) }; }
  return buildResult(ev, entries);
}

// Score de la centrale sur les critères 'org' uniquement
export function scoreOrg(ev) {
  const entries = {};
  for (const c of allCriteria()) { if (!isOrg(c)) continue; const a = (ev.orgAnswers || {})[c.id]; entries[c.id] = { c, v: criterionValue(c, a), answered: isAnswered(c, a) }; }
  return buildResult(ev, entries);
}

// Poids d'un entrepôt dans la consolidation : surface de stockage (m²), sinon 1 pour tous
export function buildingWeights(ev) {
  const bs = ev.buildings || [];
  const areas = bs.map(b => parseFloat(b.info?.area_storage) || 0);
  const useArea = ev.consolidation !== 'mean' && areas.some(a => a > 0);
  return bs.map((b, i) => ({ id: b.id, w: useArea ? (areas[i] > 0 ? areas[i] : 0) : 1, area: areas[i] }));
}

// Score consolidé de la centrale : pour chaque critère, moyenne pondérée des valeurs effectives sur les
// entrepôts (N/A et non-répondus exclus du dénominateur). Sans entrepôt : critères 'org' seuls.
export function scoreConsolidated(ev) {
  const bs = ev.buildings || [];
  if (!bs.length) return scoreOrg(ev);
  const ws = Object.fromEntries(buildingWeights(ev).map(x => [x.id, x.w]));
  const entries = {};
  for (const c of allCriteria()) {
    let num = 0, den = 0, answered = false;
    for (const b of bs) {
      const a = effectiveAnswer(ev, b, c);
      if (isAnswered(c, a)) answered = true;
      const v = criterionValue(c, a);
      if (v === null) continue;
      const w = ws[b.id] || 0; num += w * v; den += w;
    }
    entries[c.id] = { c, v: den ? num / den : null, answered };
  }
  return buildResult(ev, entries);
}

// Vue d'ensemble d'une évaluation (pour l'accueil, la synthèse, la comparaison)
export function computeScores(ev) {
  const buildings = (ev.buildings || []).map(b => ({ building: b, full: scoreBuilding(ev, b), site: scoreSiteOnly(ev, b) }));
  return { consolidated: scoreConsolidated(ev), org: scoreOrg(ev), buildings, weights: buildingWeights(ev) };
}

export function tierOf(pct) {
  const p = Math.round(pct);
  return TIERS.find(t => p >= t.min && p <= t.max) || TIERS[TIERS.length - 1];
}
export function pct(v) { return v === null || v === undefined ? '—' : Math.round(v * 100) + ' %'; }

// Non-conformités : niveau organisation (critères 'org' non détachés) et par entrepôt
export function nonConformities(ev) {
  const order = { C: 0, M: 1, m: 2 };
  const sortNC = out => out.sort((a, b) => order[a.crit] - order[b.crit] || a.value - b.value || a.id.localeCompare(b.id));
  const org = [];
  for (const d of DOMAINS) for (const s of d.sections) for (const c of s.criteria) {
    if (!isOrg(c)) continue;
    const a = (ev.orgAnswers || {})[c.id]; const v = criterionValue(c, a);
    if (v === null || v >= 1) continue;
    org.push({ ...c, domain: d, section: s, value: v, note: a?.note || '' });
  }
  const buildings = (ev.buildings || []).map(b => {
    const out = [];
    for (const d of DOMAINS) for (const s of d.sections) for (const c of s.criteria) {
      if (isOrg(c) && !isDetached(b, c)) continue;
      const a = b.answers[c.id]; const v = criterionValue(c, a);
      if (v === null || v >= 1) continue;
      out.push({ ...c, domain: d, section: s, value: v, note: a?.note || '', detached: isOrg(c) });
    }
    return { building: b, list: sortNC(out) };
  });
  return { org: sortNC(org), buildings };
}
