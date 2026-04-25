import fs from "fs";
import path from "path";

const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337";
const src     = path.join(__dirname, "../deployments", `${chainId}.json`);

const destinations = [
  path.join(__dirname, "../../admin/src/generated/deployment.json"),
  path.join(__dirname, "../../branch/src/generated/deployment.json"),
];

if (!fs.existsSync(src)) {
  console.error(
    `No deployment found for chainId ${chainId}.\n` +
    `Run "pnpm deploy:local" or "pnpm deploy:sepolia" first, then re-run this script.`
  );
  process.exit(1);
}

for (const dest of destinations) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied deployments/${chainId}.json → ${path.relative(path.join(__dirname, "../.."), dest)}`);
}
