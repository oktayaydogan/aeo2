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
  drawBuildingShadow(g, 32, 51, 52);

  g.fillStyle(OUTLINE, 1);
  g.fillRect(9, 22, 46, 30);
  g.fillStyle(0x9b774d, 1);
  g.fillRect(11, 23, 42, 28);
  g.fillStyle(0xb5905f, 0.45);
  for (let y = 27; y <= 47; y += 6) {
    g.fillRect(13, y, 38, 1);
  }

  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(3, 24, 32, 3, 61, 24);
  g.fillStyle(0x71463a, 1);
  g.fillTriangle(6, 23, 32, 6, 58, 23);
  g.fillStyle(0x8d5846, 0.7);
  g.fillTriangle(14, 19, 32, 8, 32, 19);

  drawDoor(g, 26, 35, 12, 17);
  drawWindow(g, 15, 33, 8, 8);

  g.fillStyle(0x5e4530, 1);
  g.fillRect(47, 12, 5, 10);
  g.fillStyle(0x8c6d52, 1);
  g.fillRect(48, 13, 3, 9);

  g.generateTexture("building-house", 64, 58);
  g.destroy();
}

function createBarracksTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("building-barracks")) return;

  const g = graphics(scene);
  drawBuildingShadow(g, 40, 57, 70);

  g.fillStyle(OUTLINE, 1);
  g.fillRect(6, 20, 68, 38);
  g.fillStyle(0x74554d, 1);
  g.fillRect(8, 21, 64, 36);
  g.fillStyle(0x946f62, 0.5);
  g.fillRect(11, 25, 58, 3);
  g.fillRect(11, 35, 58, 2);

  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(2, 22, 40, 2, 78, 22);
  g.fillStyle(0x4e3934, 1);
  g.fillTriangle(5, 21, 40, 5, 75, 21);
  g.fillStyle(0x694b43, 0.7);
  g.fillTriangle(12, 18, 40, 7, 40, 18);

  drawDoor(g, 33, 38, 14, 20);
  drawWindow(g, 14, 31, 10, 9);
  drawWindow(g, 56, 31, 10, 9);

  g.lineStyle(3, OUTLINE, 1);
  g.lineBetween(17, 55, 17, 18);
  g.lineStyle(1, 0xa1845d, 1);
  g.lineBetween(17, 54, 17, 19);

  g.generateTexture("building-barracks", 80, 62);
  g.destroy();
}

function createTownCenterTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("building-town-center")) return;

  const g = graphics(scene);
  drawBuildingShadow(g, 48, 69, 88);

  g.fillStyle(OUTLINE, 1);
  g.fillRect(6, 22, 84, 49);
  g.fillStyle(0x856b45, 1);
  g.fillRect(8, 23, 80, 47);

  g.fillStyle(0x9c8254, 0.55);
  for (let y = 28; y <= 63; y += 8) {
    g.fillRect(12, y, 72, 2);
  }

  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(1, 25, 48, 2, 95, 25);
  g.fillStyle(0x62443a, 1);
  g.fillTriangle(4, 24, 48, 5, 92, 24);
  g.fillStyle(0x7d5446, 0.75);
  g.fillTriangle(13, 20, 48, 7, 48, 20);

  drawDoor(g, 40, 46, 16, 25);
  drawWindow(g, 17, 34, 15, 13);
  drawWindow(g, 64, 34, 15, 13);

  g.fillStyle(OUTLINE, 1);
  g.fillRect(13, 12, 10, 13);
  g.fillStyle(0x98764e, 1);
  g.fillRect(15, 13, 6, 12);
  g.fillStyle(OUTLINE, 1);
  g.fillRect(73, 12, 10, 13);
  g.fillStyle(0x98764e, 1);
  g.fillRect(75, 13, 6, 12);

  g.generateTexture("building-town-center", 96, 74);
  g.destroy();
}

function createArcheryRangeTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("building-archery-range")) return;

  const g = graphics(scene);
  drawBuildingShadow(g, 40, 57, 70);

  g.fillStyle(OUTLINE, 1);
  g.fillRect(6, 22, 68, 36);
  g.fillStyle(0x657154, 1);
  g.fillRect(8, 23, 64, 34);
  g.fillStyle(0x80906b, 0.45);
  g.fillRect(11, 28, 58, 2);
  g.fillRect(11, 39, 58, 2);

  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(2, 24, 40, 3, 78, 24);
  g.fillStyle(0x46543e, 1);
  g.fillTriangle(5, 23, 40, 6, 75, 23);

  drawWindow(g, 14, 32, 11, 9);
  drawWindow(g, 55, 32, 11, 9);
  drawDoor(g, 34, 39, 12, 19);

  g.lineStyle(3, OUTLINE, 1);
  g.beginPath();
  g.arc(63, 49, 10, -1.2, 1.2, false);
  g.strokePath();
  g.lineStyle(2, 0xa26f3e, 1);
  g.beginPath();
  g.arc(63, 49, 8, -1.2, 1.2, false);
  g.strokePath();
  g.lineStyle(1, 0xdfd0ae, 1);
  g.lineBetween(60, 41, 66, 57);

  g.generateTexture("building-archery-range", 80, 62);
  g.destroy();
}

function drawBuildingShadow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number
): void {
  g.fillStyle(SHADOW, 0.33);
  g.fillEllipse(x, y, width, 11);
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
