const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function formatPercent(p: number, digits = 1): string {
  if (!Number.isFinite(p)) return '—';
  const safeDigits = Math.max(0, Math.min(6, Math.trunc(digits)));
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: safeDigits,
  }).format(p);
}

export function formatDecimal(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const safeDigits = Math.max(0, Math.min(10, Math.trunc(digits)));
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: safeDigits,
    maximumFractionDigits: safeDigits,
  }).format(v);
}

export function formatCostUsd(inputTokens: number): string {
  if (!Number.isFinite(inputTokens) || inputTokens <= 0) return '$0,00';
  // subq-snap-1.2 reference rate: $0.04 per 1M input tokens
  const usd = (inputTokens / 1_000_000) * 0.04;
  if (usd < 0.0001) {
    return `$${new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(usd)}`;
  }
  return `$${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(usd)}`;
}

export function slugifyKey(
  label: string,
  used?: Set<string> | Iterable<string>,
): string {
  const existing = used ? (used instanceof Set ? used : new Set(used)) : new Set<string>();

  let base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
    .replace(/_+$/g, '');

  if (!base) {
    base = 'pergunta';
  }
  if (FORBIDDEN_KEYS.has(base)) {
    base = `q_${base}`;
  }

  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate) || FORBIDDEN_KEYS.has(candidate)) {
    const tag = `_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 100 - tag.length))}${tag}`;
    suffix += 1;
  }

  if (used instanceof Set) {
    used.add(candidate);
  }
  return candidate;
}
