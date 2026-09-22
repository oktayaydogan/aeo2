const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;
const ZOOM_SENSITIVITY = 0.001;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export function nextCameraZoom(
  currentZoom: number,
  deltaY: number
): number {
  return Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, currentZoom - deltaY * ZOOM_SENSITIVITY)
  );
}

export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number
): number {
  if (deltaMode === DOM_DELTA_LINE) {
    return deltaY * 16;
  }

  if (deltaMode === DOM_DELTA_PAGE) {
    return deltaY * viewportHeight;
  }

  return deltaY;
}
