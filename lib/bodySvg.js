function lerpColor(c1, c2, t) {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

const SKIN = [255, 200, 165];
const FAT = [214, 48, 49];
const SKIN_RGB = `rgb(${SKIN.join(',')})`;

function regionColor(value, allValues) {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const t = max > min ? (value - min) / (max - min) : 0.3;
  return lerpColor(SKIN, FAT, t);
}

function generateBodySvg({ gender, chest, waist, hips, thigh, arm, body_fat }) {
  const isFemale = gender === 'female';
  const avg = (chest + waist + hips + thigh) / 4;
  const scale = 78 / avg;

  // كل ما زادت نسبة الدهون، زاد حجم الجسم بشكل عام
  const roundness = Math.min(Math.max((body_fat - 15) * 0.9, 0), 30);

  const chestHalf = chest * scale / 2 + roundness * 0.6;
  const waistHalf = waist * scale / 2 + roundness;
  const hipsHalf = hips * scale / 2 + roundness * 0.7;
  const armHalf = arm * scale / 2 + roundness * 0.3;

  // الفرق في تناسب الجسم بين الرجل والست: الست خصرها أوضح وحوضها أوسع من كتافها،
  // والرجل كتافه أعرض وخصره أقل وضوحًا
  const shoulderHalf = isFemale ? chestHalf * 0.85 : chestHalf * 1.15;
  const bustHalf = chestHalf;
  const waistFinal = isFemale ? waistHalf * 0.82 : waistHalf;
  const hipsFinal = isFemale ? hipsHalf * 1.03 : hipsHalf * 0.95;

  const chestColor = regionColor(chest, [chest, waist, hips, thigh]);
  const waistColor = regionColor(waist, [chest, waist, hips, thigh]);
  const hipsColor = regionColor(hips, [chest, waist, hips, thigh]);
  const thighColor = regionColor(thigh, [chest, waist, hips, thigh]);

  const cx = 100;
  const headCy = 26;
  const headR = 18;
  const neckTopY = headCy + headR;
  const shoulderY = 60;
  const bustY = 112;
  const waistY = 185;
  const hipY = 255;
  const kneeY = 335;
  const ankleY = 415;
  const armTopY = shoulderY + 8;
  const armBottomY = hipY + 60;

  // الرقبة بشكل شبه منحرف بسيط بين الرأس والكتف
  const neckPath = `
    M ${cx - 7},${neckTopY}
    L ${cx + 7},${neckTopY}
    L ${cx + 10},${shoulderY}
    L ${cx - 10},${shoulderY}
    Z`;

  // الجذع: من الكتف للصدر للخصر للحوض بمنحنيات ناعمة
  const torsoPath = `
    M ${cx - shoulderHalf},${shoulderY}
    C ${cx - shoulderHalf - 2},${shoulderY + 22} ${cx - bustHalf},${bustY - 22} ${cx - bustHalf},${bustY}
    C ${cx - bustHalf},${bustY + 35} ${cx - waistFinal},${waistY - 25} ${cx - waistFinal},${waistY}
    C ${cx - waistFinal},${waistY + 28} ${cx - hipsFinal},${hipY - 28} ${cx - hipsFinal},${hipY}
    L ${cx + hipsFinal},${hipY}
    C ${cx + hipsFinal},${hipY - 28} ${cx + waistFinal},${waistY + 28} ${cx + waistFinal},${waistY}
    C ${cx + waistFinal},${waistY - 25} ${cx + bustHalf},${bustY + 35} ${cx + bustHalf},${bustY}
    C ${cx + bustHalf},${bustY - 22} ${cx + shoulderHalf + 2},${shoulderY + 22} ${cx + shoulderHalf},${shoulderY}
    Z`;

  // كل رجل من الحوض للكاحل مع انحناءة عند الركبة وانتفاخ خفيف عند عضلة الساق
  function buildLeg(sign) {
    const gap = 16;
    const topOuterX = cx + sign * hipsFinal;
    const topInnerX = cx + sign * (gap / 2);
    const topWidth = Math.abs(topInnerX - topOuterX);
    const kneeWidth = topWidth * 0.78;
    const calfWidth = topWidth * 0.82;
    const ankleWidth = topWidth * 0.42;
    const calfY = kneeY + (ankleY - kneeY) * 0.45;

    const kneeOuterX = topInnerX + sign * kneeWidth;
    const kneeInnerX = topInnerX - sign * 1.5;
    const calfOuterX = topInnerX + sign * calfWidth;
    const calfInnerX = topInnerX - sign * 1;
    const ankleOuterX = topInnerX + sign * ankleWidth;
    const ankleInnerX = topInnerX - sign * 2.5;

    const path = `
      M ${topOuterX},${hipY}
      C ${topOuterX},${hipY + 45} ${kneeOuterX + sign * 3},${kneeY - 35} ${kneeOuterX},${kneeY}
      C ${kneeOuterX - sign * 1},${kneeY + 25} ${calfOuterX + sign * 2},${calfY - 15} ${calfOuterX},${calfY}
      C ${calfOuterX - sign * 1},${calfY + 20} ${ankleOuterX + sign * 1},${ankleY - 20} ${ankleOuterX},${ankleY}
      L ${ankleInnerX},${ankleY}
      C ${ankleInnerX},${ankleY - 20} ${calfInnerX},${calfY + 20} ${calfInnerX},${calfY}
      C ${calfInnerX},${calfY - 15} ${kneeInnerX},${kneeY + 25} ${kneeInnerX},${kneeY}
      C ${kneeInnerX},${kneeY - 35} ${topInnerX},${hipY + 45} ${topInnerX},${hipY}
      Z`;

    const ankleMinX = Math.min(ankleOuterX, ankleInnerX);
    const ankleW = Math.abs(ankleOuterX - ankleInnerX);
    return { path, ankleMinX, ankleW };
  }

  // الذراع بتلتصق بالكتف وتنحني عند الكوع وتنتهي عند منتصف الفخد
  function buildArm(sign) {
    const armCenterUpper = cx + sign * (shoulderHalf + armHalf * 0.3);
    const armCenterLower = cx + sign * (shoulderHalf * 0.55);
    const elbowY = armTopY + (armBottomY - armTopY) * 0.55;
    const midUpperY = (armTopY + elbowY) / 2;
    const midLowerY = (elbowY + armBottomY) / 2;

    const outerTopX = armCenterUpper + sign * armHalf;
    const innerTopX = armCenterUpper - sign * armHalf;
    const outerElbowX = armCenterUpper + sign * armHalf * 0.95;
    const innerElbowX = armCenterUpper - sign * armHalf * 0.95;
    const outerBottomX = armCenterLower + sign * armHalf * 0.8;
    const innerBottomX = armCenterLower - sign * armHalf * 0.8;

    const path = `
      M ${outerTopX},${armTopY}
      C ${outerTopX + sign * 1},${midUpperY} ${outerElbowX},${elbowY - 10} ${outerElbowX},${elbowY}
      C ${outerElbowX - sign * 2},${midLowerY} ${outerBottomX},${armBottomY - 15} ${outerBottomX},${armBottomY}
      L ${innerBottomX},${armBottomY}
      C ${innerBottomX},${armBottomY - 15} ${innerElbowX + sign * 2},${midLowerY} ${innerElbowX},${elbowY}
      C ${innerElbowX},${elbowY - 10} ${innerTopX - sign * 1},${midUpperY} ${innerTopX},${armTopY}
      Z`;

    return { path, handCx: armCenterLower };
  }

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  const handRx = armHalf * 0.5;
  const handRy = armHalf * 0.6;
  const handCy = armBottomY + 7;

  return `
<svg viewBox="0 0 200 440" xmlns="http://www.w3.org/2000/svg" class="body-svg">
  <defs>
    <linearGradient id="torsoGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${chestColor}" />
      <stop offset="55%" stop-color="${waistColor}" />
      <stop offset="100%" stop-color="${hipsColor}" />
    </linearGradient>
    <radialGradient id="volumeGrad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <clipPath id="torsoClip"><path d="${torsoPath}" /></clipPath>
    <clipPath id="leftLegClip"><path d="${leftLeg.path}" /></clipPath>
    <clipPath id="rightLegClip"><path d="${rightLeg.path}" /></clipPath>
  </defs>

  <!-- الرجل اليسرى -->
  <path d="${leftLeg.path}" fill="${thighColor}" />
  <rect x="${leftLeg.ankleMinX}" y="${ankleY}" width="${leftLeg.ankleW}" height="12" rx="3" fill="#333" />
  <rect x="${cx - hipsFinal}" y="${hipY}" width="${hipsFinal + 8}" height="${ankleY - hipY}" fill="url(#volumeGrad)" clip-path="url(#leftLegClip)" />

  <!-- الرجل اليمنى -->
  <path d="${rightLeg.path}" fill="${thighColor}" />
  <rect x="${rightLeg.ankleMinX}" y="${ankleY}" width="${rightLeg.ankleW}" height="12" rx="3" fill="#333" />
  <rect x="${cx - 8}" y="${hipY}" width="${hipsFinal + 8}" height="${ankleY - hipY}" fill="url(#volumeGrad)" clip-path="url(#rightLegClip)" />

  <!-- الجذع: كتف - صدر - خصر - حوض بتدرج لوني حسب تركيز الدهون -->
  <path d="${torsoPath}" fill="url(#torsoGrad)" />
  <rect x="${cx - shoulderHalf - 4}" y="${shoulderY}" width="${(shoulderHalf + 4) * 2}" height="${hipY - shoulderY}" fill="url(#volumeGrad)" clip-path="url(#torsoClip)" />

  <!-- الرقبة والرأس -->
  <path d="${neckPath}" fill="${SKIN_RGB}" />
  <circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${SKIN_RGB}" />

  <!-- الذراعين -->
  <path d="${leftArm.path}" fill="${SKIN_RGB}" />
  <path d="${rightArm.path}" fill="${SKIN_RGB}" />
  <ellipse cx="${leftArm.handCx}" cy="${handCy}" rx="${handRx}" ry="${handRy}" fill="${SKIN_RGB}" />
  <ellipse cx="${rightArm.handCx}" cy="${handCy}" rx="${handRx}" ry="${handRy}" fill="${SKIN_RGB}" />
</svg>`;
}

module.exports = { generateBodySvg };
