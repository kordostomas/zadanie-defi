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

## Deployed contracts (Sepolia)

Deployed **2026-05-03** · block **10,780,659** · deployer `0xaD4D815f1F62614d02801b6B1bD3756EC05E9c2D`

| Contract | Address | Explorer |
|---|---|---|
| `GymFinderFactory` | `0x2100Dce7c46B418Cb0d2A9a4380BF1BC2878B2Bd` | [View ↗](https://sepolia.etherscan.io/address/0x2100Dce7c46B418Cb0d2A9a4380BF1BC2878B2Bd) |
| `LoyaltyToken` (ERC-20) | `0xac1E7f8bdBF2B038e0e7b6764e3d30F22983220f` | [View ↗](https://sepolia.etherscan.io/address/0xac1E7f8bdBF2B038e0e7b6764e3d30F22983220f) |
| `PaymentSplitter` | `0x76ACb91AE990A36023e8BF48eb38e6aB47921e44` | [View ↗](https://sepolia.etherscan.io/address/0x76ACb91AE990A36023e8BF48eb38e6aB47921e44) |
| `GymBranch` (demo) | `0x75777978C67842ea843C4ebD7551e9e20Ca7B6bF` | [View ↗](https://sepolia.etherscan.io/address/0x75777978C67842ea843C4ebD7551e9e20Ca7B6bF) |
| `ShopProduct` (demo, ERC-1155) | `0x7C6b0b99F9797990aF2FbeC815541F69f398F4ED` | [View ↗](https://sepolia.etherscan.io/address/0x7C6b0b99F9797990aF2FbeC815541F69f398F4ED) |

Full deployment manifest: [`packages/contracts/deployments/11155111.json`](./packages/contracts/deployments/11155111.json)

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

#### 1. Create the root `.env`

```bash
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your-key>   # or Alchemy / any Sepolia RPC
PRIVATE_KEY=0x<deployer-private-key>                       # must hold Sepolia ETH
ETHERSCAN_API_KEY=<from etherscan.io/myapikey>
```

#### 2. Deploy contracts

```bash
pnpm deploy:sepolia
```

The script:
- Deploys `GymFinderFactory`, `LoyaltyToken`, and `PaymentSplitter`
- Creates a demo `GymBranch` + `ShopProduct` pair owned by the deployer
- Waits for 5 confirmations, then auto-verifies all three root contracts on Etherscan
- Saves addresses to `packages/contracts/deployments/11155111.json`
- Prints the exact `.env` block you need for the branch app

> **Re-deploying?** Add `--force` to overwrite an existing deployment: `pnpm --filter @zadanie-defi/contracts run deploy:sepolia -- --force`

#### 3. Sync ABIs into both frontends

```bash
pnpm sync:abi
```

#### 4. Configure `packages/branch/.env`

Use the values printed at the end of the deploy script:

```bash
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/<your-key>
NEXT_PUBLIC_BRANCH_ADDRESS=<GymBranch address from deploy output>
NEXT_PUBLIC_BRANCH_NAME="Your Gym Name"

# Server-side operator key — signs check-in transactions, never exposed to browser
OPERATOR_PRIVATE_KEY=0x<operator-wallet-private-key>

# bcrypt hash of your 4-digit PIN
# node -e "require('bcryptjs').hash('1234', 10).then(console.log)"
OPERATOR_PIN_HASH='$2b$10$...'

# Random secret — openssl rand -hex 32
JWT_SECRET=<random-hex-string>
```

#### 5. MetaMask setup for Sepolia

Sepolia is a built-in network in MetaMask. Switch to it and fund your wallet from a [Sepolia faucet](https://sepoliafaucet.com/) before interacting with the app.

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

# Production ready compose
docker compose -f docker-compose.prod.yml --env-file .env.prod up --build -d
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

## What we learned

**Factory pattern for contract families.** Deploying `GymBranch` + `ShopProduct` as a coordinated pair through `GymFinderFactory` taught us how to structure multi-contract systems where each instance shares global infrastructure (the same `LoyaltyToken` and `PaymentSplitter`) while remaining independently configurable. Tracking deployed addresses and syncing them into two separate frontends automatically was a design challenge that paid off significantly during development.

**ERC-1155 as an on-chain redemption proof.** Using ERC-1155 token minting as a receipt for shop redemptions was a non-obvious pattern we settled on after ruling out simpler mappings. Each token ID corresponds to a product; owning one is cryptographic proof the redemption happened. This also opens the door to transferable or tradeable rewards in the future without any contract changes.

**Hybrid authentication — on-chain and off-chain at the same time.** The operator flow (PIN → JWT session → server-signed check-in transaction) showed us that a dApp does not have to force every participant onto MetaMask. Gym operators are staff, not crypto users; a PIN is the right UX for them. The blockchain still settles the final state; the server just acts as a trusted signer scoped to one operation. Getting the two auth layers to coexist cleanly (wallet context for members, cookie-based JWT for operators) required careful separation of concerns.

**MetaMask connection lifecycle is harder than it looks.** Managing `eth_accounts` vs. `eth_requestAccounts`, persisting wallet state across page refreshes via cookies, silently reconnecting on mount without triggering a popup, and propagating `accountsChanged`/`chainChanged` events through a React context — each of these is a small problem that compounds quickly. We ended up building a dedicated `WalletContext` to centralize the logic, which made every page simpler.

**On-chain vs. off-chain tradeoffs are constant.** Every feature forced a decision: does this belong in the contract or on the server? Rate-limiting check-ins on-chain avoids double-spending but costs gas. Storing the operator PIN off-chain avoids key management on-chain but introduces a trusted server. Making these decisions explicitly — and being able to justify them — was the most valuable part of the project.

**Hardhat deploy script design.** Writing an idempotent deploy script (skip if the contract already has live code, re-deploy on a stale local chain, auto-sync ABIs into both frontends, print the exact `.env` block the frontend needs) saved us many hours of manual work and made Sepolia re-deployments friction-free.

## Conclusion

GymFinder Loyalty is a fully functional on-chain loyalty system for gym chains. Members earn ERC-20 points on every check-in and spend them in an ERC-1155 reward shop — all settled on Sepolia, with contracts verified on Etherscan. The platform handles two distinct user roles (wallet-connected members/owners and PIN-authenticated staff operators) through a layered authentication model that keeps the blockchain as the source of truth without forcing every participant to hold ETH.

The core objective of the assignment — a deployed, verifiable dApp with a working frontend, meaningful smart contract logic, and real on-chain interactions — is met in full. Beyond the baseline, the project includes a multi-contract factory architecture, a server-side operator signing model that is uncommon in typical dApp tutorials, ERC-1155 redemption proofs, and a two-app deployment (admin + branch) designed to serve different stakeholders independently.

Given more time, we would add a proper upgrade path (proxy contracts or a migration registry), multi-wallet support beyond MetaMask, and a hosted public frontend on Vercel for the branch app.

## AI tool usage

The primary tool used throughout this project was **Claude Sonnet 4.6** via the Anthropic Claude Code CLI.

**Where and to what extent it was used:**

| Area | Extent |
|---|---|
| Solidity contracts (`GymFinderFactory`, `GymBranch`, `ShopProduct`, `LoyaltyToken`, `PaymentSplitter`) | High — Claude drafted and iterated on the contract code based on requirements specified by the authors |
| Hardhat config, deploy script, ABI export script | High — Claude wrote and refined the tooling scripts |
| Next.js branch app (pages, components, wallet context) | High — Claude generated and refactored the frontend code |
| Next.js admin app | Medium — scaffolded by Claude, extended by the authors |
| Contract test suite | Medium — Claude generated test skeletons; authors wrote additional edge-case tests |
| Architecture and protocol design | **Authors** — the loyalty system concept, operator authentication model, ERC-1155 redemption-proof pattern, payment splitter design, and two-app deployment strategy were designed by the authors |
| Design decisions and trade-offs | **Authors** — all decisions about what goes on-chain vs. off-chain, access control structure, and UX flows were made by the authors and can be defended in the presentation |

All code generated by AI was reviewed, understood, and in many cases modified by the authors before being committed. No code was copy-pasted from tutorials or canonical protocol repositories.
