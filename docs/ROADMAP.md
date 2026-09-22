# AEO2 Production Roadmap

> Canonical execution plan for taking the current browser-first RTS from the completed Phase 1 / near-complete Phase 2 state to a production-ready v1.0.
>
> This document is intentionally implementation-oriented. It defines scope, dependencies, parallel work lanes, ownership boundaries, acceptance criteria, verification gates, release criteria, and production requirements so multiple developers can work at the same time without relying on tribal knowledge.

## 1. Product definition

AEO2 is an original browser-first real-time strategy game inspired by the systemic depth, readability, and interaction model of classic RTS games.

The product is **not** an Age of Empires II clone and must not copy Age of Empires II assets, audio, maps, proprietary data, trademarks, interface art, or other protected content. Game rules, content, presentation, naming, art, audio, and identity must remain original.

The core technical goal is a deterministic-enough, fixed-timestep simulation that can run locally for single-player and later authoritatively on a multiplayer server without rewriting gameplay rules.

## 2. v1.0 production scope

v1.0 is defined as a complete and stable browser RTS product, not as feature parity with a mature commercial RTS.

### Required for v1.0

- Desktop-browser RTS gameplay.
- Complete single-player skirmish loop.
- Economy, gathering, drop-off, construction, production, research, population, combat, victory, and defeat.
- Multiple military unit roles with explicit counter relationships.
- Multiple production buildings.
- Technology progression and age progression.
- Seeded procedural skirmish maps with valid and fair starting layouts.
- Fog of war and exploration memory.
- Competent AI with economy, production, defense, army composition, attack, and recovery behavior.
- Modern RTS command set and control groups.
- Replay-compatible command model.
- Authoritative online 1v1 multiplayer.
- Lobby / room creation and joining.
- Quick-match matchmaking.
- Disconnect detection and reconnect recovery.
- Account/profile layer.
- Persistent match history.
- Rating.
- Replay persistence and replay playback.
- Production CI/CD.
- Browser compatibility verification.
- Performance budgets.
- Security and abuse protections.
- Structured logs, metrics, alerts, and production diagnostics.
- Production deployment and rollback procedure.
- Original production-quality visual/audio identity.
- Required legal/privacy pages for public accounts and data storage.

### Explicitly not required for v1.0

The following are post-v1 work unless they become a launch-critical requirement later:

- 2v2 / 3v3 / 4v4.
- Campaign.
- Scenario editor.
- Steam/native desktop packaging.
- Mobile RTS control scheme.
- Spectator mode.
- Tournament system.
- Clans/guilds.
- Modding.
- Large faction/civilization roster.
- User-generated content.
- Seasonal battle-pass style systems.
- Monetization.

Keeping these out of the v1.0 critical path prevents production from being blocked by breadth before the core game is stable.

---

## 3. Current repository baseline

Repository structure today:

```text
apps/
  game/              React + Phaser browser client

packages/
  content/           data-driven game definitions
  simulation/        fixed-timestep gameplay simulation
```

Planned additions:

```text
apps/
  server/            authoritative multiplayer server

packages/
  protocol/          shared network / replay contracts
```

### Phase 1

**Status: complete and previously deployment-verified.**

Implemented:

- Browser game shell.
- Isometric projection.
- Camera pan and zoom.
- Unit rendering.
- Single and box selection.
- Right-click movement.
- Fixed timestep.
- Grid collision and A* pathfinding.
- Spatial-hash local separation.
- Wood / food / gold economy.
- Villager gather / carry / drop-off loop.
- House and Barracks construction.
- Population cap.
- Unit production queues.
- Town Center Villager production.
- Barracks Militia production.
- Rally points.
- Unit combat.
- Building combat and destruction.
- Enemy base.
- Deterministic attack AI.
- Victory / defeat.
- Restart.
- Fog of war.
- Exploration memory.
- Interactive minimap.
- HUD and hotkeys.
- Original procedural prototype sprites.
- Activity feedback.
- Simulation tests.
- Game-side tests.
- Vertical-slice integration test.
- Vercel test/build gate.

### Phase 2

The functionality is substantially implemented, but the milestone must not be called complete until the final verification gates are closed.

Implemented in the repository:

- Archery Range.
- Archer.
- Research queue infrastructure.
- Forged Weapons.
- Economy / military / attack / idle AI states.
- AI villager allocation.
- AI villager training.
- AI army target behavior.
- AI building construction.
- AI research.
- Seeded procedural skirmish maps.
- Fair starting-layout checks.
- Spearman counter unit.
- Data-driven counter bonuses.
- Phase 2 skirmish integration test.
- Browser benchmark harness.
- Benchmark result scoring.

Current benchmark budget:

```text
Average FPS >= 45
Simulation p95 <= 8 ms
```

Phase 2 remains open until:

- The complete test suite is re-run from the current main branch.
- The Phase 2 integration test is confirmed passing in CI-equivalent conditions.
- The browser benchmark is run on representative real hardware.
- Chrome is verified.
- Safari is verified.
- Firefox is verified.
- Production Vercel deployment is verified after the final Phase 2 commit set.
- README milestone status is reconciled with the verified state.

---

## 4. Engineering invariants

These are non-negotiable architectural rules. A feature that violates one of them is not complete even if it appears to work in the UI.

### 4.1 Simulation owns gameplay

Phaser renders and collects input. It must not own gameplay rules.

Gameplay rules belong in `packages/simulation`.

Examples that must remain simulation-owned:

- movement rules;
- resource accounting;
- training;
- research;
- damage;
- cooldowns;
- counter bonuses;
- building placement validity;
- victory/defeat;
- AI decisions;
- command authorization;
- population rules.

### 4.2 Commands are the mutation boundary

Player intent must be expressed as commands.

The long-term target is:

```text
input -> command -> validation -> simulation mutation -> snapshot -> rendering
```

The same command contracts must later be usable by:

- local single-player;
- AI;
- multiplayer server;
- replay playback;
- tests.

### 4.3 Fixed timestep

Gameplay must not depend on render FPS.

Rendering may interpolate presentation, but authoritative gameplay state must advance on simulation ticks.

### 4.4 Data-driven content

Units, buildings, technologies, ages, costs, train times, research times, stats, requirements, and counter bonuses should be defined as content data rather than scattered conditionals.

### 4.5 Determinism is a compatibility requirement

Perfect cross-engine floating-point determinism is not assumed, but the design must minimize nondeterministic gameplay behavior.

Randomness must use explicit seeds.

No gameplay decision may depend on:

- wall clock;
- render frame timing;
- unordered asynchronous completion;
- `Math.random()` without a simulation seed;
- browser-only state.

### 4.6 Original identity

No copied commercial RTS assets or proprietary game data.

---

## 5. Parallel development model

The repository must be organized around ownership lanes so multiple developers can work concurrently.

### 5.1 Recommended work lanes

| Lane | Primary ownership |
| --- | --- |
| Core Simulation | `packages/simulation` gameplay systems and state |
| Game Client | `apps/game` input, rendering, camera, HUD, UX |
| Content + AI | `packages/content`, content definitions, map generation, balance, AI strategy |
| Network | `packages/protocol`, `apps/server`, authoritative match runtime |
| Platform + QA | CI, E2E, performance, deployment, observability, load tests |

### 5.2 Team-size mapping

For three developers:

```text
Developer 1: Core Simulation + AI
Developer 2: Game Client + Content
Developer 3: Network + Platform/QA
```

For four developers:

```text
Developer 1: Core Simulation
Developer 2: Game Client
Developer 3: Content + AI
Developer 4: Network + Platform/QA
```

For five developers:

```text
Developer 1: Core Simulation
Developer 2: Game Client
Developer 3: Content + AI
Developer 4: Network
Developer 5: Platform + QA
```

### 5.3 Current conflict hotspots

The repository currently has two oversized hotspots:

- `packages/simulation/src/Simulation.ts` — approximately 2,500 lines.
- `apps/game/src/game/scenes/WorldScene.ts` — approximately 2,200 lines.

These files are the highest immediate merge-conflict risk.

The first production-readiness batch must reduce this risk before multiple feature streams aggressively modify them.

---

## 6. Git and review workflow

### 6.1 Branch model

Do not introduce a long-lived `develop` branch.

`main` must remain deployable.

Use short-lived branches:

```text
feat/sim-command-queue
feat/game-control-groups
feat/content-stable
feat/server-room-lifecycle
fix/pathfinding-stuck-unit
test/reconnect-recovery
chore/ci-browser-matrix
```

### 6.2 Direct-to-main policy

Once multiple developers are active, feature work should not be pushed directly to `main`.

Documentation-only emergency updates may be direct if necessary, but normal development should use pull requests.

### 6.3 Required PR characteristics

Every PR must:

- have one clear outcome;
- avoid unrelated refactors;
- remain reviewable;
- include tests for new gameplay behavior;
- document contract changes;
- identify migration/backward-compatibility impact where relevant;
- pass required checks;
- avoid leaving debug code or dead paths;
- update documentation when behavior or architecture changes.

### 6.4 Merge policy

Preferred default:

- squash merge;
- delete merged feature branch;
- keep commit/PR title descriptive;
- no merge while required checks fail;
- no merge with unresolved requested changes.

### 6.5 CODEOWNERS target

Once GitHub usernames are assigned to lanes, add a `.github/CODEOWNERS` file similar to:

```text
/packages/simulation/   @core-owner
/packages/content/      @content-owner
/packages/protocol/     @network-owner
/apps/game/             @game-owner
/apps/server/           @network-owner
/.github/               @platform-owner
/docs/                  @platform-owner
```

The purpose is not bureaucracy. It is to prevent accidental cross-domain contract changes without the relevant owner seeing them.

---

## 7. Feature implementation order

New gameplay mechanics should normally follow:

```text
contract
  -> simulation behavior
  -> simulation tests
  -> content definition
  -> client rendering/input/HUD
  -> AI support
  -> integration test
  -> manual browser verification
```

Example for a new Scout unit:

1. Define/extend unit contract.
2. Implement simulation behavior if any behavior is new.
3. Add simulation unit tests.
4. Add content definition.
5. Add renderer/texture.
6. Add training/HUD controls.
7. Teach AI production/composition rules.
8. Add vertical integration coverage.
9. Verify in-browser.

This order reduces cross-lane blocking and prevents UI code from inventing gameplay state.

---

# 8. Milestone map

| Milestone | Goal | Exit condition |
| --- | --- | --- |
| M0 | Phase 2 closure + parallelization foundation | Phase 2 verified; conflict hotspots reduced; protocol package started |
| v0.6 | Complete single-player skirmish | Full RTS command set, age/tech progression, improved roster, stronger AI |
| Replay Foundation | Deterministic command/replay substrate | Match can be reconstructed from seed + command stream |
| v0.7 | Multiplayer prototype | Two clients play one authoritative server match |
| Multiplayer Reliability | Survive real network failure modes | Reconnect, sequence handling, state verification, recovery |
| v0.8 | Productized 1v1 | Lobby, room flow, quick match, stable online match lifecycle |
| v0.9 | Persistent product layer | Accounts, persistence, rating, history, replay storage |
| Production Hardening | Operational quality | Security, performance, observability, art/audio, browser QA |
| v1.0 RC | Feature freeze / release candidate | All launch gates pass |
| v1.0 | Production | Release + rollback + post-release verification complete |

---

# 9. M0 — Phase 2 closure and parallelization foundation

**Priority: P0**

No large new gameplay feature should bypass this milestone.

## M0-01 — Split Simulation responsibilities

### Outcome

Reduce `Simulation.ts` as a merge-conflict hotspot while preserving behavior.

### Target structure

This is a target, not a requirement to perform a risky big-bang rewrite:

```text
packages/simulation/src/
  Simulation.ts

  systems/
    MovementSystem.ts
    EconomySystem.ts
    ConstructionSystem.ts
    ProductionSystem.ts
    CombatSystem.ts
    ResearchSystem.ts
    AiSystem.ts
    VictorySystem.ts

  commands/
    commandTypes.ts
    commandValidation.ts

  state/
    snapshot.ts
    playerState.ts
```

### Rules

- Refactor incrementally.
- Keep public behavior unchanged.
- Do not combine this with unrelated gameplay changes.
- Prefer extracting pure/helper behavior before redesigning state ownership.
- Preserve command ordering.
- Preserve tick behavior.
- Preserve seeded behavior.
- Preserve snapshot semantics unless explicitly versioned.

### Acceptance criteria

- Existing simulation typecheck passes.
- Existing simulation tests pass.
- Phase 1 integration passes.
- Phase 2 integration passes.
- No gameplay behavior is intentionally changed.
- Public exports remain compatible or the compatibility break is explicitly approved and migrated.
- Extracted systems have focused tests where practical.

## M0-02 — Split WorldScene responsibilities

### Outcome

Reduce `WorldScene.ts` as a conflict hotspot.

### Target structure

```text
apps/game/src/game/
  scenes/
    WorldScene.ts

  input/
    SelectionController.ts
    CommandController.ts
    CameraController.ts
    HotkeyController.ts

  rendering/
    UnitRenderer.ts
    BuildingRenderer.ts
    ResourceRenderer.ts
    FogRenderer.ts
    SelectionRenderer.ts

  ui/
    MinimapController.ts
    HudAdapter.ts
```

### Rules

- WorldScene remains orchestration/lifecycle code.
- Gameplay rules must not move into extracted client controllers.
- Rendering modules consume snapshots/presentation state.
- Input modules create commands; they do not directly mutate simulation internals.

### Acceptance criteria

- Current HUD tests pass.
- Current visibility tests pass.
- Current benchmark tests pass.
- Current skirmish map tests pass.
- Production build passes.
- Existing controls remain functionally equivalent.
- Manual camera, selection, movement, gather, build, train, attack, minimap, fog, and restart smoke tests pass.

## M0-03 — Close Phase 2 verification

### Required automated verification

```bash
npm run typecheck
npm run test
npm run build
```

Additionally confirm specifically:

```bash
npm run typecheck --workspace=@aeo2/simulation
npm run test --workspace=@aeo2/simulation
npm run test --workspace=@aeo2/game
npm run build --workspace=@aeo2/game
```

### Browser benchmark verification

Run the benchmark harness on representative desktop hardware.

Record:

- browser/version;
- OS/version;
- hardware;
- average FPS;
- p95 simulation ms;
- sample count;
- pass/fail.

Current minimum budget:

```text
Average FPS >= 45
Simulation p95 <= 8 ms
```

Do not silently lower the budget to make a build pass. Budget changes require a documented reason.

### Browser matrix

Required:

- current Chrome desktop;
- current Safari desktop;
- current Firefox desktop.

Smoke scenarios:

- initial load;
- camera move/zoom;
- selection;
- group move;
- economy;
- build placement;
- construction;
- training;
- research;
- melee combat;
- ranged combat;
- counter bonus;
- fog;
- minimap;
- victory/defeat;
- restart;
- benchmark route.

### Deployment closure

After checks pass:

1. deploy current `main`;
2. load production URL;
3. confirm assets;
4. confirm game starts;
5. run core smoke flow;
6. verify browser console has no new fatal errors;
7. verify benchmark route;
8. mark Phase 2 complete in README;
9. create/tag the milestone release as appropriate.

## M0-04 — Create shared protocol package

Create:

```text
packages/protocol/
```

Initial contracts:

```ts
GameCommand
CommandEnvelope
Tick
PlayerId
MatchId
ClientSequence
ServerSequence
GameSnapshot
SnapshotDelta
StateHash
ReplayHeader
ReplayCommand
```

At M0 there is no requirement to start networking.

The purpose is to establish a stable shared vocabulary for:

- replay;
- server;
- client;
- tests.

Acceptance:

- package builds/typechecks;
- simulation can consume command contracts without browser dependencies;
- protocol package does not depend on Phaser/React;
- serialization-safe types are used.

## M0-05 — Repository governance

Add or configure:

- protected `main`;
- required checks;
- PR review requirement appropriate to team size;
- stale branch deletion after merge;
- CODEOWNERS after usernames are known;
- issue labels;
- milestones.

Recommended labels:

```text
area:simulation
area:game
area:content
area:ai
area:network
area:platform
area:qa
area:docs

priority:p0
priority:p1
priority:p2
priority:p3

type:feature
type:bug
type:refactor
type:test
type:performance
type:security
type:tech-debt

status:blocked
status:needs-design
status:ready
```

---

# 10. v0.6 — Complete single-player skirmish

The purpose of v0.6 is to turn the vertical slice into a replayable, complete single-player RTS experience before multiplayer persistence complexity is added.

Work can proceed in parallel across simulation, game client, content, and AI.

## 10.1 RTS command model

Required commands:

- Move.
- Attack target.
- Attack building.
- Gather.
- Build.
- Train.
- Research.
- Set rally.
- Stop.
- Attack-move.
- Patrol.
- Hold position.
- Shift-queue command.
- Cancel queued production/research where supported.

### Command queue semantics

Define exact semantics before implementation:

- whether shift appends;
- whether non-shift replaces;
- how Stop clears queue;
- how target invalidation advances queue;
- what happens when a resource depletes;
- what happens when a building is destroyed;
- what happens when a unit cannot reach a target;
- whether patrol endpoints loop indefinitely;
- attack-move acquisition radius;
- hold-position chase radius.

### Acceptance

- Queue order is deterministic.
- Manual Stop works immediately on the next authoritative tick.
- Commands cannot be issued to enemy-owned units.
- Invalid targets are rejected or safely skipped.
- No command leaves a unit permanently stuck in an impossible state.

## 10.2 Control groups

Required:

- Ctrl+1..9 assigns group.
- 1..9 selects group.
- Optional additive group behavior if chosen.
- Double-tap group key centers camera.
- Destroyed units disappear from stored groups.
- Group state is presentation/client convenience and must not alter gameplay authority.

## 10.3 Selection improvements

Required:

- shift-add selection;
- shift-remove/toggle selection;
- double-click/select same visible type;
- click empty terrain clears selection unless modifier semantics say otherwise;
- consistent building/unit selection;
- clear selected-count presentation;
- no accidental command issuance while interacting with UI.

## 10.4 Movement, formations, and congestion

Current A* + local separation must evolve for larger armies.

Required capabilities:

- group destination allocation;
- basic formation/slot assignment;
- stuck detection;
- recovery/repath;
- local avoidance tuning;
- building choke-point behavior;
- destroyed-building path refresh;
- large-group order stability.

Investigate hierarchical pathfinding only when profiling shows it is necessary.

Do not introduce a complex navigation architecture without a measured bottleneck.

### Performance acceptance

At minimum:

- 100 active entities remain within current browser budget.
- Group commands do not create multi-second simulation spikes.
- No obvious O(N^2) broad-phase behavior is introduced in common combat/movement flows.
- New performance-sensitive code has a focused benchmark or regression test.

## 10.5 Content roster

The initial balanced roster should remain deliberately small.

Target v0.6 content:

### Units

- Villager.
- Militia.
- Spearman.
- Archer.
- Scout or equivalent mobile unit.

### Buildings

- Town Center.
- House.
- Barracks.
- Archery Range.
- Stable.
- Resource drop-off building/camp if required by the economy design.
- Defensive Tower.

### Resources

- Food.
- Wood.
- Gold.
- Stone.

Every new content entry must define:

- cost;
- train/build time;
- hit points;
- movement where applicable;
- attack;
- range;
- cooldown;
- population effect;
- prerequisites;
- age requirement;
- production building;
- counter tags/bonuses where applicable.

## 10.6 Age progression

Target a three-stage progression for v1 rather than immediately cloning a four-age commercial RTS structure.

Example:

```text
Age I
  -> Age II
  -> Age III
```

Create a data-driven `AgeDefinition`.

Content should be able to specify:

```ts
requiredAge
requiredTechnologies
requiredBuildings
```

Age-up must:

- cost resources;
- take time;
- be queued/researched in an explicit building;
- be cancel-safe if cancellation is supported;
- unlock content only after completion;
- expose progress in HUD;
- be understood by AI;
- serialize/replay correctly.

## 10.7 Technology system expansion

Build on the existing research infrastructure.

Support:

- attack upgrades;
- armor/defense upgrades if armor is introduced;
- economy gathering upgrades;
- movement upgrades where justified;
- population/economic upgrades;
- age prerequisites;
- mutually exclusive tech only if a real design need appears.

Rules:

- a technology cannot be researched twice;
- cost is deducted exactly once;
- duplicate command retries do not duplicate research;
- destruction of a researching building has defined semantics;
- prerequisites are validated by simulation;
- client only displays what simulation allows.

## 10.8 Combat model

Before adding many units, stabilize the combat vocabulary:

- base damage;
- optional armor;
- attack range;
- attack cooldown;
- projectile/ranged presentation;
- target acquisition;
- chase behavior;
- counter bonuses/tags;
- death/destruction;
- overkill behavior;
- building damage;
- friendly-fire policy;
- target invalidation.

Counter relationships must remain data-driven.

## 10.9 AI expansion

Current AI states are a strong starting point but are not enough for production skirmish.

Target strategic states:

```text
opening
economy
expansion
defense
military-buildup
raid
attack
retreat
rebuild
idle/fallback
```

AI responsibilities:

- worker allocation;
- resource-priority switching;
- villager production;
- population-cap planning;
- building construction;
- prerequisite planning;
- military production;
- composition selection;
- counter selection based on observed enemy;
- research timing;
- age timing;
- defense response;
- damaged economy recovery;
- army rally;
- attack timing;
- retreat threshold;
- rebuilding destroyed production;
- avoiding impossible command loops.

Difficulty levels:

- Easy.
- Normal.
- Hard.

Prefer decision/timing differences over raw resource cheats.

If resource bonuses are ever introduced for difficulty, they must be explicit and documented.

## 10.10 Skirmish setup

Add a setup flow with:

- map seed;
- map size;
- AI difficulty;
- starting resources;
- starting age if supported;
- game speed if supported.

Map generation must reject invalid seeds/layouts or regenerate deterministically according to defined rules.

Fairness checks should cover:

- base separation;
- resource accessibility;
- path connectivity;
- no resource/building overlap;
- sufficient starting resources;
- no blocked spawn.

## 10.11 v0.6 completion test

A full single-player acceptance test must cover:

1. start seeded match;
2. gather resources;
3. expand population;
4. construct production buildings;
5. age up;
6. research technology;
7. produce mixed army;
8. counter an enemy composition;
9. defend an attack;
10. counterattack;
11. destroy enemy Town Center;
12. receive victory state;
13. restart;
14. verify deterministic outcome for controlled seed/command inputs where applicable.

---

# 11. Replay foundation

Replay architecture must be built before productized multiplayer because it provides a common basis for debugging, state validation, match history, and future spectator functionality.

## 11.1 Replay model

Replay must be representable primarily as:

```text
ReplayHeader
  replayVersion
  protocolVersion
  simulationVersion/contentVersion
  mapSeed
  mapSettings
  player metadata
  match settings

CommandStream[]
  tick
  playerId
  clientSequence
  command payload
```

Do not store a full rendered frame stream.

## 11.2 State hashing

Generate a canonical gameplay state hash at deterministic intervals, for example every 100 ticks.

The hash should use simulation-relevant state only.

Do not hash:

- renderer objects;
- DOM/UI state;
- transient audio state;
- wall-clock timestamps.

Use hashes to detect:

- replay divergence;
- client/server desync diagnostics;
- regression differences.

## 11.3 Replay versioning

Never assume old replay payloads remain readable forever without a version.

Replay header must include enough version metadata to:

- reject unsupported old versions clearly;
- optionally migrate compatible versions;
- distinguish content changes from protocol changes.

## 11.4 Replay acceptance

Given the same:

- simulation version;
- content version;
- seed;
- settings;
- command stream;

playback should reach the same authoritative gameplay state hashes at defined checkpoints.

---

# 12. v0.7 — Authoritative multiplayer prototype

Only start product-layer accounts/database work after the multiplayer core proves that the simulation can run authoritatively.

## 12.1 Server package/app

Create:

```text
apps/server/
```

Recommended runtime:

- Node.js;
- TypeScript;
- WebSocket transport;
- Colyseus is acceptable if it reduces room/session boilerplate without forcing gameplay rules into framework objects.

The simulation remains framework-independent.

## 12.2 Authority model

```text
Browser
  -> command
Authoritative match server
  -> validate
Simulation
  -> authoritative state
Server
  -> snapshot/delta/events
Browser
  -> render
```

Client must never be authoritative for:

- resources;
- position;
- HP;
- damage;
- training completion;
- research completion;
- building completion;
- victory;
- rating/result.

## 12.3 Command envelope

Target fields:

```ts
{
  matchId,
  playerId,
  clientSequence,
  intendedTick,
  command
}
```

Server must derive authenticated player identity from the session/connection rather than trusting a free-form client `playerId`.

## 12.4 Server command processing

For every command:

1. identify connection/session;
2. map connection to match/player;
3. validate envelope;
4. validate sequence;
5. validate command shape;
6. validate command authorization;
7. validate gameplay preconditions;
8. enqueue at authoritative tick;
9. execute in simulation;
10. publish authoritative result/state.

## 12.5 Prototype exit criteria

Two browsers must be able to:

- join the same match;
- receive the same map seed/settings;
- issue commands;
- see authoritative movement/economy/combat;
- complete a match;
- receive the same winner/result;
- leave cleanly.

The prototype does not need matchmaking/accounts yet.

---

# 13. Multiplayer reliability milestone

This milestone exists separately because a multiplayer demo is not production multiplayer.

## 13.1 Sequence handling

Implement:

- monotonically increasing client sequence;
- duplicate detection;
- stale sequence rejection;
- bounded out-of-order policy;
- explicit error/ack behavior.

## 13.2 Connection lifecycle

States should include:

```text
connecting
connected
reconnecting
disconnected
failed
```

Define:

- heartbeat interval;
- disconnect timeout;
- reconnect grace period;
- abandoned-match behavior.

## 13.3 Reconnect

Reconnect flow:

1. client loses socket;
2. match continues according to policy;
3. client reconnects using secure reconnect/session identity;
4. server validates that the player owns the seat;
5. server sends current authoritative snapshot and required sequence/tick metadata;
6. client replaces local predicted/presentation state as required;
7. play resumes.

Reconnect credentials must not be guessable reusable room codes.

## 13.4 Snapshot recovery

The client must be able to recover from divergence without refreshing the entire site.

Server can send a full authoritative snapshot when:

- reconnecting;
- state hash mismatch is detected;
- client falls too far behind;
- protocol recovery requires it.

## 13.5 Network fault acceptance

Test with simulated:

- 50 ms latency;
- 150 ms latency;
- 300 ms latency;
- packet delay/jitter;
- short disconnect;
- reconnect;
- duplicate command submission;
- stale command;
- malformed command.

Required outcome:

- server remains authoritative;
- no double resource deduction;
- no duplicate unit production;
- no duplicate research;
- no duplicate match completion;
- player can reconnect within the defined grace period;
- irrecoverable errors fail visibly rather than silently corrupting state.

---

# 14. v0.8 — Productized 1v1 multiplayer

## 14.1 Match lifecycle

Canonical lifecycle:

```text
created
  -> waiting
  -> ready
  -> loading
  -> starting
  -> running
  -> finished
  -> archived
```

Alternative terminal states:

```text
cancelled
abandoned
failed
```

Transitions must be explicit and validated.

## 14.2 Lobby

First lobby UX:

- create game;
- generate join code/invite;
- join game;
- show both players;
- configure allowed match settings;
- ready/unready;
- host start when rules permit;
- loading state;
- match;
- result;
- rematch;
- leave.

Do not allow the lobby client to decide authoritative winner/result.

## 14.3 Quick Match

After private lobbies are stable:

- enter queue;
- match compatible players;
- allocate match room;
- transition both players;
- cancel queue;
- timeout/failure recovery.

## 14.4 Server security

At minimum:

- authenticated session/seat ownership;
- max message size;
- schema validation;
- command whitelist;
- commands-per-second limit;
- connection limit;
- heartbeat;
- stale room cleanup;
- reconnect abuse protection;
- malicious payload rejection;
- no arbitrary code/data deserialization.

## 14.5 Load testing

Measure with increasing concurrent rooms:

```text
1
5
10
25
50
```

Continue higher only if architecture/cost requires it.

Capture:

- active rooms;
- active players;
- tick duration p50/p95/p99;
- CPU;
- memory;
- memory per room;
- outbound bandwidth/player;
- command rate;
- event-loop lag;
- disconnects;
- server errors.

Capacity must be defined from measurement, not guesswork.

---

# 15. v0.9 — Accounts and persistence

The persistent product layer starts after core RTS + online match authority are proven.

## 15.1 Storage architecture

Recommended:

```text
PostgreSQL
  durable relational product data

Redis
  ephemeral matchmaking/presence/reconnect coordination where needed

Object storage
  replay files
  optional diagnostic artifacts
```

Do not put authoritative in-progress simulation state in PostgreSQL on every tick.

## 15.2 Initial relational model

### users

Suggested fields:

- id;
- created_at;
- updated_at;
- account status;
- identity-provider linkage or credential linkage depending on chosen auth.

### profiles

- user_id;
- display_name;
- optional avatar reference;
- locale/preferences where needed.

### matches

- id;
- status;
- mode;
- map seed;
- map settings;
- protocol version;
- simulation/content version;
- started_at;
- ended_at;
- winner reference/result;
- replay object key;
- created_at.

### match_players

- match_id;
- user_id;
- slot;
- side/team;
- result;
- pre-match rating;
- post-match rating;
- disconnect/abandon flags if used.

### ratings

- user_id;
- queue/mode;
- rating;
- games;
- wins;
- losses;
- updated_at.

### rating_history

- match_id;
- user_id;
- old_rating;
- new_rating;
- delta;
- algorithm/version;
- created_at.

## 15.3 Match completion idempotency

Match result persistence is high risk.

Requirements:

- one logical match completes once;
- server retry cannot apply rating twice;
- duplicate completion event cannot insert duplicate rating history;
- transaction boundaries protect result + rating update consistency;
- unique constraints enforce expected invariants;
- failures are retryable without corruption.

## 15.4 Authentication and authorization

Requirements:

- secure session lifecycle;
- expired/revoked session handling;
- user can act only as self;
- user can access only allowed private match/replay data;
- server-to-server match result write path is not client-forgeable;
- sensitive operations are audited where appropriate.

---

# 16. Rating and matchmaking

Do not overdesign the first rating system.

## 16.1 Initial rating scope

For 1v1:

- rating;
- games played;
- wins;
- losses;
- placement/unrated state if desired;
- rating history.

Rating algorithm must be versioned so changes can be audited later.

## 16.2 Matchmaking inputs

Initial matcher can use:

- rating range;
- time in queue;
- range expansion over time;
- region/latency if infrastructure supports meaningful region choice.

Do not claim precise fairness from rating before enough population/data exists.

## 16.3 Matchmaking failure handling

Cover:

- player cancels while match is being assigned;
- second player disconnects;
- room allocation fails;
- server allocation times out;
- duplicate queue request;
- user opens multiple tabs;
- stale queue entry.

---

# 17. Match history and replay product UI

## 17.1 Match history

Profile/history should expose:

- opponent;
- map;
- date;
- duration;
- result;
- rating change;
- replay availability.

## 17.2 Replay playback

Minimum controls:

- play;
- pause;
- 1x;
- 2x;
- 4x;
- restart.

Useful later:

- timeline seek;
- player perspective;
- fog perspective;
- statistics.

Efficient seeking can be added using periodic replay checkpoints/snapshots after the basic deterministic replay works.

---

# 18. Production presentation and UX

Prototype sprites are acceptable during core development but are not sufficient for production identity.

## 18.1 Art pass

Required original assets:

- terrain;
- resources;
- buildings;
- units;
- projectiles;
- construction stages;
- destruction states;
- selection indicators;
- health bars;
- command icons;
- technology icons;
- cursor states;
- minimap representation;
- menus;
- loading screen;
- match result presentation.

## 18.2 Audio pass

Required original or properly licensed audio:

- unit acknowledgement;
- gather/build/combat feedback;
- attacks/projectiles;
- building destruction;
- UI clicks;
- warnings/notifications;
- victory/defeat;
- music.

Every third-party asset must have recorded license/provenance.

## 18.3 RTS UX polish

Required:

- control groups;
- shift selection;
- double-click same-type selection;
- idle villager shortcut;
- select/cycle production buildings;
- camera centering;
- optional edge scrolling;
- attack cursor;
- build placement valid/invalid feedback;
- insufficient-resource feedback;
- queue indicators;
- production progress;
- research progress;
- health/damage feedback;
- clear command/state feedback;
- network/reconnect indicator in multiplayer.

## 18.4 Settings

Minimum production settings:

- master audio;
- music;
- SFX;
- camera speed;
- zoom speed;
- edge scroll enable/disable if implemented;
- hotkey display/remapping scope as chosen;
- graphics/performance preset if meaningful;
- FPS limit if supported.

Persist client settings locally.

---

# 19. Testing strategy

Testing must be layered. A large E2E suite does not replace simulation tests.

## 19.1 Simulation unit tests

Use for:

- resource math;
- command validation;
- training;
- population;
- research;
- damage;
- counters;
- prerequisites;
- age rules;
- AI state transitions;
- victory rules;
- sequence/idempotency helpers where shared.

## 19.2 Simulation integration tests

Use for complete vertical flows:

- economy;
- build/train;
- tech;
- combat;
- full skirmish;
- replay reproduction;
- authoritative match flow.

## 19.3 Game-client tests

Use for pure client helpers:

- HUD derivation;
- visibility/fog calculations;
- minimap transforms;
- benchmark scoring;
- input translation where it can be isolated.

## 19.4 Browser E2E

Before v1.0, add critical-path browser automation for:

- load game;
- start skirmish;
- select/move;
- economy command;
- build;
- train;
- research;
- combat;
- match completion;
- lobby join;
- multiplayer start;
- reconnect;
- result screen.

Do not attempt to encode every gameplay scenario in browser E2E.

## 19.5 Server/API/network tests

Required:

- connection authentication;
- room ownership;
- command validation;
- malformed messages;
- sequence handling;
- duplicate commands;
- reconnect;
- full snapshot recovery;
- match completion;
- duplicate result retry;
- persistence failure/retry.

## 19.6 Regression policy

Every production bug that can be reproduced deterministically should gain a regression test at the lowest appropriate layer before or with the fix.

---

# 20. Performance budgets

Budgets must be measured and documented.

## 20.1 Client current baseline

Current benchmark:

```text
100 entities
Average FPS >= 45
Simulation p95 <= 8 ms
```

This remains the baseline until intentionally revised.

## 20.2 Future client metrics

Track:

- FPS average;
- frame p95/p99 where available;
- simulation tick p50/p95/p99;
- entity count;
- pathfinding duration;
- visible sprite count;
- draw/render cost where practical;
- memory trend during long matches.

## 20.3 Performance regression rule

A feature that materially degrades benchmark performance cannot be merged with “optimize later” as the only plan if the degradation crosses the active production budget.

## 20.4 Server metrics

Track:

- match tick p50/p95/p99;
- event-loop lag;
- CPU/room;
- memory/room;
- inbound command rate;
- outbound bandwidth;
- active rooms;
- reconnect frequency;
- snapshot-recovery frequency.

---

# 21. CI/CD target

Current Vercel build gate already runs simulation typecheck/tests, game tests, and game build.

Before v1.0, root-level CI should make the whole workspace mandatory.

Target:

```bash
npm run typecheck
npm run test
npm run build
```

As packages are added, these commands must cover them.

Required future CI jobs:

- workspace typecheck;
- simulation unit/integration;
- game tests;
- protocol tests;
- server tests;
- replay tests;
- production build;
- browser critical-path E2E;
- selected performance regression tests;
- dependency/security audit appropriate to release policy.

No production deploy after a failing required gate.

---

# 22. Environments and deployment

Define at least:

- local;
- preview/PR;
- production.

A dedicated staging environment can be introduced once multiplayer/persistence makes preview deployments insufficient.

## 22.1 Client deploy

Production deployment must verify:

- build success;
- correct asset paths;
- no missing chunks;
- no fatal console error on load;
- correct server endpoint configuration;
- security headers;
- production source-map policy.

## 22.2 Server deploy

Required before launch:

- health endpoint;
- readiness behavior;
- graceful shutdown;
- room drain/shutdown policy;
- secret management;
- TLS termination;
- WebSocket proxy/load-balancer compatibility;
- resource limits;
- autoscaling policy if used;
- region strategy;
- deployment rollback.

## 22.3 Database migrations

Production migration rules:

- migrations are versioned;
- migration is reviewed;
- destructive migration requires explicit rollout plan;
- backwards compatibility is preferred during rolling deploys;
- backups exist before risky migration;
- rollback or forward-fix path is documented.

---

# 23. Rollback

A release is not production-ready without rollback.

## 23.1 Client rollback

Must be able to redeploy the last known-good version quickly.

## 23.2 Server rollback

Consider protocol compatibility.

Do not deploy a server/client protocol break that makes immediate rollback impossible unless an explicit migration window exists.

## 23.3 Database rollback

Schema rollback may be unsafe.

Prefer expand/migrate/contract patterns:

1. add compatible schema;
2. deploy code supporting old+new;
3. migrate data;
4. switch reads/writes;
5. remove old schema only after verification.

---

# 24. Observability

## 24.1 Structured server logs

Logs should include relevant structured context:

- timestamp;
- severity;
- service/version;
- matchId;
- roomId;
- user/player id when appropriate;
- tick;
- event;
- error type;
- correlation/request id where relevant.

Never log secrets/auth tokens.

## 24.2 Metrics

Minimum:

- connected players;
- active matches;
- match starts;
- match finishes;
- match failures;
- average match duration;
- server tick p95/p99;
- disconnects;
- reconnect attempts;
- reconnect successes;
- desync/state-hash mismatches;
- snapshot recoveries;
- matchmaking queue size;
- matchmaking wait time;
- server errors;
- persistence errors.

## 24.3 Client error reporting

Capture production-fatal categories:

- uncaught client errors;
- render/WebGL failures where detectable;
- network connection failure;
- reconnect failure;
- protocol incompatibility;
- replay load failure.

Include release version.

## 24.4 Alerts

Launch alerts should focus on actionable failures:

- server error rate;
- unavailable rooms;
- abnormal tick latency;
- database failures;
- matchmaking failures;
- reconnect failure spike.

Avoid alerting on every individual client disconnect.

---

# 25. Security and abuse controls

## 25.1 Client

- no secrets in browser bundle;
- CSP/security headers;
- dependency review;
- output encoding where HTML is rendered;
- avoid unsafe dynamic script injection.

## 25.2 Server

- authenticate connection/session;
- authorize match seat;
- schema-validate every message;
- enforce message size limit;
- enforce rate limit;
- validate command against simulation ownership/rules;
- reject unknown command types;
- never trust client HP/resources/position/result;
- secure reconnect token/session;
- expire stale sessions;
- protect administrative endpoints if any.

## 25.3 Persistence

- parameterized database access;
- least-privilege database credentials;
- encrypted transport;
- backup access restrictions;
- replay/object-storage authorization;
- account deletion path;
- retention policy.

---

# 26. Data safety and recovery

Before public launch:

- automated database backups;
- documented retention;
- restore procedure;
- actual restore test;
- object storage durability/retention decision;
- match-result idempotency;
- replay persistence failure handling;
- recovery behavior after partial service outage.

A backup that has never been restored is not considered verified.

---

# 27. Legal and policy readiness

Before public account launch, review and publish as applicable:

- Terms of Service;
- Privacy Policy;
- KVKK/GDPR handling relevant to served users;
- account deletion;
- data export where legally/product appropriate;
- cookie/analytics disclosure if analytics require it;
- retention policy;
- asset licensing records;
- audio licensing records.

Maintain the original-content rule throughout production art/audio.

---

# 28. Release-candidate phase

Create an RC only after feature freeze.

Example:

```text
release/v1.0.0-rc.1
```

During RC, only allow:

- P0 bugs;
- P1 launch blockers;
- security fixes;
- critical performance fixes;
- critical UX/accessibility fixes;
- release/ops fixes.

No discretionary feature expansion.

## RC verification matrix

| Area | Required |
| --- | --- |
| Root typecheck | PASS |
| Root tests | PASS |
| Production build | PASS |
| Chrome desktop | PASS |
| Safari desktop | PASS |
| Firefox desktop | PASS |
| Single-player full match | PASS |
| Hard AI full match | PASS |
| Age/tech progression | PASS |
| Replay reproduction | PASS |
| Private 1v1 lobby | PASS |
| Quick Match | PASS |
| Reconnect | PASS |
| Authoritative result | PASS |
| Match persistence | PASS |
| Rating idempotency | PASS |
| Match history | PASS |
| Replay storage/playback | PASS |
| Browser performance budget | PASS |
| Server load target | PASS |
| Security checks | PASS |
| Backup restore | PASS |
| Production deploy | PASS |
| Rollback rehearsal | PASS |
| Monitoring/alerts | PASS |

---

# 29. Definition of Done

A task is not Done merely because code exists.

## 29.1 Gameplay feature DoD

- behavior implemented in correct layer;
- validation implemented;
- ownership/authorization rules implemented;
- deterministic behavior considered;
- simulation tests added;
- integration test added when cross-system;
- client feedback implemented;
- AI compatibility considered;
- replay/network serialization considered;
- performance impact checked;
- documentation updated;
- all required checks pass.

## 29.2 Server feature DoD

- happy path;
- malformed input;
- authorization;
- duplicate/retry behavior;
- timeout/failure behavior;
- logs;
- metrics where needed;
- tests;
- deployment config;
- rollback compatibility.

## 29.3 Production-ready DoD

The product is production-ready only when:

- critical user journeys work;
- multiplayer authority is enforced;
- reconnect works;
- state/result persistence is idempotent;
- tests/build pass;
- browser matrix passes;
- performance budgets pass;
- security controls are in place;
- backups and restore are verified;
- observability exists;
- deploy and rollback are proven;
- policies/licenses are ready;
- no known launch blocker is hidden behind an assumption.

---

# 30. Issue sizing and dependency rules

Issues should usually represent approximately one coherent reviewable outcome.

Avoid issues such as:

```text
Build multiplayer
Finish AI
Make game production-ready
Refactor simulation
```

Prefer:

```text
Extract combat tick from Simulation without changing behavior
Add Stop command semantics and regression tests
Add client sequence validation to authoritative room
Persist match result idempotently
Recover player state after reconnect snapshot
```

Every issue should contain:

- outcome;
- scope;
- non-goals;
- dependencies;
- implementation notes where needed;
- acceptance criteria;
- verification commands/manual flow;
- affected packages.

Use explicit dependency wording:

```text
Blocked by: NET-003
Blocks: NET-008, REPLAY-004
Can run in parallel with: GAME-021
```

---

# 31. Immediate executable batch

This is the first parallel batch from the current repository state.

## SIM-001 — Extract simulation systems

**Lane:** Core Simulation  
**Priority:** P0  
**Dependencies:** none

Goal:

Reduce `Simulation.ts` conflict surface without behavior change.

Initial extraction order should favor low-risk boundaries:

1. command validation/helpers;
2. research;
3. production;
4. victory/outcome;
5. economy;
6. construction;
7. combat;
8. movement;
9. AI.

Do not force every system into a new object/class if simple pure functions are clearer.

Acceptance:

- all existing tests pass;
- Phase 1 integration passes;
- Phase 2 integration passes;
- no intended gameplay delta.

## GAME-001 — Extract WorldScene controllers/renderers

**Lane:** Game Client  
**Priority:** P0  
**Dependencies:** none

Goal:

Move input/rendering responsibilities into isolated modules.

Acceptance:

- behavior parity;
- game tests pass;
- build passes;
- manual smoke flow passes.

## QA-001 — Phase 2 final verification

**Lane:** Platform + QA  
**Priority:** P0  
**Dependencies:** may begin immediately; final pass after SIM-001/GAME-001 merge if those land first

Tasks:

- full root checks;
- browser benchmark;
- Chrome/Safari/Firefox smoke;
- Vercel production verification;
- record benchmark evidence;
- reconcile README.

## NET-001 — Protocol foundation

**Lane:** Network  
**Priority:** P0  
**Dependencies:** command/snapshot contracts from current simulation

Create `packages/protocol` with initial command/replay/network contracts.

Do not build server transport in this issue.

## GAMEPLAY-001 — Define extended command semantics

**Lane:** Core Simulation + Game Client review  
**Priority:** P1  
**Dependencies:** can design in parallel; implementation should avoid conflict with SIM-001

Specify:

- Stop;
- attack-move;
- patrol;
- hold;
- shift queue;
- target invalidation;
- queue cancellation.

Deliverable is executable contracts/tests, not only prose.

## PROJECT-001 — Multi-developer repository rules

**Lane:** Platform  
**Priority:** P0  
**Dependencies:** team GitHub usernames for final CODEOWNERS mapping

Configure:

- branch protection;
- required checks;
- PR policy;
- labels;
- milestones;
- CODEOWNERS when owners are known.

---

## 31.1 Current execution focus — visible-first client pass (2026-09-22)

The current implementation is mechanically ahead of its player-facing presentation. Until the local skirmish reads and feels like a coherent RTS to a first-time player, execution order should favor changes that are immediately visible or tactile in the live browser build.

This is an **execution-order override**, not a redefinition of launch severity. A hidden P0 simulation/platform item may still jump ahead when it directly blocks one of these flows or protects correctness/security.

Current order:

1. **GAME-012** — finish visible command cursors/order confirmation/rejection feedback.
2. **GAME-011** — selection ergonomics; implementation is merged, retain manual browser verification as the remaining gate.
3. **GAME-010** — control groups 1–9 and camera centering.
4. **GAME-013** — readable unit/production/research queue and progress presentation.
5. **GAME-030** — deterministic skirmish setup screen so the product has a real pre-match flow instead of dropping directly into a prototype match.
6. **ART-001**, then **ART-002/ART-003/ART-004** — establish original production art direction and replace prototype terrain/resources/units/buildings/interaction visuals in dependency order.
7. **GAME-061** and adjacent presentation polish — loading/startup/failure states once the primary skirmish loop is visually coherent.

During this pass:

- prefer a player-visible slice over an unrelated hidden refactor when both are unblocked;
- do not weaken deterministic simulation, authoritative command validation, replay/network compatibility, security or test gates to accelerate presentation;
- keep production art original to AEO2 and preserve asset provenance;
- continue to distinguish **implemented** from **browser-verified**;
- supporting simulation work remains eligible when it directly unlocks visible behavior such as queues, formations, placement validity or progress feedback.

---

# 32. Parallel batch after M0

Once M0 conflict reduction is merged, start these concurrently.

### Core Simulation

- SIM-010 command queue.
- SIM-011 Stop.
- SIM-012 attack-move.
- SIM-013 patrol/hold.
- SIM-014 formation slots.
- SIM-015 stuck recovery.

### Game Client

- GAME-010 control groups.
- GAME-011 shift selection.
- GAME-012 same-type double click.
- GAME-013 command cursor/feedback.
- GAME-014 queue/research progress UI.
- GAME-015 settings shell.

### Content + AI

- CONTENT-010 Scout.
- CONTENT-011 Stable.
- CONTENT-012 Stone.
- CONTENT-013 Tower.
- CONTENT-014 Age definitions.
- AI-010 opening planner.
- AI-011 defense state.
- AI-012 counter composition.
- AI-013 retreat/rebuild.

### Network / Replay

- REPLAY-001 ReplayHeader.
- REPLAY-002 command recording.
- REPLAY-003 state hashing.
- REPLAY-004 playback runner.
- NET-010 authoritative server bootstrap after replay/command contracts stabilize.

### Platform + QA

- QA-010 browser E2E harness.
- QA-011 performance history reporting.
- QA-012 long-match soak test.
- CI-010 root workspace gates.

These streams should communicate through contracts, not by editing the same giant file.

---

# 33. Risk register

## Risk: oversized core files

Impact: merge conflicts, regressions, slow reviews.

Mitigation: M0 modularization before broad parallel feature work.

## Risk: multiplayer built before command/replay stability

Impact: duplicated gameplay logic and expensive rewrite.

Mitigation: protocol + replay foundation before productized multiplayer.

## Risk: client authority leaks

Impact: cheating and inconsistent match state.

Mitigation: server owns all gameplay state and match result.

## Risk: nondeterministic simulation

Impact: replay divergence and difficult multiplayer diagnostics.

Mitigation: seeded randomness, fixed ticks, state hashing, command-stream tests.

## Risk: content breadth overwhelms engineering

Impact: many partially implemented units/techs and unstable balance.

Mitigation: small complete roster before expansion.

## Risk: performance regressions

Impact: browser RTS becomes unplayable as entity count grows.

Mitigation: explicit benchmark budgets and regression checks.

## Risk: premature accounts/database work

Impact: product/platform complexity before multiplayer is technically proven.

Mitigation: persistence begins after authoritative multiplayer prototype.

## Risk: protocol break blocks rollback

Impact: failed production deployment cannot be safely reverted.

Mitigation: protocol versioning and backward-compatible rollout strategy.

## Risk: replay compatibility drift

Impact: persisted replays silently stop working.

Mitigation: replay/protocol/content versioning.

## Risk: unverified backups

Impact: false confidence in recovery.

Mitigation: scheduled restore tests before launch.

## Risk: copied/unclear asset licensing

Impact: production legal risk.

Mitigation: original assets and recorded license provenance.

---

# 34. v1.0 launch checklist

The release owner must explicitly confirm every item.

## Product

- [ ] Single-player skirmish is complete.
- [ ] AI difficulties are functional.
- [ ] Age/tech progression is complete.
- [ ] Unit counters are readable and functional.
- [ ] Full match can be won/lost reliably.
- [ ] Required RTS controls exist.
- [ ] Production art/audio is present.

## Multiplayer

- [ ] Private 1v1 works.
- [ ] Quick Match works.
- [ ] Server is authoritative.
- [ ] Duplicate commands are safe.
- [ ] Reconnect works.
- [ ] Snapshot recovery works.
- [ ] Disconnect policy is defined.
- [ ] Match finish is authoritative.
- [ ] Load target is verified.

## Persistence

- [ ] Accounts work.
- [ ] Match history works.
- [ ] Rating works.
- [ ] Result persistence is idempotent.
- [ ] Replay storage works.
- [ ] Replay playback works.
- [ ] Database migrations are verified.

## Quality

- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] Build passes.
- [ ] Browser E2E passes.
- [ ] Chrome passes.
- [ ] Safari passes.
- [ ] Firefox passes.
- [ ] Client benchmark passes.
- [ ] Server load test passes.
- [ ] Long-match soak test passes.

## Security

- [ ] No browser secrets.
- [ ] Message schema validation.
- [ ] Authorization.
- [ ] Rate limits.
- [ ] Session/reconnect security.
- [ ] Dependency review.
- [ ] Production security headers.

## Operations

- [ ] Structured logs.
- [ ] Metrics.
- [ ] Alerts.
- [ ] Health/readiness checks.
- [ ] Backups.
- [ ] Restore test.
- [ ] Deploy runbook.
- [ ] Rollback rehearsal.
- [ ] Incident ownership.

## Legal

- [ ] Original/licensed assets documented.
- [ ] Terms ready.
- [ ] Privacy policy ready.
- [ ] Data retention documented.
- [ ] Account deletion path ready.
- [ ] KVKK/GDPR review as applicable.

## Release

- [ ] Feature freeze.
- [ ] RC passes.
- [ ] Production version tagged.
- [ ] Deployment succeeds.
- [ ] Post-deploy smoke succeeds.
- [ ] Monitoring remains healthy.
- [ ] Rollback path remains available.

---

# 35. Post-v1 backlog

Only prioritize after v1.0 stability:

- team games;
- spectator mode;
- richer replay analysis;
- more maps;
- more units/buildings/technologies;
- additional factions;
- campaign;
- scenario editor;
- modding;
- tournament tooling;
- native packaging;
- mobile-specific UX;
- social features.

---

## Final execution rule

The roadmap is dependency-driven, not calendar-driven.

A milestone is complete only when its **verification evidence** is complete. “Code exists” and “verified” are separate states.

When choosing the next work:

1. finish current P0 blockers;
2. protect architectural contracts;
3. prefer tasks that unblock multiple lanes;
4. keep `main` deployable;
5. keep changes reviewable;
6. measure performance before redesigning for performance;
7. do not move production complexity earlier than the architecture requires it.


---

# 36. v1.0 mechanical-parity scope amendment

> **This section supersedes the earlier narrow-v1 exclusions wherever they conflict.**
>
> Product direction was updated on 2026-09-21: AEO2 should be mechanically as close as practical to the systemic depth of Age of Empires II while keeping all expressive content original. AEO2 must not copy protected names, artwork, audio, maps, UI art, text, civilization identities, proprietary data tables, or other copyrighted/trademarked expression. The goal is mechanical familiarity and depth, not copied presentation.

## 36.1 Mechanical target

A player experienced with a mature classic medieval-style RTS should be able to transfer most high-level habits:

- multi-resource economy and worker tasking;
- four-stage age progression;
- large prerequisite-driven technology tree;
- multiple military production branches and counter roles;
- melee, ranged, mounted, siege, support/conversion-equivalent, naval and defensive-building gameplay;
- projectile travel/accuracy and terrain/elevation considerations where appropriate;
- formations, stances, patrol, attack-move, waypoints and shift queues;
- wall/gate/base-defense gameplay;
- garrison/ungarrison and repair;
- farms and renewable economy;
- hunt/herd/forage/fishing equivalents;
- market resource exchange and trade;
- relic/objective-equivalent map control and passive income;
- team games, diplomacy relationships, tribute and shared vision;
- land, water and hybrid procedural maps;
- multiple victory conditions;
- robust random-map generation;
- AI that can use these systems without privileged direct state mutation;
- replay/spectator-compatible authoritative simulation;
- production multiplayer that is not architecturally limited to 1v1.

## 36.2 Originality boundary

Mechanical similarity does **not** permit copying expressive content.

AEO2 production must use:

- original faction names and identities;
- original unit/building/technology names;
- original art, animation, icons and UI;
- original audio and music;
- original map themes/layout presets;
- original balance values and data tables;
- original lore/text/copy;
- original visual tech-tree presentation.

References to other RTS games may be used internally to describe a generic mechanic, but runtime/player-facing content must remain AEO2-owned and original.

## 36.3 Revised production gameplay scope

The following are now required before v1.0 unless an explicit product decision removes them:

### Economy depth

- Food, Wood, Gold and Stone.
- Multiple food sources with distinct worker behavior: forage/harvest, hunt, herd, farm and fishing equivalents.
- Farms with finite food and repeat/reseed automation.
- Specialized resource drop-off behavior/buildings as designed.
- Worker construction acceleration from multiple builders.
- Building/unit repair.
- Resource depletion and retargeting.
- Market resource buy/sell with dynamic price.
- Land trade and water trade equivalents.
- Economy technologies and gathering efficiency upgrades.

### Progression and factions

- Four gameplay ages/stages.
- Data-driven prerequisite graph.
- Broad generic technology tree.
- Multiple original playable factions with:
  - tech-tree availability differences;
  - faction bonuses;
  - team bonus;
  - at least one unique unit/technology or equivalent distinctive mechanic.
- Faction choice serialized into match/replay/network state.

### Military depth

- Infantry role families.
- Ranged role families.
- Mounted/mobile role families.
- Siege role families.
- Support/conversion-equivalent role.
- Naval military/economy roles.
- Defensive structures.
- Data-driven armor/class/counter relationships.
- Unit upgrades across ages.
- Building upgrades where used.
- Projectile travel and ranged accuracy rules.
- Area/splash damage where required by siege.
- Minimum range where required by siege/ranged balance.
- Pack/deploy state where required by a siege design.
- Formation and stance controls.
- Garrison/ungarrison.
- Transport capacity for naval transport equivalents.

### Base building and map control

- Walls.
- Gates.
- Connected wall placement UX.
- Towers/defensive structures.
- Garrisoned defensive effects where designed.
- Objective/relic-equivalent neutral map objects.
- Wonder/landmark-equivalent alternate victory structure or objective.
- Elevation/terrain movement or combat modifiers where included in the balance model.

### Naval and hybrid maps

- Water terrain/navigation.
- Dock/harbor-equivalent building.
- Fishing economy.
- Naval production.
- Naval combat.
- Transport ships/equivalent.
- Water trade where part of v1 economy.
- Land, water and hybrid random-map presets.

### Team/multiplayer systems

- Architecture and protocol support for 1v1, 2v2 and 4v4 at minimum.
- Team assignment.
- Ally/enemy relationship model.
- Shared/team vision.
- Resource tribute.
- Team trade.
- Team victory/defeat resolution.
- Team matchmaking/custom lobby settings.
- Reconnect and authoritative recovery for team matches.
- Load/capacity verification for team-match entity counts.

### Match rules

- Conquest-style victory.
- Objective/relic-control-equivalent victory.
- Landmark/wonder-equivalent timed victory.
- Configurable victory-condition selection where appropriate.
- Surrender and team surrender semantics.
- Match pause policy where applicable.
- Game speed remains server-authoritative online.

## 36.4 Scale target changes

The original 100-entity benchmark remains an early regression baseline, not the final production ceiling.

Before v1.0, performance verification must include:

- late-game 1v1 entity/building counts;
- representative 2v2;
- representative 4v4;
- projectile-heavy combat;
- siege-heavy combat;
- wall/gate pathfinding;
- naval/hybrid navigation;
- multiple AI players where supported;
- fog/minimap at large map scale.

Budgets must be measured on representative hardware and server capacity must be re-established after team-game scope is implemented.

## 36.5 AI scope changes

Production AI must understand, at minimum:

- four-age progression;
- faction-specific tech availability;
- farms and renewable economy;
- hunting/herding/fishing equivalents;
- market exchange;
- wall/gate interaction;
- repair;
- garrison/ungarrison when tactically useful;
- siege production/use;
- support/conversion-equivalent mechanics;
- relic/objective-equivalent control;
- naval economy/combat on water maps;
- trade in team games;
- tribute/team support;
- team coordination targets;
- alternate victory-condition defense/offense.

AI is still required to operate through normal validated commands and available information.

## 36.6 Revised milestone insertion

The production sequence now inserts these gameplay milestones before final multiplayer/persistence hardening:

1. **Parity Foundation** — generic task/action/class/projectile/terrain/garrison/wall contracts.
2. **Deep Economy** — food-source diversity, farms, repair, multi-builder construction, market/trade.
3. **Four Ages + Factions** — four-stage progression, broad tech tree, faction differences and unique content.
4. **Advanced Combat** — deeper armor/counter classes, siege, support/conversion, projectiles, formations/stances.
5. **Fortification + Objectives** — walls/gates/garrison/objective/alternate victory.
6. **Naval + Hybrid Maps** — water navigation, fishing, docks, naval combat, transport/trade.
7. **Team Games** — 2v2/4v4, diplomacy relationships, shared vision, tribute, team victory and team matchmaking.
8. **Parity AI + Balance** — all new systems usable by AI and covered by balance scenarios.
9. **Parity Scale Verification** — late-game 1v1/2v2/4v4 client/server performance and long-match verification.
10. Existing replay, authoritative multiplayer, accounts, production hardening and release gates continue, but must support the expanded gameplay scope.

## 36.7 Mechanical-parity completion gate

v1.0 cannot be called mechanically complete while any launch-required system above exists only as:

- a client-only mock;
- a hard-coded one-off that cannot serialize/replay/network;
- a player-only mechanic the AI cannot use where AI support is required;
- a single-player-only mechanic that breaks authoritative multiplayer;
- an unverified implementation without deterministic simulation coverage;
- an implementation that exceeds accepted late-game performance budgets.

The issue backlog is the execution source of truth. New parity issues reference this amendment and remain subject to the same Definition of Done, security, replay, network, performance and release requirements as the original roadmap.
