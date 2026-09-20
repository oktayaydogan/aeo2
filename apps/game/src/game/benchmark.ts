export interface BenchmarkBudget {
  minimumAverageFps: number;
  maximumP95SimulationMs: number;
}

export interface BenchmarkResult {
  averageFps: number;
  p95SimulationMs: number;
  sampleCount: number;
  passed: boolean;
}

export const DEFAULT_BENCHMARK_BUDGET: BenchmarkBudget = {
  minimumAverageFps: 45,
  maximumP95SimulationMs: 8
};

export function summarizeBenchmark(
  fpsSamples: readonly number[],
  simulationSamples: readonly number[],
  budget: BenchmarkBudget = DEFAULT_BENCHMARK_BUDGET
): BenchmarkResult {
  const averageFps =
    fpsSamples.length === 0
      ? 0
      : fpsSamples.reduce((sum, value) => sum + value, 0) /
        fpsSamples.length;

  const sortedSimulation = [...simulationSamples].sort(
    (a, b) => a - b
  );
  const percentileIndex =
    sortedSimulation.length === 0
      ? 0
      : Math.min(
          sortedSimulation.length - 1,
          Math.ceil(sortedSimulation.length * 0.95) - 1
        );
  const p95SimulationMs =
    sortedSimulation[percentileIndex] ?? Number.POSITIVE_INFINITY;

  return {
    averageFps,
    p95SimulationMs,
    sampleCount: simulationSamples.length,
    passed:
      fpsSamples.length > 0 &&
      simulationSamples.length > 0 &&
      averageFps >= budget.minimumAverageFps &&
      p95SimulationMs <= budget.maximumP95SimulationMs
  };
}
