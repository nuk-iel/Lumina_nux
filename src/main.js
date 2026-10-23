/**
 * Luminati 2.5D pixel-art engine — game entry point. Plays a Luminati level (docs/contracts/LEVEL_EDITOR.md):
 *   (no query)              Emberfall, from public/levels/emberfall.json
 *   ?level=<name>           public/levels/<name>.json
 *   ?level=local:<slot>     a level saved in this browser (the editor's play-test uses
 *                           local:__playtest__)
 *   ?autostart=1            skips the title screen (play-tests, the headless check harness)
 *   ?campaign=<name>        a campaign (docs/specs/CAMPAIGN_FORMAT.md):
 *                           public/campaigns/<name>/campaign.json — the saved game in this
 *                           browser, else the start; with it:
 *     &new=1                  forget the saved game and start over
 *     &level=<id>             start in that level of the campaign (a fresh story; `&entrance=`
 *                             names the entrance, else its player start)
 *     &level=local:<slot>&as=<id>   play a level from browser storage as level <id> of the
 *                             campaign (the editor's play-test of a campaign level)
 *   ?lang=en|ja|zh          the language of this page load (not saved; docs/specs/I18N.md §1) —
 *                           else the player's saved choice, else English
 *   &i18n=<table>           a content table to look the level's text up in besides its own
 *                           (`levels/<name>`: a play-test of a shipped level from browser storage;
 *                           its texts carry the shipped level's keys in the data, docs/specs/I18N.md §4.2)
 * Loading problems are shown on the loading screen; normalisation warnings go to the console.
 */
import { Game } from './game/Game.js';
import {
  resolveLevelFromURL, loadProjectLevel, saveLocalLevel, loadLocalLevel, listLocalLevels, PLAYTEST_SLOT, slugify,
} from './engine/level/LevelStorage.js';
import { validateLevel, normalizeLevel } from './engine/level/LevelFormat.js';
import { setLang, resolveLang, getLang, t, isCJK } from './engine/i18n/I18n.js';
import { loadContentTables, contentInfo, contentMisses, clearContentMisses, term } from './engine/i18n/ContentText.js';
import { registerCoreStrings, coreStringsOf } from './engine/i18n/strings/index.js';
import { startFonts } from './engine/ui/FontLoader.js';
import { artScale } from './engine/ui/UiScale.js';

/** @import { Level } from './engine/level/types.js' */

const DEFAULT_LEVEL = 'emberfall';

const params = new URLSearchParams(window.location.search);
const autostart = params.has('autostart') && params.get('autostart') !== '0';
const requested = params.get('level');
const campaignName = params.get('campaign');

const loading = document.getElementById('loading');
const bar = /** @type {HTMLElement|null} */ (loading?.querySelector('.bar > i'));
const label = loading?.querySelector('.label');
const title = loading?.querySelector('.title');

// another level than the default: don't flash the demo's name while its file loads
if (requested || campaignName) {
  if (title) title.textContent = 'Luminati';
  document.title = 'Luminati 2.5D Pixel-Art Engine';
}

/**
 * The loading screen's bar and label (Game.init reports its phases here).
 * @param {number} fraction 0…1
 * @param {string} [text]
 */
function progress(fraction, text) {
  if (bar) bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction)).toFixed(3)})`;
  if (label && text) label.textContent = text;
}

/**
 * The requested level, or Emberfall.
 * @returns {Promise<{ level: Level, warnings: string[],
 *   source: string }>}
 */
async function loadLevel() {
  const fromUrl = await resolveLevelFromURL(window.location.search);
  if (fromUrl) return fromUrl;
  const r = await loadProjectLevel(DEFAULT_LEVEL);
  return { ...r, source: `levels/${DEFAULT_LEVEL}.json` };
}

/**
 * `window.__luminati` (docs/specs/AUTOMATION_API.md §4): the type of `Window.__luminati` in
 * src/globals.d.ts. Members appear in three steps (`exposeHook` below); `loadMs` is the readiness
 * signal for scripts.
 * @typedef {object} LuminatiHooks
 * @property {{
 *   saveLocalLevel: typeof saveLocalLevel,
 *   loadLocalLevel: typeof loadLocalLevel,
 *   listLocalLevels: typeof listLocalLevels,
 *   loadProjectLevel: typeof loadProjectLevel,
 *   PLAYTEST_SLOT: typeof PLAYTEST_SLOT,
 * }} storage  (at boot) the browser-storage helpers of LevelStorage.js
 *   (docs/specs/LEVEL_STORAGE_API.md)
 * @property {(level: Parameters<typeof normalizeLevel>[0], slot?: string, query?: string)
 *   => string} playLocal  (at boot) normalise `level` (any, possibly partial level object), save it
 *   to browser slot `slot` (default 'test', slugified) and open `?level=local:<slot>&<query>`
 *   (default 'autostart=1') in this tab 50 ms later → the slot
 * @property {Awaited<ReturnType<typeof loadLevel>>['level']} [level]  (after the level loaded) the
 *   normalised level
 * @property {string} [source]  (after the level loaded) `levels/<slug>.json` or `local:<slot>`
 * @property {string[]} [warnings]  (after the level loaded) its normalisation warnings
 * @property {number} [loadMs]  (after warm-up) ms from navigation start to the first gameplay-ready
 *   frames (meaningless in a fixed-step run, whose page clock is virtual)
 * @property {import('./engine/ui/FontLoader.js').FontReport} [fonts]  (at boot; filled in as the
 *   fonts load) the UI fonts: language, scale, each set's source (google / local / none), ms, the
 *   Google error (docs/specs/I18N.md §5)
 * @property {{ lang: string, tables: string[], strings: number, units: number, terms: number, warnings: string[],
 *   readonly misses: import('./engine/i18n/ContentText.js').ContentMiss[], readonly missCount: number,
 *   readonly missDropped: number, clearMisses: () => void }} [content]
 *   (after the level loaded) the content tables installed for the page's language
 *   (docs/specs/I18N.md §4.3; `ContentText.contentInfo()` and the loader's warnings): English has
 *   none. Live: `misses`, the texts shown untranslated so far — a key no table holds (`missing`),
 *   one whose unit records other English (`stale`), a text the data holds no key for (`nokey`, one
 *   per English), a name with no term (`term`) (§4.2; the tours read it) —, `missCount` (how many
 *   the list holds, at most 500) and `missDropped` (how many more did not fit it); `clearMisses()`
 *   forgets them
 */

/**
 * Small scripted-test hook (the check harness can't reload a page with new storage otherwise).
 * Merges `extra` into `window.__luminati` (`LuminatiHooks` above; called at boot, after the level
 * loaded, after warm-up).
 * @param {Partial<LuminatiHooks>} [extra]
 */
function exposeHook(extra = {}) {
  window.__luminati = {
    ...(window.__luminati ?? {}),
    storage: { saveLocalLevel, loadLocalLevel, listLocalLevels, loadProjectLevel, PLAYTEST_SLOT },
    /**
     * Save `level` (any, possibly partial, level object) to browser storage and open it in this
     * tab a moment later. Returns the slot.
     */
    playLocal(level, slot = 'test', query = 'autostart=1') {
      const s = saveLocalLevel(slot, normalizeLevel(level).level);
      const url = `${window.location.pathname}?level=local:${encodeURIComponent(s)}${query ? `&${query}` : ''}`;
      setTimeout(() => { window.location.href = url; }, 50);
      return s;
    },
    ...extra,
  };
}

async function boot() {
  // the language before anything renders, the core string tables (the loading screen's texts are
  // in them: t('game.…') works before the UI exists), and the fonts — Google first, else the dist/
  // copies — loading in parallel with the level (docs/specs/I18N.md §1, §5)
  const lang = setLang(resolveLang());
  registerCoreStrings();
  const fonts = startFonts({ lang, px: artScale({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 }).px });
  exposeHook({ fonts: fonts.report });
  progress(0.03, t('game.load.map'));
  // the content tables (I18N.md §4.3; English loads and fetches nothing): a campaign's and the
  // default level's are known now and load beside the files; a requested level's once it loaded
  // (its source names the table)
  const extra = params.get('i18n');
  const tables = extra ? [extra] : null;
  const early = campaignName ? { campaign: campaignName } : requested ? null : { level: DEFAULT_LEVEL };
  const contentEarly = early ? loadContentTables(lang, { ...early, tables }) : null;
  // (the default level: its name on the loading screen, translated as soon as the tables are in)
  if (!early?.campaign && contentEarly && lang !== 'en') {
    contentEarly.then(() => {
      if (title?.textContent === 'Emberfall') title.textContent = term('Emberfall');
    });
  }
  let loaded;
  try {
    // (a campaign's code is loaded only for a campaign: src/game/campaign/CampaignStart.js)
    loaded = campaignName
      ? await (await import('./game/campaign/CampaignStart.js')).loadCampaignStart(campaignName, { params, progress, title })
      : await loadLevel();
  } catch (err) {
    // the player's message (the page's language, the loaders' own reason as it came) and the
    // console's (English: the developer UI stays English, I18N.md §2)
    const what = campaignName ? ['campaign', `campaign "${campaignName}"`, campaignName]
      : requested ? ['level', `level "${requested}"`, requested] : ['default', `the ${DEFAULT_LEVEL} level`, DEFAULT_LEVEL];
    let why = err?.message ?? String(err);
    let shownWhy = why;
    // a SyntaxError is a file (or slot) that came back but does not parse — the loaders already
    // turn the index.html the dev server answers unknown paths with into `Level "<name>" not found`
    if (err instanceof SyntaxError) {
      shownWhy = t('game.error.json', { why });
      why = `the level is not valid JSON (${why})`;
    } else if (!campaignName && !requested?.startsWith('local:') && err?.code === 'level.notFound' && (!err.status || err.status === 404)) {
      // a project level the server does not have (no HTTP status, or 404): name the file it looked for
      const file = `levels/${slugify(requested || DEFAULT_LEVEL)}.json`;
      why = `${file} does not exist`;
      shownWhy = t('game.error.missing', { file });
    }
    // `levelLoad`: a user-facing loading problem (the handler below warns instead of erroring);
    // `shown`: the loading screen's text
    const e = /** @type {Error & { levelLoad?: boolean, shown?: string }} */ (new Error(`Could not load ${what[1]}: ${why}`));
    e.levelLoad = true;
    e.shown = t('game.error.load', { what: t(`game.error.${what[0]}`, { name: what[2] }), why: shownWhy });
    throw e;
  }
  const { level, warnings = [], source } = loaded;
  const campaign = 'campaign' in loaded ? loaded.campaign : null;
  if (!level.name.trim()) level.name = 'Untitled';
  for (const w of warnings) console.warn(`[Luminati] ${source}: ${w}`);
  for (const e of validateLevel(level)) console.warn(`[Luminati] ${source}: ${e}`);
  exposeHook({ level, source, warnings });
  // the content tables in before anything shows the level's text (`loc` by key, `term` for names);
  // never throws (what cannot be read stays English, with a warning) — a play-test's
  // browser-storage level gets `common` only unless `&i18n=` names its table
  const content = await (contentEarly ?? loadContentTables(lang, { source, level: requested, tables }));
  for (const w of content.warnings) {
    // (a level the tables do not cover — a user's — simply stays English)
    if (/not in the index/.test(w)) console.info(`[Luminati] content text: ${w}`);
    else console.warn(`[Luminati] content text: ${w}`);
  }
  // (the misses live: getters over the chain's — the tables do not change after boot)
  const info = contentInfo();
  exposeHook({
    content: {
      lang: info.lang, tables: info.tables, strings: info.strings, units: info.units, terms: info.terms, warnings: content.warnings,
      get misses() { return contentMisses(); },
      get missCount() { return contentInfo().missCount; },
      get missDropped() { return contentInfo().missDropped; },
      clearMisses: clearContentMisses,
    },
  });
  // (names translated at display — terms: the level and the campaign keep their English)
  const name = term(campaign ? campaign.campaign.name : level.name);
  if (title) title.textContent = name;
  document.title = t('game.page.title', { name });

  // (a play-test's `&i18n=levels/<name>` only adds that table: its `local:` level's texts are shown by
  // the keys the level holds, I18N.md §4.2)
  const game = new Game({ container: document.getElementById('app'), level, source, autostart, campaign, lang, fonts });
  await game.init(progress);
  game.start();
  // keep the loader up while the first frames (every effect on, see Game.start) are drawn, so any
  // remaining first-use shader work happens behind it
  await game.warmedUp;
  // time from navigation start to the first gameplay frame (automation / profiling)
  exposeHook({ level, source, warnings, loadMs: Math.round(performance.now()) });
  requestAnimationFrame(() => {
    if (!loading) return;
    loading.classList.add('is-done');
    setTimeout(() => loading.remove(), 900);
  });
  prefetchGlyphs(fonts, content.chain, lang);
}

/**
 * Japanese and Chinese: the font slices of every translated text this page can show — the content
 * tables' (each unit's translation, each term's) and the core UI tables' — loaded in the background
 * once the game plays (CJK faces come in unicode-range slices: a dialogue line opened later then lays
 * out with its glyphs in, docs/specs/I18N.md §5 `ensure`). Not awaited: the first load does not wait
 * for it. English loads nothing (the Latin set holds every glyph).
 * @param {import('./engine/ui/FontLoader.js').FontLoader} fonts
 * @param {import('./engine/i18n/ContentText.js').ContentTable[]} chain
 * @param {'en'|'ja'|'zh'} lang
 */
function prefetchGlyphs(fonts, chain, lang) {
  if (!isCJK(lang) || typeof fonts?.ensure !== 'function') return;
  /** @type {unknown[]} */
  const texts = [];
  for (const table of chain ?? []) {
    texts.push([...table.units.values()].map((u) => u.target));
    texts.push([...table.terms.values()]);
  }
  texts.push(...coreStringsOf(lang));
  const run = () => { fonts.ensure(texts).catch(() => {}); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1000);
}

/**
 * Ways out of the error screen: the demo village (unless it is what failed), the combat demo
 * (unless it is what failed) and the editor — in the page's language (the levels' names through
 * the content tables when they are in).
 */
function showErrorActions() {
  const box = loading?.querySelector('.actions');
  if (!box) return;
  const links = [];
  if (requested) links.push([t('game.error.play', { name: term('Emberfall') }), 'game.html']);
  if (requested !== 'cinderwatch-pass') links.push([t('game.error.play', { name: term('Cinderwatch Pass') }), 'game.html?level=cinderwatch-pass']);
  links.push([t('game.error.editor'), 'editor.html']);
  box.replaceChildren(...links.map(([text, href]) => {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    return a;
  }));
}

boot().catch(async (err) => {
  // a missing / unreadable level is a user-facing problem (shown on the loading screen)
  if (err?.levelLoad) console.warn(`[Luminati] ${err.message}`);
  else console.error('[Luminati] failed to start:', err);
  if (label) label.textContent = err?.shown ?? (err?.message ? String(err.message) : t('game.error.unknown'));
  if (bar) bar.style.transform = 'scaleX(0)';
  loading?.classList.remove('is-done');
  loading?.classList.add('is-error');
  // (the links name the shipped levels: the common table, when nothing was loaded before the
  // failure — English loads nothing; the loader never throws)
  if (getLang() !== 'en' && !contentInfo().tables.length) await loadContentTables(getLang(), {});
  showErrorActions();
});
