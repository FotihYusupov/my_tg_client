import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query);
  };

  return (
    <form onSubmit={handleSubmit} className="relative group w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for an idea, topic, or memory..."
        className="w-full bg-slate-900/40 backdrop-blur border border-white/10 rounded-2xl py-4 pl-12 pr-28 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-slate-500 text-slate-100 text-sm"
      />
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors w-5 h-5" />
      <button 
        type="submit"
        disabled={isLoading || !query.trim()}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-500 px-5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-md active:scale-95"
      >
        {isLoading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
};
