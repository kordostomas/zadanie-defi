import { expect } from "chai";
import { ethers } from "hardhat";
import { GymFinderFactory, GymBranch, LoyaltyToken, PaymentSplitter } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("GymFinderFactory", function () {
  let factory: GymFinderFactory;
  let owner: HardhatEthersSigner;
  let gymOwnerA: HardhatEthersSigner;
  let gymOwnerB: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const MONTHLY_FEE   = ethers.parseEther("0.01");
  const POINTS        = 100n;
  const PLATFORM_FEE  = 20n; // 20%

  beforeEach(async function () {
    [owner, gymOwnerA, gymOwnerB, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GymFinderFactory");
    factory = (await Factory.deploy(PLATFORM_FEE)) as GymFinderFactory;
    await factory.waitForDeployment();
  });

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("deployment", function () {
    it("sets the deployer as owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("deploys a LoyaltyToken", async function () {
      const ltAddr = await factory.loyaltyToken();
      expect(ltAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("deploys a PaymentSplitter", async function () {
      const psAddr = await factory.paymentSplitter();
      expect(psAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("stores platformFeePercent", async function () {
      expect(await factory.platformFeePercent()).to.equal(PLATFORM_FEE);
    });

    it("reverts on deployment with fee > 100", async function () {
      const Factory = await ethers.getContractFactory("GymFinderFactory");
      await expect(Factory.deploy(101n)).to.be.revertedWith("GymFinderFactory: invalid fee");
    });
  });

  // ── deployGymBranch() ─────────────────────────────────────────────────────

  describe("deployGymBranch()", function () {
    it("deploys a GymBranch and registers it", async function () {
      await factory.connect(owner).deployGymBranch(
        "Iron Palace",
        gymOwnerA.address,
        MONTHLY_FEE,
        POINTS
      );
      expect(await factory.getRegisteredGymsCount()).to.equal(1n);
    });

    it("emits GymBranchDeployed", async function () {
      await expect(
        factory.connect(owner).deployGymBranch("Iron Palace", gymOwnerA.address, MONTHLY_FEE, POINTS)
      ).to.emit(factory, "GymBranchDeployed");
    });

    it("registers gym in isRegisteredGym mapping", async function () {
      await factory.connect(owner).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS);
      const gyms = await factory.getRegisteredGyms();
      expect(await factory.isRegisteredGym(gyms[0])).to.be.true;
    });

    it("links GymBranch to its owner", async function () {
      await factory.connect(owner).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS);
      const gyms = await factory.getRegisteredGyms();
      expect(await factory.gymOwnerOf(gyms[0])).to.equal(gymOwnerA.address);
    });

    it("links GymBranch to its ShopProduct", async function () {
      await factory.connect(owner).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS);
      const gyms = await factory.getRegisteredGyms();
      const shopAddr = await factory.gymShopProduct(gyms[0]);
      expect(shopAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("grants MINTER_ROLE to the GymBranch", async function () {
      await factory.connect(owner).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS);
      const gyms = await factory.getRegisteredGyms();
      const lt = await ethers.getContractAt("LoyaltyToken", await factory.loyaltyToken()) as LoyaltyToken;
      const MINTER = await lt.MINTER_ROLE();
      expect(await lt.hasRole(MINTER, gyms[0])).to.be.true;
    });

    it("grants BURNER_ROLE to the GymBranch", async function () {
      await factory.connect(owner).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS);
      const gyms = await factory.getRegisteredGyms();
      const lt = await ethers.getContractAt("LoyaltyToken", await factory.loyaltyToken()) as LoyaltyToken;
      const BURNER = await lt.BURNER_ROLE();
      expect(await lt.hasRole(BURNER, gyms[0])).to.be.true;
    });

    it("deploys multiple gyms independently", async function () {
      await factory.connect(owner).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS);
      await factory.connect(owner).deployGymBranch("Gym B", gymOwnerB.address, MONTHLY_FEE, POINTS);
      expect(await factory.getRegisteredGymsCount()).to.equal(2n);
      const gyms = await factory.getRegisteredGyms();
      expect(gyms[0]).to.not.equal(gyms[1]);
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        factory.connect(stranger).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  // ── Fee management ────────────────────────────────────────────────────────

  describe("updateFeePercent()", function () {
    it("updates the fee", async function () {
      await factory.connect(owner).updateFeePercent(30n);
      expect(await factory.platformFeePercent()).to.equal(30n);
    });

    it("propagates to PaymentSplitter", async function () {
      await factory.connect(owner).updateFeePercent(30n);
      const ps = await ethers.getContractAt("PaymentSplitter", await factory.paymentSplitter()) as PaymentSplitter;
      expect(await ps.platformCutPercent()).to.equal(30n);
    });

    it("reverts on fee > 100", async function () {
      await expect(
        factory.connect(owner).updateFeePercent(101n)
      ).to.be.revertedWith("GymFinderFactory: invalid fee");
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        factory.connect(stranger).updateFeePercent(10n)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("collectPlatformFees()", function () {
    it("collects fees after a gym pays its subscription", async function () {
      // Deploy gym
      await factory.connect(owner).deployGymBranch("Gym A", gymOwnerA.address, MONTHLY_FEE, POINTS);
      const gyms = await factory.getRegisteredGyms();
      const gymBranch = await ethers.getContractAt("GymBranch", gyms[0]) as GymBranch;

      // Gym pays
      await gymBranch.connect(gymOwnerA).payMonthlyFee({ value: MONTHLY_FEE });

      // Collect
      await expect(factory.connect(owner).collectPlatformFees()).not.to.be.reverted;
    });

    it("reverts when no fees accumulated", async function () {
      await expect(factory.connect(owner).collectPlatformFees())
        .to.be.revertedWith("GymFinderFactory: no fees to collect");
    });

    it("reverts when called by non-owner", async function () {
      await expect(factory.connect(stranger).collectPlatformFees())
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });
});
