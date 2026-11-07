(function () {
  const params = new URLSearchParams(window.location.search);
  const studyUids = [...params.getAll('StudyInstanceUIDs'), ...params.getAll('StudyInstanceUID')].flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
  const studyUid = studyUids[0] || '';
  const viewportGrid = document.getElementById('viewportGrid');
  let canvas = null;
  let ctx = null;
  const state = { data: null, studies: [], viewports: [], activeViewportIndex: 0, activeStudyIndex: 0, layout: '1x1', leadMode: 'all', leadIndex: 0, scale: 1, cursor: null, caliperMode: false, calipers: [], draftCaliper: null, analysis: null };
  const plot = { left: 58, right: 26, top: 30, bottom: 26 };

  const $ = id => document.getElementById(id);

  function showError(message) {
    document.body.innerHTML = '<div class="error"><h2>ECG Viewer Error</h2><p>' + message + '</p></div>';
  }

  function fetchJson(url) {
    return fetch(url).then(response => response.text().then(text => {
      if (!response.ok) throw new Error('Waveform data not found');
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Waveform endpoint returned HTML. Restart dicomweb-pacs to enable ECG multi-study support.');
      }
    }));
  }

  function drawGrid() {
    ctx.fillStyle = '#fff7f7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let x = 0; x < canvas.width; x += 12) { ctx.strokeStyle = '#fecaca'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 12) { ctx.strokeStyle = '#fecaca'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    for (let x = 0; x < canvas.width; x += 60) { ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 60) { ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  }

  function drawGridOn(context, targetCanvas) {
    context.fillStyle = '#fff7f7';
    context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    for (let x = 0; x < targetCanvas.width; x += 12) { context.strokeStyle = '#fecaca'; context.lineWidth = 1; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, targetCanvas.height); context.stroke(); }
    for (let y = 0; y < targetCanvas.height; y += 12) { context.strokeStyle = '#fecaca'; context.lineWidth = 1; context.beginPath(); context.moveTo(0, y); context.lineTo(targetCanvas.width, y); context.stroke(); }
    for (let x = 0; x < targetCanvas.width; x += 60) { context.strokeStyle = '#fca5a5'; context.lineWidth = 1; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, targetCanvas.height); context.stroke(); }
    for (let y = 0; y < targetCanvas.height; y += 60) { context.strokeStyle = '#fca5a5'; context.lineWidth = 1; context.beginPath(); context.moveTo(0, y); context.lineTo(targetCanvas.width, y); context.stroke(); }
  }

  function selectedChannels() {
    if (!state.data) return [];
    if (state.leadMode === 'single') return [state.data.channels[state.leadIndex]].filter(Boolean);
    return state.data.channels;
  }

  function drawWaveform() {
    if (!state.data || !canvas || !ctx) return;
    drawGrid();
    const channels = selectedChannels();
    const left = plot.left, right = plot.right, top = plot.top, bottom = plot.bottom;
    const plotWidth = canvas.width - left - right;
    const rowHeight = (canvas.height - top - bottom) / Math.max(1, channels.length);
    const duration = state.data.durationSeconds || Math.max(...channels.flatMap(ch => ch.points.map(p => p[0])), 1);

    channels.forEach((channel, index) => {
      const centerY = top + rowHeight * index + rowHeight / 2;
      const amplitude = Math.max(18, rowHeight * 0.34);
      const min = channel.minimum;
      const max = channel.maximum;
      const range = max - min || 1;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2;
      ctx.beginPath();
      channel.points.forEach((point, pointIndex) => {
        const x = left + (point[0] / duration) * plotWidth;
        const normalized = (point[1] - min) / range - 0.5;
        const y = centerY - normalized * 2 * amplitude * state.scale;
        if (pointIndex === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = '700 16px Segoe UI, Arial';
      ctx.fillText(channel.label, 10, centerY - 8);
    });

    if (state.cursor) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(state.cursor.x, 0);
      ctx.lineTo(state.cursor.x, canvas.height);
      ctx.stroke();
    }
    [...state.calipers, state.draftCaliper].filter(Boolean).forEach((caliper, index) => drawCaliper(caliper, index + 1));
  }

  function drawCaliper(caliper, index) {
    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(caliper.start.x, caliper.start.y);
    ctx.lineTo(caliper.end.x, caliper.end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    [caliper.start, caliper.end].forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.strokeStyle = '#2563eb';
    });
    const midX = (caliper.start.x + caliper.end.x) / 2;
    const midY = (caliper.start.y + caliper.end.y) / 2;
    ctx.font = '700 14px Segoe UI, Arial';
    ctx.fillStyle = '#111827';
    ctx.fillText('#' + index + ' ' + formatCaliper(caliper).duration, midX + 8, midY - 8);
  }

  function updatePanels() {
    const data = state.data;
    $('studyTitle').textContent = data.studyDescription || 'ECG Waveform';
    $('studySub').textContent = [data.patientName, data.patientId, data.studyDate, data.studyTime].filter(Boolean).join(' - ');
    $('listPatient').textContent = data.patientName || data.patientId || 'ECG Study';
    $('listPatientMeta').textContent = [data.patientId, state.studies.length + ' ECG studies'].filter(Boolean).join(' - ') || 'Patient metadata unavailable';
    $('sampling').textContent = data.samplingFrequency ? data.samplingFrequency + ' Hz' : '-';
    $('duration').textContent = data.durationSeconds ? data.durationSeconds + ' s' : '-';
    const measurements = $('measurements');
    const annotationSection = $('annotationSection');
    measurements.innerHTML = '<thead><tr><th>Item</th><th>Value</th></tr></thead><tbody></tbody>';
    const measurementBody = measurements.querySelector('tbody');
    (data.annotations || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.tag + '</td><td>' + row.value + '</td>';
      measurementBody.appendChild(tr);
    });
    if (annotationSection) annotationSection.style.display = measurementBody.children.length ? '' : 'none';
    updateMarkers();
    updateChannelTable();
    const leadSelect = $('leadSelect');
    leadSelect.innerHTML = '';
    data.channels.forEach((channel, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = channel.label;
      leadSelect.appendChild(option);
    });
    renderStudyCards();
    renderComparisonGrid();
  }

  function studyDetail(data) {
    return [data.studyTime ? formatTime(data.studyTime) : '', data.channels.length + ' leads', data.durationSeconds ? data.durationSeconds + ' s' : ''].filter(Boolean).join(' - ');
  }

  function renderStudyCards() {
    const container = $('studyCards');
    if (!container) return;
    container.innerHTML = '';
    state.studies.forEach((study, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'study-card' + (index === state.activeStudyIndex ? ' active' : '');
      card.innerHTML = '<div class="study-card-top"><span class="study-badge">ECG</span><span class="patient-meta">' + formatDate(study.studyDate) + '</span></div>' +
        '<div class="study-name">' + (study.studyDescription || 'ECG Waveform') + '</div>' +
        '<div class="study-detail">' + studyDetail(study) + '</div><div class="study-wave"></div>';
      card.addEventListener('click', () => assignStudyToActiveViewport(index));
      container.appendChild(card);
    });
  }

  function renderComparisonGrid() {
    const container = $('comparisonGrid');
    if (!container) return;
    container.innerHTML = '';
    return;
    state.studies.forEach((study, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'compare-card' + (index === state.activeStudyIndex ? ' active' : '');
      card.innerHTML = '<div class="compare-title"><span>' + formatDate(study.studyDate) + ' ' + formatTime(study.studyTime) + '</span><span>' + (study.durationSeconds || '-') + ' s</span></div>';
      const mini = document.createElement('canvas');
      mini.className = 'compare-canvas';
      mini.width = 720;
      mini.height = 220;
      card.appendChild(mini);
      card.addEventListener('click', () => setActiveStudy(index));
      container.appendChild(card);
      drawStudyPreview(mini, study);
    });
  }

  function drawStudyPreview(targetCanvas, data) {
    const context = targetCanvas.getContext('2d');
    const channels = data.channels.slice(0, 3);
    drawGridOn(context, targetCanvas);
    const left = 42, right = 14, top = 20, bottom = 18;
    const width = targetCanvas.width - left - right;
    const rowHeight = (targetCanvas.height - top - bottom) / Math.max(1, channels.length);
    const duration = data.durationSeconds || Math.max(...channels.flatMap(ch => ch.points.map(p => p[0])), 1);
    channels.forEach((channel, index) => {
      const centerY = top + rowHeight * index + rowHeight / 2;
      const range = channel.maximum - channel.minimum || 1;
      const amplitude = Math.max(16, rowHeight * 0.32);
      context.strokeStyle = '#020617';
      context.lineWidth = 2;
      context.beginPath();
      channel.points.forEach((point, pointIndex) => {
        const x = left + (point[0] / duration) * width;
        const y = centerY - (((point[1] - channel.minimum) / range) - 0.5) * 2 * amplitude;
        if (pointIndex === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      context.fillStyle = '#111827';
      context.font = '700 12px Segoe UI, Arial';
      context.fillText(channel.label, 8, centerY - 4);
    });
  }

  function setActiveStudy(index) {
    const next = state.studies[index];
    if (!next) return;
    state.activeStudyIndex = index;
    state.data = next;
    state.leadIndex = 0;
    state.cursor = null;
    state.calipers = [];
    state.draftCaliper = null;
    updatePanels();
    drawWaveform();
  }

  function assignStudyToActiveViewport(index) {
    const viewport = state.viewports[state.activeViewportIndex];
    if (viewport) { viewport.studyIndex = index; viewport.calipers = []; state.calipers = viewport.calipers; }
    setActiveStudy(index);
    renderViewportShell();
    drawAllViewports();
  }

  function layoutCount(layout) {
    if (layout === '2x1' || layout === '1x2') return 2;
    if (layout === '2x2') return 4;
    return 1;
  }

  function activateViewport(index) {
    const viewport = state.viewports[index];
    if (!viewport) return;
    state.activeViewportIndex = index;
    canvas = viewport.canvas;
    ctx = viewport.ctx;
    state.activeStudyIndex = viewport.studyIndex || 0;
    state.data = state.studies[state.activeStudyIndex] || state.studies[0];
    state.calipers = viewport.calipers;
    renderViewportShell();
  }

  function renderViewportShell() {
    state.viewports.forEach((viewport, index) => {
      viewport.element.classList.toggle('active', index === state.activeViewportIndex);
      const study = state.studies[viewport.studyIndex];
      viewport.label.textContent = 'Viewport ' + (index + 1) + (study ? ' - ' + formatDate(study.studyDate) + ' ' + formatTime(study.studyTime) : ' - Empty');
    });
  }

  function updateChannelTable() {
    const channels = $('channels');
    if (!channels) return;
    channels.innerHTML = '<thead><tr><th>View</th><th>Lead</th><th>Range</th><th>Unit</th></tr></thead><tbody></tbody>';
    const body = channels.querySelector('tbody');
    const viewports = state.viewports.length ? state.viewports : [{ studyIndex: state.activeStudyIndex }];
    let rowCount = 0;
    viewports.forEach((viewport, viewportIndex) => {
      const study = state.studies[viewport.studyIndex] || state.data;
      if (!study) return;
      study.channels.forEach(channel => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>V' + (viewportIndex + 1) + '</td><td>' + channel.label + '</td><td>' + channel.minimum + ' to ' + channel.maximum + '</td><td>' + channel.unit + '</td>';
        body.appendChild(tr);
        rowCount += 1;
      });
    });
    if (!rowCount) body.innerHTML = '<tr><td colspan="4" class="muted-cell">No channel data.</td></tr>';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function preferredAnalysisChannel(data) {
    if (!data?.channels?.length) return null;
    return data.channels.find(ch => /^(ii|lead ii)$/i.test(String(ch.label || '').trim())) || data.channels[0];
  }

  function estimateHeartRate(channel) {
    if (!channel?.points?.length) return null;
    const points = channel.points;
    const values = points.map(point => Number(point[1])).filter(Number.isFinite);
    if (values.length < 10) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const threshold = min + (max - min) * 0.72;
    const refractorySeconds = 0.28;
    const peaks = [];
    for (let i = 1; i < points.length - 1; i += 1) {
      const prev = Number(points[i - 1][1]);
      const value = Number(points[i][1]);
      const next = Number(points[i + 1][1]);
      const time = Number(points[i][0]);
      if (!Number.isFinite(value) || !Number.isFinite(time)) continue;
      if (value >= threshold && value >= prev && value > next) {
        if (!peaks.length || time - peaks[peaks.length - 1].time >= refractorySeconds) {
          peaks.push({ time, value });
        } else if (value > peaks[peaks.length - 1].value) {
          peaks[peaks.length - 1] = { time, value };
        }
      }
    }
    if (peaks.length < 2) return null;
    const rr = [];
    for (let i = 1; i < peaks.length; i += 1) rr.push(peaks[i].time - peaks[i - 1].time);
    const avg = rr.reduce((sum, value) => sum + value, 0) / rr.length;
    if (!avg) return null;
    const variance = rr.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / rr.length;
    const sd = Math.sqrt(variance);
    return {
      bpm: Math.round(60 / avg),
      rrCount: rr.length,
      rrAverageMs: Math.round(avg * 1000),
      regularity: sd / avg < 0.12 ? 'regular' : 'irregular/variable',
    };
  }

  function buildAnalysis() {
    const data = state.data;
    if (!data) return null;
    const channel = preferredAnalysisChannel(data);
    const hr = estimateHeartRate(channel);
    const caliperLines = state.calipers.map((caliper, index) => {
      const formatted = formatCaliper(caliper);
      return 'Caliper #' + (index + 1) + ' (' + caliper.lead + '): ' + formatted.duration + ', delta ' + formatted.amplitude;
    });
    const lines = [
      'Sampling: ' + (data.samplingFrequency ? data.samplingFrequency + ' Hz' : 'not available'),
      'Duration: ' + (data.durationSeconds ? data.durationSeconds + ' s' : 'not available'),
      'Leads/channels: ' + (data.channels || []).map(ch => ch.label).join(', '),
      'Heart rate: ' + (hr ? hr.bpm + ' bpm estimated from ' + (channel?.label || 'selected lead') : 'not automatically measured'),
      'RR regularity: ' + (hr ? hr.regularity + ' (average RR ' + hr.rrAverageMs + ' ms)' : 'not automatically measured'),
      'PR interval: requires manual caliper/physician review.',
      'QRS duration: requires manual caliper/physician review.',
      'QT/QTc: requires manual caliper/physician review.',
      'Axis: not calculated from current waveform preview.',
      'ST-T: requires physician review; automated ischemia interpretation is not finalized.',
      ...(caliperLines.length ? ['Manual caliper measurements:', ...caliperLines] : ['Manual caliper measurements: none captured.']),
    ].filter(Boolean);
    return {
      studyInstanceUid: data.studyInstanceUid || studyUid,
      patientId: data.patientId || '',
      patientName: data.patientName || '',
      text: lines.join('\n'),
      html: lines.map(line => '<p>' + escapeHtml(line) + '</p>').join(''),
      measurements: { heartRate: hr, calipers: state.calipers.map(formatCaliper) },
    };
  }

  function runAnalysis() {
    const analysis = buildAnalysis();
    state.analysis = analysis;
    const output = $('analysisOutput');
    if (output) output.textContent = analysis ? analysis.text : 'Unable to analyze this ECG waveform.';
  }

  function copyAnalysisToClipboard() {
    if (!state.analysis) runAnalysis();
    if (!state.analysis) return;
    const text = state.analysis.text;
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          const output = $('analysisOutput');
          if (output) output.textContent = text + '\n\nCopied. Paste manually into the report field.';
        }).catch(error => {
          fallbackCopy(text);
          const output = $('analysisOutput');
          if (output) output.textContent = text + '\n\nCopied with fallback. Paste manually into the report field.';
        });
        return;
      }
      fallbackCopy(text);
      const output = $('analysisOutput');
      if (output) output.textContent = text + '\n\nCopied. Paste manually into the report field.';
    } catch (error) {
      const output = $('analysisOutput');
      if (output) output.textContent = text + '\n\nUnable to copy: ' + (error.message || String(error));
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  function createViewports() {
    const count = layoutCount(state.layout);
    viewportGrid.className = 'viewport-grid layout-' + state.layout;
    viewportGrid.innerHTML = '';
    state.viewports = Array.from({ length: count }, (_, index) => {
      const element = document.createElement('div');
      element.className = 'viewport';
      const label = document.createElement('div');
      label.className = 'viewport-label';
      const viewCanvas = document.createElement('canvas');
      viewCanvas.width = 1600;
      viewCanvas.height = 720;
      element.appendChild(label);
      element.appendChild(viewCanvas);
      viewportGrid.appendChild(element);
      const viewport = { element, label, canvas: viewCanvas, ctx: viewCanvas.getContext('2d'), studyIndex: Math.min(index, Math.max(0, state.studies.length - 1)), calipers: [] };
      element.addEventListener('click', () => activateViewport(index));
      viewCanvas.addEventListener('mousemove', event => { activateViewport(index); updateCursor(event); });
      viewCanvas.addEventListener('pointerdown', event => { activateViewport(index); startCaliper(event); });
      viewCanvas.addEventListener('pointermove', event => { activateViewport(index); moveCaliper(event); });
      viewCanvas.addEventListener('pointerup', event => { activateViewport(index); finishCaliper(event); });
      viewCanvas.addEventListener('wheel', event => { event.preventDefault(); activateViewport(index); state.scale = Math.max(0.35, Math.min(4, state.scale + (event.deltaY < 0 ? 0.15 : -0.15))); drawAllViewports(); }, { passive: false });
      return viewport;
    });
    activateViewport(Math.min(state.activeViewportIndex, count - 1));
    renderViewportShell();
    updateChannelTable();
  }

  function drawAllViewports() {
    const activeCanvas = canvas;
    const activeCtx = ctx;
    const activeData = state.data;
    const activeCalipers = state.calipers;
    state.viewports.forEach(viewport => {
      canvas = viewport.canvas;
      ctx = viewport.ctx;
      state.data = state.studies[viewport.studyIndex] || state.studies[0];
      state.calipers = viewport.calipers;
      drawWaveform();
    });
    canvas = activeCanvas;
    ctx = activeCtx;
    state.data = activeData;
    state.calipers = activeCalipers;
  }

  function updateMarkers() {
    const markers = $('markers');
    if (!markers) return;
    markers.innerHTML = '<thead><tr><th>#</th><th>Lead</th><th>Time</th><th>Delta</th></tr></thead><tbody></tbody>';
    const body = markers.querySelector('tbody');
    if (!state.calipers.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted-cell">No measurements yet.</td></tr>';
      return;
    }
    state.calipers.forEach((caliper, index) => {
      const result = formatCaliper(caliper);
      const tr = document.createElement('tr');
      tr.title = 'Start: ' + result.start + ' | End: ' + result.end;
      tr.innerHTML = '<td>' + (index + 1) + '</td><td>' + caliper.lead + '</td><td>' + result.duration + '</td><td>' + result.amplitude + '</td>';
      body.appendChild(tr);
    });
  }

  function formatCaliper(caliper) {
    const dt = Math.abs(caliper.end.time - caliper.start.time);
    const dv = caliper.end.value - caliper.start.value;
    const unit = caliper.unit || 'mV';
    return {
      duration: (dt * 1000).toFixed(1) + ' ms',
      amplitude: dv.toFixed(4) + ' ' + unit,
      start: caliper.start.time.toFixed(3) + 's / ' + caliper.start.value.toFixed(4) + ' ' + unit,
      end: caliper.end.time.toFixed(3) + 's / ' + caliper.end.value.toFixed(4) + ' ' + unit,
    };
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function pointToWaveform(point) {
    const channels = selectedChannels();
    if (!channels.length) return null;
    const duration = state.data.durationSeconds || Math.max(...channels.flatMap(ch => ch.points.map(p => p[0])), 1);
    const plotWidth = canvas.width - plot.left - plot.right;
    const rowHeight = (canvas.height - plot.top - plot.bottom) / Math.max(1, channels.length);
    const channelIndex = Math.max(0, Math.min(channels.length - 1, Math.floor((point.y - plot.top) / rowHeight)));
    const channel = channels[channelIndex];
    const centerY = plot.top + rowHeight * channelIndex + rowHeight / 2;
    const amplitude = Math.max(18, rowHeight * 0.34);
    const time = Math.max(0, Math.min(duration, ((point.x - plot.left) / plotWidth) * duration));
    const min = channel.minimum;
    const max = channel.maximum;
    const range = max - min || 1;
    const normalized = (centerY - point.y) / (2 * amplitude * state.scale);
    const value = (normalized + 0.5) * range + min;
    return { ...point, time, value, lead: channel.label, unit: channel.unit };
  }

  function formatDate(value) {
    if (!value || value.length !== 8) return value || '-';
    return value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8);
  }

  function formatTime(value) {
    if (!value || value.length < 6) return value || '';
    return value.slice(0, 2) + ':' + value.slice(2, 4) + ':' + value.slice(4, 6);
  }

  function updateCursor(event) {
    if (!state.data) return;
    if (state.draftCaliper) return;
    const point = canvasPoint(event);
    const wavePoint = pointToWaveform(point);
    if (!wavePoint) return;
    state.cursor = { x: point.x };
    const time = wavePoint.time;
    $('cursorTime').textContent = time.toFixed(3) + ' s';
    $('cursorValue').textContent = wavePoint.value.toFixed(4) + ' ' + wavePoint.unit;
    drawWaveform();
  }

  function startCaliper(event) {
    if (!state.caliperMode || !state.data) return;
    const start = pointToWaveform(canvasPoint(event));
    if (!start) return;
    state.draftCaliper = { start, end: start, lead: start.lead, unit: start.unit };
    canvas.setPointerCapture?.(event.pointerId);
    drawWaveform();
  }

  function moveCaliper(event) {
    if (!state.draftCaliper) return;
    const next = pointToWaveform(canvasPoint(event));
    if (!next) return;
    state.draftCaliper.end = next;
    drawWaveform();
  }

  function finishCaliper(event) {
    if (!state.draftCaliper) return;
    const next = pointToWaveform(canvasPoint(event));
    if (next) state.draftCaliper.end = next;
    if (Math.abs(state.draftCaliper.end.x - state.draftCaliper.start.x) > 4 || Math.abs(state.draftCaliper.end.y - state.draftCaliper.start.y) > 4) {
      state.calipers.push(state.draftCaliper);
    }
    state.draftCaliper = null;
    updateMarkers();
    drawWaveform();
  }

  $('viewportLayoutSelect').addEventListener('change', event => {
    state.layout = event.target.value;
    createViewports();
    drawAllViewports();
  });
  $('leadMode').addEventListener('change', event => { state.leadMode = event.target.value; drawAllViewports(); });
  $('leadSelect').addEventListener('change', event => { state.leadIndex = Number(event.target.value) || 0; drawAllViewports(); });
  $('caliperBtn').addEventListener('click', () => { state.caliperMode = !state.caliperMode; $('caliperBtn').classList.toggle('active', state.caliperMode); state.viewports.forEach(viewport => { viewport.canvas.style.cursor = state.caliperMode ? 'crosshair' : 'default'; }); });
  $('clearCalipersBtn').addEventListener('click', () => { const viewport = state.viewports[state.activeViewportIndex]; if (viewport) viewport.calipers = []; state.calipers = viewport ? viewport.calipers : []; state.draftCaliper = null; updateMarkers(); drawAllViewports(); });
  $('analyzePanelBtn')?.addEventListener('click', runAnalysis);
  $('copyAnalysisPanelBtn')?.addEventListener('click', copyAnalysisToClipboard);
  $('fitBtn').addEventListener('click', () => { state.scale = 1; drawAllViewports(); });

  if (!studyUid) { showError('StudyInstanceUIDs is required.'); return; }
  const loadWaveforms = studyUids.length > 1
    ? Promise.all(studyUids.map(uid => fetchJson('/rs/studies/' + encodeURIComponent(uid) + '/waveform').catch(() => null))).then(items => items.filter(Boolean))
    : fetchJson('/rs/studies/' + encodeURIComponent(studyUid) + '/waveforms').catch(() => fetchJson('/rs/studies/' + encodeURIComponent(studyUid) + '/waveform').then(item => [item]));
  loadWaveforms
    .then(items => { state.studies = Array.isArray(items) ? items : [items]; state.data = state.studies[0]; if (!state.data) throw new Error('Waveform data not found'); createViewports(); updatePanels(); drawAllViewports(); })
    .catch(error => showError(error.message || String(error)));
}());
