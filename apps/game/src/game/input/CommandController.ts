import Phaser from "phaser";

export interface CommandInputActions {
  isPlacementActive(): boolean;
  issueBuild(pointer: Phaser.Input.Pointer): void;
  drawPlacementPreview(pointer: Phaser.Input.Pointer): void;
  findResource(currentlyOver: Phaser.GameObjects.GameObject[]): string | undefined;
  findEnemyUnit(currentlyOver: Phaser.GameObjects.GameObject[]): string | undefined;
  findEnemyBuilding(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined;
  hasSelectedBuilding(): boolean;
  issueGather(resourceId: string): void;
  issueAttack(targetUnitId: string): void;
  issueAttackBuilding(targetBuildingId: string): void;
  issueRallyPoint(pointer: Phaser.Input.Pointer): void;
  issueMove(pointer: Phaser.Input.Pointer): void;
}

export class CommandController {
  constructor(
    private readonly input: Phaser.Input.InputPlugin,
    private readonly actions: CommandInputActions
  ) {}

  configure(): void {
    this.input.on(
      "pointerdown",
      (
        pointer: Phaser.Input.Pointer,
        currentlyOver: Phaser.GameObjects.GameObject[]
      ) => {
        if (pointer.leftButtonDown() && this.actions.isPlacementActive()) {
          this.actions.issueBuild(pointer);
          return;
        }

        if (!pointer.rightButtonDown()) {
          return;
        }

        const resourceId = this.actions.findResource(currentlyOver);
        const targetUnitId = this.actions.findEnemyUnit(currentlyOver);
        const targetBuildingId = this.actions.findEnemyBuilding(currentlyOver);

        if (resourceId) {
          this.actions.issueGather(resourceId);
        } else if (targetUnitId) {
          this.actions.issueAttack(targetUnitId);
        } else if (targetBuildingId) {
          this.actions.issueAttackBuilding(targetBuildingId);
        } else if (this.actions.hasSelectedBuilding()) {
          this.actions.issueRallyPoint(pointer);
        } else {
          this.actions.issueMove(pointer);
        }
      }
    );

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.actions.isPlacementActive()) {
        this.actions.drawPlacementPreview(pointer);
      }
    });
  }
}
