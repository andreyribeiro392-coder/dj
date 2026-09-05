(() => {
  const $ = (selector) => document.querySelector(selector);
  const audio = $('#audio');
  const canvas = $('#visualizer');
  const ctx2d = canvas.getContext('2d');
  const storage = {
    uploads: 'aurora-free-uploads',
    exports: 'aurora-free-exports',
    exportHistory: 'aurora-export-history'
  };
  const state = {
    uploads: Number(localStorage.getItem(storage.uploads) || 0),
    exports: Number(localStorage.getItem(storage.exports) || 0),
    objectUrl: '',
    audioContext: null,
    source: null,
    bass: null,
    treble: null,
    analyser: null,
    recordDestination: null,
    muted: false,
    visual: 'bars',
    pointer: { x: .5, y: .5 },
    fileName: '',
    orientation: 'portrait',
    exportFormat: 'webm',
    style: 'aurora',
    accent: '#5be6ed',
    backgroundImage: null,
    backgroundVideo: null,
    backgroundUrl: '',
    exportHistory: (() => { try { return JSON.parse(localStorage.getItem('aurora-export-history') || '[]'); } catch { return []; } })(),
    lastExportUrl: '',
    isAdmin: false,
    fileBlob: null,
    fileKey: '',
    barCount: Number(localStorage.getItem('aurora-bar-count') || 96),
    visualIntensity: Number(localStorage.getItem('aurora-visual-intensity') || 100) / 100,
    visualRotation: Number(localStorage.getItem('aurora-visual-rotation') || 0),
    visualOpacity: Number(localStorage.getItem('aurora-visual-opacity') || 100) / 100,
    barPlacement: localStorage.getItem('aurora-bar-placement') || 'outside',
    backgroundFit: localStorage.getItem('aurora-bg-fit') || 'contain',
    bgOpacity: Number(localStorage.getItem('aurora-bg-opacity') || 100) / 100,
    bgZoom: Number(localStorage.getItem('aurora-bg-zoom') || 100) / 100,
    bgX: Number(localStorage.getItem('aurora-bg-x') || 0),
    bgY: Number(localStorage.getItem('aurora-bg-y') || 0),
    bgBrightness: Number(localStorage.getItem('aurora-bg-brightness') || 100),
    bgContrast: Number(localStorage.getItem('aurora-bg-contrast') || 100),
    bgBlur: Number(localStorage.getItem('aurora-bg-blur') || 0),
    visualLayer: localStorage.getItem('aurora-visual-layer') || 'front',
    exportName: localStorage.getItem('aurora-export-name') || '',
    currentRecorder: null,
    exportCancelled: false
  };
  const maxUploads = 2;
  const maxExports = 2;
  const stylePresets = {
    aurora: { primary: '#5be6ed', secondary: '#6e8cff', highlight: '#c8f36d' },
    ember: { primary: '#ff9966', secondary: '#ff4d7d', highlight: '#ffd166' },
    violet: { primary: '#c7a6ff', secondary: '#7c6cff', highlight: '#f0d7ff' },
    mono: { primary: '#e8f1f2', secondary: '#7f9297', highlight: '#ffffff' }
  };
  function currentPalette() {
    const preset = stylePresets[state.style] || stylePresets.aurora;
    return { primary: state.accent || preset.primary, secondary: preset.secondary, highlight: preset.highlight };
  }
  const sectionData = {
    library: {eyebrow:'WORKSPACE / LIBRARY', title:'Biblioteca', text:'Organize suas faixas e mantenha tudo pronto para a próxima sessão.', cards:[['Arquivos locais','Seus áudios ficam neste dispositivo. Nenhum arquivo é enviado automaticamente.','◫'],['Sessões recentes','Reabra uma sessão e continue de onde parou.','↺'],['Busca rápida','Encontre uma faixa pelo nome em poucos segundos.','⌕']]},
    visualizers: {eyebrow:'WORKSPACE / VISUALIZERS', title:'Visualizadores', text:'Escolha uma leitura visual para cada momento da sua música.', cards:[['Spectrum bars','Barras que respondem aos graves e agudos em tempo real.','▥'],['Orbit field','Partículas orbitais com movimento suave e profundo.','◌'],['Waveform','Onda contínua para acompanhar a dinâmica da faixa.','〰']]},
    mixer: {eyebrow:'TOOLS / MIXER', title:'Mixer', text:'Ajuste o equilíbrio da faixa com controles precisos.', cards:[['Low shelf','Reforce ou reduza os graves sem alterar o restante do espectro.','◒'],['High shelf','Dê presença aos agudos com suavidade.','⌁'],['Monitor local','Todo o processamento acontece no navegador.','●']]},
    presets: {eyebrow:'TOOLS / PRESETS', title:'Presets', text:'Salve combinações de mixer e visual para repetir seu estilo.', cards:[['Night drive','Graves presentes, brilho controlado e visual orbital.','✦'],['Clean room','Som equilibrado para podcasts e conteúdo falado.','✧'],['Pulse','Sensibilidade alta para batidas marcantes.','◉']]},
    exports: {eyebrow:'DELIVERY / EXPORTS', title:'Exportações', text:'Acompanhe seus dois envios disponíveis no plano Free.', cards:[['Áudio processado', 'Exporte a faixa com os filtros aplicados em WebM.','↗'],['Limite do plano', '2 uploads e 2 exportações por ciclo gratuito.','⊙'],['Pronto para API', 'Login Google e recursos premium serão conectados depois.','＋']]},
    settings: {eyebrow:'ACCOUNT / SETTINGS', title:'Configurações', text:'Preferências do workspace e integrações futuras.', cards:[['Conta Google','Área preparada para conectar o Google OAuth.','G'],['Preferências','Sensibilidade, tema e comportamento do player.','⚙'],['Privacidade','Arquivos processados localmente por padrão.','◆']]}
  };
  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 3200);
  }
  function saveCounters() {
    localStorage.setItem(storage.uploads, String(state.uploads));
    localStorage.setItem(storage.exports, String(state.exports));
    localStorage.setItem(storage.exportHistory, JSON.stringify(state.exportHistory));
  }
  const dbPromise = (() => {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
      const request = indexedDB.open('aurora-dj-workspace', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  })();
  function dbPut(key, value) {
    return dbPromise.then(db => new Promise(resolve => {
      if (!db) return resolve(false);
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    }));
  }
  function dbGet(key) {
    return dbPromise.then(db => new Promise(resolve => {
      if (!db) return resolve(null);
      const request = db.transaction('workspace').objectStore('workspace').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    }));
  }
  function persistSession() {
    if (!state.fileBlob) return Promise.resolve(false);
    return dbPut('session', {audio: state.fileBlob, name: state.fileName, type: state.fileBlob.type, key: state.fileKey});
  }
  async function restoreSession() {
    const record = await dbGet('session');
    if (!record || !record.audio || !record.name) return;
    try {
      const file = typeof File === 'function' ? new File([record.audio], record.name, {type: record.type || 'audio/mpeg'}) : record.audio;
      if (!file.name) file.name = record.name;
      loadFile(file, {restored: true});
      const imageRecord = await dbGet('background-image');
      const videoRecord = await dbGet('background-video');
      if (imageRecord?.blob) { const imageFile = typeof File === 'function' ? new File([imageRecord.blob], imageRecord.name || 'fundo.png', {type:imageRecord.type || imageRecord.blob.type}) : imageRecord.blob; setBackgroundImage(imageFile); }
      else if (videoRecord?.blob) { const videoFile = typeof File === 'function' ? new File([videoRecord.blob], videoRecord.name || 'fundo.mp4', {type:videoRecord.type || videoRecord.blob.type}) : videoRecord.blob; setBackgroundVideo(videoFile); }
      toast('Sessão restaurada neste dispositivo.');
    } catch (_) {}
  }
  function setBusy(node, busy, label) {
    if (!node) return;
    node.classList.toggle('is-loading', busy);
    node.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (label) node.setAttribute('data-loading-label', label);
  }
  function updateExportButton() {
    const button = $('#exportBtn');
    if (!button) return;
    button.textContent = state.exportFormat === 'mp3' ? '♪ Exportar MP3' : state.exportFormat === 'mp4' ? '▣ Exportar MP4' : '↗ Exportar WebM';
  }
  function updateQuota() {
    const quota = $('#quotaText');
    const bar = $('#quotaBar');
    const summary = $('#planSummary');
    if (quota) quota.textContent = state.isAdmin ? 'ACESSO ILIMITADO' : (maxUploads - state.uploads) + ' / ' + maxUploads + ' uploads';
    if (bar) { bar.style.width = state.isAdmin ? '100%' : Math.min(100, (state.uploads / maxUploads) * 100) + '%'; bar.classList.toggle('unlimited', state.isAdmin); }
    if (summary) summary.textContent = state.isAdmin ? 'Admin · acesso completo' : (maxUploads - state.uploads) + ' uploads · ' + (maxExports - state.exports) + ' exports';
    $('#exportCount').textContent = state.isAdmin ? 'ILIMITADO' : state.exports + ' / ' + maxExports;
    $('#exportBtn').disabled = !state.fileName || (!state.isAdmin && state.exports >= maxExports);
  }
  function setupAudioGraph() {
    if (state.audioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { toast('Seu navegador não suporta o processamento de áudio.'); return; }
    state.audioContext = new AudioContext();
    state.source = state.audioContext.createMediaElementSource(audio);
    state.bass = state.audioContext.createBiquadFilter();
    state.bass.type = 'lowshelf'; state.bass.frequency.value = 180; state.bass.gain.value = 0;
    state.treble = state.audioContext.createBiquadFilter();
    state.treble.type = 'highshelf'; state.treble.frequency.value = 3200; state.treble.gain.value = 0;
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 1024; state.analyser.smoothingTimeConstant = .7;
    state.recordDestination = state.audioContext.createMediaStreamDestination();
    state.source.connect(state.bass).connect(state.treble).connect(state.analyser);
    state.analyser.connect(state.audioContext.destination);
    state.analyser.connect(state.recordDestination);
  }
  function loadFile(file, options = {}) {
    if (!file || !String(file.type || '').startsWith('audio/')) { toast('Escolha um áudio válido: MP3, WAV ou OGG.'); return; }
    if (file.size > 100 * 1024 * 1024) { toast('Esse arquivo ultrapassa o limite de 100 MB.'); return; }
    const key = [file.name, file.size, file.lastModified || 0].join('|');
    if (key === state.fileKey && state.fileName) { toast('Essa faixa já está carregada.'); return; }
    if (!options.restored && !state.isAdmin && state.uploads >= maxUploads) { toast('Limite Free atingido: 2 uploads.'); return; }
    setBusy($('#dropzone'), true, 'Carregando áudio…');
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    state.fileBlob = file; state.fileKey = key; state.fileName = file.name || 'audio';
    if (!options.restored) { state.uploads += 1; saveCounters(); updateQuota(); }
    audio.src = state.objectUrl; audio.load();
    try { setupAudioGraph(); } catch (_) {}
    $('#trackInfo').classList.remove('empty');
    $('#trackInfo').innerHTML = '<div class="track-art">♪</div><div><b>' + escapeHtml(state.fileName) + '</b><small>' + formatSize(file.size) + ' · local</small></div><span class="track-time">—</span>';
    $('#nowTitle').textContent = state.fileName;
    $('#nowMeta').textContent = formatSize(file.size) + ' · pronto para mixar';
    $('#visualStatus').textContent = 'Faixa carregada';
    audio.addEventListener('loadedmetadata', () => setBusy($('#dropzone'), false), {once:true});
    persistSession();
    updateExportButton(); updateQuota();
    toast(options.restored ? 'Sessão recuperada.' : 'Áudio carregado. Pressione play para iniciar.');
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }
  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function formatTime(value) {
    if (!Number.isFinite(value)) return '—';
    const m = Math.floor(value / 60).toString().padStart(2, '0');
    const s = Math.floor(value % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }
  function togglePlay() {
    if (!state.fileName) { toast('Importe um áudio antes de reproduzir.'); return; }
    setupAudioGraph();
    if (state.audioContext && state.audioContext.state === 'suspended') state.audioContext.resume();
    if (audio.paused) audio.play().catch(() => toast('Toque novamente para iniciar o áudio.')); else audio.pause();
  }
  function setControl(id, value) {
    const n = Number(value);
    if (id === 'bass' && state.bass) state.bass.gain.value = n;
    if (id === 'treble' && state.treble) state.treble.gain.value = n;
    if (id === 'smooth' && state.analyser) state.analyser.smoothingTimeConstant = n / 100;
    if (id === 'bass') $('#bassValue').textContent = (n > 0 ? '+' : '') + n + ' dB';
    if (id === 'treble') $('#trebleValue').textContent = (n > 0 ? '+' : '') + n + ' dB';
    if (id === 'sensitivity') $('#sensitivityValue').textContent = n + '%';
    if (id === 'smooth') $('#smoothValue').textContent = n + '%';
  }
  function setVisualSetting(id, value) {
    const n = Number(value);
    if (id === 'barCount') state.barCount = n;
    if (id === 'visualIntensity') state.visualIntensity = n / 100;
    if (id === 'visualRotation') state.visualRotation = n;
    if (id === 'visualOpacity') state.visualOpacity = n / 100;
    if (id === 'barPlacement') state.barPlacement = value;
    localStorage.setItem('aurora-' + id.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), String(value));
    const labels = {barCount:n, visualIntensity:Math.round(state.visualIntensity*100)+'%', visualRotation:n+'°', visualOpacity:Math.round(state.visualOpacity*100)+'%'};
    const node = $('#' + id + 'Value'); if (node && labels[id] !== undefined) node.textContent = labels[id];
  }
  function setBackgroundSetting(id, value) {
    const n = Number(value);
    if (id === 'backgroundFit') state.backgroundFit = value;
    if (id === 'bgOpacity') state.bgOpacity = n / 100;
    if (id === 'bgZoom') state.bgZoom = n / 100;
    if (id === 'bgX') state.bgX = n;
    if (id === 'bgY') state.bgY = n;
    if (id === 'bgBrightness') state.bgBrightness = n;
    if (id === 'bgContrast') state.bgContrast = n;
    if (id === 'bgBlur') state.bgBlur = n;
    if (id === 'visualLayer') state.visualLayer = value;
    localStorage.setItem('aurora-' + id.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), String(value));
    const labels = {bgOpacity:Math.round(state.bgOpacity*100)+'%', bgZoom:Math.round(state.bgZoom*100)+'%', bgX:n+'%', bgY:n+'%', bgBrightness:n+'%', bgContrast:n+'%', bgBlur:n+'px'};
    const node = $('#' + id + 'Value'); if (node && labels[id] !== undefined) node.textContent = labels[id];
  }
  function resetControls() {
    [['bass',0],['treble',0],['sensitivity',70],['smooth',70]].forEach(([id,value]) => { const input = $('#' + id); input.value = value; setControl(id, value); });
    [['barCount',96],['visualIntensity',100],['visualRotation',0],['visualOpacity',100],['barPlacement','outside']].forEach(([id,value]) => { const input = $('#' + id); if (input) { input.value = value; setVisualSetting(id, value); } });
    [['bgOpacity',100],['bgZoom',100],['bgX',0],['bgY',0],['bgBrightness',100],['bgContrast',100],['bgBlur',0],['backgroundFit','contain'],['visualLayer','front']].forEach(([id,value]) => { const input = $('#' + id); if (input) { input.value = value; setBackgroundSetting(id, value); } });
    toast('Controles restaurados.');
  }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function drawMediaCover(media, w, h) {
    const mw = media.videoWidth || media.naturalWidth || 1;
    const mh = media.videoHeight || media.naturalHeight || 1;
    const scale = Math.max(w / mw, h / mh);
    const dw = mw * scale, dh = mh * scale;
    ctx2d.drawImage(media, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function drawMediaContain(media, w, h) {
    const mw = media.videoWidth || media.naturalWidth || 1;
    const mh = media.videoHeight || media.naturalHeight || 1;
    const baseScale = state.backgroundFit === 'cover' ? Math.max(w / mw, h / mh) : Math.min(w / mw, h / mh);
    const scale = baseScale * state.bgZoom;
    const dw = mw * scale, dh = mh * scale;
    const dx = (w - dw) / 2 + state.bgX / 100 * w * .45;
    const dy = (h - dh) / 2 + state.bgY / 100 * h * .45;
    ctx2d.save();
    ctx2d.globalAlpha = state.bgOpacity;
    ctx2d.filter = 'brightness(' + state.bgBrightness + '%) contrast(' + state.bgContrast + '%) blur(' + state.bgBlur + 'px)';
    ctx2d.fillStyle = '#03070b';
    ctx2d.fillRect(0, 0, w, h);
    ctx2d.drawImage(media, dx, dy, dw, dh);
    ctx2d.restore();
  }
  function drawBackground(w, h) {
    if (state.backgroundVideo && state.backgroundVideo.readyState >= 2) {
      drawMediaContain(state.backgroundVideo, w, h);
      return true;
    }
    if (state.backgroundImage && state.backgroundImage.complete) {
      drawMediaContain(state.backgroundImage, w, h);
      return true;
    }
    return false;
  }
  function drawVisualizer() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx2d.clearRect(0, 0, w, h);
    const hasBackground = drawBackground(w, h);
    const palette = currentPalette();
    if (!hasBackground) {
      const gradient = ctx2d.createRadialGradient(w * (.45 + (state.pointer.x - .5) * .12), h * (.46 + (state.pointer.y - .5) * .12), 8, w * .5, h * .5, Math.max(w, h) * .66);
      gradient.addColorStop(0, palette.primary + '44'); gradient.addColorStop(.45, '#0b202cee'); gradient.addColorStop(1, '#071015f5');
      ctx2d.fillStyle = gradient; ctx2d.fillRect(0, 0, w, h);
    } else {
      // Keep the selected image/video bright and readable; only add a very light contrast veil.
      ctx2d.fillStyle = '#02060a18';
      ctx2d.fillRect(0, 0, w, h);
    }
    const data = state.analyser ? new Uint8Array(state.analyser.frequencyBinCount) : new Uint8Array(128);
    if (state.analyser) state.analyser.getByteFrequencyData(data);
    const sensitivity = Number($('#sensitivity').value || 70) / 70;
    const average = data.reduce((a,b) => a + b, 0) / Math.max(1, data.length);
    ctx2d.save();
    ctx2d.globalAlpha = state.visualOpacity * (state.visualLayer === 'back' ? .42 : 1);
    if (state.visual === 'wave') drawWave(data, w, h, sensitivity);
    else if (state.visual === 'orbit') drawOrbit(data, w, h, sensitivity);
    else drawBars(data, w, h, sensitivity);
    ctx2d.restore();
    if (state.fileName && !audio.paused) $('#visualStatus').textContent = 'Reproduzindo · ' + Math.round(average) + ' signal';
    requestAnimationFrame(drawVisualizer);
  }
  function drawBars(data, w, h, sensitivity) {
    const palette = currentPalette();
    const cx = w * (.5 + (state.pointer.x - .5) * .035);
    const cy = h * (.5 + (state.pointer.y - .5) * .035);
    const radius = Math.min(w, h) * .19;
    const outer = Math.min(w, h) * .47;
    const count = Math.max(32, Math.min(128, state.barCount || 96));
    const step = Math.PI * 2 / count;
    const barWidth = Math.max(2, Math.min(8, radius * step * .68));
    const rotation = (state.visualRotation || 0) * Math.PI / 180 - Math.PI / 2;
    const intensity = Math.min(1.8, Math.max(.35, state.visualIntensity || 1)) * sensitivity;
    const now = performance.now() / 55;
    ctx2d.save();
    ctx2d.globalCompositeOperation = 'lighter';
    const aura = ctx2d.createRadialGradient(cx, cy, radius * .65, cx, cy, outer * 1.08);
    aura.addColorStop(0, palette.primary + '30'); aura.addColorStop(.6, palette.secondary + '0b'); aura.addColorStop(1, 'transparent');
    ctx2d.fillStyle = aura; ctx2d.beginPath(); ctx2d.arc(cx, cy, outer, 0, Math.PI * 2); ctx2d.fill();
    for (let i = 0; i < count; i++) {
      const value = (data[Math.floor(i * data.length / count)] || 0) / 255;
      const level = Math.pow(value, .68);
      const length = 9 + level * (outer - radius - 9) * intensity;
      const angle = i * step + rotation;
      const inner = radius + 5;
      const hue = (i / count * 360 + now) % 360;
      const color = state.style === 'mono' ? '#e8fbff' : 'hsl(' + hue + ' 92% ' + (57 + level * 15) + '%)';
      ctx2d.save();
      ctx2d.translate(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx2d.rotate(angle + Math.PI / 2);
      ctx2d.fillStyle = color; ctx2d.globalAlpha = .48 + level * .52;
      if (state.barPlacement === 'inside') ctx2d.fillRect(-barWidth / 2, -length, barWidth, length);
      else if (state.barPlacement === 'both') { const half = length / 2; ctx2d.fillRect(-barWidth / 2, 0, barWidth, half); ctx2d.fillRect(-barWidth / 2, -half, barWidth, half); }
      else ctx2d.fillRect(-barWidth / 2, 0, barWidth, length);
      ctx2d.restore();
    }
    ctx2d.globalCompositeOperation = 'source-over';
    const center = ctx2d.createRadialGradient(cx - radius * .25, cy - radius * .25, 2, cx, cy, radius);
    center.addColorStop(0, palette.highlight + '85'); center.addColorStop(.55, palette.primary + '52'); center.addColorStop(1, palette.secondary + '28');
    ctx2d.fillStyle = center; ctx2d.globalAlpha = .48;
    ctx2d.beginPath(); ctx2d.arc(cx, cy, radius, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.globalAlpha = 1; ctx2d.strokeStyle = palette.highlight + 'a8'; ctx2d.lineWidth = 1.5;
    ctx2d.beginPath(); ctx2d.arc(cx, cy, radius + 2, 0, Math.PI * 2); ctx2d.stroke();
    ctx2d.restore();
  }
  function drawWave(data, w, h, sensitivity) {
    const palette = currentPalette();
    ctx2d.lineWidth = 2; ctx2d.strokeStyle = palette.primary; ctx2d.shadowBlur = 18; ctx2d.shadowColor = palette.primary;
    ctx2d.beginPath();
    for (let i = 0; i < 128; i++) { const x = i / 127 * w; const v = ((data[i] || 0) / 255 - .5) * h * .55 * sensitivity; const y = h * .5 + v; if (i === 0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y); }
    ctx2d.stroke(); ctx2d.shadowBlur = 0;
    ctx2d.strokeStyle = palette.secondary + '55'; ctx2d.lineWidth = 1; ctx2d.beginPath(); ctx2d.moveTo(0,h*.5); ctx2d.lineTo(w,h*.5); ctx2d.stroke();
  }
  function drawOrbit(data, w, h, sensitivity) {
    const palette = currentPalette();
    const cx = w * (.5 + (state.pointer.x - .5) * .08), cy = h * (.5 + (state.pointer.y - .5) * .08);
    const radius = Math.min(w,h) * .22;
    for (let i = 0; i < 72; i++) {
      const value = (data[Math.floor(i * data.length / 72)] || 0) / 255;
      const angle = performance.now() / 3200 + i * Math.PI * 2 / 72;
      const r = radius + value * 70 * sensitivity;
      const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      ctx2d.fillStyle = i % 3 === 0 ? palette.highlight : (i % 2 ? palette.primary : palette.secondary);
      ctx2d.globalAlpha = .3 + value * .7;
      ctx2d.beginPath(); ctx2d.arc(x,y,2 + value * 4,0,Math.PI*2); ctx2d.fill();
    }
    ctx2d.globalAlpha = 1; ctx2d.strokeStyle = '#5be6ed3f'; ctx2d.lineWidth = 1; ctx2d.beginPath(); ctx2d.arc(cx,cy,radius,0,Math.PI*2); ctx2d.stroke();
    ctx2d.fillStyle = palette.highlight; ctx2d.globalAlpha = .65; ctx2d.beginPath(); ctx2d.arc(cx,cy,3 + (data[2]||0)/60,0,Math.PI*2); ctx2d.fill(); ctx2d.globalAlpha = 1;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function checkAdminAccess() {
    try {
      const response = await fetch('/api/admin-session', {credentials:'same-origin', cache:'no-store'});
      const data = await response.json();
      state.isAdmin = data.admin === true;
      updateQuota();
    } catch (_) {}
  }
  function renderExportHistory() {
    const node = $('#exportHistory');
    if (!node) return;
    if (!state.exportHistory.length) {
      node.innerHTML = '<span class="history-empty">Nenhuma exportação nesta sessão.</span>';
      return;
    }
    node.innerHTML = state.exportHistory.slice().reverse().map(item => {
      const time = new Date(item.time).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      return '<div class="history-item"><span class="history-icon">↗</span><span><b>' + escapeHtml(item.name) + '</b><small>' + escapeHtml(item.type.toUpperCase()) + ' · ' + time + '</small></span></div>';
    }).join('');
  }
  function rememberExport(type) {
    state.exportHistory.push({name: state.fileName || 'visualização', type, time: Date.now()});
    state.exportHistory = state.exportHistory.slice(-8);
    saveCounters();
    renderExportHistory();
  }
  function toInt16(channel) {
    const output = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) output[i] = Math.max(-1, Math.min(1, channel[i])) * 32767;
    return output;
  }
  async function exportMp3() {
    if (!window.lamejs) throw new Error('mp3-library');
    setExportProgress(5, 'Lendo áudio…');
    const response = await fetch(state.objectUrl);
    const buffer = await response.arrayBuffer();
    const decoded = await state.audioContext.decodeAudioData(buffer);
    let rendered = decoded;
    const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (OfflineAudioContext) {
      const offline = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
      const source = offline.createBufferSource();
      const bass = offline.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 180; bass.gain.value = Number($('#bass').value || 0);
      const treble = offline.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 3200; treble.gain.value = Number($('#treble').value || 0);
      source.buffer = decoded; source.connect(bass).connect(treble).connect(offline.destination); source.start();
      rendered = await offline.startRendering();
    }
    const channels = Math.min(2, rendered.numberOfChannels);
    const encoder = new lamejs.Mp3Encoder(channels, rendered.sampleRate, 128);
    const left = toInt16(rendered.getChannelData(0));
    const right = channels > 1 ? toInt16(rendered.getChannelData(1)) : left;
    const chunks = [];
    for (let i = 0; i < left.length; i += 1152) {
      if (state.exportCancelled) throw new Error('cancelled');
      const leftChunk = left.subarray(i, i + 1152), rightChunk = right.subarray(i, i + 1152);
      const encoded = channels > 1 ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk);
      if (encoded.length) chunks.push(new Int8Array(encoded));
      if (i % (1152 * 24) === 0) setExportProgress(10 + (i / left.length) * 82);
    }
    const flushed = encoder.flush(); if (flushed.length) chunks.push(new Int8Array(flushed));
    const blob = new Blob(chunks, {type:'audio/mpeg'});
    downloadBlob(blob, baseExportName() + '.mp3'); updateExportMeta('MP3', blob); setExportProgress(100, 'Concluído');
  }
  function exportVideo(format) {
    return new Promise((resolve, reject) => {
      if (!canvas.captureStream || !window.MediaRecorder) { reject(new Error('video-unsupported')); return; }
      const mimeCandidates = format === 'mp4' ? ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) { reject(new Error(format === 'mp4' ? 'mp4-unsupported' : 'video-unsupported')); return; }
      setupAudioGraph();
      const stream = canvas.captureStream(30);
      if (state.recordDestination) state.recordDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, {mimeType: mime});
      state.currentRecorder = recorder; state.exportCancelled = false;
      const chunks = []; let settled = false; const started = performance.now();
      const timer = setInterval(() => {
        const duration = Number(audio.duration) || 0; const percent = duration ? (audio.currentTime / duration) * 92 : Math.min(90, (performance.now() - started) / 1000);
        setExportProgress(percent, Math.round(percent) + '%');
      }, 250);
      const finish = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { if (!settled) { settled = true; clearInterval(timer); reject(new Error('recording')); } };
      recorder.onstop = () => {
        clearInterval(timer); state.currentRecorder = null;
        if (settled) return;
        if (state.exportCancelled) { settled = true; reject(new Error('cancelled')); return; }
        settled = true; const extension = format === 'mp4' ? 'mp4' : 'webm';
        const blob = new Blob(chunks, {type:mime});
        downloadBlob(blob, baseExportName() + '-visual.' + extension);
        if (state.lastExportUrl) URL.revokeObjectURL(state.lastExportUrl);
        state.lastExportUrl = URL.createObjectURL(blob);
        const preview = $('#exportPreview'); if (preview) { preview.src = state.lastExportUrl; preview.hidden = false; preview.load(); }
        updateExportMeta(format.toUpperCase(), blob); setExportProgress(100, 'Concluído'); resolve();
      };
      if (state.backgroundVideo) state.backgroundVideo.play().catch(() => {});
      audio.currentTime = 0; recorder.start(200);
      audio.play().then(() => audio.addEventListener('ended', finish, {once:true})).catch(() => { finish(); if (!settled) { settled = true; reject(new Error('audio-start')); } });
    });
  }
  async function exportAudio() {
    if (!state.fileName) { toast('Importe um áudio antes de exportar.'); return; }
    if (!state.isAdmin && state.exports >= maxExports) { toast('Limite Free atingido: 2 exportações.'); return; }
    const button = $('#exportBtn'), cancel = $('#cancelExportBtn');
    state.exportCancelled = false; button.disabled = true; button.classList.add('is-loading'); button.setAttribute('aria-busy','true'); button.textContent = 'Processando…';
    if (cancel) cancel.hidden = false; setExportProgress(2, 'Preparando…');
    try {
      setupAudioGraph();
      if (state.exportFormat === 'mp3') await exportMp3(); else await exportVideo(state.exportFormat);
      if (state.exportCancelled) throw new Error('cancelled');
      state.exports += 1; rememberExport(state.exportFormat); updateQuota(); toast('Exportação concluída.');
    } catch (error) {
      const message = error.message === 'mp4-unsupported' ? 'MP4 não é compatível neste navegador. Escolha WebM.' : error.message === 'mp3-library' ? 'O codificador MP3 não carregou. Recarregue e tente novamente.' : error.message === 'cancelled' ? 'Exportação cancelada.' : 'Não foi possível exportar. Verifique o formato e tente novamente.';
      toast(message);
    } finally {
      state.currentRecorder = null; button.classList.remove('is-loading'); button.removeAttribute('aria-busy'); if (cancel) cancel.hidden = true; hideExportProgress(); updateExportButton(); updateQuota();
    }
  }
  function updateBackgroundLabel(text) {
    const node = $('#backgroundInfo');
    if (node) node.textContent = text;
  }
  function setBackgroundImage(file) {
    if (!file || !String(file.type || '').startsWith('image/')) { toast('Escolha uma imagem JPG, PNG ou WEBP.'); return; }
    if (file.size > 100 * 1024 * 1024) { toast('A imagem ultrapassa 100 MB.'); return; }
    if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
    state.backgroundUrl = URL.createObjectURL(file); state.backgroundVideo = null;
    const image = new Image();
    image.onload = () => {
      state.backgroundImage = image;
      const imagePreview = $('#bgImagePreview'); if (imagePreview) { imagePreview.src = state.backgroundUrl; imagePreview.hidden = false; }
      const preview = $('#bgVideoPreview'); if (preview) { preview.pause(); preview.removeAttribute('src'); preview.hidden = true; }
      dbPut('background-image', {blob:file, name:file.name, type:file.type});
      dbPut('background-video', null);
      updateBackgroundLabel('Imagem de fundo ativa · ' + file.name); toast('Imagem adicionada e visível no visualizador.');
    };
    image.onerror = () => toast('Não foi possível ler essa imagem.');
    image.src = state.backgroundUrl;
  }
  function setBackgroundVideo(file) {
    if (!file || !String(file.type || '').startsWith('video/')) { toast('Escolha um vídeo MP4 ou WEBM.'); return; }
    if (file.size > 100 * 1024 * 1024) { toast('O vídeo de fundo ultrapassa 100 MB.'); return; }
    if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
    state.backgroundUrl = URL.createObjectURL(file); state.backgroundImage = null;
    const video = document.createElement('video');
    video.src = state.backgroundUrl; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
    setBusy($('#bgVideoInput'), true, 'Preparando vídeo…');
    video.addEventListener('loadeddata', () => {
      state.backgroundVideo = video; setBusy($('#bgVideoInput'), false);
      video.play().catch(() => {});
      const preview = $('#bgVideoPreview'); if (preview) { preview.src = state.backgroundUrl; preview.hidden = false; preview.load(); }
      const imagePreview = $('#bgImagePreview'); if (imagePreview) { imagePreview.removeAttribute('src'); imagePreview.hidden = true; }
      dbPut('background-video', {blob:file, name:file.name, type:file.type});
      dbPut('background-image', null);
      updateBackgroundLabel('Vídeo de fundo ativo · ' + file.name); toast('Vídeo de fundo pronto para exportar.');
    }, {once:true});
    video.addEventListener('error', () => { setBusy($('#bgVideoInput'), false); toast('Seu navegador não conseguiu ler este vídeo. Tente MP4 ou WEBM.'); }, {once:true});
    video.load();
  }
  function setExportProgress(percent, label) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    const wrap = $('#exportProgress'), bar = $('#exportProgressBar'), text = $('#exportProgressText');
    if (wrap) wrap.hidden = false;
    if (bar) bar.style.width = value + '%';
    if (text) text.textContent = label || Math.round(value) + '%';
  }
  function hideExportProgress() {
    const wrap = $('#exportProgress'); if (wrap) wrap.hidden = true;
  }
  function baseExportName() {
    const source = String(state.exportName || $('#exportName')?.value || state.fileName || 'aurora-visual');
    return source.trim().replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'aurora-visual';
  }
  function updateExportMeta(type, blob) {
    const node = $('#exportMeta'); if (!node || !blob) return;
    const orientation = state.orientation === 'portrait' ? '1080×1920' : '1920×1080';
    node.textContent = type === 'MP3' ? 'MP3 · ' + formatSize(blob.size) : type + ' · ' + orientation + ' · ' + formatSize(blob.size);
  }
  function cancelExport() {
    state.exportCancelled = true;
    if (state.currentRecorder && state.currentRecorder.state !== 'inactive') state.currentRecorder.stop();
    else toast('Cancelando exportação…');
  }
  function applyVisualStyle(style) {
    if (!stylePresets[style]) return;
    state.style = style;
    state.accent = stylePresets[style].primary;
    const picker = $('#accentColor');
    if (picker) picker.value = state.accent;
    document.documentElement.style.setProperty('--accent', state.accent);
    document.querySelectorAll('.style-chip').forEach(button => button.classList.toggle('active', button.dataset.style === style));
    toast('Estilo ' + style + ' aplicado.');
  }
  function renderDirectory(section) {
    const data = sectionData[section];
    const view = document.createElement('section');
    view.className = 'directory-view';
    if (section === 'library') {
      view.innerHTML = '<div class="directory-header"><div><p class="eyebrow">WORKSPACE / BIBLIOTECA</p><h1>Biblioteca</h1><p>Encontre suas faixas salvas neste dispositivo e reabra uma sessão.</p></div><button class="outline-btn" data-action="open-studio" type="button">＋ Importar faixa</button></div><div class="library-toolbar"><input data-library-search type="search" placeholder="Buscar faixa pelo nome…"><span class="library-count">' + (state.fileName ? '1 faixa disponível' : 'Nenhuma faixa') + '</span></div><div class="directory-cards library-list">' + (state.fileName ? '<article class="directory-card library-card"><span class="directory-icon">♫</span><h3>' + escapeHtml(state.fileName) + '</h3><p>' + formatSize(state.fileBlob?.size || 0) + ' · armazenada localmente</p><div class="card-actions"><button class="outline-btn" data-action="open-studio" type="button">Abrir no Studio</button><button class="danger-btn" data-action="clear-session" type="button">Excluir</button></div></article>' : '<div class="directory-empty">Nenhuma faixa salva ainda.<br><small>Importe um áudio no Studio para começar.</small></div>') + '</div>';
      return view;
    }
    if (section === 'exports') {
      view.innerHTML = '<div class="directory-header"><div><p class="eyebrow">DELIVERY / EXPORTAÇÕES</p><h1>Exportações</h1><p>Histórico das exportações desta sessão.</p></div><button class="outline-btn" data-action="open-studio" type="button">← Voltar ao Studio</button></div><div class="export-directory-list">' + (state.exportHistory.length ? state.exportHistory.slice().reverse().map(item => '<article class="history-item"><span class="history-icon">↗</span><span><b>' + escapeHtml(item.name) + '</b><small>' + escapeHtml(item.type.toUpperCase()) + ' · ' + new Date(item.time).toLocaleString('pt-BR') + '</small></span></article>').join('') : '<div class="directory-empty">Nenhuma exportação nesta sessão.</div>') + '</div>';
      return view;
    }
    view.innerHTML = '<div class="directory-header"><div><p class="eyebrow">' + data.eyebrow + '</p><h1>' + data.title + '</h1><p>' + data.text + '</p></div><button class="outline-btn" data-action="open-studio" type="button">← Voltar ao Studio</button></div><div class="directory-cards">' + data.cards.map((card, index) => '<article class="directory-card"><span class="directory-icon">' + card[2] + '</span><h3>' + card[0] + '</h3><p>' + card[1] + '</p><button class="outline-btn" data-action="' + section + '" data-index="' + index + '" type="button">' + (section === 'presets' ? 'Aplicar preset' : section === 'visualizers' ? 'Usar visual' : section === 'mixer' ? 'Abrir mixer' : 'Abrir no Studio') + '</button></article>').join('') + '</div>';
    return view;
  }
  function bindDirectoryActions(view, section) {
    view.querySelectorAll('[data-action="open-studio"]').forEach(button => button.onclick = () => showSection('studio'));
    const search = view.querySelector('[data-library-search]');
    if (search) search.oninput = () => view.querySelectorAll('.library-card').forEach(card => card.hidden = !card.textContent.toLowerCase().includes(search.value.toLowerCase()));
    view.querySelectorAll('[data-action="clear-session"]').forEach(button => $('#clearSession').click());
    view.querySelectorAll('[data-action="presets"]').forEach(button => button.onclick = () => {
      const values = [{bass:5,treble:2,sensitivity:85,smooth:60},{bass:0,treble:4,sensitivity:65,smooth:82},{bass:8,treble:5,sensitivity:120,smooth:45}][Number(button.dataset.index)] || {};
      Object.entries(values).forEach(([id,value]) => { const input=$('#'+id); if(input){input.value=value;setControl(id,value);} }); showSection('studio'); toast('Preset aplicado.');
    });
    view.querySelectorAll('[data-action="visualizers"]').forEach(button => button.onclick = () => { const modes=['bars','orbit','wave']; const mode=modes[Number(button.dataset.index)]||'bars'; state.visual=mode; document.querySelectorAll('[data-visual]').forEach(x=>x.classList.toggle('active',x.dataset.visual===mode)); showSection('studio'); toast('Visual ' + mode + ' selecionado.'); });
    view.querySelectorAll('[data-action="mixer"]').forEach(button => button.onclick = () => { showSection('studio'); document.querySelector('.mixer-panel')?.scrollIntoView({behavior:'smooth',block:'center'}); });
  }
  function showSection(section) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.section === section));
    $('#sectionTitle').textContent = section === 'studio' ? 'Studio' : sectionData[section].title;
    const studio = $('#studioSection'), bottom = document.querySelector('.bottom-grid'), info = document.querySelector('.info-strip');
    let view = $('#directoryView');
    if (section === 'studio') {
      studio.hidden = false; bottom.hidden = false; info.hidden = false; if (view) view.remove(); return;
    }
    studio.hidden = true; bottom.hidden = true; info.hidden = true;
    if (!view) { view = document.createElement('div'); view.id = 'directoryView'; $('.content').appendChild(view); }
    view.innerHTML = ''; view.appendChild(renderDirectory(section)); bindDirectoryActions(view, section);
  }
  function openLogin() { $('#loginModal').hidden = false; $('#loginStatus').textContent = window.DJ_CONFIG?.googleClientId ? 'Você será redirecionado para o login seguro do Google.' : 'Adicione o Client ID no arquivo config.js para ativar.'; }
  function closeLogin() { $('#loginModal').hidden = true; }
  function setupEvents() {
    $('#chooseFile').onclick = () => $('#fileInput').click();
    $('#dropzone').onclick = (event) => { if (event.target.id !== 'chooseFile') $('#fileInput').click(); };
    $('#dropzone').onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') $('#fileInput').click(); };
    $('#fileInput').onchange = (event) => loadFile(event.target.files[0]);
    ['dragenter','dragover'].forEach(type => $('#dropzone').addEventListener(type, e => { e.preventDefault(); $('#dropzone').classList.add('drag'); }));
    ['dragleave','drop'].forEach(type => $('#dropzone').addEventListener(type, e => { e.preventDefault(); $('#dropzone').classList.remove('drag'); }));
    $('#dropzone').addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
    $('#playBtn').onclick = togglePlay; audio.addEventListener('play', () => $('#playBtn').textContent = 'Ⅱ'); audio.addEventListener('pause', () => $('#playBtn').textContent = '▶');
    audio.addEventListener('loadedmetadata', () => { const time = $('.track-time'); if (time) time.textContent = formatTime(audio.duration); });
    $('#exportBtn').onclick = exportAudio; $('#cancelExportBtn')?.addEventListener('click', cancelExport); $('#resetControls').onclick = resetControls;
    ['bass','treble','sensitivity','smooth'].forEach(id => $('#' + id).addEventListener('input', e => setControl(id, e.target.value)));
    $('#muteBtn').onclick = () => { state.muted = !state.muted; audio.muted = state.muted; $('#muteBtn').textContent = state.muted ? 'Unmute' : 'Mute'; };
    document.querySelectorAll('[data-visual]').forEach(btn => btn.onclick = () => { state.visual = btn.dataset.visual; document.querySelectorAll('[data-visual]').forEach(x => x.classList.toggle('active', x === btn)); });
    ['barCount','visualIntensity','visualRotation','visualOpacity','barPlacement'].forEach(id => { const input=$('#'+id); if(input){ input.value = id==='barCount'?state.barCount:id==='visualIntensity'?Math.round(state.visualIntensity*100):id==='visualRotation'?state.visualRotation:id==='visualOpacity'?Math.round(state.visualOpacity*100):state.barPlacement; input.addEventListener('input', e => setVisualSetting(id, e.target.value)); setVisualSetting(id,input.value); } });
    document.querySelectorAll('.nav-item').forEach(item => item.onclick = () => { showSection(item.dataset.section); $('#sidebar').classList.remove('open'); });
    $('#menuToggle').onclick = () => $('#sidebar').classList.add('open'); $('#closeMenu').onclick = () => $('#sidebar').classList.remove('open');
    if ($('#googleLogin')) $('#googleLogin').onclick = (event) => { event.preventDefault(); window.location.assign('/login.html'); }; if ($('#avatar')) $('#avatar').onclick = (event) => { event.preventDefault(); window.location.assign('/login.html'); }; if ($('#closeModal')) $('#closeModal').onclick = closeLogin; $('#loginModal').onclick = e => { if (e.target.id === 'loginModal') closeLogin(); };
    const connectGoogle = $('#connectGoogle');
    if (connectGoogle) connectGoogle.onclick = () => {
      const status = $('#loginStatus');
      const clientId = String(window.DJ_CONFIG?.googleClientId || '837012342265-qmmiq0uthb1v7umr4p4fa6lo619plpna.apps.googleusercontent.com').trim();
      if (!clientId) { if (status) status.textContent = 'Configure o Client ID público no arquivo config.js primeiro.'; return; }
      const stateToken = (window.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
      localStorage.setItem('aurora-oauth-state', stateToken);
      if (status) status.textContent = 'Redirecionando para o Google...';
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: window.location.origin + '/auth-callback.html',
        response_type: 'token',
        scope: 'openid email profile',
        include_granted_scopes: 'true',
        prompt: 'select_account',
        state: stateToken
      });
      window.location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
    };
    $('#clearSession').onclick = () => {
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
      if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
      state.objectUrl=''; state.fileBlob=null; state.fileKey=''; state.fileName=''; state.backgroundUrl=''; state.backgroundImage=null; state.backgroundVideo=null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      const imagePreview=$('#bgImagePreview'), videoPreview=$('#bgVideoPreview'); if(imagePreview){imagePreview.removeAttribute('src');imagePreview.hidden=true;} if(videoPreview){videoPreview.pause();videoPreview.removeAttribute('src');videoPreview.hidden=true;}
      $('#trackInfo').classList.add('empty'); $('#trackInfo').innerHTML='<div class="track-art">♪</div><div><b>Nenhuma faixa carregada</b><small>Seu áudio fica somente neste dispositivo</small></div><span class="track-time">—</span>';
      $('#nowTitle').textContent='Nenhuma faixa selecionada'; $('#nowMeta').textContent='Importe um áudio para começar';
      dbPut('session', null); dbPut('background-image', null); dbPut('background-video', null);
      updateQuota(); updateExportButton(); toast('Sessão limpa.'); 
    };
    $('#learnMore').onclick = () => toast('O áudio é analisado localmente com a Web Audio API.');
    document.addEventListener('pointermove', event => { state.pointer.x = event.clientX / window.innerWidth; state.pointer.y = event.clientY / window.innerHeight; document.documentElement.style.setProperty('--mx', state.pointer.x); document.documentElement.style.setProperty('--my', state.pointer.y); $('.liquid-a').style.transform = 'translate(' + ((state.pointer.x - .5) * 90) + 'px,' + ((state.pointer.y - .5) * 70) + 'px)'; $('.liquid-b').style.transform = 'translate(' + ((.5 - state.pointer.x) * 80) + 'px,' + ((.5 - state.pointer.y) * 60) + 'px)'; });
    const orientationSelect = $('#orientationSelect');
    const canvasWrap = $('#canvasWrap');
    if (canvasWrap) canvasWrap.classList.toggle('landscape', state.orientation === 'landscape');
    if (orientationSelect) orientationSelect.onchange = event => {
      state.orientation = event.target.value;
      $('#canvasWrap')?.classList.toggle('landscape', state.orientation === 'landscape');
      resizeCanvas();
    };
    const formatSelect = $('#exportFormat');
    if (formatSelect) formatSelect.onchange = event => {
      state.exportFormat = event.target.value;
      const button = $('#exportBtn');
      updateExportButton();
    };
    const imageInput = $('#bgImageInput');
    if (imageInput) imageInput.onchange = event => setBackgroundImage(event.target.files[0]);
    const videoInput = $('#bgVideoInput');
    if (videoInput) videoInput.onchange = event => setBackgroundVideo(event.target.files[0]);
    ['bgOpacity','bgZoom','bgX','bgY','bgBrightness','bgContrast','bgBlur','backgroundFit','visualLayer'].forEach(id => { const input=$('#'+id); if(input){ input.value = id==='bgOpacity'?Math.round(state.bgOpacity*100):id==='bgZoom'?Math.round(state.bgZoom*100):id==='bgX'?state.bgX:id==='bgY'?state.bgY:id==='bgBrightness'?state.bgBrightness:id==='bgContrast'?state.bgContrast:id==='bgBlur'?state.bgBlur:id==='backgroundFit'?state.backgroundFit:state.visualLayer; input.addEventListener('input', e => setBackgroundSetting(id, e.target.value)); input.addEventListener('change', e => setBackgroundSetting(id, e.target.value)); setBackgroundSetting(id,input.value); } });
    const exportName = $('#exportName'); if (exportName) { exportName.value = state.exportName; exportName.oninput = e => { state.exportName=e.target.value; localStorage.setItem('aurora-export-name',state.exportName); }; }
    document.querySelectorAll('.style-chip').forEach(button => button.onclick = () => applyVisualStyle(button.dataset.style));
    const accentPicker = $('#accentColor');
    if (accentPicker) accentPicker.oninput = event => {
      state.accent = event.target.value;
      document.documentElement.style.setProperty('--accent', state.accent);
      state.style = 'custom';
      document.querySelectorAll('.style-chip').forEach(button => button.classList.remove('active'));
    };
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('keydown', event => { if (event.code === 'Space' && !/input|textarea|select/i.test(document.activeElement.tagName)) { event.preventDefault(); togglePlay(); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') { event.preventDefault(); exportAudio(); } if (event.key === 'Escape') closeLogin(); });
  }
  const savedEmail = localStorage.getItem('aurora-google-email');
  if (savedEmail) $('#avatar').textContent = savedEmail.charAt(0).toUpperCase();
  updateExportButton(); updateQuota(); renderExportHistory(); setupEvents(); checkAdminAccess(); restoreSession(); resizeCanvas(); drawVisualizer();
})();