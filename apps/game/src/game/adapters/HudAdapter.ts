import Phaser from "phaser";
import { BUILDING_DEFINITIONS, UNIT_DEFINITIONS } from "@aeo2/content";
import type {
  BuildingKind,
  SimulationSnapshot,
  TechnologyKind,
  UnitKind
} from "@aeo2/simulation";
import { fixedViewportTransform } from "../fixedViewport";
import { getHudCommandAvailability } from "../hudState";
import {
  describeBuildingWork,
  describeUnitWork
} from "../hudWorkState";

type HudCommand =
  | "house"
  | "barracks"
  | "archery-range"
  | "villager"
  | "militia"
  | "spearman"
  | "archer"
  | "forged-weapons";

interface HudButton {
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  command: HudCommand;
}

export interface HudAdapterOptions {
  scene: Phaser.Scene;
  benchmarkMode: boolean;
  skirmishSeed: number;
  selectedUnitIds: Set<string>;
  getSelectedBuildingId(): string | undefined;
  setPlacementMode(kind: BuildingKind | undefined): void;
  issueTrain(unitKind: UnitKind): void;
  issueResearch(technologyKind: TechnologyKind): void;
}

export class HudAdapter {
  private readonly viewportContainer: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly economyText: Phaser.GameObjects.Text;
  private readonly objectiveText: Phaser.GameObjects.Text;
  private readonly selectionTitleText: Phaser.GameObjects.Text;
  private readonly selectionDetailsText: Phaser.GameObjects.Text;
  private readonly matchText: Phaser.GameObjects.Text;
  private readonly buttons: HudButton[] = [];

  constructor(private readonly options: HudAdapterOptions) {
    const scene = options.scene;

    this.viewportContainer = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(100_000);

    this.graphics = scene.add
      .graphics()
      .setScrollFactor(1)
      .setDepth(0);

    this.economyText = scene.add
      .text(18, 14, "", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#f5ead0"
      })
      .setScrollFactor(1)
      .setDepth(4);

    this.objectiveText = scene.add
      .text(scene.scale.width / 2, 16, "Destroy the enemy Town Center", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "13px",
        color: "#d9cfae"
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(1)
      .setDepth(4);

    this.selectionTitleText = scene.add
      .text(24, scene.scale.height - 108, "No selection", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#f5ead0"
      })
      .setScrollFactor(1)
      .setDepth(4);

    this.selectionDetailsText = scene.add
      .text(24, scene.scale.height - 78, "", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "13px",
        color: "#b9c5cc",
        lineSpacing: 4
      })
      .setScrollFactor(1)
      .setDepth(4);

    this.matchText = scene.add
      .text(scene.scale.width / 2, scene.scale.height / 2, "", {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#fff6d5",
        backgroundColor: "#081016ee",
        align: "center",
        padding: { x: 24, y: 18 }
      })
      .setOrigin(0.5)
      .setScrollFactor(1)
      .setDepth(20)
      .setVisible(false);

    this.createButtons();

    this.viewportContainer.add([
      this.graphics,
      this.economyText,
      this.objectiveText,
      this.selectionTitleText,
      this.selectionDetailsText,
      ...this.buttons.flatMap((button) => [
        button.background,
        button.label
      ]),
      this.matchText
    ]);

    this.syncViewport();
  }

  layout(snapshot: SimulationSnapshot): void {
    const width = this.options.scene.scale.width;
    const height = this.options.scene.scale.height;
    const panelHeight = 118;

    this.graphics.clear();

    if (this.options.benchmarkMode) {
      this.economyText.setVisible(false);
      this.objectiveText.setVisible(false);
      this.selectionTitleText.setVisible(false);
      this.selectionDetailsText.setVisible(false);

      for (const button of this.buttons) {
        button.background.setVisible(false);
        button.label.setVisible(false);
      }
      this.syncViewport();
      return;
    }

    this.economyText.setVisible(true);
    this.objectiveText.setVisible(true);
    this.selectionTitleText.setVisible(true);
    this.selectionDetailsText.setVisible(true);
    this.graphics.fillStyle(0x081016, 0.9);
    this.graphics.fillRect(0, 0, width, 44);
    this.graphics.lineStyle(1, 0x52636d, 0.45);
    this.graphics.lineBetween(0, 44, width, 44);

    this.graphics.fillStyle(0x081016, 0.94);
    this.graphics.fillRect(0, height - panelHeight, width, panelHeight);
    this.graphics.lineStyle(1, 0x52636d, 0.55);
    this.graphics.lineBetween(0, height - panelHeight, width, height - panelHeight);

    this.objectiveText.setPosition(width / 2, 14);
    this.selectionTitleText.setPosition(24, height - 100);
    this.selectionDetailsText.setPosition(24, height - 70);

    const visibleButtons = this.buttons.filter(
      (button) => button.background.visible
    );
    const buttonStartX = Math.max(430, width - 420);
    const firstRowY = height - 58;

    visibleButtons.forEach((button, index) => {
      const x = buttonStartX + index * 136;
      button.background.setPosition(x, firstRowY);
      button.label.setPosition(x, firstRowY);
    });

    if (snapshot.match.status === "ended") {
      for (const button of this.buttons) {
        this.setButtonEnabled(button, false);
      }
    }

    this.syncViewport();
  }

  update(snapshot: SimulationSnapshot): void {
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );
    const population = snapshot.population.find(
      (entry) => entry.playerId === "player-1"
    );
    const selectedUnits = snapshot.units.filter((unit) =>
      this.options.selectedUnitIds.has(unit.id)
    );
    const selectedBuilding = snapshot.buildings.find(
      (building) => building.id === this.options.getSelectedBuildingId()
    );
    const playerTechnologies =
      snapshot.technologies.find(
        (entry) => entry.playerId === "player-1"
      )?.researched ?? [];

    this.economyText.setText(
      `WOOD  ${Math.floor(stockpile?.resources.wood ?? 0)}     FOOD  ${Math.floor(
        stockpile?.resources.food ?? 0
      )}     GOLD  ${Math.floor(
        stockpile?.resources.gold ?? 0
      )}     POP  ${population?.used ?? 0}/${population?.cap ?? 0}${
        population?.queued ? ` (+${population.queued})` : ""
      }`
    );

    if (selectedBuilding) {
      const definition = BUILDING_DEFINITIONS.find(
        (entry) => entry.kind === selectedBuilding.kind
      );
      const work = describeBuildingWork(
        selectedBuilding,
        playerTechnologies
      );

      this.selectionTitleText.setText(
        definition?.displayName ?? selectedBuilding.kind
      );
      this.selectionDetailsText.setText([
        `HP ${Math.ceil(selectedBuilding.hitPoints)}/${
          definition?.maxHitPoints ?? selectedBuilding.hitPoints
        }`,
        ...work,
        selectedBuilding.rallyPoint
          ? `Rally · ${selectedBuilding.rallyPoint.x.toFixed(
              1
            )}, ${selectedBuilding.rallyPoint.y.toFixed(1)}`
          : "Rally · Right-click ground"
      ]);
    } else if (selectedUnits.length > 0) {
      const primary = selectedUnits[0];
      const sameKind = selectedUnits.every(
        (unit) => unit.kind === primary?.kind
      );
      const label = sameKind
        ? UNIT_DEFINITIONS.find((entry) => entry.kind === primary?.kind)
            ?.displayName ?? primary?.kind ?? "Units"
        : "Mixed units";
      const averageHp =
        selectedUnits.reduce((sum, unit) => sum + unit.hitPoints, 0) /
        selectedUnits.length;
      const carrying = selectedUnits.reduce(
        (sum, unit) => sum + (unit.cargo?.amount ?? 0),
        0
      );

      const work = describeUnitWork(selectedUnits);

      this.selectionTitleText.setText(
        selectedUnits.length === 1
          ? label
          : `${selectedUnits.length} × ${label}`
      );
      this.selectionDetailsText.setText([
        `Average HP · ${averageHp.toFixed(0)}`,
        ...work,
        carrying > 0
          ? `Carrying · ${carrying.toFixed(1)}`
          : "Cargo · Empty"
      ]);
    } else {
      this.selectionTitleText.setText("No selection");
      this.selectionDetailsText.setText([
        "Select villagers to gather or build.",
        "Select a production building to train units."
      ]);
    }

    const availability = getHudCommandAvailability({
      selectedUnitKinds: selectedUnits.map((unit) => unit.kind),
      selectedBuildingKind: selectedBuilding?.kind,
      selectedBuildingCompleted: selectedBuilding?.completed,
      selectedBuildingResearchBusy:
        (selectedBuilding?.researchQueue?.length ?? 0) > 0,
      researchedTechnologies: playerTechnologies,
      resources: {
        wood: stockpile?.resources.wood ?? 0,
        food: stockpile?.resources.food ?? 0,
        gold: stockpile?.resources.gold ?? 0
      },
      populationUsed: population?.used ?? 0,
      populationQueued: population?.queued ?? 0,
      populationCap: population?.cap ?? 0,
      matchEnded: snapshot.match.status === "ended"
    });

    const buttonLabels: Record<HudCommand, string> = {
      house: "HOUSE  [H]\n25W",
      barracks: "BARRACKS  [B]\n75W",
      "archery-range": "ARCHERY RANGE  [X]\n100W",
      villager: "VILLAGER  [V]\n50F",
      militia: "MILITIA  [M]\n60F · 20G",
      spearman: "SPEARMAN  [P]\n25W · 45F",
      archer: "ARCHER  [C]\n25W · 45G",
      "forged-weapons": "FORGED WEAPONS  [F]\n75F · 75G"
    };
    const hasVillager = selectedUnits.some(
      (unit) => unit.kind === "villager"
    );

    for (const button of this.buttons) {
      const relevant =
        !this.options.benchmarkMode &&
        isCommandRelevant(
          button.command,
          hasVillager,
          selectedBuilding?.kind
        );

      button.label.setText(buttonLabels[button.command]);
      button.background.setVisible(relevant);
      button.label.setVisible(relevant);
      this.setButtonEnabled(
        button,
        relevant && availability[button.command]
      );
    }

    this.objectiveText.setText(
      snapshot.match.status === "ended"
        ? "Match complete"
        : `Objective · Destroy the enemy Town Center · Seed ${this.options.skirmishSeed}`
    );
  }

  updateMatchOverlay(snapshot: SimulationSnapshot): void {
    if (snapshot.match.status !== "ended") {
      this.matchText.setVisible(false);
      return;
    }

    const victory = snapshot.match.winnerPlayerId === "player-1";

    this.matchText
      .setPosition(
        this.options.scene.scale.width / 2,
        this.options.scene.scale.height / 2
      )
      .setText([
        victory ? "VICTORY" : "DEFEAT",
        victory
          ? "Enemy Town Center destroyed"
          : "Your Town Center was destroyed",
        "",
        "Press R to restart"
      ])
      .setVisible(true);
  }

  destroy(): void {
    this.viewportContainer.destroy(true);
  }

  private syncViewport(): void {
    const scene = this.options.scene;
    const transform = fixedViewportTransform(
      scene.cameras.main.zoom,
      scene.scale.width,
      scene.scale.height,
      scene.cameras.main.originX,
      scene.cameras.main.originY
    );

    this.viewportContainer
      .setPosition(transform.x, transform.y)
      .setScale(transform.scale);
  }

  private createButtons(): void {
    const commands: HudCommand[] = [
      "house",
      "barracks",
      "archery-range",
      "villager",
      "militia",
      "spearman",
      "archer",
      "forged-weapons"
    ];

    for (const command of commands) {
      const background = this.options.scene.add
        .rectangle(0, 0, 128, 52, 0x18242c, 0.96)
        .setScrollFactor(1)
        .setDepth(4)
        .setStrokeStyle(1, 0x60717b, 0.8)
        .setInteractive({ useHandCursor: true });

      const label = this.options.scene.add
        .text(0, 0, "", {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "11px",
          align: "center",
          color: "#f4ead1"
        })
        .setOrigin(0.5)
        .setScrollFactor(1)
        .setDepth(5);

      background.on("pointerdown", () => {
        if (
          command === "house" ||
          command === "barracks" ||
          command === "archery-range"
        ) {
          this.options.setPlacementMode(command);
          return;
        }

        if (command === "forged-weapons") {
          this.options.issueResearch(command);
          return;
        }

        this.options.issueTrain(command);
      });

      background.setVisible(false);
      label.setVisible(false);
      this.buttons.push({ background, label, command });
    }
  }

  private setButtonEnabled(button: HudButton, enabled: boolean): void {
    button.background
      .setAlpha(enabled ? 1 : 0.35)
      .setFillStyle(enabled ? 0x18242c : 0x11181d, 0.96);

    button.label.setAlpha(enabled ? 1 : 0.45);

    if (enabled) {
      button.background.setInteractive({ useHandCursor: true });
    } else {
      button.background.disableInteractive();
    }
  }
}


function isCommandRelevant(
  command: HudCommand,
  hasVillager: boolean,
  selectedBuildingKind?: BuildingKind
): boolean {
  switch (command) {
    case "house":
    case "barracks":
    case "archery-range":
      return hasVillager;
    case "villager":
      return selectedBuildingKind === "town-center";
    case "militia":
    case "spearman":
    case "forged-weapons":
      return selectedBuildingKind === "barracks";
    case "archer":
      return selectedBuildingKind === "archery-range";
  }
}
