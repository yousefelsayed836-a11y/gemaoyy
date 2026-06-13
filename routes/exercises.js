const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const exercises = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.json'), 'utf-8'));

router.get('/exercises', requireAuth, (req, res) => {
  const muscleById = {};
  exercises.muscleGroups.forEach((m) => { muscleById[m.id] = m; });

  res.render('exercises', {
    muscleGroups: exercises.muscleGroups,
    cardio: exercises.cardio,
    homeResistance: exercises.homeResistance,
    splits: exercises.splits,
    muscleById
  });
});

module.exports = router;
