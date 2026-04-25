import { expect } from "chai";
import { ethers } from "hardhat";
import {
  GymBranch,
  LoyaltyToken,
  ShopProduct,
  PaymentSplitter,
} from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("GymBranch", function () {
  let gymBranch: GymBranch;
  let loyaltyToken: LoyaltyToken;
  let shopProduct: ShopProduct;
  let paymentSplitter: PaymentSplitter;

  let factoryOwner: HardhatEthersSigner; // acts as factory & token admin
  let gymOwner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;

  const MONTHLY_FEE   = ethers.parseEther("0.01");
  const POINTS_PER_VISIT = 100n;

  beforeEach(async function () {
    [factoryOwner, gymOwner, alice, bob, treasury] = await ethers.getSigners();

    // Deploy LoyaltyToken (admin = factoryOwner)
    const LTFactory = await ethers.getContractFactory("LoyaltyToken");
    loyaltyToken = (await LTFactory.deploy(factoryOwner.address)) as LoyaltyToken;

    // Deploy PaymentSplitter
    const PSFactory = await ethers.getContractFactory("PaymentSplitter");
    paymentSplitter = (await PSFactory.deploy(
      treasury.address,
      20,                  // 20% platform cut
      factoryOwner.address // owner = factoryOwner (plays factory role in unit tests)
    )) as PaymentSplitter;

    // Deploy GymBranch (factory = factoryOwner)
    const GBFactory = await ethers.getContractFactory("GymBranch");
    gymBranch = (await GBFactory.deploy(
      "Test Gym",
      gymOwner.address,
      MONTHLY_FEE,
      POINTS_PER_VISIT,
      await loyaltyToken.getAddress(),
      await paymentSplitter.getAddress(),
      factoryOwner.address // factory
    )) as GymBranch;

    // Deploy ShopProduct (owner = gymBranch)
    const SPFactory = await ethers.getContractFactory("ShopProduct");
    shopProduct = (await SPFactory.deploy(
      await gymBranch.getAddress()
    )) as ShopProduct;

    // Link ShopProduct (called by factory = factoryOwner)
    await gymBranch.connect(factoryOwner).setShopProduct(await shopProduct.getAddress());

    // Grant GymBranch minter + burner roles on LoyaltyToken
    const MINTER = await loyaltyToken.MINTER_ROLE();
    const BURNER  = await loyaltyToken.BURNER_ROLE();
    await loyaltyToken.connect(factoryOwner).grantRole(MINTER, await gymBranch.getAddress());
    await loyaltyToken.connect(factoryOwner).grantRole(BURNER,  await gymBranch.getAddress());
  });

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("deployment", function () {
    it("stores the gym name", async function () {
      expect(await gymBranch.gymName()).to.equal("Test Gym");
    });

    it("sets gym owner", async function () {
      expect(await gymBranch.owner()).to.equal(gymOwner.address);
    });

    it("starts as active", async function () {
      expect(await gymBranch.isActive()).to.be.true;
    });

    it("links the shop product", async function () {
      expect(await gymBranch.shopProduct()).to.equal(await shopProduct.getAddress());
    });

    it("defaults checkInRateLimitHours to 20", async function () {
      expect(await gymBranch.checkInRateLimitHours()).to.equal(20n);
    });

    it("defaults allowSelfRegistration to false", async function () {
      expect(await gymBranch.allowSelfRegistration()).to.be.false;
    });

    it("starts with zero members", async function () {
      expect(await gymBranch.getMemberCount()).to.equal(0n);
    });

    it("subscriptionExpiresAt is 30 days after deployment", async function () {
      const expiresAt = await gymBranch.subscriptionExpiresAt();
      const block = await ethers.provider.getBlock("latest");
      expect(expiresAt).to.be.closeTo(BigInt(block!.timestamp) + BigInt(30 * 24 * 3600), 5n);
    });
  });

  // ── setShopProduct ────────────────────────────────────────────────────────

  describe("setShopProduct()", function () {
    it("reverts when called again (already set)", async function () {
      await expect(
        gymBranch.connect(factoryOwner).setShopProduct(alice.address)
      ).to.be.revertedWith("GymBranch: shop already set");
    });

    it("reverts when called by non-factory", async function () {
      const GBFactory = await ethers.getContractFactory("GymBranch");
      const fresh = (await GBFactory.deploy(
        "Fresh",
        gymOwner.address,
        MONTHLY_FEE,
        POINTS_PER_VISIT,
        await loyaltyToken.getAddress(),
        await paymentSplitter.getAddress(),
        factoryOwner.address
      )) as GymBranch;
      await expect(
        fresh.connect(gymOwner).setShopProduct(alice.address)
      ).to.be.revertedWith("GymBranch: not factory");
    });
  });

  // ── operators ─────────────────────────────────────────────────────────────

  describe("operators", function () {
    it("owner can add an operator", async function () {
      await gymBranch.connect(gymOwner).addOperator(alice.address);
      expect(await gymBranch.isOperator(alice.address)).to.be.true;
    });

    it("emits OperatorAdded", async function () {
      await expect(gymBranch.connect(gymOwner).addOperator(alice.address))
        .to.emit(gymBranch, "OperatorAdded")
        .withArgs(alice.address);
    });

    it("owner can remove an operator", async function () {
      await gymBranch.connect(gymOwner).addOperator(alice.address);
      await gymBranch.connect(gymOwner).removeOperator(alice.address);
      expect(await gymBranch.isOperator(alice.address)).to.be.false;
    });

    it("emits OperatorRemoved", async function () {
      await gymBranch.connect(gymOwner).addOperator(alice.address);
      await expect(gymBranch.connect(gymOwner).removeOperator(alice.address))
        .to.emit(gymBranch, "OperatorRemoved")
        .withArgs(alice.address);
    });

    it("reverts adding zero address", async function () {
      await expect(gymBranch.connect(gymOwner).addOperator(ethers.ZeroAddress))
        .to.be.revertedWith("GymBranch: zero address");
    });

    it("reverts adding an address that is already an operator", async function () {
      await gymBranch.connect(gymOwner).addOperator(alice.address);
      await expect(gymBranch.connect(gymOwner).addOperator(alice.address))
        .to.be.revertedWith("GymBranch: already operator");
    });

    it("reverts removing an address that is not an operator", async function () {
      await expect(gymBranch.connect(gymOwner).removeOperator(alice.address))
        .to.be.revertedWith("GymBranch: not operator");
    });

    it("reverts when non-owner tries to add operator", async function () {
      await expect(gymBranch.connect(alice).addOperator(bob.address))
        .to.be.revertedWithCustomError(gymBranch, "OwnableUnauthorizedAccount");
    });

    it("operator can check in a registered member", async function () {
      await gymBranch.connect(gymOwner).addOperator(alice.address);
      await gymBranch.connect(gymOwner).registerMember(bob.address);
      await expect(gymBranch.connect(alice).checkIn(bob.address)).not.to.be.reverted;
    });

    it("non-operator cannot check in", async function () {
      await gymBranch.connect(gymOwner).registerMember(bob.address);
      await expect(gymBranch.connect(alice).checkIn(bob.address))
        .to.be.revertedWith("GymBranch: not operator");
    });
  });

  // ── member registration ────────────────────────────────────────────────────

  describe("registerMember / unregisterMember", function () {
    it("owner can register a member", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      expect(await gymBranch.isMember(alice.address)).to.be.true;
    });

    it("operator can register a member", async function () {
      await gymBranch.connect(gymOwner).addOperator(alice.address);
      await gymBranch.connect(alice).registerMember(bob.address);
      expect(await gymBranch.isMember(bob.address)).to.be.true;
    });

    it("self-registration reverts when disabled (default)", async function () {
      await expect(gymBranch.connect(alice).registerMember(alice.address))
        .to.be.revertedWith("GymBranch: not authorized");
    });

    it("self-registration works when enabled", async function () {
      await gymBranch.connect(gymOwner).setAllowSelfRegistration(true);
      await gymBranch.connect(alice).registerMember(alice.address);
      expect(await gymBranch.isMember(alice.address)).to.be.true;
    });

    it("self-registration cannot register a different address", async function () {
      await gymBranch.connect(gymOwner).setAllowSelfRegistration(true);
      await expect(gymBranch.connect(alice).registerMember(bob.address))
        .to.be.revertedWith("GymBranch: not authorized");
    });

    it("emits MemberRegistered", async function () {
      await expect(gymBranch.connect(gymOwner).registerMember(alice.address))
        .to.emit(gymBranch, "MemberRegistered")
        .withArgs(alice.address);
    });

    it("reverts on duplicate registration", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await expect(gymBranch.connect(gymOwner).registerMember(alice.address))
        .to.be.revertedWith("GymBranch: already a member");
    });

    it("emits SelfRegistrationUpdated", async function () {
      await expect(gymBranch.connect(gymOwner).setAllowSelfRegistration(true))
        .to.emit(gymBranch, "SelfRegistrationUpdated")
        .withArgs(true);
    });

    it("owner can unregister a member", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await gymBranch.connect(gymOwner).unregisterMember(alice.address);
      expect(await gymBranch.isMember(alice.address)).to.be.false;
    });

    it("emits MemberUnregistered", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await expect(gymBranch.connect(gymOwner).unregisterMember(alice.address))
        .to.emit(gymBranch, "MemberUnregistered")
        .withArgs(alice.address);
    });

    it("unregister reverts for non-member", async function () {
      await expect(gymBranch.connect(gymOwner).unregisterMember(alice.address))
        .to.be.revertedWith("GymBranch: not a member");
    });

    it("getMembers returns the full member list", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await gymBranch.connect(gymOwner).registerMember(bob.address);
      const members = await gymBranch.getMembers();
      expect(members).to.have.length(2);
      expect(members).to.include(alice.address);
      expect(members).to.include(bob.address);
    });

    it("unregister removes member from list (swap-and-pop)", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await gymBranch.connect(gymOwner).registerMember(bob.address);
      await gymBranch.connect(gymOwner).unregisterMember(alice.address);
      const members = await gymBranch.getMembers();
      expect(members).to.have.length(1);
      expect(members).to.include(bob.address);
      expect(members).to.not.include(alice.address);
    });

    it("non-owner cannot unregister", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await expect(gymBranch.connect(alice).unregisterMember(alice.address))
        .to.be.revertedWithCustomError(gymBranch, "OwnableUnauthorizedAccount");
    });
  });

  // ── checkIn() ─────────────────────────────────────────────────────────────

  describe("checkIn()", function () {
    beforeEach(async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await gymBranch.connect(gymOwner).registerMember(bob.address);
      // disable rate limit so back-to-back checkIns work in these unit tests
      await gymBranch.connect(gymOwner).setCheckInRateLimit(0);
    });

    it("mints loyaltyPointsPerVisit tokens to the member", async function () {
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(POINTS_PER_VISIT);
    });

    it("increments the visit counter", async function () {
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      expect(await gymBranch.visitCount(alice.address)).to.equal(2n);
    });

    it("tracks totalPointsEarned", async function () {
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      expect(await gymBranch.totalPointsEarned(alice.address)).to.equal(POINTS_PER_VISIT);
    });

    it("emits CheckedIn event with correct args", async function () {
      await expect(gymBranch.connect(gymOwner).checkIn(alice.address))
        .to.emit(gymBranch, "CheckedIn")
        .withArgs(alice.address, POINTS_PER_VISIT, 1n);
    });

    it("reverts for an unregistered user", async function () {
      const [, , , , , stranger] = await ethers.getSigners();
      await expect(gymBranch.connect(gymOwner).checkIn(stranger.address))
        .to.be.revertedWith("GymBranch: not a member");
    });

    it("reverts when called by non-operator", async function () {
      await expect(gymBranch.connect(alice).checkIn(alice.address))
        .to.be.revertedWith("GymBranch: not operator");
    });

    it("reverts when gym is inactive", async function () {
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await gymBranch.deactivate();

      await expect(gymBranch.connect(gymOwner).checkIn(alice.address))
        .to.be.revertedWith("GymBranch: gym not active");
    });

    it("reverts for a suspended member", async function () {
      await gymBranch.connect(gymOwner).setMemberStatus(alice.address, 2); // SUSPENDED
      await expect(gymBranch.connect(gymOwner).checkIn(alice.address))
        .to.be.revertedWith("GymBranch: member suspended");
    });

    it("independent counters per member", async function () {
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).checkIn(bob.address);
      expect(await gymBranch.visitCount(alice.address)).to.equal(2n);
      expect(await gymBranch.visitCount(bob.address)).to.equal(1n);
    });

    it("records lastCheckInTimestamp", async function () {
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      const ts = await gymBranch.lastCheckInTimestamp(alice.address);
      const block = await ethers.provider.getBlock("latest");
      expect(ts).to.equal(BigInt(block!.timestamp));
    });
  });

  // ── setCheckInRateLimit() ──────────────────────────────────────────────────

  describe("setCheckInRateLimit()", function () {
    beforeEach(async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
    });

    it("blocks a second check-in within the rate limit window", async function () {
      await gymBranch.connect(gymOwner).setCheckInRateLimit(24); // 24-hour cooldown
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await expect(gymBranch.connect(gymOwner).checkIn(alice.address))
        .to.be.revertedWith("GymBranch: check-in rate limit");
    });

    it("allows a check-in after the cooldown expires", async function () {
      await gymBranch.connect(gymOwner).setCheckInRateLimit(24);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await ethers.provider.send("evm_increaseTime", [25 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await expect(gymBranch.connect(gymOwner).checkIn(alice.address)).not.to.be.reverted;
    });

    it("setting limit to 0 removes the restriction", async function () {
      await gymBranch.connect(gymOwner).setCheckInRateLimit(1);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).setCheckInRateLimit(0);
      await expect(gymBranch.connect(gymOwner).checkIn(alice.address)).not.to.be.reverted;
    });

    it("emits CheckInRateLimitUpdated", async function () {
      await expect(gymBranch.connect(gymOwner).setCheckInRateLimit(12))
        .to.emit(gymBranch, "CheckInRateLimitUpdated")
        .withArgs(12n);
    });

    it("reverts when called by non-owner", async function () {
      await expect(gymBranch.connect(alice).setCheckInRateLimit(24))
        .to.be.revertedWithCustomError(gymBranch, "OwnableUnauthorizedAccount");
    });
  });

  // ── redeemProduct() ───────────────────────────────────────────────────────

  describe("redeemProduct()", function () {
    const PRODUCT_COST = 300n;

    beforeEach(async function () {
      await gymBranch.connect(gymOwner).setCheckInRateLimit(0);
      await gymBranch.connect(gymOwner).addProduct(
        "Free Protein",
        "A scoop of protein powder",
        PRODUCT_COST,
        0, // PHYSICAL
        10  // stock
      );
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await gymBranch.connect(gymOwner).registerMember(bob.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address); // 300 points
    });

    it("burns correct number of loyalty tokens", async function () {
      await gymBranch.connect(alice).redeemProduct(0);
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(0n);
    });

    it("mints an ERC-1155 proof to the member", async function () {
      await gymBranch.connect(alice).redeemProduct(0);
      expect(await shopProduct.balanceOf(alice.address, 0)).to.equal(1n);
    });

    it("decrements product stock", async function () {
      await gymBranch.connect(alice).redeemProduct(0);
      const p = await shopProduct.getProduct(0);
      expect(p.stock).to.equal(9n);
    });

    it("tracks totalPointsSpent", async function () {
      await gymBranch.connect(alice).redeemProduct(0);
      expect(await gymBranch.totalPointsSpent(alice.address)).to.equal(PRODUCT_COST);
    });

    it("emits ProductRedeemed", async function () {
      await expect(gymBranch.connect(alice).redeemProduct(0))
        .to.emit(gymBranch, "ProductRedeemed")
        .withArgs(alice.address, 0n, PRODUCT_COST);
    });

    it("reverts for a non-member", async function () {
      const [, , , , , stranger] = await ethers.getSigners();
      await expect(gymBranch.connect(stranger).redeemProduct(0))
        .to.be.revertedWith("GymBranch: not a member");
    });

    it("reverts when balance is insufficient", async function () {
      // bob is a member but has no points
      await expect(gymBranch.connect(bob).redeemProduct(0))
        .to.be.revertedWith("GymBranch: insufficient points");
    });

    it("reverts for a suspended member", async function () {
      await gymBranch.connect(gymOwner).setMemberStatus(alice.address, 2);
      await expect(gymBranch.connect(alice).redeemProduct(0))
        .to.be.revertedWith("GymBranch: member suspended");
    });

    it("reverts when product is inactive", async function () {
      await gymBranch.connect(gymOwner).removeProduct(0);
      await expect(gymBranch.connect(alice).redeemProduct(0))
        .to.be.revertedWith("GymBranch: product not active");
    });

    it("reverts when out of stock", async function () {
      await gymBranch.connect(gymOwner).updateProductStock(0, 0);
      await expect(gymBranch.connect(alice).redeemProduct(0))
        .to.be.revertedWith("ShopProduct: out of stock");
    });
  });

  // ── redeemFor() ───────────────────────────────────────────────────────────

  describe("redeemFor()", function () {
    const PRODUCT_COST = 200n;

    beforeEach(async function () {
      await gymBranch.connect(gymOwner).setCheckInRateLimit(0);
      await gymBranch.connect(gymOwner).addProduct("Shake", "", PRODUCT_COST, 0, 10);
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address); // 200 points
    });

    it("operator can redeem on behalf of a member", async function () {
      await gymBranch.connect(gymOwner).addOperator(bob.address);
      await gymBranch.connect(bob).redeemFor(alice.address, 0);
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(0n);
      expect(await shopProduct.balanceOf(alice.address, 0)).to.equal(1n);
    });

    it("owner can use redeemFor directly", async function () {
      await gymBranch.connect(gymOwner).redeemFor(alice.address, 0);
      expect(await shopProduct.balanceOf(alice.address, 0)).to.equal(1n);
    });

    it("burns tokens from the member, not the operator", async function () {
      await gymBranch.connect(gymOwner).addOperator(bob.address);
      const opBalBefore = await loyaltyToken.balanceOf(bob.address);
      await gymBranch.connect(bob).redeemFor(alice.address, 0);
      expect(await loyaltyToken.balanceOf(bob.address)).to.equal(opBalBefore);
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(0n);
    });

    it("mints NFT to the member, not the operator", async function () {
      await gymBranch.connect(gymOwner).addOperator(bob.address);
      await gymBranch.connect(bob).redeemFor(alice.address, 0);
      expect(await shopProduct.balanceOf(alice.address, 0)).to.equal(1n);
      expect(await shopProduct.balanceOf(bob.address, 0)).to.equal(0n);
    });

    it("emits ProductRedeemed with the member's address", async function () {
      await expect(gymBranch.connect(gymOwner).redeemFor(alice.address, 0))
        .to.emit(gymBranch, "ProductRedeemed")
        .withArgs(alice.address, 0n, PRODUCT_COST);
    });

    it("reverts if non-operator calls it", async function () {
      await expect(gymBranch.connect(alice).redeemFor(alice.address, 0))
        .to.be.revertedWith("GymBranch: not operator");
    });

    it("reverts if the member is not registered", async function () {
      const [, , , , , stranger] = await ethers.getSigners();
      await expect(gymBranch.connect(gymOwner).redeemFor(stranger.address, 0))
        .to.be.revertedWith("GymBranch: not a member");
    });

    it("reverts if the member is suspended", async function () {
      await gymBranch.connect(gymOwner).setMemberStatus(alice.address, 2);
      await expect(gymBranch.connect(gymOwner).redeemFor(alice.address, 0))
        .to.be.revertedWith("GymBranch: member suspended");
    });

    it("reverts if the member has insufficient points", async function () {
      await gymBranch.connect(gymOwner).registerMember(bob.address);
      await expect(gymBranch.connect(gymOwner).redeemFor(bob.address, 0))
        .to.be.revertedWith("GymBranch: insufficient points");
    });
  });

  // ── awardPoints() ─────────────────────────────────────────────────────────

  describe("awardPoints()", function () {
    beforeEach(async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
    });

    it("mints bonus points to a member", async function () {
      await gymBranch.connect(gymOwner).awardPoints(alice.address, 50n, "Birthday bonus");
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(50n);
    });

    it("emits PointsAwarded", async function () {
      await expect(gymBranch.connect(gymOwner).awardPoints(alice.address, 50n, "Referral"))
        .to.emit(gymBranch, "PointsAwarded")
        .withArgs(alice.address, 50n, "Referral");
    });

    it("reverts for a non-member", async function () {
      await expect(gymBranch.connect(gymOwner).awardPoints(bob.address, 50n, "Gift"))
        .to.be.revertedWith("GymBranch: not a member");
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        gymBranch.connect(alice).awardPoints(alice.address, 50n, "Cheat")
      ).to.be.revertedWithCustomError(gymBranch, "OwnableUnauthorizedAccount");
    });
  });

  // ── payMonthlyFee() ───────────────────────────────────────────────────────

  describe("payMonthlyFee()", function () {
    it("accepts the correct fee amount", async function () {
      await expect(
        gymBranch.connect(gymOwner).payMonthlyFee({ value: MONTHLY_FEE })
      ).not.to.be.reverted;
    });

    it("splits the payment via PaymentSplitter", async function () {
      await gymBranch.connect(gymOwner).payMonthlyFee({ value: MONTHLY_FEE });
      // 20% → treasury, 80% → gymOwner
      const platformCut = (MONTHLY_FEE * 20n) / 100n;
      const gymCut      = MONTHLY_FEE - platformCut;
      expect(await paymentSplitter.accumulatedTreasuryFees()).to.equal(platformCut);
      expect(await paymentSplitter.getAccumulatedFees(gymOwner.address)).to.equal(gymCut);
    });

    it("emits SubscriptionPaid", async function () {
      await expect(
        gymBranch.connect(gymOwner).payMonthlyFee({ value: MONTHLY_FEE })
      ).to.emit(gymBranch, "SubscriptionPaid");
    });

    it("reverts when wrong amount sent", async function () {
      await expect(
        gymBranch.connect(gymOwner).payMonthlyFee({ value: MONTHLY_FEE - 1n })
      ).to.be.revertedWith("GymBranch: wrong fee amount");
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        gymBranch.connect(alice).payMonthlyFee({ value: MONTHLY_FEE })
      ).to.be.revertedWithCustomError(gymBranch, "OwnableUnauthorizedAccount");
    });
  });

  // ── Subscription & deactivation ───────────────────────────────────────────

  describe("subscription & deactivation", function () {
    it("reports active within 30 days", async function () {
      expect(await gymBranch.checkSubscriptionStatus()).to.be.true;
    });

    it("reports expired after 30 days", async function () {
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      expect(await gymBranch.checkSubscriptionStatus()).to.be.false;
    });

    it("can be deactivated after expiry", async function () {
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await gymBranch.deactivate();
      expect(await gymBranch.isActive()).to.be.false;
    });

    it("cannot deactivate while still active", async function () {
      await expect(gymBranch.deactivate())
        .to.be.revertedWith("GymBranch: subscription still active");
    });

    it("reactivates when fee is paid after expiry", async function () {
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await gymBranch.deactivate();
      await gymBranch.connect(gymOwner).payMonthlyFee({ value: MONTHLY_FEE });
      expect(await gymBranch.isActive()).to.be.true;
    });
  });

  // ── getMemberInfo() ───────────────────────────────────────────────────────

  describe("getMemberInfo()", function () {
    it("returns correct aggregated member data", async function () {
      await gymBranch.connect(gymOwner).registerMember(alice.address);
      await gymBranch.connect(gymOwner).setCheckInRateLimit(0);
      await gymBranch.connect(gymOwner).checkIn(alice.address);
      await gymBranch.connect(gymOwner).checkIn(alice.address);

      // Add product & redeem
      await gymBranch.connect(gymOwner).addProduct("Towel", "", 150n, 0, 5);
      await gymBranch.connect(alice).redeemProduct(0);

      const info = await gymBranch.getMemberInfo(alice.address);
      expect(info.visits).to.equal(2n);
      expect(info.pointsEarned).to.equal(POINTS_PER_VISIT * 2n);
      expect(info.pointsSpent).to.equal(150n);
      expect(info.pointBalance).to.equal(POINTS_PER_VISIT * 2n - 150n);
      expect(info.status).to.equal(0n); // ACTIVE
      expect(info.lastCheckIn).to.be.greaterThan(0n);
    });
  });
});
