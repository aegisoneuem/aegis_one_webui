import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SortState } from '@aegis/ui';
import { ApiError, api, type Page } from '../api/client';

/**
 * Filters, sort, search and paging for a list page.
 *
 * All of it lives in the URL rather than in component state, so a filtered
 * list is a link someone can paste into a ticket and get the same rows. Saved
 * views deliberately hold layout only, for the same reason.
 */

const RESERVED = new Set(['q', 'sort', 'order', 'cursor', 'tab']);

export interface ListController<T> {
  rows: T[];
  total: number;
  loading: boolean;
  error: { message: string; detail?: string; onRetry: () => void } | null;

  search: string;
  setSearch: (value: string) => void;

  sort: SortState | null;
  setSort: (sort: SortState | null) => void;

  filters: Record<string, string>;
  setFilter: (key: string, value: string | string[] | undefined) => void;
  clearFilters: () => void;
  activeFilterCount: number;

  pageSize: number;
  setPageSize: (size: number) => void;
  /** 1-based index of the first row on this page. */
  from: number;
  to: number;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
}

export interface ListControllerOptions {
  /** API path, e.g. `/devices`. */
  path: string;
  /** Columns requested with `?fields=`; omit to take them all. */
  fields?: readonly string[];
  defaultSort?: SortState;
  defaultPageSize?: number;
  /** Filters the page applies itself, not driven by the URL. */
  fixedFilters?: Record<string, string>;
  enabled?: boolean;
}

export function useListController<T>({
  path,
  fields,
  defaultSort,
  defaultPageSize = 50,
  fixedFilters,
  enabled = true,
}: ListControllerOptions): ListController<T> {
  const [params, setParams] = useSearchParams();
  // Cursors are a stack rather than a page number: the API hands back an
  // opaque cursor, so going back means remembering where you came from.
  const [cursors, setCursors] = useState<string[]>([]);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const search = params.get('q') ?? '';
  const sortField = params.get('sort') ?? defaultSort?.id;
  const sortDesc = params.get('order')
    ? params.get('order') === 'desc'
    : (defaultSort?.desc ?? false);
  const sort: SortState | null = sortField ? { id: sortField, desc: sortDesc } : null;

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    params.forEach((value, key) => {
      if (!RESERVED.has(key) && value) out[key] = value;
    });
    return out;
  }, [params]);

  const cursor = cursors[cursors.length - 1];

  const query = useQuery({
    queryKey: [path, { search, sort, filters, fixedFilters, cursor, pageSize, fields }],
    enabled,
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing a 50,000-row table to a skeleton on every sort change.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<Page<T>>(
        path,
        {
          ...fixedFilters,
          ...filters,
          ...(search ? { q: search } : {}),
          ...(sort ? { sort: sort.id, order: sort.desc ? 'desc' : 'asc' } : {}),
          ...(cursor ? { cursor } : {}),
          ...(fields ? { fields: fields.join(',') } : {}),
          limit: pageSize,
        },
        signal,
      ),
  });

  /** Any change to the result set has to start from page one. */
  const resetPaging = useCallback(() => setCursors([]), []);

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      mutate(next);
      setParams(next, { replace: true });
      resetPaging();
    },
    [params, setParams, resetPaging],
  );

  const setSearch = useCallback(
    (value: string) =>
      update((next) => {
        if (value) next.set('q', value);
        else next.delete('q');
      }),
    [update],
  );

  const setSort = useCallback(
    (nextSort: SortState | null) =>
      update((next) => {
        if (!nextSort) {
          next.delete('sort');
          next.delete('order');
        } else {
          next.set('sort', nextSort.id);
          next.set('order', nextSort.desc ? 'desc' : 'asc');
        }
      }),
    [update],
  );

  const setFilter = useCallback(
    (key: string, value: string | string[] | undefined) =>
      update((next) => {
        const resolved = Array.isArray(value) ? value.join(',') : value;
        if (resolved) next.set(key, resolved);
        else next.delete(key);
      }),
    [update],
  );

  const clearFilters = useCallback(
    () =>
      update((next) => {
        for (const key of [...next.keys()]) if (!RESERVED.has(key)) next.delete(key);
        next.delete('q');
      }),
    [update],
  );

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCursors([]);
  }, []);

  const data = query.data;
  const rows = data?.items ?? [];
  const total = data?.page.total ?? 0;
  const from = rows.length === 0 ? 0 : cursors.length * pageSize + 1;

  return {
    rows,
    total,
    loading: query.isLoading,
    error: query.error
      ? {
          message:
            query.error instanceof Error ? query.error.message : 'The request did not complete.',
          ...(query.error instanceof ApiError
            ? { detail: `Request ${query.error.requestId}` }
            : {}),
          onRetry: () => void query.refetch(),
        }
      : null,

    search,
    setSearch,
    sort,
    setSort,
    filters,
    setFilter,
    clearFilters,
    activeFilterCount: Object.keys(filters).length + (search ? 1 : 0),

    pageSize,
    setPageSize,
    from,
    to: from === 0 ? 0 : from + rows.length - 1,
    hasNext: Boolean(data?.page.nextCursor),
    hasPrevious: cursors.length > 0,
    next: () => {
      const nextCursor = data?.page.nextCursor;
      if (nextCursor) setCursors((stack) => [...stack, nextCursor]);
    },
    previous: () => setCursors((stack) => stack.slice(0, -1)),
  };
}

/** Single-object fetch, used by every detail page and drawer. */
export function useResource<T>(path: string, enabled = true) {
  return useQuery({
    queryKey: [path],
    enabled,
    queryFn: ({ signal }) => api.get<T>(path, undefined, signal),
  });
}
