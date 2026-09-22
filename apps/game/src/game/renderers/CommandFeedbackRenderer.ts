import Phaser from "phaser";
import {
  cursorForCommandIntent,
  labelForCommandIntent,
  type CommandIntent
} from "../input/commandIntent";

const FEEDBACK_DEPTH = 99_500;

export class CommandFeedbackRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

  setCursor(intent: CommandIntent): void {
    this.scene.game.canvas.style.cursor = cursorForCommandIntent(intent);
  }

  show(
    intent: CommandIntent,
    pointer: Phaser.Input.Pointer,
    accepted: boolean
  ): void {
    const feedbackIntent = accepted ? intent : "none";
    const color = accepted ? intentColor(feedbackIntent) : 0xe46f61;
    const label = accepted
      ? labelForCommandIntent(feedbackIntent)
      : "Invalid order";

    const marker = this.scene.add
      .graphics()
      .setPosition(pointer.worldX, pointer.worldY)
      .setDepth(FEEDBACK_DEPTH);

    marker.lineStyle(2, color, 0.95);

    if (accepted && intent === "build") {
      marker.strokeRect(-10, -10, 20, 20);
    } else if (!accepted) {
      marker.beginPath();
      marker.moveTo(-8, -8);
      marker.lineTo(8, 8);
      marker.moveTo(8, -8);
      marker.lineTo(-8, 8);
      marker.strokePath();
    } else {
      marker.strokeCircle(0, 0, 10);
      marker.strokeCircle(0, 0, 4);
    }

    const text = this.scene.add
      .text(pointer.worldX, pointer.worldY - 20, label, {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#fff8e6",
        backgroundColor: "#071017dd",
        padding: { x: 5, y: 3 }
      })
      .setOrigin(0.5, 1)
      .setDepth(FEEDBACK_DEPTH + 1);

    this.scene.tweens.add({
      targets: [marker, text],
      alpha: 0,
      scale: 1.45,
      duration: 520,
      ease: "Cubic.Out",
      onComplete: () => {
        marker.destroy();
        text.destroy();
      }
    });
  }

  resetCursor(): void {
    this.setCursor("none");
  }
}

function intentColor(intent: CommandIntent): number {
  switch (intent) {
    case "attack":
      return 0xe66e62;
    case "gather":
      return 0x7bcf88;
    case "build":
      return 0xe8c76b;
    case "rally":
      return 0x75bde8;
    case "move":
      return 0xf4e3a0;
    default:
      return 0xe46f61;
  }
}
