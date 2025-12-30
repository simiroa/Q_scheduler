import { Scheduler } from './scheduler/core.js';
import './scheduler/persistence.js';
import './scheduler/data.js';
import './scheduler/render.js';
import './scheduler/interactions.js';
import './scheduler/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    window.app = new Scheduler();
});
