import * as THREE from '/vendor/three/three.module.min.js';
import { OBJLoader } from '/vendor/three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from '/vendor/three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';

const SKIN = [0.97, 0.96, 0.94];
const FAT = [214 / 255, 48 / 255, 49 / 255];
const TWO_PI = Math.PI * 2;

function lerpColor(c1, c2, t) {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t
  ];
}

// كل ما زادت قياسات المنطقة بالنسبة للباقي، كل ما اتلونت بالأحمر (تركيز دهون أعلى)
function regionT(value, allValues) {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  return max > min ? (value - min) / (max - min) : 0.3;
}

function colorAt(t, stops) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return lerpColor(a.color, b.color, f);
    }
  }
  return t < stops[0].t ? stops[0].color : stops[stops.length - 1].color;
}

function multiplierAt(t, stops) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return a.m + (b.m - a.m) * f;
    }
  }
  return t < stops[0].t ? stops[0].m : stops[stops.length - 1].m;
}

function loadModel(gender) {
  return new Promise((resolve, reject) => {
    if (gender === 'female') {
      new OBJLoader().load('/models/female.obj', (obj) => {
        // pPlane5 عبارة عن مستوي مرجعي زايد في الملف، لازم نشيله عشان مش جزء من الجسم
        const toRemove = [];
        obj.traverse((c) => { if (c.isMesh && c.name === 'pPlane5') toRemove.push(c); });
        toRemove.forEach((m) => m.parent.remove(m));
        resolve(obj);
      }, undefined, reject);
    } else {
      new FBXLoader().load('/models/male.fbx', (obj) => resolve(obj), undefined, reject);
    }
  });
}

// نحول الموديل لمجموعة شبكات بإحداثيات عالمية ثابتة (هندسة محسوبة بمصفوفة التحويل الكاملة)
// عشان نقدر نطبق التشكيل والألوان بسهولة بدون ما نقلق بخصوص تدرج الـ hierarchy
function flattenToWorld(root) {
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  root.traverse((c) => {
    if (!c.isMesh) return;
    const geo = c.geometry.clone();
    geo.applyMatrix4(c.matrixWorld);
    group.add(new THREE.Mesh(geo));
  });
  return group;
}

function averageRadiusAtBand(group, yMin, range, cx, cz, tCenter, halfWidth) {
  const y0 = yMin + (tCenter - halfWidth) * range;
  const y1 = yMin + (tCenter + halfWidth) * range;
  let sum = 0, count = 0;
  group.children.forEach((mesh) => {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y >= y0 && y <= y1) {
        const x = pos.getX(i), z = pos.getZ(i);
        sum += Math.hypot(x - cx, z - cz);
        count++;
      }
    }
  });
  return count ? sum / count : 1;
}

// تشكيل الجسم حسب القياسات: تكبير/تصغير شعاعي حول المحور الرأسي تبعًا للارتفاع
// وتلوين كل منطقة بتدرج من الأبيض للأحمر حسب نسبة الدهون فيها مقارنة بباقي المناطق
function deformAndColor(group, data) {
  const box = new THREE.Box3().setFromObject(group);
  const yMin = box.min.y, yMax = box.max.y;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const range = Math.max(yMax - yMin, 0.001);

  const heightScale = (data.height || 170) / range;
  const userRadius = (measureCm) => (measureCm / TWO_PI) / heightScale;

  const clampMult = (m) => Math.min(Math.max(m, 0.85), 1.2);

  const thighMult = clampMult(userRadius(data.thigh) / averageRadiusAtBand(group, yMin, range, cx, cz, 0.30, 0.05));
  const hipsMult = clampMult(userRadius(data.hips) / averageRadiusAtBand(group, yMin, range, cx, cz, 0.45, 0.05));
  const waistMult = clampMult(userRadius(data.waist) / averageRadiusAtBand(group, yMin, range, cx, cz, 0.55, 0.05));
  const chestMult = clampMult(userRadius(data.chest) / averageRadiusAtBand(group, yMin, range, cx, cz, 0.72, 0.05));
  const armMult = clampMult(userRadius(data.arm) / averageRadiusAtBand(group, yMin, range, cx, cz, 0.85, 0.05));
  const armShoulderMult = clampMult((chestMult + armMult) / 2);

  const sizeStops = [
    { t: 0.00, m: 1 },
    { t: 0.10, m: 1 },
    { t: 0.20, m: (1 + thighMult) / 2 },
    { t: 0.30, m: thighMult },
    { t: 0.45, m: hipsMult },
    { t: 0.55, m: waistMult },
    { t: 0.72, m: chestMult },
    { t: 0.85, m: armShoulderMult },
    { t: 0.93, m: 1 },
    { t: 1.00, m: 1 }
  ];

  const fatT = (value) => regionT(value, [data.chest, data.waist, data.hips, data.thigh]);
  const thighColor = lerpColor(SKIN, FAT, fatT(data.thigh));
  const hipsColor = lerpColor(SKIN, FAT, fatT(data.hips));
  const waistColor = lerpColor(SKIN, FAT, fatT(data.waist));
  const chestColor = lerpColor(SKIN, FAT, fatT(data.chest));

  const colorStops = [
    { t: 0.00, color: SKIN },
    { t: 0.30, color: thighColor },
    { t: 0.45, color: hipsColor },
    { t: 0.55, color: waistColor },
    { t: 0.72, color: chestColor },
    { t: 0.85, color: chestColor },
    { t: 1.00, color: SKIN }
  ];

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.6, metalness: 0.05 });

  group.children.forEach((mesh) => {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y - yMin) / range;
      const m = multiplierAt(t, sizeStops);
      pos.setX(i, cx + (x - cx) * m);
      pos.setZ(i, cz + (z - cz) * m);

      const c = colorAt(t, colorStops);
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  group.scale.setScalar(heightScale);
}

async function init() {
  const container = document.getElementById('body3d-canvas');
  if (!container || !window.BODY_DATA) return;

  const data = window.BODY_DATA;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, container.clientWidth / container.clientHeight, 0.1, 5000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1a14, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
  keyLight.position.set(80, 120, 150);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-100, 40, -80);
  scene.add(fillLight);

  // إضاءة خلفية خفيفة عشان تفرق الموديل عن الخلفية وتدي عمق
  const rimLight = new THREE.DirectionalLight(0xaad4ff, 0.4);
  rimLight.position.set(0, 60, -150);
  scene.add(rimLight);

  let raw;
  try {
    raw = await loadModel(data.gender === 'female' ? 'female' : 'male');
  } catch (e) {
    container.textContent = '';
    return;
  }

  const body = flattenToWorld(raw);
  deformAndColor(body, data);

  // نوسط الموديل أفقيًا ونوقفه على الأرض بعد التشكيل
  const box = new THREE.Box3().setFromObject(body);
  const center = box.getCenter(new THREE.Vector3());
  body.position.x -= center.x;
  body.position.z -= center.z;
  body.position.y -= box.min.y;
  scene.add(body);

  // نحسب الصندوق المحيط بالموديل عشان نوقف الكاميرا على بعد يناسب طول الجسم
  const fitBox = new THREE.Box3().setFromObject(body);
  const size = fitBox.getSize(new THREE.Vector3());
  const fitCenter = fitBox.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDistance = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.25;

  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = maxDim * 6;
  keyLight.shadow.camera.left = -maxDim;
  keyLight.shadow.camera.right = maxDim;
  keyLight.shadow.camera.top = maxDim;
  keyLight.shadow.camera.bottom = -maxDim;
  keyLight.shadow.camera.updateProjectionMatrix();

  // أرضية شفافة بتستقبل الظل فقط عشان تثبت الموديل بصريًا
  const groundGeo = new THREE.PlaneGeometry(maxDim * 4, maxDim * 4);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = fitBox.min.y;
  ground.receiveShadow = true;
  scene.add(ground);

  camera.position.set(fitCenter.x, fitCenter.y, fitCenter.z + fitDistance);
  camera.lookAt(fitCenter);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = fitDistance * 0.4;
  controls.maxDistance = fitDistance * 2;
  controls.target.copy(fitCenter);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

init();
