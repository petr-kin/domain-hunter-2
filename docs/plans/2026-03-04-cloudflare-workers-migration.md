# Cloudflare Workers Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Domain Hunter 2 from a client-side-only SPA to a full-stack app with Cloudflare Pages + Worker Functions for authoritative domain checking, server-side AI, KV caching, SSE streaming, and affiliate links.

**Architecture:** React SPA on Cloudflare Pages CDN, with `functions/` directory containing Worker Functions that handle RDAP/DNS checks, Gemini AI, and caching via KV. Same-origin, no CORS.

**Tech Stack:** React 19, Vite 6, Tailwind 3, Cloudflare Pages Functions (Workers), KV, Wrangler CLI, Google Gemini 2.5 Flash

**Design doc:** `docs/plans/2026-03-04-cloudflare-workers-migration-design.md`

---

## Task 1: Project scaffolding — Wrangler + KV setup

**Files:**
- Create: `wrangler.toml`
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Install wrangler and @google/genai for backend**

```bash
npm install -D wrangler
npm install @google/genai
```

Note: `@google/genai` stays as a runtime dependency but moves from frontend bundle to Worker-only usage.

**Step 2: Create `wrangler.toml`**

```toml
name = "domain-hunter"
compatibility_date = "2024-12-01"
pages_build_output_dir = "dist"

[[kv_namespaces]]
binding = "DOMAIN_CACHE"
id = "placeholder-will-be-set-after-create"

[vars]
ENVIRONMENT = "production"
```

**Step 3: Update `.gitignore`**

Append these lines:
```
.wrangler
.dev.vars
```

**Step 4: Create `.dev.vars` for local secrets**

```
GEMINI_API_KEY=<copy value from .env>
```

This is how Wrangler injects secrets locally. Read the existing `.env` file to get the key value.

**Step 5: Update `package.json` scripts**

Replace scripts with:
```json
{
  "scripts": {
    "dev": "wrangler pages dev -- vite",
    "build": "vite build",
    "preview": "wrangler pages dev dist",
    "deploy": "wrangler pages deploy dist"
  }
}
```

The `wrangler pages dev -- vite` command runs Vite dev server and proxies it through Wrangler, which binds KV and loads `functions/`.

**Step 6: Create KV namespace**

```bash
npx wrangler kv namespace create DOMAIN_CACHE
```

Copy the output `id` value and update `wrangler.toml` with the real ID. Also create a preview namespace:

```bash
npx wrangler kv namespace create DOMAIN_CACHE --preview
```

Add the preview_id to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "DOMAIN_CACHE"
id = "<production-id>"
preview_id = "<preview-id>"
```

**Step 7: Commit**

```bash
git add wrangler.toml .gitignore .dev.vars package.json package-lock.json
git commit -m "chore: add wrangler config, KV namespace, dev scripts"
```

---

## Task 2: Worker Function — domain checker (`/api/check`)

**Files:**
- Create: `functions/api/check.ts`

This Worker implements the core domain availability engine with the 3-layer check: KV cache → DNS pre-filter → RDAP.

**Step 1: Create `functions/api/check.ts`**

```typescript
interface Env {
  DOMAIN_CACHE: KVNamespace;
}

const RDAP_ENDPOINTS: Record<string, string> = {
  cz: 'https://rdap.nic.cz/domain/',
  com: 'https://rdap.verisign.com/com/v1/domain/',
  app: 'https://rdap.nic.google/rdap/domain/',
  io: 'https://rdap.identitydigital.services/rdap/domain/',
  ai: 'https://rdap.identitydigital.services/rdap/domain/',
};

const RDAP_FALLBACK = 'https://rdap.org/domain/';

type DomainStatus = 'AVAILABLE' | 'TAKEN' | 'ERROR';

interface CheckResult {
  domain: string;
  status: DomainStatus;
  cached: boolean;
}

// 1. Check KV cache
async function checkCache(kv: KVNamespace, domain: string): Promise<DomainStatus | null> {
  const taken = await kv.get(`taken:${domain}`);
  if (taken) return 'TAKEN';
  const avail = await kv.get(`avail:${domain}`);
  if (avail) return 'AVAILABLE';
  return null;
}

// 2. DNS pre-filter — if any DNS records exist, domain is taken
async function dnsPreFilter(domain: string): Promise<boolean | null> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=NS`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data: any = await response.json();
    // Status 0 with answers = has records = taken
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return true; // taken
    }
    // Status 3 = NXDOMAIN = might be available, needs RDAP
    if (data.Status === 3) {
      return false; // not taken (needs RDAP confirmation)
    }
    return null; // inconclusive
  } catch {
    return null;
  }
}

// 3. RDAP query — authoritative check
async function checkRdap(domain: string): Promise<DomainStatus> {
  const tld = domain.split('.').pop()?.toLowerCase() || '';
  const endpoint = RDAP_ENDPOINTS[tld] || RDAP_FALLBACK;

  try {
    const response = await fetch(`${endpoint}${domain}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/rdap+json' },
    });

    if (response.status === 200) return 'TAKEN';
    if (response.status === 404) return 'AVAILABLE';
    return 'ERROR';
  } catch {
    return 'ERROR';
  }
}

// Cache result in KV
async function cacheResult(kv: KVNamespace, domain: string, status: DomainStatus): Promise<void> {
  if (status === 'TAKEN') {
    await kv.put(`taken:${domain}`, '1', { expirationTtl: 30 * 24 * 60 * 60 }); // 30 days
  } else if (status === 'AVAILABLE') {
    await kv.put(`avail:${domain}`, '1', { expirationTtl: 24 * 60 * 60 }); // 24 hours
  }
}

// Full check pipeline for one domain
async function checkDomain(kv: KVNamespace, domain: string): Promise<CheckResult> {
  // Layer 1: Cache
  const cached = await checkCache(kv, domain);
  if (cached) {
    return { domain, status: cached, cached: true };
  }

  // Layer 2: DNS pre-filter
  const dnsTaken = await dnsPreFilter(domain);
  if (dnsTaken === true) {
    await cacheResult(kv, domain, 'TAKEN');
    return { domain, status: 'TAKEN', cached: false };
  }

  // Layer 3: RDAP (authoritative)
  const rdapStatus = await checkRdap(domain);
  if (rdapStatus !== 'ERROR') {
    await cacheResult(kv, domain, rdapStatus);
  }

  return { domain, status: rdapStatus, cached: false };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { domains?: string[] };
    const domains = body.domains;

    if (!Array.isArray(domains) || domains.length === 0) {
      return Response.json({ error: 'domains array required' }, { status: 400 });
    }

    if (domains.length > 100) {
      return Response.json({ error: 'max 100 domains per request' }, { status: 400 });
    }

    // Validate domain format
    const validDomains = domains.filter(d =>
      typeof d === 'string' && d.includes('.') && d.length < 255
    );

    const results: CheckResult[] = [];
    for (const domain of validDomains) {
      const result = await checkDomain(context.env.DOMAIN_CACHE, domain);
      results.push(result);
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
```

**Step 2: Verify the function loads**

```bash
npm run dev
```

Expected: Wrangler starts, binds KV, proxies Vite. No errors about `functions/api/check.ts`.

**Step 3: Test with curl**

```bash
curl -X POST http://localhost:8788/api/check \
  -H "Content-Type: application/json" \
  -d '{"domains":["google.com","xyznotregistered12345.com"]}'
```

Expected: JSON with `results` array, `google.com` → `TAKEN`, the other likely `AVAILABLE` or `ERROR`.

**Step 4: Commit**

```bash
git add functions/api/check.ts
git commit -m "feat: add Worker function for domain availability checking with KV cache"
```

---

## Task 3: Worker Function — SSE streaming (`/api/check/stream`)

**Files:**
- Create: `functions/api/check/stream.ts`

This enables real-time progress in the UI. Domains are sent as POST body, results stream back as SSE events.

**Step 1: Create `functions/api/check/stream.ts`**

```typescript
interface Env {
  DOMAIN_CACHE: KVNamespace;
}

const RDAP_ENDPOINTS: Record<string, string> = {
  cz: 'https://rdap.nic.cz/domain/',
  com: 'https://rdap.verisign.com/com/v1/domain/',
  app: 'https://rdap.nic.google/rdap/domain/',
  io: 'https://rdap.identitydigital.services/rdap/domain/',
  ai: 'https://rdap.identitydigital.services/rdap/domain/',
};

const RDAP_FALLBACK = 'https://rdap.org/domain/';

type DomainStatus = 'AVAILABLE' | 'TAKEN' | 'ERROR';

async function checkCache(kv: KVNamespace, domain: string): Promise<DomainStatus | null> {
  const taken = await kv.get(`taken:${domain}`);
  if (taken) return 'TAKEN';
  const avail = await kv.get(`avail:${domain}`);
  if (avail) return 'AVAILABLE';
  return null;
}

async function dnsPreFilter(domain: string): Promise<boolean | null> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=NS`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data: any = await response.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) return true;
    if (data.Status === 3) return false;
    return null;
  } catch {
    return null;
  }
}

async function checkRdap(domain: string): Promise<DomainStatus> {
  const tld = domain.split('.').pop()?.toLowerCase() || '';
  const endpoint = RDAP_ENDPOINTS[tld] || RDAP_FALLBACK;
  try {
    const response = await fetch(`${endpoint}${domain}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/rdap+json' },
    });
    if (response.status === 200) return 'TAKEN';
    if (response.status === 404) return 'AVAILABLE';
    return 'ERROR';
  } catch {
    return 'ERROR';
  }
}

async function cacheResult(kv: KVNamespace, domain: string, status: DomainStatus): Promise<void> {
  if (status === 'TAKEN') {
    await kv.put(`taken:${domain}`, '1', { expirationTtl: 30 * 24 * 60 * 60 });
  } else if (status === 'AVAILABLE') {
    await kv.put(`avail:${domain}`, '1', { expirationTtl: 24 * 60 * 60 });
  }
}

async function checkDomain(kv: KVNamespace, domain: string): Promise<{ domain: string; status: DomainStatus; cached: boolean }> {
  const cached = await checkCache(kv, domain);
  if (cached) return { domain, status: cached, cached: true };

  const dnsTaken = await dnsPreFilter(domain);
  if (dnsTaken === true) {
    await cacheResult(kv, domain, 'TAKEN');
    return { domain, status: 'TAKEN', cached: false };
  }

  const rdapStatus = await checkRdap(domain);
  if (rdapStatus !== 'ERROR') {
    await cacheResult(kv, domain, rdapStatus);
  }

  return { domain, status: rdapStatus, cached: false };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let domains: string[];
  try {
    const body = await context.request.json() as { domains?: string[] };
    if (!Array.isArray(body.domains) || body.domains.length === 0) {
      return Response.json({ error: 'domains array required' }, { status: 400 });
    }
    domains = body.domains.filter(
      (d): d is string => typeof d === 'string' && d.includes('.') && d.length < 255
    );
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const kv = context.env.DOMAIN_CACHE;

  const stream = new ReadableStream({
    async start(controller) {
      for (const domain of domains) {
        try {
          const result = await checkDomain(kv, domain);
          const event = `data: ${JSON.stringify(result)}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch {
          const event = `data: ${JSON.stringify({ domain, status: 'ERROR', cached: false })}\n\n`;
          controller.enqueue(encoder.encode(event));
        }
      }
      // Signal completion
      controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
```

**Step 2: Test with curl**

```bash
curl -X POST http://localhost:8788/api/check/stream \
  -H "Content-Type: application/json" \
  -d '{"domains":["google.com","xyznotregistered12345.com"]}' \
  --no-buffer
```

Expected: Streamed `data: {...}` lines, one per domain, ending with `data: {"done":true}`.

**Step 3: Commit**

```bash
git add functions/api/check/stream.ts
git commit -m "feat: add SSE streaming endpoint for real-time domain scanning"
```

---

## Task 4: Worker Function — AI analysis (`/api/analyze`)

**Files:**
- Create: `functions/api/analyze.ts`

Moves Gemini API call to the server. API key comes from Worker secrets, not client.

**Step 1: Create `functions/api/analyze.ts`**

```typescript
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
```

**Step 2: Test with curl**

```bash
curl -X POST http://localhost:8788/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"domain":"cool.ai"}'
```

Expected: JSON with `valuation`, `brandability`, `niche`, `reasoning` fields.

**Step 3: Commit**

```bash
git add functions/api/analyze.ts
git commit -m "feat: add server-side Gemini AI valuation endpoint"
```

---

## Task 5: Shared types — extract to common module

**Files:**
- Create: `functions/lib/types.ts`
- Modify: `src/types.ts`

The backend and frontend share status types. Extract shared constants.

**Step 1: Create `functions/lib/types.ts`**

```typescript
// Shared types between Worker functions
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
```

**Step 2: Add API types to `src/types.ts`**

Append to the existing `src/types.ts`:

```typescript
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
```

**Step 3: Commit**

```bash
git add functions/lib/types.ts src/types.ts
git commit -m "feat: add shared API types for frontend-backend communication"
```

---

## Task 6: Refactor Worker functions to use shared lib

**Files:**
- Create: `functions/lib/checker.ts`
- Modify: `functions/api/check.ts`
- Modify: `functions/api/check/stream.ts`

Extract the duplicated `checkDomain`, `dnsPreFilter`, `checkRdap`, `checkCache`, `cacheResult` into a shared module so both `/api/check` and `/api/check/stream` use the same code.

**Step 1: Create `functions/lib/checker.ts`**

Move all the domain-checking logic from Task 2/3 into this file:

```typescript
export const RDAP_ENDPOINTS: Record<string, string> = {
  cz: 'https://rdap.nic.cz/domain/',
  com: 'https://rdap.verisign.com/com/v1/domain/',
  app: 'https://rdap.nic.google/rdap/domain/',
  io: 'https://rdap.identitydigital.services/rdap/domain/',
  ai: 'https://rdap.identitydigital.services/rdap/domain/',
};

const RDAP_FALLBACK = 'https://rdap.org/domain/';

type DomainStatus = 'AVAILABLE' | 'TAKEN' | 'ERROR';

export interface CheckResult {
  domain: string;
  status: DomainStatus;
  cached: boolean;
}

export async function checkCache(kv: KVNamespace, domain: string): Promise<DomainStatus | null> {
  const taken = await kv.get(`taken:${domain}`);
  if (taken) return 'TAKEN';
  const avail = await kv.get(`avail:${domain}`);
  if (avail) return 'AVAILABLE';
  return null;
}

export async function dnsPreFilter(domain: string): Promise<boolean | null> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=NS`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data: any = await response.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) return true;
    if (data.Status === 3) return false;
    return null;
  } catch {
    return null;
  }
}

export async function checkRdap(domain: string): Promise<DomainStatus> {
  const tld = domain.split('.').pop()?.toLowerCase() || '';
  const endpoint = RDAP_ENDPOINTS[tld] || RDAP_FALLBACK;
  try {
    const response = await fetch(`${endpoint}${domain}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/rdap+json' },
    });
    if (response.status === 200) return 'TAKEN';
    if (response.status === 404) return 'AVAILABLE';
    return 'ERROR';
  } catch {
    return 'ERROR';
  }
}

export async function cacheResult(kv: KVNamespace, domain: string, status: DomainStatus): Promise<void> {
  if (status === 'TAKEN') {
    await kv.put(`taken:${domain}`, '1', { expirationTtl: 30 * 24 * 60 * 60 });
  } else if (status === 'AVAILABLE') {
    await kv.put(`avail:${domain}`, '1', { expirationTtl: 24 * 60 * 60 });
  }
}

export async function checkDomain(kv: KVNamespace, domain: string): Promise<CheckResult> {
  const cached = await checkCache(kv, domain);
  if (cached) return { domain, status: cached, cached: true };

  const dnsTaken = await dnsPreFilter(domain);
  if (dnsTaken === true) {
    await cacheResult(kv, domain, 'TAKEN');
    return { domain, status: 'TAKEN', cached: false };
  }

  const rdapStatus = await checkRdap(domain);
  if (rdapStatus !== 'ERROR') {
    await cacheResult(kv, domain, rdapStatus);
  }

  return { domain, status: rdapStatus, cached: false };
}
```

**Step 2: Simplify `functions/api/check.ts`**

Replace entire file:

```typescript
import { checkDomain, type CheckResult } from '../lib/checker';

interface Env {
  DOMAIN_CACHE: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { domains?: string[] };
    const domains = body.domains;

    if (!Array.isArray(domains) || domains.length === 0) {
      return Response.json({ error: 'domains array required' }, { status: 400 });
    }
    if (domains.length > 100) {
      return Response.json({ error: 'max 100 domains per request' }, { status: 400 });
    }

    const validDomains = domains.filter(
      (d): d is string => typeof d === 'string' && d.includes('.') && d.length < 255
    );

    const results: CheckResult[] = [];
    for (const domain of validDomains) {
      results.push(await checkDomain(context.env.DOMAIN_CACHE, domain));
    }

    return Response.json({ results });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
};
```

**Step 3: Simplify `functions/api/check/stream.ts`**

Replace entire file:

```typescript
import { checkDomain } from '../../lib/checker';

interface Env {
  DOMAIN_CACHE: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let domains: string[];
  try {
    const body = await context.request.json() as { domains?: string[] };
    if (!Array.isArray(body.domains) || body.domains.length === 0) {
      return Response.json({ error: 'domains array required' }, { status: 400 });
    }
    domains = body.domains.filter(
      (d): d is string => typeof d === 'string' && d.includes('.') && d.length < 255
    );
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const kv = context.env.DOMAIN_CACHE;

  const stream = new ReadableStream({
    async start(controller) {
      for (const domain of domains) {
        try {
          const result = await checkDomain(kv, domain);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ domain, status: 'ERROR', cached: false })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
```

**Step 4: Verify dev server still works**

```bash
npm run dev
```

Test both endpoints with curl to confirm they still return correct results.

**Step 5: Commit**

```bash
git add functions/
git commit -m "refactor: extract shared domain checker into functions/lib/checker.ts"
```

---

## Task 7: Frontend — rewrite `geminiService.ts` as API client

**Files:**
- Modify: `src/services/geminiService.ts`

Replace the direct Gemini SDK usage with a fetch call to `/api/analyze`.

**Step 1: Rewrite `src/services/geminiService.ts`**

Replace entire file contents:

```typescript
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
```

**Step 2: Commit**

```bash
git add src/services/geminiService.ts
git commit -m "refactor: geminiService now calls /api/analyze instead of direct SDK"
```

---

## Task 8: Frontend — rewrite `App.tsx` scan to use SSE

**Files:**
- Modify: `src/App.tsx`

Replace the client-side RDAP/DNS loop with an SSE connection to `/api/check/stream`.

**Step 1: Rewrite the `startScan` function and remove old imports/constants**

Remove from top of file:
- The `TLD_DELAYS` constant
- The `DEFAULT_DELAY` constant

Replace the `startScan` callback with:

```typescript
const startScan = useCallback(async () => {
  if (domains.length === 0) return;

  setIsScanning(true);
  scanRef.current = true;

  const unknownDomains = domains.filter((d) => d.status === DomainStatus.Unknown);
  const domainNames = unknownDomains.map((d) => d.name);

  let checkedCount = domains.filter(
    (d) => d.status !== DomainStatus.Unknown && d.status !== DomainStatus.Checking
  ).length;
  let availableCount = domains.filter((d) => d.status === DomainStatus.Available).length;
  let takenCount = domains.filter((d) => d.status === DomainStatus.Taken).length;

  // Mark all unknown as checking
  setDomains((prev) =>
    prev.map((d) =>
      d.status === DomainStatus.Unknown
        ? { ...d, status: DomainStatus.Checking }
        : d
    )
  );

  try {
    const response = await fetch('/api/check/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains: domainNames }),
    });

    if (!response.ok || !response.body) {
      throw new Error('Stream failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (scanRef.current) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6);
        try {
          const event = JSON.parse(json);
          if (event.done) break;

          const status =
            event.status === 'AVAILABLE' ? DomainStatus.Available :
            event.status === 'TAKEN' ? DomainStatus.Taken :
            DomainStatus.Error;

          setDomains((prev) =>
            prev.map((d) =>
              d.name === event.domain
                ? { ...d, status, checkedAt: Date.now() }
                : d
            )
          );

          checkedCount++;
          if (status === DomainStatus.Available) availableCount++;
          if (status === DomainStatus.Taken) takenCount++;

          setProgress({
            checked: checkedCount,
            total: domains.length,
            available: availableCount,
            taken: takenCount,
          });
        } catch {
          // skip malformed line
        }
      }
    }

    if (!scanRef.current) {
      reader.cancel();
    }
  } catch (err) {
    console.error('Scan error:', err);
  }

  setIsScanning(false);
  scanRef.current = false;
}, [domains]);
```

**Step 2: Remove `abortControllerRef` from stopScan**

The new scan uses `scanRef.current = false` + `reader.cancel()`. Keep `stopScan` simple:

```typescript
const stopScan = useCallback(() => {
  scanRef.current = false;
  setIsScanning(false);
}, []);
```

Remove `abortControllerRef` declaration and all references to it.

**Step 3: Update footer text**

Change:
```
DNS via Google DoH · AI by Gemini 2.5 Flash
```
To:
```
Authoritative RDAP · AI by Gemini 2.5 Flash
```

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: rewrite scan to use SSE streaming from backend API"
```

---

## Task 9: Frontend — simplify `DomainItem.tsx`

**Files:**
- Modify: `src/components/DomainItem.tsx`

Remove client-side check/verify logic (backend does this now). Add affiliate "Buy" button. Keep AI analysis (calls `/api/analyze` via updated `geminiService`).

**Step 1: Rewrite `DomainItem.tsx`**

Key changes:
- Remove `handleCheck` function (no more client-side RDAP)
- Remove `handleVerify` function (no more client-side verification)
- Remove `verifying`, `checking` state variables
- Remove `verificationService` import
- Remove `VerificationStatus` handling (backend gives authoritative results)
- Keep `handleAnalyze` (now calls the backend wrapper)
- Add "Buy" affiliate link for available domains
- Keep the `onStatusChange` prop for single-domain re-check button that calls `/api/check`

Replace the entire file:

```typescript
import React, { useState } from 'react';
import { DomainResult, DomainStatus, AIAnalysis } from '../types';

interface DomainItemProps {
  item: DomainResult;
}

const ValuationBadge: React.FC<{ value: string }> = ({ value }) => {
  const colors: Record<string, string> = {
    Premium: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    High: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    Medium: 'bg-blue-400/15 text-blue-300 border-blue-400/30',
    Low: 'bg-slate-400/15 text-slate-400 border-slate-400/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${colors[value] || colors.Low}`}>
      {value}
    </span>
  );
};

const AFFILIATE_URL = 'https://www.namecheap.com/domains/registration/results/?domain=';

export const DomainItem: React.FC<DomainItemProps> = React.memo(({ item }) => {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tld = item.name.split('.').pop()?.toLowerCase() || '';

  const handleAnalyze = async () => {
    if (analyzing || analysis) return;
    setAnalyzing(true);
    setError(null);
    try {
      const { analyzeDomain } = await import('../services/geminiService');
      const result = await analyzeDomain(item.name);
      setAnalysis(result);
    } catch {
      setError('AI analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  // Minimal card for taken domains
  if (item.status === DomainStatus.Taken) {
    return (
      <div className="px-3 py-2 rounded-lg border border-slate-800/50 bg-slate-900/20 flex items-center justify-between text-xs opacity-35 hover:opacity-50 transition-opacity">
        <span className="font-mono text-slate-500 truncate">{item.name}</span>
        <i className="fas fa-times-circle text-rose-800"></i>
      </div>
    );
  }

  // Checking state
  if (item.status === DomainStatus.Checking) {
    return (
      <div className="p-4 rounded-xl border border-brand-500/20 bg-brand-500/5 relative overflow-hidden">
        <div className="absolute inset-0 scan-line"></div>
        <div className="flex justify-between items-center relative z-10">
          <h3 className="text-base font-mono font-bold text-brand-300">{item.name}</h3>
          <i className="fas fa-circle-notch fa-spin text-brand-400"></i>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-500/70 mt-1 block relative z-10">
          Checking...
        </span>
      </div>
    );
  }

  // Unknown state
  if (item.status === DomainStatus.Unknown) {
    return (
      <div className="p-4 rounded-xl border border-slate-700/40 bg-dark-900/40 hover:border-slate-600/50 transition-all">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-mono font-bold text-slate-400">{item.name}</h3>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">Not checked</span>
          <a
            href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-slate-600 hover:text-slate-400 hover:underline transition-colors"
          >
            WHOIS
          </a>
        </div>
      </div>
    );
  }

  // Error state
  if (item.status === DomainStatus.Error) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-mono font-bold text-amber-400">{item.name}</h3>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mt-1 block">
          Check failed
        </span>
        <a
          href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-amber-500 hover:underline mt-1 block"
        >
          Check WHOIS
        </a>
      </div>
    );
  }

  // Available state — main card with Buy button
  return (
    <div className="p-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 card-glow-available transition-all duration-300 hover:-translate-y-0.5 animate-fade-in">
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-lg font-mono font-bold tracking-tight text-emerald-300">
          {item.name}
        </h3>
        <i className="fas fa-check-circle text-emerald-400 text-lg"></i>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-500/70">
          Available
        </span>
        <a
          href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-emerald-600 hover:text-emerald-400 hover:underline transition-colors"
        >
          WHOIS
        </a>
      </div>

      {/* Buy / Register Button */}
      <a
        href={`${AFFILIATE_URL}${item.name}`}
        target="_blank"
        rel="noreferrer"
        className="w-full mt-3 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.97]"
      >
        <i className="fas fa-cart-shopping"></i>
        <span>Register Domain</span>
      </a>

      {/* AI Analysis Section */}
      <div className="mt-3 pt-3 border-t border-dashed border-emerald-500/20">
        {!analysis && !analyzing && !error && (
          <button
            onClick={handleAnalyze}
            className="w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-emerald-500/10 hover:border-emerald-500/20"
          >
            <i className="fas fa-wand-magic-sparkles"></i>
            <span>AI Analyze</span>
          </button>
        )}

        {analyzing && (
          <div className="text-center py-3 text-emerald-400 text-xs">
            <i className="fas fa-brain fa-bounce mr-2"></i>
            <span className="animate-pulse">Analyzing...</span>
          </div>
        )}

        {analysis && (
          <div className="space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">Value</span>
              <ValuationBadge value={analysis.valuation} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">Brandability</span>
              <div className="flex gap-[3px]">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-3 rounded-sm transition-all ${
                      i < analysis.brandability ? 'bg-emerald-400' : 'bg-emerald-900/40'
                    }`}
                  ></div>
                ))}
              </div>
            </div>
            <div className="bg-emerald-900/20 p-2.5 rounded-lg border border-emerald-500/10 space-y-2">
              <p className="text-[11px] text-emerald-200/70 italic leading-relaxed">
                "{analysis.reasoning}"
              </p>
              <div className="flex flex-wrap gap-1">
                {analysis.niche.map((n) => (
                  <span
                    key={n}
                    className="px-1.5 py-0.5 bg-emerald-500/10 rounded text-[9px] uppercase font-semibold text-emerald-400/80 tracking-wide"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-400/70 text-xs text-center py-2 flex items-center justify-center gap-1.5">
            <i className="fas fa-exclamation-circle"></i>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300 underline">
              retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
```

**Step 2: Update `App.tsx` — remove unused props and callbacks**

In `App.tsx`:
- Remove `handleStatusChange` callback
- Remove `handleVerificationChange` callback
- Remove `onStatusChange` and `onVerificationChange` props from `<DomainItem>`
- Remove `VerificationStatus` from imports

The `<DomainItem>` usage becomes:
```tsx
<DomainItem key={item.name} item={item} />
```

**Step 3: Commit**

```bash
git add src/components/DomainItem.tsx src/App.tsx
git commit -m "feat: simplify DomainItem, add affiliate Buy button, remove client-side checks"
```

---

## Task 10: Cleanup — remove dead code and old proxy config

**Files:**
- Delete: `src/services/dnsService.ts`
- Delete: `src/services/verificationService.ts`
- Delete: `src/services/generatorWorker.ts`
- Modify: `vite.config.ts` (remove proxy block and `process.env.API_KEY` define)
- Modify: `src/types.ts` (remove `VerificationStatus` enum)
- Modify: `package.json` (move `@google/genai` from dependencies if desired — it stays for Worker usage)

**Step 1: Delete dead service files**

```bash
rm src/services/dnsService.ts
rm src/services/verificationService.ts
rm src/services/generatorWorker.ts
```

**Step 2: Clean `vite.config.ts`**

Replace entire file:

```typescript
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3016,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

Key removals:
- All proxy rules (backend handles this now)
- `loadEnv` and `process.env.API_KEY` define (Gemini key is server-side now)
- `mode` parameter from config function

**Step 3: Clean `src/types.ts`**

Remove `VerificationStatus` enum and the `verification` field from `DomainResult`:

```typescript
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
```

**Step 4: Clean `exportService.ts`**

Remove all `VerificationStatus` references. The `verified` field in exports is no longer needed since backend provides authoritative results:

```typescript
import { DomainResult, DomainStatus } from '../types';

export const exportToJSON = (domains: DomainResult[], tld: string): void => {
  const available = domains.filter((d) => d.status === DomainStatus.Available);
  const data = {
    exportedAt: new Date().toISOString(),
    tld,
    totalChecked: domains.filter((d) => d.status !== DomainStatus.Unknown).length,
    totalAvailable: available.length,
    domains: available.map((d) => ({
      name: d.name,
      checkedAt: d.checkedAt ? new Date(d.checkedAt).toISOString() : undefined,
    })),
  };
  downloadFile(JSON.stringify(data, null, 2), `domains-${tld}-${Date.now()}.json`, 'application/json');
};

export const exportToCSV = (domains: DomainResult[], tld: string): void => {
  const available = domains.filter((d) => d.status === DomainStatus.Available);
  const header = 'domain,checked_at';
  const rows = available.map((d) => {
    const checkedAt = d.checkedAt ? new Date(d.checkedAt).toISOString() : '';
    return `${d.name},${checkedAt}`;
  });
  downloadFile([header, ...rows].join('\n'), `domains-${tld}-${Date.now()}.csv`, 'text/csv');
};

export const copyToClipboard = async (domains: DomainResult[]): Promise<void> => {
  const available = domains.filter((d) => d.status === DomainStatus.Available);
  await navigator.clipboard.writeText(available.map((d) => d.name).join('\n'));
};

const downloadFile = (content: string, filename: string, type: string): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

**Step 5: Update version in `App.tsx`**

Change `v1.1.0` to `v2.0.0` in the sidebar header.

**Step 6: Verify the app builds**

```bash
npm run build
```

Expected: No TypeScript errors, clean build to `dist/`.

**Step 7: Verify dev server works end-to-end**

```bash
npm run dev
```

Expected: Wrangler proxies Vite, app loads, can generate domains, start scan, see SSE results stream in, click AI Analyze, see results.

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove dead client-side services, clean vite config, bump to v2.0.0"
```

---

## Task 11: TypeScript config for Worker functions

**Files:**
- Create: `functions/tsconfig.json`

The `functions/` directory uses Cloudflare Workers types, not DOM types. It needs its own tsconfig.

**Step 1: Create `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["./**/*.ts"]
}
```

**Step 2: Install types**

```bash
npm install -D @cloudflare/workers-types
```

**Step 3: Commit**

```bash
git add functions/tsconfig.json package.json package-lock.json
git commit -m "chore: add TypeScript config for Worker functions"
```

---

## Task 12: Final integration test

**Files:** None (verification only)

**Step 1: Clean build**

```bash
rm -rf dist
npm run build
```

Expected: Clean build, no errors.

**Step 2: Run with wrangler preview**

```bash
npm run preview
```

Expected: App loads at `http://localhost:8788`, fully functional.

**Step 3: Test full flow**

1. Select `.com` TLD, enable double-letter patterns
2. Click "Generate & Reset List"
3. Click "Start Scan"
4. Verify domains stream in as Available/Taken via SSE
5. Click "AI Analyze" on an available domain
6. Verify AI results appear
7. Click "Register Domain" button
8. Verify it opens Namecheap in new tab
9. Test export buttons (CSV, JSON, Copy)

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end testing"
```

---

## Summary of all files

### Created
- `wrangler.toml` — Cloudflare Pages config
- `.dev.vars` — Local secrets
- `functions/api/check.ts` — Batch check endpoint
- `functions/api/check/stream.ts` — SSE streaming endpoint
- `functions/api/analyze.ts` — Gemini AI endpoint
- `functions/lib/checker.ts` — Shared domain checking logic
- `functions/lib/types.ts` — Shared types
- `functions/tsconfig.json` — Worker TypeScript config

### Modified
- `package.json` — Scripts, dependencies
- `.gitignore` — Wrangler artifacts
- `vite.config.ts` — Remove proxy, simplify
- `src/types.ts` — Remove VerificationStatus, add API types
- `src/App.tsx` — SSE scan, remove client-side checking
- `src/components/DomainItem.tsx` — Simplify, add Buy button
- `src/services/geminiService.ts` — Thin API wrapper
- `src/services/exportService.ts` — Remove verification references

### Deleted
- `src/services/dnsService.ts`
- `src/services/verificationService.ts`
- `src/services/generatorWorker.ts`
