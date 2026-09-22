import Phaser from "phaser";

export class CameraController {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  constructor(private readonly scene: Phaser.Scene) {}

  configure(): void {
    const keyboard = this.scene.input.keyboard;

    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = {
        up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      };
    }

    this.scene.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number
      ) => {
        const camera = this.scene.cameras.main;
        camera.setZoom(
          Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, 0.55, 1.8)
        );
      }
    );
  }

  update(delta: number): void {
    const camera = this.scene.cameras.main;
    const speed = (520 * delta) / 1000 / camera.zoom;

    if (this.wasd?.up.isDown || this.cursors?.up.isDown) {
      camera.scrollY -= speed;
    }
    if (this.wasd?.down.isDown || this.cursors?.down.isDown) {
      camera.scrollY += speed;
    }
    if (this.wasd?.left.isDown || this.cursors?.left.isDown) {
      camera.scrollX -= speed;
    }
    if (this.wasd?.right.isDown || this.cursors?.right.isDown) {
      camera.scrollX += speed;
    }
  }
}
