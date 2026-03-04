# Domain Hunter 2 — Cloudflare Workers Migration Design

## Problem

The current app is a client-side-only SPA that:
1. Uses Vite dev proxy for RDAP checks — breaks in production
2. Exposes Gemini API key client-side
3. Uses DNS-over-HTTPS which produces false positives (parked domains show as "available")
4. Has no caching — re-checks domains on every session

## Solution

Migrate to **Cloudflare Pages + Functions** (Workers). Same origin, no CORS, KV for caching.

## Architecture

```
[ React SPA on Cloudflare Pages CDN ]
    |
    |-- POST /api/check         → Batch availability check (up to 100 domains)
    |-- GET  /api/check/stream   → SSE streaming for real-time scan progress
    |-- POST /api/analyze        → Server-side Gemini AI valuation
    |
[ Cloudflare Worker Functions ]
    |-- KV: DOMAIN_CACHE
    |       Key: "taken:example.com" → "1"  (TTL: 30 days)
    |       Key: "avail:example.com" → "1"  (TTL: 24 hours)
    |
    |-- DNS Pre-Filter (Google DoH)
    |       If DNS records exist → "taken" → cache → skip RDAP
    |
    |-- RDAP Query (only for NXDOMAIN results)
    |       TLD-specific endpoints (verisign, nic.cz, google registry, etc.)
    |
    |-- Gemini 2.5 Flash API (key in Worker secrets)
```

## Backend: Worker Functions

### `functions/api/check.ts` — Batch Check
- Accepts `POST { domains: string[] }` (max 100 per request)
- For each domain:
  1. Check KV cache → return cached result if exists
  2. DNS pre-filter via Google DoH → if records exist → "taken" → cache
  3. RDAP query (TLD-specific) → definitive result → cache
- Returns `{ results: Array<{ domain, status }> }`

### `functions/api/check/stream.ts` — SSE Streaming
- Accepts domains via query params or initial POST
- Opens SSE connection
- Streams `data: {"domain":"x.cz","status":"TAKEN"}` events
- Client gets real-time updates as each domain is checked
- Handles backpressure and rate limiting server-side

### `functions/api/analyze.ts` — AI Valuation
- Accepts `POST { domain: string }`
- Calls Gemini 2.5 Flash with structured output schema
- Returns `{ valuation, brandability, niche[], reasoning }`
- API key stored as Worker secret

### RDAP Endpoints (by TLD)
- `.cz` → `https://rdap.nic.cz/domain/{domain}`
- `.com` → `https://rdap.verisign.com/com/v1/domain/{domain}`
- `.app` → `https://rdap.nic.google/rdap/domain/{domain}`
- `.io` → `https://rdap.identitydigital.services/rdap/domain/{domain}`
- `.ai` → `https://rdap.identitydigital.services/rdap/domain/{domain}`
- Fallback → `https://rdap.org/domain/{domain}`

## Frontend Changes

### Remove
- Vite proxy configuration (`vite.config.ts` proxy block)
- `src/services/dnsService.ts` (logic moves to Worker)
- `src/services/verificationService.ts` (replaced by authoritative backend checks)
- `@google/genai` from package.json (AI moves server-side)
- `process.env.API_KEY` define in Vite config

### Modify
- `App.tsx`: Rewrite `startScan()` to use EventSource (SSE) to `/api/check/stream`
- `DomainItem.tsx`: AI analysis calls `/api/analyze` instead of importing geminiService
- `DomainItem.tsx`: Remove individual check/verify logic (handled by backend scan)
- `DomainItem.tsx`: Add affiliate "Buy" button for available domains
- `geminiService.ts` → becomes thin fetch wrapper to `/api/analyze`

### Keep Unchanged
- `generatorService.ts` (client-side permutation generation)
- `exportService.ts` (CSV/JSON/clipboard)
- `FilterPanel.tsx` (configuration UI)
- `types.ts` (extend, don't replace)
- All styling, Tailwind config, design system
- localStorage persistence

## Caching Strategy (KV)

- **Taken domains**: cached 30 days (domains rarely become unregistered)
- **Available domains**: cached 24 hours (could be registered by someone)
- **Key format**: `taken:{domain}` or `avail:{domain}`
- **DNS pre-filter**: reduces RDAP queries by ~80%

## Affiliate Links

Available domains get a "Buy Now" button linking to:
- Namecheap: `https://www.namecheap.com/domains/registration/results/?domain={domain}`
- Can add affiliate ID via query param later

## Deployment

- `wrangler.toml` — KV namespace binding, compatibility settings
- `wrangler secret put GEMINI_API_KEY` — secure API key storage
- `npm run build` → `dist/` deployed to Pages
- `functions/` directory auto-detected by Pages as Worker Functions

## Types Changes

```typescript
// Add to types.ts
export interface CheckRequest {
  domains: string[];
}

export interface CheckResult {
  domain: string;
  status: DomainStatus;
  cached: boolean;
}

export interface AnalyzeRequest {
  domain: string;
}
```
