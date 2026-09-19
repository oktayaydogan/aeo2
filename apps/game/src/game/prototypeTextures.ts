import Phaser from "phaser";

const TEXTURE_KEYS = [
  "unit-villager",
  "unit-militia",
  "resource-wood",
  "resource-food",
  "resource-gold",
  "building-town-center",
  "building-house",
  "building-barracks"
] as const;

export function createPrototypeTextures(scene: Phaser.Scene): void {
  if (TEXTURE_KEYS.every((key) => scene.textures.exists(key))) {
    return;
  }

  createVillagerTexture(scene);
  createMilitiaTexture(scene);
  createResourceTextures(scene);
  createBuildingTextures(scene);
}

function graphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.add.graphics().setVisible(false);
}

function createVillagerTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("unit-villager")) return;

  const g = graphics(scene);
  g.fillStyle(0xe2c57a, 1);
  g.fillCircle(12, 8, 5);
  g.fillStyle(0x6c7f91, 1);
  g.fillRoundedRect(7, 13, 10, 11, 3);
  g.fillStyle(0x4d3828, 1);
  g.fillRect(7, 24, 4, 6);
  g.fillRect(13, 24, 4, 6);
  g.lineStyle(2, 0x261f1a, 0.9);
  g.lineBetween(17, 14, 22, 6);
  g.generateTexture("unit-villager", 24, 32);
  g.destroy();
}

function createMilitiaTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("unit-militia")) return;

  const g = graphics(scene);
  g.fillStyle(0xd7bd7a, 1);
  g.fillCircle(12, 7, 5);
  g.fillStyle(0x5c7288, 1);
  g.fillTriangle(5, 13, 19, 13, 12, 28);
  g.lineStyle(2, 0xd9dde1, 1);
  g.lineBetween(18, 14, 23, 4);
  g.lineBetween(21, 4, 23, 4);
  g.fillStyle(0x4a3027, 1);
  g.fillCircle(5, 18, 4);
  g.generateTexture("unit-militia", 26, 32);
  g.destroy();
}

function createResourceTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists("resource-wood")) {
    const g = graphics(scene);
    g.fillStyle(0x59452d, 1);
    g.fillRect(13, 18, 6, 13);
    g.fillStyle(0x3f7446, 1);
    g.fillCircle(16, 12, 11);
    g.fillCircle(9, 15, 7);
    g.fillCircle(23, 15, 7);
    g.generateTexture("resource-wood", 32, 32);
    g.destroy();
  }

  if (!scene.textures.exists("resource-food")) {
    const g = graphics(scene);
    g.fillStyle(0x497442, 1);
    g.fillCircle(16, 18, 11);
    g.fillStyle(0xb34e6f, 1);
    for (const [x, y] of [
      [10, 15],
      [16, 12],
      [21, 16],
      [13, 21],
      [20, 22]
    ] as const) {
      g.fillCircle(x, y, 3);
    }
    g.generateTexture("resource-food", 32, 32);
    g.destroy();
  }

  if (!scene.textures.exists("resource-gold")) {
    const g = graphics(scene);
    g.fillStyle(0x8d7540, 1);
    g.fillTriangle(3, 27, 12, 8, 18, 27);
    g.fillStyle(0xd8b849, 1);
    g.fillTriangle(10, 27, 21, 5, 29, 27);
    g.lineStyle(2, 0xf0d778, 0.8);
    g.lineBetween(15, 21, 23, 10);
    g.generateTexture("resource-gold", 32, 32);
    g.destroy();
  }
}

function createBuildingTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists("building-house")) {
    const g = graphics(scene);
    g.fillStyle(0x9a744c, 1);
    g.fillRect(11, 22, 42, 28);
    g.fillStyle(0x6f4234, 1);
    g.fillTriangle(5, 23, 32, 4, 59, 23);
    g.fillStyle(0x39291f, 1);
    g.fillRect(27, 34, 10, 16);
    g.generateTexture("building-house", 64, 56);
    g.destroy();
  }

  if (!scene.textures.exists("building-barracks")) {
    const g = graphics(scene);
    g.fillStyle(0x76534b, 1);
    g.fillRect(8, 19, 64, 37);
    g.fillStyle(0x4d3833, 1);
    g.fillTriangle(3, 20, 40, 3, 77, 20);
    g.fillStyle(0xb5a071, 1);
    g.fillRect(16, 29, 10, 10);
    g.fillRect(54, 29, 10, 10);
    g.fillStyle(0x30251f, 1);
    g.fillRect(34, 36, 13, 20);
    g.generateTexture("building-barracks", 80, 60);
    g.destroy();
  }

  if (!scene.textures.exists("building-town-center")) {
    const g = graphics(scene);
    g.fillStyle(0x856942, 1);
    g.fillRect(8, 22, 80, 48);
    g.fillStyle(0x644238, 1);
    g.fillTriangle(2, 24, 48, 2, 94, 24);
    g.fillStyle(0xa58b58, 1);
    g.fillRect(15, 31, 18, 16);
    g.fillRect(63, 31, 18, 16);
    g.fillStyle(0x33271f, 1);
    g.fillRect(40, 45, 16, 25);
    g.generateTexture("building-town-center", 96, 72);
    g.destroy();
  }
}
