const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

// صفحة التسجيل
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  const { name, email, password, password2 } = req.body;

  if (!name || !email || !password || !password2) {
    return res.render('register', { error: 'err_fill_fields' });
  }
  if (password !== password2) {
    return res.render('register', { error: 'err_password_mismatch' });
  }
  if (password.length < 6) {
    return res.render('register', { error: 'err_password_short' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.render('register', { error: 'err_email_taken' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), hashed);

  req.session.userId = result.lastInsertRowid;
  req.session.userName = name.trim();
  res.redirect('/dashboard');
});

// صفحة تسجيل الدخول
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase().trim());
  if (!user) {
    return res.render('login', { error: 'err_invalid_login' });
  }

  const match = await bcrypt.compare(password || '', user.password);
  if (!match) {
    return res.render('login', { error: 'err_invalid_login' });
  }

  req.session.userId = user.id;
  req.session.userName = user.name;
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
