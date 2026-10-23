/**
 * The 'levelmsg' strings (strings.js), registered once when a module that words them loads:
 * `lm('travel.exitNowhere', { id })`. Also words the errors of StoryCondition.js (which imports
 * nothing) in the page's language: `setConditionWording`. Node-safe (I18n.js and the table are
 * import-free).
 */
import { registerStrings, t } from '../i18n/I18n.js';
import { setConditionWording } from './StoryCondition.js';
import table from './strings.js';

registerStrings('levelmsg', table);

/**
 * A 'levelmsg' string in the current language (English in Node).
 * @param {string} key
 * @param {Record<string, any>} [vars]
 */
export const lm = (key, vars) => t(`levelmsg.${key}`, vars);

// (a key the language does not word — `cond.*` has no English entry — comes back as the key
// itself: the condition module keeps its English then)
setConditionWording((key, vars) => {
  const k = `levelmsg.cond.${key}`;
  const s = t(k, vars);
  return s === k ? undefined : s;
});
