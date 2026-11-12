export const WORLD_MAP_GEOMETRY = Object.freeze({
  width: 6001,
  height: 6001,
  originX: 3000,
  originZ: 3000,
  minX: -3000,
  maxX: 3000,
  minZ: -3000,
  maxZ: 3000,
  coordinateSystem: "minecraft-block-pixel-centers",
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
  const width = Number(geometry.width);
  const height = Number(geometry.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  return {
    x: ((nx + Number(geometry.originX) + 0.5) / width) * 100,
    y: ((nz + Number(geometry.originZ) + 0.5) / height) * 100,
  };
}

export function coordinateGeometryMatchesManifest(value) {
  if (!value || typeof value !== "object") return false;
  const keys = ["width", "height", "originX", "originY", "minX", "maxX", "minZ", "maxZ"];
  const expected = {
    width: WORLD_MAP_GEOMETRY.width,
    height: WORLD_MAP_GEOMETRY.height,
    originX: WORLD_MAP_GEOMETRY.originX,
    originY: WORLD_MAP_GEOMETRY.originZ,
    minX: WORLD_MAP_GEOMETRY.minX,
    maxX: WORLD_MAP_GEOMETRY.maxX,
    minZ: WORLD_MAP_GEOMETRY.minZ,
    maxZ: WORLD_MAP_GEOMETRY.maxZ,
  };
  return value.type === WORLD_MAP_GEOMETRY.coordinateSystem
    && keys.every((key) => Number(value[key]) === expected[key]);
}

export const MAP_ZOOM_MIN_PERCENT = 1;
export const MAP_ZOOM_MAX_PERCENT = 100;
export const MAP_ZOOM_MAX_SCALE = 24;

export function mapZoomPercentToScale(percent) {
  const numeric = Number(percent);
  const normalized = Number.isFinite(numeric)
    ? Math.min(MAP_ZOOM_MAX_PERCENT, Math.max(MAP_ZOOM_MIN_PERCENT, numeric))
    : MAP_ZOOM_MAX_PERCENT;
  return 1 + ((MAP_ZOOM_MAX_PERCENT - normalized) / (MAP_ZOOM_MAX_PERCENT - MAP_ZOOM_MIN_PERCENT))
    * (MAP_ZOOM_MAX_SCALE - 1);
}

export function normalizeMapZoomPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MAP_ZOOM_MAX_PERCENT;
  return Math.round(Math.min(MAP_ZOOM_MAX_PERCENT, Math.max(MAP_ZOOM_MIN_PERCENT, numeric)));
}
