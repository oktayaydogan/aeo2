import { describe, expect, it } from "vitest";
import { applyUnitClickSelection } from "./selectionState";

describe("selection state", () => {
  it("replaces selection for a normal click", () => {
    const selected = new Set(["a", "b"]);

    applyUnitClickSelection(selected, "c", false);

    expect([...selected]).toEqual(["c"]);
  });

  it("toggles membership for additive clicks", () => {
    const selected = new Set(["a"]);

    applyUnitClickSelection(selected, "b", true);
    expect([...selected].sort()).toEqual(["a", "b"]);

    applyUnitClickSelection(selected, "a", true);
    expect([...selected]).toEqual(["b"]);
  });
});
