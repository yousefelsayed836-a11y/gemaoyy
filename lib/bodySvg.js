// يبني رسم تخطيطي بسيط لشكل الجسم بناءً على نسب القياسات
function generateBodySvg({ chest, waist, hips, thigh, gender }) {
  const maxMeasure = Math.max(chest, waist, hips);
  const scale = 90 / maxMeasure;

  const chestHalf = Math.max(chest * scale / 2, 25);
  const waistHalf = Math.max(waist * scale / 2, 20);
  const hipsHalf = Math.max(hips * scale / 2, 25);
  const legWidth = Math.max(thigh * scale * 0.55, 16);

  const cx = 100;
  const shoulderY = 70;
  const chestY = 110;
  const waistY = 200;
  const hipsY = 240;
  const legTopY = 245;
  const legBottomY = 400;
  const ankleWidth = legWidth * 0.55;

  const skinColor = gender === 'female' ? '#ffb38a' : '#ffb38a';
  const clothColor = '#ff5722';

  return `
<svg viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg" class="body-svg">
  <circle cx="${cx}" cy="40" r="22" fill="${skinColor}" />
  <polygon points="
    ${cx - chestHalf},${shoulderY}
    ${cx + chestHalf},${shoulderY}
    ${cx + waistHalf},${waistY}
    ${cx + hipsHalf},${hipsY}
    ${cx - hipsHalf},${hipsY}
    ${cx - waistHalf},${waistY}
  " fill="${clothColor}" opacity="0.9" />

  <rect x="${cx - hipsHalf}" y="${legTopY}" width="${legWidth}" height="${legBottomY - legTopY}"
        rx="10" fill="${skinColor}" />
  <rect x="${cx - hipsHalf + (legWidth - ankleWidth)}" y="${legBottomY}" width="${ankleWidth}" height="14" fill="#333" />

  <rect x="${cx + hipsHalf - legWidth}" y="${legTopY}" width="${legWidth}" height="${legBottomY - legTopY}"
        rx="10" fill="${skinColor}" />
  <rect x="${cx + hipsHalf - legWidth}" y="${legBottomY}" width="${ankleWidth}" height="14" fill="#333" />

  <rect x="${cx - chestHalf - 14}" y="${shoulderY + 5}" width="14" height="100" rx="7" fill="${skinColor}" />
  <rect x="${cx + chestHalf}" y="${shoulderY + 5}" width="14" height="100" rx="7" fill="${skinColor}" />
</svg>`;
}

module.exports = { generateBodySvg };
