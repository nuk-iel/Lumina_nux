/**
 * The 'storymsg' strings (storyStrings.js), registered once when the script parser or the story
 * checks load: `sm('check.noScript')`. Node-safe (I18n.js and the table are import-free).
 */
import { registerStrings, t } from '../i18n/I18n.js';
import table from './storyStrings.js';
// (the condition errors a script's `if` reports: worded by messages.js)
import './messages.js';

registerStrings('storymsg', table);

/**
 * A 'storymsg' string in the current language (English in Node).
 * @param {string} key
 * @param {Record<string, any>} [vars]
 */
export const sm = (key, vars) => t(`storymsg.${key}`, vars);
