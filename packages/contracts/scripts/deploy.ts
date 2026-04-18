import hre, { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const DEPLOYMENTS_DIR = path.join(__dirname, "../deployments");

async function main() {
  const forceRedeploy = process.argv.includes("--force");
  const network = hre.network.name;
  const { chainId } = await ethers.provider.getNetwork();
  const deploymentsFile = path.join(DEPLOYMENTS_DIR, `${chainId}.json`);

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });

  // Idempotency check: skip if already deployed and contract code exists
  if (!forceRedeploy && fs.existsSync(deploymentsFile)) {
    const existing = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
    const code = await ethers.provider.getCode(existing.address);
    if (code !== "0x") {
      console.log(`SimpleVault already deployed at ${existing.address} on ${network} (chainId ${chainId})`);
      console.log("Use --force to redeploy.");
      return;
    }
    console.log("Existing deployment has no code (probably a stale local chain). Redeploying...");
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying SimpleVault from ${deployer.address} on ${network} (chainId ${chainId})...`);

  const factory = await ethers.getContractFactory("SimpleVault");
  const contract = await factory.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx?.wait();
  const blockNumber = receipt?.blockNumber ?? 0;

  const artifact = await hre.artifacts.readArtifact("SimpleVault");
  const deployment = {
    chainId: Number(chainId),
    network,
    address,
    deployer: deployer.address,
    blockNumber,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(deployment, null, 2));
  console.log(`Deployed at ${address}, saved to deployments/${chainId}.json`);

  // Verify on Etherscan for public networks (not localhost/hardhat)
  if (network === "sepolia") {
    console.log("Waiting for extra confirmations before verification...");
    await deployTx?.wait(5);
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [deployer.address],
      });
      console.log("Contract verified on Etherscan.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Already Verified")) {
        console.log("Already verified.");
      } else {
        console.error("Verification failed:", msg);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
