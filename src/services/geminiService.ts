import { GoogleGenAI, Type } from '@google/genai';
import { AIAnalysis } from '../types';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('Gemini API Key not found. Set API_KEY or GEMINI_API_KEY in .env');
  return new GoogleGenAI({ apiKey });
};

export const analyzeDomain = async (domain: string): Promise<AIAnalysis> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze the domain name "${domain}". Estimate its potential market value (Low/Medium/High/Premium), give a brandability score from 1-10, list 3 suitable niches, and provide a 1 sentence reasoning.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            valuation: {
              type: Type.STRING,
              enum: ['Low', 'Medium', 'High', 'Premium'],
            },
            brandability: { type: Type.NUMBER },
            niche: { type: Type.ARRAY, items: { type: Type.STRING } },
            reasoning: { type: Type.STRING },
          },
          required: ['valuation', 'brandability', 'niche', 'reasoning'],
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as AIAnalysis;
    }
    throw new Error('No response from AI');
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
    throw error;
  }
};
