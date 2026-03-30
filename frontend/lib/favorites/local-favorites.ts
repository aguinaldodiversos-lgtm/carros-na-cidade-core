const STORAGE_KEY = "cnc:favorite-ad-slugs";

function readSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeSlugs(slugs: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
    window.dispatchEvent(new Event("cnc-favorites-changed"));
  } catch {
    /* ignore */
  }
}

export function getFavoriteSlugs(): string[] {
  return readSlugs();
}

export function isFavoriteSlug(slug: string): boolean {
  if (!slug) return false;
  return readSlugs().includes(slug);
}

export function toggleFavoriteSlug(slug: string): boolean {
  if (!slug) return false;
  const set = new Set(readSlugs());
  const next = set.has(slug);
  if (next) {
    set.delete(slug);
  } else {
    set.add(slug);
  }
  writeSlugs([...set]);
  return !next;
}
