import * as THREE from 'three';
import { LandmarkId } from '../data/urukLore';
import { UrukTextures } from './textures';

// Pre-allocated math helpers at module scope (Zero GC in render loop)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _vec3 = new THREE.Vector3();

export interface AnimatedWalker {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  waypoints: THREE.Vector3[];
  currentSegment: number;
  progress: number;
  speed: number;
  phaseOffset: number;
}

export interface AnimatedBoat {
  group: THREE.Group;
  oar: THREE.Mesh;
  startZ: number;
  endZ: number;
  x: number;
  speed: number;
  direction: 1 | -1;
  phase: number;
}

export interface AnimatedShaduf {
  armGroup: THREE.Group;
  ropeAndBucket: THREE.Group;
  phase: number;
  speed: number;
}

export interface FlameEmitter {
  mesh: THREE.Mesh;
  light?: THREE.PointLight;
  baseScaleY: number;
  baseIntensity: number;
  phase: number;
}

export interface UrukSceneController {
  root: THREE.Group;
  raycastTargets: THREE.Object3D[];
  update: (delta: number, elapsed: number, activityMultiplier: number) => void;
  setSunsetProgress: (progress: number, scene: THREE.Scene, renderer: THREE.WebGLRenderer) => void;
  dispose: () => void;
}

export function buildUrukScene(
  scene: THREE.Scene,
  textures: UrukTextures
): UrukSceneController {
  const root = new THREE.Group();
  scene.add(root);

  const raycastTargets: THREE.Object3D[] = [];
  const walkers: AnimatedWalker[] = [];
  const boats: AnimatedBoat[] = [];
  const shadufs: AnimatedShaduf[] = [];
  const flames: FlameEmitter[] = [];
  const waterUniforms: { uTime: { value: number } }[] = [];

  // Shared PBR Materials
  const brickRepeatWall = textures.mudbrickAlbedo.clone();
  brickRepeatWall.repeat.set(6, 2);
  brickRepeatWall.needsUpdate = true;

  const mudbrickMat = new THREE.MeshStandardMaterial({
    map: textures.mudbrickAlbedo,
    bumpMap: textures.mudbrickBump,
    bumpScale: 0.08,
    roughness: 0.86,
    metalness: 0.04,
  });

  const mudbrickDarkMat = new THREE.MeshStandardMaterial({
    color: 0xb87d52,
    map: textures.mudbrickAlbedo,
    bumpMap: textures.mudbrickBump,
    bumpScale: 0.1,
    roughness: 0.9,
    metalness: 0.03,
  });

  const plasterCreamMat = new THREE.MeshStandardMaterial({
    color: 0xebd9c0,
    bumpMap: textures.mudbrickBump,
    bumpScale: 0.03,
    roughness: 0.78,
    metalness: 0.02,
  });

  const coneMosaicMat = new THREE.MeshStandardMaterial({
    map: textures.coneMosaic,
    roughness: 0.65,
    metalness: 0.08,
  });

  const lapisMat = new THREE.MeshPhysicalMaterial({
    map: textures.lapisGlaze,
    roughness: 0.22,
    metalness: 0.18,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
  });

  const burnishedCopperMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97b38,
    roughness: 0.24,
    metalness: 0.88,
    anisotropy: 0.6,
    clearcoat: 0.3,
  });

  const sacredGoldMat = new THREE.MeshPhysicalMaterial({
    color: 0xffc845,
    roughness: 0.18,
    metalness: 0.94,
    anisotropy: 0.75,
    clearcoat: 0.4,
  });

  const alabasterMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7efe4,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.25,
  });

  const cedarWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c341d,
    roughness: 0.82,
    metalness: 0.05,
  });

  const bitumenMat = new THREE.MeshStandardMaterial({
    color: 0x221d1a,
    roughness: 0.48,
    metalness: 0.12,
  });

  const terracottaPotMat = new THREE.MeshStandardMaterial({
    color: 0xc8643b,
    roughness: 0.62,
    metalness: 0.06,
  });

  const carnelianMat = new THREE.MeshPhysicalMaterial({
    color: 0xd1381e,
    roughness: 0.15,
    metalness: 0.05,
    transmission: 0.6,
    thickness: 0.8,
    ior: 1.54,
    clearcoat: 0.8,
  });

  const awningMat = new THREE.MeshStandardMaterial({
    map: textures.awningStripe,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.48,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  // Helper to add a contact shadow plane beneath hero buildings
  const addContactShadow = (x: number, y: number, z: number, w: number, d: number) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), contactShadowMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, y + 0.03, z);
    root.add(plane);
  };

  // Helper to register clickable landmark proxy box
  const addLandmarkProxy = (
    id: LandmarkId,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number
  ) => {
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(x, y, z);
    proxy.layers.enable(1);
    proxy.userData = { landmarkId: id };
    root.add(proxy);
    raycastTargets.push(proxy);
  };

  // Helper to create a blazing bronze brazier + flame emitter
  const createBrazier = (
    x: number,
    y: number,
    z: number,
    withPointLight = false
  ): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    // Tripod base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.7, 0.9, 8),
      burnishedCopperMat
    );
    base.position.y = 0.45;
    base.castShadow = true;
    g.add(base);

    // Bowl
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.4, 0.45, 12),
      burnishedCopperMat
    );
    bowl.position.y = 1.05;
    bowl.castShadow = true;
    g.add(bowl);

    // Glowing coal bed
    const coals = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff5500 })
    );
    coals.position.y = 1.25;
    g.add(coals);

    // Outer flame cone
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff9911,
      transparent: true,
      opacity: 0.88,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.45, 8), flameMat);
    flame.position.y = 1.9;
    g.add(flame);

    // Inner bright core
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
    );
    core.position.y = -0.15;
    flame.add(core);

    let light: THREE.PointLight | undefined;
    if (withPointLight) {
      light = new THREE.PointLight(0xff7b1a, 18, 28, 1.6);
      light.position.set(0, 2.4, 0);
      g.add(light);
    }

    flames.push({
      mesh: flame,
      light,
      baseScaleY: 1,
      baseIntensity: 18,
      phase: (x * 0.73 + z * 1.19) % (Math.PI * 2),
    });

    return g;
  };

  // ============================================================================
  // 1. LIGHTING RIG & SUNSET SKY DOME
  // ============================================================================
  const hemiLight = new THREE.HemisphereLight(0xffb070, 0x472818, 0.75);
  hemiLight.position.set(0, 120, 0);
  scene.add(hemiLight);

  // Key Directional Light (Setting Sun of Shamash in the West-Southwest)
  const sunLight = new THREE.DirectionalLight(0xff8438, 3.2);
  sunLight.position.set(-135, 42, -55);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  const shadowBounds = 105;
  sunLight.shadow.camera.left = -shadowBounds;
  sunLight.shadow.camera.right = shadowBounds;
  sunLight.shadow.camera.top = shadowBounds;
  sunLight.shadow.camera.bottom = -shadowBounds;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 320;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.025;
  scene.add(sunLight);

  // Cool purple-indigo eastern twilight fill light
  const rimLight = new THREE.DirectionalLight(0x7c68a8, 0.85);
  rimLight.position.set(110, 55, 80);
  scene.add(rimLight);

  // Glowing Solar Orb of Shamash on the Western Horizon
  const sunOrbMat = new THREE.MeshBasicMaterial({
    color: 0xffae42,
    fog: false,
  });
  const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 32), sunOrbMat);
  sunOrb.position.set(-280, 62, -115);
  root.add(sunOrb);

  // Solar Halo
  const sunHaloMat = new THREE.MeshBasicMaterial({
    color: 0xff621a,
    transparent: true,
    opacity: 0.28,
    fog: false,
    depthWrite: false,
  });
  const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(34, 32, 32), sunHaloMat);
  sunOrb.add(sunHalo);

  // ============================================================================
  // 2. EXTENDED MESOPOTAMIAN ALLUVIAL TERRAIN, EUPHRATES & IRRIGATION CANALS
  // ============================================================================
  const terrainGeo = new THREE.PlaneGeometry(520, 520, 160, 160);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const sandColor = new THREE.Color(0xc8935c);
  const fertileColor = new THREE.Color(0x6d783e);
  const canalBankColor = new THREE.Color(0x7d583a);
  const clayPitColor = new THREE.Color(0x915132);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    let y = 0;
    let c = sandColor.clone();

    // 1. Euphrates River Channel on the West (x around -74)
    const distEuphrates = Math.abs(x - (-74 + Math.sin(z * 0.025) * 6));
    // 2. East Main Suburban Irrigation Canal (x around 68)
    const distEastCanal = Math.abs(x - 68);
    // 3. Two Lateral Feeder Irrigation Canals in the Eastern Orchards (z = -18 and z = 20, for x > 54)
    const inFeeder1 = x > 54 && x < 130 && Math.abs(z - -18) < 3.6;
    const inFeeder2 = x > 54 && x < 130 && Math.abs(z - 20) < 3.6;
    // 4. South Moat / Canal branch (z = 74, between x = -74 and x = 68)
    const inSouthCanal = x > -76 && x < 70 && Math.abs(z - 74) < 5.2;

    // 5. Suburban Clay Pits (Глиняные карьеры — Essû) at SW (x: -36..-12, z: 88..108)
    const distClayPit = Math.hypot((x + 24) * 0.8, z - 96);

    if (distEuphrates < 11) {
      y = -2.4 * Math.cos((distEuphrates / 11) * (Math.PI / 2));
      c.copy(canalBankColor);
    } else if (distEastCanal < 5.5 && z > -110 && z < 110) {
      y = -1.8 * Math.cos((distEastCanal / 5.5) * (Math.PI / 2));
      c.copy(canalBankColor);
    } else if (inFeeder1 || inFeeder2 || inSouthCanal) {
      y = -1.45;
      c.copy(canalBankColor);
    } else if (distClayPit < 14) {
      y = -1.6 * Math.cos((distClayPit / 14) * (Math.PI / 2));
      c.copy(clayPitColor);
    } else {
      // Gentle natural dunes in the distant desert perimeter so there are no indoor walls
      const radialDist = Math.hypot(x, z);
      if (radialDist > 125) {
        y =
          Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4.5 +
          Math.sin(x * 0.018 + z * 0.02) * 6.0 * ((radialDist - 125) / 130);
      } else {
        y = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.12;
      }

      // Fertile green irrigation belt around the eastern canals and western memorial grove
      if (
        (x > 52 && x < 126 && z > -65 && z < 65) ||
        (x > -64 && x < -38 && z > -42 && z < 28)
      ) {
        c.lerp(fertileColor, 0.68);
      } else {
        const noise = (Math.sin(x * 0.15) * Math.cos(z * 0.15) + 1) * 0.5;
        c.offsetHSL(0, 0, (noise - 0.5) * 0.05);
      }
    }

    posAttr.setY(i, y);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    bumpMap: textures.mudbrickBump,
    bumpScale: 0.04,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  root.add(terrainMesh);

  // Animated Water Surface with Custom Vertex/Fragment Wave Extension
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e5c70,
    roughness: 0.14,
    metalness: 0.15,
    reflectivity: 0.9,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });

  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    waterUniforms.push(shader.uniforms as unknown as { uTime: { value: number } });
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float wave = sin(transformed.x * 0.6 + uTime * 2.2) * 0.06 + cos(transformed.y * 0.5 + uTime * 1.8) * 0.06;
        transformed.z += wave;
        `
      );
  };

  const waterGeo = new THREE.PlaneGeometry(340, 340, 96, 96);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = -0.55;
  waterMesh.receiveShadow = true;
  root.add(waterMesh);

  // Processional Way & City Street Pavements (offset by >= 0.04 on Y to avoid Z-fighting)
  const processionalTex = textures.pavement.clone();
  processionalTex.repeat.set(2, 18);
  processionalTex.needsUpdate = true;
  const pavementMat = new THREE.MeshStandardMaterial({
    map: processionalTex,
    roughness: 0.75,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  // North-South Grand Processional Avenue from South Gate (z=68) to Eanna Temple (z=-10)
  const mainAvenue = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 92), pavementMat);
  mainAvenue.rotation.x = -Math.PI / 2;
  mainAvenue.position.set(0, 0.14, 34);
  mainAvenue.receiveShadow = true;
  root.add(mainAvenue);

  // East-West Cross Avenue connecting Enkidu's Western Bridge to Market Square & East Canal
  const crossAvenue = new THREE.Mesh(new THREE.PlaneGeometry(132, 6.0), pavementMat);
  crossAvenue.rotation.x = -Math.PI / 2;
  crossAvenue.position.set(6, 0.15, 16);
  crossAvenue.receiveShadow = true;
  root.add(crossAvenue);

  // ============================================================================
  // 3. THE GREAT WALLS OF URUK (Стены Гильгамеша) & LAPIS GATES
  // ============================================================================
  const wallsGroup = new THREE.Group();
  root.add(wallsGroup);

  const wallMinX = -42;
  const wallMaxX = 48;
  const wallMinZ = -52;
  const wallMaxZ = 56;
  const wallHeight = 10.5;
  const wallThickness = 4.2;

  const createWallSegment = (
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    hasGate: boolean,
    gateName?: string
  ) => {
    const segGroup = new THREE.Group();
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);

    segGroup.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    segGroup.rotation.y = angle;

    const buildSpan = (zStart: number, zEnd: number) => {
      const spanLen = zEnd - zStart;
      if (spanLen <= 1) return;
      const zCenter = (zStart + zEnd) / 2;

      // 1. Sloped battered foundation (Kisu)
      const kisu = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness + 1.8, 2.2, spanLen),
        mudbrickDarkMat
      );
      kisu.position.set(0, 1.1, zCenter);
      kisu.castShadow = true;
      kisu.receiveShadow = true;
      segGroup.add(kisu);

      // 2. Main mudbrick curtain wall
      const curtain = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, spanLen),
        mudbrickMat
      );
      curtain.position.set(0, wallHeight / 2, zCenter);
      curtain.castShadow = true;
      curtain.receiveShadow = true;
      segGroup.add(curtain);

      // 3. Burnished Copper Upper Frieze (Epic of Gilgamesh: "чей венец подобен меди")
      const copperBand = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness + 0.3, 0.85, spanLen),
        burnishedCopperMat
      );
      copperBand.position.set(0, wallHeight - 0.7, zCenter);
      copperBand.castShadow = true;
      segGroup.add(copperBand);

      // 4. Stepped Crenellations (Merlons) along both outer and inner parapets
      const merlonCount = Math.floor(spanLen / 2.2);
      for (let m = 0; m < merlonCount; m++) {
        const mz = zStart + 1.1 + m * 2.2;
        for (const side of [-1, 1]) {
          const merlon = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 1.35, 1.25),
            mudbrickMat
          );
          merlon.position.set(side * (wallThickness / 2 - 0.35), wallHeight + 0.65, mz);
          merlon.castShadow = true;
          segGroup.add(merlon);
        }
      }

      // 5. Projecting Rectangular Buttress Bastions every ~11m
      const towerCount = Math.max(1, Math.floor(spanLen / 12));
      for (let t = 0; t <= towerCount; t++) {
        const tz = zStart + (t / towerCount) * spanLen;
        const bastion = new THREE.Mesh(
          new THREE.BoxGeometry(wallThickness + 2.4, wallHeight + 2.6, 3.8),
          mudbrickMat
        );
        bastion.position.set(0, (wallHeight + 2.6) / 2, tz);
        bastion.castShadow = true;
        bastion.receiveShadow = true;
        segGroup.add(bastion);

        const bastionCrown = new THREE.Mesh(
          new THREE.BoxGeometry(wallThickness + 2.6, 0.7, 4.0),
          burnishedCopperMat
        );
        bastionCrown.position.set(0, wallHeight + 2.2, tz);
        segGroup.add(bastionCrown);
      }
    };

    if (hasGate) {
      const gateHalfWidth = 5.2;
      buildSpan(-length / 2, -gateHalfWidth);
      buildSpan(gateHalfWidth, length / 2);

      // Monumental Twin Gate Towers clad in Glazed Lapis Lazuli & Copper
      for (const side of [-1, 1]) {
        const gz = side * (gateHalfWidth + 3.2);
        const gateTower = new THREE.Mesh(
          new THREE.BoxGeometry(wallThickness + 4.5, wallHeight + 6.5, 6.4),
          lapisMat
        );
        gateTower.position.set(0, (wallHeight + 6.5) / 2, gz);
        gateTower.castShadow = true;
        gateTower.receiveShadow = true;
        segGroup.add(gateTower);

        // Golden cornice
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(wallThickness + 4.9, 1.1, 6.8),
          sacredGoldMat
        );
        crown.position.set(0, wallHeight + 6.0, gz);
        segGroup.add(crown);

        // Blazing Brazier atop each gate tower
        segGroup.add(createBrazier(0, wallHeight + 6.5, gz, gateName === 'south'));
      }

      // Overhead Lapis Archway Bridge connecting the twin towers
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness + 3.2, 4.5, gateHalfWidth * 2),
        lapisMat
      );
      lintel.position.set(0, wallHeight + 1.8, 0);
      lintel.castShadow = true;
      segGroup.add(lintel);

      // Copper-banded Cedar Portal Leaves (open to let citizens pass)
      for (const side of [-1, 1]) {
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 8.5, 3.6),
          cedarWoodMat
        );
        door.position.set(1.2, 4.25, side * (gateHalfWidth - 0.8));
        door.rotation.y = side * 0.35;
        segGroup.add(door);
      }
    } else {
      buildSpan(-length / 2, length / 2);
    }

    wallsGroup.add(segGroup);
  };

  // South Wall (with Grand Gate of Shamash at x = 0, z = 56)
  createWallSegment(wallMinX, wallMaxZ, wallMaxX, wallMaxZ, true, 'south');
  // North Wall
  createWallSegment(wallMaxX, wallMinZ, wallMinX, wallMinZ, false);
  // East Wall (with Gate to the Irrigation Canals at z = 16)
  createWallSegment(wallMaxX, wallMaxZ, wallMaxX, wallMinZ, true, 'east');
  // West Wall (with Gate to Enkidu's Memorial Bridge at z = 16)
  createWallSegment(wallMinX, wallMinZ, wallMinX, wallMaxZ, true, 'west');

  // Four Monumental Corner Fortresses with Signal Fires
  const corners = [
    [wallMinX, wallMinZ],
    [wallMaxX, wallMinZ],
    [wallMaxX, wallMaxZ],
    [wallMinX, wallMaxZ],
  ];
  corners.forEach(([cx, cz]) => {
    const cornerTower = new THREE.Group();
    cornerTower.position.set(cx, 0, cz);

    const base = new THREE.Mesh(new THREE.BoxGeometry(9.5, 16.5, 9.5), mudbrickMat);
    base.position.y = 8.25;
    base.castShadow = true;
    base.receiveShadow = true;
    cornerTower.add(base);

    const frieze = new THREE.Mesh(
      new THREE.BoxGeometry(9.9, 1.4, 9.9),
      burnishedCopperMat
    );
    frieze.position.y = 15.2;
    cornerTower.add(frieze);

    cornerTower.add(createBrazier(0, 16.5, 0, false));
    wallsGroup.add(cornerTower);
  });

  addLandmarkProxy('walls', 0, 9, wallMaxZ, 36, 18, 12);

  // ============================================================================
  // 4. SACRED PRECINCT OF EANNA & TEMPLE OF INANNA (Храм Инанны — Эанна)
  // ============================================================================
  const templeGroup = new THREE.Group();
  templeGroup.position.set(0, 0, -24);
  root.add(templeGroup);
  addContactShadow(0, 0, -24, 52, 46);

  // 3-Tiered Ziggurat Terrace with Recessed Niches & Cone-Mosaic Friezes
  const tiers = [
    { w: 42, d: 34, h: 7.5, y: 0 },
    { w: 31, d: 25, h: 6.5, y: 7.5 },
    { w: 21, d: 17, h: 5.2, y: 14.0 },
  ];

  tiers.forEach((tier) => {
    // Core terrace mass
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(tier.w, tier.h, tier.d),
      mudbrickMat
    );
    core.position.y = tier.y + tier.h / 2;
    core.castShadow = true;
    core.receiveShadow = true;
    templeGroup.add(core);

    // Polychrome Cone-Mosaic Upper Frieze around each terrace
    const mosaicBand = new THREE.Mesh(
      new THREE.BoxGeometry(tier.w + 0.35, 1.35, tier.d + 0.35),
      coneMosaicMat
    );
    mosaicBand.position.y = tier.y + tier.h - 0.8;
    mosaicBand.castShadow = true;
    templeGroup.add(mosaicBand);

    // Copper coping rim
    const coping = new THREE.Mesh(
      new THREE.BoxGeometry(tier.w + 0.55, 0.35, tier.d + 0.55),
      burnishedCopperMat
    );
    coping.position.y = tier.y + tier.h - 0.05;
    templeGroup.add(coping);

    // Rhythmic Sumerian Recessed Niche Pilasters along X and Z faces
    const pilasterCountX = Math.floor(tier.w / 3.2);
    for (let p = 0; p < pilasterCountX; p++) {
      const px = -tier.w / 2 + 1.6 + p * 3.2;
      if (Math.abs(px) < 4.5) continue; // Leave room for central stairs
      for (const side of [-1, 1]) {
        const pilaster = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, tier.h - 1.2, 0.7),
          mudbrickDarkMat
        );
        pilaster.position.set(px, tier.y + (tier.h - 1.2) / 2, side * (tier.d / 2 + 0.25));
        pilaster.castShadow = true;
        templeGroup.add(pilaster);
      }
    }
  });

  // High Sanctuary of Inanna (Жилище Иштар) at the summit (y = 19.2)
  const summitY = 19.2;
  const sanctuaryMain = new THREE.Mesh(
    new THREE.BoxGeometry(13.5, 6.8, 10.5),
    plasterCreamMat
  );
  sanctuaryMain.position.set(0, summitY + 3.4, 0);
  sanctuaryMain.castShadow = true;
  sanctuaryMain.receiveShadow = true;
  templeGroup.add(sanctuaryMain);

  // Glazed Lapis Lazuli Cella Portal & Sacred Star Frieze
  const cellaFacade = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 6.2, 1.2),
    lapisMat
  );
  cellaFacade.position.set(0, summitY + 3.1, 5.1);
  cellaFacade.castShadow = true;
  templeGroup.add(cellaFacade);

  // Cedar Sanctuary Doors sheathed in Gold & Copper
  const sanctuaryDoor = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 4.4, 1.35),
    cedarWoodMat
  );
  sanctuaryDoor.position.set(0, summitY + 2.2, 5.15);
  templeGroup.add(sanctuaryDoor);

  // Golden Sun & Eight-Pointed Star Emblem of Inanna above the Sanctuary
  const starDisk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.35, 16),
    sacredGoldMat
  );
  starDisk.rotation.x = Math.PI / 2;
  starDisk.position.set(0, summitY + 7.6, 5.1);
  starDisk.castShadow = true;
  templeGroup.add(starDisk);

  // Cone-Mosaic Colonnade Pillars on the Sanctuary Porch
  for (const cx of [-4.6, -2.4, 2.4, 4.6]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.65, 6.6, 16),
      coneMosaicMat
    );
    col.position.set(cx, summitY + 3.3, 5.5);
    col.castShadow = true;
    templeGroup.add(col);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.6, 0.55, 16),
      sacredGoldMat
    );
    cap.position.set(cx, summitY + 6.5, 5.5);
    templeGroup.add(cap);
  }

  // Twin Sacred Ring-Post Standards of Inanna (Штандарты Инанны с кольцом и лентой)
  for (const side of [-1, 1]) {
    const stdGroup = new THREE.Group();
    stdGroup.position.set(side * 3.2, summitY, 7.2);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 8.8, 12),
      burnishedCopperMat
    );
    pole.position.y = 4.4;
    pole.castShadow = true;
    stdGroup.add(pole);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.14, 12, 24),
      sacredGoldMat
    );
    ring.position.set(side * 0.85, 7.4, 0);
    stdGroup.add(ring);

    const streamer = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.18),
      sacredGoldMat
    );
    streamer.position.set(side * 1.4, 6.5, 0);
    streamer.rotation.z = -side * 0.45;
    stdGroup.add(streamer);

    templeGroup.add(stdGroup);
  }

  // Monumental Triple Processional Staircase on the South Facade of the Ziggurat
  const stairSteps = 36;
  const stairStartZ = 27.5;
  const stairEndZ = 5.8;
  for (let s = 0; s < stairSteps; s++) {
    const t = s / stairSteps;
    const stepY = t * summitY;
    const stepZ = THREE.MathUtils.lerp(stairStartZ, stairEndZ, t);
    const stepMesh = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.58, 0.85),
      plasterCreamMat
    );
    stepMesh.position.set(0, stepY + 0.29, stepZ);
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    templeGroup.add(stepMesh);
  }

  // Sloped Stair Parapet Walls with Lapis & Copper Capping
  for (const side of [-1, 1]) {
    const rampShape = new THREE.Shape();
    rampShape.moveTo(stairEndZ, 0);
    rampShape.lineTo(stairStartZ, 0);
    rampShape.lineTo(stairStartZ, 1.4);
    rampShape.lineTo(stairEndZ, summitY + 1.4);
    rampShape.closePath();

    const rampGeo = new THREE.ExtrudeGeometry(rampShape, {
      depth: 0.9,
      bevelEnabled: false,
    });
    rampGeo.rotateY(Math.PI / 2);
    const parapet = new THREE.Mesh(rampGeo, mudbrickMat);
    parapet.position.set(side * 3.1 - 0.45, 0, 0);
    parapet.castShadow = true;
    parapet.receiveShadow = true;
    templeGroup.add(parapet);
  }

  // Sacred Braziers at the Temple Forecourt & Summit
  templeGroup.add(createBrazier(-4.2, summitY, 7.6, true));
  templeGroup.add(createBrazier(4.2, summitY, 7.6, false));
  templeGroup.add(createBrazier(-5.2, 0, 28.5, true));
  templeGroup.add(createBrazier(5.2, 0, 28.5, false));

  addLandmarkProxy('inanna_temple', 0, 14, -24, 44, 28, 38);

  // ============================================================================
  // 5. BURIAL MONUMENT & CENOTAPH OF ENKIDU (Место захоронения Энкиду — Таблица VIII)
  // ============================================================================
  const enkiduGroup = new THREE.Group();
  enkiduGroup.position.set(-48, 0, -14);
  root.add(enkiduGroup);
  addContactShadow(-48, 0, -14, 24, 24);

  // Stone Causeway Bridge across the Western Gate / Canal Bank
  const memorialBridge = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.9, 5.2),
    alabasterMat
  );
  memorialBridge.position.set(9, 0.45, 30);
  memorialBridge.receiveShadow = true;
  enkiduGroup.add(memorialBridge);

  // 1. Stepped Alabaster & Lapis Lazuli Mausoleum Terrace
  const tombBase1 = new THREE.Mesh(
    new THREE.BoxGeometry(16, 1.6, 16),
    alabasterMat
  );
  tombBase1.position.y = 0.8;
  tombBase1.castShadow = true;
  tombBase1.receiveShadow = true;
  enkiduGroup.add(tombBase1);

  const tombBase2 = new THREE.Mesh(
    new THREE.BoxGeometry(12.4, 1.5, 12.4),
    lapisMat
  );
  tombBase2.position.y = 2.35;
  tombBase2.castShadow = true;
  tombBase2.receiveShadow = true;
  enkiduGroup.add(tombBase2);

  const tombSanctum = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 1.4, 8.8),
    alabasterMat
  );
  tombSanctum.position.y = 3.8;
  tombSanctum.castShadow = true;
  tombSanctum.receiveShadow = true;
  enkiduGroup.add(tombSanctum);

  // 2. Sarcophagus / Cenotaph of Enkidu inlaid with Gold & Lapis Lazuli
  const sarcophagus = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 1.5, 2.1),
    lapisMat
  );
  sarcophagus.position.set(0, 5.25, -0.8);
  sarcophagus.castShadow = true;
  enkiduGroup.add(sarcophagus);

  const sarcophagusLid = new THREE.Mesh(
    new THREE.BoxGeometry(4.1, 0.42, 2.35),
    sacredGoldMat
  );
  sarcophagusLid.position.set(0, 6.15, -0.8);
  sarcophagusLid.castShadow = true;
  enkiduGroup.add(sarcophagusLid);

  // 3. Multi-Part Statue of Enkidu ("Из лазурита твоя грудь, из золота твоё тело")
  const statueGroup = new THREE.Group();
  statueGroup.position.set(0, 4.5, 1.4);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 0.9, 12),
    burnishedCopperMat
  );
  pedestal.position.y = 0.45;
  statueGroup.add(pedestal);

  // Golden robe & legs
  const lowerBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.68, 1.85, 12),
    sacredGoldMat
  );
  lowerBody.position.y = 1.8;
  lowerBody.castShadow = true;
  statueGroup.add(lowerBody);

  // Broad Chest of Lapis Lazuli
  const lapisChest = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 1.25, 0.72),
    lapisMat
  );
  lapisChest.position.y = 3.25;
  lapisChest.castShadow = true;
  statueGroup.add(lapisChest);

  // Golden Head & Beard of Enkidu
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 16, 16),
    sacredGoldMat
  );
  head.position.y = 4.35;
  statueGroup.add(head);

  const beard = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.62, 0.35),
    lapisMat
  );
  beard.position.set(0, 3.98, 0.25);
  statueGroup.add(beard);

  // Horned Crown of Heroism
  const hornRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.09, 8, 16),
    sacredGoldMat
  );
  hornRing.rotation.x = Math.PI / 2;
  hornRing.position.y = 4.65;
  statueGroup.add(hornRing);

  // Raised arms facing the setting Sun of Shamash
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 1.35, 8),
      sacredGoldMat
    );
    arm.position.set(side * 0.85, 3.45, 0.35);
    arm.rotation.x = -Math.PI / 3;
    arm.rotation.z = -side * 0.2;
    statueGroup.add(arm);
  }
  enkiduGroup.add(statueGroup);

  // 4. Four Cedar & Gold Baldachin Columns around the Tomb
  const colOffsets = [
    [-3.4, -3.4],
    [3.4, -3.4],
    [-3.4, 3.4],
    [3.4, 3.4],
  ];
  colOffsets.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.45, 5.4, 12),
      cedarWoodMat
    );
    col.position.set(cx, 7.2, cz);
    col.castShadow = true;
    enkiduGroup.add(col);

    const goldCap = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.45, 1.1),
      sacredGoldMat
    );
    goldCap.position.set(cx, 9.9, cz);
    enkiduGroup.add(goldCap);
  });

  // Baldachin Canopy Roof
  const canopyRoof = new THREE.Mesh(
    new THREE.BoxGeometry(8.2, 0.65, 8.2),
    lapisMat
  );
  canopyRoof.position.y = 10.35;
  canopyRoof.castShadow = true;
  enkiduGroup.add(canopyRoof);

  // 5. Offering Table to Shamash (Carnelian bowls, honey & ghee vessels)
  const altarTable = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.9, 1.2),
    alabasterMat
  );
  altarTable.position.set(0, 4.95, 3.2);
  enkiduGroup.add(altarTable);

  for (const ox of [-0.65, 0, 0.65]) {
    const vessel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.16, 0.42, 12),
      ox === 0 ? sacredGoldMat : carnelianMat
    );
    vessel.position.set(ox, 5.6, 3.2);
    enkiduGroup.add(vessel);
  }

  // Four Eternal Memorial Braziers at the corners of Enkidu's Mausoleum
  enkiduGroup.add(createBrazier(-5.2, 3.1, -5.2, false));
  enkiduGroup.add(createBrazier(5.2, 3.1, -5.2, false));
  enkiduGroup.add(createBrazier(-5.2, 3.1, 5.2, true));
  enkiduGroup.add(createBrazier(5.2, 3.1, 5.2, false));

  // Sacred Mourning Cypress / Lebanon Cedar Trees around Enkidu's Tomb
  const cypressMat = new THREE.MeshStandardMaterial({
    color: 0x284a2a,
    roughness: 0.85,
  });
  const cypressCoords = [
    [-9.5, -8.5],
    [9.5, -8.5],
    [-9.5, 8.5],
    [9.5, 8.5],
    [-11, 0],
    [0, -11],
  ];
  cypressCoords.forEach(([tx, tz]) => {
    const tree = new THREE.Group();
    tree.position.set(tx, 0, tz);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.42, 2.5, 8),
      cedarWoodMat
    );
    trunk.position.y = 1.25;
    tree.add(trunk);
    for (let tier = 0; tier < 3; tier++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.6 - tier * 0.35, 3.8 - tier * 0.5, 10),
        cypressMat
      );
      cone.position.y = 3.2 + tier * 2.1;
      cone.castShadow = true;
      tree.add(cone);
    }
    enkiduGroup.add(tree);
  });

  addLandmarkProxy('enkidu_tomb', -48, 6, -14, 20, 14, 20);

  // ============================================================================
  // 6. MUDBRICK COURTYARD HOUSES (Глиняные дома) & SUBURBAN CLAY PITS (Карьеры)
  // ============================================================================
  const housesGroup = new THREE.Group();
  root.add(housesGroup);

  // LatheGeometry Amphora / Pithos profile reused across houses and markets
  const amphoraPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.18, 0.05),
    new THREE.Vector2(0.36, 0.45),
    new THREE.Vector2(0.32, 0.82),
    new THREE.Vector2(0.16, 1.02),
    new THREE.Vector2(0.24, 1.15),
  ];
  const amphoraGeo = new THREE.LatheGeometry(amphoraPoints, 12);

  const createMudbrickHouse = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    hasSecondStory: boolean,
    hasWindcatcher: boolean,
    rotationY = 0
  ) => {
    const hGroup = new THREE.Group();
    hGroup.position.set(x, 0, z);
    hGroup.rotation.y = rotationY;

    // 1. Main lower adobe block
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      Math.abs(x + z) % 2 === 0 ? mudbrickMat : plasterCreamMat
    );
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    hGroup.add(body);

    // 2. Rooftop mudbrick parapet rim
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.25, 0.55, d + 0.25),
      mudbrickDarkMat
    );
    rim.position.y = h + 0.25;
    hGroup.add(rim);

    // 3. Recessed timber doorway & high ventilation windows
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.1, 0.25),
      cedarWoodMat
    );
    door.position.set(0, 1.05, d / 2 + 0.05);
    hGroup.add(door);

    // 4. Optional Second-Story Tower Room or Rooftop Reed Pergola (Навес)
    if (hasSecondStory) {
      const upperW = w * 0.52;
      const upperD = d * 0.55;
      const upperH = h * 0.68;
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(upperW, upperH, upperD),
        mudbrickMat
      );
      upper.position.set(-w * 0.18, h + upperH / 2, -d * 0.15);
      upper.castShadow = true;
      upper.receiveShadow = true;
      hGroup.add(upper);
    } else {
      // Rooftop reed shade awning on 4 cedar posts
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.58, 0.15, d * 0.58),
        awningMat
      );
      canopy.position.set(0, h + 1.85, 0);
      canopy.castShadow = true;
      hGroup.add(canopy);

      for (const px of [-w * 0.25, w * 0.25]) {
        for (const pz of [-d * 0.25, d * 0.25]) {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 1.85, 6),
            cedarWoodMat
          );
          post.position.set(px, h + 0.92, pz);
          hGroup.add(post);
        }
      }
    }

    // 5. Optional Mesopotamian Windcatcher (Бадгир)
    if (hasWindcatcher) {
      const badgir = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 2.4, 1.5),
        mudbrickDarkMat
      );
      badgir.position.set(w * 0.24, h + 1.2, -d * 0.22);
      badgir.castShadow = true;
      hGroup.add(badgir);
    }

    // 6. Exterior Wooden Roof Ladder
    const ladder = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, h + 0.9, 0.15),
      cedarWoodMat
    );
    ladder.position.set(w / 2 + 0.35, (h + 0.6) / 2, 0);
    ladder.rotation.z = 0.18;
    hGroup.add(ladder);

    // 7. Outdoor Clay Bread Oven (Таннур) & Storage Amphorae
    const tannur = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 1.1, 10, 1, true),
      terracottaPotMat
    );
    tannur.position.set(-w / 2 - 0.85, 0.55, d * 0.25);
    hGroup.add(tannur);

    const pot = new THREE.Mesh(amphoraGeo, terracottaPotMat);
    pot.position.set(w * 0.25, h, d * 0.2);
    hGroup.add(pot);

    housesGroup.add(hGroup);
  };

  // West Residential Quarter (Глиняные дома)
  const houseConfigs = [
    // West Quarter (x from -35 to -8, z from -6 to 44)
    [-33, 4, 7.5, 6.5, 4.4, true, false, 0],
    [-22, 4, 8.2, 6.8, 4.8, false, true, 0],
    [-11, 5, 6.8, 6.0, 4.2, true, true, Math.PI / 2],
    [-34, 26, 8.5, 7.2, 4.6, true, true, 0],
    [-23, 25, 7.2, 6.4, 4.0, false, false, 0],
    [-12, 26, 7.8, 6.6, 5.0, true, false, 0],
    [-33, 37, 7.4, 6.2, 4.3, false, true, Math.PI / 2],
    [-22, 38, 8.6, 7.0, 4.7, true, false, 0],
    [-11, 38, 6.8, 6.4, 4.1, false, true, 0],
    [-32, -14, 7.5, 6.5, 4.5, true, false, 0],
    [-32, -28, 8.0, 7.0, 4.8, false, true, Math.PI / 2],

    // East Craftsmen & Temple Scribes Quarter (x from 12 to 38, z from -36 to 2)
    [28, -28, 8.2, 7.0, 4.8, true, true, 0],
    [37, -26, 6.8, 6.4, 4.2, false, false, Math.PI / 2],
    [27, -14, 7.6, 6.8, 4.5, false, true, 0],
    [37, -13, 7.2, 6.5, 4.9, true, false, 0],
    [15, -4, 7.0, 6.2, 4.3, true, true, 0],
    [27, -3, 8.0, 6.6, 4.6, false, false, 0],
    [38, -2, 7.2, 6.2, 4.2, true, false, Math.PI / 2],

    // South-East Quarter (x from 12 to 38, z from 34 to 45)
    [14, 39, 7.5, 6.5, 4.4, false, true, 0],
    [26, 39, 8.4, 6.8, 4.8, true, false, 0],
    [37, 39, 7.0, 6.2, 4.2, false, true, 0],
  ] as const;

  houseConfigs.forEach(([hx, hz, hw, hd, hh, s2, wc, rot]) => {
    createMudbrickHouse(hx, hz, hw, hd, hh, s2, wc, rot);
  });

  // Suburban Clay Pits (Глиняные карьеры — Essû, Tablet I: "одна сар — глиняные карьеры")
  const clayPitGroup = new THREE.Group();
  clayPitGroup.position.set(-24, -0.8, 94);
  root.add(clayPitGroup);

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const dryingBrick = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.35, 0.65),
        mudbrickDarkMat
      );
      dryingBrick.position.set(-6 + col * 1.6, 0.2, -3 + row * 1.4);
      dryingBrick.castShadow = true;
      clayPitGroup.add(dryingBrick);
    }
  }

  addLandmarkProxy('clay_houses', -23, 5, 25, 28, 12, 28);

  // ============================================================================
  // 7. BUSTLING MARKET SQUARE (Рыночная площадь — Карум)
  // ============================================================================
  const marketGroup = new THREE.Group();
  marketGroup.position.set(22, 0, 20);
  root.add(marketGroup);

  const createMarketStall = (sx: number, sz: number, rotY: number) => {
    const stall = new THREE.Group();
    stall.position.set(sx, 0, sz);
    stall.rotation.y = rotY;

    // 4 Cedar corner posts
    for (const px of [-2.1, 2.1]) {
      for (const pz of [-1.4, 1.4]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8),
          cedarWoodMat
        );
        post.position.set(px, 1.6, pz);
        post.castShadow = true;
        stall.add(post);
      }
    }

    // Sloped Striped Woven Awning
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.14, 3.4),
      awningMat
    );
    roof.position.set(0, 3.2, 0);
    roof.rotation.x = 0.15;
    roof.castShadow = true;
    stall.add(roof);

    // Merchant Counter & Trade Goods (Amphorae, Barley Sacks, Lapis & Copper Ingots)
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.95, 1.2),
      mudbrickMat
    );
    counter.position.set(0, 0.48, -0.3);
    counter.castShadow = true;
    stall.add(counter);

    // Goods on table
    const lapisBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.35, 0.55),
      lapisMat
    );
    lapisBox.position.set(-1.0, 1.12, -0.3);
    stall.add(lapisBox);

    const copperIngot = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.25, 0.5),
      burnishedCopperMat
    );
    copperIngot.position.set(0, 1.08, -0.3);
    stall.add(copperIngot);

    const grainSack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.45, 0.85, 10),
      plasterCreamMat
    );
    grainSack.position.set(1.1, 1.2, -0.3);
    stall.add(grainSack);

    // Cluster of amphorae beside stall
    for (let a = 0; a < 3; a++) {
      const jar = new THREE.Mesh(amphoraGeo, terracottaPotMat);
      jar.position.set(-1.6 + a * 0.65, 0, 1.1);
      jar.castShadow = true;
      stall.add(jar);
    }

    marketGroup.add(stall);
  };

  const stallLocations = [
    [-8, -7, 0.1],
    [0, -7, -0.05],
    [8, -7, 0.08],
    [-8, 5, Math.PI - 0.1],
    [0, 5, Math.PI + 0.05],
    [8, 5, Math.PI - 0.08],
    [13, -1, -Math.PI / 2],
  ];
  stallLocations.forEach(([sx, sz, rot]) => createMarketStall(sx, sz, rot));

  // Central Market Well & Obelisk Scale Marker
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.1, 1.1, 16),
    alabasterMat
  );
  well.position.set(0, 0.55, -1);
  well.castShadow = true;
  marketGroup.add(well);

  addLandmarkProxy('market_square', 22, 4, 20, 26, 10, 22);

  // ============================================================================
  // 8. SUBURBAN IRRIGATION CANALS, SHADUFS, BRIDGES & PALM ORCHARDS
  // ============================================================================
  const canalsGroup = new THREE.Group();
  root.add(canalsGroup);

  // Arched Timber & Mudbrick Footbridges over the East & South Irrigation Canals
  const createCanalBridge = (bx: number, bz: number, rotY: number) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, 0, bz);
    bGroup.rotation.y = rotY;

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(13.5, 0.55, 4.2),
      cedarWoodMat
    );
    deck.position.y = 1.15;
    deck.castShadow = true;
    deck.receiveShadow = true;
    bGroup.add(deck);

    for (const side of [-1, 1]) {
      const abutment = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 2.2, 4.6),
        mudbrickDarkMat
      );
      abutment.position.set(side * 5.8, 0.3, 0);
      bGroup.add(abutment);

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(12.5, 0.85, 0.25),
        cedarWoodMat
      );
      rail.position.set(0, 1.8, side * 1.9);
      bGroup.add(rail);
    }
    canalsGroup.add(bGroup);
  };

  createCanalBridge(68, 16, 0);
  createCanalBridge(0, 74, Math.PI / 2);

  // Working Animated Mesopotamian Shadufs (Водоподъёмные журавли-шадуфы)
  const createShaduf = (sx: number, sz: number, rotY: number) => {
    const sGroup = new THREE.Group();
    sGroup.position.set(sx, 0, sz);
    sGroup.rotation.y = rotY;

    // Mudbrick & timber twin uprights
    for (const side of [-0.45, 0.45]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 3.6, 0.45),
        mudbrickDarkMat
      );
      pillar.position.set(0, 1.8, side);
      pillar.castShadow = true;
      sGroup.add(pillar);
    }

    // Pivoting Lever Arm
    const armGroup = new THREE.Group();
    armGroup.position.set(0, 3.4, 0);
    sGroup.add(armGroup);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 6.8, 8),
      cedarWoodMat
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.x = 0.8;
    beam.castShadow = true;
    armGroup.add(beam);

    // Heavy Clay Counterweight ball at back end
    const counterweight = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 12, 12),
      mudbrickDarkMat
    );
    counterweight.position.x = -2.3;
    armGroup.add(counterweight);

    // Rope & Leather Water Bucket at canal end
    const ropeAndBucket = new THREE.Group();
    ropeAndBucket.position.set(3.9, 0, 0);
    armGroup.add(ropeAndBucket);

    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6),
      plasterCreamMat
    );
    rope.position.y = -1.6;
    ropeAndBucket.add(rope);

    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.22, 0.55, 10),
      terracottaPotMat
    );
    bucket.position.y = -3.2;
    ropeAndBucket.add(bucket);

    shadufs.push({
      armGroup,
      ropeAndBucket,
      phase: (sx + sz) * 0.4,
      speed: 1.35,
    });

    canalsGroup.add(sGroup);
  };

  createShaduf(62.5, -6, 0);
  createShaduf(62.5, 6, 0);
  createShaduf(62.5, 32, 0);
  createShaduf(73.5, -28, Math.PI);
  createShaduf(73.5, 2, Math.PI);

  addLandmarkProxy('canals', 68, 4, -8, 28, 12, 48);

  // ============================================================================
  // 9. INSTANCED DATE PALM ORCHARDS (Финиковые сады — Kirû)
  // ============================================================================
  const palmPositions: [number, number, number][] = [];
  // Eastern Suburban Irrigated Orchards
  for (let px = 54; px <= 112; px += 9.5) {
    for (let pz = -56; pz <= 56; pz += 10.5) {
      if (Math.abs(px - 68) < 7.5) continue;
      if (Math.abs(pz - -18) < 5 || Math.abs(pz - 20) < 5 || Math.abs(pz - 16) < 6) continue;
      const jitterX = Math.sin(pz * 0.7) * 2.2;
      const jitterZ = Math.cos(px * 0.7) * 2.2;
      palmPositions.push([
        px + jitterX,
        pz + jitterZ,
        0.85 + ((Math.abs(px * pz) % 35) / 100),
      ]);
    }
  }
  // Western Euphrates Bank & Inner Sacred Gardens
  const extraPalms: [number, number, number][] = [
    [-60, 28, 1.05],
    [-61, 38, 0.95],
    [-58, 48, 1.1],
    [-60, -36, 1.0],
    [-62, -46, 0.9],
    [-16, -24, 1.0],
    [-16, -12, 0.95],
    [16, -26, 1.05],
    [16, -14, 0.92],
    [-8, 12, 0.9],
    [-8, 28, 1.02],
  ];
  palmPositions.push(...extraPalms);

  const palmCount = palmPositions.length;
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 6.8, 8);
  trunkGeo.translate(0, 3.4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x694226,
    roughness: 0.92,
  });
  const palmTrunksInst = new THREE.InstancedMesh(trunkGeo, trunkMat, palmCount);
  palmTrunksInst.castShadow = true;
  palmTrunksInst.receiveShadow = true;

  // Multi-frond crown geometry (6 arched fronds per crown using InstancedMesh)
  const frondGeo = new THREE.ConeGeometry(0.85, 3.9, 5);
  frondGeo.rotateX(Math.PI / 2.3);
  frondGeo.translate(0, 6.7, 1.5);
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x4b6e2c,
    roughness: 0.78,
  });
  const frondCount = palmCount * 6;
  const palmFrondsInst = new THREE.InstancedMesh(frondGeo, frondMat, frondCount);
  palmFrondsInst.castShadow = true;

  palmPositions.forEach(([px, pz, scale], idx) => {
    _dummy.position.set(px, 0, pz);
    _dummy.rotation.set(0.05 * Math.sin(idx), idx * 1.1, 0.04 * Math.cos(idx));
    _dummy.scale.setScalar(scale);
    _dummy.updateMatrix();
    palmTrunksInst.setMatrixAt(idx, _dummy.matrix);

    // Subtle color variation per tree
    _color.setHex(0x694226).offsetHSL(0, 0, ((idx % 5) - 2) * 0.02);
    palmTrunksInst.setColorAt(idx, _color);

    for (let f = 0; f < 6; f++) {
      const fIdx = idx * 6 + f;
      _dummy.position.set(px, 0, pz);
      _dummy.rotation.set(0, idx * 0.5 + (f * Math.PI) / 3, 0);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      palmFrondsInst.setMatrixAt(fIdx, _dummy.matrix);

      _color.setHex(0x4b6e2c).offsetHSL(((idx % 3) - 1) * 0.02, 0, ((f % 3) - 1) * 0.03);
      palmFrondsInst.setColorAt(fIdx, _color);
    }
  });

  palmTrunksInst.instanceMatrix.needsUpdate = true;
  if (palmTrunksInst.instanceColor) palmTrunksInst.instanceColor.needsUpdate = true;
  palmTrunksInst.computeBoundingSphere();

  palmFrondsInst.instanceMatrix.needsUpdate = true;
  if (palmFrondsInst.instanceColor) palmFrondsInst.instanceColor.needsUpdate = true;
  palmFrondsInst.computeBoundingSphere();

  root.add(palmTrunksInst);
  root.add(palmFrondsInst);

  // ============================================================================
  // 10. ANIMATED REED BOATS (Лодки магур — ma₂-gur₈) ON EUPHRATES & CANALS
  // ============================================================================
  const createReedBoat = (
    x: number,
    startZ: number,
    endZ: number,
    speed: number,
    direction: 1 | -1
  ) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(x, -0.45, startZ);
    if (direction === -1) bGroup.rotation.y = Math.PI;

    // Bitumen-coated bundled reed hull
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.5, 4.6),
      bitumenMat
    );
    hull.position.y = 0.25;
    hull.castShadow = true;
    bGroup.add(hull);

    // High Curved Mesopotamian Crescent Prow & Stern
    for (const end of [-1, 1]) {
      const prow = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 1.9, 8),
         awningMat
      );
      prow.position.set(0, 0.95, end * 2.45);
      prow.rotation.x = end * 0.35;
      bGroup.add(prow);
    }

    // Cargo of clay amphorae & copper
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.65, 1.6),
      terracottaPotMat
    );
    cargo.position.set(0, 0.65, 0.3);
    bGroup.add(cargo);

    // Boatman (Ур-Шанаби / Лодочник)
    const boatman = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.75, 4, 8),
      plasterCreamMat
    );
    boatman.position.set(0, 0.95, -1.1);
    bGroup.add(boatman);

    // Steering Oar
    const oar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.08, 2.8, 6),
      cedarWoodMat
    );
    oar.position.set(0.55, 0.75, -1.4);
    oar.rotation.z = 0.55;
    bGroup.add(oar);

    root.add(bGroup);
    boats.push({
      group: bGroup,
      oar,
      startZ,
      endZ,
      x,
      speed,
      direction,
      phase: Math.abs(startZ),
    });
  };

  // Boats on the Euphrates River (x = -74) and East Irrigation Canal (x = 68)
  createReedBoat(-74, -85, 85, 4.2, 1);
  createReedBoat(-71, 75, -85, 3.6, -1);
  createReedBoat(-75, -20, 90, 3.9, 1);
  createReedBoat(68, -75, 75, 3.2, 1);
  createReedBoat(67, 65, -75, 2.9, -1);

  // ============================================================================
  // 11. ANIMATED CITIZENS, PRIESTS, MERCHANTS & GUARDS ON LIVELY STREETS
  // ============================================================================
  const tunicMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xf2e3c6, roughness: 0.85 }), // Unbleached wool kaunakes
    new THREE.MeshStandardMaterial({ color: 0xb83b2a, roughness: 0.82 }), // Madder crimson
    new THREE.MeshStandardMaterial({ color: 0xd99b26, roughness: 0.82 }), // Saffron ochre
    new THREE.MeshStandardMaterial({ color: 0x29527a, roughness: 0.82 }), // Indigo priest robe
    new THREE.MeshStandardMaterial({ color: 0x8c583a, roughness: 0.88 }), // Craftsman tunic
  ];
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc68652,
    roughness: 0.75,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1c1613,
    roughness: 0.9,
  });

  const createCitizenWalker = (
    waypoints: THREE.Vector3[],
    startSeg: number,
    startProg: number,
    speed: number,
    roleIndex: number,
    carriesJar: boolean
  ) => {
    const wGroup = new THREE.Group();
    const tunicMat = tunicMaterials[roleIndex % tunicMaterials.length];

    // Torso (Kaunakes pleated garment)
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.32, 0.92, 8),
      tunicMat
    );
    torso.position.y = 0.92;
    torso.castShadow = true;
    wGroup.add(torso);

    // Head & Mesopotamian braided hair/beard
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skinMat);
    head.position.y = 1.55;
    wGroup.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), hairMat);
    hair.position.set(0, 1.6, -0.04);
    wGroup.add(hair);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.55, 6);
    legGeo.translate(0, -0.27, 0);
    const leftLeg = new THREE.Mesh(legGeo, skinMat);
    leftLeg.position.set(-0.1, 0.52, 0);
    wGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, skinMat);
    rightLeg.position.set(0.1, 0.52, 0);
    wGroup.add(rightLeg);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.52, 6);
    armGeo.translate(0, -0.24, 0);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.28, 1.32, 0);
    wGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.28, 1.32, 0);
    wGroup.add(rightArm);

    // Optional water jar or offering vessel carried on shoulder
    if (carriesJar) {
      const jar = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        terracottaPotMat
      );
      jar.position.set(0.28, 1.62, 0.08);
      wGroup.add(jar);
    }

    root.add(wGroup);
    walkers.push({
      group: wGroup,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      waypoints,
      currentSegment: startSeg % waypoints.length,
      progress: startProg,
      speed,
      phaseOffset: Math.random() * Math.PI * 2,
    });
  };

  // Street Routes for Lively Crowds
  const routes: THREE.Vector3[][] = [
    // Route 1: Grand Processional Way (South Gate <-> Temple Forecourt)
    [
      new THREE.Vector3(-1.5, 0.15, 68),
      new THREE.Vector3(-1.5, 0.15, 36),
      new THREE.Vector3(-1.5, 0.15, 6),
      new THREE.Vector3(1.5, 0.15, 6),
      new THREE.Vector3(1.5, 0.15, 36),
      new THREE.Vector3(1.5, 0.15, 68),
    ],
    // Route 2: Market Square Loop (Карум)
    [
      new THREE.Vector3(8, 0.15, 16),
      new THREE.Vector3(31, 0.15, 16),
      new THREE.Vector3(31, 0.15, 23),
      new THREE.Vector3(12, 0.15, 23),
    ],
    // Route 3: East-West Avenue (West Residential Quarter -> Market -> East Canal Bridge)
    [
      new THREE.Vector3(-36, 0.15, 16),
      new THREE.Vector3(0, 0.15, 16),
      new THREE.Vector3(44, 0.15, 16),
      new THREE.Vector3(73, 1.4, 16),
      new THREE.Vector3(44, 0.15, 16),
      new THREE.Vector3(0, 0.15, 16),
    ],
    // Route 4: West Mudbrick Houses Alleyway
    [
      new THREE.Vector3(-17, 0.15, -2),
      new THREE.Vector3(-17, 0.15, 42),
      new THREE.Vector3(-28, 0.15, 42),
      new THREE.Vector3(-28, 0.15, -2),
    ],
    // Route 5: Pilgrims Visiting Enkidu's Tomb
    [
      new THREE.Vector3(-38, 0.15, 16),
      new THREE.Vector3(-42, 0.15, -4),
      new THREE.Vector3(-42, 0.15, -22),
      new THREE.Vector3(-42, 0.15, -4),
    ],
    // Route 6: Royal Guards Patrolling the Top of Gilgamesh's South Wall
    [
      new THREE.Vector3(-36, 10.5, 56),
      new THREE.Vector3(-9, 10.5, 56),
      new THREE.Vector3(-36, 10.5, 56),
    ],
    // Route 7: Royal Guards Patrolling the East Wall
    [
      new THREE.Vector3(48, 10.5, -42),
      new THREE.Vector3(48, 10.5, 6),
      new THREE.Vector3(48, 10.5, -42),
    ],
  ];

  // Populate 68 lively citizens across the routes
  routes.forEach((route, rIdx) => {
    const countOnRoute = rIdx < 3 ? 15 : 6;
    for (let i = 0; i < countOnRoute; i++) {
      createCitizenWalker(
        route,
        i % route.length,
        (i / countOnRoute) % 1,
        1.6 + (i % 4) * 0.32,
        i + rIdx,
        i % 3 === 0
      );
    }
  });

  // ============================================================================
  // 12. GOLDEN SUNSET DUST MOTES & EMBER PARTICLES
  // ============================================================================
  const particleCount = 260;
  const particleGeo = new THREE.BufferGeometry();
  const pPositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    pPositions[i * 3] = (Math.random() - 0.5) * 160;
    pPositions[i * 3 + 1] = 1.5 + Math.random() * 34;
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 160;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xffcf70,
    size: 0.45,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const dustParticles = new THREE.Points(particleGeo, particleMat);
  root.add(dustParticles);

  // ============================================================================
  // 13. DYNAMIC SUNSET LIGHTING CONTROLLER & PER-FRAME ANIMATION TICK
  // ============================================================================
  const setSunsetProgress = (
    progress: number,
    targetScene: THREE.Scene,
    renderer: THREE.WebGLRenderer
  ) => {
    // progress: 0 = Golden Late Afternoon, 0.5 = Epic Crimson Sunset, 1.0 = Deep Bronze Dusk of Shamash
    const t = THREE.MathUtils.clamp(progress, 0, 1);

    // Elevation angle drops from 26 deg to 5 deg
    const elevation = THREE.MathUtils.lerp(0.45, 0.09, t);
    const azimuth = THREE.MathUtils.lerp(-2.65, -2.85, t);
    const dist = 160;

    sunLight.position.set(
      Math.cos(elevation) * Math.sin(azimuth) * dist,
      Math.sin(elevation) * dist,
      Math.cos(elevation) * Math.cos(azimuth) * dist
    );

    sunOrb.position.set(
      sunLight.position.x * 1.85,
      Math.max(9, sunLight.position.y * 1.45),
      sunLight.position.z * 1.85
    );

    // Interpolate sun color (Golden -> Deep Fiery Amber -> Crimson Dusk)
    const sunCol = new THREE.Color().setHSL(
      THREE.MathUtils.lerp(0.085, 0.025, t),
      0.95,
      THREE.MathUtils.lerp(0.64, 0.46, t)
    );
    sunLight.color.copy(sunCol);
    sunLight.intensity = THREE.MathUtils.lerp(3.6, 2.1, t);
    sunOrbMat.color.copy(sunCol).offsetHSL(0.01, 0, 0.12);

    // Sky & Fog color interpolation
    const skyCol = new THREE.Color().setHSL(
      THREE.MathUtils.lerp(0.065, 0.015, t),
      THREE.MathUtils.lerp(0.62, 0.52, t),
      THREE.MathUtils.lerp(0.28, 0.11, t)
    );
    targetScene.background = skyCol;
    if (targetScene.fog instanceof THREE.FogExp2) {
      targetScene.fog.color.copy(skyCol);
      targetScene.fog.density = THREE.MathUtils.lerp(0.0028, 0.0038, t);
    }

    hemiLight.color.copy(sunCol).offsetHSL(0.02, -0.15, 0.05);
    hemiLight.intensity = THREE.MathUtils.lerp(0.85, 0.45, t);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.18, 0.98, t);
  };

  // Set initial golden-crimson sunset state
  scene.fog = new THREE.FogExp2(0x471f14, 0.0031);

  const update = (delta: number, elapsed: number, activityMultiplier: number) => {
    const dt = Math.min(delta, 0.1) * activityMultiplier;

    // 1. Update water shader wave time
    for (let i = 0; i < waterUniforms.length; i++) {
      waterUniforms[i].uTime.value = elapsed;
    }

    // 2. Update street walkers along waypoints
    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      const pts = w.waypoints;
      const pA = pts[w.currentSegment];
      const nextIdx = (w.currentSegment + 1) % pts.length;
      const pB = pts[nextIdx];

      const segDist = pA.distanceTo(pB);
      if (segDist > 0.01) {
        w.progress += (w.speed * dt) / segDist;
      }
      if (w.progress >= 1) {
        w.progress -= 1;
        w.currentSegment = nextIdx;
      }

      const curA = pts[w.currentSegment];
      const curB = pts[(w.currentSegment + 1) % pts.length];
      w.group.position.lerpVectors(curA, curB, w.progress);

      // Walking bob & facing direction
      const walkCycle = elapsed * w.speed * 4.2 + w.phaseOffset;
      w.group.position.y += Math.abs(Math.sin(walkCycle)) * 0.06;

      _vec3.subVectors(curB, curA);
      if (_vec3.lengthSq() > 0.0001) {
        w.group.rotation.y = Math.atan2(_vec3.x, _vec3.z);
      }

      // Limb swing
      const swing = Math.sin(walkCycle) * 0.48 * Math.min(1, activityMultiplier);
      w.leftLeg.rotation.x = swing;
      w.rightLeg.rotation.x = -swing;
      w.leftArm.rotation.x = -swing * 0.7;
      w.rightArm.rotation.x = swing * 0.7;
    }

    // 3. Update Reed Boats gliding along canals & Euphrates
    for (let i = 0; i < boats.length; i++) {
      const b = boats[i];
      b.group.position.z += b.speed * b.direction * dt;
      if (b.direction === 1 && b.group.position.z > b.endZ) {
        b.group.position.z = b.startZ;
      } else if (b.direction === -1 && b.group.position.z < b.endZ) {
        b.group.position.z = b.startZ;
      }
      b.group.position.y = -0.45 + Math.sin(elapsed * 2.2 + b.phase) * 0.05;
      b.group.rotation.z = Math.sin(elapsed * 1.6 + b.phase) * 0.035;
      b.oar.rotation.x = Math.sin(elapsed * 3.0 + b.phase) * 0.35;
    }

    // 4. Update Shaduf irrigation water-lifts
    for (let i = 0; i < shadufs.length; i++) {
      const s = shadufs[i];
      const angle = Math.sin(elapsed * s.speed + s.phase) * 0.34;
      s.armGroup.rotation.z = angle;
      // Keep rope & bucket hanging vertically via counter-rotation
      s.ropeAndBucket.rotation.z = -angle;
    }

    // 5. Flicker temple & memorial fire braziers
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      const flicker =
        Math.sin(elapsed * 9.5 + f.phase) * 0.14 +
        Math.cos(elapsed * 15.2 + f.phase) * 0.08;
      f.mesh.scale.set(1 + flicker * 0.4, f.baseScaleY + flicker, 1 + flicker * 0.4);
      if (f.light) {
        f.light.intensity = f.baseIntensity * (1 + flicker * 0.6);
      }
    }

    // 6. Gentle drift of sunset dust motes
    dustParticles.rotation.y = elapsed * 0.015;
  };

  const dispose = () => {
    scene.remove(root);
    scene.remove(hemiLight);
    scene.remove(sunLight);
    scene.remove(rimLight);
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  };

  return {
    root,
    raycastTargets,
    update,
    setSunsetProgress,
    dispose,
  };
}
