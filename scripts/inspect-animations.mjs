import { NodeIO } from '@gltf-transform/core';

const io = new NodeIO();
const document = await io.read(process.argv[2]);

for (const animation of document.getRoot().listAnimations()) {
  const summary = { name: animation.getName(), samples: {} };
  for (const channel of animation.listChannels()) {
    const nodeName = channel.getTargetNode()?.getName() ?? '';
    const path = channel.getTargetPath();
    if (!['Hip', 'Pelvis', 'Head', 'L_Foot', 'R_Foot'].includes(nodeName)) continue;
    const sampler = channel.getSampler();
    const input = sampler?.getInput()?.getArray();
    const output = sampler?.getOutput()?.getArray();
    if (!input || !output) continue;
    let min = Infinity;
    let max = -Infinity;
    for (const value of output) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    summary.samples[`${nodeName}.${path}`] = {
      keyframes: input.length,
      duration: input[input.length - 1],
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      spread: Number((max - min).toFixed(4)),
    };
  }
  console.log(JSON.stringify(summary, null, 2));
}
