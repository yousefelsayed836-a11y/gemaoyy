const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ACTIVITY_FACTORS = {
  sedentary: 1.2,    // قليل الحركة
  light: 1.375,      // نشاط خفيف (1-3 أيام/أسبوع)
  moderate: 1.55,    // نشاط متوسط (3-5 أيام/أسبوع)
  active: 1.725,     // نشاط عالي (6-7 أيام/أسبوع)
  very_active: 1.9   // نشاط مكثف جدًا / رياضي محترف
};

const GOAL_ADJUSTMENT = {
  lose: -500,    // تنشيف / خسارة وزن (عجز معتدل بعد فترة العجز القوي)
  maintain: 0,   // ثبات الوزن
  recomp: -250,  // إعادة تكوين الجسم: عجز خفيف + بروتين عالي عشان تخس دهون وتحافظ/تبني عضل
  gain: 400      // زيادة وزن / تضخيم
};

// البروتين بالجرام لكل كيلو من وزن الجسم حسب الهدف
const PROTEIN_PER_KG = {
  lose: 2.2,     // عجز السعرات بيهدد العضل، فالبروتين أعلى
  maintain: 1.8,
  recomp: 2.4,   // أعلى نسبة بروتين عشان نحافظ على العضل ونبنيه مع عجز خفيف
  gain: 2
};

function calculate({ gender, age, weight, height, activity, goal }) {
  // معادلة Mifflin-St Jeor لحساب معدل الحرق الأساسي BMR
  let bmr;
  if (gender === 'female') {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  }

  const factor = ACTIVITY_FACTORS[activity] || ACTIVITY_FACTORS.sedentary;
  const tdee = bmr * factor;

  const adjustment = GOAL_ADJUSTMENT[goal] ?? 0;
  let targetCalories = tdee + adjustment;
  if (targetCalories < 1200) targetCalories = 1200; // حد أدنى آمن

  // البروتين حسب الهدف
  const proteinPerKg = PROTEIN_PER_KG[goal] ?? 2;
  const proteinG = weight * proteinPerKg;
  const proteinCal = proteinG * 4;

  // الدهون: 25% من السعرات المستهدفة
  const fatCal = targetCalories * 0.25;
  const fatG = fatCal / 9;

  // الكارب: الباقي من السعرات
  const carbsCal = Math.max(targetCalories - proteinCal - fatCal, 0);
  const carbsG = carbsCal / 4;

  const result = {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG)
  };

  // خطة التدريج: لو الهدف تنشيف، أول 2-3 أسابيع عجز قوي عشان نخس بسرعة
  // وبعدها نرجع لعجز متوسط (targetCalories) قابل للاستمرار لفترة أطول
  if (goal === 'lose') {
    let phase1 = Math.round(tdee * 0.75);
    if (phase1 < 1200) phase1 = 1200;
    result.phase1Calories = phase1;
    result.phase2Calories = result.targetCalories;
  }

  return result;
}

// نضيف خطة التدريج للهدف "تنشيف" بناءً على القيم المحفوظة
function withPhases(profile) {
  if (!profile) return profile;
  if (profile.goal !== 'lose') return profile;
  let phase1 = Math.round(profile.tdee * 0.75);
  if (phase1 < 1200) phase1 = 1200;
  return { ...profile, phase1_calories: phase1, phase2_calories: profile.target_calories };
}

router.get('/calories', requireAuth, (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.session.userId);
  res.render('calories', { result: withPhases(profile) || null, error: null, old: profile || {} });
});

router.post('/calories', requireAuth, (req, res) => {
  const { gender, age, weight, height, activity, goal } = req.body;

  const ageNum = parseFloat(age);
  const weightNum = parseFloat(weight);
  const heightNum = parseFloat(height);

  if (!gender || !ageNum || !weightNum || !heightNum || !activity || !goal) {
    return res.render('calories', {
      result: null,
      error: 'err_fill_correct',
      old: req.body
    });
  }

  const calc = calculate({ gender, age: ageNum, weight: weightNum, height: heightNum, activity, goal });

  db.prepare(`
    INSERT INTO profiles (user_id, gender, age, weight, height, activity, goal, bmr, tdee, target_calories, protein_g, carbs_g, fat_g, updated_at)
    VALUES (@user_id, @gender, @age, @weight, @height, @activity, @goal, @bmr, @tdee, @target_calories, @protein_g, @carbs_g, @fat_g, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      gender=@gender, age=@age, weight=@weight, height=@height, activity=@activity, goal=@goal,
      bmr=@bmr, tdee=@tdee, target_calories=@target_calories, protein_g=@protein_g, carbs_g=@carbs_g, fat_g=@fat_g,
      updated_at=CURRENT_TIMESTAMP
  `).run({
    user_id: req.session.userId,
    gender,
    age: ageNum,
    weight: weightNum,
    height: heightNum,
    activity,
    goal,
    bmr: calc.bmr,
    tdee: calc.tdee,
    target_calories: calc.targetCalories,
    protein_g: calc.proteinG,
    carbs_g: calc.carbsG,
    fat_g: calc.fatG
  });

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.session.userId);
  res.render('calories', { result: withPhases(profile), error: null, old: req.body });
});

module.exports = router;
