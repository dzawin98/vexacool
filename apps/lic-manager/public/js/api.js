/**
 * VEXAPACS License Manager - API Client
 */
const API = {
  // ─── Auth ───
  async login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  },

  async logout() {
    const res = await fetch('/api/logout', { method: 'POST' });
    return res.json();
  },

  async checkAuth() {
    const res = await fetch('/api/check-auth');
    return res.json();
  },

  // ─── License ───
  async uploadRequest(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload-request', { method: 'POST', body: form });
    return res.json();
  },

  async processRequest(requestData) {
    const res = await fetch('/api/process-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: requestData }),
    });
    return res.json();
  },

  async signLicense(data) {
    const res = await fetch('/api/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getStats() {
    const res = await fetch('/api/stats');
    return res.json();
  },

  async getLicenses(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/licenses${qs ? '?' + qs : ''}`);
    return res.json();
  },

  async getLicense(id) {
    const res = await fetch(`/api/licenses/${encodeURIComponent(id)}`);
    return res.json();
  },

  async downloadLicense(id) {
    window.open(`/api/licenses/${encodeURIComponent(id)}/download`, '_blank');
  },

  // ─── Customers ───
  async getCustomers() {
    const res = await fetch('/api/customers');
    return res.json();
  },

  async getCustomerDetail(name) {
    const res = await fetch(`/api/customers/${encodeURIComponent(name)}`);
    return res.json();
  },

  async getCustomerLicenses(name) {
    const res = await fetch(`/api/customers/${encodeURIComponent(name)}/licenses`);
    return res.json();
  },

  async updateCustomer(name, data) {
    const res = await fetch(`/api/customers/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // ─── Keys ───
  async getKeyInfo() {
    const res = await fetch('/api/key-info');
    return res.json();
  },

  async uploadPrivateKey(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/keys/private', { method: 'POST', body: form });
    return res.json();
  },

  async uploadPublicKey(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/keys/public', { method: 'POST', body: form });
    return res.json();
  },
};
