// API helper for making authenticated requests
const API = {
  baseUrl: '/api',
  csrfToken: null,

  async fetchCsrf() {
    try {
      const res = await fetch('/auth/csrf-token', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        this.csrfToken = data.csrf_token;
      }
    } catch { /* ignore */ }
  },

  async request(path, options = {}) {
    const url = path.startsWith('/') ? path : `${this.baseUrl}/${path}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }
    const res = await fetch(url, { ...options, headers, credentials: 'include' });
    if (res.status === 401) {
      APP.currentUser = null;
      APP.updateAuthUI();
    }
    return res;
  },

  async get(path) {
    return this.request(path);
  },

  async post(path, body) {
    return this.request(path, { method: 'POST', body: JSON.stringify(body) });
  },

  async patch(path, body) {
    return this.request(path, { method: 'PATCH', body: JSON.stringify(body) });
  },

  async del(path) {
    return this.request(path, { method: 'DELETE' });
  },
};
