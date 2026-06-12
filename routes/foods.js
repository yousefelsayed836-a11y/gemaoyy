const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const foods = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'foods.json'), 'utf-8'));

router.get('/foods', requireAuth, (req, res) => {
  const { food, amount } = req.query;
  const lang = res.locals.lang;
  let result = null;
  let error = null;
  let selectedFood = null;

  if (food) {
    selectedFood = foods.find(f => f.id === food);
    if (!selectedFood) {
      error = 'err_food_not_found';
    } else {
      const grams = parseFloat(amount) || 100;
      const ratio = grams / 100;
      result = {
        name: lang === 'ar' ? selectedFood.name_ar : selectedFood.name_en,
        grams,
        calories: Math.round(selectedFood.calories * ratio),
        protein: Math.round(selectedFood.protein * ratio * 10) / 10,
        carbs: Math.round(selectedFood.carbs * ratio * 10) / 10,
        fat: Math.round(selectedFood.fat * ratio * 10) / 10
      };
    }
  }

  const sortedFoods = [...foods].sort((a, b) =>
    (lang === 'ar' ? a.name_ar : a.name_en).localeCompare(lang === 'ar' ? b.name_ar : b.name_en, lang)
  );

  res.render('foods', {
    foods: sortedFoods,
    result,
    error,
    selected: food || '',
    amount: amount || 100
  });
});

module.exports = router;
