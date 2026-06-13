import * as THREE from '/vendor/three/three.module.min.js';
import { OBJLoader } from '/vendor/three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from '/vendor/three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from '/vendor/three/examples/jsm/utils/BufferGeometryUtils.js';

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
    let geo = c.geometry.clone();
    geo.applyMatrix4(c.matrixWorld);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    group.add(new THREE.Mesh(geo));
  });
  return group;
}

// نعمل تنعيم (Laplacian) للسطح في منطقة الجذع عشان نشيل تفاصيل العضلات وتبان دهون مترهلة
// بدل عضلات واضحة، بقوة بتزيد مع نسبة الدهون
function smoothTorso(geo, yMin, range, cx, cz, torsoRadius, bodyFat) {
  const index = geo.index;
  const pos = geo.attributes.position;
  if (!index) return;

  const fatFactor = Math.min(Math.max((bodyFat - 14) / 26, 0), 1);
  if (fatFactor <= 0) return;

  const n = pos.count;
  const neighbors = Array.from({ length: n }, () => new Set());
  const idx = index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    neighbors[a].add(b); neighbors[a].add(c);
    neighbors[b].add(a); neighbors[b].add(c);
    neighbors[c].add(a); neighbors[c].add(b);
  }

  const weights = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (pos.getY(i) - yMin) / range;
    // منطقة الجذع (من تحت الصدر لفوق الحوض) هي اللي بتترهل لما الدهون تزيد
    const band = smoothstep((t - 0.42) / 0.1) * (1 - smoothstep((t - 0.78) / 0.08));
    // نمنع التنعيم عن الإيدين/الأكتاف البعيدة عن محور الجذع (تمنع شد الإيدين)
    const dist = Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz);
    const radialGate = 1 - smoothstep((dist / torsoRadius - 1.1) / 0.5);
    weights[i] = fatFactor * band * radialGate * 0.9;
  }

  let cur = Float32Array.from(pos.array);
  const iterations = 15;
  for (let iter = 0; iter < iterations; iter++) {
    const next = Float32Array.from(cur);
    for (let i = 0; i < n; i++) {
      const w = weights[i];
      const nbrs = neighbors[i];
      if (w <= 0 || nbrs.size === 0) continue;
      let sx = 0, sy = 0, sz = 0;
      nbrs.forEach((j) => { sx += cur[j * 3]; sy += cur[j * 3 + 1]; sz += cur[j * 3 + 2]; });
      const cnt = nbrs.size;
      next[i * 3] = cur[i * 3] + (sx / cnt - cur[i * 3]) * w;
      next[i * 3 + 1] = cur[i * 3 + 1] + (sy / cnt - cur[i * 3 + 1]) * w;
      next[i * 3 + 2] = cur[i * 3 + 2] + (sz / cnt - cur[i * 3 + 2]) * w;
    }
    cur = next;
  }

  for (let i = 0; i < n; i++) {
    pos.setXYZ(i, cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
  }
  pos.needsUpdate = true;
}

// محور كل رجل لوحدها عند الكاحل، عشان لما نكبر/نصغر الرجل ميبعدوش عن بعض بشكل غريب
function ankleCentroids(group, yMin, range, cx, cz, tCenter, halfWidth) {
  const y0 = yMin + (tCenter - halfWidth) * range;
  const y1 = yMin + (tCenter + halfWidth) * range;
  const sides = [{ x: 0, z: 0, count: 0 }, { x: 0, z: 0, count: 0 }];
  group.children.forEach((mesh) => {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y >= y0 && y <= y1) {
        const x = pos.getX(i), z = pos.getZ(i);
        const side = x >= cx ? 1 : 0;
        sides[side].x += x;
        sides[side].z += z;
        sides[side].count++;
      }
    }
  });
  return sides.map((s) => (s.count ? { x: s.x / s.count, z: s.z / s.count } : { x: cx, z: cz }));
}

function smoothstep(t) {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

// تشكيل الجسم حسب القياسات: تكبير/تصغير شعاعي حول المحور الرأسي تبعًا للارتفاع
// وتلوين كل منطقة بتدرج من الأبيض للأحمر حسب نسبة الدهون فيها مقارنة بباقي المناطق
function deformAndColor(group, data) {
  const box = new THREE.Box3().setFromObject(group);
  const yMin = box.min.y, yMax = box.max.y;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const range = Math.max(yMax - yMin, 0.001);

  const heightCm = data.height || 170;
  const heightScale = heightCm / range;

  // نسب جسم متوسطة (محيط كنسبة من الطول) عشان نقيس عليها هل القياس ده "تخين" أو "رفيع"
  const isFemale = data.gender === 'female';
  const TYPICAL = isFemale
    ? { chest: 0.56, waist: 0.46, hips: 0.58, thigh: 0.32, arm: 0.16 }
    : { chest: 0.55, waist: 0.48, hips: 0.53, thigh: 0.30, arm: 0.17 };

  const clampMult = (m) => Math.min(Math.max(m, 0.6), 1.7);
  const ratioMult = (measureCm, key) => clampMult(measureCm / (TYPICAL[key] * heightCm));

  const thighMult = ratioMult(data.thigh, 'thigh');
  const hipsMult = ratioMult(data.hips, 'hips');
  const waistMult = ratioMult(data.waist, 'waist');
  const chestMult = ratioMult(data.chest, 'chest');
  const armMult = ratioMult(data.arm, 'arm');
  const armShoulderMult = clampMult((chestMult + armMult) / 2);

  // محور كل رجل لوحده عند الكاحل (t صغير)، عشان التكبير في الفخد ميعمل شكل تنورة غريب
  const legSplitT = 0.45;
  const ankles = ankleCentroids(group, yMin, range, cx, cz, 0.06, 0.04);

  // الكرش: نكبر منطقة البطن شعاعيًا زيادة عن باقي الجذع، بقوة بتزيد مع نسبة الدهون
  const bellyFatFactor = Math.min(Math.max(((data.body_fat || 0) - 14) / 26, 0), 1);
  const bellyBand = (t) => smoothstep((t - 0.38) / 0.08) * (1 - smoothstep((t - 0.62) / 0.1));

  // نصف قطر الجذع التقريبي محسوب من قياس الخصر نفسه (محيط = 2π × نصف القطر)
  // عشان نطبق الكرش بس على الجذع ومنوصلش لإيدين/أكتاف بعيدة عن المحور (تمنع شكل "المخالب")
  const torsoRadius = (data.waist / TWO_PI) * (range / heightCm);
  const bellyGate = (dist) => 1 - smoothstep((dist / torsoRadius - 1.1) / 0.5);

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
    smoothTorso(geo, yMin, range, cx, cz, torsoRadius, data.body_fat || 0);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y - yMin) / range;
      const m = multiplierAt(t, sizeStops);

      let ox = cx, oz = cz;
      if (t < legSplitT) {
        const ankle = x >= cx ? ankles[1] : ankles[0];
        const f = smoothstep(t / legSplitT);
        ox = ankle.x + (cx - ankle.x) * f;
        oz = ankle.z + (cz - ankle.z) * f;
      }
      const dist = Math.hypot(x - ox, z - oz);
      const belly = bellyFatFactor * bellyBand(t) * bellyGate(dist) * 0.6;
      const mBelly = m + belly;
      pos.setX(i, ox + (x - ox) * mBelly);
      pos.setZ(i, oz + (z - oz) * mBelly);
      pos.setY(i, y - belly * range * 0.02);

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
