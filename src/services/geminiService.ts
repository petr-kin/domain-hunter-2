import { AIAnalysis } from '../types';

export const analyzeDomain = async (domain: string): Promise<AIAnalysis> => {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'AI analysis failed' }));
    throw new Error(error.error || 'AI analysis failed');
  }

  return response.json();
};
