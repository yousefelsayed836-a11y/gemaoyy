const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// تقدير نسبة الدهون باستخدام معادلة RFM (Relative Fat Mass)
function estimateBodyFat({ gender, height, waist }) {
  const ratio = height / waist;
  const bodyFat = gender === 'female' ? 76 - 20 * ratio : 64 - 20 * ratio;
  return Math.max(Math.round(bodyFat * 10) / 10, 0);
}

// نضيف للنتيجة كتلة العضلات وكتلة الدهون والبروتين المطلوب بناءً على كتلة العضلات
function withDerived(row) {
  if (!row) return row;
  const leanMass = Math.round(row.weight * (1 - row.body_fat / 100) * 10) / 10;
  const fatMass = Math.round((row.weight - leanMass) * 10) / 10;
  const proteinG = Math.round(leanMass * 2.2);
  return { ...row, lean_mass: leanMass, fat_mass: fatMass, protein_g: proteinG };
}

router.get('/body-shape', requireAuth, (req, res) => {
  const saved = db.prepare('SELECT * FROM body_shapes WHERE user_id = ?').get(req.session.userId);
  res.render('bodyshape', { result: withDerived(saved), error: null, old: saved || {} });
});

router.post('/body-shape', requireAuth, (req, res) => {
  const { gender, height, weight, chest, waist, hips, thigh, arm } = req.body;

  const data = {
    gender,
    height: parseFloat(height),
    weight: parseFloat(weight),
    chest: parseFloat(chest),
    waist: parseFloat(waist),
    hips: parseFloat(hips),
    thigh: parseFloat(thigh),
    arm: parseFloat(arm)
  };

  if (!gender || Object.values(data).some(v => typeof v === 'number' && (!v || v <= 0))) {
    return res.render('bodyshape', { result: null, error: 'err_fill_correct', old: req.body });
  }

  const bodyFat = estimateBodyFat(data);

  db.prepare(`
    INSERT INTO body_shapes (user_id, gender, height, weight, chest, waist, hips, thigh, arm, body_fat, updated_at)
    VALUES (@user_id, @gender, @height, @weight, @chest, @waist, @hips, @thigh, @arm, @body_fat, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      gender=@gender, height=@height, weight=@weight, chest=@chest, waist=@waist, hips=@hips, thigh=@thigh, arm=@arm,
      body_fat=@body_fat, updated_at=CURRENT_TIMESTAMP
  `).run({ user_id: req.session.userId, body_fat: bodyFat, ...data });

  const result = db.prepare('SELECT * FROM body_shapes WHERE user_id = ?').get(req.session.userId);

  res.render('bodyshape', { result: withDerived(result), error: null, old: req.body });
});

module.exports = router;
