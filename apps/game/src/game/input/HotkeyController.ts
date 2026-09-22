import Phaser from "phaser";

export interface HotkeyActions {
  placeHouse(): void;
  placeBarracks(): void;
  placeArcheryRange(): void;
  cancelPlacement(): void;
  trainMilitia(): void;
  trainVillager(): void;
  trainArcher(): void;
  trainSpearman(): void;
  researchForgedWeapons(): void;
  restartEndedMatch(): void;
}

export class HotkeyController {
  constructor(
    private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null,
    private readonly actions: HotkeyActions
  ) {}

  configure(): void {
    if (!this.keyboard) {
      return;
    }

    this.bind(Phaser.Input.Keyboard.KeyCodes.H, () => this.actions.placeHouse());
    this.bind(Phaser.Input.Keyboard.KeyCodes.B, () => this.actions.placeBarracks());
    this.bind(Phaser.Input.Keyboard.KeyCodes.X, () => this.actions.placeArcheryRange());
    this.bind(Phaser.Input.Keyboard.KeyCodes.ESC, () => this.actions.cancelPlacement());
    this.bind(Phaser.Input.Keyboard.KeyCodes.M, () => this.actions.trainMilitia());
    this.bind(Phaser.Input.Keyboard.KeyCodes.V, () => this.actions.trainVillager());
    this.bind(Phaser.Input.Keyboard.KeyCodes.C, () => this.actions.trainArcher());
    this.bind(Phaser.Input.Keyboard.KeyCodes.P, () => this.actions.trainSpearman());
    this.bind(Phaser.Input.Keyboard.KeyCodes.F, () =>
      this.actions.researchForgedWeapons()
    );
    this.bind(Phaser.Input.Keyboard.KeyCodes.R, () =>
      this.actions.restartEndedMatch()
    );
  }

  private bind(keyCode: number, action: () => void): void {
    this.keyboard?.addKey(keyCode).on("down", action);
  }
}
