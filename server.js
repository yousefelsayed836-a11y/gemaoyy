const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const SQLiteStore = require('connect-sqlite3')(session);

const i18n = require('./middleware/i18n');
const authRoutes = require('./routes/auth');
const caloriesRoutes = require('./routes/calories');
const foodsRoutes = require('./routes/foods');
const bodyShapeRoutes = require('./routes/bodyshape');
const exercisesRoutes = require('./routes/exercises');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(i18n);

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'db') }),
  secret: process.env.SESSION_SECRET || 'gemaoyy-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // أسبوع
}));

// المتغيرات المتاحة في كل الصفحات
app.use((req, res, next) => {
  res.locals.isLoggedIn = !!req.session.userId;
  res.locals.userName = req.session.userName || null;
  next();
});

app.use('/', authRoutes);
app.use('/', caloriesRoutes);
app.use('/', foodsRoutes);
app.use('/', bodyShapeRoutes);
app.use('/', exercisesRoutes);

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.session.userId);
  res.render('dashboard', { profile });
});

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`🏋️  جيماوي شغال على http://localhost:${PORT}`);
});
