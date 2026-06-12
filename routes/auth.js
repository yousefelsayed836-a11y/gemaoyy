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
    return res.render('register', { error: 'من فضلك اكمل كل الحقول' });
  }
  if (password !== password2) {
    return res.render('register', { error: 'كلمتا المرور غير متطابقتين' });
  }
  if (password.length < 6) {
    return res.render('register', { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.render('register', { error: 'البريد الإلكتروني مستخدم من قبل' });
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
    return res.render('login', { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  const match = await bcrypt.compare(password || '', user.password);
  if (!match) {
    return res.render('login', { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
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
