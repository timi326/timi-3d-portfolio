import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const outputPath = path.join(projectDir, 'desk-props-preview.png');

const cards = [
  {
    file: 'desk-lamp.glb',
    title: '01  黄铜感台灯',
    note: '放在桌面左后侧，形成一处暖光焦点',
    accent: '#b88f57',
    yaw: -0.7,
  },
  {
    file: 'notebook.glb',
    title: '02  创作笔记本',
    note: '斜放在键盘旁，增加真实使用痕迹',
    accent: '#809183',
    yaw: -0.5,
  },
  {
    file: 'coffee-cup.glb',
    title: '03  陶瓷咖啡杯',
    note: '靠近桌角，小体积但能让空间更生活化',
    accent: '#c88463',
    yaw: 0.7,
  },
  {
    file: 'bass-speakers.glb',
    title: '04  桌面音箱',
    note: '左右对称摆放，补足电脑设备的层次',
    accent: '#4c5a55',
    yaw: -0.8,
  },
];

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[char]);
}

function parseGlb(buffer) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    loader.parse(arrayBuffer, '', resolve, reject);
  });
}

function hex(color) {
  return `#${color.getHexString()}`;
}

function shadeColor(base, brightness) {
  const color = new THREE.Color(base);
  color.multiplyScalar(THREE.MathUtils.clamp(brightness, 0.36, 1.18));
  return hex(color);
}

function renderScene(scene, card, x, y, width, height) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 0.001);

  const yaw = card.yaw ?? -0.65;
  const camera = new THREE.Vector3(Math.sin(yaw) * 4.8, 3.2, Math.cos(yaw) * 4.8);
  const forward = center.clone().sub(camera).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const light = new THREE.Vector3(-0.45, 0.85, 0.58).normalize();
  const triangles = [];

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry?.attributes?.position) return;
    const geometry = object.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const materialColor = material?.color?.clone();
    const materialLuma = materialColor
      ? materialColor.r * 0.2126 + materialColor.g * 0.7152 + materialColor.b * 0.0722
      : 0;
    const base = materialColor && materialLuma > 0.08
      ? `#${materialColor.getHexString()}`
      : card.accent;
    const faceCount = index ? index.count / 3 : position.count / 3;
    const stride = Math.max(1, Math.ceil(faceCount / 2600));

    const worldVertex = (i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
    for (let face = 0; face < faceCount; face += stride) {
      const offset = face * 3;
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      const a = worldVertex(ia);
      const b = worldVertex(ib);
      const c = worldVertex(ic);
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      const brightness = 0.55 + Math.max(0, normal.dot(light)) * 0.55;
      const project = (vertex) => {
        const relative = vertex.clone().sub(center);
        return {
          x: relative.dot(right),
          y: relative.dot(up),
          z: relative.dot(forward),
        };
      };
      const pa = project(a);
      const pb = project(b);
      const pc = project(c);
      triangles.push({ points: [pa, pb, pc], depth: (pa.z + pb.z + pc.z) / 3, fill: shadeColor(base, brightness) });
    }
  });

  triangles.sort((a, b) => a.depth - b.depth);
  const viewportTop = y + 92;
  const viewportHeight = height - 166;
  const scale = Math.min((width - 96) / maxSize, viewportHeight / maxSize) * 0.92;
  const cx = x + width / 2;
  const cy = viewportTop + viewportHeight * 0.56;
  const polygons = triangles.map((triangle) => {
    const points = triangle.points.map((point) => `${(cx + point.x * scale).toFixed(1)},${(cy - point.y * scale).toFixed(1)}`).join(' ');
    return `<polygon points="${points}" fill="${triangle.fill}" stroke="rgba(32,36,32,.08)" stroke-width=".35"/>`;
  }).join('');

  const shadowRx = Math.min(width * 0.28, Math.max(48, size.x / maxSize * width * 0.27));
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="#f5f2eb" stroke="#d8d7ce"/>
      <rect x="${x + 24}" y="${y + 24}" width="48" height="4" rx="2" fill="${card.accent}"/>
      <text x="${x + 24}" y="${y + 62}" class="cardTitle">${escapeXml(card.title)}</text>
      <ellipse cx="${cx}" cy="${y + height - 74}" rx="${shadowRx}" ry="16" fill="rgba(61,58,51,.12)" filter="url(#blur)"/>
      ${polygons}
      <text x="${x + 24}" y="${y + height - 30}" class="note">${escapeXml(card.note)}</text>
    </g>`;
}

const scenes = [];
for (const card of cards) {
  const buffer = await fs.readFile(path.join(projectDir, 'public', 'models', 'zsky', card.file));
  const gltf = await parseGlb(buffer);
  scenes.push(gltf.scene);
}

const width = 1600;
const height = 1060;
const margin = 66;
const gap = 26;
const top = 156;
const cardWidth = (width - margin * 2 - gap) / 2;
const cardHeight = (height - top - margin - gap) / 2;
const rendered = scenes.map((scene, index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return renderScene(scene, cards[index], margin + col * (cardWidth + gap), top + row * (cardHeight + gap), cardWidth, cardHeight);
}).join('');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>
    <style>
      .title { font: 600 42px 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; fill: #27312d; letter-spacing: 1px; }
      .subtitle { font: 400 19px 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; fill: #69726d; }
      .cardTitle { font: 600 25px 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; fill: #303a35; }
      .note { font: 400 16px 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; fill: #68716c; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="#e8e9e1"/>
  <text x="${margin}" y="70" class="title">办公桌细节候选</text>
  <text x="${margin}" y="108" class="subtitle">现有模型几何 + 拟用材质配色 · 暖色现代办公区</text>
  <text x="${width - margin}" y="96" text-anchor="end" class="subtitle">先确认，再放入房间</text>
  ${rendered}
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(outputPath);
console.log(outputPath);
