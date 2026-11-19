// Builds www/ for the Android app: the dashboard (../public), the shared co-pilot engine
// (../lib), the phone-only code (src/), the on-device sound model, and one bundled file
// for the native plugins + Claude SDK.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..');
const copilot = path.join(app, '..');
const www = path.join(app, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(copilot, 'public'), www, { recursive: true });

// Shared engine (runs on the phone; the computer-only files are left out)
const SHARED = ['emitter.js', 'store.js', 'brain.js', 'music.js', 'engine.js', 'demo.js'];
fs.mkdirSync(path.join(www, 'lib'));
for (const f of SHARED) fs.copyFileSync(path.join(copilot, 'lib', f), path.join(www, 'lib', f));
fs.copyFileSync(path.join(copilot, 'data', 'profile.example.json'), path.join(www, 'profile.example.json'));

// Phone-only code
fs.cpSync(path.join(app, 'src'), path.join(www, 'native'), { recursive: true });
fs.rmSync(path.join(www, 'native', 'vendor-entry.js'));

// On-device sound model runtime
const mp = path.join(app, 'node_modules', '@mediapipe', 'tasks-audio');
const vendor = path.join(www, 'vendor');
fs.mkdirSync(path.join(vendor, 'mediapipe'), { recursive: true });
fs.copyFileSync(path.join(mp, 'audio_bundle.mjs'), path.join(vendor, 'mediapipe', 'audio_bundle.mjs'));
fs.cpSync(path.join(mp, 'wasm'), path.join(vendor, 'mediapipe', 'wasm'), { recursive: true });

// Capacitor plugins + Claude SDK in one browser module
await build({
  entryPoints: [path.join(app, 'src', 'vendor-entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: path.join(vendor, 'native.mjs'),
  logLevel: 'warning',
});

console.log('App web assets built in', www);
