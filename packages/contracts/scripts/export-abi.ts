/**
 * Copies the deployment manifest for a given chain into the frontend's
 * src/generated/deployment.json so it can be imported at build time.
 *
 * The manifest now contains addresses AND ABIs for all platform contracts
 * (GymFinderFactory, LoyaltyToken, PaymentSplitter) plus ABIs for the
 * per-gym contracts (GymBranch, ShopProduct) so the frontend can interact
 * with dynamically discovered instances.
 *
 * Run via: pnpm --filter frontend run sync:abi
 */
import fs from "fs";
import path from "path";

const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337";
const src     = path.join(__dirname, "../deployments", `${chainId}.json`);
const destDir = path.join(__dirname, "../../frontend/src/generated");
const dest    = path.join(destDir, "deployment.json");

if (!fs.existsSync(src)) {
  console.error(
    `No deployment found for chainId ${chainId}.\n` +
    `Run "pnpm deploy:local" or "pnpm deploy:sepolia" first, then re-run this script.`
  );
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied deployments/${chainId}.json → src/generated/deployment.json`);
