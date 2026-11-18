/**
 * Shared allowlist for Voxygen interface themes.
 *
 * This catalog is consumed by both the Mini App and the Cloudflare Worker.
 * Active entries are accepted by the API and shown in settings. Draft entries
 * are excluded until explicitly published. Every entry requires a complete
 * matching CSS token pack in src/theme/theme-tokens.css.
 *
 * User-generated/game colors are intentionally not part of this catalog.
 */
export const DEFAULT_THEME_ID = 'vox';

export const THEME_CATALOG = Object.freeze({
  vox: Object.freeze({
    id: 'vox',
    name: 'Vox',
    version: 1,
    status: 'active',
    description: 'Оригинальная тёмная тема\npurple + mint',
  }),
});

// Only published themes are selectable or accepted by the API.
export const VOXYGEN_THEME_IDS = Object.freeze(
  Object.keys(THEME_CATALOG).filter((id) => THEME_CATALOG[id].status === 'active'),
);

export function isSupportedTheme(value) {
  const id = String(value ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(THEME_CATALOG, id)
    && THEME_CATALOG[id].status === 'active';
}

export function normalizeThemeId(value, fallback = DEFAULT_THEME_ID) {
  const id = String(value ?? '').trim().toLowerCase();
  if (isSupportedTheme(id)) return id;
  return isSupportedTheme(fallback) ? String(fallback).trim().toLowerCase() : DEFAULT_THEME_ID;
}
