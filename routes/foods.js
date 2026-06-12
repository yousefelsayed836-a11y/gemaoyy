const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const foods = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'foods.json'), 'utf-8'));

router.get('/foods', requireAuth, (req, res) => {
  const { food, amount } = req.query;
  let result = null;
  let error = null;
  let selectedFood = null;

  if (food) {
    selectedFood = foods.find(f => f.name === food);
    if (!selectedFood) {
      error = 'الأكل ده غير موجود في القاعدة';
    } else {
      const grams = parseFloat(amount) || 100;
      const ratio = grams / 100;
      result = {
        name: selectedFood.name,
        grams,
        calories: Math.round(selectedFood.calories * ratio),
        protein: Math.round(selectedFood.protein * ratio * 10) / 10,
        carbs: Math.round(selectedFood.carbs * ratio * 10) / 10,
        fat: Math.round(selectedFood.fat * ratio * 10) / 10
      };
    }
  }

  res.render('foods', {
    foods: foods.sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    result,
    error,
    selected: food || '',
    amount: amount || 100
  });
});

module.exports = router;
