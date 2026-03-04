export enum DomainStatus {
  Unknown = 'UNKNOWN',
  Checking = 'CHECKING',
  Available = 'AVAILABLE',
  Taken = 'TAKEN',
  Error = 'ERROR',
}

export enum VerificationStatus {
  Unverified = 'UNVERIFIED',
  Verifying = 'VERIFYING',
  Verified = 'VERIFIED',       // Confirmed available
  VerifyFailed = 'VERIFY_FAILED', // Secondary check says taken
}

export interface DomainResult {
  name: string;
  status: DomainStatus;
  checkedAt?: number;
  verification?: VerificationStatus;
}

export type GeneratorMode = 'patterns' | 'wordlist';

export interface GeneratorConfig {
  mode: GeneratorMode;
  tld: string;
  // Pattern mode options
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
  startsWith: string;     // Domain must start with this
  // Word list mode options
  wordList: string;       // Custom words (one per line)
  suffixes: string;       // Suffixes to combine (comma separated)
  prefixes: string;       // Prefixes to combine (comma separated)
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
