import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const selection = readJSON('src/data/selection.json');
const catalog = readJSON('src/data/catalog.json');
const previews = readJSON('src/data/previews.json');
assert.equal(selection.length, 50);
assert.equal(new Set(selection).size, 50);
assert.deepEqual(catalog.map(work => work.slug), selection);
assert.ok(catalog.every(work => !work.hidden));

let totalBytes = 0;
for (const slug of selection) {
  const preview = previews[slug];
  assert.ok(preview?.url, `${slug}: missing model`);
  const filename = new URL(preview.url, 'https://atrium.earth').pathname.split('/').at(-1);
  const path = `public/models/previews/${slug}/${filename}`;
  const bytes = readFileSync(path);
  assert.equal(bytes.length, preview.bytes, `${slug}: model size differs`);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${slug}: invalid GLB`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${slug}: incomplete GLB`);
  if (preview.sha256) assert.equal(createHash('sha256').update(bytes).digest('hex'), preview.sha256, `${slug}: checksum differs`);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim());
  for (const item of [...(gltf.buffers || []), ...(gltf.images || [])]) {
    assert.ok(!item.uri || item.uri.startsWith('data:'), `${slug}: model needs an external file`);
  }
  totalBytes += bytes.length;
  const imagePath = `public/previews/renders/${slug}/thumb.webp`;
  const image = readFileSync(imagePath);
  assert.equal(image.toString('ascii', 0, 4), 'RIFF');
  assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  assert.ok(existsSync(`dist/works/${slug}/index.html`), `${slug}: missing detail page`);
}

function allFiles(path) {
  return readdirSync(path).flatMap(name => {
    const file = join(path, name);
    return statSync(file).isDirectory() ? allFiles(file) : [file];
  });
}
const htmlFiles = allFiles('dist').filter(path => path.endsWith('.html'));
assert.equal(htmlFiles.length, 53, 'Only the 50 details and three gallery pages should ship');
for (const path of htmlFiles) {
  const html = readFileSync(path, 'utf8');
  assert.ok(!html.includes('googletagmanager.com'), `${path}: inherited analytics`);
  for (const match of html.matchAll(/(?:href|src|data-glb)="([^"#]+)"/g)) {
    const url = match[1].replaceAll('&amp;', '&').split(/[?#]/)[0];
    if (!url.startsWith('/')) continue;
    assert.ok(url.startsWith('/rear-view/'), `${path}: link escapes gallery: ${url}`);
    const relative = decodeURIComponent(url.slice('/rear-view/'.length));
    const target = join('dist', relative);
    assert.ok(existsSync(target) || existsSync(join(target, 'index.html')), `${path}: missing target ${url}`);
  }
}
const root = readFileSync('dist/index.html', 'utf8');
assert.equal([...root.matchAll(/data-v3-card(?:\s|>)/g)].length, 50, 'Landing page must contain all 50 works');
console.log(`Gallery verified: 50 exact self-contained models (${(totalBytes / 1024 ** 2).toFixed(1)} MiB), 50 thumbnails, 53 pages, valid subdirectory links.`);
