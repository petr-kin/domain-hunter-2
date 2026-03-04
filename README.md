# 🎯 Domain Hunter

A high-performance, client-side application for discovering, validating, and analyzing short premium domain names (e.g., `abc.cz`, `42.ai`, `x.com`).

Combines algorithmic pattern generation, real-time DNS-over-HTTPS availability checks, and Google Gemini AI for instant market valuation and brandability analysis.

## Features

- **Pattern Generation** — Generate thousands of permutations: single letter (`x.tld`), double letter (`xx.tld`), triple letter (`xxx.tld`), numeric (`yy.tld`), and alphanumeric mixed (`xy.tld`, `yx.tld`)
- **Multi-TLD Support** — `.cz`, `.com`, `.ai`, `.app`, `.io`
- **Real-time DNS Scanning** — Parallel batch checking via Google Public DNS-over-HTTPS
- **AI Valuation** — Gemini 2.5 Flash analysis with market value, brandability score, niche suggestions
- **Dark UI** — Clean, responsive interface with progress tracking and list filtering

## Tech Stack

- **React 19** + TypeScript (Vite)
- **Tailwind CSS 3** with custom design tokens
- **Google GenAI SDK** (`@google/genai`)
- **Google Public DNS-over-HTTPS**
- **Font Awesome 6** icons

## Getting Started

### Prerequisites

- Node.js 18+
- Google Gemini API Key ([aistudio.google.com](https://aistudio.google.com))

### Install & Run

```bash
npm install

# Add your Gemini API key
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=your_key

npm run dev
```

The app runs at `http://localhost:3000`.

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

1. **Configure** — Select TLD, toggle patterns, optionally exclude characters
2. **Generate** — Click "Generate & Reset List" to create the domain list
3. **Scan** — Click "Start Scan" to check availability via DNS
4. **Analyze** — Click "AI Analyze" on available domains for Gemini valuation

## How DNS Checking Works

The app queries `https://dns.google/resolve`:

- **Status 3 (NXDOMAIN)** → Marked as Available (no DNS records)
- **Status 0 (NOERROR)** → Marked as Taken (resolves to IP)

> **Note**: A domain can be registered but parked without nameservers. The tool may show it as Available, but a registrar may show it as Taken.

## Project Structure

```
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Main app component
│   ├── types.ts              # TypeScript interfaces
│   ├── index.css             # Global styles + Tailwind
│   ├── components/
│   │   ├── FilterPanel.tsx   # Config sidebar
│   │   └── DomainItem.tsx    # Domain card with AI analysis
│   └── services/
│       ├── dnsService.ts     # DNS-over-HTTPS checks
│       ├── generatorService.ts # Pattern generation
│       └── geminiService.ts  # Gemini AI integration
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## License

MIT
