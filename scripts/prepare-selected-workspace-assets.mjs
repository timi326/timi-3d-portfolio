import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const [layoutInput, setupInput, outputDirectory] = process.argv.slice(2);

if (!layoutInput || !setupInput || !outputDirectory) {
  throw new Error('Usage: node scripts/prepare-selected-workspace-assets.mjs <layout.glb> <setup.glb> <output-directory>');
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const layoutDocument = await io.read(layoutInput);
const layoutRoot = layoutDocument.getRoot();

for (const animation of layoutRoot.listAnimations()) animation.dispose();

const redundantLayoutNodes = new Set([
  'Room_5',
  'topedge_6',
  'side edge_7',
  'right_side_cube_8',
  'wifi_base_side_9',
  'wifi_extra_side_10',
  'topedge.001_11',
  'right_side_border_12',
  'Cube.001_13',
  'led_left_top_14',
  'right_lde_15',
  'base_16',
  'heart_container_17',
  'icons_right_container_18',
  'hexa_19',
  'Cube.003_20',
  'heart_21',
  'Cube.002_22',
  'star_23',
  'Cube.009_25',
  'Cylinder_26',
  'Cube.005_27',
  'Cube.006_28',
  'Cube.010_29',
  'Cube.011_30',
  'wifi-signal_31',
  'Cube.008_32',
  'Cube.012_33',
  'Cube.013_34',
  'screen.001_1',
  'screen.002_2',
  'screen.005_4',
  'screen holder_35',
  'keyboard mouse_40',
  'root_77',
  'right_side_border.003_78',
  'right_side_border.004_79',
  'right_side_border.006_80',
  'Cube_81',
  'Sketchfab_model.007_237',
  'GamingClutter_018_368',
  'GamingClutter_005.001_369',
  'GamingClutter_035.001_370',
  'download_button_372',
]);

for (const node of layoutRoot.listNodes()) {
  const [localX, localY, localZ] = node.getTranslation();
  const isSceneChild = node.getParentNode()?.getName() === 'GLTF_SceneRootNode';
  const isDetachedWallDecoration = isSceneChild && (
    localY > 6.15
    || localZ < -4.25
    || localX > 6
    || (localX < -2.72 && localY > 3.4)
  );
  if (redundantLayoutNodes.has(node.getName()) || isDetachedWallDecoration) node.dispose();
}

await layoutDocument.transform(prune());
await io.write(`${outputDirectory}/programmer-room-layout.glb`, layoutDocument);

const setupDocument = await io.read(setupInput);
for (const animation of setupDocument.getRoot().listAnimations()) animation.dispose();
await setupDocument.transform(prune());
await io.write(`${outputDirectory}/gaming-setup-v2.glb`, setupDocument);
