# AEO2

A browser-first real-time strategy game inspired by the systemic depth and interaction model of classic RTS games.

> This project does not copy Age of Empires II assets, audio, trademarks, maps, or proprietary game data. The goal is an original RTS with a web-native engine and production architecture.

## Current milestone: Phase 2 — skirmish depth

Phase 2 expands the completed single-player vertical slice into a deeper skirmish: AI economy, more production choices, ranged combat, technologies, stronger map variety, and more durable replayability.

**Phase 1 status: COMPLETE**

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

### Phase 1 completion criteria

- [x] Original browser-first RTS presentation with no copied game assets
- [x] Isometric map, camera pan/zoom, selection, group movement, and pathfinding
- [x] Wood, food, and gold economy with villager gather/carry/drop-off loop
- [x] House and Barracks placement, construction, collision, and destruction
- [x] Population cap and production queues
- [x] Town Center Villager production and Barracks Militia production
- [x] Rally points
- [x] Unit and building combat with hit points, cooldowns, and destruction
- [x] Enemy base, deterministic attack AI, victory, defeat, and restart
- [x] Fog of war, exploration memory, and interactive minimap
- [x] Resource bar, selection panel, command buttons, production state, and hotkeys
- [x] Original procedural prototype sprites for units, resources, and buildings
- [x] Activity feedback for gather/build/attack states
- [x] Simulation unit/regression tests and a full Phase 1 vertical-slice integration test
- [x] Game-side fog/HUD tests
- [x] Vercel deployment gated by typecheck, simulation tests, game tests, and production build
- [x] Final deployment verification for the Phase 1 implementation

### Phase 2 completion criteria

- [x] Archery Range building definition and construction path
- [x] Archer ranged unit and production path
- [x] Technology/research queue infrastructure
- [x] Forged Weapons attack upgrade
- [x] AI state machine distinguishes economy, military buildup, attack, and idle
- [x] AI assigns idle villagers to resources
- [x] AI trains villagers toward an economy target
- [x] AI trains military toward an army target before attacking
- [x] AI constructs missing economy / production buildings
- [x] AI researches technologies when economically appropriate
- [x] Seeded procedural skirmish map generation
- [x] Multiple valid starting layouts with fair resource placement
- [x] At least one additional military counter relationship
- [ ] Phase 2 full skirmish integration test
- [ ] Representative-browser performance verification
- [ ] Final Phase 2 deployment verification

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

## v1.0 product direction — deep classic RTS mechanical parity

AEO2 now targets **mechanical depth as close as practical to a mature classic RTS such as Age of Empires II while keeping all expressive content original**. This includes four-age progression, broad tech trees, original factions, deep economy, advanced counters/projectiles/siege/support mechanics, walls/gates/garrison, alternate victory conditions, naval/hybrid maps, and 2v2/4v4 team play.

AEO2 must not copy protected third-party assets, audio, maps, UI art, text, faction/civilization identities, proprietary balance tables, names, or other copyrighted/trademarked expression. Runtime content and presentation remain original AEO2 work.

The authoritative scope amendment is in [`docs/ROADMAP.md`](docs/ROADMAP.md#36-v10-mechanical-parity-scope-amendment).

## Production roadmap

The detailed production roadmap, parallel-development model, milestone gates, acceptance criteria, multiplayer architecture, testing strategy, release requirements, and v1.0 launch checklist are maintained in [`docs/ROADMAP.md`](docs/ROADMAP.md).

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


## Playable match loop

Implemented:

- [x] Enemy Town Center and base structures
- [x] Unit attacks against buildings
- [x] Building hit points and destruction
- [x] Destroyed building footprints are released from pathfinding
- [x] Town Center destruction ends the match
- [x] Victory and defeat simulation state
- [x] Enemy AI can siege the player base
- [x] Victory / defeat overlay
- [x] Restart flow with `R`
- [x] Building combat and match-outcome regression tests
