import Phaser from "phaser";
import {
  resolveCommandIntent,
  type CommandIntent
} from "./commandIntent";

export interface CommandInputActions {
  isPlacementActive(): boolean;
  hasSelectedUnits(): boolean;
  issueBuild(pointer: Phaser.Input.Pointer): boolean;
  drawPlacementPreview(pointer: Phaser.Input.Pointer): void;
  findResource(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined;
  findEnemyUnit(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined;
  findEnemyBuilding(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined;
  hasSelectedBuilding(): boolean;
  issueGather(resourceId: string): boolean;
  issueAttack(targetUnitId: string): boolean;
  issueAttackBuilding(targetBuildingId: string): boolean;
  issueRallyPoint(pointer: Phaser.Input.Pointer): boolean;
  issueMove(pointer: Phaser.Input.Pointer): boolean;
  setIntentCursor(intent: CommandIntent): void;
  showCommandFeedback(
    intent: CommandIntent,
    pointer: Phaser.Input.Pointer,
    accepted: boolean
  ): void;
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
          const accepted = this.actions.issueBuild(pointer);
          this.actions.showCommandFeedback("build", pointer, accepted);
          return;
        }

        if (!pointer.rightButtonDown()) {
          return;
        }

        const context = this.resolveContext(currentlyOver);

        if (context.resourceId) {
          const accepted = this.actions.issueGather(context.resourceId);
          this.actions.showCommandFeedback("gather", pointer, accepted);
        } else if (context.targetUnitId) {
          const accepted = this.actions.issueAttack(context.targetUnitId);
          this.actions.showCommandFeedback("attack", pointer, accepted);
        } else if (context.targetBuildingId) {
          const accepted = this.actions.issueAttackBuilding(
            context.targetBuildingId
          );
          this.actions.showCommandFeedback("attack", pointer, accepted);
        } else if (this.actions.hasSelectedBuilding()) {
          const accepted = this.actions.issueRallyPoint(pointer);
          this.actions.showCommandFeedback("rally", pointer, accepted);
        } else {
          const accepted = this.actions.issueMove(pointer);
          this.actions.showCommandFeedback("move", pointer, accepted);
        }
      }
    );

    this.input.on(
      "pointermove",
      (
        pointer: Phaser.Input.Pointer,
        currentlyOver: Phaser.GameObjects.GameObject[]
      ) => {
        if (this.actions.isPlacementActive()) {
          this.actions.drawPlacementPreview(pointer);
        }

        const context = this.resolveContext(currentlyOver);
        const intent = resolveCommandIntent({
          placementActive: this.actions.isPlacementActive(),
          hasSelectedUnits: this.actions.hasSelectedUnits(),
          hasSelectedBuilding: this.actions.hasSelectedBuilding(),
          overResource: context.resourceId !== undefined,
          overEnemyUnit: context.targetUnitId !== undefined,
          overEnemyBuilding: context.targetBuildingId !== undefined
        });

        this.actions.setIntentCursor(intent);
      }
    );

    this.input.on("gameout", () => {
      this.actions.setIntentCursor("none");
    });
  }

  private resolveContext(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): {
    resourceId?: string;
    targetUnitId?: string;
    targetBuildingId?: string;
  } {
    return {
      resourceId: this.actions.findResource(currentlyOver),
      targetUnitId: this.actions.findEnemyUnit(currentlyOver),
      targetBuildingId: this.actions.findEnemyBuilding(currentlyOver)
    };
  }
}
