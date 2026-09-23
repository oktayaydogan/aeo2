import Phaser from "phaser";
import type { CommandRejectionEvent } from "@aeo2/simulation";
import { commandRejectionMessage } from "../commandRejectionFeedback";
import {
  cursorForCommandIntent,
  labelForCommandIntent,
  type CommandIntent
} from "../input/commandIntent";

const FEEDBACK_DEPTH = 99_500;

export class CommandFeedbackRenderer {
  private lastRejectionSequence = 0;
  private rejectionText?: Phaser.GameObjects.Text;

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

  syncAuthoritativeRejections(
    events: readonly CommandRejectionEvent[]
  ): void {
    const unseen = events.filter(
      (event) => event.sequence > this.lastRejectionSequence
    );

    if (unseen.length === 0) {
      return;
    }

    const latest = unseen[unseen.length - 1];

    if (!latest) {
      return;
    }

    this.lastRejectionSequence = Math.max(
      ...unseen.map((event) => event.sequence)
    );
    this.showRejectionToast(
      commandRejectionMessage(latest.reason)
    );
  }

  resetCursor(): void {
    this.setCursor("none");
  }

  private showRejectionToast(message: string): void {
    if (this.rejectionText?.active) {
      this.scene.tweens.killTweensOf(this.rejectionText);
      this.rejectionText.destroy();
    }

    const text = this.scene.add
      .text(
        this.scene.scale.width / 2,
        this.scene.scale.height - 138,
        message,
        {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "13px",
          fontStyle: "bold",
          color: "#ffe8df",
          backgroundColor: "#381d1be8",
          padding: { x: 10, y: 6 }
        }
      )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(FEEDBACK_DEPTH + 20_000);

    this.rejectionText = text;

    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 10,
      delay: 700,
      duration: 500,
      ease: "Cubic.Out",
      onComplete: () => {
        if (this.rejectionText === text) {
          this.rejectionText = undefined;
        }
        text.destroy();
      }
    });
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
