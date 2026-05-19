import React, { useState } from 'react';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import { searchService } from '../../../services/searchService';
import toast from 'react-hot-toast';

export const AskAiPanel: React.FC = () => {
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  const handleAskAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;

    setIsAsking(true);
    setAiAnswer('');
    const questionCopy = aiQuestion;
    setAiQuestion('');

    try {
      const answer = await searchService.askAi(questionCopy);
      setAiAnswer(answer);
    } catch (error) {
      toast.error('AI Brain is temporarily unavailable');
      console.error('AI Ask failed', error);
      setAiAnswer("Sorry, I couldn't process that question.");
      setAiQuestion(questionCopy); // Restore question on error
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <section className="glass rounded-3xl p-6 shadow-2xl border border-white/5 bg-slate-900/20 backdrop-blur-xl h-fit">
      <h2 className="text-base font-bold mb-5 flex items-center gap-2 text-slate-100">
        <MessageSquare className="w-4.5 h-4.5 text-primary" />
        Ask Your Brain
      </h2>
      <div className="space-y-5">
        <div className="min-h-[180px] bg-black/30 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed border border-white/5 italic transition-all custom-scrollbar overflow-y-auto max-h-[250px]">
          {isAsking ? (
            <div className="flex items-center gap-2 animate-pulse text-primary font-medium">
              <Sparkles className="w-4 h-4 animate-spin" /> Thinking and scanning vector index...
            </div>
          ) : aiAnswer || 'Ask me anything about your past conversations. For example: "What did we discuss about the project last week?"'}
        </div>

        <form onSubmit={handleAskAi} className="relative group">
          <textarea
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            placeholder="Ask a question about your chats..."
            className="w-full bg-slate-950/50 border border-white/10 rounded-2xl p-4 pr-12 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-xs min-h-[90px] max-h-[140px] resize-none text-slate-100 placeholder:text-slate-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAskAi(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={isAsking || !aiQuestion.trim()}
            className="absolute right-3 bottom-3.5 p-2 bg-primary hover:bg-blue-600 rounded-xl text-white transition-all disabled:opacity-50 disabled:bg-slate-800 shadow-lg hover:shadow-primary/20 active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </section>
  );
};
