import api from "./api";

export const ingestionService = {
  triggerSync: async (chatIds?: string[], startDate?: string, endDate?: string) => {
    const response = await api.post('/ingestion/trigger', { chatIds, startDate, endDate });
    return response.data;
  },

  getChats: async (forceRefresh = false, page = 1, limit = 20, signal?: AbortSignal) => {
    const response = await api.get(
      `/ingestion/get-chats?forceRefresh=${forceRefresh}&page=${page}&limit=${limit}`,
      { signal }
    );
    return response.data;
  },

  runAiEnrichment: async () => {
    const response = await api.post('/ingestion/enrich');
    return response.data;
  },

  getStatus: async () => {
    const response = await api.get('/ingestion/status');
    return response.data;
  },

  updateChatSettings: async (chatId: string, category: string, isMonitored: boolean) => {
    const response = await api.post('/ingestion/update-chat', { chatId, category, isMonitored });
    return response.data;
  }
};
