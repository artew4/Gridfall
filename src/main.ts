import './style.css';
import { Game } from './core/Game';

const app = document.getElementById('app')!;
const game = new Game(app);
game.init().catch((err) => {
  console.error(err);
  const l = document.querySelector('#title .loading');
  if (l) l.textContent = 'FAILED TO INITIALISE — SEE CONSOLE';
});

if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
