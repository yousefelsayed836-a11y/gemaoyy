// يبني رسم تخطيطي لشكل الجسم بناءً على القياسات، مع تلوين المناطق
// اللي فيها تركيز دهون أكبر بالأحمر والمناطق الأقل بتدرج لون البشرة
function lerpColor(c1, c2, t) {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

const SKIN = [255, 200, 165];
const FAT = [214, 48, 49];

function regionColor(value, allValues) {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const t = max > min ? (value - min) / (max - min) : 0.3;
  return lerpColor(SKIN, FAT, t);
}

function generateBodySvg({ chest, waist, hips, thigh, body_fat }) {
  const avg = (chest + waist + hips + thigh) / 4;
  const scale = 80 / avg;

  // كل ما زادت نسبة الدهون، زاد حجم الجسم بشكل عام
  const roundness = Math.min(Math.max((body_fat - 15) * 0.9, 0), 30);

  const chestHalf = chest * scale / 2 + roundness * 0.6;
  const waistHalf = waist * scale / 2 + roundness;
  const hipsHalf = hips * scale / 2 + roundness * 0.7;

  const chestColor = regionColor(chest, [chest, waist, hips, thigh]);
  const waistColor = regionColor(waist, [chest, waist, hips, thigh]);
  const hipsColor = regionColor(hips, [chest, waist, hips, thigh]);
  const thighColor = regionColor(thigh, [chest, waist, hips, thigh]);

  const cx = 100;
  const shoulderY = 70;
  const waistY = 165;
  const hipY = 248;
  const legBottomY = 400;

  const gap = 6;
  const legWidth = hipsHalf - gap / 2;
  const ankleWidth = legWidth * 0.55;
  const taper = (legWidth - ankleWidth) / 2;

  const leftLegTopX = cx - hipsHalf;
  const leftLegInnerX = cx - gap / 2;
  const rightLegInnerX = cx + gap / 2;
  const rightLegTopX = cx + hipsHalf;

  const armWidth = 16;

  return `
<svg viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg" class="body-svg">
  <defs>
    <linearGradient id="torsoGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${chestColor}" />
      <stop offset="50%" stop-color="${waistColor}" />
      <stop offset="100%" stop-color="${hipsColor}" />
    </linearGradient>
  </defs>

  <!-- الرأس والرقبة -->
  <circle cx="${cx}" cy="32" r="22" fill="rgb(${SKIN.join(',')})" />
  <rect x="${cx - 8}" y="50" width="16" height="20" fill="rgb(${SKIN.join(',')})" />

  <!-- الذراعين -->
  <path d="M ${cx - chestHalf},${shoulderY + 5}
           C ${cx - chestHalf - armWidth},${shoulderY + 40} ${cx - chestHalf - armWidth + 4},${waistY + 30} ${cx - chestHalf - armWidth + 6},${waistY + 50}
           L ${cx - chestHalf + 6},${waistY + 30}
           Z" fill="rgb(${SKIN.join(',')})" />
  <path d="M ${cx + chestHalf},${shoulderY + 5}
           C ${cx + chestHalf + armWidth},${shoulderY + 40} ${cx + chestHalf + armWidth - 4},${waistY + 30} ${cx + chestHalf + armWidth - 6},${waistY + 50}
           L ${cx + chestHalf - 6},${waistY + 30}
           Z" fill="rgb(${SKIN.join(',')})" />

  <!-- الجذع: صدر - بطن - أرداف بتدرج لوني حسب تركيز الدهون -->
  <path d="M ${cx - chestHalf},${shoulderY}
           C ${cx - chestHalf},${shoulderY + 55} ${cx - waistHalf},${waistY - 35} ${cx - waistHalf},${waistY}
           C ${cx - waistHalf},${waistY + 35} ${cx - hipsHalf},${hipY - 35} ${cx - hipsHalf},${hipY}
           L ${cx + hipsHalf},${hipY}
           C ${cx + hipsHalf},${hipY - 35} ${cx + waistHalf},${waistY + 35} ${cx + waistHalf},${waistY}
           C ${cx + waistHalf},${waistY - 35} ${cx + chestHalf},${shoulderY + 55} ${cx + chestHalf},${shoulderY}
           Z" fill="url(#torsoGrad)" />

  <!-- الرجل اليسرى -->
  <path d="M ${leftLegTopX},${hipY}
           L ${leftLegInnerX},${hipY}
           L ${leftLegInnerX - taper},${legBottomY}
           L ${leftLegTopX + taper},${legBottomY}
           Z" fill="${thighColor}" />
  <rect x="${leftLegInnerX - taper - (ankleWidth * 0.4)}" y="${legBottomY}" width="${ankleWidth * 0.8}" height="12" rx="3" fill="#333" />

  <!-- الرجل اليمنى -->
  <path d="M ${rightLegInnerX},${hipY}
           L ${rightLegTopX},${hipY}
           L ${rightLegTopX - taper},${legBottomY}
           L ${rightLegInnerX + taper},${legBottomY}
           Z" fill="${thighColor}" />
  <rect x="${rightLegInnerX + taper - (ankleWidth * 0.4)}" y="${legBottomY}" width="${ankleWidth * 0.8}" height="12" rx="3" fill="#333" />
</svg>`;
}

module.exports = { generateBodySvg };
