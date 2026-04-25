/**
 * Integration tests — full end-to-end flows covering the entire system.
 * All contracts are deployed via GymFinderFactory, mirroring production conditions.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  GymFinderFactory,
  GymBranch,
  LoyaltyToken,
  ShopProduct,
  PaymentSplitter,
} from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Integration — GymFinder Loyalty System", function () {
  let factory:        GymFinderFactory;
  let loyaltyToken:   LoyaltyToken;
  let paymentSplitter: PaymentSplitter;
  let gymBranchA:     GymBranch;
  let gymBranchB:     GymBranch;
  let shopA:          ShopProduct;
  let shopB:          ShopProduct;

  let platform:  HardhatEthersSigner;  // factory deployer / platform admin
  let gymOwnerA: HardhatEthersSigner;
  let gymOwnerB: HardhatEthersSigner;
  let alice:     HardhatEthersSigner;
  let bob:       HardhatEthersSigner;

  const MONTHLY_FEE = ethers.parseEther("0.01");
  const POINTS_A    = 100n;
  const POINTS_B    = 150n;

  before(async function () {
    [platform, gymOwnerA, gymOwnerB, alice, bob] = await ethers.getSigners();

    // 1. Deploy platform (factory + loyaltyToken + paymentSplitter)
    const FactoryFactory = await ethers.getContractFactory("GymFinderFactory");
    factory = (await FactoryFactory.deploy(20n, 0n)) as GymFinderFactory;   // 20% platform cut, 0 registration fee
    await factory.waitForDeployment();

    loyaltyToken    = await ethers.getContractAt("LoyaltyToken",    await factory.loyaltyToken())    as LoyaltyToken;
    paymentSplitter = await ethers.getContractAt("PaymentSplitter", await factory.paymentSplitter()) as PaymentSplitter;

    // 2. Deploy two gym branches
    await factory.connect(platform).deployGymBranch("Iron Palace",  gymOwnerA.address, MONTHLY_FEE, POINTS_A);
    await factory.connect(platform).deployGymBranch("Cardio Castle", gymOwnerB.address, MONTHLY_FEE, POINTS_B);

    const gyms = await factory.getRegisteredGyms();
    gymBranchA = await ethers.getContractAt("GymBranch",    gyms[0]) as GymBranch;
    gymBranchB = await ethers.getContractAt("GymBranch",    gyms[1]) as GymBranch;
    shopA      = await ethers.getContractAt("ShopProduct", await factory.gymShopProduct(gyms[0])) as ShopProduct;
    shopB      = await ethers.getContractAt("ShopProduct", await factory.gymShopProduct(gyms[1])) as ShopProduct;

    // 3. Gym A owner adds products
    await gymBranchA.connect(gymOwnerA).addProduct("Protein Shake",  "Free shake",        200n, 0 /* PHYSICAL */, 50);
    await gymBranchA.connect(gymOwnerA).addProduct("Free Day Pass",  "One free entry",    500n, 1 /* SERVICE  */, 20);
    await gymBranchA.connect(gymOwnerA).addProduct("10% Off T-Shirt","Discount voucher",  150n, 2 /* DISCOUNT */, 100);

    // 4. Gym B owner adds products
    await gymBranchB.connect(gymOwnerB).addProduct("Towel Rental",   "Fresh towel",        80n, 0, 200);
    await gymBranchB.connect(gymOwnerB).addProduct("Smoothie",       "Post-workout smoothie",120n, 0, 100);

    // 5. Register alice and bob at both gyms; disable rate limit for test convenience
    await gymBranchA.connect(gymOwnerA).setCheckInRateLimit(0);
    await gymBranchB.connect(gymOwnerB).setCheckInRateLimit(0);
    await gymBranchA.connect(gymOwnerA).registerMember(alice.address);
    await gymBranchA.connect(gymOwnerA).registerMember(bob.address);
    await gymBranchB.connect(gymOwnerB).registerMember(alice.address);
    await gymBranchB.connect(gymOwnerB).registerMember(bob.address);
  });

  // ── Full member journey ───────────────────────────────────────────────────

  describe("full member journey", function () {
    it("alice earns points by checking into Gym A multiple times", async function () {
      await gymBranchA.connect(gymOwnerA).checkIn(alice.address); // +100
      await gymBranchA.connect(gymOwnerA).checkIn(alice.address); // +100
      await gymBranchA.connect(gymOwnerA).checkIn(alice.address); // +100  → 300 total
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(300n);
    });

    it("alice redeems a Protein Shake (costs 200 pts)", async function () {
      await gymBranchA.connect(alice).redeemProduct(0);
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(100n);
      expect(await shopA.balanceOf(alice.address, 0)).to.equal(1n);
    });

    it("alice checks into Gym B and earns different-rate points", async function () {
      const before = await loyaltyToken.balanceOf(alice.address);
      await gymBranchB.connect(gymOwnerB).checkIn(alice.address); // +150
      const after = await loyaltyToken.balanceOf(alice.address);
      expect(after - before).to.equal(POINTS_B);
    });

    it("alice redeems a Towel Rental at Gym B (costs 80 pts)", async function () {
      // alice should have 100 + 150 = 250 pts at this point
      const before = await loyaltyToken.balanceOf(alice.address);
      await gymBranchB.connect(alice).redeemProduct(0);
      const after = await loyaltyToken.balanceOf(alice.address);
      expect(before - after).to.equal(80n);
      expect(await shopB.balanceOf(alice.address, 0)).to.equal(1n);
    });
  });

  // ── Multiple members, shared token ───────────────────────────────────────

  describe("multiple members share one LoyaltyToken", function () {
    it("bob earns points from both gyms independently", async function () {
      await gymBranchA.connect(gymOwnerA).checkIn(bob.address); // +100
      await gymBranchB.connect(gymOwnerB).checkIn(bob.address); // +150
      expect(await loyaltyToken.balanceOf(bob.address)).to.equal(250n);
    });

    it("bob's and alice's points are independent", async function () {
      const aliceBal = await loyaltyToken.balanceOf(alice.address);
      const bobBal   = await loyaltyToken.balanceOf(bob.address);
      expect(aliceBal).to.be.greaterThan(0n);
      expect(bobBal).to.be.greaterThan(0n);
      // total supply covers both
      const supply = await loyaltyToken.totalSupply();
      expect(supply).to.be.greaterThanOrEqual(aliceBal + bobBal);
    });
  });

  // ── Manual bonus points ───────────────────────────────────────────────────

  describe("gym owner awards bonus points", function () {
    it("gymOwnerA awards 500 bonus points to alice", async function () {
      const before = await loyaltyToken.balanceOf(alice.address);
      await gymBranchA.connect(gymOwnerA).awardPoints(alice.address, 500n, "Referral");
      const after = await loyaltyToken.balanceOf(alice.address);
      expect(after - before).to.equal(500n);
    });

    it("alice can now afford a Free Day Pass (costs 500 pts)", async function () {
      // alice needs exactly 500 pts — award enough to reach it if needed
      const bal = await loyaltyToken.balanceOf(alice.address);
      if (bal < 500n) {
        await gymBranchA.connect(gymOwnerA).awardPoints(alice.address, 500n - bal, "Top-up");
      }
      await gymBranchA.connect(alice).redeemProduct(1); // Free Day Pass
      expect(await shopA.balanceOf(alice.address, 1)).to.be.greaterThanOrEqual(1n);
    });
  });

  // ── Fee splitting ─────────────────────────────────────────────────────────

  describe("payment splitting & treasury collection", function () {
    it("Gym A pays subscription; fee is split 20/80", async function () {
      const beforeTreasury = await paymentSplitter.accumulatedTreasuryFees();
      const beforeGymOwner = await paymentSplitter.getAccumulatedFees(gymOwnerA.address);

      await gymBranchA.connect(gymOwnerA).payMonthlyFee({ value: MONTHLY_FEE });

      const platformCut = (MONTHLY_FEE * 20n) / 100n;
      const gymCut      = MONTHLY_FEE - platformCut;

      expect(await paymentSplitter.accumulatedTreasuryFees()).to.equal(beforeTreasury + platformCut);
      expect(await paymentSplitter.getAccumulatedFees(gymOwnerA.address)).to.equal(beforeGymOwner + gymCut);
    });

    it("gym owner withdraws their share", async function () {
      const pending = await paymentSplitter.getAccumulatedFees(gymOwnerA.address);
      if (pending === 0n) {
        await gymBranchA.connect(gymOwnerA).payMonthlyFee({ value: MONTHLY_FEE });
      }
      await expect(paymentSplitter.connect(gymOwnerA).withdrawGymFees()).not.to.be.reverted;
      expect(await paymentSplitter.getAccumulatedFees(gymOwnerA.address)).to.equal(0n);
    });

    it("platform owner collects treasury fees", async function () {
      // Ensure something is accumulated
      const pending = await paymentSplitter.accumulatedTreasuryFees();
      if (pending === 0n) {
        await gymBranchA.connect(gymOwnerA).payMonthlyFee({ value: MONTHLY_FEE });
        await gymBranchB.connect(gymOwnerB).payMonthlyFee({ value: MONTHLY_FEE });
      }
      await expect(factory.connect(platform).collectPlatformFees()).not.to.be.reverted;
      expect(await paymentSplitter.accumulatedTreasuryFees()).to.equal(0n);
    });
  });

  // ── Subscription lifecycle ────────────────────────────────────────────────

  describe("subscription lifecycle", function () {
    it("gym deactivates when subscription expires, blocks check-ins", async function () {
      // Deploy a short-lived gym for this specific test
      await factory.connect(platform).deployGymBranch(
        "Temp Gym", gymOwnerA.address, MONTHLY_FEE, POINTS_A
      );
      const gyms  = await factory.getRegisteredGyms();
      const temp  = await ethers.getContractAt("GymBranch", gyms[gyms.length - 1]) as GymBranch;

      // Advance past the 30-day grace period
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);

      await temp.deactivate();
      expect(await temp.isActive()).to.be.false;

      await expect(temp.connect(gymOwnerA).checkIn(alice.address))
        .to.be.revertedWith("GymBranch: gym not active");
    });

    it("gym reactivates after paying a new fee", async function () {
      const gyms = await factory.getRegisteredGyms();
      const temp = await ethers.getContractAt("GymBranch", gyms[gyms.length - 1]) as GymBranch;

      // Pay to reactivate
      await temp.connect(gymOwnerA).payMonthlyFee({ value: MONTHLY_FEE });
      expect(await temp.isActive()).to.be.true;

      // Register alice in temp, then verify check-in works
      await temp.connect(gymOwnerA).registerMember(alice.address);
      await expect(temp.connect(gymOwnerA).checkIn(alice.address)).not.to.be.reverted;
    });
  });

  // ── Member status management ──────────────────────────────────────────────

  describe("member status", function () {
    it("gym owner can suspend a member", async function () {
      await gymBranchA.connect(gymOwnerA).setMemberStatus(bob.address, 2); // SUSPENDED
      await expect(gymBranchA.connect(gymOwnerA).checkIn(bob.address))
        .to.be.revertedWith("GymBranch: member suspended");
    });

    it("gym owner can reinstate the member", async function () {
      await gymBranchA.connect(gymOwnerA).setMemberStatus(bob.address, 0); // ACTIVE
      await expect(gymBranchA.connect(gymOwnerA).checkIn(bob.address)).not.to.be.reverted;
    });
  });

  // ── Product lifecycle ─────────────────────────────────────────────────────

  describe("product lifecycle", function () {
    it("gym owner can remove a product", async function () {
      await gymBranchA.connect(gymOwnerA).addProduct("Temp Item", "", 10n, 0, 1);
      const nextId = Number(await shopA.nextProductId()) - 1;
      await gymBranchA.connect(gymOwnerA).removeProduct(nextId);
      const p = await shopA.getProduct(nextId);
      expect(p.isActive).to.be.false;
    });

    it("gym owner can restock a product", async function () {
      await gymBranchA.connect(gymOwnerA).updateProductStock(0, 99n);
      const p = await shopA.getProduct(0);
      expect(p.stock).to.equal(99n);
    });
  });
});
