export interface FixedViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export function fixedViewportTransform(
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  originX = 0.5,
  originY = 0.5
): FixedViewportTransform {
  const safeZoom =
    Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const scale = 1 / safeZoom;
  const anchorX = viewportWidth * originX;
  const anchorY = viewportHeight * originY;

  return {
    x: anchorX * (1 - scale),
    y: anchorY * (1 - scale),
    scale
  };
}
