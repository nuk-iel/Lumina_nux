# Content glossary (Japanese, Simplified Chinese)

> **Status.** The glossary of [I18N.md](I18N.md) §3 for the content tables: every proper noun and
> recurring name of the shipped levels and campaigns, decided once for Japanese and Simplified
> Chinese, with the style notes the translators follow. It is the reference for names and words:
> it took in the UI mockup's glossaries and keeps every name they decided (Sela セラ / 瑟拉,
> Cinderwatch Pass シンダーウォッチ峠 / 烬望隘口, Warden 衛士 / 守卫 …); a note that cites the UI
> mockup gives a name's origin.
>
> **Source of truth.** For the names, the `terms` of the version-3 tables in `public/i18n/ja/` and
> `public/i18n/zh/` (I18N.md §4.1); for the lines, the tables' `units`; for the code defaults and
> the prompt's verbs, the UI string tables (`src/engine/i18n/strings/game.js`,
> `src/game/*/strings.js`). The tables below were generated from the same data. Where they differ,
> the JSON and the string tables win and this file is stale.

## Contents

1. [How the glossary works](#1-how-the-glossary-works)
2. [Style notes for translators](#2-style-notes-for-translators)
3. [Japanese (ja)](#3-japanese-ja)
4. [Simplified Chinese (zh)](#4-simplified-chinese-zh)
5. [Changing the glossary](#5-changing-the-glossary)
6. [UI vocabulary (both languages)](#6-ui-vocabulary-both-languages)

## 1. How the glossary works

**Names are terms, in each table that shows them.** Every name that the levels, campaigns and
story files show (villagers, speakers, places, levels, campaigns, items, quests, foes, waystones)
is a **term**: translated by the name itself, `term(name)` (I18N.md §4.2), in the `terms` of the
table whose files show it (I18N.md §4.1).
- The same name in tables that do not extend one another is a term in each: Pip is a term of
  `levels/cinderwatch-pass`, `levels/emberfall` and `campaigns/ferrymans-lantern`. A name has one
  rendering, and `npm run i18n:check` warns when two tables translate it differently ("one name,
  one translation"). Change them all at once (§5).
- A campaign that extends a shipped level shares that level's terms: Open Doors reads Emberfall's.
- `common` holds the names every level can show: the six shipped levels' names, and the names the
  catalog and boot write into data (Signpost, Villager, Waystone, Untitled, Untitled campaign). No
  other table repeats them.

**Lines are units, keyed by the text key the data holds.** A villager's title, a region's line or
banner, a subtitle, a title-screen line, a custom prompt (Search, Climb up …), a dialogue page and
a choice are units of the table of the file that holds them, each under the key its text carries
in the data (I18N.md §4.2) and translated on its own. The same English can therefore read
differently in two places (a warden's "Thank you." and a child's). A chapter variant's unchanged
line shares its base's key, and so its unit. The shared choices (Not yet, Just looking …) are
translated where each is said: in each level's table, and in `common` where `src/game/dialogue.js`
says them (`dlg.*`). Keep them alike unless a speaker needs another register.

**Code defaults and the prompt's verbs are UI strings.** What the code shows for blank data (a
blank name: Signpost, Villager, Waystone; a blank shop item: Crisp Apple; the chest and waystone
lines, Nothing of note., the default subtitle, prompt and credit, The way is closed., The End) and
the prompt's built-in verbs (Talk, Examine, Knock, Read, Look, Enter, Rest, Open) are UI strings:
`game.default.*`, `game.prompt.*`, `campaign.exit.closed`, `story.ending.default` (I18N.md §4.8).
They are translated once, in the string tables, and no worklist lists them. Where the data holds
the same name (a sign whose speaker is `Signpost`), the common term and the UI string must agree,
and the checker compares them (§6).

**Inside lines, use the renderings below.** A worklist entry such as "Welcome to {Gildhaven},
traveller." is yours to translate, and the name inside it must be this file's: {ギルドヘイヴン},
{鎏金港}. Names that only ever appear inside lines (bridges, inns, songs, the Stargazer …) have
their own tables (§3.12, §4.12), and so do the terms the content shares with the combat and party
UI (§3.13, §4.13).

**Counts.** Per language the tables hold 975 units and 286 terms: 272 distinct names, 12 of them in
more than one table. §3 and §4 list 380 rows per language: the 272 names; 98 lines (units:
subtitles, title-screen and chapter lines, banners, region lines, custom prompts, shared narration
and choices); and 10 code defaults and prompt verbs (UI strings). Then come 63 names and terms
found only inside lines or in the UI (§3.12–3.13, §4.12–4.13).

### 1.1 Naming rules

These produced the tables. Use them for anything the tables lack, then add it here (§5).

| Kind | Japanese | Chinese |
|---|---|---|
| Personal names | Katakana by the English sound, given and family name joined by ・ (オットリーン・クィル). | Standard transliteration (新华社 style), joined by · (奥托琳·奎尔). Women's names take the usual characters (娜, 莉, 丝, 妮); established renderings win (罗莎琳德, 塔克修士, 留里克). |
| Ranks and offices | After the name: マレン隊長, ヘイル伍長, ブラスク軍曹, マレン長老, 町長, 教授, 院長. | After the name: 玛伦队长, 黑尔下士, 布拉斯克中士, 玛伦长老, 镇长, 教授, 院长. |
| Western courtesy titles | Katakana before the name: シスター・, サー・, レディ・, シニョール・ / シニョーラ・. Brother is 修道士 after the name. | After the name: 修女, 爵士, 夫人, 先生, 修士. |
| Master | 先生 for the learned (Master Ivo, Master Casimir), 親方 for craftsmen (Master Brie). | 先生 / 大师 for the learned, 师傅 for craftsmen. |
| Family words | Old X = Xじいさん / Xばあさん; Gran = ばあちゃん; Grandmother = おばあさん; Auntie = おばさん; Goodman = おじさん. | Old X = 老X (婆婆 for grannies); Gran = 阿婆; Grandmother = 奶奶; Auntie = 阿姨; Goodman = 大叔. |
| "X the Y", trades | Role + name, no の: 粉屋オド, 曲芸師コーウィン, 巡礼者エルリック. A wayfarer is さすらいのX (旅人 is the player). | Role + name: 磨坊主奥多, 杂耍艺人科温, 朝圣者埃尔里克. A wayfarer is 漫游者X (旅人 is the player). |
| Settlements | Katakana + a kanji generic: エンバーフォール, ギルドヘイヴン, ハースウィック, ブライトウォーターの渡し. | Meaningful: 烬落村, 鎏金港, 炉火镇, 明水渡, 柳湖村, 磨溪村. |
| Natural places and descriptive names | Kanji: 星降りの谷, 鏡湖, 熾火の森, 四つ辻, 旧採石場, 狼ヶ瀬. | Meaningful: 星落谷, 镜湖, 烬木林, 十字路口, 旧采石场, 狼渡. |
| Recurring words in names | Cinder シンダー · Gild ギルド · Mirror 鏡 · Bramble いばら · Glade 林 · Grove 木立 · Wood 森 · Terrace 高台 · Heights 高地 · Quay 波止場 · Mill 粉挽き小屋 · Miller 粉屋 · Oak 樫 · Lantern ランタン (floated paper lanterns 灯籠) · inn 〜亭 · troupe 〜一座. | Cinder 烬火 · Gild 鎏金 · Mirror 镜 · Bramble 荆棘 · Glade 林地 · Grove 林 · Wood 林 · Terrace 台地 · Heights 高地 · Quay 码头 · Mill 磨坊 · Miller 磨坊主 · Oak 橡木 · Lantern 提灯 (paper lanterns 灯笼) · inn 〜旅店 · troupe 〜剧团. |
| Articles | "The" disappears: The Old Quarry and the {Old Quarry} are both 旧採石場. | "The" disappears: both are 旧采石场. |
| Items | Plain JRPG item words, food in hiragana where Japanese writes it so (りんご飴, はちみつパン). | Plain item words (太妃糖苹果, 蜂蜜面包). |

### 1.2 Decisions worth knowing

- **Gild and guild (ja).** ギルドヘイヴン keeps ギルド for *Gild*, the river and the town's gold.
  The town's guilds are therefore 組合 (組合長オリン, 組合取引所), never ギルド, or "the Gild" and
  "the guild" would read the same. Gilt (the library) is 金箔.
- **Starfall is meaningful, Emberfall is not (ja).** Starfall is the level's event as much as its
  name ("on Starfall night", "the Starfall Festival"), so it is 星降り throughout: 星降りの谷,
  星降り祭, 星降りの夜. Emberfall is only a village name and stays エンバーフォール, as I18N.md's own
  example writes it.
- **Ember and cinder share 烬 (zh).** The UI mockup's 烬望 / 烬心 / 烬火弹 set the character, so
  Emberfall is 烬落村, Emberwood 烬木林, Cinder Ridge 烬火岭, the Ember & Oak 烬火橡木旅店.
- **Gildhaven Harbour (zh).** The town is already 鎏金港, so its harbour is 鎏金港码头.
- **"Not yet" (zh) is 还不是时候**, the UI mockup's answer to Sela. Each choice is its own unit, so the
  same English could read differently per place, but this one fits every use: the innkeeper's
  "rest until morning?" too, and after "have you seen …?" it reads as "not yet the time". Japanese
  今はまだ fits every use.
- **Names kept apart:** Bram ブラム / 布拉姆 and Bran ブラン / 布兰; Mira ミラ / 米拉 and Milla
  ミーラ / 蜜拉; Isolde イゾルデ / 伊索尔德 and Ysolde イソルデ / 伊索德; Windmill Hill 風車の丘,
  Mill Hill 粉挽きの丘 and Miller's Hill 粉屋の丘; Fenna フェンナ / 芬娜, Fenn and Fen フェン / 芬,
  Finn フィン / 芬恩, Fennick フェニック / 芬尼克.
- **Unlucky Japanese words avoided:** Cass is キャス (カス is "dregs"), Dob ドッブ (ドブ is a
  ditch), Merrit メリト (メリット is "an advantage").
- **Same name, different people.** Hale, Hollis, Ilse, Ivo, Maren, Odo, Tam, Tamsin, Wendel and
  Wren name different villagers in different levels; each name has one rendering everywhere, with
  the title that level gives it.

## 2. Style notes for translators

### 2.1 Both languages: markup and values

The rules of I18N.md §4.4, and how to apply them:

- **Gold `{…}`.** Translate the words inside the braces with this glossary and keep the braces:
  `Welcome to {Emberfall}` → `{エンバーフォール}へようこそ` / `欢迎来到{烬落村}`. An English
  article outside the braces disappears (`the {Old Quarry}` → `{旧採石場}`). Keep one span per
  English span; a different number is a warning. Never add braces for emphasis: they turn text
  gold.
- **`${values}`.** Copy each `${…}` exactly, never translate inside it, and keep the same set (a
  missing or extra value is an error); it may move. Put the counter or unit around it:
  `Oak planks for Hollis (${item:plank} of 3)` → `ホリスに渡す樫の板（${item:plank}/3）` /
  `给霍利斯的橡木板（${item:plank}/3）`. A `\${x}` is not a value: leave it as written. Quest
  texts that a script saves (`quest … start`, `stage`) must stay without values (I18N.md §4.5).
- **Key hints.** `{T}`, `{~}`, `{R}` and code slots such as `{${attack}}` stay exactly as written;
  they render as keycaps. Write no space before or after them (the gap is CSS): `{T}を押すと…` /
  `按{T}…`.
- **Signs: `\n` and arrows.** A sign keeps its line breaks: the same number of lines, each
  translated in place. Arrows (↑ ↓ ← → ↖ ↗ ↘ ↙) stay at the start of their destination with the
  same glyph. Between destinations Japanese writes ・ and Chinese keeps ` · `; an `&` becomes と /
  与. `↑ {Mount Lumen} · the {Observatory}` → `↑ {ルーメン山}・{天文台}` /
  `↑ {流明山} · {天文台}`.
- **Choices** are translated one by one, in the same order. Keep them short (about 10 characters
  in Japanese, 8 in Chinese) and in the player's voice.
- **Names inside lines** take exactly this file's rendering, with the title when the English has
  one ("Captain Hale is up at the Lookout" → ヘイル隊長 / 黑尔队长) and without it when the English
  uses the bare name.
- **Latin stays Latin:** HP, MP, SP, XP, Lv, G, key names, numbers, Luminati (the engine's name,
  never transliterated), 2.5D, three.js. Digits are half-width.
- **Shouted words** in capitals ("I am not CHASING them") have no capitals in CJK: carry the
  emphasis with wording, ！ or 「」 / “”.
- **Songs** keep their ♪. Song and book titles take 『』 (ja) / 《》 (zh).

### 2.2 Japanese

- **Narration** (houses, wells, signs, examine texts, quest log): plain form (〜している。〜だ。),
  no です・ます. The player is あなた when narration needs a subject; usually leave it out.
- **Villagers** speak casual, warm Japanese with light role language (役割語), never so heavy that
  it turns comic:
  - elders and grannies: 〜じゃ, わし, 〜のう, sparingly (Elder Maren, Old Tobin, Grandmother
    Isolde, Old Thistle);
  - children: short and excited (〜だもん, 〜なんだよ！) (Pip, Nim, Tilly, Kit, Tansy, Poppy);
  - guards and soldiers: clipped plain form (〜だ。〜するな。) (Captain Maren, Sergeant Brask);
  - shopkeepers and innkeepers: friendly, polite-casual (いらっしゃい！ 〜だよ／〜ですよ);
  - clergy, nobles and scholars: です・ます (Sister Ilse, Lady Odelia, Mother Celandine, Master
    Ivo);
  - Sela: terse and warm, plain form, as in the UI mockup;
  - Rook (Cinderwatch's young bowman): cocky and casual, 俺, the player あんた.
- **Addressing the player:** 旅人さん, or あなた from polite speakers; "friend" is あんた or 君
  only where the English is that familiar; "dear / dearie" is あんた or お若いの by an old speaker.
- **Punctuation:** full-width 、。！？「」『』（）・; ellipsis ……; a dash ――; a full-width space
  after ！ or ？ when the sentence goes on (いらっしゃい！　焼きたてだよ). Quotes are 「」, a quote
  inside a quote 『』. No spaces between Japanese words; Latin and numbers keep the spaces they
  have in the English (Lv 5).
- **Titles and banners:** level subtitles end in 〜地 like the UI mockup's 古き火の目覚める地; region
  banners that begin "Where …" end in 〜ところ.

### 2.3 Simplified Chinese

- **Narration:** concise written Chinese (书面语), no 文言. The player is 你.
- **Villagers** speak colloquial modern Chinese (口语), with the particles of speech (呀, 嘛, 啦,
  呢) where the English is chatty:
  - elders: a little old-fashioned, never classical (no 老夫 / 老身);
  - children: short and playful;
  - guards and soldiers: brisk;
  - shopkeepers: lively, 您 to a customer;
  - clergy, nobles and scholars: courteous, 您;
  - Sela: terse and warm, as in the UI mockup;
  - Rook (Cinderwatch's young bowman): casual and cocky, 你.
- **Addressing the player:** 旅人 (the UI mockup's word for the traveller), 你, or 您 from polite
  speakers; "friend" is 朋友.
- **Punctuation:** full-width ，。！？：；、“”‘’（）《》; ellipsis ……; a dash ——; the list comma 、
  between items. No spaces between Chinese characters; Latin and numbers keep the spaces they have
  in the English (Lv 5).
- **Titles and banners:** level subtitles end in 〜之地 like the UI mockup's 古火苏醒之地; region
  banners that begin "Where …" end in 〜之处.

## 3. Japanese (ja)

### 3.1 Code defaults and strings every level shares

Where: Signpost, Villager, Waystone, Untitled and Untitled campaign are terms of `common`; Notice is
a term of `campaigns/ferrymans-lantern` (a sign's speaker). Crisp Apple, Enter, Look, The way is
closed., the chest and waystone lines, Nothing of note., The End and A Luminati 2.5D Level are UI
strings (`game.default.*`, `game.prompt.*`, `campaign.exit.closed`, `story.ending.default`), and
so are Press any key and the engine credit where they stand in for a blank title prompt or credit.
The narration lines, the choices, the title prompts and credits, and A Luminati campaign are units of
each table whose files say them, and of `common` where `dialogue.js` says them (`dlg.*`).

| English | 日本語 | Why |
|---|---|---|
| Signpost | 立て札 | The JRPG word for a wooden sign (the spec's own example). |
| Notice | 告知 | A posted notice (Elder Wren's sign at the ford). |
| Villager | 村人 | The plain JRPG word. |
| Waystone | 道標石 | The UI mockup's word: 道標 a wayside marker, 石 a stone. |
| Crisp Apple | もぎたてりんご | "Fresh-picked"; りんご in hiragana as in every food item. |
| Enter | 入る | Prompt verbs are dictionary forms, like the UI mockup's 話す. |
| Look | 調べる | The JRPG examine verb. |
| The way is closed. | この先へは進めない。 | Plain form, the narrator's voice. |
| The chest is locked tight. | 宝箱には固く鍵がかかっている。 | Narration in plain form. |
| An old waystone hums quietly. | 古い道標石が静かにうなっている。 | Uses the glossary's 道標石. |
| Nothing of note. | 特に変わったところはない。 | The classic JRPG examine line. |
| The door is latched. Somewhere inside, a kettle begins to sing. | 扉には掛け金が下りている。中のどこかで、やかんが鳴りはじめた。 | Narration in plain form. |
| You make a small wish of your own. | あなたも、ささやかな願いをひとつかけた。 | The player is あなた in narration. |
| Not yet | 今はまだ | The UI mockup's choice for Sela; also reads as "not yet" after "have you seen …?". |
| Rest until morning | 朝まで休む | Choices are short verb phrases. |
| Yes, please | お願いします | Polite: the player is buying. |
| Just looking | 見てるだけ | What a browsing customer says. |
| No, thank you | いえ、結構です | A polite refusal. |
| Not today | 今日はやめておく | A casual refusal. |
| Maybe later | また今度 | A casual "another time". |
| Not now | 今はいい | A casual "not now". |
| Press any key | 何かキーを押してください | The usual title-screen prompt. |
| The End | おわり | The storybook ending word. |
| Untitled | 無題 | The plain word. |
| Untitled campaign | 無題のキャンペーン | キャンペーン: the TRPG word for a story told over several maps. |
| A Luminati campaign | Luminati キャンペーン | See "Untitled campaign"; Luminati stays Latin. |
| A Luminati 2.5D Level | Luminati 2.5D のステージ | ステージ is the player-facing word for a level. |
| Luminati 2.5D Pixel-Art Engine · three.js | Luminati 2.5D ピクセルアートエンジン・three.js | Credits keep Latin product names; ・ as the separator. |

### 3.2 Levels, campaigns and title screens

Where: the shipped levels' names are terms of `common`; a campaign's name and its levels' names
are terms of its table. The subtitles, title-screen lines, chapter titles and the ending's title
are units of the table of the file that holds them.

| English | 日本語 | Why |
|---|---|---|
| Emberfall | エンバーフォール | A settlement: katakana (the spec's own {エンバーフォール}). |
| EMBERFALL | エンバーフォール | Title-screen capitals: the same name (no case in kana). |
| Cinderwatch Pass | シンダーウォッチ峠 | The UI mockup's name. |
| CINDERWATCH PASS | シンダーウォッチ峠 | The UI mockup's title. |
| Starfall Vale | 星降りの谷 | A natural place named for its event: 星降り, the poetic word for falling stars, read in every line about the festival. |
| STARFALL VALE | 星降りの谷 | The same name. |
| Gildhaven | ギルドヘイヴン | A town: katakana. ギルド here is "gild"; the guilds of the town are 組合, never ギルド. |
| GILDHAVEN | ギルドヘイヴン | The same name. |
| Brightwater Crossing | ブライトウォーターの渡し | Settlement name in katakana + 渡し, the old word for a river crossing. |
| Willowmere | ウィロウミア | A settlement: katakana. |
| Millbrook | ミルブルック | A settlement: katakana. |
| The Old Quarry | 旧採石場 | A descriptive place: kanji. Also the plain "Old Quarry" inside lines. |
| The Windmill | 風車小屋 | The building (Starfall region, Open Doors room). |
| The Ferryman's Lantern | 渡し守のランタン | 渡し守: a ferry keeper, man or woman (Ilse is a woman); ランタン for a carried lamp. |
| THE FERRYMAN'S LANTERN | 渡し守のランタン | The same title. |
| A short tale of Millbrook | ミルブルックの小さな物語 | Subtitle register. |
| Emberfall — Open Doors | エンバーフォール ―開かれた扉― | Name ―subtitle―, the Japanese subtitle form. |
| Open Doors — every house has a room behind its door | 開かれた扉 ― どの家にも、扉の向こうに部屋がある | Title line; ― for the English dash. |
| Riverside Village | 川辺の村 | Emberfall's subtitle. |
| A Luminati 2.5D Pixel-Art Engine Demo | Luminati 2.5D ピクセルアートエンジンデモ | Latin product name, katakana loanwords. |
| Where the Old Fires Wake | 古き火の目覚める地 | The UI mockup's tagline. |
| A Luminati 2.5D action demo · three.js | Luminati 2.5D アクションデモ・three.js | The UI mockup's footer. |
| Market Day on the River Gild | ギルド川に市の立つ日 | 市の立つ日: the day the market is held. |
| A Luminati 2.5D town · three.js | Luminati 2.5D の街・three.js | Credit line. |
| Where the Stars Come Home | 星たちの還る地 | Title tagline in 地, like the UI mockup's. |
| A Luminati 2.5D showcase · three.js | Luminati 2.5D ショーケース・three.js | Credit line. |
| A Riverside Hamlet | 川辺の小さな集落 | Brightwater's subtitle. |
| A Hamlet by the Pond | 池のほとりの小村 | Willowmere's subtitle. |
| Chapter One | 第一章 | The standard chapter heading. |
| The Broken Ford | 断たれた渡り | The bridge at the ford is out: the crossing is cut. |
| Chapter Two | 第二章 | The standard chapter heading. |
| Lanterns Home | 家路を照らす灯 | The village lights lamps to bring Ilse home. |
| The Lantern Home | ランタン、家路へ | The ending title: the lantern comes home. |

### 3.3 Villagers who appear in more than one level

Where: a term in each table that shows the name (Pip in `levels/cinderwatch-pass`,
`levels/emberfall` and `campaigns/ferrymans-lantern`): one rendering, which the checker keeps
equal.

| English | 日本語 | Why |
|---|---|---|
| Pip | ピップ | The UI mockup's name. |
| Wren | レン | Also Elder Wren (Millbrook) and the bard of Emberfall. |
| Bram | ブラム | Kept apart from Bran ブラン (Millbrook's watchman). |
| Tamsin | タムシン | Also Tamsin Bloom, Tamsin's Farm. |
| Rosalind | ロザリンド | The English sound in katakana. |
| Tilda | ティルダ | The English sound in katakana. |
| Fenna | フェンナ | The English sound in katakana. |
| Saffi | サフィ | The English sound in katakana. |
| Kit | キット | The English sound in katakana. |
| Posy | ポージー | The English sound in katakana. |

### 3.4 Cinderwatch Pass

Where: `levels/cinderwatch-pass`.

| English | 日本語 | Why |
|---|---|---|
| Sela | セラ | The UI mockup's name. |
| Captain Maren | マレン隊長 | Ranks follow the name in Japanese (隊長, 軍曹, 伍長). |
| Sister Ilse | シスター・イルゼ | シスター is the everyday word for a nun; the same Ilse as Millbrook's. |
| Rook | ルーク | The English sound in katakana; the camp's bowman. |
| Odo | オド | The English sound; also Miller Odo. |
| Camp Waystone | 野営地の道標石 | Built like the UI mockup's 四つ辻の道標石. |
| Crossroads Waystone | 四つ辻の道標石 | The UI mockup's name. |
| Quarry Waystone | 採石場の道標石 | As above; 採石場 as in Cinder Quarry. |
| Old Ironhide | 古豪アイアンハイド | The UI mockup's name. |
| Cinderheart | シンダーハート | The UI mockup's name. |
| The Caldera | カルデラ | The UI mockup's name; also the bare {Caldera} in lines. |
| Waystone Camp | 道標石の野営地 | The region of the camp. |
| Straw dummies and a warm fire · Safe | わら人形と暖かな焚き火・安全地帯 | Banner; ・ for the separator. |
| The Crossroads | 四つ辻 | The UI mockup's name. |
| Cinder Ridge | シンダー尾根 | Cinder = シンダー as in the pass; 尾根 a ridge. |
| Mossy Glade | 苔むす林 | Glade = 林 (Hidden Glade 隠れ林). |
| Slimes and goblins · Lv 2 | スライムとゴブリン・Lv 2 | Monster words as in the combat UI; Lv stays Latin. |
| Bramble Ruins | いばらの遺跡 | Bramble = いばら (Bramble Hollow, Bramble Goblin). |
| Goblins, archers and a shaman · Lv 7–8 | ゴブリン、弓兵、シャーマン・Lv 7–8 | Archer = 弓兵, shaman = シャーマン (UI mockup). |
| Hollow Mire | 窪地の沼 | A mire in a hollow. |
| Bats, slimes and a shaman · Lv 6–7 | コウモリ、スライム、シャーマン・Lv 6–7 | Banner. |
| Cinder Quarry | シンダー採石場 | As Cinder Ridge. |
| Ironhide boars and archers · Lv 8 | アイアンハイドボアと弓兵・Lv 8 | Ironhide Boar = アイアンハイドボア (Old Ironhide's kind). |

### 3.5 Emberfall

Where: `levels/emberfall` (read by Open Doors too).

| English | 日本語 | Why |
|---|---|---|
| Elder Maren | マレン長老 | 長老 after the name, like a rank. |
| Bertram | バートラム | The English sound. |
| Corporal Hale | ヘイル伍長 | Corporal = 伍長. |
| Old Tobin | トビンじいさん | "Old X" = Xじいさん / Xばあさん (Pip's grandpa). |
| Ottoline Quill | オットリーン・クィル | Full names keep the ・ between given and family name. |
| Windmill Hill | 風車の丘 | A descriptive place: kanji. |
| Where the valley keeps its winds | 谷の風が宿るところ | Region banners end in ところ. |
| Tobin's Farm | トビンの農場 | X's Farm = Xの農場. |
| Amberleaf Grove | 琥珀葉の木立 | Grove = 木立; a descriptive name in kanji. |
| Campfire Meadow | 焚き火の野原 | Descriptive. |
| Emberfall Falls | エンバーフォールの滝 | Settlement name + 滝. |
| Village Square | 村の広場 | Descriptive. |

### 3.6 Emberfall — Open Doors (the rooms)

Where: `campaigns/emberfall-interiors`.

| English | 日本語 | Why |
|---|---|---|
| The Ember & Oak | エンバー＆オーク亭 | Inn names: katakana + 亭; エンバー as in Emberfall. Also {Ember & Oak} in lines. |
| The Taproom | 酒場 | The inn's ground floor. |
| Garrick | ギャリック | Also Garrick Ironwell. |
| Old Nan | ナンばあさん | The inn's old cook. |
| Sir Brannoc | サー・ブラノック | Sir = サー・ before the name. |
| Go upstairs | 上の階へ | Exit prompts: short. |
| Go out | 外に出る | The spec's own example. |
| Go downstairs | 下の階へ | Exit prompt. |
| The Guest Rooms | 客室 | Meaningful rendering in kanji. |
| Master Ivo | イーヴォ先生 | Master (a learned man: cartographer) = 先生; craftsmen are 親方. |
| Sister Ada | シスター・エイダ | Sister = シスター・. |
| The Millstone Floor | 石臼の階 | Windmill floors. |
| Miller Hesk | 粉屋ヘスク | Trade + name with no の (粉屋オド, 農夫バーロウ). |
| The Cap Floor | 最上階 | The cap is the windmill's top: the top floor. |
| Tam | タム | Also Tam the Piper. |
| Tobin's Barn | トビンの納屋 | The name as in its own row + a kanji generic. |
| Hay and Patience | 干し草と辛抱 | Room subtitle. |
| Hilde | ヒルデ | The English sound in katakana. |
| The Hayloft | 干し草の屋根裏 | Meaningful rendering in kanji. |
| Wendel | ウェンデル | Also Wendel the Miller. |
| Elder's Cottage | 長老の家 | Meaningful rendering in kanji. |
| Books by the Fire | 炉ばたの本 | Room subtitle. |
| Linden | リンデン | The English sound in katakana. |
| Riverside House | 川辺の家 | Meaningful rendering in kanji. |
| The Kettle Sings | やかんが歌う | Room subtitle. |
| Auntie Bryony | ブライオニーおばさん | Auntie = おばさん after the name. |
| Thatched Cottage | わらぶきの家 | Meaningful rendering in kanji. |
| Fresh Bread | 焼きたてのパン | Room subtitle. |
| Woodcutter's Lodge | きこりの小屋 | Woodcutter = きこり. |
| A Song About Axes | 斧の歌 | Room subtitle. |
| Rowan | ローワン | Also Rowan the Wayfarer. |

### 3.7 The Ferryman's Lantern

Where: `campaigns/ferrymans-lantern` (levels and story files).

| English | 日本語 | Why |
|---|---|---|
| A Mill by the Brook | 小川のほとりの粉挽き小屋 | Mill = 粉挽き小屋 (Miller = 粉屋). |
| Elder Wren | レン長老 | As Elder Maren. |
| Hollis | ホリス | Also Goodman Hollis, Hollis Barleycorn. |
| Miller Odo | 粉屋オド | Trade + name. |
| Watchman Bran | 番兵ブラン | Watchman = 番兵; Bran is not Bram. |
| Search | 探す | Event prompt (the plank stack). |
| Mill Hill | 粉挽きの丘 | Kept apart from Windmill Hill 風車の丘. |
| Where the sails turn | 風車の羽根が回るところ | Banner. |
| The East Road | 東の街道 | Also "the east road" in lines. |
| Millbrook Green | ミルブルックの草地 | A village green = 草地. |
| The Night of Lanterns | ランタンの夜 | Level subtitle. |
| Ilse | イルゼ | The ferryman (a woman). |
| Festival Bun | お祭りパン | Buns are パン. |
| Mill Road | 粉挽き街道 | Meaningful rendering in kanji. |
| Down to the Wolf Ford | 狼ヶ瀬へ | Level subtitle. |
| Gwil the Peddler | 行商人グウィル | "X the Y" = role + name. |
| Wolf Ford | 狼ヶ瀬 | ヶ瀬: the old place-name form for a ford. |
| Where the river runs wide | 川幅の広がるところ | Banner. |
| Between Millbrook and the Old Quarry | ミルブルックと旧採石場のあいだ | Region line. |
| Where the Lantern Went | ランタンの行方 | Level subtitle. |
| Quarry Gate | 採石場の門 | The waystone of the Old Quarry. |
| Ferryman's Ledge | 渡し守の岩棚 | Ledge = 岩棚 (also "the quarry ledge"). |
| A lantern still burns | ランタンはまだ灯っている | Banner. |
| East of the Wolf Ford | 狼ヶ瀬の東 | Region line. |
| Mind the slimes | スライムに注意 | Banner. |
| The Mill Cellar | 粉挽き小屋の地下室 | Meaningful rendering in kanji. |
| Under the Mill House | 粉挽き小屋の下 | Level subtitle. |
| Read | 読む | Event prompt: a built-in verb, the UI string `game.prompt.read`. |
| Climb up | 上がる | Exit prompt (the cellar stairs). |
| Oak Plank | 樫の板 | Oak = 樫 (except the inn's name). |
| Cellar Key | 地下室の鍵 | Meaningful rendering in kanji. |
| Ferry Chart | 渡し舟の水路図 | Ilse's chart of the river. |
| Ferry Lantern | 渡し舟のランタン | The name as in its own row + a kanji generic. |
| The Missing Ferryman | 消えた渡し守 | Quest title. |

### 3.8 Brightwater Crossing

Where: `levels/brightwater-crossing`.

| English | 日本語 | Why |
|---|---|---|
| Elda | エルダ | The English sound in katakana. |
| Marigold | マリーゴールド | The innkeeper (the flower in lines is also マリーゴールド). |
| Honey Bun | はちみつパン | The name as in its own row + a kanji generic. |
| Miller's Hill | 粉屋の丘 | Kept apart from Mill Hill and Windmill Hill. |
| Where the sails turn even when the wind forgets | 風が忘れても、羽根の回るところ | Banner. |
| Brightwater Falls | ブライトウォーターの滝 | The name as in its own row + a kanji generic. |
| Lily Pond | 睡蓮の池 | Meaningful rendering in kanji. |
| Tamsin's Farm | タムシンの農場 | The name as in its own row + a kanji generic. |
| Brightwater Square | ブライトウォーター広場 | The name as in its own row + a kanji generic. |
| Where the river bends and the lanterns glow | 川が曲がり、灯のともるところ | Banner. |

### 3.9 Willowmere (sample-hamlet)

Where: `levels/sample-hamlet`.

| English | 日本語 | Why |
|---|---|---|
| Mira | ミラ | Kept apart from Milla ミーラ. |
| Old Fen | フェンじいさん | "Old X". |
| Honey Cake | はちみつケーキ | The name as in its own row + a kanji generic. |
| Orchard Terrace | 果樹園の高台 | Terrace = 高台, Heights = 高地. |
| Where the old trees keep watch | 古木の見守るところ | Banner. |
| Mirror Pond | 鏡池 | Mirror = 鏡 (Mirror Falls, Mirrormere). |
| Willowmere Green | ウィロウミアの草地 | The name as in its own row + a kanji generic. |

### 3.10 Gildhaven

Where: `levels/gildhaven`.

| English | 日本語 | Why |
|---|---|---|
| Sergeant Brask | ブラスク軍曹 | Sergeant = 軍曹. |
| Corporal Lisbet | リスベット伍長 | The English sound; the title as in §1.1. |
| Florin Fiddlewick | フローリン・フィドルウィック | The English sound in katakana. |
| Mirela | ミレラ | The English sound in katakana. |
| Corwin the Juggler | 曲芸師コーウィン | Role + name. |
| Hetty Bramble | ヘティ・ブランブル | A family name: sound, not いばら. |
| Toffee Apple | りんご飴 | The fair-stall sweet every Japanese player knows. |
| Fair Ribbon | ギルド祭のリボン | Fair = ギルド祭 (the Gild Fair). |
| Edda | エッダ | The English sound in katakana. |
| Old Ambrose | アンブローズじいさん | "Old X". |
| Daro the Wayfarer | さすらいのダロ | Wayfarer = さすらいの; 旅人 is the player. |
| Farmer Barlow | 農夫バーロウ | The English sound; the title as in §1.1. |
| Nim | ニム | The English sound in katakana. |
| Tobias Quern | トビアス・クァーン | The English sound in katakana. |
| Crier Bertil | 触れ役ベルティル | Town crier = 触れ役. |
| Dora Haddock | ドーラ・ハドック | The English sound in katakana. |
| Gild Trout | ギルドマス | Gild = ギルド in every compound. |
| Azar | アザール | The English sound in katakana. |
| Pinch of Saffron | サフランひとつまみ | The name as in its own row + a kanji generic. |
| Pim Crumble | ピム・クランブル | The English sound in katakana. |
| Goose Loaf | ガチョウパン | A loaf shaped like a goose. |
| Signora Vell | シニョーラ・ヴェル | The Italian title kept in katakana. |
| River-Blue Cloth | 川青の布 | The colour of the river. |
| Ottilie Clay | オティリー・クレイ | The English sound in katakana. |
| Clay Cup | 素焼きのカップ | The name as in its own row + a kanji generic. |
| Goodman Hollis | ホリスおじさん | Goodman = おじさん (the children's word for him). |
| Dozen Eggs | 卵1ダース | The name as in its own row + a kanji generic. |
| Daisy | デイジー | The English sound in katakana. |
| Marigold Posy | マリーゴールドの花束 | The name as in its own row + a kanji generic. |
| Master Brie | ブリー親方 | Master (a craftsman: cheesemonger) = 親方. |
| Wedge of Gild Blue | ギルドブルーひと切れ | Gild Blue is a blue cheese. |
| Mother Wenna | ウェンナおかみ | The innkeeper: おかみ, the landlady. |
| Garr the Bargeman | 船頭ガー | Bargeman = 船頭. |
| Sister Wynn | シスター・ウィン | The English sound in katakana. |
| Beck | ベック | The English sound in katakana. |
| Tilly | ティリー | The English sound in katakana. |
| Corporal Dunn | ダン伍長 | The English sound; the title as in §1.1. |
| Fennick | フェニック | The English sound in katakana. |
| Old Salt Merrow | 老水夫メロウ | An "old salt" is a veteran sailor: 老水夫. |
| Master Odd | オッド先生 | A customs clerk (scholar): 先生. |
| Alba Quern | アルバ・クァーン | Same family as Tobias Quern. |
| Rurik Hammerstane | リューリク・ハンマーステイン | The English sound in katakana. |
| Hamish Mott | ヘイミッシュ・モット | The English sound in katakana. |
| Mug of Gild Ale | ギルドエール1杯 | The name as in its own row + a kanji generic. |
| Joss Plane | ジョス・プレイン | The English sound in katakana. |
| Harbourmaster Ysolde | 港長イソルデ | Kept apart from Isolde イゾルデ. |
| Dob | ドッブ | Not ドブ (a ditch). |
| Merrit | メリト | Not メリット (an advantage). |
| Gran Tessaly | テッサリーばあちゃん | Gran = ばあちゃん, warmer than おばあさん (Grandmother). |
| Smoked Gild Trout | ギルドマスの燻製 | The name as in its own row + a kanji generic. |
| Old Wick | ウィックじいさん | "Old X". |
| Bramwell Bun | ブラムウェル・バン | A family name (the baker): sound. |
| Saffron Bun | サフランパン | The English sound in katakana. |
| Hob | ホブ | The English sound in katakana. |
| Hester | ヘスター | The English sound in katakana. |
| Dame Agnes | アグネス先生 | She keeps the town's school: a dame-school teacher. |
| Brother Tuck | タック修道士 | Brother = 修道士 after the name. |
| Ned the Porter | 荷運びネッド | The English sound; the title as in §1.1. |
| Ada | エイダ | Also Sister Ada. |
| Milla | ミーラ | Kept apart from Mira ミラ. |
| Tam the Piper | 笛吹きタム | The English sound; the title as in §1.1. |
| Gwen the Bargewife | 船乗りグウェン | A woman of the barges. |
| Lady Odelia Fairgild | レディ・オデリア・フェアギルド | Lady = レディ・ before the name. |
| Guardsman Pell | 衛兵ペル | Guardsman = 衛兵. |
| Mother Celandine | セランディン院長 | The Abbess: 院長. |
| Novice Cass | 見習いキャス | Not カス (dregs). |
| Elric the Pilgrim | 巡礼者エルリック | The English sound; the title as in §1.1. |
| Brother Anselm | アンセルム修道士 | The English sound; the title as in §1.1. |
| Guildmaster Orrin | 組合長オリン | Guild = 組合, so that ギルド stays "Gild". |
| Captain Hale | ヘイル隊長 | Not Emberfall's Corporal Hale, but the same name. |
| Sorrel | ソレル | The English sound in katakana. |
| Lady Amabel Thornbury | レディ・アマベル・ソーンベリー | The English sound in katakana. |
| Hazel | ヘーゼル | The English sound in katakana. |
| The Lookout | 見張り台 | Captain Hale's post: also {Lookout} in lines. |
| High Town | 上町 | The upper town. |
| Sunspire Abbey | サンスパイア修道院 | A proper name in katakana + 修道院. |
| The bell rings the fair closed at dusk | 夕暮れの鐘が祭りの終わりを告げる | Banner. |
| Gildhaven Hall | ギルドヘイヴン市庁舎 | The town hall. |
| Scholars' Row | 学者通り | Row/Lane/Street = 通り/小路. |
| The Watch | 衛兵詰所 | The watch house of the town guard. |
| Pippin Orchard | ピピン果樹園 | Pippin, an apple variety. |
| Crown Walk | 王冠通り | Meaningful rendering in kanji. |
| The Rampart Walk | 城壁の遊歩道 | Meaningful rendering in kanji. |
| The whole town below | 眼下に広がる町 | Banner. |
| The Abbey, the Hall and the Rampart Walk | 修道院、市庁舎、城壁の遊歩道 | Banner: the three names. |
| The Grand Stair | 大階段 | Meaningful rendering in kanji. |
| The Harbour Stair | 港の階段 | Meaningful rendering in kanji. |
| The Gildfall | ギルドの滝 | The falls of the River Gild. |
| Where the Gild leaves High Town | ギルド川が上町を去るところ | The Gild = ギルド川. |
| Kingsbridge | 王の橋 | One of three bridges: 塩の橋, 王の橋, 霧の橋. |
| North Quay | 北波止場 | Quay = 波止場. |
| The Undercliff | 崖下の町 | Meaningful rendering in kanji. |
| West Quarter | 西地区 | Meaningful rendering in kanji. |
| The West Quarter | 西地区 | The same place. |
| Market Square | 市場広場 | Meaningful rendering in kanji. |
| Gild Fair · Stalls, crier and the Gild Well | ギルド祭・屋台と触れ役とギルドの泉 | Banner. |
| Barge Quay | 艀の波止場 | Meaningful rendering in kanji. |
| East Quarter | 東地区 | Meaningful rendering in kanji. |
| The Gild Pool | ギルドの淵 | Pool = 淵 (a deep river pool). |
| Gildhaven Harbour | ギルドヘイヴン港 | The name as in its own row + a kanji generic. |
| Piers, gulls and the smokehouse | 桟橋とカモメと燻製小屋 | Banner. |
| Market Street | 市場通り | Meaningful rendering in kanji. |
| Bellgreen | 鐘ヶ原 | A green: ヶ原, the old place-name form. |
| Lantern Row | ランタン通り | The name as in its own row + a kanji generic. |
| Weaver's Lane | 機織り小路 | Meaningful rendering in kanji. |
| The South Gate | 南門 | Meaningful rendering in kanji. |
| The Allotments | 市民菜園 | Meaningful rendering in kanji. |
| The Fairground | 祭り広場 | Meaningful rendering in kanji. |
| Fairfield | フェアフィールド | A district name: katakana. |
| The Wandering Lark Players · Today only | さすらいの雲雀一座・本日限り | Troupe names are meaningful: 一座. |
| Fairfield Mill | フェアフィールドの風車 | A windmill. |
| Barlow's Farm | バーロウの農場 | The name as in its own row + a kanji generic. |
| Outside the South Gate · Fair day | 南門の外・祭りの日 | Banner. |

### 3.11 Starfall Vale

Where: `levels/starfall-vale`.

| English | 日本語 | Why |
|---|---|---|
| Mayor Aldous Bramblecote | オルダス・ブランブルコート町長 | Mayor of a town = 町長 (the Lord Mayor of Gildhaven is 市長). |
| Marigold Fenn | マリーゴールド・フェン | The English sound in katakana. |
| Barnaby Crumb | バーナビー・クラム | The English sound in katakana. |
| Starlight Bun | 星明かりパン | Also "Starlight Buns" in lines. |
| Garrick Ironwell | ギャリック・アイアンウェル | The English sound in katakana. |
| Quentin Fairweather | クエンティン・フェアウェザー | The English sound in katakana. |
| Paper Lantern | 紙灯籠 | Floated on the lake: 灯籠流し. |
| Old Nell | ネルばあさん | "Old X" (she says "dearie"). |
| Moonpetal Tea | 月花茶 | An invented flower: meaningful. |
| Tamsin Bloom | タムシン・ブルーム | The English sound in katakana. |
| Starbloom Garland | 星花の花輪 | Starbloom = 星花. |
| Sergeant Hobb Vane | ホッブ・ヴェイン軍曹 | The English sound; the title as in §1.1. |
| Sister Amarantha | シスター・アマランサ | The English sound in katakana. |
| Poppy | ポピー | The English sound in katakana. |
| Hollis Barleycorn | ホリス・バーリーコーン | The English sound in katakana. |
| Wendel the Miller | 粉屋ウェンデル | The English sound; the title as in §1.1. |
| Tansy | タンジー | The English sound in katakana. |
| Master Casimir Vey | カシミール・ヴェイ先生 | The Stargazer: 先生. |
| Rowan the Wayfarer | さすらいのローワン | The English sound; the title as in §1.1. |
| Old Gorse | ゴースじいさん | The English sound; the title as in §1.1. |
| Dunstan Flint | ダンスタン・フリント | The English sound in katakana. |
| Professor Ptolemy Marrow | トレミー・マロウ教授 | Ptolemy as an English name: トレミー. |
| Grandmother Isolde | イゾルデおばあさん | The English sound; the title as in §1.1. |
| Marlow Tench | マーロウ・テンチ | The English sound in katakana. |
| Wick Reed | ウィック・リード | The English sound in katakana. |
| Finn Ashdown | フィン・アッシュダウン | The English sound in katakana. |
| Warden Ivo | 衛士イーヴォ | Warden = 衛士 (UI mockup), before the name like a class. |
| Lark Silverstring | ラーク・シルバーストリング | The English sound in katakana. |
| Signor Orsino | シニョール・オルシーノ | The English sound in katakana. |
| Festival Ribbon | お祭りリボン | The name as in its own row + a kanji generic. |
| Ansel Birchwood | アンセル・バーチウッド | The English sound in katakana. |
| Kestrel | ケストレル | The English sound in katakana. |
| Old Thistle | シスルじいさん | The hermit. |
| The Lumen Observatory | ルーメン天文台 | Lumen = ルーメン. |
| Mount Lumen | ルーメン山 | The name as in its own row + a kanji generic. |
| Home of the Stargazer | 星読みの住まう地 | Stargazer = 星読み. |
| Lumen Lookout | ルーメン展望台 | A scenic lookout = 展望台. |
| Silverspring | 銀の泉 | A natural place: kanji. |
| The Plateau | 高原 | Meaningful rendering in kanji. |
| The roof of the vale | 谷の屋根 | Banner. |
| Stargazer's Steps | 星読みの石段 | Meaningful rendering in kanji. |
| The Three Sisters | 三姉妹 | Three falls; also {Three Sisters} in lines. |
| Three falls, one river | 三つの滝、ひとつの川 | Banner. |
| The High Terrace | 上の高台 | Terrace = 高台. |
| The Foothills | 山麓 | Meaningful rendering in kanji. |
| Mirror Falls | 鏡の滝 | Meaningful rendering in kanji. |
| Amberpine Heights | 琥珀松の高地 | Heights = 高地. |
| Above Mirrormere | 鏡湖の上手 | Meaningful rendering in kanji. |
| Pines above the mirror | 鏡を見下ろす松 | Banner. |
| The North Shore | 北の岸辺 | Also "the North Shore of Mirrormere". |
| Lake Mirrormere | 鏡湖 | A lake (natural): kanji; "Mirrormere" alone is 鏡湖 too. |
| Old Lumen | 旧ルーメン | The ruined first town. |
| Ruins of the first town | 最初の町の遺跡 | Banner. |
| Where the first stones were cut | 最初の石が切り出されたところ | Banner. |
| Goldenfield Farms | 黄金畑の農場 | Descriptive: 黄金畑. |
| Barleycorn Farm | バーリーコーン農場 | Named for Hollis Barleycorn. |
| Goldenfield Orchard | 黄金畑の果樹園 | Meaningful rendering in kanji. |
| Barley, windmills and wishes | 大麦と風車と願いごと | Banner. |
| Hearthwick Square | ハースウィック広場 | The name as in its own row + a kanji generic. |
| Hearthwick | ハースウィック | A town: katakana. |
| Chapel Row | 礼拝堂通り | Meaningful rendering in kanji. |
| Southgate | 南門町 | A district (Gildhaven's The South Gate is 南門). |
| The Market Town | 市場町 | Meaningful rendering in kanji. |
| The market town of the vale | 谷の市場町 | Banner. |
| Mirrormere Landing | 鏡湖の船着き場 | Meaningful rendering in kanji. |
| Fresh fish, old stories | とれたての魚と昔話 | Banner. |
| Reedmouth | 葦の河口 | A natural place: kanji. |
| The South Beach | 南の浜 | Meaningful rendering in kanji. |
| Bramble Hollow | いばらの窪地 | Meaningful rendering in kanji. |
| The Meadowlands | 草原地帯 | Also {Meadowlands} in lines. |
| Where the stars sleep | 星の眠るところ | Banner. |
| The Troupe Camp | 一座の野営地 | Meaningful rendering in kanji. |
| The Wandering Lanterns | さすらいの灯一座 | The troupe; {Wandering Lanterns} in lines is さすらいの灯. |
| Flowers as far as the lantern-light | ランタンの灯の届くかぎり、花 | Banner. |
| The Hidden Glade | 隠れ林 | Glade = 林. |
| Emberwood | 熾火の森 | A forest (natural): kanji; 熾火 = glowing embers. |
| Where the first star is remembered | 最初の星が語り継がれるところ | Banner. |
| Woodcutter's Camp | きこりの野営地 | Meaningful rendering in kanji. |
| The forest that remembers autumn | 秋を覚えている森 | Banner. |

### 3.12 Names that appear only inside lines

Where: every table: write these inside sentences and {gold} spans. Not terms: write them inside lines.

| English | 日本語 | Why |
|---|---|---|
| the Cinderwatch (the order) | シンダーウォッチ | "Captain Maren, of the Cinderwatch" = シンダーウォッチのマレン隊長. |
| Warden of the Cinderwatch | シンダーウォッチの衛士 | Sela's title (UI mockup). |
| Scout of the Cinderwatch | シンダーウォッチの斥候 | Rook's title, built like Sela's. |
| Keeper of the Waystones | 道標石の守り手 | Sister Ilse's title; waystone = 道標石. |
| the quarry lip | 採石場の縁 | Cinderwatch. |
| Duchess (Pip's hen) | 公爵夫人 | A hen with a grand name: keep the joke. |
| Duchess Feathers (Tansy's hen) | 羽毛の公爵夫人 | As Duchess. |
| Emberfall Evening (Wren's song) | 『エンバーフォールの夕べ』 | Song titles in 『』. |
| Ember ale | エンバーエール | The inn's ale. |
| Brightwater Inn | ブライトウォーター亭 | Inns: 亭. |
| Old Bridge | 古橋 | Meaningful rendering in kanji. |
| Rosehip Cottage | ローズヒップ荘 | Cottage names: 荘. |
| the River Gild / the Gild | ギルド川 | The name as in its own row + a kanji generic. |
| Gild Fair (fair day) | ギルド祭（祭りの日） | The fair is a festival with players and music. |
| Gild Well | ギルドの泉 | The name as in its own row + a kanji generic. |
| Gild Ale / Gild Blue | ギルドエール／ギルドブルー | The name as in its own row + a kanji generic. |
| Sun Well | 日の泉 | Meaningful rendering in kanji. |
| Sunspire Bell | サンスパイアの鐘 | The name as in its own row + a kanji generic. |
| Saltbridge · Mistbridge · Hall Bridge | 塩の橋・霧の橋・市庁舎橋 | The bridges of the Gild. |
| King's Road | 王の街道 | Gildhaven and Starfall Vale. |
| Main Street · Mill Lane | 大通り・粉挽き小路 | The name as in its own row + a kanji generic. |
| the Fish Quay · the Piers · the Boathouse | 魚河岸・桟橋・舟小屋 | The name as in its own row + a kanji generic. |
| East Pier · West Pier | 東桟橋・西桟橋 | The name as in its own row + a kanji generic. |
| the Barrelhouse | 樽屋 | Hamish Mott's alehouse. |
| The Gilded Goose | 金のガチョウ亭 | Mother Wenna's inn. |
| Watch House | 衛兵詰所 | As The Watch. |
| Saffron Bakery | サフランパン屋 | The name as in its own row + a kanji generic. |
| Shrine of the Tide | 潮の社 | Meaningful rendering in kanji. |
| the Gilt Library | 金箔の書庫 | Gilt (金箔) is not Gild (ギルド). |
| the Guild Exchange | 組合取引所 | Guild = 組合. |
| the Lord Mayor | 市長閣下 | Lady Odelia's office. |
| the Abbess | 修道院長 | Mother Celandine. |
| the Wandering Lark Players | さすらいの雲雀一座 | The troupe at the fair. |
| Starfall (the night, the festival) | 星降り（星降りの夜） | "Every Starfall" = 毎年の星降り. |
| Starfall Festival | 星降り祭 | Meaningful rendering in kanji. |
| the Stargazer | 星読み | Master Casimir. |
| the Observatory | 天文台 | Meaningful rendering in kanji. |
| Starlight Inn | 星明かり亭 | Meaningful rendering in kanji. |
| the Star Register | 星の記録簿 | Meaningful rendering in kanji. |
| Chapel of the Fallen Stars | 落ちた星の礼拝堂 | Meaningful rendering in kanji. |
| the Lantern of Lyra | こと座の灯 | Lyra = こと座. |
| Star-glass | 星硝子 | Meaningful rendering in kanji. |
| the Silverrun (the vale's river) | 銀流川 | Meaningful rendering in kanji. |
| the Long Pier | 長桟橋 | Meaningful rendering in kanji. |
| the Star Dance | 星の舞 | Meaningful rendering in kanji. |
| the Star Cairn | 星の石塚 | Meaningful rendering in kanji. |
| The Heron Spit | 鷺の砂州 | Meaningful rendering in kanji. |
| The Wishing Oak | 願いの樫 | Meaningful rendering in kanji. |
| the East Road (Starfall) | 東の街道 | As Millbrook's. |
| the hermit | 隠者 | Old Thistle. |
| the ferry bell | 渡しの鐘 | Meaningful rendering in kanji. |
| the elder | 長老 | The English sound; the title as in §1.1. |
| traveller / traveler | 旅人 | The UI mockup's word for the player; both English spellings. |

### 3.13 Recurring terms the content shares with the UI

Where: lines, banners and the combat/party UI (`src/game/*/strings.js`). Not terms: write them inside lines.

| English | 日本語 | Why |
|---|---|---|
| Warden · Ranger · Mystic | 衛士・狩人・秘術士 | The UI mockup's classes. |
| Healing Draught | 回復薬 | UI mockup; "draughts" in lines too. |
| Whetstone · Ironbark Tonic · Warding Charm | 砥石・鉄樹の強壮薬・守りの護符 | The shop wares ("whetstones, tonic, a ward"). |
| Whirl Slash · Ember Bolt · Radiant Nova · Mend | 旋風斬り・火炎弾・光輝ノヴァ・ヒール | UI mockup. |
| slime · goblin · archer · shaman · bat · boar | スライム・ゴブリン・弓兵・シャーマン・コウモリ・イノシシ | Monster words in lines and banners. |
| Moss Slime · Bramble Goblin · Thorn Archer · Hex Shaman · Cinder Bat · Ironhide Boar · Straw Dummy | モススライム・いばらゴブリン・棘の弓兵・呪術シャーマン・シンダーバット・アイアンハイドボア・わら人形 | The enemy kinds, built from the place words (いばら, シンダー, アイアンハイド). |
| The Last Fire of the Pass | 峠に残りし最後の火 | Cinderheart's epithet (UI mockup). |
| Tactics · Presets · Rules · Party | 作戦・方針・指示・パーティ | UI mockup. |
| Golden Hour · Dusk | 夕映え・黄昏 | UI mockup. |
| HP · MP · SP · XP · Lv · G | HP・MP・SP・XP・Lv・G | Latin, as in Japanese RPGs. |

## 4. Simplified Chinese (zh)

### 4.1 Code defaults and strings every level shares

Where: Signpost, Villager, Waystone, Untitled and Untitled campaign are terms of `common`; Notice is
a term of `campaigns/ferrymans-lantern` (a sign's speaker). Crisp Apple, Enter, Look, The way is
closed., the chest and waystone lines, Nothing of note., The End and A Luminati 2.5D Level are UI
strings (`game.default.*`, `game.prompt.*`, `campaign.exit.closed`, `story.ending.default`), and
so are Press any key and the engine credit where they stand in for a blank title prompt or credit.
The narration lines, the choices, the title prompts and credits, and A Luminati campaign are units of
each table whose files say them, and of `common` where `dialogue.js` says them (`dlg.*`).

| English | 中文 | Why |
|---|---|---|
| Signpost | 指示牌 | A sign with directions or a notice; kept apart from 路标石 (Waystone). |
| Notice | 告示 | A posted notice. |
| Villager | 村民 | The plain word. |
| Waystone | 路标石 | The UI mockup's word: 路标 + 石. |
| Crisp Apple | 脆甜苹果 | Crisp and sweet: how a stall names an apple. |
| Enter | 进入 | Prompt verbs are two characters, like the UI mockup's 交谈. |
| Look | 查看 | The usual examine verb. |
| The way is closed. | 此路不通。 | The set phrase. |
| The chest is locked tight. | 宝箱锁得严严实实。 | Narration. |
| An old waystone hums quietly. | 一块古老的路标石正低声嗡鸣。 | Uses the glossary's 路标石. |
| Nothing of note. | 没有什么特别的。 | The usual examine line. |
| The door is latched. Somewhere inside, a kettle begins to sing. | 门上了闩。屋里不知何处，一只水壶唱起歌来。 | Narration. |
| You make a small wish of your own. | 你也悄悄许下了一个小小的心愿。 | The player is 你 in narration. |
| Not yet | 还不是时候 | The UI mockup's choice for Sela; also fits the innkeeper and, with a wink, "have you seen …?". |
| Rest until morning | 休息到天亮 | Choices are short verb phrases. |
| Yes, please | 好的，谢谢 | Polite acceptance. |
| Just looking | 随便看看 | The set phrase of a browsing customer. |
| No, thank you | 不用了，谢谢 | A polite refusal. |
| Not today | 今天就算了 | A casual refusal. |
| Maybe later | 下次吧 | A casual "another time". |
| Not now | 现在不用 | A casual "not now". |
| Press any key | 按任意键开始 | The usual title-screen prompt. |
| The End | 完 | The classic one-character ending. |
| Untitled | 未命名 | The software word. |
| Untitled campaign | 未命名冒险 | 冒险 rather than 战役 (a war campaign). |
| A Luminati campaign | Luminati 冒险 | See "Untitled campaign"; Luminati stays Latin. |
| A Luminati 2.5D Level | Luminati 2.5D 关卡 | 关卡 is the player-facing word for a level. |
| Luminati 2.5D Pixel-Art Engine · three.js | Luminati 2.5D 像素艺术引擎 · three.js | Credits keep Latin product names; the separator stays " · ". |

### 4.2 Levels, campaigns and title screens

Where: the shipped levels' names are terms of `common`; a campaign's name and its levels' names
are terms of its table. The subtitles, title-screen lines, chapter titles and the ending's title
are units of the table of the file that holds them.

| English | 中文 | Why |
|---|---|---|
| Emberfall | 烬落村 | "Where embers fall"; 烬 is the UI mockup's ember/cinder character; 村 marks the village. |
| EMBERFALL | 烬落村 | The same name (no case in Chinese). |
| Cinderwatch Pass | 烬望隘口 | The UI mockup's name. |
| CINDERWATCH PASS | 烬望隘口 | The UI mockup's title. |
| Starfall Vale | 星落谷 | 星落: falling stars, the level's event; 谷 for the vale. |
| STARFALL VALE | 星落谷 | The same name. |
| Gildhaven | 鎏金港 | 鎏金 "gilded" (the town is named for river gold dust) + 港 "haven". |
| GILDHAVEN | 鎏金港 | The same name. |
| Brightwater Crossing | 明水渡 | 明水 "bright water" + 渡, a ferry crossing as in classic place names (风陵渡). |
| Willowmere | 柳湖村 | 柳 willow + 湖 mere; 村 for the hamlet. |
| Millbrook | 磨溪村 | 磨 mill + 溪 brook; 村 for the village. |
| The Old Quarry | 旧采石场 | A descriptive place; also "Old Quarry" inside lines. |
| The Windmill | 风车磨坊 | The building. |
| The Ferryman's Lantern | 摆渡人的提灯 | 摆渡人 is gender-free (Ilse is a woman); 提灯, a lamp carried by hand. |
| THE FERRYMAN'S LANTERN | 摆渡人的提灯 | The same title. |
| A short tale of Millbrook | 磨溪村的小故事 | Subtitle register. |
| Emberfall — Open Doors | 烬落村——敞开的门 | The Chinese dash —— between name and subtitle. |
| Open Doors — every house has a room behind its door | 敞开的门——每座房子的门后都有一个房间 | Title line; —— for the English dash. |
| Riverside Village | 河畔村庄 | Emberfall's subtitle. |
| A Luminati 2.5D Pixel-Art Engine Demo | Luminati 2.5D 像素艺术引擎演示 | Latin product name. |
| Where the Old Fires Wake | 古火苏醒之地 | The UI mockup's tagline. |
| A Luminati 2.5D action demo · three.js | Luminati 2.5D 动作演示 · three.js | The UI mockup's footer. |
| Market Day on the River Gild | 鎏金河畔集市日 | River Gild = 鎏金河. |
| A Luminati 2.5D town · three.js | Luminati 2.5D 城镇 · three.js | Credit line. |
| Where the Stars Come Home | 群星归来之地 | Title tagline in 之地, like the UI mockup's. |
| A Luminati 2.5D showcase · three.js | Luminati 2.5D 展示 · three.js | Credit line. |
| A Riverside Hamlet | 河畔小村落 | Brightwater's subtitle. |
| A Hamlet by the Pond | 池畔小村 | Willowmere's subtitle. |
| Chapter One | 第一章 | The standard chapter heading. |
| The Broken Ford | 断绝的渡口 | The crossing is cut. |
| Chapter Two | 第二章 | The standard chapter heading. |
| Lanterns Home | 灯火归途 | Lamps lighting the way home. |
| The Lantern Home | 提灯归家 | The ending title. |

### 4.3 Villagers who appear in more than one level

Where: a term in each table that shows the name (Pip in `levels/cinderwatch-pass`,
`levels/emberfall` and `campaigns/ferrymans-lantern`): one rendering, which the checker keeps
equal.

| English | 中文 | Why |
|---|---|---|
| Pip | 皮普 | The UI mockup's name (Pip in Great Expectations). |
| Wren | 雷恩 | The standard rendering (Christopher Wren 雷恩). |
| Bram | 布拉姆 | Bram Stoker 布拉姆; kept apart from Bran 布兰. |
| Tamsin | 塔姆辛 | Also Tamsin Bloom, Tamsin's Farm. |
| Rosalind | 罗莎琳德 | The Shakespeare rendering. |
| Tilda | 蒂尔达 | Tilda Swinton 蒂尔达. |
| Fenna | 芬娜 | 娜 for a woman's name. |
| Saffi | 萨菲 | Standard transliteration. |
| Kit | 基特 | Kit Harington 基特. |
| Posy | 波西 | Standard transliteration. |

### 4.4 Cinderwatch Pass

Where: `levels/cinderwatch-pass`.

| English | 中文 | Why |
|---|---|---|
| Sela | 瑟拉 | The UI mockup's name. |
| Captain Maren | 玛伦队长 | Ranks follow the name (队长, 中士, 下士). |
| Sister Ilse | 伊尔莎修女 | 修女 after the name; the same Ilse as Millbrook's. |
| Rook | 鲁克 | Standard transliteration; the camp's bowman. |
| Odo | 奥多 | Also Miller Odo. |
| Camp Waystone | 营地的路标石 | Built like the UI mockup's 十字路口的路标石. |
| Crossroads Waystone | 十字路口的路标石 | The UI mockup's name. |
| Quarry Waystone | 采石场的路标石 | As above. |
| Old Ironhide | 老铁皮 | The UI mockup's name. |
| Cinderheart | 烬心 | The UI mockup's name. |
| The Caldera | 火山口 | The UI mockup's name; also {Caldera} in lines. |
| Waystone Camp | 路标石营地 | The region of the camp. |
| Straw dummies and a warm fire · Safe | 稻草假人与温暖的篝火 · 安全区 | Banner; " · " kept. |
| The Crossroads | 十字路口 | The UI mockup's name. |
| Cinder Ridge | 烬火岭 | Cinder = 烬火 in place names (烬火岭, 烬火采石场). |
| Mossy Glade | 青苔林地 | Glade = 林地. |
| Slimes and goblins · Lv 2 | 史莱姆与哥布林 · Lv 2 | Monster words as in the combat UI; Lv stays Latin. |
| Bramble Ruins | 荆棘遗迹 | Bramble = 荆棘. |
| Goblins, archers and a shaman · Lv 7–8 | 哥布林、弓手与萨满 · Lv 7–8 | Archer = 弓手, shaman = 萨满 (UI mockup). |
| Hollow Mire | 洼地沼泽 | A mire in a hollow. |
| Bats, slimes and a shaman · Lv 6–7 | 蝙蝠、史莱姆与萨满 · Lv 6–7 | Banner. |
| Cinder Quarry | 烬火采石场 | As Cinder Ridge. |
| Ironhide boars and archers · Lv 8 | 铁皮野猪与弓手 · Lv 8 | Ironhide Boar = 铁皮野猪 (Old Ironhide = 老铁皮). |

### 4.5 Emberfall

Where: `levels/emberfall` (read by Open Doors too).

| English | 中文 | Why |
|---|---|---|
| Elder Maren | 玛伦长老 | 长老 after the name. |
| Bertram | 伯特伦 | The Shakespeare rendering. |
| Corporal Hale | 黑尔下士 | Corporal = 下士. |
| Old Tobin | 老托宾 | "Old X" = 老X, gender-free. |
| Ottoline Quill | 奥托琳·奎尔 | Full names keep the · between given and family name. |
| Windmill Hill | 风车丘 | A descriptive place. |
| Where the valley keeps its winds | 山谷藏风之处 | Region banners end in 之处. |
| Tobin's Farm | 托宾农场 | X's Farm = X农场. |
| Amberleaf Grove | 琥珀叶林 | A descriptive name. |
| Campfire Meadow | 篝火草地 | Descriptive. |
| Emberfall Falls | 烬落瀑布 | 烬落 without 村 before 瀑布. |
| Village Square | 村中广场 | Descriptive. |

### 4.6 Emberfall — Open Doors (the rooms)

Where: `campaigns/emberfall-interiors`.

| English | 中文 | Why |
|---|---|---|
| The Ember & Oak | 烬火橡木旅店 | Inn names end in 旅店; 烬 as in 烬落村. Also {Ember & Oak} in lines. |
| The Taproom | 酒馆 | The inn's ground floor. |
| Garrick | 加里克 | Also Garrick Ironwell. |
| Old Nan | 南婆婆 | Grannies are X婆婆. |
| Sir Brannoc | 布兰诺克爵士 | Sir = 爵士 after the name. |
| Go upstairs | 上楼 | Exit prompts: two characters. |
| Go out | 出去 | Exit prompt. |
| Go downstairs | 下楼 | Exit prompt. |
| The Guest Rooms | 客房 | Meaningful rendering. |
| Master Ivo | 伊沃先生 | Master (learned) = 先生; craftsmen are 师傅. |
| Sister Ada | 艾达修女 | Sister = 修女. |
| The Millstone Floor | 石磨层 | Windmill floors. |
| Miller Hesk | 磨坊主赫斯克 | Trade + name (磨坊主奥多, 农夫巴洛). |
| The Cap Floor | 顶层 | The top floor. |
| Tam | 塔姆 | Also Tam the Piper. |
| Tobin's Barn | 托宾的谷仓 | The name as in its own row + a generic word. |
| Hay and Patience | 干草与耐心 | Room subtitle. |
| Hilde | 希尔德 | Standard transliteration. |
| The Hayloft | 干草阁楼 | Meaningful rendering. |
| Wendel | 温德尔 | Also Wendel the Miller. |
| Elder's Cottage | 长老的小屋 | Meaningful rendering. |
| Books by the Fire | 炉边书香 | Room subtitle. |
| Linden | 林登 | Standard transliteration. |
| Riverside House | 河畔小屋 | Meaningful rendering. |
| The Kettle Sings | 水壶在歌唱 | Room subtitle. |
| Auntie Bryony | 布里奥妮阿姨 | Auntie = 阿姨. |
| Thatched Cottage | 茅草屋 | Meaningful rendering. |
| Fresh Bread | 新出炉的面包 | Room subtitle. |
| Woodcutter's Lodge | 樵夫小屋 | Woodcutter = 樵夫. |
| A Song About Axes | 斧头之歌 | Room subtitle. |
| Rowan | 罗文 | Also Rowan the Wayfarer. |

### 4.7 The Ferryman's Lantern

Where: `campaigns/ferrymans-lantern` (levels and story files).

| English | 中文 | Why |
|---|---|---|
| A Mill by the Brook | 溪边的磨坊 | Mill = 磨坊. |
| Elder Wren | 雷恩长老 | As Elder Maren. |
| Hollis | 霍利斯 | Also Goodman Hollis, Hollis Barleycorn. |
| Miller Odo | 磨坊主奥多 | Trade + name. |
| Watchman Bran | 哨兵布兰 | Watchman = 哨兵; Bran 布兰 is not Bram 布拉姆. |
| Search | 搜寻 | Event prompt. |
| Mill Hill | 磨坊丘 | Kept apart from Windmill Hill 风车丘. |
| Where the sails turn | 风车转动之处 | Banner. |
| The East Road | 东大路 | Also "the east road" in lines. |
| Millbrook Green | 磨溪村绿地 | A village green = 绿地. |
| The Night of Lanterns | 提灯之夜 | Level subtitle. |
| Ilse | 伊尔莎 | The ferryman (a woman). |
| Festival Bun | 节庆面包 | Buns are 面包. |
| Mill Road | 磨坊路 | Meaningful rendering. |
| Down to the Wolf Ford | 前往狼渡 | Level subtitle. |
| Gwil the Peddler | 货郎格威尔 | "X the Y" = role + name. |
| Wolf Ford | 狼渡 | 渡: a ford in place names. |
| Where the river runs wide | 河面开阔之处 | Banner. |
| Between Millbrook and the Old Quarry | 磨溪村与旧采石场之间 | Region line. |
| Where the Lantern Went | 提灯的去向 | Level subtitle. |
| Quarry Gate | 采石场之门 | The waystone of the Old Quarry. |
| Ferryman's Ledge | 摆渡人岩台 | Ledge = 岩台. |
| A lantern still burns | 提灯仍亮着 | Banner. |
| East of the Wolf Ford | 狼渡以东 | Region line. |
| Mind the slimes | 当心史莱姆 | Banner. |
| The Mill Cellar | 磨坊地窖 | Meaningful rendering. |
| Under the Mill House | 磨坊之下 | Level subtitle. |
| Read | 阅读 | Event prompt: a built-in verb, the UI string `game.prompt.read`. |
| Climb up | 爬上去 | Exit prompt. |
| Oak Plank | 橡木板 | Oak = 橡木. |
| Cellar Key | 地窖钥匙 | Meaningful rendering. |
| Ferry Chart | 渡船水路图 | Ilse's chart of the river. |
| Ferry Lantern | 渡船提灯 | The name as in its own row + a generic word. |
| The Missing Ferryman | 失踪的摆渡人 | Quest title. |

### 4.8 Brightwater Crossing

Where: `levels/brightwater-crossing`.

| English | 中文 | Why |
|---|---|---|
| Elda | 埃尔达 | Standard transliteration. |
| Marigold | 玛丽戈尔德 | The innkeeper; the flower is 金盏花. |
| Honey Bun | 蜂蜜面包 | The name as in its own row + a generic word. |
| Miller's Hill | 磨坊主之丘 | Kept apart from Mill Hill and Windmill Hill. |
| Where the sails turn even when the wind forgets | 风忘了吹，风车也照转之处 | Banner. |
| Brightwater Falls | 明水瀑布 | The name as in its own row + a generic word. |
| Lily Pond | 睡莲池 | Meaningful rendering. |
| Tamsin's Farm | 塔姆辛农场 | The name as in its own row + a generic word. |
| Brightwater Square | 明水广场 | The name as in its own row + a generic word. |
| Where the river bends and the lanterns glow | 河水转弯、灯火闪烁之处 | Banner. |

### 4.9 Willowmere (sample-hamlet)

Where: `levels/sample-hamlet`.

| English | 中文 | Why |
|---|---|---|
| Mira | 米拉 | Kept apart from Milla 蜜拉. |
| Old Fen | 老芬 | "Old X". |
| Honey Cake | 蜂蜜蛋糕 | The name as in its own row + a generic word. |
| Orchard Terrace | 果园台地 | Terrace = 台地, Heights = 高地. |
| Where the old trees keep watch | 古树守望之处 | Banner. |
| Mirror Pond | 镜池 | Mirror = 镜. |
| Willowmere Green | 柳湖村绿地 | The name as in its own row + a generic word. |

### 4.10 Gildhaven

Where: `levels/gildhaven`.

| English | 中文 | Why |
|---|---|---|
| Sergeant Brask | 布拉斯克中士 | Sergeant = 中士. |
| Corporal Lisbet | 莉丝贝特下士 | Transliteration; the title as in §1.1. |
| Florin Fiddlewick | 弗洛林·菲德尔威克 | Standard transliteration. |
| Mirela | 米蕾拉 | Standard transliteration. |
| Corwin the Juggler | 杂耍艺人科温 | Role + name. |
| Hetty Bramble | 赫蒂·布兰布尔 | A family name: sound, not 荆棘. |
| Toffee Apple | 太妃糖苹果 | Meaningful rendering. |
| Fair Ribbon | 集市丝带 | Fair = 集市. |
| Edda | 埃达 | The Edda 埃达. |
| Old Ambrose | 老安布罗斯 | "Old X". |
| Daro the Wayfarer | 漫游者达罗 | Wayfarer = 漫游者; 旅人 is the player. |
| Farmer Barlow | 农夫巴洛 | Transliteration; the title as in §1.1. |
| Nim | 尼姆 | Standard transliteration. |
| Tobias Quern | 托拜厄斯·奎恩 | Standard transliteration. |
| Crier Bertil | 公告员贝蒂尔 | Town crier = 公告员. |
| Dora Haddock | 多拉·哈多克 | Standard transliteration. |
| Gild Trout | 鎏金鳟鱼 | Gild = 鎏金 in every compound. |
| Azar | 阿扎尔 | Standard transliteration. |
| Pinch of Saffron | 一撮藏红花 | The name as in its own row + a generic word. |
| Pim Crumble | 皮姆·克朗布尔 | Standard transliteration. |
| Goose Loaf | 鹅形面包 | A loaf shaped like a goose. |
| Signora Vell | 维尔夫人 | Signora = 夫人. |
| River-Blue Cloth | 河蓝布 | The colour of the river. |
| Ottilie Clay | 奥蒂莉·克莱 | Standard transliteration. |
| Clay Cup | 陶杯 | The name as in its own row + a generic word. |
| Goodman Hollis | 霍利斯大叔 | Goodman = 大叔. |
| Dozen Eggs | 一打鸡蛋 | The name as in its own row + a generic word. |
| Daisy | 黛西 | The standard rendering. |
| Marigold Posy | 金盏花束 | The flower is 金盏花. |
| Master Brie | 布里师傅 | Master (craftsman) = 师傅. |
| Wedge of Gild Blue | 一角鎏金蓝纹奶酪 | Gild Blue = 鎏金蓝纹奶酪. |
| Mother Wenna | 温娜大娘 | The innkeeper: 大娘. |
| Garr the Bargeman | 船夫加尔 | Bargeman = 船夫. |
| Sister Wynn | 薇恩修女 | Kept apart from Wenna 温娜. |
| Beck | 贝克 | Standard transliteration. |
| Tilly | 蒂莉 | Standard transliteration. |
| Corporal Dunn | 邓恩下士 | Transliteration; the title as in §1.1. |
| Fennick | 芬尼克 | Standard transliteration. |
| Old Salt Merrow | 老水手梅罗 | An "old salt": 老水手. |
| Master Odd | 奥德先生 | A clerk: 先生. |
| Alba Quern | 阿尔芭·奎恩 | Same family as Tobias Quern. |
| Rurik Hammerstane | 留里克·哈默斯坦 | Rurik = 留里克 (standard). |
| Hamish Mott | 哈米什·莫特 | Standard transliteration. |
| Mug of Gild Ale | 一杯鎏金麦酒 | Ale = 麦酒. |
| Joss Plane | 乔斯·普莱恩 | Standard transliteration. |
| Harbourmaster Ysolde | 港务长伊索德 | Kept apart from Isolde 伊索尔德. |
| Dob | 多布 | Standard transliteration. |
| Merrit | 梅里特 | Standard transliteration. |
| Gran Tessaly | 泰莎莉阿婆 | Gran = 阿婆; Grandmother = 奶奶. |
| Smoked Gild Trout | 烟熏鎏金鳟鱼 | The name as in its own row + a generic word. |
| Old Wick | 老威克 | "Old X". |
| Bramwell Bun | 布拉姆韦尔·邦 | A family name: sound. |
| Saffron Bun | 藏红花面包 | Standard transliteration. |
| Hob | 霍布 | Standard transliteration. |
| Hester | 赫丝特 | 丝 for a woman's name. |
| Dame Agnes | 阿格尼丝老师 | She keeps the school: 老师. |
| Brother Tuck | 塔克修士 | Friar Tuck's standard 塔克修士. |
| Ned the Porter | 搬运工内德 | Transliteration; the title as in §1.1. |
| Ada | 艾达 | Also Sister Ada. |
| Milla | 蜜拉 | Kept apart from Mira 米拉. |
| Tam the Piper | 吹笛人塔姆 | Transliteration; the title as in §1.1. |
| Gwen the Bargewife | 船娘格温 | 船娘: a boatwoman. |
| Lady Odelia Fairgild | 奥德莉亚·费尔吉尔德夫人 | Lady = 夫人 after the name. |
| Guardsman Pell | 卫兵佩尔 | Guardsman = 卫兵. |
| Mother Celandine | 塞兰丁院长 | The Abbess: 院长. |
| Novice Cass | 见习生卡斯 | Transliteration; the title as in §1.1. |
| Elric the Pilgrim | 朝圣者埃尔里克 | Transliteration; the title as in §1.1. |
| Brother Anselm | 安瑟伦修士 | Anselm = 安瑟伦 (standard). |
| Guildmaster Orrin | 行会会长奥林 | Guild = 行会. |
| Captain Hale | 黑尔队长 | Same name as Corporal Hale. |
| Sorrel | 索雷尔 | Standard transliteration. |
| Lady Amabel Thornbury | 阿玛贝尔·索恩伯里夫人 | Standard transliteration. |
| Hazel | 黑兹尔 | The standard rendering. |
| The Lookout | 瞭望台 | Also {Lookout} in lines. |
| High Town | 上城 | The upper town. |
| Sunspire Abbey | 日塔修道院 | Sunspire = 日塔. |
| The bell rings the fair closed at dusk | 黄昏钟声宣告集市落幕 | Banner. |
| Gildhaven Hall | 鎏金港市政厅 | The town hall. |
| Scholars' Row | 学者街 | Row/Street = 街, Lane = 巷. |
| The Watch | 卫兵所 | The watch house. |
| Pippin Orchard | 皮平果园 | Pippin = 皮平 (as in The Lord of the Rings). |
| Crown Walk | 王冠步道 | Meaningful rendering. |
| The Rampart Walk | 城墙步道 | Meaningful rendering. |
| The whole town below | 全城尽收眼底 | Banner. |
| The Abbey, the Hall and the Rampart Walk | 修道院、市政厅与城墙步道 | Banner: the three names. |
| The Grand Stair | 大石阶 | Meaningful rendering. |
| The Harbour Stair | 港口石阶 | Meaningful rendering. |
| The Gildfall | 鎏金瀑布 | The falls of the River Gild. |
| Where the Gild leaves High Town | 鎏金河流出上城之处 | The Gild = 鎏金河. |
| Kingsbridge | 王桥 | One of three bridges: 盐桥, 王桥, 雾桥. |
| North Quay | 北码头 | Quay = 码头. |
| The Undercliff | 崖下区 | Meaningful rendering. |
| West Quarter | 西区 | Meaningful rendering. |
| The West Quarter | 西区 | The same place. |
| Market Square | 市场广场 | Meaningful rendering. |
| Gild Fair · Stalls, crier and the Gild Well | 鎏金集市 · 摊位、公告员与鎏金井 | Banner. |
| Barge Quay | 驳船码头 | Meaningful rendering. |
| East Quarter | 东区 | Meaningful rendering. |
| The Gild Pool | 鎏金潭 | Pool = 潭. |
| Gildhaven Harbour | 鎏金港码头 | 码头, since 港 is already in the name. |
| Piers, gulls and the smokehouse | 栈桥、海鸥与熏鱼坊 | Banner. |
| Market Street | 市场街 | Meaningful rendering. |
| Bellgreen | 钟声草坪 | A green = 草坪. |
| Lantern Row | 灯笼巷 | The name as in its own row + a generic word. |
| Weaver's Lane | 织工巷 | Meaningful rendering. |
| The South Gate | 南门 | Meaningful rendering. |
| The Allotments | 市民菜园 | Meaningful rendering. |
| The Fairground | 集市会场 | Meaningful rendering. |
| Fairfield | 集原 | 集 fair + 原 field. |
| The Wandering Lark Players · Today only | 流浪云雀剧团 · 仅限今日 | Troupe names are meaningful: 剧团. |
| Fairfield Mill | 集原磨坊 | The name as in its own row + a generic word. |
| Barlow's Farm | 巴洛农场 | The name as in its own row + a generic word. |
| Outside the South Gate · Fair day | 南门外 · 集市日 | Banner. |

### 4.11 Starfall Vale

Where: `levels/starfall-vale`.

| English | 中文 | Why |
|---|---|---|
| Mayor Aldous Bramblecote | 奥尔德斯·布兰布尔科特镇长 | Mayor = 镇长 (Gildhaven's Lord Mayor is 市长). |
| Marigold Fenn | 玛丽戈尔德·芬 | Fenn 芬; Finn is 芬恩. |
| Barnaby Crumb | 巴纳比·克拉姆 | Standard transliteration. |
| Starlight Bun | 星光面包 | The name as in its own row + a generic word. |
| Garrick Ironwell | 加里克·艾恩维尔 | Standard transliteration. |
| Quentin Fairweather | 昆廷·费尔韦瑟 | Standard transliteration. |
| Paper Lantern | 纸灯笼 | Meaningful rendering. |
| Old Nell | 内尔婆婆 | Grannies are X婆婆. |
| Moonpetal Tea | 月瓣茶 | An invented flower: meaningful. |
| Tamsin Bloom | 塔姆辛·布鲁姆 | Standard transliteration. |
| Starbloom Garland | 星花花环 | Starbloom = 星花. |
| Sergeant Hobb Vane | 霍布·韦恩中士 | Transliteration; the title as in §1.1. |
| Sister Amarantha | 阿玛兰莎修女 | Standard transliteration. |
| Poppy | 波比 | Standard transliteration. |
| Hollis Barleycorn | 霍利斯·巴利科恩 | John Barleycorn 巴利科恩. |
| Wendel the Miller | 磨坊主温德尔 | Transliteration; the title as in §1.1. |
| Tansy | 坦西 | Standard transliteration. |
| Master Casimir Vey | 卡西米尔·维大师 | The Stargazer: 大师. |
| Rowan the Wayfarer | 漫游者罗文 | Transliteration; the title as in §1.1. |
| Old Gorse | 老戈斯 | Transliteration; the title as in §1.1. |
| Dunstan Flint | 邓斯坦·弗林特 | Standard transliteration. |
| Professor Ptolemy Marrow | 托勒密·马罗教授 | Ptolemy = 托勒密. |
| Grandmother Isolde | 伊索尔德奶奶 | Transliteration; the title as in §1.1. |
| Marlow Tench | 马洛·坦奇 | Standard transliteration. |
| Wick Reed | 威克·里德 | Standard transliteration. |
| Finn Ashdown | 芬恩·阿什当 | Standard transliteration. |
| Warden Ivo | 守卫伊沃 | Warden = 守卫 (UI mockup). |
| Lark Silverstring | 拉克·银弦 | A stage name: 银弦 "silver string". |
| Signor Orsino | 奥西诺先生 | Orsino as in Twelfth Night. |
| Festival Ribbon | 节庆丝带 | The name as in its own row + a generic word. |
| Ansel Birchwood | 安塞尔·伯奇伍德 | Standard transliteration. |
| Kestrel | 凯斯特雷尔 | Standard transliteration. |
| Old Thistle | 老西斯尔 | The hermit. |
| The Lumen Observatory | 流明天文台 | Lumen = 流明, the established word. |
| Mount Lumen | 流明山 | The name as in its own row + a generic word. |
| Home of the Stargazer | 观星者之居 | Stargazer = 观星者. |
| Lumen Lookout | 流明瞭望台 | The name as in its own row + a generic word. |
| Silverspring | 银泉 | Meaningful rendering. |
| The Plateau | 高原 | Meaningful rendering. |
| The roof of the vale | 山谷之巅 | Banner. |
| Stargazer's Steps | 观星者石阶 | Meaningful rendering. |
| The Three Sisters | 三姐妹 | Three falls. |
| Three falls, one river | 三道瀑布，一条河 | Banner. |
| The High Terrace | 高台地 | Terrace = 台地. |
| The Foothills | 山麓 | Meaningful rendering. |
| Mirror Falls | 镜瀑 | Meaningful rendering. |
| Amberpine Heights | 琥珀松高地 | Meaningful rendering. |
| Above Mirrormere | 镜湖之上 | Meaningful rendering. |
| Pines above the mirror | 镜湖上的松林 | Banner. |
| The North Shore | 北岸 | Meaningful rendering. |
| Lake Mirrormere | 镜湖 | "Mirrormere" alone is 镜湖 too. |
| Old Lumen | 流明旧城 | The ruined first town. |
| Ruins of the first town | 最早城镇的遗迹 | Banner. |
| Where the first stones were cut | 第一块石头开凿之处 | Banner. |
| Goldenfield Farms | 金田农庄 | Meaningful rendering. |
| Barleycorn Farm | 巴利科恩农场 | Named for Hollis Barleycorn. |
| Goldenfield Orchard | 金田果园 | Meaningful rendering. |
| Barley, windmills and wishes | 大麦、风车与心愿 | Banner. |
| Hearthwick Square | 炉火镇广场 | The name as in its own row + a generic word. |
| Hearthwick | 炉火镇 | Hearth = 炉火; -wick (a village) = 镇. |
| Chapel Row | 礼拜堂街 | Meaningful rendering. |
| Southgate | 南门区 | A district. |
| The Market Town | 集镇 | Meaningful rendering. |
| The market town of the vale | 山谷里的集镇 | Banner. |
| Mirrormere Landing | 镜湖码头 | Meaningful rendering. |
| Fresh fish, old stories | 鲜鱼与老故事 | Banner. |
| Reedmouth | 芦苇河口 | Meaningful rendering. |
| The South Beach | 南滩 | Meaningful rendering. |
| Bramble Hollow | 荆棘洼地 | Meaningful rendering. |
| The Meadowlands | 草甸 | Meaningful rendering. |
| Where the stars sleep | 星辰沉睡之处 | Banner. |
| The Troupe Camp | 剧团营地 | Meaningful rendering. |
| The Wandering Lanterns | 流浪灯火剧团 | The troupe; {Wandering Lanterns} in lines is 流浪灯火. |
| Flowers as far as the lantern-light | 灯火所及，尽是繁花 | Banner. |
| The Hidden Glade | 隐秘林地 | Glade = 林地. |
| Emberwood | 烬木林 | 烬 as in every ember name. |
| Where the first star is remembered | 初星铭记之处 | Banner. |
| Woodcutter's Camp | 樵夫营地 | Meaningful rendering. |
| The forest that remembers autumn | 记得秋天的森林 | Banner. |

### 4.12 Names that appear only inside lines

Where: every table: write these inside sentences and {gold} spans. Not terms: write them inside lines.

| English | 中文 | Why |
|---|---|---|
| the Cinderwatch (the order) | 烬望 | "of the Cinderwatch" = 烬望的…. |
| Warden of the Cinderwatch | 烬望守卫 | Sela's title (UI mockup). |
| Scout of the Cinderwatch | 烬望斥候 | Rook's title, built like Sela's. |
| Keeper of the Waystones | 路标石守护者 | Sister Ilse's title; waystone = 路标石. |
| the quarry lip | 采石场边缘 | Cinderwatch. |
| Duchess (Pip's hen) | 公爵夫人 | Keep the joke. |
| Duchess Feathers (Tansy's hen) | 羽毛公爵夫人 | As Duchess. |
| Emberfall Evening (Wren's song) | 《烬落之暮》 | Song titles in 《》. |
| Ember ale | 烬火麦酒 | The inn's ale. |
| Brightwater Inn | 明水旅店 | Inns: 旅店. |
| Old Bridge | 老桥 | Meaningful rendering. |
| Rosehip Cottage | 蔷薇果小屋 | The name as in its own row + a generic word. |
| the River Gild / the Gild | 鎏金河 | The name as in its own row + a generic word. |
| Gild Fair (fair day) | 鎏金集市（集市日） | The name as in its own row + a generic word. |
| Gild Well | 鎏金井 | The name as in its own row + a generic word. |
| Gild Ale / Gild Blue | 鎏金麦酒／鎏金蓝纹奶酪 | The name as in its own row + a generic word. |
| Sun Well | 太阳井 | Meaningful rendering. |
| Sunspire Bell | 日塔之钟 | The name as in its own row + a generic word. |
| Saltbridge · Mistbridge · Hall Bridge | 盐桥 · 雾桥 · 市政厅桥 | The name as in its own row + a generic word. |
| King's Road | 王之大道 | Meaningful rendering. |
| Main Street · Mill Lane | 大街 · 磨坊巷 | The name as in its own row + a generic word. |
| the Fish Quay · the Piers · the Boathouse | 鱼码头 · 栈桥 · 船屋 | The name as in its own row + a generic word. |
| East Pier · West Pier | 东栈桥 · 西栈桥 | The name as in its own row + a generic word. |
| the Barrelhouse | 酒桶屋 | Meaningful rendering. |
| The Gilded Goose | 金鹅旅店 | The name as in its own row + a generic word. |
| Watch House | 卫兵所 | Transliteration; the title as in §1.1. |
| Saffron Bakery | 藏红花面包房 | The name as in its own row + a generic word. |
| Shrine of the Tide | 潮汐神龛 | Meaningful rendering. |
| the Gilt Library | 镀金书库 | Gilt (镀金) is not Gild (鎏金). |
| the Guild Exchange | 行会交易所 | Guild = 行会. |
| the Lord Mayor | 市长大人 | Meaningful rendering. |
| the Abbess | 修道院长 | Transliteration; the title as in §1.1. |
| the Wandering Lark Players | 流浪云雀剧团 | Transliteration; the title as in §1.1. |
| Starfall (the night, the festival) | 星落（星落之夜） | "Every Starfall" = 每逢星落. |
| Starfall Festival | 星落节 | Meaningful rendering. |
| the Stargazer | 观星者 | Meaningful rendering. |
| the Observatory | 天文台 | Meaningful rendering. |
| Starlight Inn | 星光旅店 | Meaningful rendering. |
| the Star Register | 星辰名录 | Meaningful rendering. |
| Chapel of the Fallen Stars | 陨星礼拜堂 | Meaningful rendering. |
| the Lantern of Lyra | 天琴座之灯 | Lyra = 天琴座. |
| Star-glass | 星晶 | Meaningful rendering. |
| the Silverrun (the vale's river) | 银流河 | Meaningful rendering. |
| the Long Pier | 长栈桥 | Meaningful rendering. |
| the Star Dance | 星之舞 | Meaningful rendering. |
| the Star Cairn | 星石堆 | Meaningful rendering. |
| The Heron Spit | 鹭鸶沙嘴 | Meaningful rendering. |
| The Wishing Oak | 许愿橡树 | Meaningful rendering. |
| the East Road (Starfall) | 东大路 | Meaningful rendering. |
| the hermit | 隐士 | Meaningful rendering. |
| the ferry bell | 渡口的钟 | Meaningful rendering. |
| the elder | 长老 | Transliteration; the title as in §1.1. |
| traveller / traveler | 旅人 | Both English spellings. |

### 4.13 Recurring terms the content shares with the UI

Where: lines, banners and the combat/party UI (`src/game/*/strings.js`). Not terms: write them inside lines.

| English | 中文 | Why |
|---|---|---|
| Warden · Ranger · Mystic | 守卫 · 游侠 · 秘术师 | The UI mockup's classes. |
| Healing Draught | 治疗药水 | UI mockup; "draughts" in lines too. |
| Whetstone · Ironbark Tonic · Warding Charm | 磨刀石 · 铁木补剂 · 守护护符 | The shop wares. |
| Whirl Slash · Ember Bolt · Radiant Nova · Mend | 旋风斩 · 烬火弹 · 光辉新星 · 治愈术 | UI mockup. |
| slime · goblin · archer · shaman · bat · boar | 史莱姆 · 哥布林 · 弓手 · 萨满 · 蝙蝠 · 野猪 | Monster words in lines and banners. |
| Moss Slime · Bramble Goblin · Thorn Archer · Hex Shaman · Cinder Bat · Ironhide Boar · Straw Dummy | 苔藓史莱姆 · 荆棘哥布林 · 棘刺弓手 · 咒术萨满 · 烬火蝙蝠 · 铁皮野猪 · 稻草假人 | Built from the place words (荆棘, 烬火, 铁皮). |
| The Last Fire of the Pass | 隘口最后之火 | UI mockup. |
| Tactics · Presets · Rules · Party | 战术 · 预设 · 规则 · 队伍 | UI mockup. |
| Golden Hour · Dusk | 夕照 · 黄昏 | UI mockup. |
| HP · MP · SP · XP · Lv · G | HP · MP · SP · XP · Lv · G | Latin, as in Chinese RPGs. |

## 5. Changing the glossary

- **A new name** (a new villager, region, item or level): decide both languages with the rules of
  §1.1 and add its row to §3 and §4. Then translate it as a term in each table that shows it:
  `node tools/i18n-worklist.mjs --lang=ja` lists it among the `terms` of the table it lives in
  (I18N.md §4.1: the level's or campaign's own table; `common` only for a shipped level's name and
  the common terms). Fill it in, merge (`--merge=<file>`, I18N.md §4.7), and run
  `npm run i18n:check`. A merge skips a name that lives in another table than the worklist's.
- **A changed rendering:** change it here and in every table whose `terms` hold the name, in both
  languages at once (the checker warns that the name is "translated differently" until they agree).
  Then search the tables' units for the old rendering. The checker compares a gold `{Name}` span
  with the name's term, but not a name in running text.
- **A changed English name** (a villager renamed in the data) is a new term: the worklist lists the
  new name, and `--prune` drops the old one once nothing shows it. Scripts that match the villager
  by name change with it.
- **A name the UI also shows** (a signpost's speaker, a waystone, a foe): the feature's
  `strings.js` and the terms must agree; `npm run i18n:check` lists the names that differ (its
  *UI glossary* lines, I18N.md §3).
- **A code default or a prompt verb** (Villager for a blank name, Enter, The End): change the UI
  string in its string table (`src/engine/i18n/strings/game.js`, `src/game/*/strings.js`), not a
  content table.
- Never give one name two renderings in two tables: each table's levels would show its own.

## 6. UI vocabulary (both languages)

The UI's own words, settled in the review of the pixel UI (phase 3) so the HUD, the maps, the
journal and the combat UI say the same thing everywhere. They live in the UI string tables
(`src/engine/i18n/strings/*.js`, `src/game/*/strings.js`; I18N.md §2), not in the content tables;
where the content shows the same name (a signpost's speaker, a waystone), the content's term must
agree, and `npm run i18n:check` compares them (its *UI glossary* lines). The code defaults for
blank data and the prompt's verbs are UI strings too (`game.default.*`, `game.prompt.*`, §1).

| English | 日本語 | 中文 | Where / why |
|---|---|---|---|
| Journal | 日誌 | 日志 | The journal's heading and the legend's row (not ジャーナル). |
| Quests · Items | クエスト・アイテム | 任务 · 物品 | The journal's tabs. |
| Time of day · Weather · Photo mode · Music | 時間帯・天気・フォトモード・音楽 | 时段 · 天气 · 拍照模式 · 音乐 | The controls legend, peaceful and combat alike (the combat legend's *Time / Weather / Photo / Music* row joins the same words with ／). |
| Zoom (or wheel) | ズーム（ホイールも可） | 缩放（或滚轮） | The legend. |
| Talk / Examine | 話す／調べる | 交谈／查看 | The game's legend row (*Talk / Confirm*, the HUD's default: 話す／決定, 交谈／确认). |
| Signpost | 立て札 | 指示牌 | A sign's speaker (the code default `game.default.signpost`, and the common term for a data speaker `Signpost`) and the world map's *Sign · door · well* row (立て札・扉・井戸, 指示牌 · 门 · 水井). |
| Campfire | 焚き火 | 篝火 | The world map's legend. |
| Villager · Waystone · Companion | 村人・道標石・仲間 | 村民 · 路标石 · 同伴 | The world map's legend; Villager and Waystone also the code defaults (`game.default.villager`, `game.default.waystone`) and common terms. |
| You are in | 現在のエリア | 当前区域 | The world map, over the region's name. |
| +{n} gold (loot) | +{n}G | +{n} G | The loot feed: the currency is the Latin G in both (Chinese with a space). |
| Press any key | 何かキーを押してください | 按任意键开始 | The title (`title.pressAnyKey`, and the default prompt `game.default.prompt`). |
| Guard | ガード | 格挡 | A blocked hit's floating word (`worldfx`). |
| Perfect! | ジャスト回避！ | 完美闪避！ | A perfect dodge's floating word (`worldfx`). |
| Golden Hour · Dusk | 夕映え・黄昏 | 夕照 · 黄昏 | The clock's phases (the full set: 夜・夜明け・朝・真昼・昼下がり・夕映え・黄昏 / 夜晚 · 黎明 · 清晨 · 正午 · 午后 · 夕照 · 黄昏). |
| Warden of the Cinderwatch | シンダーウォッチの衛士 | 烬望守卫 | Sela's title on the name plate (a data `title`, the UI mockup's plate; `levels/cinderwatch-pass`). |
| Scout of the Cinderwatch · Keeper of the Waystones | シンダーウォッチの斥候・道標石の守り手 | 烬望斥候 · 路标石守护者 | Rook's and Sister Ilse's titles on the name plate (data `title`s, `levels/cinderwatch-pass`). |
| Tactics · Presets · Rules · Party | 作戦・方針・指示・パーティ | 战术 · 预设 · 规则 · 队伍 | The tactics panel (§3.13, §4.13). |
| HP · MP · SP · XP · Lv · G, key names, numbers | Latin | Latin | Never translated (I18N.md §2). |
| Luminati (the engine) · 2.5D · three.js | Latin | Latin | The engine's name is never transliterated; credits and the page title keep it Latin. |
| 2.5D pixel-art engine (credits, the page title) | 2.5D ピクセルアートエンジン | 2.5D 像素艺术引擎 | `game.default.credit`, `game.page.title` (`{name} — Luminati 2.5D Pixel-Art Engine`), the title's credit; the demo subtitle adds デモ / 演示. |
