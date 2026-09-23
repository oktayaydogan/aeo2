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


export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isometricMapBounds(
  mapWidth: number,
  mapHeight: number,
  projection: IsometricProjection,
  paddingX = 0,
  paddingY = 0
): ScreenBounds {
  const corners = [
    gridToScreen({ x: 0, y: 0 }, projection),
    gridToScreen({ x: mapWidth, y: 0 }, projection),
    gridToScreen({ x: mapWidth, y: mapHeight }, projection),
    gridToScreen({ x: 0, y: mapHeight }, projection)
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs) - paddingX;
  const maxX = Math.max(...xs) + paddingX;
  const minY = Math.min(...ys) - paddingY;
  const maxY = Math.max(...ys) + paddingY;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
