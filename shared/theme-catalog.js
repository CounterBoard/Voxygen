/**
 * Shared allowlist for Voxygen interface themes.
 *
 * This catalog is consumed by both the Mini App and the Cloudflare Worker.
 * Adding a theme here makes its ID valid at the API boundary; the matching
 * CSS token pack must also be added under src/theme/theme-tokens.css.
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
    description: 'Оригинальная тёмная тема Voxygen.',
  }),
});

export const VOXYGEN_THEME_IDS = Object.freeze(Object.keys(THEME_CATALOG));

export function isSupportedTheme(value) {
  const id = String(value ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(THEME_CATALOG, id);
}

export function normalizeThemeId(value, fallback = DEFAULT_THEME_ID) {
  const id = String(value ?? '').trim().toLowerCase();
  if (isSupportedTheme(id)) return id;
  return isSupportedTheme(fallback) ? String(fallback).trim().toLowerCase() : DEFAULT_THEME_ID;
}
