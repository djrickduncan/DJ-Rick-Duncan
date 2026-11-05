// Copies the web app from ../connect into ./www and adds the Capacitor runtime.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, '..', 'connect');
const out = path.join(root, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true, filter: (p) => !/(README\.md|sw\.js|manifest\.webmanifest)$/.test(p) });
fs.copyFileSync(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(out, 'capacitor.js'));

const indexPath = path.join(out, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace('<script src="vendor/qrcode.js" defer></script>',
  '<script src="capacitor.js"></script>\n  <script src="vendor/qrcode.js" defer></script>');
if (!html.includes('capacitor.js')) throw new Error('Could not inject capacitor.js');
fs.writeFileSync(indexPath, html);
console.log('Built www/ from ../connect');
