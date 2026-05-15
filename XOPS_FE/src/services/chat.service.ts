import apiClient from '@/lib/api-client';

export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

export const sendChatMessage = async (message: string, history: ChatMessage[]) => {
    const response = await apiClient.post('/chat', {
        message,
        history,
    });
    return response.data.response;
};

export const sendBedrockMessage = async (message: string): Promise<string> => {
  const response = await apiClient.post('/ai/ask', {
    question: message,
  }, {
    headers: {
      'x-api-key': import.meta.env.VITE_API_KEY,
    },
  });
  return response.data.answer;
};