# ADR-001: Package dependency boundaries

- Status: Accepted
- Date: 2026-09-21
- Issue: #1 (ARCH-001)

## Context

AEO2 is moving from a browser-only single-player prototype toward deterministic replay and server-authoritative multiplayer. The current workspaces are `apps/game`, `packages/simulation`, and `packages/content`; `packages/protocol` and `apps/server` are planned. Without an explicit dependency direction, replay/server work could couple simulation to Phaser/React or create circular command/snapshot contracts.

## Decision

Dependency arrows below mean “may import from”:

```text
packages/content   -> (no AEO2 workspace)
packages/protocol  -> (no AEO2 workspace)
packages/simulation -> packages/protocol
apps/game          -> packages/content, packages/protocol, packages/simulation
apps/server        -> packages/content, packages/protocol, packages/simulation
```

`packages/content` and `packages/protocol` are leaf contract/data packages. `packages/simulation` remains browser/server neutral. Apps compose these packages but core packages never import app code.

### Ownership

| Concern | Owner | Notes |
| --- | --- | --- |
| Gameplay rules, validation, authoritative mutation, AI decisions, internal runtime state | `packages/simulation` | No Phaser, React, DOM, WebSocket transport, or server framework dependency. |
| Serialization-safe player/match/tick/sequence identifiers, shared `GameCommand` DTOs, command envelopes, protocol/replay/network message contracts | `packages/protocol` | Contracts only; no gameplay implementation. PROTO-001 performs the first migration. |
| Concrete original unit/building/technology/age/faction definitions and canonical content keys | `packages/content` | No dependency on simulation/protocol. Wire contracts transport content keys as serialization-safe values rather than importing concrete content. |
| Authoritative simulation state and canonical state derivation | `packages/simulation` | SIM-031 defines stable canonical serialization. |
| Snapshot/delta/state-hash transport envelopes | `packages/protocol` | Protocol wraps serialized authoritative state; it does not own gameplay state. |
| Browser input, React/Phaser rendering, UI/presentation state | `apps/game` | Input emits commands; it does not mutate gameplay authority directly. |
| WebSocket/session/seat authorization, authoritative room lifecycle, persistence integration | `apps/server` | Server invokes the same simulation command boundary used by local/replay/tests. |

The existing `GameCommand` type currently exported from `packages/simulation` is a transitional public contract. ARCH-001 does not duplicate or break it. PROTO-001 owns the deliberate migration to the serialization-safe shared command contract; simulation will then consume protocol command types rather than protocol importing simulation.

## Enforcement

`scripts/check-package-boundaries.mjs` validates:

1. workspace package manifests do not declare forbidden `@aeo2/*` dependencies;
2. source imports follow the dependency graph;
3. core packages do not take browser/server framework dependencies.

The root `typecheck` command runs this check before workspace TypeScript checks, so the existing Vercel gate also enforces it.

## Creating a future shared package

A new shared package is justified only when all are true:

1. at least two existing consumers need the same stable contract or implementation;
2. ownership cannot remain cleanly in an existing package;
3. the new package has a one-way dependency direction and does not create a cycle;
4. it is browser/server neutral unless its name and purpose are explicitly platform-specific;
5. the ADR is updated before consumers depend on it.

Do not create a shared package merely to avoid a local import or to host miscellaneous helpers.

## Consequences

- Replay/server code can share contracts without importing browser code.
- Simulation remains portable to local, test, replay, and authoritative server runtimes.
- Concrete content remains replaceable/data-driven rather than becoming a simulation dependency.
- A future dependency exception requires an explicit architecture decision instead of an ad-hoc import.
