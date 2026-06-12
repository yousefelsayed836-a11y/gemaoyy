import * as THREE from '/vendor/three/three.module.min.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';

const SKIN = [1, 200 / 255, 165 / 255];
const FAT = [214 / 255, 48 / 255, 49 / 255];
const UNDERWEAR = [0.55, 0.56, 0.6];
const TWO_PI = Math.PI * 2;
const SEGMENTS = 48;

function lerpColor(c1, c2, t) {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t
  ];
}

// كل ما زادت قياسات المنطقة بالنسبة للباقي، كل ما اتلونت بالأحمر (تركيز دهون أعلى)
function regionColor(value, allValues) {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const t = max > min ? (value - min) / (max - min) : 0.3;
  return lerpColor(SKIN, FAT, t);
}

function colorAt(y, stops) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return lerpColor(a.color, b.color, t);
    }
  }
  return y < stops[0].y ? stops[0].color : stops[stops.length - 1].color;
}

function latheWithGradient(points, stops, segments = SEGMENTS) {
  const geometry = new THREE.LatheGeometry(points, segments);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = colorAt(pos.getY(i), stops);
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function lathe(points, segments = SEGMENTS) {
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();
  return geometry;
}

function shadowMesh(geo, mat) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// كبسولة (سيلندر برأس نص كرة من الجهتين) عشان شكل الأطراف يبقا مستدير وواقعي
function capsuleBetween(topY, bottomY, radius, mat) {
  const span = Math.max(topY - bottomY, 0.1);
  const length = Math.max(span - radius * 2, radius * 0.3);
  const geo = new THREE.CapsuleGeometry(radius, length, 6, 16);
  const mesh = shadowMesh(geo, mat);
  mesh.position.y = (topY + bottomY) / 2;
  return mesh;
}

function buildBody(data) {
  const isFemale = data.gender === 'female';
  const heightScale = (data.height || 170) / 170;

  const chestR = data.chest / TWO_PI;
  const waistR = data.waist / TWO_PI;
  const hipsR = data.hips / TWO_PI;
  const thighR = data.thigh / TWO_PI;
  const armR = data.arm / TWO_PI;

  // كل ما زادت نسبة الدهون، زاد حجم الخصر والحوض والبطن بشكل عام
  const roundness = Math.min(Math.max((data.body_fat - 15) * 0.3, 0), 8);

  const shoulderR = isFemale ? chestR * 0.95 : chestR * 1.15;
  const bustR = isFemale ? chestR * 1.05 : chestR;
  const waistFinal = (isFemale ? waistR * 0.85 : waistR) + roundness;
  const hipsFinal = (isFemale ? hipsR * 1.05 : hipsR * 0.95) + roundness * 0.7;
  const bellyFinal = Math.max(waistFinal, (waistFinal + hipsFinal) / 2 + roundness * 0.4);

  const chestColor = regionColor(data.chest, [data.chest, data.waist, data.hips, data.thigh]);
  const waistColor = regionColor(data.waist, [data.chest, data.waist, data.hips, data.thigh]);
  const hipsColor = regionColor(data.hips, [data.chest, data.waist, data.hips, data.thigh]);
  const thighColor = regionColor(data.thigh, [data.chest, data.waist, data.hips, data.thigh]);

  const torsoHeight = 54 * heightScale;
  const hipY = 0;
  const hipBulgeY = torsoHeight * 0.1;
  const bellyY = torsoHeight * 0.25;
  const waistY = torsoHeight * 0.45;
  const bustY = torsoHeight * 0.8;
  const shoulderY = torsoHeight;
  const neckBaseY = shoulderY + 2 * heightScale;
  const neckY = shoulderY + 6 * heightScale;
  const headR = 9.5 * heightScale;
  const headY = neckY + headR * 0.65;

  const legLength = 78 * heightScale;
  const kneeY = -legLength * 0.47;
  const ankleY = -legLength;

  const armLength = 65 * heightScale;
  const elbowY = shoulderY - armLength * 0.46;
  const wristY = shoulderY - armLength;

  const group = new THREE.Group();

  // الرجلين: نحسب مقاساتهم الأول عشان الجذع يضيق تدريجيًا فوقهم بدون فجوة
  const thighTopR = Math.max(thighR * 1.05, 1);
  const calfR = Math.max(thighR * 0.65, 0.8);
  const legGap = Math.max(thighTopR * 0.25, 1);
  const legCenterX = legGap + thighTopR;
  const legHalfSpan = legCenterX + thighTopR;

  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...thighColor), roughness: 0.6 });
  const footMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const kneeJointGeo = new THREE.SphereGeometry(calfR * 1.05, 20, 20);

  [-1, 1].forEach((side) => {
    const x = side * legCenterX;

    const thigh = capsuleBetween(hipY + thighTopR * 0.3, kneeY, thighTopR, legMat);
    thigh.position.x = x;
    group.add(thigh);

    const calf = capsuleBetween(kneeY, ankleY + calfR, calfR, legMat);
    calf.position.x = x;
    group.add(calf);

    const knee = shadowMesh(kneeJointGeo.clone(), legMat);
    knee.position.set(x, kneeY, 0);
    group.add(knee);

    const foot = shadowMesh(new THREE.BoxGeometry(thighTopR * 1.7, 2.5, thighTopR * 2.6), footMat);
    foot.position.set(x, ankleY - 1, thighTopR * 0.7);
    group.add(foot);
  });

  // الجذع: نكبر الفروق بين الحوض/الخصر/الصدر/الكتف عشان شكل الخصر يبان واضح وواقعي
  const torsoMean = (hipsFinal + waistFinal + bustR + shoulderR) / 4;
  const exaggerate = (r) => torsoMean + (r - torsoMean) * 1.35;

  const hipsV = hipsFinal;
  const bellyV = exaggerate(bellyFinal);
  const waistV = exaggerate(waistFinal);
  const bustV = exaggerate(bustR);
  const shoulderV = exaggerate(shoulderR);

  const torsoStops = [
    { y: hipY, color: hipsColor },
    { y: hipBulgeY, color: hipsColor },
    { y: bellyY, color: lerpColor(hipsColor, waistColor, 0.5) },
    { y: waistY, color: waistColor },
    { y: bustY, color: chestColor },
    { y: shoulderY, color: chestColor },
    { y: neckY, color: SKIN }
  ];
  const torsoPoints = [
    new THREE.Vector2(Math.max(legHalfSpan, 0.5), hipY),
    new THREE.Vector2(Math.max(hipsV, 0.5), hipBulgeY),
    new THREE.Vector2(Math.max(bellyV, 0.5), bellyY),
    new THREE.Vector2(Math.max(waistV, 0.5), waistY),
    new THREE.Vector2(Math.max(bustV, 0.5), bustY),
    new THREE.Vector2(Math.max(shoulderV, 0.5), shoulderY),
    new THREE.Vector2(Math.max(shoulderV * 0.55, 0.5), neckBaseY),
    new THREE.Vector2(Math.max(shoulderV * 0.45, 0.5), neckY)
  ];
  const torsoGeo = latheWithGradient(torsoPoints, torsoStops);
  const torsoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  group.add(shadowMesh(torsoGeo, torsoMat));

  // الملابس الداخلية فوق الحوض بتغطي اتصال الجذع بالرجلين
  const wearTopY = waistY * 0.5;
  const wearBottomY = -legLength * 0.06;
  const wearPoints = [
    new THREE.Vector2(Math.max(legHalfSpan * 1.05, 0.6), wearBottomY),
    new THREE.Vector2(Math.max(hipsV * 1.05, 0.6), hipBulgeY),
    new THREE.Vector2(Math.max((hipsV + waistV) / 2 * 1.03, 0.6), wearTopY)
  ];
  const wearGeo = lathe(wearPoints);
  const wearMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...UNDERWEAR), roughness: 0.85 });
  group.add(shadowMesh(wearGeo, wearMat));

  // الرأس: كورة بيضاوية شوية عشان تبان شكل راس بدل كورة مكتملة
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...SKIN), roughness: 0.6 });
  const headGeo = new THREE.SphereGeometry(headR, 32, 32);
  const head = shadowMesh(headGeo, skinMat);
  head.position.y = headY;
  head.scale.set(0.92, 1.12, 0.96);
  group.add(head);

  // الذراعين بوضعية مفتوحة شوية (A-pose) عشان يبانوا متصلين بالجسم بشكل طبيعي
  const upperArmR = Math.max(armR * 0.95, 1.2);
  const forearmR = Math.max(armR * 0.72, 1);
  const armOffsetX = shoulderV + upperArmR * 0.85;
  const armSpread = THREE.MathUtils.degToRad(10);

  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * armOffsetX, shoulderY - upperArmR * 0.4, 0);
    pivot.rotation.z = -side * armSpread;
    group.add(pivot);

    const upperLen = (shoulderY - elbowY);
    const foreLen = (elbowY - wristY);

    const upperArm = capsuleBetween(0, -upperLen, upperArmR, skinMat);
    pivot.add(upperArm);

    const forearm = capsuleBetween(-upperLen, -upperLen - foreLen, forearmR, skinMat);
    pivot.add(forearm);

    const elbow = shadowMesh(new THREE.SphereGeometry(forearmR * 1.05, 18, 18), skinMat);
    elbow.position.y = -upperLen;
    pivot.add(elbow);

    const shoulderJoint = shadowMesh(new THREE.SphereGeometry(upperArmR * 1.05, 20, 20), skinMat);
    shoulderJoint.position.y = 0;
    pivot.add(shoulderJoint);

    const hand = shadowMesh(new THREE.SphereGeometry(forearmR * 0.95, 16, 16), skinMat);
    hand.position.y = -upperLen - foreLen - forearmR * 0.4;
    pivot.add(hand);
  });

  // نوسط الموديل رأسيًا حوالي منتصف الجذع، ونقلل عمقه شوية عشان يبان أكتر واقعي
  group.position.y = -(shoulderY + ankleY) / 2;
  group.scale.z = 0.85;

  return group;
}

function init() {
  const container = document.getElementById('body3d-canvas');
  if (!container || !window.BODY_DATA) return;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(28, container.clientWidth / container.clientHeight, 0.1, 1000);

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

  const body = buildBody(window.BODY_DATA);
  scene.add(body);

  // نحسب الصندوق المحيط بالموديل عشان نوقف الكاميرا على بعد يناسب طول الجسم
  const box = new THREE.Box3().setFromObject(body);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
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
  ground.position.y = box.min.y;
  ground.receiveShadow = true;
  scene.add(ground);

  camera.position.set(center.x, center.y, center.z + fitDistance);
  camera.lookAt(center);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = fitDistance * 0.4;
  controls.maxDistance = fitDistance * 2;
  controls.target.copy(center);
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
