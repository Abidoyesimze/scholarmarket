# Onboarding Guide

Welcome to ScholarMarket! This guide will help you understand the project, set up your development environment, and make your first contribution.

## What is ScholarMarket?

ScholarMarket is an educational content marketplace that helps educators, students, and creators publish, license, sell, and manage access to learning materials. It combines a modern Next.js application with IPFS-backed file storage and a planned Stellar/Soroban payment layer for low-cost transactions.

## Repository Structure

Here is an overview of the top-level directories and key files:

```
scholarmarket/
├── src/                  # Main application source code
│   ├── app/              # Next.js App Router pages and API routes
│   ├── components/       # React UI components (Navbar, Cart, Dashboard, etc.)
│   ├── hooks/            # Custom React hooks (useCart, useWallet, etc.)
│   ├── lib/              # Core business logic and utilities
│   │   ├── api/          # API client helpers
│   │   ├── auth/         # Authentication and session logic
│   │   ├── db/           # Database connection and models
│   │   ├── ipfs/         # IPFS/Pinata upload utilities
│   │   ├── stellar/      # Stellar SDK integration
│   │   ├── indexer/      # Soroban event indexer logic
│   │   └── ...
│   ├── providers/        # React context providers
│   ├── services/         # External service integrations
│   └── utils/            # General-purpose utility functions
├── components/           # Legacy standalone components (FAQ, modals)
├── contracts/            # Legacy EVM contract ABI (archived)
├── soroban/              # Soroban smart contracts (Rust)
│   └── contracts/        # Individual Soroban contract crates
├── scripts/              # Operational and maintenance scripts
├── tests/                # Backend and component tests
│   ├── backend/          # Node.js backend test suite
│   └── components/       # React component tests
├── test/                 # Vitest integration tests and fixtures
├── docs/                 # Project documentation
├── public/               # Static assets
├── .github/workflows/    # CI/CD pipeline definitions
├── package.json          # Dependencies and scripts
├── hardhat.config.cjs    # Hardhat config for contract tests
├── vitest.config.mjs     # Vitest configuration
├── eslint.config.mjs     # ESLint configuration
└── docker-compose.yml    # Docker services (MongoDB)
```

### Key directories explained

| Directory | What it contains |
| --- | --- |
| `src/app/` | Next.js pages (`page.js`) and API routes (`api/`) organized by feature (marketplace, dashboard, creator, etc.) |
| `src/components/` | Reusable React components for the UI — navbar, cart drawer, checkout, upload forms, wallet buttons |
| `src/lib/` | Backend business logic — database access, auth, Stellar integration, IPFS pinning, email, caching |
| `src/hooks/` | Custom React hooks for cart, wallet, comparison, toast notifications, theme preferences |
| `soroban/contracts/` | Rust-based Soroban smart contracts (`material-registry`, `purchase-manager`) |
| `scripts/` | Operational scripts for backups, secret scanning, indexer, dead-letter reprocessing |
| `tests/` | Backend API tests, component tests, load tests |
| `docs/` | Architecture docs, contribution guide, user flows, API contracts, deployment guides |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | Next.js API route handlers, JWT sessions |
| Database | MongoDB |
| File Storage | Pinata / IPFS |
| Blockchain | Stellar, Soroban (Rust contracts) |
| Testing | Vitest, Node.js test runner, Hardhat (contracts) |
| Linting | ESLint |

## Getting Started

### Prerequisites

- **Node.js 20+**
- **npm 10+** or pnpm
- **Docker** (optional, for running MongoDB locally)
- **Git**

### 1. Fork and clone the repository

```bash
git clone https://github.com/<your-username>/scholarmarket.git
cd scholarmarket
git remote add upstream https://github.com/ScholarMarket/scholarmarket.git
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

At minimum, set these variables in `.env.local`:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | `mongodb://localhost:27017/scholarmarket` |
| `JWT_SECRET` | Any long random string |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

Leave `PINATA_JWT` and `NEXT_PUBLIC_GATEWAY_URL` blank for now if you do not have Pinata credentials — the core UI will still work.

### 4. Start MongoDB

```bash
docker compose up -d mongodb
```

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Branching Strategy

We use short, descriptive branch names prefixed with a category:

| Prefix | Use case | Example |
| --- | --- | --- |
| `feat/` | New features | `feat/dark-mode-toggle` |
| `fix/` | Bug fixes | `fix/cart-quantity-validation` |
| `docs/` | Documentation changes | `docs/onboarding-guide` |
| `chore/` | Tooling, CI, dependencies | `chore/update-eslint` |
| `test/` | Adding or fixing tests | `test/upload-route-coverage` |

### Workflow

1. **Sync with upstream** before starting work:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```
2. **Create a branch** for your change:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Make your changes**, keeping commits focused and atomic.
4. **Run checks** before pushing (see below).
5. **Push and open a pull request** against `main`.

## Running Checks Before Submitting

Run the most relevant checks for your changes:

```bash
# Linting
npm run lint

# Full test suite
npm test

# Backend tests
npm run test:backend

# Contract tests
npm run test:contracts

# Secret scanning
npm run scan:secrets
```

For UI changes, manually verify the affected page at both desktop and mobile widths. Include screenshots in your pull request.

## Pull Request Checklist

- [ ] The PR title clearly describes the change
- [ ] The PR body explains what changed and why
- [ ] Relevant tests pass (`npm test`, `npm run test:backend`, etc.)
- [ ] Lint passes (`npm run lint`)
- [ ] Screenshots are attached for visible UI changes
- [ ] New environment variables are documented in `.env.example`
- [ ] Documentation is updated if workflows, APIs, or setup steps changed

## Good First Issues

These are great areas for new contributors to start:

- **Frontend UI improvements** — loading states, dark mode, search UX, responsive layouts
- **Documentation** — improving guides, adding examples, clarifying setup steps
- **Testing** — adding test coverage for components and API routes
- **Backend helpers** — health check endpoints, error response standardization, logging

Browse all open issues on the [GitHub Issues page](https://github.com/ScholarMarket/scholarmarket/issues) and look for the `community` or `documentation` labels for beginner-friendly tasks.

## Community and Discussion

- **GitHub Issues**: [ScholarMarket/scholarmarket/issues](https://github.com/ScholarMarket/scholarmarket/issues) — report bugs, request features, ask questions
- **Pull Requests**: [ScholarMarket/scholarmarket/pulls](https://github.com/ScholarMarket/scholarmarket/pulls) — review and contribute code
- **Maintainer**: [favouronyinye](https://github.com/favouronyinye)

## Useful Documentation

- [Architecture Overview](architecture.md) — system design and data flows
- [Environment Setup](environment-setup.md) — detailed environment configuration
- [Project Workflows](project-workflows.md) — creator, learner, and marketplace flows
- [User Flows](user-flows.md) — step-by-step user journeys
- [Contribution Guide](contributing.md) — coding guidelines and PR process
- [Backend Contracts](backend-contracts.md) — API request/response contracts
- [Stellar Integration](stellar-integration.md) — blockchain integration details

## Need Help?

If you get stuck:

1. Check the [existing documentation](#useful-documentation) first.
2. Search [open issues](https://github.com/ScholarMarket/scholarmarket/issues) for similar questions.
3. Open a new issue describing your problem with reproduction steps and screenshots if applicable.
4. Tag your issue with `community` to get attention from other contributors.

Welcome aboard — we are excited to have you contributing to ScholarMarket!
