export const WORLD_MAP_GEOMETRY = Object.freeze({
  minX: -3008,
  maxX: 3007,
  minZ: -3008,
  maxZ: 3007,
  coordinateSystem: "minecraft-world-block-centers",
});

export function isValidWorldCoordinate(x, z, geometry = WORLD_MAP_GEOMETRY) {
  const nx = Number(x);
  const nz = Number(z);
  return Number.isFinite(nx)
    && Number.isFinite(nz)
    && nx >= geometry.minX
    && nx <= geometry.maxX
    && nz >= geometry.minZ
    && nz <= geometry.maxZ;
}

export function worldCoordinateToPercent(x, z, geometry = WORLD_MAP_GEOMETRY) {
  const nx = Number(x);
  const nz = Number(z);
  if (!isValidWorldCoordinate(nx, nz, geometry)) return null;
  const worldWidth = Number(geometry.maxX) - Number(geometry.minX) + 1;
  const worldHeight = Number(geometry.maxZ) - Number(geometry.minZ) + 1;
  if (!Number.isFinite(worldWidth) || !Number.isFinite(worldHeight) || worldWidth <= 0 || worldHeight <= 0) return null;
  return {
    x: ((nx - Number(geometry.minX) + 0.5) / worldWidth) * 100,
    y: ((nz - Number(geometry.minZ) + 0.5) / worldHeight) * 100,
  };
}

export function coordinateGeometryMatchesManifest(value) {
  // Older map manifests did not describe coordinate geometry. They remain
  // compatible because Voxygen owns one fixed world-coordinate system.
  if (value == null) return true;
  if (typeof value !== "object") return false;
  const supportedTypes = new Set([
    WORLD_MAP_GEOMETRY.coordinateSystem,
    "minecraft-block-pixel-centers",
  ]);
  const keys = ["minX", "maxX", "minZ", "maxZ"];
  const expected = WORLD_MAP_GEOMETRY;
  return supportedTypes.has(value.type)
    && keys.every((key) => Number(value[key]) === expected[key]);
}

export const MAP_ZOOM_MIN_PERCENT = 1;
export const MAP_ZOOM_MAX_PERCENT = 100;
export const MAP_ZOOM_MAX_SCALE = 24;

export function mapZoomPercentToScale(percent) {
  const numeric = Number(percent);
  const visibleWorldPercent = Number.isFinite(numeric)
    ? Math.min(MAP_ZOOM_MAX_PERCENT, Math.max(MAP_ZOOM_MIN_PERCENT, numeric))
    : MAP_ZOOM_MAX_PERCENT;
  // The setting means how much of the world remains visible:
  // 100% is the full map (1x), 50% is 2x, 25% is 4x.
  // The upper zoom cap protects usability at the smallest percentages.
  return Math.min(MAP_ZOOM_MAX_SCALE, 100 / visibleWorldPercent);
}

export function normalizeMapZoomPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MAP_ZOOM_MAX_PERCENT;
  return Math.round(Math.min(MAP_ZOOM_MAX_PERCENT, Math.max(MAP_ZOOM_MIN_PERCENT, numeric)));
}