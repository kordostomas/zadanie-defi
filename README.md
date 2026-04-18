# SimpleVault — DMBLOCK Assignment 2

> **Note:** This repository currently contains the **scaffold** (SimpleVault — a minimal payable set/get contract). The final creative dApp will replace the contract while keeping all surrounding infrastructure unchanged.

## What it does

SimpleVault lets any wallet pay ETH to overwrite an on-chain `uint256` value. The contract owner accumulates all ETH sent and can withdraw at any time. It demonstrates: payable functions, access control, reentrancy protection, owner-only operations, and event emission.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full component diagram, data-flow walkthrough, and security notes.

## Deployed contract

| Network | Address | Explorer |
|---------|---------|---------|
| Sepolia | *(fill in after deployment)* | *(fill in)* |

> Contract is deployed once. The address is committed to `packages/contracts/deployments/11155111.json` and automatically consumed by the frontend at build time.

## Setup

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)
- MetaMask browser extension

### Install

```bash
pnpm install
```

### Local development (no secrets needed)

```bash
# Terminal A — start local Hardhat node (chainId 31337)
pnpm --filter @zadanie-defi/contracts run node

# Terminal B — deploy contract to local node
pnpm --filter @zadanie-defi/contracts run deploy:local

# Sync deployment JSON into the frontend, then start dev server
pnpm --filter @zadanie-defi/frontend run sync:abi
pnpm --filter @zadanie-defi/frontend run dev
```

Open http://localhost:3000. In MetaMask, import any of the funded Hardhat accounts (`0xac0974...`) and add the network: RPC `http://127.0.0.1:8545`, chainId `31337`.

### Tests

```bash
pnpm test          # run all contract tests
pnpm coverage      # statement/branch coverage report
```

### Deploy to Sepolia

1. Copy `.env.example` to `.env` and fill in `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`.
2. `pnpm --filter @zadanie-defi/contracts run deploy:sepolia`
3. The script waits for confirmations and runs Etherscan verification automatically.

### Docker

Build and run the frontend (requires a deployed contract JSON in `deployments/`):

```bash
# Build for Sepolia (default)
docker build -f packages/frontend/Dockerfile -t simplevault-frontend .
docker run -p 3000:3000 simplevault-frontend

# Build for local Hardhat
docker build -f packages/frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_CHAIN_ID=31337 \
  -t simplevault-frontend-local .
```

Or use docker-compose for a self-contained local demo:

```bash
docker compose up
```

## Known limitations

- The contract has no upgrade mechanism; redeploying means a new address and updating the JSON.
- MetaMask is the only wallet integration; adding WalletConnect would broaden support.
- The UI has no ENS resolution or address book.
- `docker-compose.yml` requires manually running `deploy:local` after the Hardhat node starts; a proper entrypoint script would automate this.

## What we learned

*(to be filled after completing the full dApp)*

## Conclusion

*(to be filled after completing the full dApp)*

## AI tool usage

This project was scaffolded with assistance from **Claude Sonnet 4.6** (Anthropic Claude Code CLI). Claude generated the initial file structure, Solidity contract, Hardhat config, deploy/export scripts, Next.js component structure, and Docker multistage build. All design decisions (monorepo layout, address persistence strategy, payable-set concept, test coverage targets, security patterns) were made by the authors and validated against the assignment rubric. The final creative dApp concept and its unique protocol logic are the authors' own.
