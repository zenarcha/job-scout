// Turn raw JD HTML/Markdown into clean plain text (preserving the raw for later reparse).
import * as cheerio from 'cheerio';

export function cleanJd(raw: string | undefined | null): string {
  if (!raw) return '';
  // If it looks like HTML, strip tags; otherwise treat as text.
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  if (!looksHtml) return raw.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

  const $ = cheerio.load(raw);
  $('script, style, noscript').remove();
  // Convert <br> and block boundaries to newlines for readability.
  $('br').replaceWith('\n');
  $('li').each((_, el) => {
    $(el).prepend('• ');
  });
  const text = $('body').length ? $('body').text() : $.root().text();
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
