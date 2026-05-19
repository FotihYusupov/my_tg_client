import React, { useState, useCallback } from 'react';
import { X, Search, Check, RefreshCw, Filter, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { ingestionService } from '../../../services/ingestionService';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSync: (selectedChatIds: string[], startDate?: string, endDate?: string) => Promise<void>;
}

interface Chat {
  id: string;
  title: string;
  type: string;
  isMonitored: boolean;
  category: string;
}

const ChatChecklistSkeleton = () => (
  <div className="flex items-center justify-between p-4 bg-white/5 border border-transparent rounded-2xl animate-pulse">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-slate-800" />
      <div className="space-y-2">
        <div className="h-3.5 bg-slate-800 rounded w-32" />
        <div className="h-2 bg-slate-800 rounded w-16" />
      </div>
    </div>
    <div className="w-5.5 h-5.5 rounded-lg bg-slate-850" />
  </div>
);

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  onStartSync,
}) => {
  const [chatSearch, setChatSearch] = useState('');
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Decoupled pagination fetcher
  const fetchChatsData = useCallback(async (page: number, limit: number, signal?: AbortSignal) => {
    if (!isOpen) return { items: [], hasMore: false };
    const res = await ingestionService.getChats(false, page, limit, signal);
    return {
      items: res.items,
      hasMore: res.hasMore,
      total: res.total
    };
  }, [isOpen]);

  const {
    items: chats,
    isLoading,
    isLoadingMore,
    isError,
    hasMore,
    refresh,
    observerTargetRef,
  } = useInfiniteScroll<Chat>({
    fetchData: fetchChatsData,
    limit: 15,
    dependencies: [isOpen] // Refetches from page 1 whenever the modal opens
  });

  const toggleChatSelection = (id: string) => {
    const newSelection = new Set(selectedChatIds);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    setSelectedChatIds(newSelection);
  };

  const handleConfirm = async () => {
    if (selectedChatIds.size === 0) return;
    setSubmitting(true);
    try {
      await onStartSync(
        Array.from(selectedChatIds),
        startDate ? new Date(startDate).toISOString() : undefined,
        endDate ? new Date(endDate).toISOString() : undefined
      );
      // Reset
      setSelectedChatIds(new Set());
      setStartDate('');
      setEndDate('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const filteredChats = chats.filter(c => 
    c.title.toLowerCase().includes(chatSearch.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Select Chats to Sync</h2>
                <p className="text-xs text-slate-400">Choose which conversations to import into your brain</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inputs */}
            <div className="p-4 border-b border-white/10 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-950/20 p-3 rounded-2xl border border-white/5">
                <div>
                  <label className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Start Date (Optional)</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
            </div>

            {isError && (
              <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/35 rounded-xl flex items-center gap-2 text-[11px] text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Failed to load chats checklist.</span>
                <button onClick={refresh} className="ml-auto font-bold underline">Retry</button>
              </div>
            )}

            {/* Checklist items container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {isLoading && chats.length === 0 ? (
                Array.from({ length: 6 }).map((_, idx) => <ChatChecklistSkeleton key={idx} />)
              ) : filteredChats.length > 0 ? (
                <>
                  {filteredChats.map(chat => (
                    <div 
                      key={chat.id}
                      onClick={() => toggleChatSelection(chat.id)}
                      className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border ${
                        selectedChatIds.has(chat.id) 
                          ? 'bg-primary/10 border-primary/45 shadow-sm shadow-primary/5' 
                          : 'bg-white/5 border-transparent hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          chat.type === 'private' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {chat.title[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-200">{chat.title}</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <Filter className="w-3 h-3 text-slate-600" />
                            {chat.type}
                          </div>
                        </div>
                      </div>
                      <div className={`w-5.5 h-5.5 rounded-lg border flex items-center justify-center transition-all ${
                        selectedChatIds.has(chat.id) ? 'bg-primary border-primary' : 'border-white/20'
                      }`}>
                        {selectedChatIds.has(chat.id) && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                  ))}

                  {/* Infinite Scroll trigger element */}
                  {hasMore && (
                    <div ref={observerTargetRef} className="flex justify-center py-6">
                      <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                    </div>
                  )}

                  {isLoadingMore && chats.length > 0 && (
                    Array.from({ length: 2 }).map((_, idx) => <ChatChecklistSkeleton key={`checklist-more-${idx}`} />)
                  )}
                </>
              ) : !isLoading && (
                <div className="text-center py-16 text-slate-500 text-sm">
                  No chats found matching your search.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 bg-white/5 flex justify-between items-center">
              <div className="text-xs text-slate-400">
                <span className="font-bold text-primary">{selectedChatIds.size}</span> chats selected
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl hover:bg-white/10 transition-all text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirm}
                  disabled={selectedChatIds.size === 0 || submitting}
                  className="px-7 py-2 bg-primary hover:bg-blue-600 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-lg hover:shadow-primary/20 active:scale-95 text-white"
                >
                  {submitting ? 'Starting...' : 'Start Sync'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
