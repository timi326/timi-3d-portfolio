import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const assets = ['dining_chair_02', 'modern_coffee_table_01', 'modern_arm_chair_01'];
const root = new URL('../public/models/polyhaven/', import.meta.url);
const headers = { 'User-Agent': 'TimiStudioAssetDownloader/1.0' };

async function fetchBytes(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

for (const slug of assets) {
  const response = await fetch(`https://api.polyhaven.com/files/${slug}`, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${slug}`);
  const manifest = await response.json();
  const gltf = manifest.gltf['1k'].gltf;
  const target = join(root.pathname.slice(1), slug);

  await mkdir(target, { recursive: true });
  await writeFile(join(target, `${slug}_1k.gltf`), await fetchBytes(gltf.url));

  for (const [relativePath, file] of Object.entries(gltf.include)) {
    const destination = join(target, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await fetchBytes(file.url));
  }

  console.log(`Downloaded ${slug} (1K glTF package)`);
}
