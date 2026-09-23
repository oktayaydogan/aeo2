import { useEffect, useMemo, useRef, useState } from "react";
import { createGame } from "./game/createGame";
import {
  DEFAULT_SKIRMISH_SETTINGS,
  MAX_SKIRMISH_SEED,
  createSkirmishSearch,
  isValidSkirmishSettings,
  readSkirmishSettings,
  type AiDifficulty,
  type MapSizePreset,
  type StartingResourcesPreset
} from "./game/skirmishSettings";

function isPlayMode(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("play") === "1"
  );
}

function createRandomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const value = values[0] ?? 1;

    return value === 0 ? 1 : value;
  }

  return Math.floor(Math.random() * MAX_SKIRMISH_SEED) + 1;
}

export function App() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const [playing] = useState(isPlayMode);
  const initialSettings = useMemo(readSkirmishSettings, []);
  const [settings, setSettings] = useState(initialSettings);
  const [seedInput, setSeedInput] = useState(String(initialSettings.seed));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  useEffect(() => {
    if (!playing) {
      return;
    }

    const host = gameHostRef.current;

    if (!host) {
      return;
    }

    const game = createGame(host);
    return () => game.destroy(true);
  }, [playing]);

  const parsedSeed = Number(seedInput);
  const candidateSettings = {
    ...settings,
    seed: parsedSeed
  };
  const settingsValid =
    seedInput.trim().length > 0 &&
    isValidSkirmishSettings(candidateSettings);

  const startSkirmish = () => {
    if (!settingsValid) {
      return;
    }

    window.location.search = createSkirmishSearch(candidateSettings);
  };

  const resetSettings = () => {
    setSettings({ ...DEFAULT_SKIRMISH_SETTINGS });
    setSeedInput(String(DEFAULT_SKIRMISH_SETTINGS.seed));
    setCopyState("idle");
  };

  const randomizeSeed = () => {
    const seed = createRandomSeed();
    setSettings((current) => ({ ...current, seed }));
    setSeedInput(String(seed));
    setCopyState("idle");
  };

  const copySeed = async () => {
    if (!settingsValid || !navigator.clipboard) {
      setCopyState("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(candidateSettings.seed));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const openSetup = () => {
    window.location.search = createSkirmishSearch(settings, false);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <strong>AEO2</strong>
          <span className="milestone">
            {playing ? "Skirmish" : "Match setup"}
          </span>
        </div>

        {playing ? (
          <div className="topbar-actions">
            <div className="controls">
              WASD / edge pan · wheel / pinch zoom · S stop · Ctrl+1..9 groups · right-click context
            </div>
            <button
              className="topbar-button"
              type="button"
              onClick={openSetup}
            >
              New skirmish
            </button>
          </div>
        ) : (
          <div className="controls">
            Deterministic local skirmish · same settings + seed = same start
          </div>
        )}
      </header>

      {playing ? (
        <section className="game-frame">
          <div ref={gameHostRef} className="game-host" />
        </section>
      ) : (
        <section className="setup-shell">
          <div className="setup-panel">
            <div className="setup-heading">
              <span className="setup-kicker">Single-player skirmish</span>
              <h1>Prepare the match</h1>
              <p>
                Configure a reproducible local match. The URL keeps the chosen
                settings so reload/restart uses the same authoritative start.
              </p>
            </div>

            <div className="setup-grid">
              <label className="setup-field">
                <span>Map seed</span>
                <div className="seed-control">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={seedInput}
                    aria-invalid={!settingsValid}
                    onChange={(event) => {
                      const value = event.target.value.replace(/[^0-9]/g, "");
                      setSeedInput(value);
                      const nextSeed = Number(value);

                      if (Number.isSafeInteger(nextSeed)) {
                        setSettings((current) => ({
                          ...current,
                          seed: nextSeed
                        }));
                      }

                      setCopyState("idle");
                    }}
                  />
                  <button
                    type="button"
                    className="field-button"
                    onClick={randomizeSeed}
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    className="field-button"
                    onClick={copySeed}
                    disabled={!settingsValid}
                  >
                    {copyState === "copied" ? "Copied" : "Copy"}
                  </button>
                </div>
                <small className={!settingsValid ? "field-error" : undefined}>
                  {settingsValid
                    ? "1–4,294,967,295 · reuse this value for the same map."
                    : "Enter an integer seed between 1 and 4,294,967,295."}
                </small>
              </label>

              <label className="setup-field">
                <span>AI difficulty</span>
                <select
                  value={settings.aiDifficulty}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      aiDifficulty: event.target.value as AiDifficulty
                    }))
                  }
                >
                  <option value="easy">Easy</option>
                  <option value="standard">Standard</option>
                  <option value="hard">Hard</option>
                </select>
                <small>Changes AI think cadence, army target and attack timing.</small>
              </label>

              <label className="setup-field">
                <span>Starting resources</span>
                <select
                  value={settings.startingResources}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      startingResources:
                        event.target.value as StartingResourcesPreset
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
                <small>Applies deterministic resource presets to both sides.</small>
              </label>

              <label className="setup-field">
                <span>Map size</span>
                <select
                  value={settings.mapSize}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      mapSize: event.target.value as MapSizePreset
                    }))
                  }
                >
                  <option value="small">Small · 16 × 16</option>
                  <option value="standard">Standard · 20 × 20</option>
                  <option value="large">Large · 28 × 28</option>
                </select>
                <small>Map geometry and mirrored obstacles remain seeded.</small>
              </label>

              <div className="setup-field setup-field-static">
                <span>Starting age</span>
                <strong>Current ruleset</strong>
                <small>Age progression is not enabled in this build yet.</small>
              </div>

              <div className="setup-field setup-field-static">
                <span>Game speed</span>
                <strong>1.0× · fixed</strong>
                <small>Fixed simulation timing remains authoritative.</small>
              </div>
            </div>

            <div className="setup-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={resetSettings}
              >
                Reset defaults
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={startSkirmish}
                disabled={!settingsValid}
              >
                Start skirmish
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
