export enum DomainStatus {
  Unknown = 'UNKNOWN',
  Checking = 'CHECKING',
  Available = 'AVAILABLE',
  Taken = 'TAKEN',
  Error = 'ERROR',
}

export interface DomainResult {
  name: string;
  status: DomainStatus;
  checkedAt?: number;
}

export type GeneratorMode = 'patterns' | 'wordlist';

export interface GeneratorConfig {
  mode: GeneratorMode;
  tld: string;
  includeSingleLetter: boolean;
  includeDoubleLetter: boolean;
  includeTripleLetter: boolean;
  includeQuadrupleLetter: boolean;
  includeQuintupleLetter: boolean;
  includeSextupleLetter: boolean;
  includeNumberNumber: boolean;
  includeLetterNumber: boolean;
  includeNumberLetter: boolean;
  excludedChars: string;
  onlyChars: string;
  mustContain: string;
  startsWith: string;
  wordList: string;
  suffixes: string;
  prefixes: string;
}

export interface AIAnalysis {
  valuation: string;
  brandability: number;
  niche: string[];
  reasoning: string;
}

// API response types (from Worker backend)
export interface CheckResult {
  domain: string;
  status: 'AVAILABLE' | 'TAKEN' | 'ERROR';
  cached: boolean;
}

export interface StreamEvent {
  domain?: string;
  status?: 'AVAILABLE' | 'TAKEN' | 'ERROR';
  cached?: boolean;
  done?: boolean;
}
