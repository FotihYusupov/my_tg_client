import React, { useState } from 'react';
import { Tag, ChevronDown, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const CHAT_CATEGORIES: Record<string, { label: string; subcategories: string[] }> = {
  "personal": {
    "label": "Personal",
    "subcategories": ["family", "friends", "relationship", "daily_life", "emotions", "private_thoughts", "health", "lifestyle", "hobbies"]
  },
  "work": {
    "label": "Work",
    "subcategories": ["tasks", "meetings", "clients", "team", "deadlines", "documents", "operations", "management", "finance", "hiring"]
  },
  "education": {
    "label": "Education",
    "subcategories": ["university", "courses", "homework", "research", "programming", "language_learning", "notes", "exams"]
  },
  "projects": {
    "label": "Projects",
    "subcategories": ["prep_master", "second_brain", "roomix", "tradeflow_erp", "startup", "architecture", "deployment", "bugs", "roadmap", "brainstorming", "ai_research"]
  },
  "communication": {
    "label": "Communication",
    "subcategories": ["casual_chat", "important_conversation", "discussion", "argument", "negotiation", "feedback", "support", "announcement"]
  },
  "events": {
    "label": "Events",
    "subcategories": ["meeting", "appointment", "travel", "birthday", "deadline", "schedule", "plan", "reminder"]
  },
  "finance": {
    "label": "Finance",
    "subcategories": ["payments", "expenses", "salary", "investments", "subscriptions", "purchases", "business_finance"]
  },
  "knowledge": {
    "label": "Knowledge",
    "subcategories": ["ideas", "insights", "tutorials", "references", "books", "tools", "technologies", "prompts", "links"]
  },
  "social": {
    "label": "Social",
    "subcategories": ["clubs", "communities", "networking", "social_media", "events", "collaborations"]
  },
  "ai_memory": {
    "label": "AI Memory",
    "subcategories": ["long_term_memory", "short_term_memory", "important_memory", "recurring_topic", "preference", "personality_signal", "emotional_signal", "relationship_signal"]
  }
};

interface CategoryPickerProps {
  value: string;
  onChange: (val: string) => void;
}

export const CategoryPicker: React.FC<CategoryPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'categories' | 'subcategories'>('categories');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const handleOpen = () => {
    setIsOpen(!isOpen);
    setView('categories');
    setSelectedCat(null);
  };

  const handleCatSelect = (key: string) => {
    setSelectedCat(key);
    setView('subcategories');
  };

  const handleSubSelect = (sub: string) => {
    onChange(sub);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button 
        onClick={handleOpen}
        className="w-full flex items-center gap-2 bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-medium text-slate-300 hover:text-white shadow-sm hover:shadow transition-all group"
      >
        <Tag className={`w-3.5 h-3.5 ${value === 'none' ? 'text-slate-500' : 'text-primary'}`} />
        <span className="flex-1 text-left truncate">
          {value === 'none' ? 'No Category' : value.replace(/_/g, ' ')}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute z-50 mt-2 w-56 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
              {view === 'categories' ? (
                <div className="p-1.5">
                  <button 
                    onClick={() => handleSubSelect('none')}
                    className="w-full text-left px-3 py-2 text-[11px] text-slate-400 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between"
                  >
                    No Category
                    {value === 'none' && <Check className="w-3 h-3 text-primary" />}
                  </button>
                  <div className="h-px bg-white/5 my-1" />
                  {Object.entries(CHAT_CATEGORIES).map(([key, cat]) => (
                    <button 
                      key={key}
                      onClick={() => handleCatSelect(key)}
                      className="w-full text-left px-3 py-2 text-[11px] text-slate-200 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between group"
                    >
                      {cat.label}
                      <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-1.5">
                  <button 
                    onClick={() => setView('categories')}
                    className="w-full text-left px-3 py-2 text-[10px] text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 mb-1"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Back to Categories
                  </button>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {selectedCat && CHAT_CATEGORIES[selectedCat].subcategories.map(sub => (
                      <button 
                        key={sub}
                        onClick={() => handleSubSelect(sub)}
                        className="w-full text-left px-3 py-2 text-[11px] text-slate-300 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between"
                      >
                        {sub.replace(/_/g, ' ')}
                        {value === sub && <Check className="w-3 h-3 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
