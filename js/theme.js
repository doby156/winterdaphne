// ===== 테마 시스템 =====
// 배경/패널/포인트 색을 저장해두고, 글자색은 밝기를 계산해서 자동으로 맞춰줍니다.
// 라이트 모드/다크 모드는 각각 따로 색을 기억해서, 토글을 눌러도 서로 값을 덮어쓰지 않아요.

const THEME_KEY = 'chatapp_theme_v1';

const PALETTES = [
  { name: '코랄',    background: '#EEF1F0', panel: '#FFFFFF', accent: '#FF6B4A' },
  { name: '라벤더',  background: '#F1EEF7', panel: '#FFFFFF', accent: '#8B7FD1' },
  { name: '민트',    background: '#EAF5F1', panel: '#FFFFFF', accent: '#3FB88C' },
  { name: '선셋',    background: '#FBF1E8', panel: '#FFFFFF', accent: '#E0824A' },
  { name: '스카이',  background: '#EAF2F7', panel: '#FFFFFF', accent: '#4C93C4' },
  { name: '미드나잇', background: '#1B1F22', panel: '#242A2E', accent: '#5CC9FF' }
];

const DEFAULT_LIGHT = PALETTES[0];
const DEFAULT_DARK = PALETTES[5];

function loadThemeState() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.light && parsed.dark) return parsed;
    }
  } catch (e) {}
  return {
    darkMode: false,
    light: { background: DEFAULT_LIGHT.background, panel: DEFAULT_LIGHT.panel, accent: DEFAULT_LIGHT.accent },
    dark: { background: DEFAULT_DARK.background, panel: DEFAULT_DARK.panel, accent: DEFAULT_DARK.accent }
  };
}
function saveThemeState() {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(themeState)); } catch (e) {}
}

let themeState = loadThemeState();

// ---- 밝기 계산해서 어울리는 글자색 자동 선택 ----
function hexToRgb(hex) {
  let v = (hex || '').trim().replace('#', '');
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  const num = parseInt(v, 16);
  if (isNaN(num)) return { r: 255, g: 255, b: 255 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const chan = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}
function idealInk(hex) { return relativeLuminance(hex) > 0.5 ? '#1C2530' : '#EDEFEE'; }
function idealInkSoft(hex) { return relativeLuminance(hex) > 0.5 ? '#5B6672' : '#9BA3A8'; }
function idealAccentInk(hex) { return relativeLuminance(hex) > 0.5 ? '#1C2530' : '#FFFFFF'; }
// 배경이 어두우면 점무늬를 옅은 흰색으로, 밝으면 어두운 톤으로 자동 전환
function idealDotColor(hex) { return relativeLuminance(hex) > 0.5 ? 'rgba(28,37,48,0.14)' : 'rgba(255,255,255,0.16)'; }

function currentBucket() {
  return themeState.darkMode ? themeState.dark : themeState.light;
}

function applyTheme() {
  const bucket = currentBucket();
  const root = document.documentElement.style;
  root.setProperty('--paper', bucket.background);
  root.setProperty('--card', bucket.panel);
  root.setProperty('--accent', bucket.accent);
  root.setProperty('--page-ink', idealInk(bucket.background));
  root.setProperty('--page-ink-soft', idealInkSoft(bucket.background));
  root.setProperty('--card-ink', idealInk(bucket.panel));
  root.setProperty('--card-ink-soft', idealInkSoft(bucket.panel));
  root.setProperty('--accent-ink', idealAccentInk(bucket.accent));
  root.setProperty('--dot-color', idealDotColor(bucket.background));
  document.documentElement.classList.toggle('dark', themeState.darkMode);
}

function setPalette(p) {
  const bucket = currentBucket();
  bucket.background = p.background;
  bucket.panel = p.panel;
  bucket.accent = p.accent;
  applyTheme();
  saveThemeState();
  syncThemeUI();
}

function setCustomColor(field, hex) {
  const bucket = currentBucket();
  bucket[field] = hex;
  applyTheme();
  saveThemeState();
  syncThemeUI();
}

function toggleDarkMode(on) {
  themeState.darkMode = on;
  applyTheme();
  saveThemeState();
  syncThemeUI();
}

function syncThemeUI() {
  const bucket = currentBucket();
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) darkToggle.checked = themeState.darkMode;

  const bgInput = document.getElementById('customBgColor');
  const panelInput = document.getElementById('customPanelColor');
  const accentInput = document.getElementById('customAccentColor');
  if (bgInput) bgInput.value = bucket.background;
  if (panelInput) panelInput.value = bucket.panel;
  if (accentInput) accentInput.value = bucket.accent;

  document.querySelectorAll('.palette-swatch').forEach(el => {
    const p = PALETTES.find(pp => pp.name === el.dataset.paletteName);
    const isActive = p &&
      p.background.toLowerCase() === bucket.background.toLowerCase() &&
      p.accent.toLowerCase() === bucket.accent.toLowerCase();
    el.classList.toggle('active', !!isActive);
  });
}

function renderPaletteSwatches() {
  const grid = document.getElementById('paletteGrid');
  if (!grid) return;
  grid.innerHTML = '';
  PALETTES.forEach(p => {
    const el = document.createElement('div');
    el.className = 'palette-swatch';
    el.dataset.paletteName = p.name;
    el.innerHTML = `
      <div class="palette-dots">
        <span style="background:${p.background}"></span>
        <span style="background:${p.panel}"></span>
        <span style="background:${p.accent}"></span>
      </div>
      <div class="palette-name">${p.name}</div>
    `;
    el.addEventListener('click', () => setPalette(p));
    grid.appendChild(el);
  });
}

function initThemeUI() {
  renderPaletteSwatches();
  syncThemeUI();

  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) darkToggle.addEventListener('change', e => toggleDarkMode(e.target.checked));

  const bgInput = document.getElementById('customBgColor');
  if (bgInput) bgInput.addEventListener('input', e => setCustomColor('background', e.target.value));

  const panelInput = document.getElementById('customPanelColor');
  if (panelInput) panelInput.addEventListener('input', e => setCustomColor('panel', e.target.value));

  const accentInput = document.getElementById('customAccentColor');
  if (accentInput) accentInput.addEventListener('input', e => setCustomColor('accent', e.target.value));

  const openBtn = document.getElementById('themeBtn');
  const modal = document.getElementById('themeModal');
  const closeBtn = document.getElementById('closeTheme');
  if (openBtn && modal) openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
}

// 화면이 그려지기 전에 즉시 적용해서 색이 바뀌는 깜빡임(FOUC)을 막습니다.
applyTheme();
document.addEventListener('DOMContentLoaded', initThemeUI);
