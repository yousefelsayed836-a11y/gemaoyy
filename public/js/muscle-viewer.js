import * as THREE from '/vendor/three/build/three.module.min.js';
import { OrbitControls } from '/vendor/three/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '/vendor/three/jsm/loaders/GLTFLoader.js';

const COLOR_ACTIVE = 0x9c2424;

function makeRingTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.filter = 'blur(2px)';
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = size * 0.09;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - ctx.lineWidth, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function initMuscleViewer(container, { glbUrl, hotspots, onSelect }) {
  const ringTexture = makeRingTexture();

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Studio-style lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 4, 3.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc8ff, 0.8);
  fill.position.set(-3, 1.5, -2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffc107, 1.1);
  rim.position.set(0, 3, -4);
  scene.add(rim);

  // Soft circular "studio floor" glow beneath the model
  const floorTex = (() => {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,193,7,0.35)');
    g.addColorStop(1, 'rgba(255,193,7,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  })();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 48),
    new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
  controls.minDistance = 0.05;
  controls.maxDistance = 1;
  controls.target.set(0, 0, 0);
  controls.enablePan = false;

  const group = new THREE.Group();
  scene.add(group);

  const hotspotMeshes = [];
  let modelSize = new THREE.Vector3(0.2, 0.18, 0.04);

  hotspots.forEach((h) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ringTexture,
        color: COLOR_ACTIVE,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending,
      })
    );
    sprite.position.set(h.pos[0], h.pos[1], h.pos[2]);
    const baseScale = h.size || 0.014;
    sprite.scale.setScalar(baseScale);
    sprite.userData.muscle = h.muscle;
    sprite.userData.baseScale = baseScale;
    sprite.userData.active = false;
    group.add(sprite);
    hotspotMeshes.push(sprite);
  });

  const loader = new GLTFLoader();
  loader.load(glbUrl, (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    group.add(model);
    modelSize = box.getSize(new THREE.Vector3());
    fitCamera();
  });

  function fitCamera() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distH = (modelSize.y / 2) / Math.tan(vFov / 2);
    // frame the torso width rather than the full outstretched arm span
    const torsoHalfWidth = 0.038;
    const distW = torsoHalfWidth / Math.tan(hFov / 2);
    const dist = Math.max(distH, distW) * 1.15;
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    controls.update();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    fitCamera();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // raycasting for hotspot clicks
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('pointerdown', () => {
    renderer.domElement.style.cursor = 'grabbing';
    desiredAzimuth = null;
  });
  renderer.domElement.addEventListener('pointerup', () => {
    renderer.domElement.style.cursor = 'grab';
  });
  renderer.domElement.addEventListener('click', (ev) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hotspotMeshes);
    if (hits.length && onSelect) {
      onSelect(hits[0].object.userData.muscle);
    }
  });

  let focusTarget = null; // THREE.Vector3 to ease camera target toward
  let desiredAzimuth = null; // radians: 0 = front view, PI = back view

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const t = now / 1000;

    hotspotMeshes.forEach((s) => {
      if (!s.userData.active) return;
      s.scale.setScalar(s.userData.baseScale);
      s.material.opacity = 0.8 + Math.sin(t * 2.5 + s.position.x * 50) * 0.1;
    });

    if (focusTarget) {
      controls.target.lerp(focusTarget, 0.08);
    }

    if (desiredAzimuth !== null) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      let diff = desiredAzimuth - spherical.theta;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 0.002) {
        spherical.theta = desiredAzimuth;
        desiredAzimuth = null;
      } else {
        spherical.theta += diff * 0.06;
      }
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return {
    highlightMuscle(muscleId) {
      const matches = [];
      hotspotMeshes.forEach((s) => {
        const isMatch = s.userData.muscle === muscleId;
        s.userData.active = isMatch;
        if (!isMatch) {
          s.material.opacity = 0;
          s.scale.setScalar(s.userData.baseScale);
        }
        if (isMatch) matches.push(s.position);
      });
      if (matches.length) {
        const avg = new THREE.Vector3();
        matches.forEach((p) => avg.add(p));
        avg.divideScalar(matches.length);
        focusTarget = avg;
        controls.autoRotate = false;
        desiredAzimuth = avg.z >= 0 ? 0 : Math.PI;
      } else {
        focusTarget = new THREE.Vector3(0, 0, 0);
      }
    },
    clearHighlight() {
      hotspotMeshes.forEach((s) => {
        s.userData.active = false;
        s.material.opacity = 0;
        s.scale.setScalar(s.userData.baseScale);
      });
      focusTarget = new THREE.Vector3(0, 0, 0);
      desiredAzimuth = 0;
      controls.autoRotate = true;
    },
  };
}
