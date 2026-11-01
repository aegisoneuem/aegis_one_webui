import { ALL_PAGES, type PageId } from './nav';

/**
 * Builds in-app paths from values the server supplied.
 *
 * Ids, page names and filter values in this console all arrive from the API,
 * and an id containing a slash or a backslash turns a relative path into one
 * that leaves the app. React Router 6 has a known open-redirect issue where a
 * backslash in a `to` value is treated as a scheme-relative URL
 * (GHSA for CVE-2025-68470's bypass, fixed only in v7). The stack is pinned to
 * v6, so the defence has to be here: nothing dynamic reaches a path without
 * passing through one of these.
 */

const PAGE_IDS = new Set<string>(ALL_PAGES.map((p) => p.id));

/** A single path segment, with every separator escaped. */
export function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

/** Path to a page, refusing any name that is not one of the nineteen. */
export function pagePath(page: string): string {
  return PAGE_IDS.has(page) ? (page === 'home' ? '/' : `/${page}`) : '/';
}

export const isPageId = (value: string): value is PageId => PAGE_IDS.has(value);

/** Query string from server-supplied filters, each value encoded. */
export function query(params: Record<string, string | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
