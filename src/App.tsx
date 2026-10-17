import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LandmarkId, URUK_LANDMARKS } from './data/urukLore';
import { createUrukTextures } from './scene/textures';
import { buildUrukScene, UrukSceneController } from './scene/buildUrukScene';
import { MesopotamianSoundscape } from './utils/soundscape';
import { ControlDock } from './components/ControlDock';

// Pre-allocated vectors for camera damping and 3D-to-2D pin projection (Zero GC)
const _projVec = new THREE.Vector3();
const _pointer = new THREE.Vector2();

interface ProjectedPin {
  id: LandmarkId;
  label: string;
  x: number;
  y: number;
  visible: boolean;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [activeLandmark, setActiveLandmark] = useState<LandmarkId>('overview');
  const [sunsetProgress, setSunsetProgress] = useState<number>(0.42);
  const [activitySpeed, setActivitySpeed] = useState<number>(1);
  const [showMarkers, setShowMarkers] = useState<boolean>(true);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(false);
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);
  const [showLoreCard, setShowLoreCard] = useState<boolean>(true);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [webglLost, setWebglLost] = useState<boolean>(false);
  const [pins, setPins] = useState<ProjectedPin[]>([]);

  // Mutable refs for animation loop access without re-mounting WebGL
  const stateRef = useRef({
    sunsetProgress: 0.42,
    activitySpeed: 1,
    showMarkers: true,
    autoOrbit: false,
    desiredCamPos: new THREE.Vector3(108, 62, 118),
    desiredTarget: new THREE.Vector3(0, 8, -4),
    isTransitioningCamera: false,
  });

  const sceneControllerRef = useRef<UrukSceneController | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const soundscapeRef = useRef<MesopotamianSoundscape | null>(null);

  const currentLandmarkData = useMemo(
    () => URUK_LANDMARKS.find((l) => l.id === activeLandmark) || URUK_LANDMARKS[0],
    [activeLandmark]
  );

  const handleSelectLandmark = useCallback((id: LandmarkId) => {
    const found = URUK_LANDMARKS.find((l) => l.id === id);
    if (!found) return;
    setActiveLandmark(id);
    setShowLoreCard(true);
    stateRef.current.desiredCamPos.set(...found.cameraPos);
    stateRef.current.desiredTarget.set(...found.cameraTarget);
    stateRef.current.isTransitioningCamera = true;
  }, []);

  const handleChangeSunset = useCallback((val: number) => {
    setSunsetProgress(val);
    stateRef.current.sunsetProgress = val;
    if (sceneControllerRef.current && sceneRef.current && rendererRef.current) {
      sceneControllerRef.current.setSunsetProgress(
        val,
        sceneRef.current,
        rendererRef.current
      );
    }
  }, []);

  const handleChangeActivitySpeed = useCallback((val: number) => {
    setActivitySpeed(val);
    stateRef.current.activitySpeed = val;
  }, []);

  const handleToggleMarkers = useCallback(() => {
    setShowMarkers((prev) => {
      stateRef.current.showMarkers = !prev;
      return !prev;
    });
  }, []);

  const handleToggleAutoOrbit = useCallback(() => {
    setAutoOrbit((prev) => {
      stateRef.current.autoOrbit = !prev;
      return !prev;
    });
  }, []);

  const handleToggleAudio = useCallback(() => {
    if (!soundscapeRef.current) {
      soundscapeRef.current = new MesopotamianSoundscape();
    }
    const nowPlaying = soundscapeRef.current.toggle();
    setAudioPlaying(nowPlaying);
  }, []);

  // Keyboard shortcut 'H' to collapse/expand bottom dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
        setIsDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Initialize Three.js Scene Once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      0.5,
      650
    );
    camera.position.set(108, 62, 118);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    rendererRef.current = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    // WebGL Context Safety Listeners
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => {
      setWebglLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.03; // Never dip below ground
    controls.minDistance = 8;
    controls.maxDistance = 240;
    controls.target.set(0, 8, -4);
    controls.update();

    // Cancel camera preset transition if user manually grabs OrbitControls
    const onControlStart = () => {
      stateRef.current.isTransitioningCamera = false;
    };
    controls.addEventListener('start', onControlStart);

    // Procedural Textures & Uruk 3D World
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const textures = createUrukTextures(maxAnisotropy);
    const urukController = buildUrukScene(scene, textures);
    sceneControllerRef.current = urukController;

    // Set initial sunset state
    urukController.setSunsetProgress(
      stateRef.current.sunsetProgress,
      scene,
      renderer
    );

    // Pre-warm shaders
    renderer.compile(scene, camera);

    // Raycaster restricted to Layer 1 for clickable landmark selection
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const moveDist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (moveDist > 6) return; // Ignore drag gestures

      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(_pointer, camera);
      const hits = raycaster.intersectObjects(urukController.raycastTargets, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData?.landmarkId as LandmarkId | undefined;
        if (hitId) {
          handleSelectLandmark(hitId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Resize listener
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Animation Loop
    const clock = new THREE.Clock();
    let animFrameId = 0;
    let pinUpdateCounter = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth exponential camera preset transition
      if (stateRef.current.isTransitioningCamera) {
        const dampFactor = 3.8;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          stateRef.current.desiredCamPos.x,
          dampFactor,
          delta
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          stateRef.current.desiredCamPos.y,
          dampFactor,
          delta
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          stateRef.current.desiredCamPos.z,
          dampFactor,
          delta
        );

        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          stateRef.current.desiredTarget.x,
          dampFactor,
          delta
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          stateRef.current.desiredTarget.y,
          dampFactor,
          delta
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          stateRef.current.desiredTarget.z,
          dampFactor,
          delta
        );

        if (
          camera.position.distanceToSquared(stateRef.current.desiredCamPos) < 0.25 &&
          controls.target.distanceToSquared(stateRef.current.desiredTarget) < 0.15
        ) {
          stateRef.current.isTransitioningCamera = false;
        }
      }

      controls.autoRotate = stateRef.current.autoOrbit;
      controls.autoRotateSpeed = 0.65;
      controls.update();

      // Update Uruk scene animations (citizens, reed boats, shadufs, flames, water)
      urukController.update(delta, elapsed, stateRef.current.activitySpeed);

      renderer.render(scene, camera);

      // Throttle 2D landmark pin projection to every 3rd frame to avoid React overhead
      pinUpdateCounter++;
      if (pinUpdateCounter % 3 === 0) {
        if (stateRef.current.showMarkers) {
          const w = window.innerWidth;
          const h = window.innerHeight;
          const nextPins: ProjectedPin[] = [];

          for (let i = 1; i < URUK_LANDMARKS.length; i++) {
            const lm = URUK_LANDMARKS[i];
            _projVec.set(lm.worldPos[0], lm.worldPos[1], lm.worldPos[2]);
            _projVec.project(camera);

            const inFrustum = _projVec.z > -1 && _projVec.z < 1;
            const sx = (_projVec.x * 0.5 + 0.5) * w;
            const sy = (-(_projVec.y * 0.5) + 0.5) * h;

            nextPins.push({
              id: lm.id,
              label: lm.shortLabel,
              x: sx,
              y: sy,
              visible: inFrustum && sx > 40 && sx < w - 40 && sy > 60 && sy < h - 90,
            });
          }
          setPins(nextPins);
        } else {
          setPins([]);
        }
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      urukController.dispose();
      textures.dispose();
      renderer.dispose();
      if (soundscapeRef.current) {
        soundscapeRef.current.stop();
      }
    };
  }, [handleSelectLandmark]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#170e09] select-none">
      {/* Dedicated Isolated WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Interactive 3D Landmark Pins projected onto DOM */}
      {showMarkers && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {pins.map(
            (pin) =>
              pin.visible && (
                <button
                  key={pin.id}
                  onClick={() => handleSelectLandmark(pin.id)}
                  style={{
                    transform: `translate3d(${Math.round(pin.x)}px, ${Math.round(pin.y)}px, 0) translate(-50%, -100%)`,
                  }}
                  className={`pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shadow-lg border ${
                    activeLandmark === pin.id
                      ? 'bg-amber-500 text-[#170e09] border-amber-300 font-semibold'
                      : 'bg-[#170e09]/90 text-amber-100 border-amber-400/35 hover:border-amber-300 hover:text-white'
                  }`}
                >
                  {pin.label}
                </button>
              )
          )}
        </div>
      )}

      {/* WebGL Context Lost Fallback */}
      {webglLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#170e09] p-6 text-center">
          <div className="max-w-md border border-amber-500/30 rounded-xl p-6 bg-[#21140d]">
            <h2 className="font-display text-lg font-bold text-amber-200">
              Графический контекст WebGL приостановлен
            </h2>
            <p className="mt-2 text-xs text-amber-100/80 leading-relaxed">
              Браузер временно освободил ресурсы видеокарты. Обновите страницу или
              дождитесь автоматического восстановления сцены Урука.
            </p>
          </div>
        </div>
      )}

      {/* Semantic HUD Overlay & Unified Collapsible Bottom Control Dock */}
      <ControlDock
        activeLandmark={activeLandmark}
        onSelectLandmark={handleSelectLandmark}
        sunsetProgress={sunsetProgress}
        onChangeSunset={handleChangeSunset}
        activitySpeed={activitySpeed}
        onChangeActivitySpeed={handleChangeActivitySpeed}
        showMarkers={showMarkers}
        onToggleMarkers={handleToggleMarkers}
        autoOrbit={autoOrbit}
        onToggleAutoOrbit={handleToggleAutoOrbit}
        audioPlaying={audioPlaying}
        onToggleAudio={handleToggleAudio}
        showLoreCard={showLoreCard}
        onToggleLoreCard={() => setShowLoreCard((prev) => !prev)}
        isDockCollapsed={isDockCollapsed}
        onToggleDockCollapse={() => setIsDockCollapsed((prev) => !prev)}
        currentLandmarkData={currentLandmarkData}
      />
    </div>
  );
}
