# Domain Hunter 2 - Comprehensive Architecture & Product Specification V2

## Document History & Purpose
This document serves as the absolute single source of truth for the Domain Hunter 2 product. In response to the need for deep, execution-ready architectural guidance, this PRD V2 drastically alters the previous scope. It intentionally abandons the fatally flawed "Client-Side DNS-over-HTTPS" architecture, pivoting entirely to an **Authoritative Backend API Verification Engine**.

This specification is designed to be handed directly to a Senior Full-Stack Engineering team. It prevents the catastrophic outcome of building a domain finding tool that hallucinates "Available" domains simply because they lack DNS A-Records.

---

## 1. Executive Summary & Architectural Breakage Analysis

### 1.1 The Flaw in V1 Architectures (The "Parked Domain" Trap)
V1 attempted to build a fast, client-side domain scanner by querying Google's Public DNS (`https://dns.google/resolve`). 
- **The DNS Illusion:** DNS is not WHOIS. If a domain returns `NXDOMAIN` (Status 3), it simply means no IP address is assigned to it. **It does not mean the domain is eligible for registration.** 
- **The Catastrophic UX Result:** Premium short domains (like `xx.com` or `42.ai`) are almost 100% registered, but many are "parked" or held by investors without active nameservers. V1 will tell the user "42.ai is available!". The user gets excited, goes to Namecheap, and is crushed to find it's owned and not for sale. The user loses all trust in the app immediately.
- **Client-Side API Exposure:** Hardcoding a Gemini API key or requiring the user to "bring your own key" for AI valuation is terrible UX and restricts the app to developers only.

### 1.2 The V2 Fix: "Authoritative RDAP/API Backend"
V2 pivots Domain Hunter 2 into a **Full-Stack SaaS Application**.
- **Real Availability Checks:** We abandon client-side DNS guessing. The backend Node.js orchestrator queries authoritative ICANN RDAP endpoints or a direct Registrar API (e.g., Namecheap API or Route53 API) to definitively check if the domain is registered.
- **Server-Side AI:** Gemini API calls are moved to the secure backend. We can control the prompting, rate-limit abuse, and offer the tool as a clean SaaS without requiring users to paste API keys.

---

## 2. Target User & Monetization Strategy

### 2.1 Primary ICP (Ideal Customer Profile)
- **Persona:** Domain Investors (Domaining), Brand Agencies, and Serial Startup Founders.
- **Environment:** They are looking for short, brandable, aesthetic domains (e.g., `ai`, `io`, `app`, `co` extensions) that haven't been snatched up by squatters.
- **Pain Point:** Traditional registrars limit searches to 50 domains at a time and apply zero "brandability" intelligence. The user needs to programmatically check 10,000 permutations (e.g., all 3-letter `.ai` domains) fast, and have an AI filter out the unpronounceable garbage.

### 2.2 Product Positioning & Monetization
- **The Arbitrage Play:** The tool itself is free to use, acting as a massive lead-generation magnet.
- **Monetization (Affiliate Wedge):** When the AI finds a beautiful, available domain, the "Register Now" button is a deep-linked affiliate URL to Namecheap/GoDaddy. The platform makes 20-30% commission on the first year's registration. This is the highest-margin path with the least friction.
- **Pro Tier (Optional):** $19/mo for bulk exporting 100,000 permutations and unlimited AI valuations.

---

## 3. High-Level System Architecture

### 3.1 Stack Selection
- **Frontend:** React 19 (Vite) + Tailwind CSS 3 (Retained from V1 for high-performance permutation rendering).
- **Backend API:** Node.js (Fastify) or Cloudflare Workers.
- **Availability Engine:** Unified WHOIS/RDAP API fallback layer + Namecheap API.
- **AI Engine:** Google Gemini 2.5 Flash API (Server-side).
- **Caching Layer:** Redis (To cache WHOIS results for 24 hours to avoid rate-limits).

### 3.2 Component Interaction Diagram

```text
[ React Client ]
    |-- 1. User configures: "Check all 3-letter .ai domains ending in a vowel".
    |-- 2. Client generates 3,380 permutations locally in 50ms.
    |-- 3. Initiates Batch Verification via WebSocket/SSE to Backend.
          |
[ Node.js Backend ]
    |-- 4. Checks Redis Cache: "Is abc.ai registered?" -> SKIP if known Taken.
    |-- 5. Queries Authoritative RDAP / Namecheap API in parallel batches of 50.
    |-- 6. Streams definitive "AVAILABLE" or "TAKEN" back to Client.
          |
[ React Client ] -> Displays only the 14 available domains.
    |-- 7. User clicks "AI Valuation" on `zua.ai`.
          |
[ Node.js Backend ] -> Calls Gemini API: "Evaluate brandability of zua.ai". Returns structured JSON score.
[ React Client ] -> Renders valuation. User clicks Affiliate Link to buy.
```

---

## 4. Deep-Dive: The Permutation & Caching Engine

### 4.1 Client-Side Permutations
The actual generation of strings must remain entirely client-side.
- The UI contains strict RegEx builders or simple token selectors (e.g., `[Consonant][Vowel][x|y|z].ai`).
- Generating 100,000 strings is computationally trivial for a modern browser. Sending 100,000 strings to a backend is a waste of bandwidth. The client generates the array, chunks it into blocks of 100, and sends it to the verification endpoint.

### 4.2 The "Taken" Cache (Redis)
Querying WHOIS for 100,000 domains will get the backend IP banned globally in 5 minutes.
- **The Cache:** Once a domain is confirmed "Registered", it enters the Redis cache for 30 days. It is extremely rare for a domain to drop midway through a month.
- **The DNS Pre-Filter (Safe usage of DNS):** Before hitting the expensive WHOIS API, the backend *does* check DNS. If the domain has A records, CNAMEs, or MX records, we immediately classify it as `"TAKEN"` and cache it locally without ever touching a WHOIS server. We only hit WHOIS if the DNS returns `NXDOMAIN`. This safely reduces API load by 80%.

---

## 5. Security & Prompt Engineering

### 5.1 The Gemini Prompt
The value of the tool lies in its AI filtering. The backend prompt must enforce strict structured output to prevent hallucinatory prose.

```json
// System Prompt Requirement
"You are a premium domain appraiser. Analyze the usability, aesthetic, and market value of {domain}. Return ONLY a strict JSON object: { "pronounceability_score_1_to_10": number, "market_value_usd_estimate": number, "best_industry_niche": string, "rationale": string }."
```

---

## 6. Phased Execution Roadmap

### Phase 1: The Authoritative API (Weeks 1-3)
- Build the Node.js backend.
- Implement the DNS Pre-Filter logic (checking for explicit records).
- Integrate an authoritative endpoint (e.g., JSON-based RDAP or Domainr API) for domains that pass the DNS Pre-Filter.
- **Output:** The backend can definitively confirm if a domain is available without false positives.

### Phase 2: React UI Migration & Batching (Weeks 4-6)
- Connect the V1 React frontend to the new backend API.
- Implement Server-Sent Events (SSE) or WebSockets to handle streaming results as the backend processes batches of 100 domains.
- Add Affiliate Link routing logic to the "Buy Now" buttons.
- **Output:** A user can instantly generate 5,000 permutations and watch the specific available ones trickle into the UI reliably.

### Phase 3: The AI Valuation Layer (Weeks 7-8)
- Move the Gemini implementation to the backend.
- Refine the Brandability score algorithms.
- **Output:** The core application is complete and usable by the general public without API keys.

### Phase 4: SEO & Launch (Weeks 9-10)
- Build a landing page structure with programmatic SEO for "available 3 letter dot ai domains" or "domain name generator for SaaS".
- **Go-Live:** Launch on ProductHunt, monetizing entirely through affiliate conversions from users hunting for their next startup brand.
