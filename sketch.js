const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const msg = document.getElementById('overlay-msg');

let video, offCanvas, offCtx;
let captured = false;
let capturedFrame = null;
let animId = null;

function W() { return window.innerWidth; }
function H() { return window.innerHeight - 52; }

function resize() {
  canvas.width = W();
  canvas.height = H();
  if (offCanvas) { offCanvas.width = W(); offCanvas.height = H(); }
}

window.addEventListener('resize', resize);
resize();

async function init() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      video.play();
      offCanvas = document.createElement('canvas');
      offCanvas.width = W();
      offCanvas.height = H();
      offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      msg.style.display = 'none';
      loop();
    };
  } catch (e) {
    msg.innerHTML = 'sin acceso a cámara<br><span style="font-size:10px;color:#333">permite el acceso y recarga la página</span>';
  }
}

function getParams() {
  return {
    text:   document.getElementById('txt').value || 'diseño',
    fsize:  parseInt(document.getElementById('fsize').value),
    thresh: parseInt(document.getElementById('thresh').value),
    mode:   document.getElementById('mode').value,
    mirror: document.getElementById('mirror').value === '1',
  };
}

function drawFrame(source) {
  const p = getParams();
  const cw = canvas.width, ch = canvas.height;

  offCanvas.width = cw;
  offCanvas.height = ch;

  // escalar video para llenar canvas
  const vw = source.videoWidth || source.width;
  const vh = source.videoHeight || source.height;
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale, dh = vh * scale;
  const dx = (cw - dw) / 2, dy = (ch - dh) / 2;

  offCtx.clearRect(0, 0, cw, ch);
  if (p.mirror) {
    offCtx.save();
    offCtx.translate(cw, 0);
    offCtx.scale(-1, 1);
    offCtx.drawImage(source, dx, dy, dw, dh);
    offCtx.restore();
  } else {
    offCtx.drawImage(source, dx, dy, dw, dh);
  }

  const imageData = offCtx.getImageData(0, 0, cw, ch);
  const data = imageData.data;

  // mapa de brillo
  const bright = new Uint8Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    bright[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // fondo negro
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);

  const fs = p.fsize;
  const lineH = Math.round(fs * 1.35);
  const words = (p.text + ' ').repeat(200).split(' ').filter(Boolean);
  let wi = 0;

  ctx.font = `${fs}px monospace`;
  ctx.textBaseline = 'top';

  for (let y = 0; y < ch; y += lineH) {
    let x = 0;
    while (x < cw) {
      const word = words[wi % words.length];
      const tw = ctx.measureText(word + ' ').width;
      const cx = Math.round(x + tw / 2);
      const cy = Math.round(y + lineH / 2);
      if (cx < cw && cy < ch) {
        const idx = cy * cw + cx;
        const lum = bright[idx] || 0;
        const inSilhouette = p.mode === 'dark' ? lum < p.thresh : lum >= p.thresh;
        if (inSilhouette) {
          const t = p.mode === 'dark'
            ? 1 - (lum / p.thresh) * 0.5
            : 0.4 + (lum / 255) * 0.6;
          ctx.globalAlpha = Math.min(1, Math.max(0.25, t));
          ctx.fillStyle = '#ffffff';
          ctx.fillText(word, x, y);
        }
      }
      x += tw;
      wi++;
    }
  }
  ctx.globalAlpha = 1;

  // scanlines sutiles
  for (let y = 0; y < ch; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, cw, 1);
  }

  // firma
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('REFLEXIÓN DE CIERRE · ' + new Date().toISOString().slice(0, 10), cw - 16, ch - 16);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

function loop() {
  if (!captured) {
    drawFrame(video);
    animId = requestAnimationFrame(loop);
  }
}

function capturar() {
  if (captured) {
    captured = false;
    capturedFrame = null;
    document.querySelector('.capture').textContent = '📷 capturar';
    loop();
  } else {
    captured = true;
    if (animId) cancelAnimationFrame(animId);
    const tmp = document.createElement('canvas');
    tmp.width = video.videoWidth;
    tmp.height = video.videoHeight;
    tmp.getContext('2d').drawImage(video, 0, 0);
    const img = new Image();
    img.src = tmp.toDataURL();
    img.onload = () => {
      capturedFrame = img;
      drawFrame(capturedFrame);
    };
    document.querySelector('.capture').textContent = '↺ volver al live';
  }
}

function exportar() {
  if (!captured) capturar();
  setTimeout(() => {
    const link = document.createElement('a');
    link.download = 'reflexion_silueta.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, 300);
}

// atajos de teclado
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); capturar(); }
  if (e.code === 'KeyE') exportar();
});

// actualización en vivo al cambiar parámetros
['txt', 'fsize', 'thresh', 'mode', 'mirror'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (captured && capturedFrame) drawFrame(capturedFrame);
  });
});

init();