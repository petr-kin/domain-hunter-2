// Web Worker for domain generation - prevents UI freeze

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const NUMBERS = '0123456789'.split('');
const MAX_DOMAINS = 100000;

interface GeneratorConfig {
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
}

const parseChars = (input: string): Set<string> => {
  return new Set(
    input
      .toLowerCase()
      .split('')
      .map((c) => c.trim())
      .filter((c) => c && c !== ',' && c !== ' ')
  );
};

const filterChars = (chars: string[], config: GeneratorConfig): string[] => {
  let result = chars;
  if (config.onlyChars?.trim()) {
    const only = parseChars(config.onlyChars);
    result = result.filter((c) => only.has(c));
  }
  if (config.excludedChars?.trim()) {
    const excluded = parseChars(config.excludedChars);
    result = result.filter((c) => !excluded.has(c));
  }
  return result;
};

const containsSubstring = (name: string, mustContain: string): boolean => {
  if (!mustContain.trim()) return true;
  const substring = mustContain.toLowerCase().replace(/,/g, '').replace(/\s/g, '');
  return name.includes(substring);
};

// Generate combinations with mustContain optimization
const generateWithSubstring = (
  chars: string[],
  length: number,
  mustContain: string,
  tld: string,
  domains: string[]
): void => {
  if (chars.length === 0 || domains.length >= MAX_DOMAINS) return;

  const substring = mustContain.toLowerCase().replace(/,/g, '').replace(/\s/g, '');

  // If no substring filter, use standard generation
  if (!substring) {
    generateAll(chars, length, tld, domains);
    return;
  }

  // For each possible position of substring
  const subLen = substring.length;
  if (subLen > length) return; // Can't fit

  for (let pos = 0; pos <= length - subLen; pos++) {
    if (domains.length >= MAX_DOMAINS) return;

    // Generate all combinations with substring fixed at position
    generateWithFixedSubstring(chars, length, substring, pos, tld, domains);
  }
};

const generateWithFixedSubstring = (
  chars: string[],
  length: number,
  substring: string,
  subPos: number,
  tld: string,
  domains: string[]
): void => {
  const subLen = substring.length;
  const freePositions: number[] = [];

  for (let i = 0; i < length; i++) {
    if (i < subPos || i >= subPos + subLen) {
      freePositions.push(i);
    }
  }

  if (freePositions.length === 0) {
    // Only the substring
    const domain = `${substring}.${tld}`;
    if (!domains.includes(domain)) domains.push(domain);
    return;
  }

  const indices = new Array(freePositions.length).fill(0);
  const n = chars.length;

  while (domains.length < MAX_DOMAINS) {
    // Build combination
    const combo = new Array(length).fill('');

    // Place substring
    for (let i = 0; i < subLen; i++) {
      combo[subPos + i] = substring[i];
    }

    // Place free chars
    for (let i = 0; i < freePositions.length; i++) {
      combo[freePositions[i]] = chars[indices[i]];
    }

    const domain = `${combo.join('')}.${tld}`;
    if (!domains.includes(domain)) {
      domains.push(domain);
    }

    // Increment
    let p = freePositions.length - 1;
    while (p >= 0) {
      indices[p]++;
      if (indices[p] < n) break;
      indices[p] = 0;
      p--;
    }
    if (p < 0) break;
  }
};

const generateAll = (
  chars: string[],
  length: number,
  tld: string,
  domains: string[]
): void => {
  if (chars.length === 0 || domains.length >= MAX_DOMAINS) return;

  const indices = new Array(length).fill(0);
  const n = chars.length;

  while (domains.length < MAX_DOMAINS) {
    let combo = '';
    for (let i = 0; i < length; i++) {
      combo += chars[indices[i]];
    }
    domains.push(`${combo}.${tld}`);

    let pos = length - 1;
    while (pos >= 0) {
      indices[pos]++;
      if (indices[pos] < n) break;
      indices[pos] = 0;
      pos--;
    }
    if (pos < 0) break;
  }
};

const generateDomains = (config: GeneratorConfig): string[] => {
  const domains: string[] = [];
  const letters = filterChars(ALPHABET, config);
  const numbers = filterChars(NUMBERS, config);
  const mustContain = config.mustContain || '';
  const tld = config.tld;

  // x.tld
  if (config.includeSingleLetter) {
    for (const l of letters) {
      if (domains.length >= MAX_DOMAINS) break;
      const domain = `${l}.${tld}`;
      if (containsSubstring(l, mustContain)) domains.push(domain);
    }
  }

  // xx.tld
  if (config.includeDoubleLetter && domains.length < MAX_DOMAINS) {
    generateWithSubstring(letters, 2, mustContain, tld, domains);
  }

  // yy.tld
  if (config.includeNumberNumber && domains.length < MAX_DOMAINS) {
    generateWithSubstring(numbers, 2, mustContain, tld, domains);
  }

  // xy.tld
  if (config.includeLetterNumber && domains.length < MAX_DOMAINS) {
    for (const l of letters) {
      for (const n of numbers) {
        if (domains.length >= MAX_DOMAINS) break;
        const name = l + n;
        if (containsSubstring(name, mustContain)) {
          domains.push(`${name}.${tld}`);
        }
      }
    }
  }

  // yx.tld
  if (config.includeNumberLetter && domains.length < MAX_DOMAINS) {
    for (const n of numbers) {
      for (const l of letters) {
        if (domains.length >= MAX_DOMAINS) break;
        const name = n + l;
        if (containsSubstring(name, mustContain)) {
          domains.push(`${name}.${tld}`);
        }
      }
    }
  }

  // 3-6 letter patterns
  if (config.includeTripleLetter && domains.length < MAX_DOMAINS) {
    generateWithSubstring(letters, 3, mustContain, tld, domains);
  }
  if (config.includeQuadrupleLetter && domains.length < MAX_DOMAINS) {
    generateWithSubstring(letters, 4, mustContain, tld, domains);
  }
  if (config.includeQuintupleLetter && domains.length < MAX_DOMAINS) {
    generateWithSubstring(letters, 5, mustContain, tld, domains);
  }
  if (config.includeSextupleLetter && domains.length < MAX_DOMAINS) {
    generateWithSubstring(letters, 6, mustContain, tld, domains);
  }

  return [...new Set(domains)].sort();
};

// Worker message handler
self.onmessage = (e: MessageEvent<GeneratorConfig>) => {
  const result = generateDomains(e.data);
  self.postMessage(result);
};

export {};
