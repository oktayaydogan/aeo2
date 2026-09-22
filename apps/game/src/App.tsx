import { useEffect, useRef, useState } from "react";
import { createGame } from "./game/createGame";
import {
  DEFAULT_SKIRMISH_SETTINGS,
  createSkirmishSearch,
  readSkirmishSettings,
  type AiDifficulty,
  type StartingResourcesPreset
} from "./game/skirmishSettings";

function isPlayMode(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("play") === "1"
  );
}

export function App() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const [playing] = useState(isPlayMode);
  const [settings, setSettings] = useState(readSkirmishSettings);

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

  const startSkirmish = () => {
    window.location.search = createSkirmishSearch(settings);
  };

  const resetSettings = () => {
    setSettings({ ...DEFAULT_SKIRMISH_SETTINGS });
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
                Configure the parts of the current ruleset that are already
                deterministic and supported by the simulation.
              </p>
            </div>

            <div className="setup-grid">
              <label className="setup-field">
                <span>Map seed</span>
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      seed:
                        Number.parseInt(event.target.value, 10) ||
                        DEFAULT_SKIRMISH_SETTINGS.seed
                    }))
                  }
                />
                <small>Reuse this number to reproduce the same map.</small>
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

              <div className="setup-field setup-field-static">
                <span>Map size</span>
                <strong>Standard · 20 × 20</strong>
                <small>Additional map sizes are not simulation-ready yet.</small>
              </div>

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
