/**
 * UI strings, namespace 'levelmsg': the warnings and errors of loading a level (LevelFormat.js
 * `normalizeLevel`, LevelStorage.js), of its exits and entrances (Travel.js `travelIssues`) and of a
 * story condition that does not parse (StoryCondition.js) — what the editor's dialogs and *Check
 * for problems* show, and the game's loading screen. The English is the text these modules always
 * gave (the Node tools and tests compare it; Node never changes the language); the conditions'
 * English stays in StoryCondition.js (see `cond.*`). Registered by messages.js when one of those
 * modules loads. Import-free and Node-safe.
 *
 * Japanese falls back to the English. Script syntax, keywords, flag names and the values a file or
 * a writer gave stay as written.
 */
/** @type {import('../i18n/I18n.js').StringTable} */
const table = {
  en: {
    // LevelFormat.js normalizeLevel: thrown
    'format.notObject': 'Level data is not an object',
    'format.unknown': 'Unknown level format "{format}"',
    'format.notLevel': 'Not a Luminati level (no "format": "luminati-level" and no tiles)',
    // LevelFormat.js normalizeLevel: warnings
    'warn.newer': 'Level version {version} is newer than this engine ({engine}); some data may be ignored.',
    'warn.noTiles': 'Level has no tiles; filled with grass.',
    'warn.legendKey': 'Legend key "{key}" is not a single character; no tile can use it.',
    'warn.tileChar': 'Unknown tile char "{ch}" in row {row}; replaced with grass.',
    'warn.rowCount': 'Row count {rows} ≠ depth {depth}; padded / truncated.',
    'warn.objectType': 'Unknown object type "{type}" skipped.',
    'warn.objectTextKeys': 'Object "{id}": {n} malformed or unknown text key(s) dropped (a key is 32 hex digits of a translatable field the object holds; a key list is no longer than its field).',
    'warn.objectUpcased': 'Object "{id}": {n} text key(s) of lower-case digits written in upper case.',
    'warn.reservedId': 'Object id "{reserved}" is reserved for the player start; renamed to "{id}".',
    'warn.duplicateId': 'Duplicate object id "{was}" renamed to "{id}".',
    'warn.rootTextKeys': 'textKeys: {n} malformed or unknown text key(s) dropped (a key is 32 hex digits of a text the level holds: its subtitle or a line of environment.title).',
    'warn.rootUpcased': 'textKeys: {n} text key(s) of lower-case digits written in upper case.',
    // Travel.js travelIssues
    'travel.exitNowhere': 'Exit "{id}" leads nowhere: set "Leads to level".',
    'travel.exitNoGround': 'Exit "{id}" covers no walkable ground: the player can never step into it.',
    'travel.entranceClash': 'Entrances "{a}" and "{b}" are both called "{name}": exits find only the first.',
    'travel.entranceOutside': 'Entrance "{name}" is outside the map.',
    'travel.entranceUnwalkable': 'Entrance "{name}" stands on ground the player cannot walk on.',
    // LevelStorage.js
    'storage.apiHttp': 'Level API: HTTP {status}',
    'storage.http': 'HTTP {status}',
    'storage.deleteFailed': 'Delete failed: HTTP {status}',
    'storage.notFound': 'Level "{name}" not found',
    'storage.notFoundHttp': 'Level "{name}" not found (HTTP {status})',
    'storage.noLocal': 'No level "{slot}" in this browser\'s storage',
    // (StoryCondition.js's errors, `cond.*`, have their English there — that module imports
    // nothing — and only their translations here: messages.js words them through
    // `setConditionWording`)
  },
  zh: {
    'format.notObject': '关卡数据不是对象',
    'format.unknown': '未知的关卡格式“{format}”',
    'format.notLevel': '不是 Luminati 关卡（没有 "format": "luminati-level"，也没有图块）',
    'warn.newer': '关卡版本 {version} 比此引擎（{engine}）新，部分数据可能被忽略。',
    'warn.noTiles': '关卡没有图块，已用草地填充。',
    'warn.legendKey': '图例键“{key}”不是单个字符，任何图块都无法使用。',
    'warn.tileChar': '第 {row} 行有未知的图块字符“{ch}”，已替换为草地。',
    'warn.rowCount': '行数 {rows} ≠ 深度 {depth}，已补齐 / 截断。',
    'warn.objectType': '已跳过未知的物件类型“{type}”。',
    'warn.objectTextKeys': '物件“{id}”：已丢弃 {n} 个格式错误或未知的文本键（文本键是 32 位十六进制数字，对应物件拥有的可翻译字段；键列表不能比其字段长）。',
    'warn.objectUpcased': '物件“{id}”：{n} 个文本键的小写十六进制数字已改为大写。',
    'warn.reservedId': '物件 ID“{reserved}”保留给玩家起点，已重命名为“{id}”。',
    'warn.duplicateId': '重复的物件 ID“{was}”已重命名为“{id}”。',
    'warn.rootTextKeys': 'textKeys：已丢弃 {n} 个格式错误或未知的文本键（文本键是 32 位十六进制数字，对应关卡拥有的文本：副标题或 environment.title 中的一行）。',
    'warn.rootUpcased': 'textKeys：{n} 个文本键的小写十六进制数字已改为大写。',
    'travel.exitNowhere': '出口“{id}”不通往任何地方：请设置“通往关卡”。',
    'travel.exitNoGround': '出口“{id}”没有覆盖可行走的地面：玩家永远无法走进去。',
    'travel.entranceClash': '入口“{a}”和“{b}”都叫“{name}”：出口只会找到第一个。',
    'travel.entranceOutside': '入口“{name}”在地图之外。',
    'travel.entranceUnwalkable': '入口“{name}”位于玩家无法行走的地面上。',
    'storage.apiHttp': '关卡 API：HTTP {status}',
    'storage.http': 'HTTP {status}',
    'storage.deleteFailed': '删除失败：HTTP {status}',
    'storage.notFound': '找不到关卡“{name}”',
    'storage.notFoundHttp': '找不到关卡“{name}”（HTTP {status}）',
    'storage.noLocal': '此浏览器的存储中没有关卡“{slot}”',
    // StoryCondition.js parseRef / parseCondition (`setConditionWording`; the English is there)
    'cond.badChar': '条件中不能出现“{c}”',
    'cond.unknownKind': '未知的类别“{kind}:”（可用 {kinds}）',
    'cond.notName': '“{v}”不是有效名称',
    'cond.numberAlone': '数字（{v}）不能单独出现',
    'cond.exponent': '“{v}”是带指数的数字——数字只能写成普通小数（1000、0.5）',
    'cond.reservedFlag': '“{v}”是保留字（不能用作标记名）',
    'cond.comparedToWord': '{ref} 应与单词比较，而不是数字',
    'cond.notValue': '“{v}”不是有效的值',
    'cond.questState': '任务状态只能是 {states}——不能是“{v}”',
    'cond.eqOnly': '{ref} 只能用 = 或 != 比较',
    'cond.gameValueRight': '“{v}”是游戏值——比较的右侧请写数字、true / false 或变量名（两个游戏值不能相互比较）',
    'cond.reservedRight': '“{v}”是保留字——比较的右侧请写数字、true / false 或变量名',
    'cond.tooLong': '条件超过 {max} 个字符',
    'cond.tooDeep': '嵌套过深',
    'cond.endsEarly': '条件提前结束',
    'cond.parenMissing': '缺少“)”',
    'cond.unexpected': '意外的“{t}”',
    'cond.cannotCompare': '“{t}”不能参与比较（它始终为 {low}）',
    'cond.valueMissing': '“{op}”后缺少值',
  },
};
export default table;
