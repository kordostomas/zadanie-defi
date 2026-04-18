import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { SimpleVault } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ContractTransactionResponse } from "ethers";

describe("SimpleVault", function () {
  let vault: SimpleVault;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let eve: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob, eve] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("SimpleVault");
    vault = (await factory.deploy(owner.address)) as SimpleVault;
    await vault.waitForDeployment();
  });

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("deployment", function () {
    it("sets deployer as owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("initialises stored value to 0", async function () {
      expect(await vault.get()).to.equal(0n);
    });

    it("initialises contract balance to 0", async function () {
      const bal = await ethers.provider.getBalance(await vault.getAddress());
      expect(bal).to.equal(0n);
    });
  });

  // ── set() happy path ──────────────────────────────────────────────────────

  describe("set()", function () {
    it("stores the new value", async function () {
      await vault.connect(alice).set(42n, { value: ethers.parseEther("0.1") });
      expect(await vault.get()).to.equal(42n);
    });

    it("records alice's contribution", async function () {
      const payment = ethers.parseEther("0.5");
      await vault.connect(alice).set(1n, { value: payment });
      expect(await vault.contributions(alice.address)).to.equal(payment);
    });

    it("emits ValueSet with correct args", async function () {
      const payment = ethers.parseEther("0.1");
      await expect(vault.connect(alice).set(99n, { value: payment }))
        .to.emit(vault, "ValueSet")
        .withArgs(alice.address, 99n, payment);
    });

    it("accumulates ETH in the contract", async function () {
      await vault.connect(alice).set(1n, { value: ethers.parseEther("0.1") });
      await vault.connect(bob).set(2n, { value: ethers.parseEther("0.2") });
      const bal = await ethers.provider.getBalance(await vault.getAddress());
      expect(bal).to.equal(ethers.parseEther("0.3"));
    });

    it("allows multiple callers — latest value wins", async function () {
      await vault.connect(alice).set(10n, { value: ethers.parseEther("0.1") });
      await vault.connect(bob).set(20n, { value: ethers.parseEther("0.1") });
      expect(await vault.get()).to.equal(20n);
    });

    it("accumulates contributions across multiple calls from the same sender", async function () {
      const p = ethers.parseEther("0.1");
      await vault.connect(alice).set(1n, { value: p });
      await vault.connect(alice).set(2n, { value: p });
      expect(await vault.contributions(alice.address)).to.equal(p * 2n);
    });

    it("tracks contributions per-address independently", async function () {
      await vault.connect(alice).set(1n, { value: ethers.parseEther("0.3") });
      await vault.connect(bob).set(2n, { value: ethers.parseEther("0.7") });
      expect(await vault.contributions(alice.address)).to.equal(ethers.parseEther("0.3"));
      expect(await vault.contributions(bob.address)).to.equal(ethers.parseEther("0.7"));
    });
  });

  // ── set() edge / failure cases ────────────────────────────────────────────

  describe("set() — failure cases", function () {
    it("reverts when msg.value is 0", async function () {
      await expect(
        vault.connect(alice).set(1n, { value: 0n })
      ).to.be.revertedWith("SimpleVault: payment required");
    });

    it("stores value 0 correctly (zero is a valid value)", async function () {
      await vault.connect(alice).set(1n, { value: ethers.parseEther("0.1") });
      await vault.connect(bob).set(0n, { value: ethers.parseEther("0.1") });
      expect(await vault.get()).to.equal(0n);
    });
  });

  // ── withdraw() happy path ─────────────────────────────────────────────────

  describe("withdraw()", function () {
    beforeEach(async function () {
      await vault.connect(alice).set(1n, { value: ethers.parseEther("1") });
    });

    it("empties the contract balance", async function () {
      await vault.connect(owner).withdraw();
      const bal = await ethers.provider.getBalance(await vault.getAddress());
      expect(bal).to.equal(0n);
    });

    it("sends funds to the owner", async function () {
      const before = await ethers.provider.getBalance(owner.address);
      const tx: ContractTransactionResponse = await vault.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      expect(after).to.equal(before + ethers.parseEther("1") - gasUsed);
    });

    it("emits Withdrawn with correct args", async function () {
      await expect(vault.connect(owner).withdraw())
        .to.emit(vault, "Withdrawn")
        .withArgs(owner.address, ethers.parseEther("1"));
    });
  });

  // ── withdraw() failure cases ──────────────────────────────────────────────

  describe("withdraw() — failure cases", function () {
    it("reverts when called by non-owner", async function () {
      await vault.connect(alice).set(1n, { value: ethers.parseEther("1") });
      await expect(vault.connect(eve).withdraw()).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount"
      );
    });

    it("reverts when balance is zero", async function () {
      await expect(vault.connect(owner).withdraw()).to.be.revertedWith(
        "SimpleVault: nothing to withdraw"
      );
    });
  });

  // ── Ownership transfer ────────────────────────────────────────────────────

  describe("ownership", function () {
    it("new owner can withdraw after transfer", async function () {
      await vault.connect(alice).set(1n, { value: ethers.parseEther("0.5") });
      await vault.connect(owner).transferOwnership(bob.address);
      await vault.connect(bob).withdraw();
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    });

    it("old owner cannot withdraw after transfer", async function () {
      await vault.connect(alice).set(1n, { value: ethers.parseEther("0.5") });
      await vault.connect(owner).transferOwnership(bob.address);
      await expect(vault.connect(owner).withdraw()).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  // ── Reentrancy guard ──────────────────────────────────────────────────────

  describe("reentrancy protection", function () {
    it("blocks a reentrant withdraw attempt", async function () {
      // Deploy an attacker contract that tries to re-enter withdraw in its receive()
      const AttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await AttackerFactory.deploy(await vault.getAddress());
      await attacker.waitForDeployment();

      // Transfer vault ownership to the attacker so it can call withdraw
      await vault.connect(owner).transferOwnership(await attacker.getAddress());

      // Fund the vault via alice
      await vault.connect(alice).set(1n, { value: ethers.parseEther("1") });

      // Attacker.attack() calls vault.withdraw(). The inner re-entrant call is
      // blocked by ReentrancyGuard (reverts inside the low-level call), which
      // causes the outer call{value} to return ok=false, so the outer withdraw
      // reverts with "transfer failed".
      await expect(attacker.attack()).to.be.revertedWith("SimpleVault: transfer failed");
    });
  });
});
