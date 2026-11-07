/**
 * VEXAPACS License Manager - Main Application
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── State ───
  let currentPage = 'dashboard';
  let uploadState = null;
  let currentUser = null;

  // ─── Toast ───
  function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
  }

  // ─── Modal ───
  function openModal(title, bodyHtml, actionsHtml) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalActions').innerHTML = actionsHtml;
    $('#modalOverlay').classList.add('open');
  }

  function closeModal() {
    $('#modalOverlay').classList.remove('open');
  }

  $('#modalOverlay').addEventListener('click', (e) => {
    if (e.target === $('#modalOverlay')) closeModal();
  });

  // ─── Helper: Encode to PEM Block ───
  function encodeBlock(jsonObj, label) {
    try {
      const jsonStr = typeof jsonObj === 'string' ? jsonObj : JSON.stringify(jsonObj);
      const base64 = btoa(jsonStr);
      // Split into 64-char lines
      const lines = base64.match(/.{1,64}/g) || [];
      return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
    } catch (err) {
      return 'Error encoding data';
    }
  }

  // ─── Navigation ───
  function navigate(page) {
    currentPage = page;
    $$('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    renderPage(page);
  }

  $$('.nav-item').forEach((item) => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  // ─── Logout ───
  $('#logoutBtn').addEventListener('click', async () => {
    await API.logout();
    window.location.href = '/login';
  });

  // ─── Page Renderers ───

  function renderPage(page) {
    const container = $('#mainContent');
    switch (page) {
      case 'dashboard': renderDashboard(container); break;
      case 'sign': renderSign(container); break;
      case 'history': renderHistory(container); break;
      case 'customers': renderCustomers(container); break;
      case 'settings': renderSettings(container); break;
      default: renderDashboard(container);
    }
  }

  // ─── DASHBOARD ───
  async function renderDashboard(container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="gradient-text">Dashboard</h1>
          <p>License & warranty overview</p>
        </div>
        <button class="btn btn-primary" id="dashboardSignBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
          New License
        </button>
      </div>
      <div class="stats-grid stats-grid-6" id="statsGrid">
        <div class="stat-card">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="stat-value" id="statTotal">-</div>
          <div class="stat-label">Total Licenses</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon icon-success">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div class="stat-value" id="statActive">-</div>
          <div class="stat-label">Active</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon icon-danger">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="stat-value" id="statExpired">-</div>
          <div class="stat-label">License Expired</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon icon-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <div class="stat-value" id="statMonth">-</div>
          <div class="stat-label">This Month</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon icon-warning">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div class="stat-value" id="statWarrantyExpiring">-</div>
          <div class="stat-label">Warranty < 30d</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon icon-danger">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </div>
          <div class="stat-value" id="statWarrantyExpired">-</div>
          <div class="stat-label">Warranty Expired</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Recent Licenses</h3>
        </div>
        <div id="recentLicenses"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    `;

    $('#dashboardSignBtn').addEventListener('click', () => navigate('sign'));

    try {
      const res = await API.getStats();
      if (res.ok) {
        $('#statTotal').textContent = res.total;
        $('#statActive').textContent = res.active;
        $('#statExpired').textContent = res.expired;
        $('#statMonth').textContent = res.thisMonth;
        $('#statWarrantyExpiring').textContent = res.warrantyExpiring;
        $('#statWarrantyExpired').textContent = res.warrantyExpired;
        renderRecentTable(res.recent);
        updateBadge(res.total);
      }
    } catch (err) {
      showToast('Failed to load dashboard: ' + err.message, 'error');
    }
  }

  function renderRecentTable(licenses) {
    const el = $('#recentLicenses');
    if (!licenses || licenses.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-title">No licenses yet</div><p>Create your first license from the Sign License menu.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>License ID</th>
              <th>Hospital</th>
              <th>Modules</th>
              <th>Expiry</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${licenses.map((l) => {
              const modules = (() => { try { return JSON.parse(l.modules); } catch { return []; } })();
              const isExpired = l.expires_at && new Date(l.expires_at) < new Date();
              const isLifetime = !l.expires_at;
              return `<tr>
                <td><code style="font-size:0.8125rem;">${l.license_id}</code></td>
                <td><strong>${l.customer_name}</strong></td>
                <td style="max-width:300px;">${modules.map(m => `<span class="badge badge-info" style="margin:2px;">${m}</span>`).join(' ')}</td>
                <td>${isLifetime ? '<span class="badge badge-success">Lifetime</span>' : (isExpired ? '<span class="badge badge-danger">Expired</span>' : `<span class="badge badge-success">${new Date(l.expires_at).toLocaleDateString('en-US')}</span>`)}</td>
                <td style="white-space:nowrap;">${new Date(l.created_at).toLocaleString('en-US')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ─── SIGN LICENSE ───
  function renderSign(container) {
    uploadState = null;
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="gradient-text">Sign License</h1>
          <p>Paste the license request key from the hospital to generate a license.lic file</p>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">1. Paste License Request Key</h3>
        <div class="form-group">
          <label class="form-label" for="requestKeyInput">License Request Key *</label>
          <textarea class="form-textarea" id="requestKeyInput" placeholder="Paste the license request key here (JSON format or base64 encoded)..." rows="8" required></textarea>
          <div class="form-hint">Paste the content from install-request.json or install-request.txt file</div>
        </div>
        <button class="btn btn-primary" id="processRequestBtn" style="width:100%;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          Process Request
        </button>
        <div id="requestPreview" style="display:none;margin-top:20px;"></div>
      </div>

      <div class="card" id="signFormCard" style="display:none;margin-top:20px;">
        <h3 class="card-title" style="margin-bottom:16px;">2. License & Warranty Data</h3>
        <form id="signForm" autocomplete="off">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="customerName">Hospital Name *</label>
              <input class="form-input" id="customerName" placeholder="e.g. RS NEXIA DEMO" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="customerId">Customer ID</label>
              <input class="form-input" id="customerId" placeholder="Optional">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">License Modules</label>
            <div class="checkbox-grid" id="modulesGrid"></div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="expiresAt">License Expiry Date</label>
              <input class="form-input" id="expiresAt" type="date">
              <div class="form-hint">Leave empty for lifetime license</div>
            </div>
            <div class="form-group">
              <label class="form-label" for="maxUsers">Max Users</label>
              <input class="form-input" id="maxUsers" type="number" min="0" placeholder="Leave empty = unlimited">
            </div>
          </div>

          <hr style="border-color:var(--bg-glass-border);margin:20px 0;">

          <h4 style="margin-bottom:12px;color:var(--accent-1);">🛡️ Warranty Information</h4>
          <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">Warranty is for internal database only, not included in the license file.</p>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="warrantyStart">Warranty Start</label>
              <input class="form-input" id="warrantyStart" type="date">
              <div class="form-hint">Warranty start date</div>
            </div>
            <div class="form-group">
              <label class="form-label" for="warrantyYears">Warranty Duration (Years)</label>
              <input class="form-input" id="warrantyYears" type="number" min="1" value="1">
              <div class="form-hint">How many years of warranty</div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="licenseId">License ID</label>
            <input class="form-input" id="licenseId" placeholder="Auto-generated">
            <div class="form-hint">Leave empty for auto-generate</div>
          </div>

          <div class="form-group">
            <label class="form-label" for="note">Notes</label>
            <textarea class="form-textarea" id="note" placeholder="Internal notes (optional)" rows="2"></textarea>
          </div>

          <button type="submit" class="btn btn-success btn-lg" id="signSubmitBtn" style="width:100%;justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Generate & Sign License
          </button>
        </form>
      </div>

      <div id="licenseResult" style="display:none;"></div>
    `;

    const processBtn = $('#processRequestBtn');
    const requestInput = $('#requestKeyInput');

    processBtn.addEventListener('click', () => handleRequestInput());

    $('#signForm').addEventListener('submit', handleSignSubmit);
  }


  async function handleRequestInput() {
    const requestInput = $('#requestKeyInput');
    let inputText = requestInput.value.trim();
    
    if (!inputText) {
      showToast('Please paste the license request key', 'error');
      return;
    }

    const processBtn = $('#processRequestBtn');
    const originalBtnText = processBtn.innerHTML;
    processBtn.disabled = true;
    processBtn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Processing...`;

    try {
      // Try to parse the input as JSON or base64
      let requestData;
      
      // Check if it's wrapped in VEXA LICENSE REQUEST envelope
      const beginMarker = '-----BEGIN VEXA LICENSE REQUEST-----';
      const endMarker = '-----END VEXA LICENSE REQUEST-----';
      if (inputText.includes(beginMarker) && inputText.includes(endMarker)) {
        // Extract base64 content between markers
        const startIdx = inputText.indexOf(beginMarker) + beginMarker.length;
        const endIdx = inputText.indexOf(endMarker);
        inputText = inputText.substring(startIdx, endIdx).trim();
      }
      
      try {
        // Try parsing as JSON first
        requestData = JSON.parse(inputText);
      } catch {
        // If not JSON, assume it's base64 encoded
        try {
          // Remove all whitespace and line breaks from base64
          const cleanBase64 = inputText.replace(/\s+/g, '');
          const decoded = atob(cleanBase64);
          requestData = JSON.parse(decoded);
        } catch {
          showToast('Invalid format. Please paste valid JSON or base64 encoded data', 'error');
          processBtn.disabled = false;
          processBtn.innerHTML = originalBtnText;
          return;
        }
      }

      // Send to backend API
      const res = await API.processRequest(requestData);
      if (!res.ok) {
        showToast(res.error || 'Failed to process request', 'error');
        processBtn.disabled = false;
        processBtn.innerHTML = originalBtnText;
        return;
      }

      uploadState = res.request;
      
      // Disable the textarea and button after successful processing
      requestInput.disabled = true;
      processBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg> Processed`;
      processBtn.classList.remove('btn-primary');
      processBtn.classList.add('btn-success');

      showRequestPreview(res.request);
      $('#signFormCard').style.display = 'block';
      populateModules(res.request.requestedModules || []);
      
      showToast('License request processed successfully', 'success');
    } catch (err) {
      showToast('Processing failed: ' + err.message, 'error');
      processBtn.disabled = false;
      processBtn.innerHTML = originalBtnText;
    }
  }

  function showRequestPreview(request) {
    const el = $('#requestPreview');
    el.style.display = 'block';
    el.innerHTML = `
      <h4 style="margin-bottom:12px;color:var(--accent-1);">📋 Request Preview</h4>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-item-label">Hostname</div>
          <div class="info-item-value">${request.machine?.hostname || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-item-label">Machine ID</div>
          <div class="info-item-value mono">${request.machineId}</div>
        </div>
        <div class="info-item">
          <div class="info-item-label">Platform</div>
          <div class="info-item-value">${request.machine?.platform || '-'} / ${request.machine?.arch || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-item-label">MAC Address</div>
          <div class="info-item-value mono">${(request.machine?.macs || []).join(', ') || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-item-label">Installer Version</div>
          <div class="info-item-value">${request.installerVersion || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-item-label">Request Time</div>
          <div class="info-item-value">${new Date(request.generatedAt).toLocaleString('en-US')}</div>
        </div>
      </div>
      <div style="margin-top:8px;">
        <div class="info-item-label" style="margin-bottom:4px;">Requested Modules</div>
        <div>${(request.requestedModules || []).map(m => `<span class="badge badge-info" style="margin-right:4px;">${m}</span>`).join('')}</div>
      </div>
    `;
  }

  function populateModules(requestedModules) {
    const grid = $('#modulesGrid');
    const allModules = ['RIS', 'PACS_DIMSE', 'PACS_MWL', 'DESKTOP_VIEWER', 'MOBILE_VIEWER', 'ECG_VIEWER'];

    grid.innerHTML = allModules.map(m => `
      <label class="checkbox-item ${requestedModules.includes(m) ? 'checked' : ''}">
        <input type="checkbox" name="modules" value="${m}" ${requestedModules.includes(m) ? 'checked' : ''}>
        <span class="check-mark"></span>
        ${m}
      </label>
    `).join('');

    grid.querySelectorAll('.checkbox-item').forEach(item => {
      item.addEventListener('click', () => {
        const cb = item.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
        item.classList.toggle('checked', cb.checked);
      });
    });
  }

  async function handleSignSubmit(e) {
    e.preventDefault();
    const btn = $('#signSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm"></div> Processing...';

    try {
      const customerName = $('#customerName').value.trim();
      if (!customerName) {
        showToast('Hospital name is required', 'error');
        btn.disabled = false; btn.innerHTML = 'Generate & Sign License'; return;
      }

      const modules = Array.from(document.querySelectorAll('input[name="modules"]:checked')).map(cb => cb.value);
      if (modules.length === 0) {
        showToast('Please select at least 1 module', 'error');
        btn.disabled = false; btn.innerHTML = 'Generate & Sign License'; return;
      }

      const data = {
        requestRaw: JSON.stringify(uploadState),
        customerName,
        customerId: $('#customerId').value.trim(),
        licenseId: $('#licenseId').value.trim(),
        modules,
        expiresAt: $('#expiresAt').value || null,
        maxUsers: $('#maxUsers').value || null,
        note: $('#note').value.trim(),
        warrantyStart: $('#warrantyStart').value || null,
        warrantyYears: $('#warrantyYears').value || 1,
      };

      const res = await API.signLicense(data);
      if (!res.ok) {
        showToast(res.error || 'Failed to sign license', 'error');
        btn.disabled = false; btn.innerHTML = 'Generate & Sign License'; return;
      }

      showToast('License created successfully!', 'success');

      const resultEl = $('#licenseResult');
      const lic = res.license;
      const licenseCode = res.licenseCode || JSON.stringify(lic, null, 2);
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="license-result">
          <div class="license-result-header">
            <div class="icon">✅</div>
            <div>
              <h4 style="margin-bottom:2px;">License Created Successfully!</h4>
              <span style="font-size:0.85rem;color:var(--text-secondary);font-family:var(--font-mono);">${lic.payload.licenseId}</span>
            </div>
          </div>
          <div class="info-grid info-grid-3">
            <div class="info-item">
              <div class="info-item-label">Customer</div>
              <div class="info-item-value">${lic.payload.customerName}</div>
            </div>
            <div class="info-item">
              <div class="info-item-label">Modules</div>
              <div class="info-item-value">${lic.payload.modules.join(', ')}</div>
            </div>
            <div class="info-item">
              <div class="info-item-label">Expiry</div>
              <div class="info-item-value">${lic.payload.expiresAt ? new Date(lic.payload.expiresAt).toLocaleDateString('en-US') : 'Lifetime'}</div>
            </div>
          </div>
          <div class="license-result-actions">
            <button class="btn btn-primary" id="downloadLicBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Download license.lic
            </button>
            <button class="btn btn-secondary" id="copyLicBtn">Copy License Code</button>
            <button class="btn btn-secondary" id="signAnotherBtn">Create Another</button>
          </div>
          <textarea class="form-textarea" readonly style="margin-top:16px;font-family:var(--font-mono);min-height:180px;">${licenseCode.replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</textarea>
        </div>
      `;

      $('#downloadLicBtn').addEventListener('click', () => {
        const blob = new Blob([licenseCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${lic.payload.licenseId}.lic`; a.click();
        URL.revokeObjectURL(url);
      });

      $('#copyLicBtn').addEventListener('click', async () => {
        await navigator.clipboard.writeText(licenseCode);
        showToast('License code copied.', 'success');
      });

      $('#signAnotherBtn').addEventListener('click', () => navigate('sign'));

      try {
        const statsRes = await API.getStats();
        if (statsRes.ok) updateBadge(statsRes.total);
      } catch {}

      $('#signFormCard').style.display = 'none';
      btn.disabled = false; btn.innerHTML = 'Generate & Sign License';
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      btn.disabled = false; btn.innerHTML = 'Generate & Sign License';
    }
  }

  // ─── HISTORY ───
  async function renderHistory(container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="gradient-text">License History</h1>
          <p>All licenses that have been created</p>
        </div>
        <div>
          <input class="form-input" id="historySearch" placeholder="Search licenses..." style="width:250px;">
        </div>
      </div>
      <div class="card">
        <div id="historyContent"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    `;

    let debounceTimer;
    $('#historySearch').addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadHistoryTable($('#historySearch').value), 300);
    });

    await loadHistoryTable('');
  }

  async function loadHistoryTable(search) {
    const el = $('#historyContent');
    try {
      const res = await API.getLicenses({ search, limit: 200 });
      if (!res.ok) { el.innerHTML = '<div class="empty-state">Failed to load data</div>'; return; }

      const licenses = res.licenses;
      if (licenses.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-title">No licenses found</div></div>';
        return;
      }

      el.innerHTML = `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="width:180px;">License ID</th>
                <th>Hospital</th>
                <th style="width:320px;">Modules</th>
                <th style="width:100px;">Status</th>
                <th style="width:180px;">Created</th>
                <th style="width:220px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${licenses.map((l) => {
                const modules = (() => { try { return JSON.parse(l.modules); } catch { return []; } })();
                const isExpired = l.expires_at && new Date(l.expires_at) < new Date();
                const isLifetime = !l.expires_at;
                let statusHtml = isLifetime
                  ? '<span class="badge badge-success">Lifetime</span>'
                  : (isExpired
                    ? '<span class="badge badge-danger">Expired</span>'
                    : '<span class="badge badge-success">Active</span>');
                return `<tr>
                  <td><code style="font-size:0.8125rem;">${l.license_id}</code></td>
                  <td><strong>${l.customer_name}</strong></td>
                  <td>${modules.map(m => `<span class="badge badge-info" style="margin:2px;">${m}</span>`).join(' ')}</td>
                  <td>${statusHtml}</td>
                  <td style="white-space:nowrap;">${new Date(l.created_at).toLocaleString('en-US')}</td>
                  <td>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm view-details-btn" data-id="${l.license_id}" title="View Details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"/></svg>
                        Details
                      </button>
                      <button class="btn btn-primary btn-sm download-btn" data-id="${l.license_id}" title="Download license.lic">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        Download
                      </button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // View Details button handler
      el.querySelectorAll('.view-details-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            const res = await API.getLicense(id);
            if (res.ok && res.license) {
              const lic = res.license;
              const requestRaw = lic.request_raw ? JSON.parse(lic.request_raw) : null;
              const licenseRaw = lic.license_raw ? JSON.parse(lic.license_raw) : null;
              
              // Encode to base64 blocks
              const requestBlock = requestRaw ? encodeBlock(requestRaw, 'VEXA LICENSE REQUEST') : 'N/A';
              const licenseBlock = licenseRaw ? encodeBlock(licenseRaw, 'VEXA LICENSE') : 'N/A';
              
              openModal(
                `License Details - ${id}`,
                `
                  <div style="margin-bottom:20px;">
                    <h4 style="margin-bottom:8px;color:var(--text-primary);font-size:1rem;font-weight:600;">Hospital Information</h4>
                    <div class="info-grid">
                      <div class="info-item">
                        <div class="info-item-label">Hospital Name</div>
                        <div class="info-item-value">${lic.customer_name}</div>
                      </div>
                      <div class="info-item">
                        <div class="info-item-label">License Status</div>
                        <div class="info-item-value">${lic.expires_at ? (new Date(lic.expires_at) < new Date() ? 'Expired' : 'Active') : 'Lifetime'}</div>
                      </div>
                      <div class="info-item">
                        <div class="info-item-label">Expiry Date</div>
                        <div class="info-item-value">${lic.expires_at ? new Date(lic.expires_at).toLocaleDateString('en-US') : 'Lifetime'}</div>
                      </div>
                      <div class="info-item">
                        <div class="info-item-label">Created</div>
                        <div class="info-item-value">${new Date(lic.created_at).toLocaleString('en-US')}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div style="margin-bottom:20px;">
                    <h4 style="margin-bottom:8px;color:var(--text-primary);font-size:1rem;font-weight:600;">License Request (Encrypted)</h4>
                    <textarea readonly class="form-textarea" rows="6" style="font-family:var(--font-mono);font-size:0.75rem;" id="requestTextarea">${requestBlock}</textarea>
                    <button class="btn btn-secondary btn-sm" id="copyRequestBtn" style="margin-top:8px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      Copy Request
                    </button>
                  </div>
                  
                  <div style="margin-bottom:20px;">
                    <h4 style="margin-bottom:8px;color:var(--text-primary);font-size:1rem;font-weight:600;">License Key (Encrypted)</h4>
                    <textarea readonly class="form-textarea" rows="8" style="font-family:var(--font-mono);font-size:0.75rem;" id="licenseTextarea">${licenseBlock}</textarea>
                    <button class="btn btn-secondary btn-sm" id="copyLicenseBtn" style="margin-top:8px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      Copy License
                    </button>
                  </div>
                `,
                `<button class="btn btn-secondary" onclick="document.getElementById('modalOverlay').classList.remove('open')">Close</button>`
              );
              
              // Copy handlers
              setTimeout(() => {
                $('#copyRequestBtn')?.addEventListener('click', () => {
                  const text = $('#requestTextarea').value;
                  navigator.clipboard.writeText(text);
                  showToast('License request copied to clipboard', 'success');
                });
                
                $('#copyLicenseBtn')?.addEventListener('click', () => {
                  const text = $('#licenseTextarea').value;
                  navigator.clipboard.writeText(text);
                  showToast('License key copied to clipboard', 'success');
                });
              }, 100);
            } else {
              showToast('Failed to load license details', 'error');
            }
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
          }
        });
      });

      // Download button handler
      el.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            const res = await API.getLicense(id);
            if (res.ok) {
              window.open(`/api/licenses/${encodeURIComponent(id)}/download`, '_blank');
            } else { showToast('Download failed', 'error'); }
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        });
      });
    } catch (err) { el.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`; }
  }

  // ─── CUSTOMERS ───
  async function renderCustomers(container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="gradient-text">Customers & Warranty</h1>
          <p>List of hospital customers with warranty information</p>
        </div>
      </div>
      <div class="card">
        <div id="customersContent"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    `;

    try {
      const res = await API.getCustomers();
      if (!res.ok) { $('#customersContent').innerHTML = '<div class="empty-state">Failed to load data</div>'; return; }

      const customers = res.customers;
      if (customers.length === 0) {
        $('#customersContent').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏥</div><div class="empty-state-title">No customers yet</div></div>';
        return;
      }

      $('#customersContent').innerHTML = `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Hospital Name</th>
                <th style="width:100px;">Licenses</th>
                <th style="width:140px;">Warranty Start</th>
                <th style="width:140px;">Warranty End</th>
                <th style="width:120px;">Days Left</th>
                <th style="width:140px;">Warranty Status</th>
                <th style="width:220px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(c => {
                let statusLabel = '';
                let daysLeft = c.warranty_days_left !== null ? Math.floor(c.warranty_days_left) : '-';
                if (c.warranty_status === 'active') {
                  statusLabel = '<span class="badge badge-success">Active</span>';
                } else if (c.warranty_status === 'expiring') {
                  statusLabel = '<span class="badge badge-warning">Expiring Soon</span>';
                } else if (c.warranty_status === 'expired') {
                  statusLabel = '<span class="badge badge-danger">Expired</span>';
                } else {
                  statusLabel = '<span class="badge" style="background:#e2e8f0;color:#64748b;">N/A</span>';
                }

                return `<tr>
                  <td><strong>${c.name}</strong></td>
                  <td><span class="badge badge-info">${c.license_count || 0}</span></td>
                  <td style="white-space:nowrap;">${c.warranty_start ? new Date(c.warranty_start).toLocaleDateString('en-US') : '-'}</td>
                  <td style="white-space:nowrap;">${c.warranty_end || '-'}</td>
                  <td style="font-weight:600;${c.warranty_days_left !== null && c.warranty_days_left <= 30 && c.warranty_days_left >= 0 ? 'color:var(--warning);' : (c.warranty_days_left !== null && c.warranty_days_left < 0 ? 'color:var(--danger);' : '')}">${daysLeft !== '-' ? daysLeft + ' days' : '-'}</td>
                  <td>${statusLabel}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm view-customer-btn" data-name="${c.name}">Detail</button>
                    <button class="btn btn-secondary btn-sm edit-warranty-btn" data-name="${c.name}" style="margin-left:4px;">Edit Warranty</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      $('#customersContent').querySelectorAll('.view-customer-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          const custRes = await API.getCustomerDetail(name);
          const licRes = await API.getCustomerLicenses(name);
          if (!custRes.ok || !licRes.ok) return;

          const c = custRes.customer;
          const licList = licRes.licenses || [];

          let warrantyInfo = '-';
          if (c.warranty_start) {
            warrantyInfo = `Start: ${new Date(c.warranty_start).toLocaleDateString('en-US')}<br>
              End: ${c.warranty_end || '-'}<br>
              Remaining: <strong>${c.warranty_days_left !== null ? Math.floor(c.warranty_days_left) + ' days' : '-'}</strong><br>
              Status: ${c.warranty_status === 'active' ? '✅ Active' : (c.warranty_status === 'expiring' ? '⚠️ Expiring Soon' : (c.warranty_status === 'expired' ? '❌ Expired' : 'N/A'))}`;
          }

          const rows = licList.map(l => {
            const modules = (() => { try { return JSON.parse(l.modules); } catch { return []; } })();
            return `<tr>
              <td style="font-family:var(--font-mono);font-size:0.8rem;">${l.license_id}</td>
              <td>${modules.map(m => `<span class="badge badge-info">${m}</span>`).join(' ')}</td>
              <td>${l.expires_at ? new Date(l.expires_at).toLocaleDateString('en-US') : '<span class="badge badge-lifetime">Lifetime</span>'}</td>
              <td style="color:var(--text-muted);font-size:0.8rem;">${new Date(l.created_at).toLocaleString('en-US')}</td>
            </tr>`;
          }).join('');

          openModal(
            `Details: ${name}`,
            `
            <div style="margin-bottom:16px;padding:12px;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);">
              <strong style="color:var(--accent-1);">🛡️ Warranty</strong><br>
              ${warrantyInfo}
            </div>
            <h4 style="margin-bottom:8px;">Licenses</h4>
            <div class="table-container">
              <table>
                <thead><tr><th>License ID</th><th>Modules</th><th>Expiry</th><th>Created</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No licenses</td></tr>'}</tbody>
              </table>
            </div>`,
            `<button class="btn btn-secondary" onclick="document.getElementById('modalOverlay').classList.remove('open')">Close</button>`
          );
        });
      });

      $('#customersContent').querySelectorAll('.edit-warranty-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          const custRes = await API.getCustomerDetail(name);
          if (!custRes.ok) return;
          const c = custRes.customer;

          openModal(
            `Edit Warranty: ${name}`,
            `
            <form id="warrantyForm">
              <div class="form-group">
                <label class="form-label" for="editWarrantyStart">Warranty Start</label>
                <input class="form-input" id="editWarrantyStart" type="date" value="${c.warranty_start || ''}">
              </div>
              <div class="form-group">
                <label class="form-label" for="editWarrantyYears">Warranty Duration (Years)</label>
                <input class="form-input" id="editWarrantyYears" type="number" min="1" value="${c.warranty_years || 1}">
              </div>
              <div class="form-group">
                <label class="form-label" for="editNotes">Notes</label>
                <textarea class="form-textarea" id="editNotes" rows="2">${c.notes || ''}</textarea>
              </div>
            </form>`,
            `
            <button class="btn btn-secondary" onclick="document.getElementById('modalOverlay').classList.remove('open')">Cancel</button>
            <button class="btn btn-primary" id="saveWarrantyBtn">Save</button>`
          );

          $('#saveWarrantyBtn').addEventListener('click', async () => {
            const warrantyStart = $('#editWarrantyStart').value || null;
            const warrantyYears = $('#editWarrantyYears').value || 1;
            const notes = $('#editNotes').value || '';

            const res = await API.updateCustomer(name, { warrantyStart, warrantyYears, notes });
            if (res.ok) {
              showToast('Warranty updated successfully!', 'success');
              closeModal();
              renderCustomers($('#mainContent'));
            } else {
              showToast(res.error || 'Update failed', 'error');
            }
          });
        });
      });
    } catch (err) {
      $('#customersContent').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  // ─── SETTINGS ───
  async function renderSettings(container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="gradient-text">Settings</h1>
          <p>Manage keypair and configuration</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h3 class="card-title" style="margin-bottom:16px;">🔑 Keypair Status</h3>
        <div id="keyStatus"><div class="loading"><div class="spinner"></div></div></div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h3 class="card-title" style="margin-bottom:16px;">📤 Upload Private Key</h3>
        <div class="upload-zone" id="privateKeyZone" style="padding:24px;">
          <div class="upload-zone-icon" style="font-size:1.5rem;">🔐</div>
          <div class="upload-zone-title" style="font-size:0.95rem;">Upload private.pem</div>
          <div class="upload-zone-sub">Ed25519 private key file (stored server-side only)</div>
          <input type="file" id="privateKeyInput" accept=".pem" style="display:none;">
        </div>
        <div id="privateKeyResult" style="margin-top:12px;"></div>
      </div>

      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">📤 Upload Public Key</h3>
        <div class="upload-zone" id="publicKeyZone" style="padding:24px;">
          <div class="upload-zone-icon" style="font-size:1.5rem;">🔓</div>
          <div class="upload-zone-title" style="font-size:0.95rem;">Upload public.pem</div>
          <div class="upload-zone-sub">Ed25519 public key file for verification</div>
          <input type="file" id="publicKeyInput" accept=".pem" style="display:none;">
        </div>
        <div id="publicKeyResult" style="margin-top:12px;"></div>
      </div>
    `;

    loadKeyStatus();
    setupKeyUpload('private', 'Private');
    setupKeyUpload('public', 'Public');
  }

  async function loadKeyStatus() {
    const el = $('#keyStatus');
    try {
      const res = await API.getKeyInfo();
      if (!res.ok) { el.innerHTML = '<div style="color:var(--danger);">Failed to load key status</div>'; return; }

      el.innerHTML = `
        <div class="key-info-box">
          <span class="key-status ${res.privateExists ? 'present' : 'missing'}"></span>
          <div><strong>Private Key:</strong> ${res.privateExists ? '✅ Installed' : '❌ Not uploaded'}</div>
        </div>
        <div class="key-info-box">
          <span class="key-status ${res.publicExists ? 'present' : 'missing'}"></span>
          <div><strong>Public Key:</strong> ${res.publicExists ? '✅ Installed' : '❌ Not uploaded'}</div>
        </div>
        ${res.keyInfo ? `
        <div style="padding:12px;background:rgba(255,255,255,0.02);border-radius:var(--radius-sm);margin-top:8px;">
          <div style="font-size:0.8rem;color:var(--text-muted);">Key ID: <strong style="color:var(--text-primary);">${res.keyInfo.keyId}</strong></div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Algorithm: <strong style="color:var(--text-primary);">${res.keyInfo.algorithm}</strong></div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Created: <strong style="color:var(--text-primary);">${new Date(res.keyInfo.createdAt).toLocaleString('en-US')}</strong></div>
        </div>` : ''}
      `;
    } catch (err) { el.innerHTML = `<div style="color:var(--danger);">Error: ${err.message}</div>`; }
  }

  function setupKeyUpload(type, label) {
    const zone = $(`#${type}KeyZone`);
    const input = $(`#${type}KeyInput`);
    const result = $(`#${type}KeyResult`);

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) uploadKey(type, e.dataTransfer.files[0], result);
    });
    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) uploadKey(type, e.target.files[0], result);
    });
  }

  async function uploadKey(type, file, resultEl) {
    if (!file.name.endsWith('.pem')) { showToast('File must be .pem format', 'error'); return; }
    resultEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      let res;
      if (type === 'private') res = await API.uploadPrivateKey(file);
      else res = await API.uploadPublicKey(file);
      if (res.ok) {
        showToast(`${type === 'private' ? 'Private' : 'Public'} key uploaded successfully!`, 'success');
        resultEl.innerHTML = `<div style="color:var(--success);padding:8px 0;">✅ ${res.message}</div>`;
        loadKeyStatus();
      } else {
        showToast(res.error || 'Upload failed', 'error');
        resultEl.innerHTML = `<div style="color:var(--danger);padding:8px 0;">❌ ${res.error}</div>`;
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      resultEl.innerHTML = `<div style="color:var(--danger);padding:8px 0;">❌ ${err.message}</div>`;
    }
  }

  function updateBadge(count) {
    const badge = $('#historyBadge');
    if (badge) badge.textContent = count;
  }

  // ─── Init ───
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const auth = await API.checkAuth();
      if (!auth.ok) {
        window.location.href = '/login';
        return;
      }
      currentUser = auth.user;
    } catch {
      window.location.href = '/login';
      return;
    }
    navigate('dashboard');
  });

})();
