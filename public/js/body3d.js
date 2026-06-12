import * as THREE from '/vendor/three/three.module.min.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';

const SKIN = [1, 200 / 255, 165 / 255];
const FAT = [214 / 255, 48 / 255, 49 / 255];
const UNDERWEAR = [0.55, 0.56, 0.6];
const TWO_PI = Math.PI * 2;
const SEGMENTS = 64;

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

// نعمل تنعيم لمنحنى الجسم بدل الخطوط المستقيمة بين النقاط، عشان يبقا الشكل أنسيابي وواقعي
function smoothProfile(points, divisions = 6) {
  const curve = new THREE.SplineCurve(points);
  return curve.getPoints(Math.max(points.length * divisions, 32));
}

function latheWithGradient(points, stops, segments = SEGMENTS) {
  const smooth = smoothProfile(points);
  const geometry = new THREE.LatheGeometry(smooth, segments);
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
  const smooth = smoothProfile(points);
  const geometry = new THREE.LatheGeometry(smooth, segments);
  geometry.computeVertexNormals();
  return geometry;
}

function shadowMesh(geo, mat) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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

  const shoulderR = isFemale ? chestR * 0.92 : chestR * 1.12;
  const bustR = isFemale ? chestR * 1.05 : chestR;
  const waistFinal = (isFemale ? waistR * 0.85 : waistR) + roundness;
  const hipsFinal = (isFemale ? hipsR * 1.05 : hipsR * 0.95) + roundness * 0.7;
  const bellyFinal = Math.max(waistFinal, (waistFinal + hipsFinal) / 2 + roundness * 0.4);

  const chestColor = regionColor(data.chest, [data.chest, data.waist, data.hips, data.thigh]);
  const waistColor = regionColor(data.waist, [data.chest, data.waist, data.hips, data.thigh]);
  const hipsColor = regionColor(data.hips, [data.chest, data.waist, data.hips, data.thigh]);
  const thighColor = regionColor(data.thigh, [data.chest, data.waist, data.hips, data.thigh]);

  const torsoHeight = 52 * heightScale;
  const hipY = 0;
  const hipBulgeY = torsoHeight * 0.08;
  const bellyY = torsoHeight * 0.22;
  const waistY = torsoHeight * 0.4;
  const bustY = torsoHeight * 0.78;
  const shoulderY = torsoHeight;
  const neckBaseY = shoulderY + 2.5 * heightScale;
  const neckY = shoulderY + 6 * heightScale;
  const headR = 9.5 * heightScale;
  const headY = neckY + headR * 0.55;

  const legLength = 78 * heightScale;
  const kneeY = -legLength * 0.45;
  const calfY = -legLength * 0.65;
  const ankleY = -legLength;

  const armLength = 65 * heightScale;
  const elbowY = shoulderY - armLength * 0.45;
  const wristY = shoulderY - armLength;

  const group = new THREE.Group();

  // الرجلين: نحسب مقاساتهم الأول عشان الجذع يضيق تدريجيًا فوقهم بدون فجوة
  const legTopR = Math.max(thighR * 1.15, hipsFinal * 0.42, 1);
  const legGap = Math.max(legTopR * 0.16, 0.8);
  const legCenterX = legGap + legTopR;
  const legHalfSpan = legCenterX + legTopR;

  const legPoints = [
    new THREE.Vector2(legTopR, hipY),
    new THREE.Vector2(Math.max(thighR * 1.05, 1), -legLength * 0.15),
    new THREE.Vector2(Math.max(thighR * 0.82, 1), kneeY),
    new THREE.Vector2(Math.max(thighR * 0.88, 1), calfY),
    new THREE.Vector2(Math.max(thighR * 0.55, 1), ankleY)
  ];
  const legGeo = lathe(legPoints);
  const legMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(...thighColor), roughness: 0.55, clearcoat: 0.05, clearcoatRoughness: 0.6
  });

  const leftLeg = shadowMesh(legGeo, legMat);
  leftLeg.position.set(-legCenterX, 0, 0);
  group.add(leftLeg);

  const rightLeg = shadowMesh(legGeo.clone(), legMat);
  rightLeg.position.set(legCenterX, 0, 0);
  group.add(rightLeg);

  // الجذع: حوض - بطن - خصر - صدر - كتف - رقبة بتدرج لوني حسب تركيز الدهون
  // قاعدة الجذع تضيق لتلاقي عرض الرجلين عشان الاتصال يبقا سلس
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
    new THREE.Vector2(Math.max(hipsFinal, 0.5), hipBulgeY),
    new THREE.Vector2(Math.max(bellyFinal, 0.5), bellyY),
    new THREE.Vector2(Math.max(waistFinal, 0.5), waistY),
    new THREE.Vector2(Math.max(bustR, 0.5), bustY),
    new THREE.Vector2(Math.max(shoulderR, 0.5), shoulderY),
    new THREE.Vector2(Math.max(shoulderR * 0.58, 0.5), neckBaseY),
    new THREE.Vector2(Math.max(shoulderR * 0.48, 0.5), neckY)
  ];
  const torsoGeo = latheWithGradient(torsoPoints, torsoStops);
  const torsoMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0.02, clearcoat: 0.05, clearcoatRoughness: 0.6
  });
  group.add(shadowMesh(torsoGeo, torsoMat));

  // الرأس
  const headGeo = new THREE.SphereGeometry(headR, 32, 32);
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(...SKIN), roughness: 0.55, clearcoat: 0.05, clearcoatRoughness: 0.6
  });
  const head = shadowMesh(headGeo, skinMat);
  head.position.y = headY;
  group.add(head);

  // الأقدام
  const footGeo = new THREE.BoxGeometry(legTopR * 1.6, 2.5, legTopR * 2.4);
  const footMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const leftFoot = shadowMesh(footGeo, footMat);
  leftFoot.position.set(leftLeg.position.x, ankleY - 1, legTopR * 0.6);
  group.add(leftFoot);
  const rightFoot = shadowMesh(footGeo.clone(), footMat);
  rightFoot.position.set(rightLeg.position.x, ankleY - 1, legTopR * 0.6);
  group.add(rightFoot);

  // الذراعين
  const armPoints = [
    new THREE.Vector2(Math.max(armR * 1.12, 0.5), shoulderY),
    new THREE.Vector2(Math.max(armR, 0.5), elbowY),
    new THREE.Vector2(Math.max(armR * 0.85, 0.5), shoulderY - armLength * 0.9),
    new THREE.Vector2(Math.max(armR * 0.7, 0.5), wristY)
  ];
  const armGeo = lathe(armPoints, 32);
  const armOffsetX = shoulderR * 0.8 + Math.max(armR * 0.55, 1);

  const leftArm = shadowMesh(armGeo, skinMat);
  leftArm.position.set(-armOffsetX, 0, 0);
  group.add(leftArm);

  const rightArm = shadowMesh(armGeo.clone(), skinMat);
  rightArm.position.set(armOffsetX, 0, 0);
  group.add(rightArm);

  // مفاصل الكتف عشان تربط الذراعين بالجذع بشكل سلس بدون فجوات
  const shoulderJointGeo = new THREE.SphereGeometry(Math.max(armR * 1.25, shoulderR * 0.3, 1.5), 24, 24);
  const leftShoulderJoint = shadowMesh(shoulderJointGeo, skinMat);
  leftShoulderJoint.position.set(-armOffsetX * 0.92, shoulderY - armR * 0.15, 0);
  group.add(leftShoulderJoint);
  const rightShoulderJoint = shadowMesh(shoulderJointGeo.clone(), skinMat);
  rightShoulderJoint.position.set(armOffsetX * 0.92, shoulderY - armR * 0.15, 0);
  group.add(rightShoulderJoint);

  // الكفوف
  const handGeo = new THREE.SphereGeometry(Math.max(armR * 0.75, 1), 16, 16);
  const leftHand = shadowMesh(handGeo, skinMat);
  leftHand.position.set(-armOffsetX, wristY - armR * 0.5, 0);
  group.add(leftHand);
  const rightHand = shadowMesh(handGeo.clone(), skinMat);
  rightHand.position.set(armOffsetX, wristY - armR * 0.5, 0);
  group.add(rightHand);

  // الملابس الداخلية فوق الحوض (شكل واقعي شبيه بصور المسح الجسدي) بتغطي اتصال الجذع بالرجلين
  const wearTopY = waistY * 0.5;
  const wearBottomY = -legLength * 0.1;
  const wearPoints = [
    new THREE.Vector2(Math.max(legHalfSpan * 1.06, 0.6), wearBottomY),
    new THREE.Vector2(Math.max(hipsFinal * 1.06, 0.6), hipBulgeY),
    new THREE.Vector2(Math.max((hipsFinal + waistFinal) / 2 * 1.05, 0.6), wearTopY)
  ];
  const wearGeo = lathe(wearPoints);
  const wearMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...UNDERWEAR), roughness: 0.85 });
  group.add(shadowMesh(wearGeo, wearMat));

  // نوسط الموديل رأسيًا حوالي منتصف الجذع
  group.position.y = -(shoulderY + ankleY) / 2;

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1a14, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(80, 120, 150);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
  fillLight.position.set(-100, 40, -80);
  scene.add(fillLight);

  // إضاءة خلفية خفيفة عشان تفرق الموديل عن الخلفية وتدي عمق
  const rimLight = new THREE.DirectionalLight(0xaad4ff, 0.5);
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
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
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
