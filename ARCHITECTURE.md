# Architecture

## Overview

This project is a monorepo (`pnpm` workspaces) containing two packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@zadanie-defi/contracts` | `packages/contracts/` | Solidity contracts, Hardhat config, deploy scripts, tests |
| `@zadanie-defi/frontend` | `packages/frontend/` | Next.js 15 App Router UI, ethers v6 wallet integration |

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (User)                         │
│                                                             │
│  ┌──────────────┐   signs txs   ┌──────────────────────┐   │
│  │   Next.js    │◄─────────────►│     MetaMask         │   │
│  │   Frontend   │               │  (BrowserProvider)   │   │
│  │  (page.tsx)  │               └──────────┬───────────┘   │
│  └──────┬───────┘                          │ JSON-RPC       │
│         │ import                           ▼                │
│  ┌──────▼───────────────────┐   ┌─────────────────────┐    │
│  │  src/generated/          │   │  EVM Node            │    │
│  │  deployment.json         │   │  (localhost:8545 or  │    │
│  │  (address + ABI)         │   │   Sepolia RPC)       │    │
│  └──────────────────────────┘   └─────────┬───────────┘    │
│                                            │                │
└────────────────────────────────────────────┼────────────────┘
                                             │
                              ┌──────────────▼───────────────┐
                              │      SimpleVault.sol          │
                              │  (deployed on-chain)          │
                              │                               │
                              │  set(uint256) payable         │
                              │  get() view → uint256         │
                              │  withdraw() onlyOwner         │
                              └───────────────────────────────┘
```

### How `deployment.json` gets into the frontend

```
Hardhat deploy script
        │
        │ writes
        ▼
packages/contracts/deployments/<chainId>.json
        │
        │  pnpm sync:abi  (export-abi.ts)
        ▼
packages/frontend/src/generated/deployment.json   ← imported at build time
```

The sync step runs before `next build` (and in the Docker builder stage). The JSON is **not** served to the client at runtime; it is baked into the bundle.

---

## Data Flow — `set()` Transaction

```
User enters value + ETH amount in the UI
         │
         ▼
handleSet() in page.tsx
         │
         ▼  contract.set(value, { value: eth })
useTx.send()
         │
         ▼  eth_sendTransaction
MetaMask prompts user to sign
         │
         ▼  signed tx → RPC node
         │
         ▼  tx hash returned immediately → status = "pending"
         │
         ▼  tx.wait() — waits for 1 confirmation
         │
         ▼  status = "mined" → UI refresh
         │
         ▼  readValue(provider) + readContractBalance(provider)
         │
         ▼  New value and vault balance shown in UI
```

---

## Environment Matrix

| Variable | Dev (localhost) | Prod (Sepolia) |
|----------|-----------------|----------------|
| `NEXT_PUBLIC_CHAIN_ID` | `31337` | `11155111` |
| `SEPOLIA_RPC_URL` | not needed | Alchemy / Infura URL |
| `PRIVATE_KEY` | not needed | funded deployer key |
| `ETHERSCAN_API_KEY` | not needed | for contract verification |

The `hardhat.config.ts` reads all secrets from the root `.env` via `dotenv`. Missing secrets fall back to empty strings — the config never throws, so local development works without Sepolia credentials.

---

## Security Notes

- **Checks-Effects-Interactions**: `withdraw()` updates no state before the external call; the balance is read once and the transfer happens last — standard CEI.
- **ReentrancyGuard**: Belt-and-braces on top of CEI. The reentrancy test (`ReentrancyAttacker.sol`) confirms the guard fires correctly.
- **Ownable (OZ v5)**: Access control for `withdraw()`. Constructor accepts `initialOwner` explicitly — avoids the `address(0)` pitfall from older OZ patterns.
- **No upgrade path**: The contract is immutable once deployed. Simplicity is a feature here.
- **No oracle assumptions**: All logic is self-contained; no price feeds or external calls.
- **Integer safety**: Solidity 0.8+ has built-in overflow checks; no `SafeMath` needed.

---

## Docker Build (multistage)

```
Stage 1 — deps     Install node_modules (pnpm --filter frontend...)
Stage 2 — builder  Copy source, run sync:abi, run next build (standalone)
Stage 3 — runner   Copy .next/standalone only; non-root user; EXPOSE 3000
```

The `output: "standalone"` Next.js config produces a self-contained `server.js` with inlined node_modules, keeping the final image lean (no dev deps, no source files).
