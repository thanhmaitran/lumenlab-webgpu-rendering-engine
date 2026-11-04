# 0002. npm-workspaces monorepo; engine independent of React

- Status: Accepted
- Date: 2026-10-31

## Context

Rendering code tends to leak into UI components (buffers created in `useEffect`, render loops in
hooks). That makes it untestable without a browser and fragile under React's lifecycle (Strict Mode
double-mount, unmount while a frame is in flight).

## Decision

One repository with three workspaces: `packages/engine` (no UI dependency), `packages/benchmark`
(depends on engine types) and `apps/workbench` (React). The UI talks to the engine only through
typed commands on `Engine`; a plain TypeScript `WorkbenchStore` bridges them via
`useSyncExternalStore`.

## Consequences

- Engine unit and integration tests run in Node with no DOM.
- The render loop and every GPU resource have one owner, so unmount/dispose is a single call.
- A little more plumbing than putting everything in components, paid once.

## Alternatives considered

- **Single package** — simpler, but nothing enforces the boundary.
- **Publishing the engine to npm** — out of scope; the packages are `private` and consumed in place.
