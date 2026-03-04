import { GoogleGenAI, Type } from '@google/genai';

interface Env {
  GEMINI_API_KEY: string;
}

interface AIAnalysis {
  valuation: string;
  brandability: number;
  niche: string[];
  reasoning: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'AI service not configured' }, { status: 503 });
  }

  let domain: string;
  try {
    const body = await context.request.json() as { domain?: string };
    if (!body.domain || typeof body.domain !== 'string') {
      return Response.json({ error: 'domain string required' }, { status: 400 });
    }
    domain = body.domain;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
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
      const analysis: AIAnalysis = JSON.parse(response.text);
      return Response.json(analysis);
    }

    return Response.json({ error: 'No response from AI' }, { status: 502 });
  } catch (error) {
    console.error('Gemini error:', error);
    return Response.json({ error: 'AI analysis failed' }, { status: 500 });
  }
};
