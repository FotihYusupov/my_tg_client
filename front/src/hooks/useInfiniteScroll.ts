import { useState, useEffect, useCallback, useRef } from 'react';

interface PaginatedResponse<T> {
  items: T[];
  hasMore: boolean;
  total?: number;
}

interface UseInfiniteScrollOptions<T> {
  fetchData: (page: number, limit: number, signal?: AbortSignal) => Promise<PaginatedResponse<T>>;
  limit?: number;
  dependencies?: any[];
}

export function useInfiniteScroll<T>({
  fetchData,
  limit = 20,
  dependencies = [],
}: UseInfiniteScrollOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isError, setIsError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef(false);
  const observerTargetRef = useRef<HTMLDivElement | null>(null);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setItems([]);
    setPage(1);
    setHasMore(true);
    setIsError(false);
    isFetchingRef.current = false;
  }, []);

  const loadData = useCallback(
    async (targetPage: number, isInitial = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setIsError(false);

      // Cancel previous pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetchData(targetPage, limit, controller.signal);
        
        setItems((prev) => {
          if (isInitial) return response.items;
          
          // Deduplicate items based on ID if available
          const combined = [...prev, ...response.items];
          const seen = new Set();
          return combined.filter((item: any) => {
            const id = item.id || item._id;
            if (!id) return true;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        });

        setHasMore(response.hasMore);
        setPage(targetPage);
      } catch (error: any) {
        if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
          console.error('Error fetching paginated data:', error);
          setIsError(true);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          isFetchingRef.current = false;
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [fetchData, limit]
  );

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading && !isLoadingMore && !isFetchingRef.current) {
      loadData(page + 1);
    }
  }, [page, hasMore, isLoading, isLoadingMore, loadData]);

  const refresh = useCallback(() => {
    reset();
    loadData(1, true);
  }, [reset, loadData]);

  // Initial load or dependency change
  useEffect(() => {
    reset();
    loadData(1, true);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [...dependencies]);

  // Setup IntersectionObserver
  useEffect(() => {
    const target = observerTargetRef.current;
    if (!target || !hasMore || isLoading || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(target);

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [observerTargetRef.current, hasMore, isLoading, isLoadingMore, loadMore]);

  return {
    items,
    setItems,
    isLoading,
    isLoadingMore,
    isError,
    page,
    hasMore,
    reset,
    refresh,
    loadMore,
    observerTargetRef,
  };
}
