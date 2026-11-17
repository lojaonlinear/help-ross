const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'public');
if (path.dirname(output) !== root || path.basename(output) !== 'public') throw new Error('Unexpected output path');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
for (const name of fs.readdirSync(root)) {
  if (/\.(html|css|js|png|webp|ico)$/.test(name)) fs.copyFileSync(path.join(root, name), path.join(output, name));
}
for (const name of ['assets', 'uploads']) fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
console.log('Static files prepared; server code, dependencies and secrets excluded.');
