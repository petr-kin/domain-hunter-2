import { GeneratorConfig } from '../types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const NUMBERS = '0123456789'.split('');

const MAX_DOMAINS = 50000;

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

// Smart generation: only generate domains containing the substring
const generateWithSubstring = (
  chars: string[],
  length: number,
  substring: string,
  tld: string,
  domains: string[]
): void => {
  if (chars.length === 0 || domains.length >= MAX_DOMAINS) return;

  const subLen = substring.length;
  if (subLen > length) return;

  const charSet = new Set(chars);

  // For each position where substring can start
  for (let pos = 0; pos <= length - subLen; pos++) {
    if (domains.length >= MAX_DOMAINS) return;

    // Check if substring chars are in our charset
    let valid = true;
    for (const c of substring) {
      if (!charSet.has(c)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    // Get free positions (not occupied by substring)
    const freePositions: number[] = [];
    for (let i = 0; i < length; i++) {
      if (i < pos || i >= pos + subLen) {
        freePositions.push(i);
      }
    }

    if (freePositions.length === 0) {
      // Domain is exactly the substring
      domains.push(`${substring}.${tld}`);
      continue;
    }

    // Generate all combinations for free positions
    const indices = new Array(freePositions.length).fill(0);
    const n = chars.length;

    while (domains.length < MAX_DOMAINS) {
      const combo = new Array(length).fill('');

      // Place substring
      for (let i = 0; i < subLen; i++) {
        combo[pos + i] = substring[i];
      }

      // Place free chars
      for (let i = 0; i < freePositions.length; i++) {
        combo[freePositions[i]] = chars[indices[i]];
      }

      domains.push(`${combo.join('')}.${tld}`);

      // Increment indices
      let p = freePositions.length - 1;
      while (p >= 0) {
        indices[p]++;
        if (indices[p] < n) break;
        indices[p] = 0;
        p--;
      }
      if (p < 0) break;
    }
  }
};

// Standard generation for small patterns
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

// Generate from custom word list with prefix/suffix combinations
const generateFromWordList = (config: GeneratorConfig): string[] => {
  const domains: string[] = [];
  const tld = config.tld;

  // Parse word list (one word per line or comma-separated)
  const words = (config.wordList || '')
    .split(/[\n,]/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0);

  if (words.length === 0) return domains;

  // Parse prefixes and suffixes
  const prefixes = (config.prefixes || '')
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(p => p.length > 0);

  const suffixes = (config.suffixes || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);

  // Generate combinations
  for (const word of words) {
    if (domains.length >= MAX_DOMAINS) break;

    // Just the word
    domains.push(`${word}.${tld}`);

    // Word + suffix
    for (const suffix of suffixes) {
      if (domains.length >= MAX_DOMAINS) break;
      domains.push(`${word}${suffix}.${tld}`);
    }

    // Prefix + word
    for (const prefix of prefixes) {
      if (domains.length >= MAX_DOMAINS) break;
      domains.push(`${prefix}${word}.${tld}`);

      // Prefix + word + suffix
      for (const suffix of suffixes) {
        if (domains.length >= MAX_DOMAINS) break;
        domains.push(`${prefix}${word}${suffix}.${tld}`);
      }
    }
  }

  return [...new Set(domains)].sort();
};

export const generateDomains = (config: GeneratorConfig): string[] => {
  // Word list mode
  if (config.mode === 'wordlist') {
    return generateFromWordList(config);
  }

  // Pattern mode
  const domains: string[] = [];
  const letters = filterChars(ALPHABET, config);
  const numbers = filterChars(NUMBERS, config);
  const mustContain = (config.mustContain || '').toLowerCase().replace(/,/g, '').replace(/\s/g, '');
  const startsWith = (config.startsWith || '').toLowerCase().replace(/,/g, '').replace(/\s/g, '');
  const tld = config.tld;

  const hasLargePattern = config.includeQuadrupleLetter || config.includeQuintupleLetter || config.includeSextupleLetter;
  const needsFilter = hasLargePattern && letters.length > 8 && !mustContain && !startsWith;

  // For large patterns without filters, limit alphabet
  const effectiveLetters = needsFilter ? letters.slice(0, 8) : letters;

  // Helper to check if name matches filters
  const matchesFilters = (name: string): boolean => {
    if (startsWith && !name.startsWith(startsWith)) return false;
    if (mustContain && !name.includes(mustContain)) return false;
    return true;
  };

  // Generate with startsWith prefix (efficient)
  const generateWithPrefix = (chars: string[], length: number): void => {
    if (startsWith.length >= length) {
      // Prefix is same or longer than target length
      if (startsWith.length === length && matchesFilters(startsWith)) {
        domains.push(`${startsWith}.${tld}`);
      }
      return;
    }

    const remainingLen = length - startsWith.length;
    const indices = new Array(remainingLen).fill(0);
    const n = chars.length;

    while (domains.length < MAX_DOMAINS) {
      let suffix = '';
      for (let i = 0; i < remainingLen; i++) {
        suffix += chars[indices[i]];
      }
      const name = startsWith + suffix;
      if (matchesFilters(name)) {
        domains.push(`${name}.${tld}`);
      }

      let pos = remainingLen - 1;
      while (pos >= 0) {
        indices[pos]++;
        if (indices[pos] < n) break;
        indices[pos] = 0;
        pos--;
      }
      if (pos < 0) break;
    }
  };

  // x.tld
  if (config.includeSingleLetter) {
    for (const l of effectiveLetters) {
      if (matchesFilters(l)) {
        domains.push(`${l}.${tld}`);
      }
    }
  }

  // xx.tld
  if (config.includeDoubleLetter && domains.length < MAX_DOMAINS) {
    if (startsWith) {
      generateWithPrefix(effectiveLetters, 2);
    } else if (mustContain) {
      generateWithSubstring(effectiveLetters, 2, mustContain, tld, domains);
    } else {
      generateAll(effectiveLetters, 2, tld, domains);
    }
  }

  // yy.tld
  if (config.includeNumberNumber && domains.length < MAX_DOMAINS) {
    if (startsWith) {
      generateWithPrefix(numbers, 2);
    } else if (mustContain) {
      generateWithSubstring(numbers, 2, mustContain, tld, domains);
    } else {
      generateAll(numbers, 2, tld, domains);
    }
  }

  // xy.tld
  if (config.includeLetterNumber && domains.length < MAX_DOMAINS) {
    for (const l of effectiveLetters) {
      for (const n of numbers) {
        if (domains.length >= MAX_DOMAINS) break;
        const name = l + n;
        if (matchesFilters(name)) {
          domains.push(`${name}.${tld}`);
        }
      }
    }
  }

  // yx.tld
  if (config.includeNumberLetter && domains.length < MAX_DOMAINS) {
    for (const n of numbers) {
      for (const l of effectiveLetters) {
        if (domains.length >= MAX_DOMAINS) break;
        const name = n + l;
        if (matchesFilters(name)) {
          domains.push(`${name}.${tld}`);
        }
      }
    }
  }

  // 3-6 letters
  const generatePattern = (length: number, maxChars: number) => {
    if (domains.length >= MAX_DOMAINS) return;
    if (startsWith) {
      generateWithPrefix(effectiveLetters, length);
    } else if (mustContain) {
      generateWithSubstring(effectiveLetters, length, mustContain, tld, domains);
    } else if (effectiveLetters.length <= maxChars) {
      generateAll(effectiveLetters, length, tld, domains);
    }
  };

  if (config.includeTripleLetter) generatePattern(3, 26);
  if (config.includeQuadrupleLetter) generatePattern(4, 10);
  if (config.includeQuintupleLetter) generatePattern(5, 6);
  if (config.includeSextupleLetter) generatePattern(6, 5);

  return [...new Set(domains)].sort();
};

export const countDomains = (config: GeneratorConfig): number => {
  // Word list mode
  if (config.mode === 'wordlist') {
    const words = (config.wordList || '')
      .split(/[\n,]/)
      .map(w => w.trim())
      .filter(w => w.length > 0);

    const prefixes = (config.prefixes || '')
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const suffixes = (config.suffixes || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (words.length === 0) return 0;

    // Each word generates: 1 (base) + suffixes + prefixes + (prefixes * suffixes)
    const combosPerWord = 1 + suffixes.length + prefixes.length + (prefixes.length * suffixes.length);
    return words.length * combosPerWord;
  }

  // Pattern mode
  const letterCount = filterChars(ALPHABET, config).length;
  const numberCount = filterChars(NUMBERS, config).length;

  let total = 0;
  if (config.includeSingleLetter) total += letterCount;
  if (config.includeDoubleLetter) total += letterCount ** 2;
  if (config.includeTripleLetter) total += letterCount ** 3;
  if (config.includeQuadrupleLetter) total += letterCount ** 4;
  if (config.includeQuintupleLetter) total += letterCount ** 5;
  if (config.includeSextupleLetter) total += letterCount ** 6;
  if (config.includeNumberNumber) total += numberCount ** 2;
  if (config.includeLetterNumber) total += letterCount * numberCount;
  if (config.includeNumberLetter) total += numberCount * letterCount;

  return Math.min(total, MAX_DOMAINS);
};
