import hre, { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DEPLOYMENTS_DIR    = path.join(__dirname, "../deployments");
const PLATFORM_FEE_PCT   = 20;              // 20% platform cut of monthly fees
const REGISTRATION_FEE   = ethers.parseEther("0"); // 0 ETH for local/demo; raise on mainnet

async function main() {
  const forceRedeploy   = process.argv.includes("--force");
  const network         = hre.network.name;
  const { chainId }     = await ethers.provider.getNetwork();
  const deploymentsFile = path.join(DEPLOYMENTS_DIR, `${chainId}.json`);

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });

  // Idempotency: skip if already deployed on a live chain
  if (!forceRedeploy && fs.existsSync(deploymentsFile)) {
    const existing = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
    const factoryAddr = existing?.GymFinderFactory?.address;
    if (factoryAddr) {
      const code = await ethers.provider.getCode(factoryAddr);
      if (code !== "0x") {
        console.log(`GymFinderFactory already deployed at ${factoryAddr} on ${network} (chainId ${chainId})`);
        console.log("Use --force to redeploy.");
        return;
      }
      console.log("Existing deployment has no code (stale local chain). Redeploying...");
    }
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from ${deployer.address} on ${network} (chainId ${chainId})...`);
  console.log(`  Platform fee: ${PLATFORM_FEE_PCT}%`);
  console.log(`  Registration fee: ${ethers.formatEther(REGISTRATION_FEE)} ETH`);

  // ── 1. Deploy GymFinderFactory ────────────────────────────────────────────
  //    Internally deploys LoyaltyToken and PaymentSplitter.
  console.log("\n[1/4] Deploying GymFinderFactory...");
  const FactoryFactory = await ethers.getContractFactory("GymFinderFactory");
  const gymFactory = await FactoryFactory.deploy(PLATFORM_FEE_PCT, REGISTRATION_FEE);
  await gymFactory.waitForDeployment();

  const factoryAddress      = await gymFactory.getAddress();
  const loyaltyTokenAddress = await gymFactory.loyaltyToken();
  const splitterAddress     = await gymFactory.paymentSplitter();

  console.log(`  GymFinderFactory  → ${factoryAddress}`);
  console.log(`  LoyaltyToken      → ${loyaltyTokenAddress}`);
  console.log(`  PaymentSplitter   → ${splitterAddress}`);

  // ── 2. Deploy a demo gym branch ───────────────────────────────────────────
  console.log("\n[2/4] Deploying demo GymBranch...");
  const demoTx = await gymFactory.deployGymBranch(
    "GymFinder Demo Gym",
    deployer.address,            // gym owner = deployer for local testing
    ethers.parseEther("0.01"),   // 0.01 ETH monthly fee
    100n,                        // 100 loyalty points per visit
    { value: REGISTRATION_FEE }
  );
  await demoTx.wait();

  const gyms            = await gymFactory.getRegisteredGyms();
  const demoGymBranch   = gyms[0];
  const demoShopProduct = await gymFactory.gymShopProduct(demoGymBranch);

  console.log(`  GymBranch (demo)  → ${demoGymBranch}`);
  console.log(`  ShopProduct (demo)→ ${demoShopProduct}`);

  // ── 3. Configure demo branch for local testing ────────────────────────────
  console.log("\n[3/4] Configuring demo branch...");
  const gymBranch = await ethers.getContractAt("GymBranch", demoGymBranch);

  // Allow members to self-register without an operator
  const selfRegTx = await gymBranch.setAllowSelfRegistration(true);
  await selfRegTx.wait();
  console.log("  ✓ Self-registration enabled");

  // Add deployer as an operator (so OPERATOR_PRIVATE_KEY = deployer key works out-of-the-box)
  const addOpTx = await gymBranch.addOperator(deployer.address);
  await addOpTx.wait();
  console.log(`  ✓ Operator added: ${deployer.address}`);

  // Seed shop with sample products
  const seedProducts = [
    { name: "Protein Shake",    desc: "Free post-workout shake",    cost: 200n, type: 0, stock: 50  },
    { name: "Free Day Pass",    desc: "One free gym entry",         cost: 500n, type: 1, stock: 20  },
    { name: "10% T-Shirt Off",  desc: "Discount on branded merch",  cost: 150n, type: 2, stock: 100 },
  ];

  for (const p of seedProducts) {
    const tx = await gymBranch.addProduct(p.name, p.desc, p.cost, p.type, p.stock);
    await tx.wait();
    console.log(`  + Product: "${p.name}" (${p.cost} pts)`);
  }

  // ── 4. Save deployment manifest ───────────────────────────────────────────
  console.log("\n[4/4] Saving deployment manifest...");
  const [
    factoryArtifact,
    loyaltyArtifact,
    splitterArtifact,
    gymBranchArtifact,
    shopArtifact,
  ] = await Promise.all([
    hre.artifacts.readArtifact("GymFinderFactory"),
    hre.artifacts.readArtifact("LoyaltyToken"),
    hre.artifacts.readArtifact("PaymentSplitter"),
    hre.artifacts.readArtifact("GymBranch"),
    hre.artifacts.readArtifact("ShopProduct"),
  ]);

  const deployTx      = gymFactory.deploymentTransaction();
  const deployReceipt = await deployTx?.wait();

  const manifest = {
    chainId:     Number(chainId),
    network,
    deployedAt:  new Date().toISOString(),
    deployer:    deployer.address,
    blockNumber: deployReceipt?.blockNumber ?? 0,
    GymFinderFactory: {
      address: factoryAddress,
      abi:     factoryArtifact.abi,
    },
    LoyaltyToken: {
      address: loyaltyTokenAddress,
      abi:     loyaltyArtifact.abi,
    },
    PaymentSplitter: {
      address: splitterAddress,
      abi:     splitterArtifact.abi,
    },
    // Per-gym contracts have no fixed address; ABIs are included so the
    // frontends can interact with dynamically discovered instances.
    GymBranch:   { abi: gymBranchArtifact.abi },
    ShopProduct:  { abi: shopArtifact.abi },
    demoGymBranch,
    demoShopProduct,
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(manifest, null, 2));
  console.log(`  Deployment saved → deployments/${chainId}.json`);

  // Auto-sync ABIs into both frontends
  try {
    execSync(`pnpm --filter @zadanie-defi/contracts run export-abi`, {
      cwd: path.join(__dirname, "../../.."),
      env: { ...process.env, NEXT_PUBLIC_CHAIN_ID: String(chainId) },
      stdio: "inherit",
    });
  } catch {
    console.warn("  Warning: export-abi failed. Run 'pnpm sync:abi' manually.");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n✅ Deployment complete!\n");
  console.log("─".repeat(60));
  console.log("Branch app .env values for this deployment:");
  console.log(`  NEXT_PUBLIC_BRANCH_ADDRESS=${demoGymBranch}`);
  console.log(`  NEXT_PUBLIC_CHAIN_ID=${chainId}`);
  if (network === "localhost" || network === "hardhat") {
    console.log(`  NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545`);
    console.log(`  OPERATOR_PRIVATE_KEY=<hardhat account #0 private key>`);
    console.log("  OPERATOR_PIN_HASH=<run: node -e \"require('bcryptjs').hash('1234',10).then(console.log)\">");
    console.log("  JWT_SECRET=dev-secret-change-in-production");
  }
  console.log("─".repeat(60));

  // ── Etherscan verification (Sepolia only) ─────────────────────────────────
  if (network === "sepolia") {
    console.log("\nWaiting for extra confirmations before Etherscan verification...");
    await deployTx?.wait(5);

    const verifyTargets: Array<[string, string, unknown[]]> = [
      ["GymFinderFactory", factoryAddress, [PLATFORM_FEE_PCT, REGISTRATION_FEE]],
      ["LoyaltyToken",     loyaltyTokenAddress, [factoryAddress]],
      ["PaymentSplitter",  splitterAddress, [deployer.address, PLATFORM_FEE_PCT, factoryAddress]],
    ];

    for (const [name, addr, args] of verifyTargets) {
      try {
        await hre.run("verify:verify", { address: addr, constructorArguments: args });
        console.log(`  ✓ ${name} verified`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(msg.includes("Already Verified") ? `  ✓ ${name} already verified` : `  ✗ ${name}: ${msg}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
