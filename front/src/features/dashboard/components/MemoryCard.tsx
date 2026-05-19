import React from 'react';
import { Sparkles, Calendar, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { type SearchResult } from '../../../services/searchService';

interface MemoryCardProps {
  result: SearchResult;
  index: number;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({ result, index }) => {
  const dateStr = result.timestamp 
    ? new Date(result.timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Date Unknown';

  const importance = result.aiMetadata?.importance;
  const isHighImportance = importance !== undefined && importance > 0.85;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(0.3, index * 0.05) }}
      className={`p-5 rounded-2xl border transition-all duration-300 group flex flex-col justify-between ${
        isHighImportance 
          ? 'bg-gradient-to-br from-slate-900/60 to-accent/5 border-accent/25 hover:border-accent/40 shadow-md shadow-accent/5'
          : 'bg-slate-900/30 hover:bg-slate-900/50 border-white/5 hover:border-white/10'
      }`}
    >
      <div>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300">
              <User className="w-3 h-3 text-slate-400" />
              <span>{result.sender?.name || 'Session Summary'}</span>
            </div>
            
            {result.aiMetadata?.category && result.aiMetadata.category !== 'general' && (
              <span className="px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                {result.aiMetadata.category.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {importance !== undefined && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                isHighImportance 
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                  : 'bg-slate-800/40 border-slate-700/30 text-slate-500'
              }`}>
                <Sparkles className="w-3 h-3" />
                <span>Importance: {(importance * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-slate-200 text-sm leading-relaxed font-normal whitespace-pre-wrap">
          {result.content}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{dateStr}</span>
        </div>
        {result.score !== undefined && (
          <span className="font-mono text-slate-600">Relevance: {(result.score * 100).toFixed(0)}%</span>
        )}
      </div>
    </motion.div>
  );
};
