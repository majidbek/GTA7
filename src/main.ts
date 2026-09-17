import { Game } from './game/Game';

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

new Game(app);
