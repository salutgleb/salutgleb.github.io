// Russian typesetting for text set from scripts (the HTML uses &nbsp; by hand).

const SHORT_WORD = /(^|[\s ])([\p{L}]{1,2}) /gu;

/**
 * Bind one- and two-letter words (о, в, и, со, на…) to the next word with a no-break space, so
 * they never end a line. Two passes catch runs like «и в».
 * @param {string} text
 * @returns {string}
 */
export const tieShortWords = (text) => text.replace(SHORT_WORD, '$1$2 ').replace(SHORT_WORD, '$1$2 ');
