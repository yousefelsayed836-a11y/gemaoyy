const en = require('../locales/en.json');
const ar = require('../locales/ar.json');

const locales = { en, ar };

function i18n(req, res, next) {
  let lang = req.query.lang || req.cookies?.lang || 'en';
  if (lang !== 'ar' && lang !== 'en') lang = 'en';

  if (req.query.lang) {
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  }

  const dict = locales[lang];

  res.locals.lang = lang;
  res.locals.dir = lang === 'ar' ? 'rtl' : 'ltr';
  res.locals.currentPath = req.path;
  res.locals.langSwitchUrl = (targetLang) => {
    const params = { ...req.query, lang: targetLang };
    const qs = new URLSearchParams(params).toString();
    return req.path + (qs ? '?' + qs : '');
  };
  res.locals.t = (key, params) => {
    let text = dict[key] || key;
    if (params) {
      Object.keys(params).forEach(p => {
        text = text.replace(`{${p}}`, params[p]);
      });
    }
    return text;
  };

  next();
}

module.exports = i18n;
