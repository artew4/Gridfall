// 16.0: the menu's typefaces, self-hosted (Latin only: the flavor scripts use system fonts).
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import './style.css';
import { Game } from './core/Game';

const app = document.getElementById('app')!;
const game = new Game(app);
game.init().catch((err) => {
  console.error(err);
  const l = document.querySelector('#title .loading');
  if (l) l.textContent = 'FAILED TO INITIALISE — SEE CONSOLE';
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
  void import('./dev/DevTools').then((m) => m.installDevTools(game));
}
