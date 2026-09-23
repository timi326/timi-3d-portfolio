import * as THREE from 'three';

/** Derive subtle surface response from the authored atlas without changing its colors. */
export function refineTripoMaterial(material: THREE.MeshStandardMaterial, owned: THREE.Texture[]) {
  if (!material.name.startsWith('Tripo /') || !material.map) return;
  const fabric = /\/ (chair|sofa) \//.test(material.name);
  const canvas = document.createElement('canvas');
  const source = material.map.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement;
  const width = source?.width ?? 0, height = source?.height ?? 0;
  if (!width || !height) return;
  const ratio = Math.min(1, 1024 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const count = canvas.width * canvas.height;
  const luminance = new Float32Array(count);
  for (let i = 0; i < count; i++) luminance[i] = (pixels[i*4]*.2126 + pixels[i*4+1]*.7152 + pixels[i*4+2]*.0722) / 255;
  const response = new Uint8Array(count * 4), relief = new Uint8Array(count * 4);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const i = y * canvas.width + x, at = i * 4;
    const l = luminance[i];
    const r = pixels[at] / 255, b = pixels[at+2] / 255;
    const darkHardware = fabric && l < .17 && Math.abs(r-b) < .045;
    const wood = !fabric && r > b * 1.13;
    const roughness = darkHardware ? .48 : fabric ? .94 : wood ? .83 : .68;
    response[at] = 255;
    response[at+1] = Math.round(255 * Math.min(1, roughness + (l-.5)*.035));
    response[at+2] = darkHardware ? 100 : 0;
    response[at+3] = 255;
    // High-pass only: broad baked shadows must not become dents in the mesh.
    let mean = 0;
    for (const [dx,dy] of [[-2,0],[2,0],[0,-2],[0,2]]) {
      mean += luminance[Math.min(canvas.height-1,Math.max(0,y+dy))*canvas.width + Math.min(canvas.width-1,Math.max(0,x+dx))];
    }
    const detail = Math.max(-.12, Math.min(.12,l-mean/4));
    const value = Math.round(128 + detail * (fabric ? 150 : wood ? 85 : 0));
    relief[at] = relief[at+1] = relief[at+2] = value; relief[at+3] = 255;
  }
  const make = (data: Uint8Array) => {
    const texture = new THREE.DataTexture(data,canvas.width,canvas.height,THREE.RGBAFormat);
    texture.flipY = material.map!.flipY;
    texture.wrapS = material.map!.wrapS; texture.wrapT = material.map!.wrapT;
    texture.repeat.copy(material.map!.repeat); texture.offset.copy(material.map!.offset);
    texture.rotation = material.map!.rotation; texture.center.copy(material.map!.center);
    texture.channel = material.map!.channel;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = 4;
    texture.needsUpdate = true; owned.push(texture); return texture;
  };
  material.roughnessMap = make(response); material.roughness = 1;
  material.metalnessMap = material.roughnessMap; material.metalness = 1;
  if (!material.normalMap) { material.bumpMap = make(relief); material.bumpScale = fabric ? .002 : .0008; }
  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.specularIntensity = fabric ? .15 : .28;
    material.clearcoat = 0;
    material.sheen = fabric ? .22 : 0;
    material.sheenColor.set('#81929f'); material.sheenRoughness = 1;
  }
  material.needsUpdate = true;
}
