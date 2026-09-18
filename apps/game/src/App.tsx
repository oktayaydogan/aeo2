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
        <div>
          <strong>AEO2</strong>
          <span className="milestone">Phase 1 · Economy vertical slice</span>
        </div>
        <div className="controls">WASD pan · wheel zoom · click/drag select · right-click move/resource gather</div>
      </header>

      <section className="game-frame">
        <div ref={gameHostRef} className="game-host" />
      </section>

      <footer className="statusbar">
        <span>Simulation: fixed 20 Hz · economy loop · ?benchmark=1 for 100 entities</span>
        <span>Rendering: Phaser 4</span>
        <span>Client shell: React</span>
      </footer>
    </main>
  );
}
