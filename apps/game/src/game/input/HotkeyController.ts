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
  stopSelectedUnits(): void;
  assignControlGroup(slot: number): void;
  recallControlGroup(slot: number): void;
  restartEndedMatch(): void;
}

export class HotkeyController {
  private controlKey?: Phaser.Input.Keyboard.Key;

  constructor(
    private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null,
    private readonly actions: HotkeyActions
  ) {}

  configure(): void {
    if (!this.keyboard) {
      return;
    }

    this.controlKey = this.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.CTRL
    );

    for (let slot = 1; slot <= 9; slot += 1) {
      this.bind(48 + slot, () => {
        if (this.controlKey?.isDown) {
          this.actions.assignControlGroup(slot);
        } else {
          this.actions.recallControlGroup(slot);
        }
      });
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
    this.bind(Phaser.Input.Keyboard.KeyCodes.SPACE, () =>
      this.actions.stopSelectedUnits()
    );
    this.bind(Phaser.Input.Keyboard.KeyCodes.R, () =>
      this.actions.restartEndedMatch()
    );
  }

  private bind(keyCode: number, action: () => void): void {
    this.keyboard?.addKey(keyCode).on("down", action);
  }
}
