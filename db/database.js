const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'gemaoyy.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY,
    gender TEXT,
    age INTEGER,
    weight REAL,
    height REAL,
    activity TEXT,
    goal TEXT,
    bmr REAL,
    tdee REAL,
    target_calories REAL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
