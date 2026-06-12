import * as THREE from '/vendor/three/three.module.min.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';

const SKIN = [1, 200 / 255, 165 / 255];
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

function latheWithGradient(points, stops, segments = 48) {
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

function lathe(points, segments = 48) {
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();
  return geometry;
}

function buildBody(data) {
  const isFemale = data.gender === 'female';
  const heightScale = (data.height || 170) / 170;

  const chestR = data.chest / TWO_PI;
  const waistR = data.waist / TWO_PI;
  const hipsR = data.hips / TWO_PI;
  const thighR = data.thigh / TWO_PI;
  const armR = data.arm / TWO_PI;

  // كل ما زادت نسبة الدهون، زاد حجم الخصر والحوض بشكل عام
  const roundness = Math.min(Math.max((data.body_fat - 15) * 0.3, 0), 8);

  const shoulderR = isFemale ? chestR * 0.92 : chestR * 1.12;
  const bustR = chestR;
  const waistFinal = (isFemale ? waistR * 0.85 : waistR) + roundness;
  const hipsFinal = (isFemale ? hipsR * 1.05 : hipsR * 0.95) + roundness * 0.7;

  const chestColor = regionColor(data.chest, [data.chest, data.waist, data.hips, data.thigh]);
  const waistColor = regionColor(data.waist, [data.chest, data.waist, data.hips, data.thigh]);
  const hipsColor = regionColor(data.hips, [data.chest, data.waist, data.hips, data.thigh]);
  const thighColor = regionColor(data.thigh, [data.chest, data.waist, data.hips, data.thigh]);

  const torsoHeight = 50 * heightScale;
  const hipY = 0;
  const waistY = torsoHeight * 0.35;
  const bustY = torsoHeight * 0.75;
  const shoulderY = torsoHeight;
  const neckY = shoulderY + 8 * heightScale;
  const headR = 10 * heightScale;
  const headY = neckY + headR * 0.95;

  const legLength = 80 * heightScale;
  const kneeY = -legLength * 0.45;
  const calfY = -legLength * 0.65;
  const ankleY = -legLength;

  const armLength = 65 * heightScale;
  const elbowY = shoulderY - armLength * 0.45;
  const wristY = shoulderY - armLength;

  const group = new THREE.Group();

  // الجذع: كتف - صدر - خصر - حوض - رقبة بتدرج لوني حسب تركيز الدهون
  const torsoStops = [
    { y: hipY, color: hipsColor },
    { y: waistY, color: waistColor },
    { y: bustY, color: chestColor },
    { y: shoulderY, color: chestColor },
    { y: neckY, color: SKIN }
  ];
  const torsoPoints = [
    new THREE.Vector2(Math.max(hipsFinal, 0.5), hipY),
    new THREE.Vector2(Math.max(waistFinal, 0.5), waistY),
    new THREE.Vector2(Math.max(bustR, 0.5), bustY),
    new THREE.Vector2(Math.max(shoulderR, 0.5), shoulderY),
    new THREE.Vector2(Math.max(shoulderR * 0.45, 0.5), neckY)
  ];
  const torsoGeo = latheWithGradient(torsoPoints, torsoStops);
  const torsoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  group.add(torso);

  // الرأس
  const headGeo = new THREE.SphereGeometry(headR, 32, 32);
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...SKIN), roughness: 0.6 });
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = headY;
  group.add(head);

  // الرجلين
  const legTopR = Math.max(hipsFinal * 0.5, 1);
  const legPoints = [
    new THREE.Vector2(legTopR, 0),
    new THREE.Vector2(Math.max(thighR * 1.05, 1), -legLength * 0.15),
    new THREE.Vector2(Math.max(thighR * 0.82, 1), kneeY),
    new THREE.Vector2(Math.max(thighR * 0.88, 1), calfY),
    new THREE.Vector2(Math.max(thighR * 0.55, 1), ankleY)
  ];
  const legGeo = lathe(legPoints);
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...thighColor), roughness: 0.6 });
  const legGap = Math.max(legTopR * 0.35, 1.5);

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-legGap - legTopR, 0, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo.clone(), legMat);
  rightLeg.position.set(legGap + legTopR, 0, 0);
  group.add(rightLeg);

  // الأقدام
  const footGeo = new THREE.BoxGeometry(legTopR * 1.6, 2.5, legTopR * 2.4);
  const footMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const leftFoot = new THREE.Mesh(footGeo, footMat);
  leftFoot.position.set(leftLeg.position.x, ankleY - 1, legTopR * 0.6);
  group.add(leftFoot);
  const rightFoot = new THREE.Mesh(footGeo.clone(), footMat);
  rightFoot.position.set(rightLeg.position.x, ankleY - 1, legTopR * 0.6);
  group.add(rightFoot);

  // الذراعين
  const armPoints = [
    new THREE.Vector2(Math.max(armR * 1.12, 0.5), shoulderY),
    new THREE.Vector2(Math.max(armR, 0.5), elbowY),
    new THREE.Vector2(Math.max(armR * 0.85, 0.5), shoulderY - armLength * 0.9),
    new THREE.Vector2(Math.max(armR * 0.7, 0.5), wristY)
  ];
  const armGeo = lathe(armPoints, 24);
  const armOffsetX = shoulderR + Math.max(armR * 0.7, 1.5);

  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-armOffsetX, 0, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo.clone(), skinMat);
  rightArm.position.set(armOffsetX, 0, 0);
  group.add(rightArm);

  // الكفوف
  const handGeo = new THREE.SphereGeometry(Math.max(armR * 0.75, 1), 16, 16);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.set(-armOffsetX, wristY - armR * 0.5, 0);
  group.add(leftHand);
  const rightHand = new THREE.Mesh(handGeo.clone(), skinMat);
  rightHand.position.set(armOffsetX, wristY - armR * 0.5, 0);
  group.add(rightHand);

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
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(80, 120, 150);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-100, 40, -80);
  scene.add(fillLight);

  const body = buildBody(window.BODY_DATA);
  scene.add(body);

  // نحسب الصندوق المحيط بالموديل عشان نوقف الكاميرا على بعد يناسب طول الجسم
  const box = new THREE.Box3().setFromObject(body);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDistance = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.25;

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
