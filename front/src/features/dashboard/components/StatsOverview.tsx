import React from 'react';

interface StatsOverviewProps {
  syncStatus: {
    messageCount: number;
    chatCount: number;
    processedCount: number;
    isSyncing: boolean;
  };
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ syncStatus }) => {
  const processedPercent = syncStatus.messageCount > 0 
    ? Math.min(100, Math.round((syncStatus.processedCount / syncStatus.messageCount) * 100))
    : 0;

  return (
    <section className="glass rounded-3xl p-6 shadow-xl border border-white/5 bg-slate-900/10">
      <h3 className="text-[10px] font-bold text-slate-400 mb-5 uppercase tracking-widest">
        Sync Overview
      </h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Messages Indexed</span>
          <span className="font-mono text-primary font-bold text-sm bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20">
            {syncStatus.messageCount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">AI Memories Extracted</span>
          <span className="font-mono text-accent font-bold text-sm bg-accent/10 px-2 py-0.5 rounded-lg border border-accent/20">
            {syncStatus.processedCount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Total Chats Linked</span>
          <span className="font-mono text-slate-300 font-bold">
            {syncStatus.chatCount.toLocaleString()}
          </span>
        </div>

        <div className="pt-2">
          <div className="flex justify-between text-[10px] text-slate-500 mb-1.5 font-bold uppercase tracking-wider">
            <span>Memory Comprehension</span>
            <span className="text-accent">{processedPercent}%</span>
          </div>
          <div className="w-full bg-slate-950/60 rounded-full h-2 overflow-hidden border border-white/5">
            <div 
              className="bg-gradient-to-r from-primary via-indigo-500 to-accent h-full transition-all duration-700 ease-out" 
              style={{ width: `${processedPercent}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
