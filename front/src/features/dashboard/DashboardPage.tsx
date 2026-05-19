import { useState, useEffect, useRef } from 'react';
import { Brain, Sparkles, RefreshCw } from 'lucide-react';
import { searchService, type SearchResult } from '../../services/searchService';
import { ingestionService } from '../../services/ingestionService';
import { AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import toast from 'react-hot-toast';

// Subcomponents
import { SearchBar } from './components/SearchBar';
import { ChatManager } from './components/ChatManager';
import { AskAiPanel } from './components/AskAiPanel';
import { StatsOverview } from './components/StatsOverview';
import { MemoryCard } from './components/MemoryCard';
import { SyncModal } from './components/SyncModal';
import { InsightsArchive } from './components/InsightsArchive';

export const DashboardPage: React.FC = () => {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'search' | 'insights' | 'chats'>('search');
  
  // Ingestion & Polling States
  const [syncStatus, setSyncStatus] = useState({
    messageCount: 0,
    chatCount: 0,
    processedCount: 0,
    isSyncing: false
  });
  
  // Search query results
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Checklist Sync Modal toggle
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  
  // Guarding references to prevent race conditions during async polling
  const isFetchingStatusRef = useRef(false);

  useEffect(() => {
    const fetchStatus = async () => {
      if (isFetchingStatusRef.current) return;
      isFetchingStatusRef.current = true;
      try {
        const { data } = await api.get('/ingestion/status');
        setSyncStatus(data);
      } catch (error) {
        console.error('Failed to fetch status', error);
      } finally {
        isFetchingStatusRef.current = false;
      }
    };

    fetchStatus();

    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleSearchSubmit = async (query: string) => {
    setIsSearching(true);
    try {
      const data = await searchService.semanticSearch(query);
      setResults(data);
      if (data.length === 0) {
        toast('No matching memories found', { icon: '🔍' });
      } else {
        toast.success(`Found ${data.length} relevant memories`);
      }
    } catch (error) {
      toast.error('Search failed');
      console.error('Search failed', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartSync = async (chatIds: string[], startDate?: string, endDate?: string) => {
    try {
      await ingestionService.triggerSync(chatIds, startDate, endDate);
      toast.success('History sync started in background');
      
      // Update status immediately to trigger spinning animation
      setSyncStatus(prev => ({ ...prev, isSyncing: true }));
    } catch (error) {
      toast.error('Failed to start sync');
      console.error('Sync failed', error);
    }
  };

  const handleEnrichManual = async () => {
    const toastId = toast.loading('Running AI Memory Analysis...');
    try {
      await ingestionService.runAiEnrichment();
      toast.success('AI Analysis task triggered successfully', { id: toastId });
    } catch (error) {
      toast.error('Failed to start enrichment pipeline', { id: toastId });
      console.error('Enrichment failed', error);
    }
  };

  const handleUpdateChatSetting = async (chatId: string, category: string, isMonitored: boolean) => {
    try {
      await ingestionService.updateChatSettings(chatId, category, isMonitored);
    } catch (error) {
      toast.error('Failed to save settings');
      console.error('Update setting failed', error);
      throw error; // Propagate error so child components can revert optimistic updates
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] bg-radial-gradient text-slate-100 p-4 sm:p-6 md:p-8">
      {/* Premium Header */}
      <header className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-10 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-primary to-violet-600 rounded-2xl shadow-lg shadow-primary/10">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              AI Telegram Second Brain
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Cognitive Ingestion Engine
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleEnrichManual}
            disabled={syncStatus.isSyncing}
            className="px-4 py-2 bg-gradient-to-r from-accent/10 to-violet-600/10 hover:from-accent/20 hover:to-violet-600/20 border border-accent/25 rounded-xl hover:border-accent/40 transition-all duration-300 disabled:opacity-50 flex items-center gap-2 text-xs font-bold text-slate-200"
            title="Manual AI Analysis"
          >
            <Sparkles className="w-4 h-4 text-accent animate-pulse" />
            <span>Run AI Analysis</span>
          </button>
          
          <button
            onClick={() => setIsChatModalOpen(true)}
            disabled={syncStatus.isSyncing}
            className="px-4 py-2 bg-slate-900/40 hover:bg-slate-800/50 border border-white/10 rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white"
            title="Sync chats manually"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${syncStatus.isSyncing ? 'animate-spin text-primary' : ''}`} />
            <span>Sync Chats</span>
          </button>
          
          <div className="px-4 py-2 bg-slate-900/60 border border-white/5 rounded-full text-xs font-semibold flex items-center gap-2">
            <span className={`w-2 h-2 ${syncStatus.isSyncing ? 'bg-emerald-500 animate-pulse' : 'bg-primary'} rounded-full`} />
            <span className="text-slate-400">{syncStatus.isSyncing ? 'Syncing History...' : 'Memory Active'}</span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: tabs and cards */}
        <div className="lg:col-span-2 space-y-6">
          <section className="glass rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/5 bg-slate-900/10 backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-base font-bold flex items-center gap-2 text-slate-200">
                <Sparkles className="w-4.5 h-4.5 text-accent" />
                {activeTab === 'search' && 'Semantic Search'}
                {activeTab === 'insights' && 'AI Insight Archive'}
                {activeTab === 'chats' && 'Linked Chat Directory'}
              </h2>
              <div className="flex bg-slate-950/40 p-1.5 rounded-2xl border border-white/10 w-fit">
                <button 
                  onClick={() => setActiveTab('search')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'search' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Search
                </button>
                <button 
                  onClick={() => setActiveTab('insights')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'insights' ? 'bg-accent text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Insights
                </button>
                <button 
                  onClick={() => setActiveTab('chats')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'chats' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Chats
                </button>
              </div>
            </div>
            
            {/* Conditional Views */}
            <div className="space-y-6">
              {activeTab === 'search' && (
                <div className="space-y-6">
                  <SearchBar onSearch={handleSearchSubmit} isLoading={isSearching} />
                  
                  <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                      {results.length > 0 ? (
                        results.map((res, i) => (
                          <MemoryCard key={res._id} result={res} index={i} />
                        ))
                      ) : !isSearching && (
                        <div className="text-center py-16 text-slate-500 text-sm">
                          Start typing queries above to scan your second brain.
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {activeTab === 'insights' && (
                <InsightsArchive />
              )}

              {activeTab === 'chats' && (
                <ChatManager 
                  onUpdateChatSetting={handleUpdateChatSetting}
                />
              )}
            </div>
          </section>
        </div>

        {/* Right 1 Column: Sticky AI conversational bubble and Stats */}
        <div className="space-y-6 lg:h-fit lg:sticky lg:top-6">
          <AskAiPanel />
          <StatsOverview syncStatus={syncStatus} />
        </div>
      </main>

      {/* Checklist Sync modal */}
      <SyncModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        onStartSync={handleStartSync}
      />
    </div>
  );
};
