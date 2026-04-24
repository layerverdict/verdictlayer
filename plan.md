# Verdict — Verifiable AI Assertion Layer

**0G APAC Hackathon 2026 | Solo Build | Target: Grand Prize ($45k)**

---

## Context

**Why we're building this:**
0G APAC Hackathon'ın 1. ödülü ($45k) hedefi. 16 Mayıs 2026 teslim deadline'ı (22 gün). Bugün 24 Nisan.

**Problem:** Kripto ekosistemde "güvenilir karar mekanizmaları" parçalı: Kleros (insan-jüri, yavaş, parçalı 7 ürün), UMA Optimistic Oracle (24-48h human challenge), Nexus Mutual (cover ama AI yok), Chainlink (feed ama decision yok). **Hiçbiri TEE-attested AI + instant decisioning + unified primitive sunmuyor.**

**Çözüm:** Verdict — TEE-attested AI judge'ların onchain verifiable kararlar verdiği **tek bir "Assertion primitive"** üzerine kurulu bir protokol. 4 use case (freelance dispute, parametric insurance claim, DAO milestone approval, NFT authenticity) aynı altyapıyı kullanır.

**Jüri Anlatı Uyumu:** 0G'nin EthCC 2026 "Three Verifications" manifestosuna 3/3 oturur:
- Verified Compute (Sealed Inference TEE)
- Verified Identity (Agent ID / ERC-7857 judge reputation NFT)
- Verified Decisioning (yeni primitive, bu projenin katkısı)

**Hedef Sonuç:** 22 günün sonunda mainnet'te deploy edilmiş, gerçek TX geçmişi olan, 1 cilalı demo app + 3 template app + tam çalışan protokol + 3 dakika profesyonel demo video + kapsamlı README.

---

## Ürün PRD (Product Requirements Document)

### 1. Ürün Vizyonu

**Tek cümle:** *Verdict — bir protokol. Onchain'deki her "kim haklı?" ve "bu olay gerçek mi?" sorusunu 30 saniyede TEE-attested AI ile cevaplar, reasoning'ini kriptografik kanıtlanabilir şekilde publish eder.*

### 2. Temel Primitive: Assertion

```
Assertion = {
  id: bytes32                    // deterministic hash of contents
  claim: string                  // insan-okunabilir iddia
  evidenceRoots: bytes32[]       // 0G Storage root hashes
  bond: uint256                  // spam-prevention stake
  asserter: address              // iddia sahibi
  callback: address              // sonuç tetiklenecek kontrat
  callbackSelector: bytes4       // hangi fonksiyon çağrılacak
  mode: Mode                     // INSTANT | AUDITED
  challengePeriod: uint256       // AUDITED için 30 dk ... 24h
  outcome: Outcome               // PENDING | TRUE | FALSE | INVALID
  reasoning: bytes32             // 0G Storage root hash of AI reasoning log
  verdictTx: bytes32             // TEE attestation hash
  createdAt, resolvedAt: uint256
}

enum Mode { INSTANT, AUDITED }
enum Outcome { PENDING, TRUE, FALSE, INVALID, ESCALATED }
```

### 3. Kullanıcı Personas

| Persona | İhtiyacı | Verdict ne sunuyor |
|---|---|---|
| **Freelancer** | Müşteri ödemeyi yapmıyor; hızlı adalet | Escrow app + AI judge 2 dk'da karar |
| **Küçük işletme / gig user** | Uçağım geç kaldı, tazminat istiyorum | Parametric insurance claim, AI flight API doğrular, anında payout |
| **DAO** | Grant milestone onaylanmalı, manuel oylama yavaş | AI milestone evaluator, multi-agent swarm kontrol eder |
| **NFT collector** | Sahte mi orijinal mi? | Image similarity + metadata check, onchain "authentic" rozet |
| **Geliştirici** | Custom decision logic'i entegre etmek | ERC-792 uyumlu arbitrator interface, drop-in replacement |

### 4. Kullanıcı Akışları (primary demo: Escrow)

**Akış A — Happy Path (no dispute):**
1. Alice (müşteri) + Bob (freelancer) Escrow kontratında sözleşme açar ($X USDC kilitlenir + scope text + deadline)
2. Bob iş teslim eder (deliverable 0G Storage'a upload, merkle root onchain kayıt)
3. Alice 48 saat içinde "Accept" tıklar → fon Bob'a release
4. Verdict kullanılmadı, sadece escrow

**Akış B — Dispute Path (Verdict kullanılır):**
1. Alice "Dispute" açar. `openDispute(reason, evidenceRootA)` çağrılır
2. Bob 24 saat içinde karşı kanıtını yükler `respondToDispute(evidenceRootB)`
3. Backend `AssertionRegistry.createAssertion()` ile bir Assertion yaratır — claim: "Bob kontratın scope'unu karşıladı mı?"
4. Judge Agent (TEE'de GLM-5): scope text + A'nın evidence + B'nin evidence okuyup reasoning üretir
5. Reasoning 0G Storage'a upload (encrypted, root hash assertion'a yazılır)
6. Verdict onchain publish: `Outcome.TRUE` (Bob haklı) veya `Outcome.FALSE` (Alice haklı)
7. Callback tetiklenir → Escrow kontratı fonu otomatik ilgili tarafa yollar
8. 30 dk challenge window açık (AUDITED mode): kaybeden taraf bond yatırarak appeal açabilir
9. Appeal açılırsa: OpenClaw Swarm (3 farklı model: DeepSeek V3, Qwen3, GLM-5) paralel değerlendirir → majority vote → final karar

**Akış C — Parametric Insurance (Claim app):**
1. Cüzdan sahibi önceden policy satın alır: "Flight AA123 > 2h delay → 0.5 ETH payout"
2. Uçuş geç kalır. Kullanıcı `claim()` çağırır
3. Claim Agent: uçuş API'ye çağrı (Chainlink/public API snapshot), delay'i doğrular
4. Agent `Outcome.TRUE` → kontrat otomatik payout
5. Toplam süre < 60 saniye, zero human touch

### 5. Özellik Matrisi (MVP değil, FULL)

| Özellik | Escrow App (Primary) | Insurance App | Milestone App | Authenticity App |
|---|---|---|---|---|
| Wallet connect (WalletConnect + Injected) | ✅ | ✅ | ✅ | ✅ |
| Case/Policy creation UI | ✅ | ✅ | ✅ | ✅ |
| Evidence upload (0G Storage) | ✅ | ✅ | ✅ | ✅ |
| AI Judge (TEE, 0G Compute GLM-5) | ✅ | ✅ | ✅ | ✅ |
| Reasoning publish (onchain hash + Storage doc) | ✅ | ✅ | ✅ | ✅ |
| Challenge/Appeal UI | ✅ | — | ✅ | — |
| Multi-agent swarm (OpenClaw) appeal | ✅ | ✅ (heavy claims) | ✅ | ✅ |
| Judge Reputation NFT (ERC-7857 Agent ID) | ✅ | ✅ | ✅ | ✅ |
| Real-time status (WebSocket / SSE) | ✅ | ✅ | ✅ | ✅ |
| Mobile-responsive | ✅ | ✅ | ✅ | ✅ |
| Framer Motion animations | ✅ | ✅ | ✅ | ✅ |
| Empty/loading/error states | ✅ | ✅ | ✅ | ✅ |
| Onboarding + tour | ✅ | ✅ | ✅ | ✅ |
| Dark/light mode | ✅ | ✅ | ✅ | ✅ |
| Transaction history | ✅ | ✅ | ✅ | ✅ |
| Production deploy | ✅ | ✅ | ✅ | ✅ |

**"No MVP" anlamı:** Hiçbir ekran "coming soon" demeyecek. Hiçbir özellik "for demo only mock" olmayacak. Gerçek 0G Compute, gerçek Storage, gerçek mainnet kontratları.

### 6. Judging Criteria'ya Haritalama (jüri oy verirken)

| Criterion | Verdict cevabı |
|---|---|
| **0G Tech Integration Depth** | 5 bileşen: Compute TEE + Storage (evidence + reasoning) + Chain (5 kontrat) + Agent ID (judge NFT) + DA (optional). Her birini yüzeysel değil dolu kullanır |
| **Technical Implementation & Completeness** | Mainnet deploy + Explorer'da canlı TX + 4 demo app + protokol + 3000+ satır kod + 150+ unit test + integration test |
| **Product Value & Market Potential** | Kleros $30-50M TVL sahası + parametric insurance trillion$ + prediction market $10B. Yeni kategori |
| **UX & Demo Quality** | Motion-designed demo, 3dk video, 5 test account hazır, production polish |
| **Team Capability & Docs** | Kapsamlı README (EN+TR), architecture diagram, her komponent için dedicated README, test plan, reproduce steps |

---

## Demo Video Senaryosu (3 Dakika, 4 App Sıralı Showcase)

Demo video **submission zorunlu** + **judging criteria #4**. 4 app'in hepsi gösterilecek. Tempo agresif ama dürüstçe başarılır; anahtar: her app için **minimum viable moment** + aynı primitive'in farklı use case'lerde çalıştığını kanıtlamak.

**Üretim:** Solo + ElevenLabs AI voiceover. Motion graphics Framer Motion + After Effects templates. 4 gerçek mainnet run'ı ön kayıt. Edit Descript veya DaVinci Resolve.

### 0:00 — 0:12 | HOOK (Cold Open)
**Görsel:** Split-screen montaj (hızlı 3sn'lik cut'lar):
- Upwork dispute "Resolution: 15-30 days"
- Flight insurance claim form "Processing: 7-10 days"
- DAO Snapshot "Voting: 5 days remaining"
- Kleros jury "2/7 votes, 4 days"
- 0G App splash: "Built on 0G"

**Ses:** *"On-chain decisions still take days. Juries can be bribed. Oracles can't reason. Every use case is its own silo."*

### 0:12 — 0:22 | SOLUTION REVEAL
**Görsel:** Black → Verdict logo animate in → tagline with typewriter: *"One primitive. Verifiable AI. On-chain."*
Sub-tagline: *"Powered by 0G Sealed Inference + Agent ID + Storage."*

**Ses:** *"Verdict is a verifiable AI assertion layer on 0G. One primitive. TEE-attested judges. On-chain enforcement."*

### 0:22 — 1:00 | APP 1 — ESCROW (38 sn, flagship demo)
**Görsel (screen recording, real mainnet):**
- 0:22-0:26: Alice creates escrow → "Build landing page, $500 USDC, Nov 15"
- 0:26-0:32: Timeline skip → "Nov 15: dispute opened." Alice uploads "screenshot: mobile broken." Evidence chip appears with 0G Storage root hash
- 0:32-0:38: Bob uploads CSS file. Second evidence chip
- 0:38-0:48: **ReasoningStream** component types GLM-5 reasoning in real-time: *"Inspecting scope. Clause 3 requires 'responsive design'. CSS file contains @media queries at 640px, 768px, 1024px breakpoints. Alice's screenshot shows Chrome mobile emulation with broken layout — but developer tools inspection reveals viewport meta tag missing in HTML, not CSS. Root cause: index.html missing `<meta viewport>`. Bob's CSS complies. Alice's integration omitted the meta tag."*
- 0:48-0:55: Verdict card: *"Outcome: FALSE (Alice's claim rejected). Bob delivered scope. Fix required: viewport meta tag."* → Payout TX executes → Etherscan preview
- 0:55-1:00: Stopwatch: **38 seconds total** · TX hash glow

**Ses:** *"Escrow dispute. Alice hires Bob. Claims broken mobile. Verdict reads both evidence files — spots the real root cause. Resolution in thirty-eight seconds. Payout auto-released on-chain."*

### 1:00 — 1:30 | APP 2 — PARAMETRIC INSURANCE (30 sn)
**Görsel:**
- 1:00-1:05: Flight delay push notification "AA123 delayed 3h 12m" → "File claim"
- 1:05-1:12: One click. Agent: *"Fetching AviationStack API snapshot. Cross-reference with policy clause: '≥2h delay triggers payout'."* (real API call, not mock)
- 1:12-1:20: Agent verifies → TEE attestation badge → Outcome: TRUE
- 1:20-1:28: Wallet animation: +0.5 ETH credited. Stopwatch: **28 seconds**
- 1:28-1:30: Policy card: "Paid. No forms. No adjuster."

**Ses:** *"Parametric insurance. Flight delayed. One click. Same primitive — now fetching a real flight API, verifying inside TEE. Twenty-eight seconds. Half an ETH credited. No human adjuster."*

### 1:30 — 2:00 | APP 3 — DAO MILESTONE VAULT (30 sn)
**Görsel:**
- 1:30-1:35: DAO grant: "Recipient: grantee.eth · Total: 10,000 USDC · Milestone 1 of 4"
- 1:35-1:42: Grantee submits: "Milestone 1 delivered. Evidence: GitHub commit + demo video root hash"
- 1:42-1:52: Verdict agent: *"Checking Milestone 1 acceptance criteria from grant contract. Examining linked commit: 847 lines, 23 files, matches scope 'user auth + dashboard'. Demo video (2:14) demonstrates login flow and dashboard. Criteria met."*
- 1:52-1:58: Verdict: TRUE → Vault partial release 2,500 USDC → 3 milestones remaining
- 1:58-2:00: Small text: *"DAO voting not required. Policy already pre-approved the judge."*

**Ses:** *"DAO grant milestone. Programmable trust. Grantee submits proof. Judge verifies criteria against contract. Partial release — twenty-five percent unlocked. Treasury operators sleep easy."*

### 2:00 — 2:20 | APP 4 — AUTHENTICITY CERTIFIER (20 sn)
**Görsel:**
- 2:00-2:04: NFT marketplace UI. User drops an image: "Verify: is this authentic Bored Ape #1337?"
- 2:04-2:12: Verdict agent: vision model (Qwen3-VL) runs perceptual hash + metadata check. *"Original hash from mint TX: 0xabc... Uploaded image hash: 0xabc... — match. Metadata cross-reference with on-chain token URI: identical IPFS root. Authenticity confirmed."*
- 2:12-2:18: Green badge: "Authentic · On-chain Certified" → ERC-7857 Agent ID attestation minted to user
- 2:18-2:20: Transition card: *"Four apps. One primitive. Infinite use cases."*

**Ses:** *"Last: NFT authenticity. Perceptual hash. Metadata cross-reference. Signed attestation. Any asset, any dispute, any claim — same primitive."*

### 2:20 — 2:40 | ARCHITECTURE & 0G STACK
**Görsel:** Animated diagram builds left-to-right:
- Application Layer (4 app icons)
- Verdict Protocol (7 Solidity contracts, ERC-792 interfaces)
- Judgment Layer (3 models in TEE: GLM-5, DeepSeek v3, Qwen3-VL)
- 0G Infrastructure: Compute TEE · Storage · Chain · Agent ID

**Callouts appear:**
- *"Sealed Inference — provider never sees your data"*
- *"ERC-7857 Agent ID — judge reputation on-chain"*
- *"ERC-792 compliant — drop-in for any Kleros-integrated dApp"*

**Ses:** *"Under the hood: 0G Compute runs sealed inference inside TEEs. 0G Storage anchors every piece of evidence and reasoning. 0G Chain enforces verdicts using the ERC-792 arbitration standard. Judge agents own reputation NFTs via ERC-7857 Agent ID."*

### 2:40 — 2:52 | APPEAL LAYER (Multi-Agent Swarm)
**Görsel:** Escrow case reopened → "Appeal" button → 3 agent cards animate in parallel (GLM-5, DeepSeek v3, Qwen3). Each produces a concurrent reasoning summary. Vote tally: 2-1 → original verdict upheld.

**Ses:** *"Disagree? Trigger an appeal. Three models, three independent reasonings, majority rules. Fully on-chain, fully auditable."*

### 2:52 — 3:00 | CTA
**Görsel:** Full-screen final card:
- `verdict.xyz` URL
- Mainnet contract address (chainscan.0g.ai link + QR)
- "Live on 0G Aristotle Mainnet"
- X handle + `#BuildOn0G`

**Ses:** *"Live on 0G Mainnet. Four apps. One open-source protocol. Try it now."*

---

**Üretim Notları (Day 21-22):**
- 4 real mainnet run'ı **Day 18-19'da** önceden record et, demo Day 21'de sadece edit
- ReasoningStream component'i yavaşça playback (gerçekte GLM-5 biraz daha hızlı stream eder, demo'da okunabilir tempoda oynat)
- 4 app için ayrı screenshot master (fallback slides), eğer mainnet TX gecikirse cut'a alternatif
- ElevenLabs voice: professional male voice (örn. "Adam"), 125-135 WPM tempo
- Background music: minimal tech (Artlist/Epidemic Sound), 50% volume ducked during narration
- Export: 1080p60 H.264, <500MB, YouTube unlisted + Loom backup

---

## Teknik PRD (Backend + Frontend)

### Sistem Mimarisi (yüksek seviye)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 16 App Router)             │
│  ┌─────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ Escrow  │  │  Insurance  │  │ Milestone  │  │ Authenticity │ │
│  │   App   │  │     App     │  │    App     │  │     App      │ │
│  └─────────┘  └─────────────┘  └────────────┘  └──────────────┘ │
│       ↓            ↓                 ↓               ↓           │
│  Shared UI Kit (shadcn + Framer Motion + custom design system)   │
│       ↓            ↓                 ↓               ↓           │
│  Wagmi + Viem + RainbowKit  |  SWR data layer  |  tRPC client    │
└─────────────────────────────────────────────────────────────────┘
                                  ↓  HTTPS
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND (Fastify on Hetzner, Node.js 20 LTS)       │
│                                                                 │
│  /api/assertions/*      /api/evidence/*     /api/verdict/*      │
│      ↓                       ↓                    ↓             │
│  Assertion Service   Evidence Service    Judgment Service       │
│      ↓                       ↓                    ↓             │
│  Postgres (self)     0G Storage SDK       0G Compute Broker     │
│  + Drizzle ORM       (upload/verify)      (TEE inference)       │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SMART CONTRACTS (0G Chain Mainnet)           │
│                                                                 │
│  AssertionRegistry.sol  |  VerdictEnforcer.sol                  │
│  EscalationManager.sol  |  ReputationRegistry.sol (ERC-7857)    │
│                                                                 │
│  Application kontratları:                                       │
│  Escrow.sol  |  ParametricInsurance.sol                         │
│  MilestoneVault.sol  |  AuthenticityCertifier.sol               │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                       0G INFRASTRUCTURE                          │
│                                                                 │
│  0G Chain (EVM)  |  0G Storage (evidence + reasoning)           │
│  0G Compute TEE (GLM-5, DeepSeek v3, Qwen3 — Sealed Inference)  │
└─────────────────────────────────────────────────────────────────┘
```

### Teknoloji Seçimi (motivasyonlu)

| Katman | Seçim | Neden |
|---|---|---|
| **Frontend framework** | Next.js 16 App Router (RSC + Server Actions) | RSC = SEO + fast initial load; production-grade; self-hostable |
| **Styling** | Tailwind CSS + shadcn/ui | Battle-tested, fast iteration, customizable |
| **Motion** | Framer Motion 11 | Demo video'da visible polish |
| **Web3** | Wagmi v2 + Viem + RainbowKit | 0G ethers v6 ile uyumlu; RainbowKit prod UX |
| **Data fetching** | SWR (client) + RSC (server) | SWR realtime refresh, RSC SEO |
| **Backend runtime** | Fastify (Node.js 20 LTS) on Hetzner | 0G SDK'ları native çalışır (polyfill yok); timeout sınırı yok; full control |
| **Database** | Postgres 16 (self-hosted, Docker) | Tek sunucu, tek stack; migration'lar Drizzle |
| **ORM** | Drizzle ORM | TypeScript-native, SQL-like, migration kit |
| **Smart contracts** | Solidity 0.8.24 + Hardhat (evmVersion: cancun) | 0G requirement |
| **Testing** | Vitest (unit) + Playwright (E2E) + Hardhat test | Comprehensive |
| **Observability** | Sentry (errors) + Plausible (analytics) + Grafana + Loki (logs) | Self-hosted observability stack |
| **Process manager** | PM2 (cluster mode) | Next.js ve Fastify için zero-downtime reload |
| **Reverse proxy** | Caddy 2 | Otomatik SSL (Let's Encrypt), HTTP/3, zero-config |
| **Containerization** | Docker Compose | Reproducibility, fresh-machine deploy README için kritik |
| **CI/CD** | GitHub Actions → SSH rsync + PM2 reload | Push-to-main auto deploy |
| **DNS + CDN + DDoS** | Cloudflare Free (proxy: ON) | SSL sandwich (Cloudflare↔Caddy), bot protection, cache static assets |
| **Domain** | Cloudflare Registrar (.xyz ~$1-3/yıl) | Markup yok, DNS entegre |
| **Deployment target** | 0G Mainnet (contracts) + Hetzner CX32 (web+api) | €6/ay, 2 vCPU, 8GB RAM |

**Infrastructure Topolojisi:**

```
Internet (users, judges)
       ↓
Cloudflare (DNS + proxy + DDoS + cache)
       ↓ HTTPS (Full Strict)
Hetzner CX32 (Ubuntu 24.04 LTS)
├── Caddy :443 ──── reverse proxy
│   ├── verdict.xyz          → Next.js :3000 (PM2)
│   ├── api.verdict.xyz      → Fastify :4000 (PM2)
│   └── grafana.verdict.xyz  → Grafana :3001 (basic auth)
├── Docker Compose
│   ├── postgres:16          :5432 (internal only)
│   ├── redis:7              :6379 (cache + BullMQ queue)
│   ├── grafana + loki       logs
│   └── judge-worker         BullMQ consumer (TEE inference jobs)
├── PM2 Processes
│   ├── web (Next.js)        cluster mode, 2 instances
│   ├── api (Fastify)        cluster mode, 2 instances
│   └── indexer (chain event watcher) single instance
└── System
    ├── ufw firewall         allow 22, 80, 443; deny rest
    ├── fail2ban             ssh brute-force protection
    └── systemd timer        daily postgres backup → Cloudflare R2
```

**Neden Redis + BullMQ:**
TEE inference 10-30 saniye sürer. HTTP request bekletmek kötü UX. Kullanıcı "dispute open" tıklar → API instant response döner → BullMQ'ya job atar → judge-worker arkaplanda çağrır → sonuç hazır olunca kullanıcıya **SSE ile stream edilir** (ReasoningStream component). Bu pattern demo'nun viral parçası.

### Frontend Teknik Detay

#### Dosya Yapısı
```
apps/web/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx                    # Landing page
│   │   ├── architecture/page.tsx       # Protocol architecture
│   │   └── docs/[...slug]/page.tsx     # MDX docs
│   ├── (app)/
│   │   ├── escrow/
│   │   │   ├── page.tsx                # Escrow list
│   │   │   ├── new/page.tsx            # Create escrow
│   │   │   └── [id]/
│   │   │       ├── page.tsx            # Escrow detail
│   │   │       ├── dispute/page.tsx    # Open dispute
│   │   │       └── verdict/page.tsx    # View verdict + appeal
│   │   ├── insurance/
│   │   │   ├── policies/page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/claim/page.tsx
│   │   ├── milestones/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── authenticity/
│   │       └── verify/page.tsx
│   ├── api/                            # Route handlers
│   │   ├── assertions/route.ts
│   │   ├── evidence/upload/route.ts
│   │   ├── verdict/[id]/stream/route.ts  # SSE
│   │   └── webhook/chain/route.ts        # Chain event ingestion
│   ├── layout.tsx
│   ├── providers.tsx                   # Wagmi + RainbowKit + Theme
│   └── globals.css
├── components/
│   ├── ui/                             # shadcn primitives
│   ├── verdict/                        # Verdict-specific
│   │   ├── AssertionCard.tsx
│   │   ├── ReasoningStream.tsx         # SSE-driven reasoning display
│   │   ├── EvidenceUploader.tsx
│   │   ├── OutcomeBadge.tsx
│   │   ├── JudgeAgentCard.tsx          # NFT showcase
│   │   └── AppealFlow.tsx
│   └── marketing/
├── lib/
│   ├── web3/
│   │   ├── chains.ts                   # 0G mainnet + testnet config
│   │   ├── contracts.ts                # Typed contract instances
│   │   └── hooks.ts                    # useAssertion, useEscrow, etc.
│   ├── storage/
│   │   └── client.ts                   # 0G Storage client (SSR-safe)
│   └── utils/
├── public/
│   ├── judge-agents/*.json             # Agent NFT metadata
│   └── og/*                            # Open Graph images
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

#### Kritik Frontend Bileşenleri

**1. ReasoningStream.tsx — Demo'nun viral parçası**
- SSE endpoint'inden gelen tokenları akışkan yazar (typewriter effect)
- GLM-5 chain-of-thought'ı kullanıcı real-time görür
- Framer Motion ile her cümlenin altında "kaynak kanıt" chip'i

**2. EvidenceUploader.tsx**
- Drag & drop
- Client-side 0G Storage yükleme (wallet imza)
- Progress: merkle tree → upload → chunking → complete
- Root hash otomatik clipboard

**3. AppealFlow.tsx**
- 3 agent icon (GLM-5, DeepSeek, Qwen3)
- Her biri paralel reasoning
- Majority vote animation

**4. Onboarding Tour (Shepherd.js veya custom)**
- İlk ziyarette 6 adım: wallet connect → faucet → select app → create case → upload evidence → get verdict
- Video mode: otomatik geçer (demo video için)

#### Responsive Design
- Tüm sayfalar 320px → 2560px aralığında çalışır
- Mobile-first: önemli CTA'lar alt sticky
- Tablet: 2-col → 3-col grid
- Dark mode default, light mode switcher

### Backend Teknik Detay

#### Servisler

**1. Assertion Service** (`apps/api/src/services/assertion.ts`)
- `createAssertion(data)` — onchain kontrata TX + DB'ye kayıt
- `getAssertion(id)` — DB + chain sync
- `listAssertions(filters)` — pagination, filter
- `subscribeToAssertion(id)` — SSE stream

**2. Evidence Service** (`apps/api/src/services/evidence.ts`)
- `uploadEvidence(file, assertionId)` — `skills/storage/upload-file` skill'i kullanır
  - Reuses: `/Users/selahattin/repos/0g/.0g-skills/skills/storage/upload-file/SKILL.md` pattern
  - `ZgFile.fromFilePath()` → `merkleTree()` → `indexer.upload()` → `file.close()` (finally)
- `verifyEvidence(rootHash)` — `skills/storage/merkle-verification` skill'i
- Evidence metadata (mime, size, uploader) DB'de

**3. Judgment Service** (`apps/api/src/services/judgment.ts`) — PROJENİN BEYNI
- `judge(assertionId)`:
  1. `broker = await createZGComputeNetworkBroker(wallet)` (singleton)
  2. `listService()` → filter TEE-verified GLM-5 provider
  3. `acknowledgeProviderSigner()` (once, cached)
  4. Evidence'ları 0G Storage'tan download → transcript oluştur
  5. System prompt + user prompt (structured reasoning)
  6. `fetch(endpoint + /chat/completions, { stream: true })`
  7. **KRİTİK:** `processResponse(providerAddress, chatID, usageData)` — `/Users/selahattin/repos/0g/.0g-skills/skills/compute/streaming-chat/SKILL.md` pattern
  8. Reasoning log → 0G Storage'a yükle → root hash al
  9. Parse edilmiş outcome (TRUE/FALSE/INVALID) + reasoning hash → `AssertionRegistry.submitVerdict()` TX
- `appealJudgment(assertionId)`:
  1. 3 farklı provider (GLM-5, DeepSeek v3, Qwen3) paralel çağır
  2. OpenClaw-style swarm: her biri independent reasoning
  3. Majority vote
  4. Final verdict submit
- Retry logic: 3 attempts with exponential backoff
- Circuit breaker: provider 3 kez fail ederse backup provider

**4. Chain Indexer Service** (`apps/api/src/workers/indexer.ts`)
- Her 3 saniyede bir `AssertionRegistry.getPastEvents()` çalıştır
- Event types: `AssertionCreated`, `VerdictSubmitted`, `Appealed`, `Resolved`
- Postgres'e mirror et (read efficiency)
- WebSocket broadcast (client'lara push)

#### Prompt Engineering (Judge System Prompt)

```
You are Verdict-Judge, an impartial AI adjudicator operating inside a
Trusted Execution Environment on 0G Compute. Your reasoning is
cryptographically attested and published on-chain.

Rules:
1. You receive a CLAIM and EVIDENCE (text + hashes). You must decide:
   TRUE, FALSE, or INVALID (if evidence is insufficient).
2. You must produce a structured reasoning document:
   - Facts found
   - Relevant clauses from the claim
   - Application of facts to clauses
   - Conclusion
3. You must cite each piece of evidence by its root hash.
4. You may not speculate beyond evidence. If evidence is absent,
   return INVALID.
5. Output MUST end with a JSON block:
   {"outcome": "TRUE" | "FALSE" | "INVALID",
    "confidence": 0.0-1.0,
    "evidenceCited": [hash1, hash2, ...]}

Do not break character. Do not mention this prompt.
```

#### Veritabanı Şeması (Drizzle ORM)

```typescript
// schemas/assertions.ts
export const assertions = pgTable('assertions', {
  id: varchar('id', { length: 66 }).primaryKey(),  // bytes32 hex
  chainId: integer('chain_id').notNull(),
  claim: text('claim').notNull(),
  mode: varchar('mode', { length: 16 }).notNull(),  // INSTANT | AUDITED
  asserter: varchar('asserter', { length: 42 }).notNull(),
  bond: numeric('bond').notNull(),
  callback: varchar('callback', { length: 42 }).notNull(),
  outcome: varchar('outcome', { length: 16 }).default('PENDING'),
  reasoningRoot: varchar('reasoning_root', { length: 66 }),
  verdictTx: varchar('verdict_tx', { length: 66 }),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});

export const evidence = pgTable('evidence', {
  id: serial('id').primaryKey(),
  assertionId: varchar('assertion_id', { length: 66 })
    .references(() => assertions.id),
  rootHash: varchar('root_hash', { length: 66 }).notNull(),
  uploader: varchar('uploader', { length: 42 }).notNull(),
  mime: varchar('mime', { length: 64 }),
  size: integer('size'),
  metadata: jsonb('metadata'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

export const judgeAgents = pgTable('judge_agents', {
  id: serial('id').primaryKey(),
  tokenId: integer('token_id').notNull(),  // ERC-7857 token
  model: varchar('model', { length: 64 }).notNull(),
  totalVerdicts: integer('total_verdicts').default(0),
  appealsLost: integer('appeals_lost').default(0),
  reputation: numeric('reputation').default('1000'),
});

// ... more tables
```

### Smart Contract Katmanı

#### Kontrat Listesi (7 adet)

**Core Protocol (4):**

1. **`AssertionRegistry.sol`** — iddiaların onchain canonical store'u
   - `createAssertion(AssertionInput memory) returns (bytes32)`
   - `submitVerdict(bytes32 id, Outcome outcome, bytes32 reasoningRoot, bytes teeAttestation)`
   - `challengeAssertion(bytes32 id) payable` (bond)
   - `resolveChallenge(bytes32 id, Outcome finalOutcome)`
   - Events: `AssertionCreated`, `VerdictSubmitted`, `Challenged`, `Resolved`

2. **`VerdictEnforcer.sol`** — onchain callback dispatcher
   - Outcome'a göre `callback.call(callbackSelector, data)` çağırır
   - Escrow / Insurance kontratları buradan tetiklenir

3. **`EscalationManager.sol`** — challenge + appeal flow
   - Bond'lar
   - Appeal queue
   - Slashing (kaybeden appeal bond kaybeder)

4. **`ReputationRegistry.sol`** — ERC-7857 Agent ID (judge NFT)
   - Her judge agent bir NFT
   - Token URI: verdicts count, reputation score, model name
   - Non-transferable at v1 (soulbound) OR transferable (post-hackathon)

**Application Contracts (3):**

5. **`Escrow.sol`** — freelance dispute demo app
   - `createEscrow(freelancer, token, amount, scope, deadline)`
   - `deliver(bytes32 evidenceRoot)`
   - `accept()` | `openDispute(bytes32 evidenceRoot)`
   - `respondToDispute(bytes32 evidenceRoot)`
   - `onVerdict(Outcome)` — VerdictEnforcer callback

6. **`ParametricInsurance.sol`** — insurance demo app
   - `createPolicy(params, premium)` payable
   - `claim(bytes32 evidenceRoot)` — creates assertion
   - `onVerdict(Outcome)` — otomatik payout

7. **`MilestoneVault.sol`** — DAO grant milestone app
   - `createGrant(recipient, totalAmount, milestones[])`
   - `submitMilestone(uint index, bytes32 evidenceRoot)`
   - `onVerdict(Outcome)` — partial release

**ERC-792 Uyum Katmanı:**
- `AssertionRegistry` implements IArbitrator
- `Escrow` + application kontratları implement IArbitrable
- Böylece Kleros-uyumlu dApp'ler Verdict'i drop-in olarak entegre edebilir

#### Deploy Sırası
1. ReputationRegistry (independent)
2. AssertionRegistry
3. EscalationManager → AssertionRegistry dep
4. VerdictEnforcer → AssertionRegistry dep
5. Escrow / Insurance / Milestone → VerdictEnforcer dep

### 0G Entegrasyon Noktaları (skill referansları)

| Operation | Skill Referansı | Kritik Kural |
|---|---|---|
| Evidence upload | `skills/storage/upload-file/SKILL.md` | `file.close()` in `finally`; merkle tree before upload |
| Evidence verify | `skills/storage/download-file/SKILL.md` + `merkle-verification/SKILL.md` | Verified download (3rd param true); try/catch AND check err |
| TEE provider discovery | `skills/compute/provider-discovery/SKILL.md` | `s[10] === true` filter; acknowledge once |
| Account funding | `skills/compute/account-management/SKILL.md` | `getLedger()[2]` for available; transferFund per service |
| GLM-5 judgment call | `skills/compute/streaming-chat/SKILL.md` | **processResponse(providerAddress, chatID, usageData)** param order |
| Reasoning save | `skills/cross-layer/compute-plus-storage/SKILL.md` | generate → temp → upload → cleanup |
| Onchain anchor | `skills/cross-layer/storage-plus-chain/SKILL.md` | Register root hash post-upload |
| Contract deploy | `skills/chain/deploy-contract/SKILL.md` | `evmVersion: "cancun"`, ethers v6 |
| Contract call | `skills/chain/interact-contract/SKILL.md` | v6 syntax; `tx.wait()` |

### Network Config

```bash
# .env (backend + contracts)
CHAIN_ID=16661                               # Mainnet (Aristotle)
RPC_URL=https://evmrpc.0g.ai
STORAGE_INDEXER=https://indexer-storage-turbo.0g.ai
PRIVATE_KEY=0x...                            # Backend hot wallet (funded)

# Testnet (development)
CHAIN_ID=16602                               # Galileo
RPC_URL=https://evmrpc-testnet.0g.ai
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai

# Compute providers (discovered at runtime, cached)
GLM5_PROVIDER=0x...                          # From listService()
DEEPSEEK_PROVIDER=0x...
QWEN3_PROVIDER=0x...

# Frontend
NEXT_PUBLIC_VERDICT_REGISTRY=0x...           # Post-deploy
NEXT_PUBLIC_ESCROW=0x...
NEXT_PUBLIC_INSURANCE=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_API_URL=https://api.verdict.xyz

# Infrastructure (self-hosted on Hetzner)
DATABASE_URL=postgres://verdict:***@127.0.0.1:5432/verdict
REDIS_URL=redis://127.0.0.1:6379
SENTRY_DSN=...
PLAUSIBLE_DOMAIN=verdict.xyz

# Backup destination (Cloudflare R2 free tier)
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
R2_BUCKET=verdict-backups
```

---

## Faz Faz Uygulama Planı (22 Gün)

### FAZ 0 — Setup & Validation (2 gün: Day 1-2) [Apr 25-26]

**Day 1 — Foundation**
- [ ] Monorepo init (pnpm + turbo): `apps/web`, `apps/api`, `apps/contracts`, `packages/shared`
- [ ] `.0g-skills/` referans olarak hazır
- [ ] `.env` template + testnet wallet funded (faucet)
- [ ] Git + Github repo public (hackathon requirement)
- [ ] CI scaffold (GitHub Actions: lint + typecheck + test)
- [ ] Storybook init (component catalog)

**Day 2 — 0G Compute TEE Hello-World (CRITICAL VALIDATION)**
- [ ] Scaffold from `skills/chain/scaffold-project`
- [ ] Run `skills/compute/provider-discovery` → confirm TEE providers
- [ ] Run `skills/compute/streaming-chat` hello world with GLM-5
- [ ] **Risk gate:** TEE inference çalışıyorsa → Verdict plan devam. Çalışmıyorsa → pivot (Guard'a).
- [ ] Benchmark: single judgment latency (target < 15s)

### FAZ 1 — Protocol (Smart Contracts) (4 gün: Day 3-6)

**Day 3 — Core Contracts**
- [ ] `AssertionRegistry.sol` full implementation
- [ ] `ReputationRegistry.sol` (ERC-7857)
- [ ] 30+ unit tests (Hardhat + Chai)

**Day 4 — Enforcement & Escalation**
- [ ] `VerdictEnforcer.sol`
- [ ] `EscalationManager.sol`
- [ ] Cross-contract integration tests

**Day 5 — Application Contracts**
- [ ] `Escrow.sol`
- [ ] `ParametricInsurance.sol`
- [ ] `MilestoneVault.sol`
- [ ] `AuthenticityCertifier.sol`

**Day 6 — Testnet Deploy + Audit Pass**
- [ ] Deploy all 7 contracts to 0G Testnet (Galileo)
- [ ] Verify on chainscan-galileo
- [ ] Slither + Mythril static analysis pass
- [ ] Gas profiling
- [ ] Fix criticals

### FAZ 2 — Backend (Judgment Engine) (4 gün: Day 7-10)

**Day 7 — Backend Skeleton**
- [ ] Fastify app init (Node.js 20 LTS)
- [ ] Local Docker Postgres + Redis (development parity with production)
- [ ] Drizzle schema + migrations
- [ ] Contract type generation (wagmi CLI)
- [ ] Wallet management (backend signer)
- [ ] BullMQ queue init (judge-worker skeleton)

**Day 8 — Storage Service**
- [ ] `evidenceUpload()` implementation (reuse upload-file skill)
- [ ] `evidenceVerify()` (reuse merkle-verification)
- [ ] Mime/size validation, antivirus scan stub
- [ ] Rate limiting

**Day 9 — Judgment Service (CORE)**
- [ ] `judge()` pipeline end-to-end:
  - provider discovery + cache
  - evidence download
  - prompt construction
  - GLM-5 TEE call with processResponse
  - reasoning save to Storage
  - verdict submit TX
- [ ] SSE endpoint for streaming reasoning
- [ ] Error handling + retry
- [ ] Integration test: real testnet inference

**Day 10 — Appeal (Multi-Agent)**
- [ ] Parallel 3-agent invocation
- [ ] Voting aggregation
- [ ] Divergence logging
- [ ] Chain Indexer worker (ingest events)

### FAZ 3 — Frontend (Escrow App — Primary) (4 gün: Day 11-14)

**Day 11 — Foundation + Landing Page**
- [ ] Next.js 16 + Tailwind + shadcn setup
- [ ] Design system tokens (color, type, motion)
- [ ] Landing page with hero, architecture diagram, use-case tabs
- [ ] Marketing copy iteration

**Day 12 — Wallet + Shared Infra**
- [ ] Wagmi + RainbowKit + 0G chain config
- [ ] Contract ABI typed hooks
- [ ] Transaction toast system
- [ ] Dark/light mode
- [ ] Error boundary + global loading

**Day 13 — Escrow Flow (Happy Path)**
- [ ] List + Detail pages
- [ ] Create escrow form (scope + amount + deadline)
- [ ] Deliver flow (evidence uploader)
- [ ] Accept + auto-release

**Day 14 — Dispute + Verdict UI**
- [ ] Open dispute form
- [ ] Respond to dispute form
- [ ] **ReasoningStream component** (SSE typewriter) ← demo anı
- [ ] Verdict card with outcome + reasoning link
- [ ] Appeal button + AppealFlow component

### FAZ 4 — Secondary Apps (3 gün: Day 15-17)

4 app demo'da gösterileceğinden her biri production kalite. Escrow (primary) Day 11-14'te tamamlandığı için bu fazda diğer 3'ü yapılır.

**Day 15 — Insurance App (Parametric)**
- [ ] Policy creation UI (parametre tanımlama: koşul + payout)
- [ ] Real external API integration: AviationStack free tier (flight status) — mock DEĞİL
- [ ] Policy registry + premium escrow kontratları
- [ ] Claim flow (one-click, trigger Verdict agent)
- [ ] Stopwatch telemetry (demo için)

**Day 16 — Milestone Vault (DAO) + Authenticity Certifier**
- [ ] DAO grant creation UI (milestone list + acceptance criteria)
- [ ] Milestone submission flow (evidence root + trigger verdict)
- [ ] Partial release on verdict TRUE
- [ ] Authenticity app: vision-based check (Qwen3-VL 30B)
- [ ] Perceptual hash + metadata cross-reference
- [ ] ERC-7857 attestation NFT mint

**Day 17 — Cross-App Features + Pre-Record**
- [ ] Unified dashboard (all 4 apps in one view)
- [ ] Judge Agent gallery (NFT reputation leaderboard with verdicts count)
- [ ] Transaction history page (filter by app)
- [ ] **Pre-record** 4 demo scenario'ları (testnet'te, video için raw footage)

### FAZ 5 — Polish + Mainnet Deploy (3 gün: Day 18-20)

**Day 18 — Mainnet Deploy**
- [ ] Final contract audit pass
- [ ] Deploy all 7 contracts to 0G Mainnet (Aristotle)
- [ ] Verify on chainscan.0g.ai
- [ ] Record mainnet contract addresses
- [ ] Fund backend wallet with mainnet 0G
- [ ] End-to-end test on mainnet (create → dispute → verdict → payout)

**Day 19 — UX Polish**
- [ ] Framer Motion micro-animations across all interactive elements
- [ ] Empty states, loading skeletons, error states for every view
- [ ] Onboarding tour
- [ ] Mobile responsive pass
- [ ] Accessibility audit (WCAG AA)
- [ ] SEO metadata + Open Graph

**Day 20 — Production Infrastructure**
- [ ] Hetzner CX32 provision (Ubuntu 24.04 LTS)
- [ ] Initial hardening: `ufw`, `fail2ban`, ssh key-only, automatic security updates
- [ ] Docker + Docker Compose install
- [ ] Node.js 20 LTS + PM2
- [ ] Caddy install + initial Caddyfile (verdict.xyz + api.verdict.xyz)
- [ ] Cloudflare DNS A record → Hetzner IP; proxy ON
- [ ] Domain (Cloudflare Registrar) `.xyz` al ve bağla
- [ ] GitHub Actions deploy pipeline (build → rsync → `pm2 reload`)
- [ ] Postgres seed + daily backup cron (→ Cloudflare R2 free tier)
- [ ] Sentry + Plausible live
- [ ] Grafana + Loki internal dashboards
- [ ] Load test (k6) — 100 concurrent verdict requests; target p95 < 15s
- [ ] Disaster recovery docs (fresh-server deploy + restore from backup)

### FAZ 6 — Demo Video + Submission (2 gün: Day 21-22)

**Day 21 — Video Production (Solo + ElevenLabs)**
- [ ] Record 4 mainnet runs (Escrow, Insurance, Milestone, Authenticity) — real TXs
- [ ] Backup slides for each app (PNG) in case live capture fails mid-edit
- [ ] Write final narration script (130 WPM, 3dk = ~390 kelime, mevcut script yaklaşık bu aralıkta)
- [ ] ElevenLabs pro voice generation (Adam veya benzer) — iterate 3-5 kez
- [ ] Motion graphics: Framer Motion components record + After Effects logo reveal
- [ ] Background music: Artlist veya Epidemic Sound (minimal tech, lisanslı)
- [ ] Edit in DaVinci Resolve (free) veya Descript
- [ ] Color grade + audio leveling
- [ ] Export 1080p60 H.264 <500MB
- [ ] Upload YouTube (unlisted) + Loom (backup link)

**Day 22 — Submission Package**
- [ ] README finalization (EN + TR)
- [ ] Architecture diagram export
- [ ] Test account seed with faucet link
- [ ] Reproduce steps verified on fresh machine
- [ ] HackQuest submission:
  - [ ] Project info
  - [ ] GitHub link
  - [ ] Mainnet contract address(es) + Explorer link
  - [ ] 0G components checked: Storage + Compute + Chain + Agent ID + Privacy
  - [ ] Grand Prize + Excellence + Community tracks checked
  - [ ] Demo video link
  - [ ] X post published (with required hashtags + tags)
  - [ ] X post link submitted
- [ ] Telegram announcement to 0G community
- [ ] Final commit + tag v1.0.0

---

## Risk Burn-Down

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TEE endpoint flaky/slow on 0G Compute | Orta | Yüksek | Day 2 gate test; backup to OpenAI API for local dev only (not demo) |
| GLM-5 latency > 30s | Orta | Orta | Multi-agent swarm can parallelize; optimize prompt |
| ERC-7857 spec unstable | Düşük | Düşük | v1 ship as soulbound ERC-721; upgrade path post-hackathon |
| Mainnet gas surprises | Düşük | Orta | Faz 1 sonrası gas profiling |
| Solo burnout | Orta | Yüksek | Day 15'te arkadaş check — motion designer/video editor çağır; strictly 8h/day cap Day 1-14 |
| Evidence upload size limits | Düşük | Düşük | 50MB cap + chunking fallback |
| Scope creep | Yüksek | Yüksek | "Secondary app"lar minimal — focus Escrow fidelity |

---

## Doğrulama / Test Planı

**Kontrat seviyesi (Hardhat + Chai):**
- 150+ unit test, %90+ line coverage
- Fuzz tests (Foundry optional if time permits)
- Revert case coverage

**Backend seviyesi (Vitest):**
- Unit tests (mock 0G SDKs, reuse `patterns/TESTING.md` mocks)
- Integration tests on testnet (`RUN_INTEGRATION=1`)
- E2E: create assertion → judge → verdict → callback

**Frontend seviyesi (Playwright):**
- Happy path per app (4 apps × 1 test)
- Dispute + verdict flow
- Appeal flow
- Mobile viewport tests

**End-to-End Manual:**
- [ ] Fresh browser, Metamask, testnet wallet → tam escrow flow → verdict received
- [ ] Same on mainnet
- [ ] 3 farklı persona hesabı (Alice, Bob, DAO) ile parallel stress test

**Demo verification:**
- [ ] Video showcases mainnet TX (etherscan'de görünür)
- [ ] README'deki "reproduce steps" fresh machine'de çalışır (Docker Compose ideal)

**Submission checklist (HackQuest form):**
- [ ] Contract address doğru formatta
- [ ] GitHub linki public
- [ ] X post hashtag'ler + tag'ler dahil: #0GHackathon #BuildOn0G @0G_labs @0g_CN @0g_Eco @HackQuest_
- [ ] Demo video < 3dk
- [ ] README EN (bonus: TR)

---

## Kritik Dosyalar — Reuse Referansları

Bu planda tekrar yazmayacağım, mevcut skills'i çağıracağım:

| Kullanım | Dosya |
|---|---|
| Evidence upload pattern | `/Users/selahattin/repos/0g/.0g-skills/skills/storage/upload-file/SKILL.md` |
| Evidence download + verify | `/Users/selahattin/repos/0g/.0g-skills/skills/storage/download-file/SKILL.md` + `merkle-verification/SKILL.md` |
| Provider discovery | `/Users/selahattin/repos/0g/.0g-skills/skills/compute/provider-discovery/SKILL.md` |
| Account + ledger | `/Users/selahattin/repos/0g/.0g-skills/skills/compute/account-management/SKILL.md` |
| GLM-5 TEE inference (core!) | `/Users/selahattin/repos/0g/.0g-skills/skills/compute/streaming-chat/SKILL.md` |
| Cross-layer pipelines | `/Users/selahattin/repos/0g/.0g-skills/skills/cross-layer/compute-plus-storage/SKILL.md` |
| Onchain anchor | `/Users/selahattin/repos/0g/.0g-skills/skills/cross-layer/storage-plus-chain/SKILL.md` |
| Hardhat setup | `/Users/selahattin/repos/0g/.0g-skills/skills/chain/deploy-contract/SKILL.md` |
| Contract interaction | `/Users/selahattin/repos/0g/.0g-skills/skills/chain/interact-contract/SKILL.md` |
| Network config | `/Users/selahattin/repos/0g/.0g-skills/patterns/NETWORK_CONFIG.md` |
| Compute deep-dive | `/Users/selahattin/repos/0g/.0g-skills/patterns/COMPUTE.md` |
| Security patterns | `/Users/selahattin/repos/0g/.0g-skills/patterns/SECURITY.md` |
| Test patterns | `/Users/selahattin/repos/0g/.0g-skills/patterns/TESTING.md` |

---

## Son Not

**No-MVP prensibi:** Her feature production kalite. Her empty state, loading state, error state manuel tasarlanmış. Her kontrat audit geçmiş. Her API endpoint rate-limited + logged. 22 gün sonunda **canlı mainnet deploy + gerçek TX geçmişi + 3dk profesyonel video + fresh-machine-reproduce README**.

**Success metric:** Submission package jüriye şöyle görünmeli: *"Bu solo 22 günde yapılamaz."*
