# AEO2

A browser-first real-time strategy game inspired by the systemic depth and interaction model of classic RTS games.

> This project does not copy Age of Empires II assets, audio, trademarks, maps, or proprietary game data. The goal is an original RTS with a web-native engine and production architecture.

## Current milestone: Phase 0 — RTS engine prototype

The first milestone proves the core loop and technical architecture before content expansion or multiplayer.

### Phase 0 acceptance criteria

- [x] Browser-based desktop game shell
- [x] Isometric tile projection
- [x] Camera pan and zoom
- [x] Unit rendering
- [x] Single and box selection
- [x] Right-click move commands
- [x] Fixed-timestep simulation separated from rendering
- [x] Grid collision and A* pathfinding
- [x] 50 units can receive movement orders together
- [x] 100 units can exist on the map with spatial-hash local separation
- [ ] Verify performance budget in-browser on representative desktop hardware

## Architecture principles

1. **Simulation is independent from rendering.** Phaser renders state; it does not own gameplay rules.
2. **Commands mutate simulation state.** Input is translated into commands that the simulation validates and applies.
3. **Fixed timestep.** Gameplay does not depend on render FPS.
4. **Data-driven content.** Units, buildings, resources, and technologies are definitions rather than hard-coded branches.
5. **Multiplayer-compatible from day one.** Phase 0 is local, but the simulation must later run authoritatively on a server.
6. **Original assets and identity.** No copyrighted Age of Empires II game assets are part of the project.

## Planned workspace

```text
apps/
  game/          React + Phaser browser client
  server/        authoritative multiplayer server (later phase)
packages/
  simulation/    deterministic-ish fixed tick game simulation
  protocol/      commands and network contracts (later phase)
  content/       data-driven game definitions (later phase)
```

## Milestones

- **v0.1** RTS sandbox
- **v0.2** Economy
- **v0.3** Combat
- **v0.4** Playable single-player MVP
- **v0.5** Skirmish AI
- **v0.6** Fog / tech / ages
- **v0.7** Multiplayer prototype
- **v0.8** 1v1 multiplayer
- **v0.9** Accounts / rating / replay
- **v1.0** Production release

## Development rules

- TypeScript strict mode
- Small, reviewable commits
- Gameplay logic must not live in Phaser scene callbacks
- New mechanics require simulation-level tests
- Performance-sensitive systems get explicit budgets/benchmarks
- No authentication/database work until the core RTS loop is proven


## Phase 1 economy vertical slice

Implemented:

- [x] Wood, food, and gold resource node contracts
- [x] Villager gather command
- [x] Walk to resource
- [x] Gather with carry capacity
- [x] Return to Town Center
- [x] Deposit into player stockpile
- [x] Repeat until the resource is depleted
- [x] Manual move cancels active gather work
- [x] Ownership checks reject enemy commands
- [x] Simulation tests gate Vercel deployment
- [x] Economy HUD and resource amounts
- [x] House and Barracks construction
- [x] Population cap from completed buildings
- [x] Town Center villager production
- [x] Barracks militia production
- [x] Building footprints block pathfinding
- [x] Basic melee combat
- [x] Deterministic enemy attack AI
- [x] 100-entity benchmark preserved at `?benchmark=1`

Verification:

```bash
npm run typecheck --workspace=@aeo2/simulation
npm run test --workspace=@aeo2/simulation
npm run build --workspace=@aeo2/game
```

Vercel runs these checks before publishing the game.
