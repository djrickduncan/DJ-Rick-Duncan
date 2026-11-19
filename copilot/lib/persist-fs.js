// Saves co-pilot data to files on the computer (used by server.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, '..', 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const file = (name) => path.join(DATA_DIR, name);

function readJson(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

export const filePersist = {
  loadViewers: () => readJson(file('viewers.json')),
  saveViewers: (v) => fs.writeFileSync(file('viewers.json'), JSON.stringify(v, null, 1)),
  loadProfile: () => readJson(file('profile.json')) ?? readJson(file('profile.example.json')),
  saveProfile: (p) => fs.writeFileSync(file('profile.json'), JSON.stringify(p, null, 2)),
  saveReport: (r) => {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const name = `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(REPORTS_DIR, name), JSON.stringify(r, null, 2));
    return name;
  },
};
