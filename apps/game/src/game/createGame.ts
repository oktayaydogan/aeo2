import Phaser from "phaser";
import { UiScene } from "./scenes/UiScene";
import { WorldScene } from "./scenes/WorldScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#101922",
    render: { antialias: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%"
    },
    scene: [WorldScene, UiScene]
  });

  game.canvas.addEventListener("contextmenu", event => event.preventDefault());
  return game;
}
