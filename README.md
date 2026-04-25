# GymFinder Loyalty — DMBLOCK Assignment 2

A decentralized loyalty system for gym chains. Members earn ERC-20 points on every check-in and redeem them for ERC-1155 reward tokens in the on-chain shop. The platform is split into two independently deployable web apps.

## Architecture overview

```
loyalty.gymfinder.sk          branch.gymfinder.sk
┌─────────────────────┐       ┌──────────────────────────────────┐
│   Admin (Next.js)   │       │   Branch (Next.js)               │
│                     │       │                                  │
│  • Platform stats   │       │  • Member landing & QR code      │
│  • Deploy branches  │       │  • Self-registration (MetaMask)  │
│  • Update fees      │       │  • Shop & redemption (MetaMask)  │
│  • Collect treasury │       │  • Operator scanner (PIN→JWT)    │
└──────┬──────────────┘       └──────┬───────────────────────────┘
       │ MetaMask                    │ MetaMask (members/owner)
       │                             │ Operator private key (server)
       ▼                             ▼
┌──────────────────────────────────────────┐
│           Ethereum / Sepolia             │
│                                          │
│  GymFinderFactory  ←──deploys──┐         │
│  LoyaltyToken (ERC-20)         │         │
│  PaymentSplitter               │         │
│  GymBranch (per gym)    ───────┘         │
│  ShopProduct (ERC-1155, per gym)         │
└──────────────────────────────────────────┘
```

Full component diagram: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Smart contracts

| Contract | Description |
|---|---|
| `GymFinderFactory` | Deployed once. Deploys GymBranch + ShopProduct pairs, manages platform fee and treasury. |
| `LoyaltyToken` | Global ERC-20 (0 decimals). Minted on check-in, burned on redemption. |
| `PaymentSplitter` | Splits monthly gym fees between the gym owner and the platform treasury. |
| `GymBranch` | One per gym. Members, operators, check-in rate-limit, subscription, shop delegation. |
| `ShopProduct` | ERC-1155 per gym. Each token ID is a product type; minting = on-chain redemption proof. URI: `loyalty.gymfinder.sk/metadata/{branch}/{tokenId}` |

## Deployed contract

| Network | Address | Explorer |
|---|---|---|
| Sepolia | *(fill in after deployment)* | *(fill in)* |

## Setup

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)
- MetaMask browser extension

### Install

```bash
pnpm install
```

### Local development

```bash
# Terminal A — start local Hardhat node (chainId 31337)
pnpm --filter @zadanie-defi/contracts run node

# Terminal B — deploy contracts to local node
pnpm deploy:local

# Sync deployment JSON into both frontends
pnpm sync:abi

# Terminal C — admin app (http://localhost:3000)
pnpm dev:admin

# Terminal D — branch app (http://localhost:3001)
pnpm dev:branch
```

In MetaMask: import a funded Hardhat account (`0xac0974…`), add network RPC `http://127.0.0.1:8545` chainId `31337`.

### Branch app environment

Copy `packages/branch/.env.example` to `packages/branch/.env` and fill in:

```bash
NEXT_PUBLIC_BRANCH_ADDRESS=0x...   # deployed GymBranch address

# Operator key — signs check-in txs server-side, never exposed to browser
OPERATOR_PRIVATE_KEY=0x...

# bcrypt hash of the 4-digit operator PIN
# Generate: node -e "require('bcryptjs').hash('1234',10).then(console.log)"
OPERATOR_PIN_HASH=$2b$10$...

JWT_SECRET=change-this-to-a-random-secret
```

### Tests

```bash
pnpm test       # all contract tests
pnpm coverage   # coverage report
```

### Deploy to Sepolia

1. Copy `.env.example` to `.env` and fill in `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`.
2. `pnpm deploy:sepolia`
3. The script waits for confirmations and runs Etherscan verification automatically.
4. `pnpm sync:abi` to push addresses to both frontends.

### Docker

```bash
# Admin app
docker build -f packages/admin/Dockerfile -t gymfinder-admin .
docker run -p 3000:3000 gymfinder-admin

# Branch app (set env vars as needed)
docker build -f packages/branch/Dockerfile -t gymfinder-branch .
docker run -p 3001:3001 --env-file packages/branch/.env gymfinder-branch
```

Or use docker-compose for a self-contained local demo:

```bash
docker compose up
```

## How check-in works (QR flow)

1. Member opens `/points` on the branch app → their wallet address is rendered as a QR code.
2. Operator opens `/operator/scanner` (PIN-protected, 4-digit code → 8-hour JWT session).
3. Operator camera scans the QR code.
4. The browser sends `POST /api/scanner/checkin` with the decoded wallet address.
5. The Next.js API route reads `OPERATOR_PRIVATE_KEY` from the server environment, signs and broadcasts `GymBranch.checkIn(memberAddress)`.
6. The contract mints `loyaltyPointsPerVisit` GFP tokens to the member.
7. The scanner page shows a confirmation with the transaction hash.

The operator key never touches the browser. The JWT prevents unauthorized access to the scanner endpoint.

## Known limitations

- No upgrade mechanism on contracts; redeploying means a new address and re-syncing the JSON.
- MetaMask is the only wallet integration.
- The branch Dockerfile is not yet written (admin Dockerfile is inherited from the scaffold).
- `docker-compose.yml` requires manually running `deploy:local` before the frontends start.

## AI tool usage

This project was built with assistance from **Claude Sonnet 4.6** (Anthropic Claude Code CLI). Claude generated contract architecture, Solidity code, Hardhat config, deploy/export scripts, and both Next.js applications. All design decisions — loyalty protocol logic, operator authentication model, ERC-1155 redemption-proof pattern, payment splitter design, and security patterns — were made by the authors. The final concept and protocol are the authors' own work.
