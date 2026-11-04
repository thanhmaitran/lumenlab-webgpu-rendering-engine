# Benchmark scenarios

`definitions.ts` holds the scenario matrix. Rules for adding a scenario:

1. Change **one** factor relative to its siblings in the same `group` and record it in `variedFactor`.
2. Describe the scene with a `SceneRef` so the workload is deterministic (no random numbers, no
   wall-clock input).
3. Add the expected object / triangle counts to `tests/scenarios.test.ts` so a silent change of the
   workload fails the test suite.
