import { describe, expect, it } from "vitest";
import { commandRejectionMessage } from "./commandRejectionFeedback";

describe("command rejection feedback", () => {
  it("turns common authoritative reasons into actionable player copy", () => {
    expect(commandRejectionMessage("insufficient-resources")).toBe(
      "Not enough resources"
    );
    expect(commandRejectionMessage("population-cap")).toBe(
      "Population cap reached"
    );
    expect(commandRejectionMessage("invalid-placement")).toBe(
      "Can't build there"
    );
    expect(commandRejectionMessage("unreachable")).toBe(
      "No reachable path"
    );
  });
});
