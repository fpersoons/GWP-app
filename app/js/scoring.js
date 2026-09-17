// Moteur de notation
import { DOMAINS, CRITICALITY, ANSWERS, TIERS } from '../data/criteria.js';

// answer d'un critère : { a: 'yes'|'partial'|'no'|'na', items: [bool...], note: '', photos: n }
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

function aggregate(criteria, answers) {
  let num = 0, den = 0, answered = 0, total = criteria.length, critFails = [];
  for (const c of criteria) {
    const ans = answers[c.id];
    if (isAnswered(c, ans)) answered++;
    const v = criterionValue(c, ans);
    if (v === null) continue;
    const w = CRITICALITY[c.crit].weight;
    num += w * v; den += w;
    if (v < 1 && c.crit === 'C') critFails.push(c.id);
  }
  return { score: den ? num / den : null, answered, total, critFails };
}

export function computeScores(evaluation) {
  const answers = evaluation.answers || {};
  const weights = evaluation.weights || Object.fromEntries(DOMAINS.map(d => [d.id, d.weight]));
  const domains = DOMAINS.map(d => {
    const sections = d.sections.map(s => ({ id: s.id, title: s.title, ...aggregate(s.criteria, answers) }));
    const all = d.sections.flatMap(s => s.criteria);
    const agg = aggregate(all, answers);
    const weight = weights[d.id] ?? d.weight;
    const score = agg.score;
    return {
      id: d.id, code: d.code, title: d.title, short: d.short, color: d.color, weight,
      ...agg, sections,
      priority: score === null ? null : weight * (1 - score),
      tier: score === null ? null : tierOf(score * 100),
    };
  });
  let wsum = 0, wnum = 0, answered = 0, total = 0;
  const critFails = [];
  for (const d of domains) {
    answered += d.answered; total += d.total; critFails.push(...d.critFails);
    if (d.score !== null) { wsum += d.weight; wnum += d.weight * d.score; }
  }
  const overall = wsum ? wnum / wsum : null;
  return { domains, overall, answered, total, critFails, tier: overall === null ? null : tierOf(overall * 100) };
}

export function tierOf(pct) {
  const p = Math.round(pct);
  return TIERS.find(t => p >= t.min && p <= t.max) || TIERS[TIERS.length - 1];
}

export function pct(v) { return v === null || v === undefined ? '—' : Math.round(v * 100) + ' %'; }

// Liste des non-conformités triées par criticité puis domaine
export function nonConformities(evaluation) {
  const answers = evaluation.answers || {};
  const out = [];
  for (const d of DOMAINS) for (const s of d.sections) for (const c of s.criteria) {
    const v = criterionValue(c, answers[c.id]);
    if (v === null || v >= 1) continue;
    out.push({ ...c, domain: d, section: s, value: v, note: answers[c.id]?.note || '' });
  }
  const order = { C: 0, M: 1, m: 2 };
  out.sort((a, b) => order[a.crit] - order[b.crit] || a.value - b.value || a.id.localeCompare(b.id));
  return out;
}
