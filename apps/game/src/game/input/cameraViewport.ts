const DEFAULT_EDGE_MARGIN = 12;

export interface CameraPanVector {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

export function edgePanVector(
  pointerX: number,
  pointerY: number,
  width: number,
  height: number,
  margin = DEFAULT_EDGE_MARGIN
): CameraPanVector {
  if (
    width <= 0 ||
    height <= 0 ||
    pointerX < 0 ||
    pointerY < 0 ||
    pointerX > width ||
    pointerY > height
  ) {
    return { x: 0, y: 0 };
  }

  return {
    x:
      pointerX <= margin
        ? -1
        : pointerX >= width - margin
          ? 1
          : 0,
    y:
      pointerY <= margin
        ? -1
        : pointerY >= height - margin
          ? 1
          : 0
  };
}

export function initialCameraZoom(
  viewportWidth: number,
  viewportHeight: number
): number {
  const widthScale = viewportWidth / 1100;
  const heightScale = viewportHeight / 680;
  const responsiveScale = Math.min(widthScale, heightScale) * 1.15;

  return Math.min(1.35, Math.max(0.9, responsiveScale));
}
