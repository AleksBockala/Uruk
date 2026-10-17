import * as THREE from 'three';

export interface UrukTextures {
  mudbrickAlbedo: THREE.CanvasTexture;
  mudbrickBump: THREE.CanvasTexture;
  coneMosaic: THREE.CanvasTexture;
  lapisGlaze: THREE.CanvasTexture;
  pavement: THREE.CanvasTexture;
  awningStripe: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

export function createUrukTextures(maxAnisotropy: number): UrukTextures {
  // 1. Mudbrick Albedo + Bump
  const brickCanvas = document.createElement('canvas');
  brickCanvas.width = 512;
  brickCanvas.height = 512;
  const bCtx = brickCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Base clay mortar
  bCtx.fillStyle = '#9c6b43';
  bCtx.fillRect(0, 0, 512, 512);
  bumpCtx.fillStyle = '#555555';
  bumpCtx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const cols = 8;
  const rowH = 512 / rows;
  const colW = 512 / cols;

  // Deterministic pseudo-random helper
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const y = r * rowH;
      const tone = rand();
      const red = Math.floor(175 + tone * 32);
      const green = Math.floor(116 + tone * 26);
      const blue = Math.floor(72 + tone * 18);

      bCtx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      bCtx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

      // Subtle straw/clay speckles
      bCtx.fillStyle = `rgba(60, 35, 18, 0.14)`;
      for (let s = 0; s < 5; s++) {
        bCtx.fillRect(
          x + 4 + rand() * (colW - 8),
          y + 4 + rand() * (rowH - 8),
          3,
          1.5
        );
      }

      const bVal = Math.floor(180 + tone * 60);
      bumpCtx.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
      bumpCtx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
    }
  }

  const mudbrickAlbedo = new THREE.CanvasTexture(brickCanvas);
  mudbrickAlbedo.colorSpace = THREE.SRGBColorSpace;
  mudbrickAlbedo.wrapS = THREE.RepeatWrapping;
  mudbrickAlbedo.wrapT = THREE.RepeatWrapping;
  mudbrickAlbedo.anisotropy = maxAnisotropy;

  const mudbrickBump = new THREE.CanvasTexture(bumpCanvas);
  mudbrickBump.colorSpace = THREE.NoColorSpace;
  mudbrickBump.wrapS = THREE.RepeatWrapping;
  mudbrickBump.wrapT = THREE.RepeatWrapping;
  mudbrickBump.anisotropy = maxAnisotropy;

  // 2. Uruk Eanna Cone Mosaic Texture (Red Ochre, Cream Limestone, Black Bitumen)
  const mosaicCanvas = document.createElement('canvas');
  mosaicCanvas.width = 512;
  mosaicCanvas.height = 256;
  const mCtx = mosaicCanvas.getContext('2d')!;
  mCtx.fillStyle = '#d8c3a5';
  mCtx.fillRect(0, 0, 512, 256);

  const coneR = 7;
  const stepX = 16;
  const stepY = 16;
  for (let gy = 0; gy < 256 / stepY; gy++) {
    for (let gx = 0; gx < 512 / stepX; gx++) {
      const cx = gx * stepX + stepX * 0.5;
      const cy = gy * stepY + stepY * 0.5;
      // Zigzag chevron pattern characteristic of Eanna columns and friezes
      const chevron = (gx + gy) % 6;
      const band = gy % 8;
      if (band === 0 || band === 7) {
        mCtx.fillStyle = '#231f20'; // Black bitumen cone
      } else if (chevron === 0 || chevron === 1) {
        mCtx.fillStyle = '#a83820'; // Red ochre cone
      } else if (chevron === 3) {
        mCtx.fillStyle = '#231f20'; // Black bitumen cone
      } else {
        mCtx.fillStyle = '#efe2cc'; // Cream limestone cone
      }
      mCtx.beginPath();
      mCtx.arc(cx, cy, coneR, 0, Math.PI * 2);
      mCtx.fill();
    }
  }

  const coneMosaic = new THREE.CanvasTexture(mosaicCanvas);
  coneMosaic.colorSpace = THREE.SRGBColorSpace;
  coneMosaic.wrapS = THREE.RepeatWrapping;
  coneMosaic.wrapT = THREE.RepeatWrapping;
  coneMosaic.anisotropy = maxAnisotropy;

  // 3. Glazed Lapis Lazuli Brick with Golden Star of Inanna
  const lapisCanvas = document.createElement('canvas');
  lapisCanvas.width = 512;
  lapisCanvas.height = 512;
  const lCtx = lapisCanvas.getContext('2d')!;
  lCtx.fillStyle = '#14346b';
  lCtx.fillRect(0, 0, 512, 512);

  // Glazed brick grid
  for (let r = 0; r < 16; r++) {
    const off = (r % 2) * 32;
    for (let c = -1; c <= 8; c++) {
      const t = rand();
      lCtx.fillStyle = `rgb(${18 + Math.floor(t * 16)}, ${52 + Math.floor(t * 24)}, ${112 + Math.floor(t * 35)})`;
      lCtx.fillRect(c * 64 + off + 1.5, r * 32 + 1.5, 61, 29);
    }
  }

  // Golden border bands & 8-pointed Inanna rosettes
  lCtx.fillStyle = '#e5a93c';
  lCtx.fillRect(0, 24, 512, 16);
  lCtx.fillRect(0, 472, 512, 16);

  const drawRosette = (cx: number, cy: number, radius: number) => {
    lCtx.save();
    lCtx.translate(cx, cy);
    for (let i = 0; i < 8; i++) {
      lCtx.rotate(Math.PI / 4);
      lCtx.fillStyle = '#f6c453';
      lCtx.beginPath();
      lCtx.ellipse(0, radius * 0.55, radius * 0.22, radius * 0.48, 0, 0, Math.PI * 2);
      lCtx.fill();
    }
    lCtx.fillStyle = '#fff3d1';
    lCtx.beginPath();
    lCtx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    lCtx.fill();
    lCtx.restore();
  };

  for (let i = 0; i < 4; i++) {
    drawRosette(64 + i * 128, 128, 22);
    drawRosette(64 + i * 128, 384, 22);
  }

  const lapisGlaze = new THREE.CanvasTexture(lapisCanvas);
  lapisGlaze.colorSpace = THREE.SRGBColorSpace;
  lapisGlaze.wrapS = THREE.RepeatWrapping;
  lapisGlaze.wrapT = THREE.RepeatWrapping;
  lapisGlaze.anisotropy = maxAnisotropy;

  // 4. Limestone Processional Pavement Texture
  const paveCanvas = document.createElement('canvas');
  paveCanvas.width = 512;
  paveCanvas.height = 512;
  const pCtx = paveCanvas.getContext('2d')!;
  pCtx.fillStyle = '#b9936c';
  pCtx.fillRect(0, 0, 512, 512);

  for (let r = 0; r < 8; r++) {
    const off = (r % 2) * 32;
    for (let c = -1; c <= 8; c++) {
      const t = rand();
      const v = Math.floor(188 + t * 32);
      pCtx.fillStyle = `rgb(${v}, ${Math.floor(v * 0.84)}, ${Math.floor(v * 0.66)})`;
      pCtx.fillRect(c * 64 + off + 2, r * 64 + 2, 60, 60);
    }
  }
  const pavement = new THREE.CanvasTexture(paveCanvas);
  pavement.colorSpace = THREE.SRGBColorSpace;
  pavement.wrapS = THREE.RepeatWrapping;
  pavement.wrapT = THREE.RepeatWrapping;
  pavement.anisotropy = maxAnisotropy;

  // 5. Woven Market Awning Stripes
  const awningCanvas = document.createElement('canvas');
  awningCanvas.width = 256;
  awningCanvas.height = 256;
  const aCtx = awningCanvas.getContext('2d')!;
  const stripeColors = ['#9e2a2b', '#e09f3e', '#fff3b0', '#335c67', '#b56576', '#e09f3e'];
  const stripeW = 256 / stripeColors.length;
  stripeColors.forEach((col, idx) => {
    aCtx.fillStyle = col;
    aCtx.fillRect(idx * stripeW, 0, stripeW, 256);
  });
  // Subtle weave lines
  aCtx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < 256; y += 4) {
    aCtx.fillRect(0, y, 256, 1.5);
  }

  const awningStripe = new THREE.CanvasTexture(awningCanvas);
  awningStripe.colorSpace = THREE.SRGBColorSpace;
  awningStripe.wrapS = THREE.RepeatWrapping;
  awningStripe.wrapT = THREE.RepeatWrapping;
  awningStripe.anisotropy = maxAnisotropy;

  // 6. Soft Contact Shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(128, 128, 16, 128, 128, 124);
  grad.addColorStop(0, 'rgba(18, 9, 4, 0.65)');
  grad.addColorStop(0.55, 'rgba(18, 9, 4, 0.28)');
  grad.addColorStop(1, 'rgba(18, 9, 4, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);

  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  return {
    mudbrickAlbedo,
    mudbrickBump,
    coneMosaic,
    lapisGlaze,
    pavement,
    awningStripe,
    contactShadow,
    dispose: () => {
      mudbrickAlbedo.dispose();
      mudbrickBump.dispose();
      coneMosaic.dispose();
      lapisGlaze.dispose();
      pavement.dispose();
      awningStripe.dispose();
      contactShadow.dispose();
    },
  };
}
