// Copies the phone dashboard (../public) and the on-device sound model into www/ for the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(root, '..', 'public'), www, { recursive: true });
const mp = path.join(root, 'node_modules', '@mediapipe', 'tasks-audio');
const vendor = path.join(www, 'vendor', 'mediapipe');
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync(path.join(mp, 'audio_bundle.mjs'), path.join(vendor, 'audio_bundle.mjs'));
fs.cpSync(path.join(mp, 'wasm'), path.join(vendor, 'wasm'), { recursive: true });
console.log('Web assets copied to', www);
