import { defaultUrlTransform } from 'react-markdown';

/** Keep virtual file references relative; all other schemes use Markdown's safety filter. */
export function transformMarkdownUrl(url: string, key: string): string {
  if (key === 'href' && /^sandbox:\/(?!\/)/i.test(url)) {
    return defaultUrlTransform(url.replace(/^sandbox:/i, ''));
  }
  return defaultUrlTransform(url);
}
