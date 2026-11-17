// Boot: wire the canvas, the audio engine and the UI together, translate mouse and keyboard
// into game coordinates, and run the frame loop. The canvas has a fixed 1280x800 logical size;
// CSS scales it to fit the window, and pointer positions are mapped back through the same scale.
// With ?shot=... in the URL the loop renders one staged scene on a fixed-step clock instead of
// playing, so screenshots are deterministic.

import { VIEW } from './config.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { parseShotParams, stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = new AudioEngine();
const ui = new UI(audio);

const shot = parseShotParams(window.location.search);
if (shot) stageShot(ui, shot.name, shot.seed);

function fit() {
  const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
  canvas.style.width = `${Math.floor(VIEW.width * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW.height * scale)}px`;
}
window.addEventListener('resize', fit);
fit();

function toGameCoords(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * VIEW.width,
    y: ((event.clientY - rect.top) / rect.height) * VIEW.height,
  };
}

canvas.addEventListener('pointermove', (event) => {
  const p = toGameCoords(event);
  ui.mouse.x = p.x;
  ui.mouse.y = p.y;
});
canvas.addEventListener('pointerdown', (event) => {
  const p = toGameCoords(event);
  ui.mouse.x = p.x;
  ui.mouse.y = p.y;
  audio.unlock();
  ui.onClick(p.x, p.y);
});
window.addEventListener('keydown', (event) => {
  if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault();
  if (!event.repeat) ui.onKey(event.key);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (shot) {
    ui.t += 1 / 60; // staged scene: ambient motion only, on a fixed step
  } else {
    ui.update(dt);
  }
  ui.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
