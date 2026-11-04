import {
  geometryStudioScene,
  materialGalleryScene,
  scaleTestScene,
  Scene,
  type SceneDefinition,
} from "@lumenlab/engine";
import { SCENARIOS } from "../scenarios/definitions";
import type { BenchmarkScenario, ResolvedScene, SceneRef } from "./types";

export { SCENARIOS };

export function getScenario(id: string): BenchmarkScenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown benchmark scenario "${id}"`);
  return found;
}

export function buildSceneDefinition(ref: SceneRef): SceneDefinition {
  switch (ref.kind) {
    case "scale-test":
      return scaleTestScene(ref.count, ref.segments);
    case "geometry-studio":
      return geometryStudioScene();
    case "material-gallery":
      return materialGalleryScene();
  }
}

/**
 * Build the scene and compute its static workload (objects, triangles, draw calls) on the CPU. The
 * numbers are deterministic, so they double as a regression guard for the workload itself.
 */
export function resolveScene(ref: SceneRef): ResolvedScene {
  const definition = buildSceneDefinition(ref);
  const { objectCount, triangleCount } = Scene.fromDefinition(definition).stats();
  return { definition, objectCount, triangleCount, drawCalls: objectCount };
}
