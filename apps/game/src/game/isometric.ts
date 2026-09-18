export interface Point2 { x: number; y: number; }

export interface IsometricProjection {
  tileWidth: number;
  tileHeight: number;
  originX: number;
  originY: number;
}

export function gridToScreen(point: Point2, p: IsometricProjection): Point2 {
  return {
    x: p.originX + (point.x - point.y) * (p.tileWidth / 2),
    y: p.originY + (point.x + point.y) * (p.tileHeight / 2)
  };
}

export function screenToGrid(point: Point2, p: IsometricProjection): Point2 {
  const x = point.x - p.originX;
  const y = point.y - p.originY;

  return {
    x: y / p.tileHeight + x / p.tileWidth,
    y: y / p.tileHeight - x / p.tileWidth
  };
}
