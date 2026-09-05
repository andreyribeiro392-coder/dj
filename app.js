(() => {
  const $ = (selector) => document.querySelector(selector);
  const audio = $('#audio');
  const canvas = $('#visualizer');
  const ctx2d = canvas.getContext('2d');
  const storage = {
    uploads: 'aurora-free-uploads',
    exports: 'aurora-free-exports'
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
    backgroundUrl: ''
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
  }
  function updateQuota() {
    const quota = $('#quotaText');
    const bar = $('#quotaBar');
    const summary = $('#planSummary');
    if (quota) quota.textContent = (maxUploads - state.uploads) + ' / ' + maxUploads + ' uploads';
    if (bar) bar.style.width = Math.min(100, (state.uploads / maxUploads) * 100) + '%';
    if (summary) summary.textContent = (maxUploads - state.uploads) + ' uploads · ' + (maxExports - state.exports) + ' exports';
    $('#exportCount').textContent = state.exports + ' / ' + maxExports;
    $('#exportBtn').disabled = !state.fileName || state.exports >= maxExports;
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
  function loadFile(file) {
    if (!file || !file.type.startsWith('audio/')) { toast('Escolha um arquivo de áudio válido.'); return; }
    if (state.uploads >= maxUploads) { toast('Limite Free atingido: 2 uploads.'); return; }
    if (file.size > 100 * 1024 * 1024) { toast('Esse arquivo ultrapassa o limite de 100 MB.'); return; }
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    state.fileName = file.name;
    state.uploads += 1; saveCounters(); updateQuota();
    audio.src = state.objectUrl; audio.load(); setupAudioGraph();
    $('#trackInfo').classList.remove('empty');
    $('#trackInfo').innerHTML = '<div class="track-art">♪</div><div><b>' + escapeHtml(file.name) + '</b><small>' + formatSize(file.size) + ' · local</small></div><span class="track-time">—</span>';
    $('#nowTitle').textContent = file.name;
    $('#nowMeta').textContent = formatSize(file.size) + ' · pronto para mixar';
    $('#visualStatus').textContent = 'Faixa carregada';
    toast('Áudio carregado. Pressione play para iniciar.');
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
  function resetControls() {
    [['bass',0],['treble',0],['sensitivity',70],['smooth',70]].forEach(([id,value]) => { const input = $('#' + id); input.value = value; setControl(id, value); });
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
  function drawBackground(w, h) {
    if (state.backgroundVideo && state.backgroundVideo.readyState >= 2) {
      drawMediaCover(state.backgroundVideo, w, h);
      ctx2d.fillStyle = '#05090dcc';
      ctx2d.fillRect(0, 0, w, h);
    } else if (state.backgroundImage && state.backgroundImage.complete) {
      drawMediaCover(state.backgroundImage, w, h);
      ctx2d.fillStyle = '#05090dcc';
      ctx2d.fillRect(0, 0, w, h);
    }
  }
  function drawVisualizer() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx2d.clearRect(0, 0, w, h);
    drawBackground(w, h);
    const palette = currentPalette();
    const gradient = ctx2d.createRadialGradient(w * (.45 + (state.pointer.x - .5) * .12), h * (.46 + (state.pointer.y - .5) * .12), 8, w * .5, h * .5, Math.max(w, h) * .66);
    gradient.addColorStop(0, palette.primary + '44'); gradient.addColorStop(.45, '#0b202cee'); gradient.addColorStop(1, '#071015f5');
    ctx2d.fillStyle = gradient; ctx2d.fillRect(0, 0, w, h);
    const data = state.analyser ? new Uint8Array(state.analyser.frequencyBinCount) : new Uint8Array(128);
    if (state.analyser) state.analyser.getByteFrequencyData(data);
    const sensitivity = Number($('#sensitivity').value || 70) / 70;
    const average = data.reduce((a,b) => a + b, 0) / Math.max(1, data.length);
    if (state.visual === 'wave') drawWave(data, w, h, sensitivity);
    else if (state.visual === 'orbit') drawOrbit(data, w, h, sensitivity);
    else drawBars(data, w, h, sensitivity);
    if (state.fileName && !audio.paused) $('#visualStatus').textContent = 'Reproduzindo · ' + Math.round(average) + ' signal';
    requestAnimationFrame(drawVisualizer);
  }
  function drawBars(data, w, h, sensitivity) {
    const palette = currentPalette();
    const count = 64, gap = 3, width = (w - gap * (count - 1) - 42) / count;
    const base = h * .75;
    for (let i = 0; i < count; i++) {
      const index = Math.floor(i * data.length / count);
      const value = (data[index] || 0) / 255;
      const height = Math.max(3, value * h * .55 * sensitivity);
      const x = 21 + i * (width + gap);
      const g = ctx2d.createLinearGradient(0, base - height, 0, base);
      g.addColorStop(0, palette.highlight); g.addColorStop(.5, palette.primary); g.addColorStop(1, palette.secondary);
      ctx2d.fillStyle = g; ctx2d.globalAlpha = .35 + value * .65;
      ctx2d.fillRect(x, base - height, width, height);
    }
    ctx2d.globalAlpha = 1;
    ctx2d.strokeStyle = '#5be6ed28'; ctx2d.lineWidth = 1; ctx2d.beginPath(); ctx2d.moveTo(20, base + 1); ctx2d.lineTo(w - 20, base + 1); ctx2d.stroke();
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
  function toInt16(channel) {
    const output = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) output[i] = Math.max(-1, Math.min(1, channel[i])) * 32767;
    return output;
  }
  async function exportMp3() {
    if (!window.lamejs) throw new Error('mp3-library');
    const response = await fetch(state.objectUrl);
    const buffer = await response.arrayBuffer();
    const decoded = await state.audioContext.decodeAudioData(buffer);
    const channels = Math.min(2, decoded.numberOfChannels);
    const encoder = new lamejs.Mp3Encoder(channels, decoded.sampleRate, 128);
    const left = toInt16(decoded.getChannelData(0));
    const right = channels > 1 ? toInt16(decoded.getChannelData(1)) : left;
    const chunks = [];
    for (let i = 0; i < left.length; i += 1152) {
      const leftChunk = left.subarray(i, i + 1152);
      const rightChunk = right.subarray(i, i + 1152);
      const encoded = channels > 1 ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk);
      if (encoded.length) chunks.push(new Int8Array(encoded));
    }
    const flushed = encoder.flush();
    if (flushed.length) chunks.push(new Int8Array(flushed));
    downloadBlob(new Blob(chunks, {type:'audio/mpeg'}), (state.fileName.replace(/\.[^/.]+$/, '') || 'aurora-audio') + '.mp3');
  }
  function exportVideo(format) {
    return new Promise((resolve, reject) => {
      if (!canvas.captureStream || !window.MediaRecorder) { reject(new Error('video-unsupported')); return; }
      const mimeCandidates = format === 'mp4'
        ? ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) { reject(new Error(format === 'mp4' ? 'mp4-unsupported' : 'video-unsupported')); return; }
      setupAudioGraph();
      const stream = canvas.captureStream(30);
      state.recordDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, {mimeType: mime});
      const chunks = [];
      let settled = false;
      const finish = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { if (!settled) { settled = true; reject(new Error('recording')); } };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        const extension = format === 'mp4' ? 'mp4' : 'webm';
        downloadBlob(new Blob(chunks, {type:mime}), (state.fileName.replace(/\.[^/.]+$/, '') || 'aurora-video') + '-visual.' + extension);
        resolve();
      };
      if (state.backgroundVideo) state.backgroundVideo.play().catch(() => {});
      audio.currentTime = 0;
      recorder.start(200);
      audio.play().then(() => audio.addEventListener('ended', finish, {once:true})).catch(() => { finish(); reject(new Error('audio-start')); });
    });
  }
  async function exportAudio() {
    if (!state.fileName) { toast('Importe um áudio antes de exportar.'); return; }
    if (state.exports >= maxExports) { toast('Limite Free atingido: 2 exportações.'); return; }
    const button = $('#exportBtn');
    button.disabled = true;
    button.textContent = 'Processando...';
    try {
      setupAudioGraph();
      if (state.exportFormat === 'mp3') await exportMp3();
      else await exportVideo(state.exportFormat);
      state.exports += 1; saveCounters(); updateQuota(); toast('Exportação concluída.');
    } catch (error) {
      const message = error.message === 'mp4-unsupported'
        ? 'MP4 não é compatível neste navegador. Escolha WebM ou use outro navegador.'
        : error.message === 'mp3-library'
          ? 'O codificador MP3 não carregou. Recarregue a página e tente novamente.'
          : 'Não foi possível exportar neste navegador.';
      toast(message);
    } finally {
      button.textContent = '↗ Exportar resultado';
      updateQuota();
    }
  }
  function updateBackgroundLabel(text) {
    const node = $('#backgroundInfo');
    if (node) node.textContent = text;
  }
  function setBackgroundImage(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Escolha uma imagem válida.'); return; }
    if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
    state.backgroundUrl = URL.createObjectURL(file);
    state.backgroundVideo = null;
    const image = new Image();
    image.onload = () => { state.backgroundImage = image; updateBackgroundLabel('Imagem de fundo ativa · ' + file.name); toast('Imagem de fundo adicionada.'); };
    image.src = state.backgroundUrl;
  }
  function setBackgroundVideo(file) {
    if (!file || !file.type.startsWith('video/')) { toast('Escolha um vídeo válido.'); return; }
    if (file.size > 100 * 1024 * 1024) { toast('O vídeo de fundo ultrapassa 100 MB.'); return; }
    if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
    state.backgroundUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = state.backgroundUrl; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
    video.addEventListener('loadeddata', () => { state.backgroundVideo = video; state.backgroundImage = null; video.play().catch(() => {}); updateBackgroundLabel('Vídeo de fundo ativo · ' + file.name); toast('Vídeo de fundo adicionado.'); });
    video.load();
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
    view.innerHTML = '<div class="directory-header"><div><p class="eyebrow">' + data.eyebrow + '</p><h1>' + data.title + '</h1><p>' + data.text + '</p></div><span class="status-chip">PREPARADO</span></div><div class="directory-cards">' + data.cards.map(card => '<article class="directory-card"><span class="directory-icon">' + card[2] + '</span><h3>' + card[0] + '</h3><p>' + card[1] + '</p><button class="outline-btn" type="button">Abrir módulo</button></article>').join('') + '</div>';
    return view;
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
    view.innerHTML = ''; view.appendChild(renderDirectory(section));
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
    $('#exportBtn').onclick = exportAudio; $('#resetControls').onclick = resetControls;
    ['bass','treble','sensitivity','smooth'].forEach(id => $('#' + id).addEventListener('input', e => setControl(id, e.target.value)));
    $('#muteBtn').onclick = () => { state.muted = !state.muted; audio.muted = state.muted; $('#muteBtn').textContent = state.muted ? 'Unmute' : 'Mute'; };
    document.querySelectorAll('[data-visual]').forEach(btn => btn.onclick = () => { state.visual = btn.dataset.visual; document.querySelectorAll('[data-visual]').forEach(x => x.classList.toggle('active', x === btn)); });
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
    $('#clearSession').onclick = () => { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); state.objectUrl=''; state.fileName=''; audio.removeAttribute('src'); audio.load(); $('#trackInfo').classList.add('empty'); $('#trackInfo').innerHTML='<div class="track-art">♪</div><div><b>Nenhuma faixa carregada</b><small>Seu áudio fica somente neste dispositivo</small></div><span class="track-time">—</span>'; $('#nowTitle').textContent='Nenhuma faixa selecionada'; $('#nowMeta').textContent='Importe um áudio para começar'; updateQuota(); toast('Sessão limpa.'); };
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
      if (button) button.textContent = state.exportFormat === 'mp3' ? '♪ Exportar MP3' : state.exportFormat === 'mp4' ? '▣ Exportar MP4' : '↗ Exportar WebM';
    };
    const imageInput = $('#bgImageInput');
    if (imageInput) imageInput.onchange = event => setBackgroundImage(event.target.files[0]);
    const videoInput = $('#bgVideoInput');
    if (videoInput) videoInput.onchange = event => setBackgroundVideo(event.target.files[0]);
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
  updateQuota(); setupEvents(); resizeCanvas(); drawVisualizer();
})();