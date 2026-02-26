// Simple i18n implementation for plain JS
const I18N = {
  currentLang: localStorage.getItem('lang') || 'en',
  translations: {},

  async load(lang) {
    try {
      const res = await fetch(`locales/${lang}/translation.json`);
      if (!res.ok) throw new Error(`Failed to load ${lang}`);
      this.translations[lang] = await res.json();
    } catch {
      console.warn(`Failed to load translations for ${lang}`);
    }
  },

  async init() {
    await this.load('en');
    if (this.currentLang !== 'en') await this.load(this.currentLang);
    this.apply();
  },

  t(key, params) {
    const keys = key.split('.');
    let val = this.translations[this.currentLang];
    for (const k of keys) {
      val = val?.[k];
      if (val === undefined) break;
    }
    // Fallback to English
    if (val === undefined) {
      val = this.translations['en'];
      for (const k of keys) {
        val = val?.[k];
        if (val === undefined) break;
      }
    }
    if (typeof val !== 'string') return key;
    // Simple template replacement: {{key}}
    if (params) {
      for (const [pk, pv] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{\\{${pk}\\}\\}`, 'g'), pv);
      }
    }
    return val;
  },

  async changeLang(lang) {
    this.currentLang = lang;
    localStorage.setItem('lang', lang);
    if (!this.translations[lang]) await this.load(lang);
    this.apply();
  },

  apply() {
    document.getElementById('app-title').textContent = this.t('app.title');
    document.getElementById('offline-text').textContent = this.t('offline.banner');
    document.getElementById('update-text').textContent = this.t('pwa.updateBanner');
    document.getElementById('reconnected-text').textContent = this.t('offline.reconnected');
    document.getElementById('login-btn').textContent = this.t('auth.login');
    document.getElementById('login-title').textContent = this.t('auth.login');
    document.getElementById('label-email').textContent = this.t('auth.email');
    document.getElementById('label-password').textContent = this.t('auth.password');
    document.getElementById('login-submit').textContent = this.t('auth.login');
    document.getElementById('login-cancel').textContent = this.t('common.cancel');

    // Nav links
    const navMap = { dashboard: 'Dashboard', timetable: 'nav.timetable', rooms: 'nav.rooms',
      faculty: 'nav.faculty', subjects: 'nav.subjects', analytics: 'nav.analytics' };
    document.querySelectorAll('.nav-link').forEach(link => {
      const page = link.dataset.page;
      if (navMap[page] && page !== 'dashboard') link.textContent = this.t(navMap[page]);
    });
  }
};
