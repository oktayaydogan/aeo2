import Phaser from "phaser";

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;
const ZOOM_SENSITIVITY = 0.001;

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
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return deltaY * 16;
  }

  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return deltaY * viewportHeight;
  }

  return deltaY;
}

export class CameraController {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private configuredCanvas?: HTMLCanvasElement;
  private destroyed = false;

  private readonly onCanvasWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const canvas = this.configuredCanvas;

    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const camera = this.scene.cameras.main;
    const deltaY = Phaser.Math.Clamp(
      normalizeWheelDelta(
        event.deltaY,
        event.deltaMode,
        this.scene.scale.height
      ),
      -160,
      160
    );
    const nextZoom = nextCameraZoom(camera.zoom, deltaY);

    if (Math.abs(nextZoom - camera.zoom) <= Number.EPSILON) {
      return;
    }

    const screenX =
      (event.clientX - rect.left) *
      (this.scene.scale.width / rect.width);
    const screenY =
      (event.clientY - rect.top) *
      (this.scene.scale.height / rect.height);
    const beforeZoom = camera.getWorldPoint(screenX, screenY);

    camera.setZoom(nextZoom);

    const afterZoom = camera.getWorldPoint(screenX, screenY);

    camera.scrollX += beforeZoom.x - afterZoom.x;
    camera.scrollY += beforeZoom.y - afterZoom.y;
  };

  private readonly preventNativeGesture = (event: Event): void => {
    event.preventDefault();
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

    const canvas = this.scene.game.canvas;
    this.configuredCanvas = canvas;
    this.destroyed = false;

    canvas.style.touchAction = "none";
    canvas.style.overscrollBehavior = "none";

    canvas.addEventListener("wheel", this.onCanvasWheel, {
      passive: false
    });
    canvas.addEventListener(
      "gesturestart",
      this.preventNativeGesture,
      { passive: false }
    );
    canvas.addEventListener(
      "gesturechange",
      this.preventNativeGesture,
      { passive: false }
    );

    this.scene.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      this.destroy,
      this
    );
    this.scene.events.once(
      Phaser.Scenes.Events.DESTROY,
      this.destroy,
      this
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

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    const canvas = this.configuredCanvas;

    if (!canvas) {
      return;
    }

    canvas.removeEventListener("wheel", this.onCanvasWheel);
    canvas.removeEventListener(
      "gesturestart",
      this.preventNativeGesture
    );
    canvas.removeEventListener(
      "gesturechange",
      this.preventNativeGesture
    );

    this.configuredCanvas = undefined;
  }
}
