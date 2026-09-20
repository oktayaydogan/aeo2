import { useEffect, useRef } from "react";
import { createGame } from "./game/createGame";

export function App() {
  const gameHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = gameHostRef.current;
    if (!host) return;

    const game = createGame(host);
    return () => game.destroy(true);
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <strong>AEO2</strong>
          <span className="milestone">Phase 2 · Skirmish depth</span>
        </div>
        <div className="controls">
          WASD pan · wheel zoom · H/B/X build · V/M/P/C train · F research · right-click context · minimap navigation
        </div>
      </header>

      <section className="game-frame">
        <div ref={gameHostRef} className="game-host" />
      </section>
    </main>
  );
}
