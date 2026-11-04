import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useStore, useWorkbench } from "../state/useWorkbench";
import { UnsupportedNotice } from "./UnsupportedNotice";

const MODE_LEGEND: Record<string, string | undefined> = {
  normals: "Normals · world-space normal remapped to RGB (n × 0.5 + 0.5)",
  depth: "Depth · white = near plane, black = far plane (linear view depth)",
  shadow: "Shadow · cream = lit, blue = in shadow (3×3 PCF)",
  wireframe: "Wireframe · triangle edges of the indexed meshes",
};

const MODE_LABEL: Record<string, string> = {
  lit: "LIT",
  wireframe: "WIREFRAME",
  normals: "NORMALS",
  depth: "DEPTH",
  shadow: "SHADOW",
};

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
  pan: boolean;
}

export function Viewport() {
  const store = useStore();
  const state = useWorkbench();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return store.mount(canvas);
  }, [store]);

  // Wheel must be a non-passive native listener to be able to prevent page scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      store.zoom(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [store]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      pan: e.button === 2 || e.shiftKey,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.pan) store.pan(dx, dy);
    else store.orbit(dx, dy);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved && e.button === 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      store.pick(e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  const ready = state.status.kind === "ready";
  const mode = state.settings.mode;

  return (
    <div className="viewport" data-testid="viewport">
      <canvas
        ref={canvasRef}
        className="viewport__canvas"
        data-testid="viewport-canvas"
        aria-label="3D viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onContextMenu={(e) => e.preventDefault()}
      />
      {ready && (
        <>
          <div className="viewport__tag mono">
            PERSPECTIVE · {MODE_LABEL[mode] ?? mode.toUpperCase()}
            {state.sceneName ? ` · ${state.sceneName.toUpperCase()}` : ""}
          </div>
          <div className="viewport__hint">
            Drag to orbit · Right-drag or Shift-drag to pan · Scroll to zoom · Click to select
          </div>
          {MODE_LEGEND[mode] && <div className="viewport__legend">{MODE_LEGEND[mode]}</div>}
          <button type="button" className="viewport__reset" onClick={() => store.resetCamera()}>
            Reset camera
          </button>
        </>
      )}
      {state.status.kind === "initializing" && (
        <div className="viewport__overlay">Initializing WebGPU…</div>
      )}
      {state.status.kind === "unsupported" && (
        <UnsupportedNotice code={state.status.code} reason={state.status.reason} />
      )}
      {state.status.kind === "lost" && (
        <div className="viewport__overlay viewport__overlay--error" role="alert">
          <h2>GPU device lost</h2>
          <p>{state.status.reason}</p>
          <p className="muted">
            Rendering stopped. LumenLab does not reuse resources of a lost device.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => store.recover()}>
            Recreate GPU device
          </button>
        </div>
      )}
    </div>
  );
}
