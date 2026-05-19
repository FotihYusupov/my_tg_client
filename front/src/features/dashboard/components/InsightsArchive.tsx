import React, { useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { searchService, type SearchResult } from '../../../services/searchService';
import { MemoryCard } from './MemoryCard';

const InsightSkeleton = () => (
  <div className="p-5 rounded-2xl border border-white/5 bg-slate-900/10 space-y-4 animate-pulse">
    <div className="flex justify-between items-center">
      <div className="h-4.5 bg-slate-800 rounded w-1/3" />
      <div className="h-3 bg-slate-800 rounded w-1/5" />
    </div>
    <div className="space-y-2">
      <div className="h-3.5 bg-slate-800 rounded w-full" />
      <div className="h-3.5 bg-slate-800 rounded w-4/5" />
    </div>
    <div className="pt-2 border-t border-white/5 flex justify-between">
      <div className="h-3 bg-slate-800 rounded w-1/4" />
      <div className="h-3 bg-slate-800 rounded w-12" />
    </div>
  </div>
);

export const InsightsArchive: React.FC = () => {
  // Map infinite scroll data fetcher to search service API call
  const fetchInsightsData = useCallback(async (page: number, limit: number, signal?: AbortSignal) => {
    const res = await searchService.getCategorized(page, limit, signal);
    return {
      items: res.items,
      hasMore: res.hasMore,
      total: res.total
    };
  }, []);

  const {
    items: insights,
    isLoading,
    isLoadingMore,
    isError,
    hasMore,
    refresh,
    observerTargetRef,
  } = useInfiniteScroll<SearchResult>({
    fetchData: fetchInsightsData,
    limit: 12,
    dependencies: []
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs text-slate-500 border-b border-white/5 pb-3">
        <span>Displaying recent categorized items from your history</span>
        <button 
          onClick={refresh}
          className="text-primary font-bold hover:underline flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {isError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-xs text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>An error occurred loading your AI insights.</span>
          <button onClick={refresh} className="ml-auto font-bold underline hover:text-red-300">Retry</button>
        </div>
      )}

      <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {isLoading && insights.length === 0 ? (
          Array.from({ length: 4 }).map((_, idx) => <InsightSkeleton key={idx} />)
        ) : insights.length > 0 ? (
          <>
            <AnimatePresence mode="popLayout">
              {insights.map((res, i) => (
                <MemoryCard key={res._id} result={res} index={i} />
              ))}
            </AnimatePresence>

            {/* Scroll Observer Target */}
            {hasMore && (
              <div ref={observerTargetRef} className="flex justify-center py-6">
                <RefreshCw className="w-5 h-5 text-primary animate-spin" />
              </div>
            )}

            {isLoadingMore && insights.length > 0 && (
              Array.from({ length: 2 }).map((_, idx) => <InsightSkeleton key={`insights-more-${idx}`} />)
            )}
          </>
        ) : !isLoading && (
          <div className="text-center py-16 text-slate-500 text-sm">
            No insights found yet. Sync your Telegram chats and run AI Enrichment.
          </div>
        )}
      </div>
    </div>
  );
};
