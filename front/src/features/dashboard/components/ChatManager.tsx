import React, { useState, useCallback } from 'react';
import { Search, RefreshCw, AlertCircle } from 'lucide-react';
import { CategoryPicker } from './CategoryPicker';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { ingestionService } from '../../../services/ingestionService';
import toast from 'react-hot-toast';

interface Chat {
  id: string;
  title: string;
  type: string;
  isMonitored: boolean;
  category: string;
}

interface ChatManagerProps {
  onUpdateChatSetting: (chatId: string, category: string, isMonitored: boolean) => Promise<void>;
}

const ChatSkeleton = () => (
  <div className="p-4 bg-slate-900/20 rounded-2xl border border-white/5 space-y-4 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-slate-800" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-slate-800 rounded w-3/4" />
        <div className="h-2 bg-slate-800 rounded w-1/4" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="h-7 bg-slate-800 rounded-lg" />
      <div className="h-7 bg-slate-800 rounded-lg" />
    </div>
  </div>
);

export const ChatManager: React.FC<ChatManagerProps> = ({
  onUpdateChatSetting,
}) => {
  const [chatSearch, setChatSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Define fetcher mapped to backend paginated API
  const fetchChatsData = useCallback(async (page: number, limit: number, signal?: AbortSignal) => {
    const res = await ingestionService.getChats(false, page, limit, signal);
    return {
      items: res.items,
      hasMore: res.hasMore,
      total: res.total
    };
  }, []);

  const {
    items: chats,
    setItems: setChats,
    isLoading,
    isLoadingMore,
    isError,
    hasMore,
    refresh,
    observerTargetRef,
  } = useInfiniteScroll<Chat>({
    fetchData: fetchChatsData,
    limit: 14,
    dependencies: []
  });

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    const toastId = toast.loading('Refreshing chats from Telegram...');
    try {
      await ingestionService.getChats(true, 1, 1); // Triggers full DB ingestion sync
      toast.success('Chat list successfully refreshed', { id: toastId });
      refresh(); // Reload infinite scroll from page 1
    } catch (err) {
      toast.error('Failed to sync with Telegram api', { id: toastId });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUpdate = async (chatId: string, category: string, isMonitored: boolean) => {
    // Optimistic Update
    const previousChats = [...chats];
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, category, isMonitored } : c));
    
    try {
      await onUpdateChatSetting(chatId, category, isMonitored);
    } catch (err) {
      // Revert on failure
      setChats(previousChats);
    }
  };

  // Filter based on isolated search text
  const filtered = chats.filter(chat => 
    chat.title.toLowerCase().includes(chatSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/20 p-4 rounded-2xl border border-white/5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Search linked chats..."
            className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2 pl-9 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs text-slate-200"
          />
        </div>
        <button 
          onClick={handleForceRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          Refresh Chat List
        </button>
      </div>

      {isError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-xs text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>An error occurred loading your chats.</span>
          <button onClick={refresh} className="ml-auto font-bold underline hover:text-red-300">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {isLoading && chats.length === 0 ? (
          Array.from({ length: 6 }).map((_, idx) => <ChatSkeleton key={idx} />)
        ) : filtered.length > 0 ? (
          <>
            {filtered.map((chat) => (
              <div key={chat.id} className="p-4 bg-slate-900/30 rounded-2xl border border-white/5 space-y-4 hover:border-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    chat.type === 'private' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                  }`}>
                    {chat.title[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="font-semibold truncate text-sm text-slate-200">{chat.title}</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">{chat.type}</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <CategoryPicker 
                    value={chat.category}
                    onChange={(val) => handleUpdate(chat.id, val, chat.isMonitored)}
                  />
                  
                  <button
                    onClick={() => handleUpdate(chat.id, chat.category, !chat.isMonitored)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      chat.isMonitored 
                        ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20' 
                        : 'bg-slate-900/60 border-white/10 text-slate-400 hover:text-slate-300 hover:bg-slate-800/80'
                    }`}
                  >
                    {chat.isMonitored ? 'Auto-Saving' : 'Save Disabled'}
                  </button>
                </div>
              </div>
            ))}

            {/* Scroll Observer Target */}
            {hasMore && (
              <div ref={observerTargetRef} className="col-span-full flex justify-center py-6">
                <RefreshCw className="w-5 h-5 text-primary animate-spin" />
              </div>
            )}

            {isLoadingMore && chats.length > 0 && (
              Array.from({ length: 2 }).map((_, idx) => <ChatSkeleton key={`more-${idx}`} />)
            )}
          </>
        ) : !isLoading && (
          <div className="col-span-full text-center py-16 text-slate-500 text-sm">
            {chatSearch ? 'No chats found matching search query.' : 'No chats loaded.'}
          </div>
        )}
      </div>
    </div>
  );
};
