import hre, { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const DEPLOYMENTS_DIR = path.join(__dirname, "../deployments");
const PLATFORM_FEE_PERCENT = 20; // 20% of monthly gym fees go to GymFinder treasury

async function main() {
  const forceRedeploy = process.argv.includes("--force");
  const network = hre.network.name;
  const { chainId } = await ethers.provider.getNetwork();
  const deploymentsFile = path.join(DEPLOYMENTS_DIR, `${chainId}.json`);

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });

  // Idempotency check
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

  // ── 1. Deploy GymFinderFactory ──────────────────────────────────────────
  //    This internally deploys LoyaltyToken and PaymentSplitter.
  console.log("\n[1/3] Deploying GymFinderFactory...");
  const FactoryFactory = await ethers.getContractFactory("GymFinderFactory");
  const gymFactory = await FactoryFactory.deploy(PLATFORM_FEE_PERCENT);
  await gymFactory.waitForDeployment();

  const factoryAddress      = await gymFactory.getAddress();
  const loyaltyTokenAddress = await gymFactory.loyaltyToken();
  const splitterAddress     = await gymFactory.paymentSplitter();

  console.log(`  GymFinderFactory  → ${factoryAddress}`);
  console.log(`  LoyaltyToken      → ${loyaltyTokenAddress}`);
  console.log(`  PaymentSplitter   → ${splitterAddress}`);

  // ── 2. Deploy a demo gym for local development / testing ─────────────────
  console.log("\n[2/3] Deploying demo GymBranch...");
  const demoTx = await gymFactory.deployGymBranch(
    "GymFinder Demo Gym",
    deployer.address,                // gym owner = deployer for local testing
    ethers.parseEther("0.01"),       // 0.01 ETH monthly fee
    100n                             // 100 loyalty points per visit
  );
  const demoReceipt = await demoTx.wait();

  const gyms             = await gymFactory.getRegisteredGyms();
  const demoGymBranch    = gyms[0];
  const demoShopProduct  = await gymFactory.gymShopProduct(demoGymBranch);

  console.log(`  GymBranch (demo)  → ${demoGymBranch}`);
  console.log(`  ShopProduct (demo)→ ${demoShopProduct}`);

  // ── 3. Seed the demo shop with sample products ───────────────────────────
  console.log("\n[3/3] Seeding demo shop...");
  const gymBranch = await ethers.getContractAt("GymBranch", demoGymBranch);

  const seedProducts = [
    { name: "Protein Shake",   desc: "Free post-workout shake",   cost: 200n, type: 0 /* PHYSICAL */, stock: 50 },
    { name: "Free Day Pass",   desc: "One free gym entry",        cost: 500n, type: 1 /* SERVICE  */, stock: 20 },
    { name: "10% T-Shirt Off", desc: "Discount on branded merch", cost: 150n, type: 2 /* DISCOUNT */, stock: 100 },
  ];

  for (const p of seedProducts) {
    const tx = await gymBranch.addProduct(p.name, p.desc, p.cost, p.type, p.stock);
    await tx.wait();
    console.log(`  + Product: "${p.name}" (${p.cost} pts)`);
  }

  // ── 4. Collect ABIs ───────────────────────────────────────────────────────
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

  // ── 5. Save deployment manifest ───────────────────────────────────────────
  const deployTx       = gymFactory.deploymentTransaction();
  const deployReceipt  = await deployTx?.wait();

  const deployment = {
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
    // Per-gym contracts have no fixed address; their ABIs are included so
    // the frontend can interact with dynamically discovered instances.
    GymBranch: {
      abi: gymBranchArtifact.abi,
    },
    ShopProduct: {
      abi: shopArtifact.abi,
    },
    demoGymBranch,
    demoShopProduct,
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment saved to deployments/${chainId}.json`);

  // ── 6. Optional Etherscan verification (Sepolia only) ────────────────────
  if (network === "sepolia") {
    console.log("\nWaiting for extra confirmations before verification...");
    await deployTx?.wait(5);
    for (const [name, addr] of [
      ["GymFinderFactory", factoryAddress],
      ["LoyaltyToken",     loyaltyTokenAddress],
      ["PaymentSplitter",  splitterAddress],
    ] as const) {
      try {
        await hre.run("verify:verify", { address: addr, constructorArguments: [] });
        console.log(`${name} verified on Etherscan.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(msg.includes("Already Verified") ? `${name} already verified.` : `Verification failed: ${msg}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
