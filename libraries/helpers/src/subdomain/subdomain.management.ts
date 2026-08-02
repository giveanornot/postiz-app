import { parse } from 'tldts';

/**
 * Application cookies must stay on the application hostname. Sharing them with
 * every sibling subdomain makes unrelated requests carry authentication and
 * analytics state.
 */
export function getCookieUrlFromDomain(_domain: string): undefined {
  return undefined;
}

/**
 * Compatibility helper for removing cookies that older releases scoped to the
 * registrable domain.
 */
export function getLegacyCookieUrlFromDomain(domain: string) {
  const url = parse(domain);
  return url.domain! ? '.' + url.domain! : url.hostname!;
}
