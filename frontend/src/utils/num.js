// Универсальная нормализация значений из stats / splits / radar.
// Значения приходят либо как число, либо как { value, pct } объект.
export function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Percentile rank — позиция значения внутри отсортированной выборки в %.
// Использует "less than or equal" (т.е. percentile = доля значений ≤ value).
// Возвращает 0–100. Если выборка <2 — fallback 50 (нет смысла сравнивать).
export function percentileRank(value, allValues) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const arr = (allValues || []).map(num).filter((v) => v !== null && !isNaN(v));
  if (arr.length < 2) return 50;
  let leq = 0;
  for (const v of arr) if (v <= value) leq++;
  return Math.round((leq / arr.length) * 100);
}
