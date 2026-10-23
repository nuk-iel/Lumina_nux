/**
 * Level editor entry point (editor.html): picks the UI language (./langBoot.js, first so every
 * module loads in it), then boots the EditorApp into #editor.
 */
import './langBoot.js';
import '@fontsource/cinzel/600.css';
import './editor.css';
import { EditorApp } from './EditorApp.js';
import { tr, editorLang } from './i18n.js';

// Chinese UI text: Noto Sans SC (unicode-range slices, fetched as glyphs appear); the system's CJK
// face (Microsoft YaHei, PingFang SC) shows until they arrive (editor.css :lang(zh-Hans))
if (editorLang() === 'zh') {
  import('@fontsource/noto-sans-sc/400.css').catch(() => {});
  import('@fontsource/noto-sans-sc/600.css').catch(() => {});
}

const root = document.getElementById('editor');
try {
  const app = new EditorApp(root);
  app.ready.finally(() => document.documentElement.classList.add('le-booted'));
} catch (e) {
  console.error('[editor] failed to start', e);
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'le-fatal';
  box.innerHTML = '<h1></h1><pre></pre>';
  box.querySelector('h1').textContent = tr('app.fatal');
  box.querySelector('pre').textContent = String(e?.stack ?? e);
  root.appendChild(box);
}
