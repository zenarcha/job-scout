// Small text utilities used across discovery/enrichment.

export function slugify(input: string | undefined | null): string {
  return (input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unknown';
}

// Canonical role-title key for cross-source dedup (collapse punctuation/casing/spacing).
export function normalizeTitle(title: string | undefined | null): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}
