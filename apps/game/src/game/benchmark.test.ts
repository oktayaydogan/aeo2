import { describe, expect, it } from "vitest";
import { summarizeBenchmark } from "./benchmark";

describe("summarizeBenchmark", () => {
  it("passes when FPS and simulation p95 are inside budget", () => {
    const result = summarizeBenchmark(
      [60, 59, 61, 58],
      [1, 2, 2.5, 3, 4]
    );

    expect(result.passed).toBe(true);
    expect(result.averageFps).toBeCloseTo(59.5, 5);
    expect(result.p95SimulationMs).toBe(4);
  });

  it("fails when either FPS or simulation p95 misses budget", () => {
    expect(
      summarizeBenchmark([40, 42, 44], [1, 2, 3]).passed
    ).toBe(false);

    expect(
      summarizeBenchmark([60, 60, 60], [1, 2, 12]).passed
    ).toBe(false);
  });

  it("uses the 95th percentile rather than the maximum outlier when enough samples exist", () => {
    const samples = Array.from({ length: 100 }, (_, index) =>
      index === 99 ? 30 : 2
    );
    const result = summarizeBenchmark(
      Array.from({ length: 100 }, () => 60),
      samples
    );

    expect(result.p95SimulationMs).toBe(2);
    expect(result.passed).toBe(true);
  });
});
