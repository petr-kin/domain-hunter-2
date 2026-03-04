export type DomainStatus = 'AVAILABLE' | 'TAKEN' | 'ERROR';

export interface CheckResult {
  domain: string;
  status: DomainStatus;
  cached: boolean;
}

export interface StreamEvent {
  domain?: string;
  status?: DomainStatus;
  cached?: boolean;
  done?: boolean;
}

export interface AIAnalysis {
  valuation: string;
  brandability: number;
  niche: string[];
  reasoning: string;
}
