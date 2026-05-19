import api from "./api";

export interface SearchResult {
  _id: string;
  content: string;
  timestamp: string;
  sender: {
    name: string;
  };
  score: number;
  aiMetadata?: {
    importance?: number;
    category?: string;
    isProcessed?: boolean;
  };
}

export const searchService = {
  semanticSearch: async (query: string): Promise<SearchResult[]> => {
    const response = await api.get(`/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  getCategorized: async (page = 1, limit = 20, signal?: AbortSignal): Promise<any> => {
    const response = await api.get(`/search/categorized?page=${page}&limit=${limit}`, { signal });
    return response.data;
  },

  askAi: async (question: string): Promise<string> => {
    const response = await api.get(`/search/ask?q=${encodeURIComponent(question)}`);
    return response.data;
  }
};
