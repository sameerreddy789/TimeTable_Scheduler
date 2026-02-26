// Main application logic
const APP = {
  currentUser: null,
  currentPage: 'dashboard',

  async init() {
    await I18N.init();
    this.setupNavigation();
    this.setupAuth();
    this.setupOnlineStatus();
    this.setupVersionCheck();
    this.setupLangSwitcher();
    await API.fetchCsrf();
  },

  setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        this.navigateTo(page);
      });
    });
  },

  navigateTo(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
      this.loadPage(page);
    }
  },

  async loadPage(page) {
    switch (page) {
      case 'timetable': await this.loadTimetablePage(); break;
      case 'rooms': await this.loadRoomsPage(); break;
      case 'faculty': await this.loadFacultyPage(); break;
      case 'subjects': await this.loadSubjectsPage(); break;
      case 'analytics': await this.loadAnalyticsPage(); break;
    }
  },

  async loadTimetablePage() {
    const el = document.getElementById('page-timetable');
    if (!this.currentUser) { el.innerHTML = `<p>${I18N.t('errors.unauthorized')}</p>`; return; }
    el.innerHTML = `<h2>${I18N.t('timetable.title')}</h2><p>${I18N.t('common.loading')}</p>`;
    try {
      const res = await API.get('timetable');
      if (!res.ok) throw new Error();
      const versions = await res.json();
      if (versions.length === 0) { el.innerHTML = `<h2>${I18N.t('timetable.title')}</h2><p>${I18N.t('common.noData')}</p>`; return; }
      let html = `<h2>${I18N.t('timetable.title')}</h2><table><thead><tr><th>Version</th><th>Status</th><th>Department</th><th>Quality</th></tr></thead><tbody>`;
      for (const v of versions) {
        html += `<tr><td>${v.version_label||'—'}</td><td>${v.status}</td><td>${v.department_name||'—'}</td><td>${v.quality_pct ? v.quality_pct+'%' : '—'}</td></tr>`;
      }
      html += '</tbody></table>';
      el.innerHTML = html;
    } catch { el.innerHTML = `<h2>${I18N.t('timetable.title')}</h2><p>${I18N.t('common.error')}</p>`; }
  },

  async loadRoomsPage() {
    const el = document.getElementById('page-rooms');
    if (!this.currentUser) { el.innerHTML = `<p>${I18N.t('errors.unauthorized')}</p>`; return; }
    el.innerHTML = `<h2>${I18N.t('nav.rooms')}</h2><p>${I18N.t('common.loading')}</p>`;
    try {
      const res = await API.get('rooms');
      if (!res.ok) throw new Error();
      const rooms = await res.json();

      let html = `<h2>${I18N.t('nav.rooms')}</h2>`;

      // Free Room Finder
      html += `
        <div class="card free-room-finder">
          <h3>Find Free Rooms</h3>
          <form id="free-room-form" class="finder-form">
            <div class="finder-fields">
              <div class="field">
                <label for="finder-day">Day</label>
                <select id="finder-day" required>
                  <option value="">Select day</option>
                  <option value="Mon">Monday</option>
                  <option value="Tue">Tuesday</option>
                  <option value="Wed">Wednesday</option>
                  <option value="Thu">Thursday</option>
                  <option value="Fri">Friday</option>
                  <option value="Sat">Saturday</option>
                </select>
              </div>
              <div class="field">
                <label for="finder-start">Start Time</label>
                <input type="time" id="finder-start" required value="09:00" />
              </div>
              <div class="field">
                <label for="finder-end">End Time</label>
                <input type="time" id="finder-end" required value="10:00" />
              </div>
              <div class="field field-btn">
                <button type="submit" class="btn btn-primary">Search</button>
              </div>
            </div>
          </form>
          <div id="free-room-results"></div>
        </div>`;

      // All rooms table
      html += `<h3 style="margin-top:24px;">All Rooms</h3>`;
      html += `<table><thead><tr><th>Room</th><th>Type</th><th>Capacity</th><th>Building</th></tr></thead><tbody>`;
      for (const r of rooms) {
        html += `<tr><td>${r.room_number}</td><td>${r.room_type}</td><td>${r.capacity}</td><td>${r.building||'—'}</td></tr>`;
      }
      html += '</tbody></table>';
      el.innerHTML = html;

      // Attach search handler
      document.getElementById('free-room-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.searchFreeRooms();
      });
    } catch { el.innerHTML = `<h2>${I18N.t('nav.rooms')}</h2><p>${I18N.t('common.error')}</p>`; }
  },

  async searchFreeRooms() {
    const day = document.getElementById('finder-day').value;
    const start = document.getElementById('finder-start').value;
    const end = document.getElementById('finder-end').value;
    const resultsEl = document.getElementById('free-room-results');

    if (!day || !start || !end) { resultsEl.innerHTML = '<p class="error">Please fill all fields.</p>'; return; }
    if (start >= end) { resultsEl.innerHTML = '<p class="error">End time must be after start time.</p>'; return; }

    resultsEl.innerHTML = `<p>${I18N.t('common.loading')}</p>`;
    try {
      const res = await API.get(`rooms/find-free?day=${day}&start_time=${start}&end_time=${end}`);
      if (!res.ok) throw new Error();
      const rooms = await res.json();
      if (rooms.length === 0) {
        resultsEl.innerHTML = '<p>No free rooms found for the selected time.</p>';
        return;
      }
      let html = `<p class="result-count">${rooms.length} room${rooms.length > 1 ? 's' : ''} available</p>`;
      html += '<table><thead><tr><th>Room</th><th>Type</th><th>Capacity</th><th>Building</th></tr></thead><tbody>';
      for (const r of rooms) {
        html += `<tr><td>${r.room_number}</td><td>${r.room_type}</td><td>${r.capacity}</td><td>${r.building||'—'}</td></tr>`;
      }
      html += '</tbody></table>';
      resultsEl.innerHTML = html;
    } catch {
      resultsEl.innerHTML = '<p class="error">Failed to search. Please try again.</p>';
    }
  },

  async loadFacultyPage() {
    const el = document.getElementById('page-faculty');
    if (!this.currentUser) { el.innerHTML = `<p>${I18N.t('errors.unauthorized')}</p>`; return; }
    el.innerHTML = `<h2>${I18N.t('nav.faculty')}</h2><p>${I18N.t('common.loading')}</p>`;
    try {
      const res = await API.get('faculty');
      if (!res.ok) throw new Error();
      const faculty = await res.json();
      let html = `<h2>${I18N.t('nav.faculty')}</h2><table><thead><tr><th>Name</th><th>Max/Day</th><th>Max/Week</th></tr></thead><tbody>`;
      for (const f of faculty) {
        html += `<tr><td>${f.full_name}</td><td>${f.max_classes_per_day}</td><td>${f.max_classes_per_week}</td></tr>`;
      }
      html += '</tbody></table>';
      el.innerHTML = html;
    } catch { el.innerHTML = `<h2>${I18N.t('nav.faculty')}</h2><p>${I18N.t('common.error')}</p>`; }
  },

  async loadSubjectsPage() {
    const el = document.getElementById('page-subjects');
    if (!this.currentUser) { el.innerHTML = `<p>${I18N.t('errors.unauthorized')}</p>`; return; }
    el.innerHTML = `<h2>${I18N.t('nav.subjects')}</h2><p>${I18N.t('common.loading')}</p>`;
    try {
      const res = await API.get('subjects');
      if (!res.ok) throw new Error();
      const subjects = await res.json();
      let html = `<h2>${I18N.t('nav.subjects')}</h2><table><thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Hours/Week</th></tr></thead><tbody>`;
      for (const s of subjects) {
        html += `<tr><td>${s.name}</td><td>${s.code}</td><td>${s.subject_type}</td><td>${s.weekly_hours}</td></tr>`;
      }
      html += '</tbody></table>';
      el.innerHTML = html;
    } catch { el.innerHTML = `<h2>${I18N.t('nav.subjects')}</h2><p>${I18N.t('common.error')}</p>`; }
  },

  async loadAnalyticsPage() {
    const el = document.getElementById('page-analytics');
    if (!this.currentUser) { el.innerHTML = `<p>${I18N.t('errors.unauthorized')}</p>`; return; }
    el.innerHTML = `<h2>${I18N.t('analytics.title')}</h2><p>${I18N.t('common.noData')}</p>`;
  },

  // Auth
  setupAuth() {
    document.getElementById('login-btn').addEventListener('click', () => {
      if (this.currentUser) { this.logout(); }
      else { document.getElementById('login-modal').style.display = 'flex'; }
    });
    document.getElementById('login-cancel').addEventListener('click', () => {
      document.getElementById('login-modal').style.display = 'none';
    });
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.login();
    });
  },

  async login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';
    try {
      const res = await API.post('/auth/login', { email, password });
      if (res.ok) {
        const data = await res.json();
        this.currentUser = data.user;
        document.getElementById('login-modal').style.display = 'none';
        document.getElementById('login-form').reset();
        this.updateAuthUI();
        await API.fetchCsrf();
      } else {
        errorEl.textContent = I18N.t('auth.loginFailed');
        errorEl.style.display = 'block';
      }
    } catch {
      errorEl.textContent = I18N.t('common.error');
      errorEl.style.display = 'block';
    }
  },

  async logout() {
    await API.post('/auth/logout', {});
    this.currentUser = null;
    this.updateAuthUI();
    this.navigateTo('dashboard');
  },

  updateAuthUI() {
    const btn = document.getElementById('login-btn');
    if (this.currentUser) {
      btn.textContent = I18N.t('auth.logout');
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-danger');
    } else {
      btn.textContent = I18N.t('auth.login');
      btn.classList.remove('btn-danger');
      btn.classList.add('btn-primary');
    }
  },

  // Online status
  setupOnlineStatus() {
    const offlineBanner = document.getElementById('offline-banner');
    const reconnectedBanner = document.getElementById('reconnected-banner');

    if (!navigator.onLine) offlineBanner.style.display = 'block';

    window.addEventListener('online', () => {
      offlineBanner.style.display = 'none';
      reconnectedBanner.style.display = 'block';
      setTimeout(() => { reconnectedBanner.style.display = 'none'; }, 5000);
    });
    window.addEventListener('offline', () => {
      offlineBanner.style.display = 'block';
      reconnectedBanner.style.display = 'none';
    });
  },

  // Version hash check
  setupVersionCheck() {
    const updateBanner = document.getElementById('update-banner');
    const refreshBtn = document.getElementById('refresh-btn');

    refreshBtn.addEventListener('click', () => {
      localStorage.removeItem('timetable_version_hash');
      window.location.reload();
    });

    async function checkVersion() {
      try {
        const res = await fetch('/api/timetable/version-hash', { credentials: 'include' });
        if (!res.ok) return;
        const { hash } = await res.json();
        const cached = localStorage.getItem('timetable_version_hash');
        if (cached && hash !== cached) updateBanner.style.display = 'flex';
        localStorage.setItem('timetable_version_hash', hash);
      } catch { /* offline */ }
    }

    checkVersion();
    setInterval(checkVersion, 5 * 60 * 1000);
  },

  // Language switcher
  setupLangSwitcher() {
    const switcher = document.getElementById('lang-switcher');
    switcher.value = I18N.currentLang;
    switcher.addEventListener('change', async (e) => {
      await I18N.changeLang(e.target.value);
      this.updateAuthUI();
    });
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => APP.init());
