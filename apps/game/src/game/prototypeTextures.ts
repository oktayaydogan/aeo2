import Phaser from "phaser";

const TEXTURE_KEYS = [
  "unit-villager",
  "unit-militia",
  "unit-archer",
  "unit-spearman",
  "resource-wood",
  "resource-food",
  "resource-gold",
  "building-town-center",
  "building-house",
  "building-barracks",
  "building-archery-range"
] as const;

const OUTLINE = 0x201c19;
const SKIN = 0xd9b57b;
const SKIN_SHADOW = 0xa97d52;
const METAL = 0xc8d0d2;
const METAL_DARK = 0x68757a;
const LEATHER = 0x6a4932;
const SHADOW = 0x050708;

export function createPrototypeTextures(scene: Phaser.Scene): void {
  if (TEXTURE_KEYS.every((key) => scene.textures.exists(key))) {
    return;
  }

  createVillagerTexture(scene);
  createMilitiaTexture(scene);
  createArcherTexture(scene);
  createSpearmanTexture(scene);
  createResourceTextures(scene);
  createBuildingTextures(scene);
}

function graphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.add.graphics().setVisible(false);
}

function drawUnitShadow(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(SHADOW, 0.32);
  g.fillEllipse(16, 35, 20, 7);
}

function drawHead(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  helmetColor?: number
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(x, y, 6);
  g.fillStyle(SKIN_SHADOW, 1);
  g.fillCircle(x + 1, y + 1, 5);
  g.fillStyle(SKIN, 1);
  g.fillCircle(x, y, 4.4);

  if (helmetColor !== undefined) {
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(x - 6, y - 5, 12, 6, 2);
    g.fillStyle(helmetColor, 1);
    g.fillRoundedRect(x - 5, y - 4, 10, 5, 2);
    g.fillStyle(METAL, 0.42);
    g.fillRect(x - 3, y - 3, 5, 1);
  }
}

function drawLegs(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(4, OUTLINE, 1);
  g.lineBetween(12, 27, 11, 34);
  g.lineBetween(20, 27, 21, 34);
  g.lineStyle(2, LEATHER, 1);
  g.lineBetween(12, 27, 11, 34);
  g.lineBetween(20, 27, 21, 34);
}

function createVillagerTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("unit-villager")) return;

  const g = graphics(scene);
  drawUnitShadow(g);
  drawLegs(g);

  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(9, 14, 14, 15, 4);
  g.fillStyle(0x708a92, 1);
  g.fillRoundedRect(10, 15, 12, 13, 3);
  g.fillStyle(0x9eb0aa, 0.7);
  g.fillRect(11, 16, 3, 9);
  g.fillStyle(LEATHER, 1);
  g.fillRect(9, 25, 14, 3);

  drawHead(g, 16, 10);

  g.lineStyle(3, OUTLINE, 1);
  g.lineBetween(22, 17, 28, 7);
  g.lineStyle(2, 0x8b6339, 1);
  g.lineBetween(22, 17, 28, 7);
  g.fillStyle(0x9ca5a3, 1);
  g.fillTriangle(25, 7, 31, 4, 29, 10);

  g.generateTexture("unit-villager", 32, 40);
  g.destroy();
}

function createMilitiaTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("unit-militia")) return;

  const g = graphics(scene);
  drawUnitShadow(g);
  drawLegs(g);

  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(7, 15, 25, 15, 23, 30);
  g.fillStyle(0x657f91, 1);
  g.fillTriangle(9, 16, 23, 16, 21, 29);
  g.fillStyle(0x879dac, 0.65);
  g.fillTriangle(10, 17, 15, 17, 13, 27);
  g.fillStyle(LEATHER, 1);
  g.fillRect(9, 25, 14, 3);

  drawHead(g, 16, 10, METAL_DARK);

  g.fillStyle(OUTLINE, 1);
  g.fillCircle(6, 21, 6);
  g.fillStyle(0x80533c, 1);
  g.fillCircle(6, 21, 4.8);
  g.lineStyle(1, 0xb8885a, 0.8);
  g.strokeCircle(6, 21, 3.2);

  g.lineStyle(4, OUTLINE, 1);
  g.lineBetween(23, 19, 30, 5);
  g.lineStyle(2, METAL, 1);
  g.lineBetween(23, 19, 30, 5);
  g.fillStyle(METAL, 1);
  g.fillTriangle(28, 6, 31, 1, 32, 8);

  g.generateTexture("unit-militia", 34, 40);
  g.destroy();
}

function createArcherTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("unit-archer")) return;

  const g = graphics(scene);
  drawUnitShadow(g);
  drawLegs(g);

  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(7, 15, 25, 15, 22, 30);
  g.fillStyle(0x627d61, 1);
  g.fillTriangle(9, 16, 23, 16, 20, 29);
  g.fillStyle(0x8fa07a, 0.6);
  g.fillTriangle(10, 17, 14, 17, 13, 27);

  drawHead(g, 16, 10, 0x6b745c);

  g.lineStyle(3, OUTLINE, 1);
  g.beginPath();
  g.arc(27, 20, 8, -1.15, 1.15, false);
  g.strokePath();
  g.lineStyle(2, 0x9a6a38, 1);
  g.beginPath();
  g.arc(27, 20, 7, -1.15, 1.15, false);
  g.strokePath();
  g.lineStyle(1, 0xe6dbbf, 1);
  g.lineBetween(24, 13, 30, 27);

  g.lineStyle(2, OUTLINE, 1);
  g.lineBetween(16, 21, 31, 14);
  g.lineStyle(1, 0xc4b18f, 1);
  g.lineBetween(16, 21, 31, 14);
  g.fillStyle(METAL, 1);
  g.fillTriangle(30, 12, 34, 12, 31, 16);

  g.generateTexture("unit-archer", 36, 40);
  g.destroy();
}

function createSpearmanTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("unit-spearman")) return;

  const g = graphics(scene);
  drawUnitShadow(g);
  drawLegs(g);

  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(7, 15, 25, 15, 22, 30);
  g.fillStyle(0x856b50, 1);
  g.fillTriangle(9, 16, 23, 16, 20, 29);
  g.fillStyle(0xaa8a64, 0.55);
  g.fillTriangle(10, 17, 14, 17, 13, 27);

  drawHead(g, 16, 10, 0x756d60);

  g.fillStyle(OUTLINE, 1);
  g.fillCircle(6, 21, 6);
  g.fillStyle(0x6f513a, 1);
  g.fillCircle(6, 21, 4.8);
  g.lineStyle(1, 0xa9875f, 0.8);
  g.strokeCircle(6, 21, 3.2);

  g.lineStyle(4, OUTLINE, 1);
  g.lineBetween(24, 34, 30, 2);
  g.lineStyle(2, 0x8c693e, 1);
  g.lineBetween(24, 34, 30, 2);
  g.fillStyle(METAL, 1);
  g.fillTriangle(27, 5, 30, 0, 33, 6);

  g.generateTexture("unit-spearman", 36, 40);
  g.destroy();
}

function createResourceTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists("resource-wood")) {
    const g = graphics(scene);
    g.fillStyle(SHADOW, 0.3);
    g.fillEllipse(24, 42, 34, 10);

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(20, 24, 9, 20, 3);
    g.fillStyle(0x6e4c2b, 1);
    g.fillRoundedRect(22, 24, 5, 20, 2);
    g.fillStyle(0xa17846, 0.7);
    g.fillRect(23, 27, 1, 13);

    g.fillStyle(0x294e36, 1);
    g.fillCircle(24, 16, 15);
    g.fillCircle(12, 21, 10);
    g.fillCircle(36, 21, 10);
    g.fillStyle(0x3d7046, 1);
    g.fillCircle(23, 13, 12);
    g.fillCircle(13, 19, 7);
    g.fillCircle(34, 19, 7);
    g.fillStyle(0x5b8b55, 0.7);
    g.fillCircle(19, 9, 5);
    g.fillCircle(30, 13, 4);

    g.generateTexture("resource-wood", 48, 48);
    g.destroy();
  }

  if (!scene.textures.exists("resource-food")) {
    const g = graphics(scene);
    g.fillStyle(SHADOW, 0.28);
    g.fillEllipse(24, 39, 32, 8);
    g.fillStyle(0x315d38, 1);
    g.fillCircle(24, 27, 14);
    g.fillCircle(14, 30, 8);
    g.fillCircle(35, 30, 8);
    g.fillStyle(0x4d7e47, 1);
    g.fillCircle(24, 24, 11);
    g.fillCircle(15, 28, 6);
    g.fillCircle(34, 28, 6);

    for (const [x, y] of [
      [15, 24],
      [22, 20],
      [30, 23],
      [19, 30],
      [27, 31],
      [34, 29]
    ] as const) {
      g.fillStyle(OUTLINE, 0.8);
      g.fillCircle(x, y, 4);
      g.fillStyle(0xb84f68, 1);
      g.fillCircle(x, y, 2.8);
      g.fillStyle(0xe1818f, 0.8);
      g.fillCircle(x - 1, y - 1, 0.8);
    }

    g.generateTexture("resource-food", 48, 44);
    g.destroy();
  }

  if (!scene.textures.exists("resource-gold")) {
    const g = graphics(scene);
    g.fillStyle(SHADOW, 0.3);
    g.fillEllipse(24, 39, 36, 9);
    g.fillStyle(0x4e483d, 1);
    g.fillTriangle(4, 38, 15, 16, 24, 38);
    g.fillTriangle(17, 38, 29, 9, 43, 38);
    g.fillStyle(0x9c7830, 1);
    g.fillTriangle(7, 36, 15, 19, 21, 36);
    g.fillStyle(0xd3aa3e, 1);
    g.fillTriangle(20, 36, 29, 12, 40, 36);
    g.fillStyle(0xf2d46a, 1);
    g.fillTriangle(27, 26, 31, 16, 34, 27);
    g.lineStyle(1, 0xffe498, 0.8);
    g.lineBetween(14, 29, 17, 22);
    g.lineBetween(30, 29, 34, 21);

    g.generateTexture("resource-gold", 48, 44);
    g.destroy();
  }
}

function createBuildingTextures(scene: Phaser.Scene): void {
  createHouseTexture(scene);
  createBarracksTexture(scene);
  createTownCenterTexture(scene);
  createArcheryRangeTexture(scene);
}

function createHouseTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("building-house")) return;

  const g = graphics(scene);
  drawIsoBuildingShadow(g, 40, 62, 58);
  drawIsoPrism(g, 40, 20, 30, 15, 27, 0xb5905f, 0x8b6846, 0x725139);
  drawIsoRoof(g, 40, 7, 34, 17, 16, 0x8d5846, 0x71463a);
  drawIsoDoor(g, 40, 47, 9, 13);

  g.generateTexture("building-house", 80, 68);
  g.destroy();
}

function createBarracksTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("building-barracks")) return;

  const g = graphics(scene);
  drawIsoBuildingShadow(g, 48, 72, 76);
  drawIsoPrism(g, 48, 24, 38, 19, 31, 0x946f62, 0x74554d, 0x5c403b);
  drawIsoRoof(g, 48, 7, 42, 21, 18, 0x694b43, 0x4e3934);
  drawIsoDoor(g, 48, 55, 11, 16);
  drawIsoWindow(g, 28, 49, 7, 6);
  drawIsoWindow(g, 68, 49, 7, 6);

  g.lineStyle(3, OUTLINE, 1);
  g.lineBetween(18, 58, 18, 25);
  g.lineStyle(1, 0xa1845d, 1);
  g.lineBetween(18, 57, 18, 26);

  g.generateTexture("building-barracks", 96, 78);
  g.destroy();
}

function createTownCenterTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("building-town-center")) return;

  const g = graphics(scene);
  drawIsoBuildingShadow(g, 56, 88, 96);
  drawIsoPrism(g, 56, 30, 48, 24, 38, 0x9c8254, 0x856b45, 0x6c5338);
  drawIsoRoof(g, 56, 8, 52, 26, 24, 0x7d5446, 0x62443a);
  drawIsoDoor(g, 56, 67, 13, 19);
  drawIsoWindow(g, 30, 58, 10, 8);
  drawIsoWindow(g, 82, 58, 10, 8);

  drawIsoTower(g, 23, 20);
  drawIsoTower(g, 89, 20);

  g.generateTexture("building-town-center", 112, 94);
  g.destroy();
}

function createArcheryRangeTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("building-archery-range")) return;

  const g = graphics(scene);
  drawIsoBuildingShadow(g, 48, 72, 76);
  drawIsoPrism(g, 48, 25, 38, 19, 30, 0x80906b, 0x657154, 0x4d5a45);
  drawIsoRoof(g, 48, 9, 42, 21, 17, 0x607356, 0x46543e);
  drawIsoDoor(g, 48, 55, 10, 15);
  drawIsoWindow(g, 28, 49, 8, 6);
  drawIsoWindow(g, 68, 49, 8, 6);

  g.lineStyle(3, OUTLINE, 1);
  g.beginPath();
  g.arc(73, 57, 9, -1.2, 1.2, false);
  g.strokePath();
  g.lineStyle(2, 0xa26f3e, 1);
  g.beginPath();
  g.arc(73, 57, 7, -1.2, 1.2, false);
  g.strokePath();
  g.lineStyle(1, 0xdfd0ae, 1);
  g.lineBetween(70, 50, 76, 64);

  g.generateTexture("building-archery-range", 96, 78);
  g.destroy();
}

function drawIsoPrism(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  topY: number,
  halfWidth: number,
  halfDepth: number,
  height: number,
  topColor: number,
  leftColor: number,
  rightColor: number
): void {
  const top = { x: cx, y: topY };
  const right = { x: cx + halfWidth, y: topY + halfDepth };
  const bottom = { x: cx, y: topY + halfDepth * 2 };
  const left = { x: cx - halfWidth, y: topY + halfDepth };
  const leftDown = { x: left.x, y: left.y + height };
  const bottomDown = { x: bottom.x, y: bottom.y + height };
  const rightDown = { x: right.x, y: right.y + height };

  g.fillStyle(leftColor, 1);
  g.fillTriangle(left.x, left.y, bottom.x, bottom.y, leftDown.x, leftDown.y);
  g.fillTriangle(bottom.x, bottom.y, bottomDown.x, bottomDown.y, leftDown.x, leftDown.y);

  g.fillStyle(rightColor, 1);
  g.fillTriangle(bottom.x, bottom.y, right.x, right.y, bottomDown.x, bottomDown.y);
  g.fillTriangle(right.x, right.y, rightDown.x, rightDown.y, bottomDown.x, bottomDown.y);

  g.fillStyle(topColor, 1);
  g.fillTriangle(top.x, top.y, right.x, right.y, bottom.x, bottom.y);
  g.fillTriangle(top.x, top.y, bottom.x, bottom.y, left.x, left.y);

  g.lineStyle(2, OUTLINE, 1);
  g.lineBetween(top.x, top.y, right.x, right.y);
  g.lineBetween(right.x, right.y, bottom.x, bottom.y);
  g.lineBetween(bottom.x, bottom.y, left.x, left.y);
  g.lineBetween(left.x, left.y, top.x, top.y);
  g.lineBetween(left.x, left.y, leftDown.x, leftDown.y);
  g.lineBetween(bottom.x, bottom.y, bottomDown.x, bottomDown.y);
  g.lineBetween(right.x, right.y, rightDown.x, rightDown.y);
  g.lineBetween(leftDown.x, leftDown.y, bottomDown.x, bottomDown.y);
  g.lineBetween(bottomDown.x, bottomDown.y, rightDown.x, rightDown.y);
}

function drawIsoRoof(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  topY: number,
  halfWidth: number,
  halfDepth: number,
  ridgeHeight: number,
  nearColor: number,
  farColor: number
): void {
  const ridge = { x: cx, y: topY };
  const left = { x: cx - halfWidth, y: topY + halfDepth + ridgeHeight };
  const right = { x: cx + halfWidth, y: topY + halfDepth + ridgeHeight };
  const near = { x: cx, y: topY + halfDepth * 2 + ridgeHeight };

  g.fillStyle(farColor, 1);
  g.fillTriangle(ridge.x, ridge.y, right.x, right.y, near.x, near.y);
  g.fillStyle(nearColor, 1);
  g.fillTriangle(ridge.x, ridge.y, near.x, near.y, left.x, left.y);

  g.lineStyle(2, OUTLINE, 1);
  g.lineBetween(ridge.x, ridge.y, left.x, left.y);
  g.lineBetween(ridge.x, ridge.y, right.x, right.y);
  g.lineBetween(left.x, left.y, near.x, near.y);
  g.lineBetween(near.x, near.y, right.x, right.y);
}

function drawIsoDoor(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  y: number,
  width: number,
  height: number
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRect(cx - width / 2 - 1, y - 1, width + 2, height + 2);
  g.fillStyle(0x392920, 1);
  g.fillRect(cx - width / 2, y, width, height);
  g.fillStyle(0x6c4d35, 0.6);
  g.fillRect(cx - width / 2 + 2, y + 2, 2, height - 4);
  g.fillStyle(0xc9a45e, 1);
  g.fillCircle(cx + width / 2 - 3, y + height / 2, 1);
}

function drawIsoWindow(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  y: number,
  width: number,
  height: number
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRect(cx - width / 2 - 1, y - 1, width + 2, height + 2);
  g.fillStyle(0x62757a, 1);
  g.fillRect(cx - width / 2, y, width, height);
  g.lineStyle(1, 0xc7b782, 0.8);
  g.lineBetween(cx, y, cx, y + height);
}

function drawIsoTower(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  topY: number
): void {
  drawIsoPrism(g, cx, topY, 8, 4, 15, 0xaa875b, 0x806143, 0x674a37);
}

function drawIsoBuildingShadow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number
): void {
  g.fillStyle(SHADOW, 0.33);
  g.fillEllipse(x, y, width, 12);
}

function drawDoor(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(x - 1, y - 1, width + 2, height + 2, 2);
  g.fillStyle(0x392920, 1);
  g.fillRoundedRect(x, y, width, height, 1);
  g.fillStyle(0x6c4d35, 0.55);
  g.fillRect(x + 2, y + 2, 2, height - 4);
  g.fillStyle(0xc9a45e, 1);
  g.fillCircle(x + width - 3, y + height / 2, 1);
}

function drawWindow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRect(x - 1, y - 1, width + 2, height + 2);
  g.fillStyle(0xb89f6d, 1);
  g.fillRect(x, y, width, height);
  g.fillStyle(0x62757a, 1);
  g.fillRect(x + 2, y + 2, width - 4, height - 4);
  g.lineStyle(1, 0xc7b782, 0.8);
  g.lineBetween(x + width / 2, y + 1, x + width / 2, y + height - 1);
}
