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

  // ── checkIn() ─────────────────────────────────────────────────────────────

  describe("checkIn()", function () {
    it("mints loyaltyPointsPerVisit tokens to the member", async function () {
      await gymBranch.connect(alice).checkIn();
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(POINTS_PER_VISIT);
    });

    it("increments the visit counter", async function () {
      await gymBranch.connect(alice).checkIn();
      await gymBranch.connect(alice).checkIn();
      expect(await gymBranch.visitCount(alice.address)).to.equal(2n);
    });

    it("tracks totalPointsEarned", async function () {
      await gymBranch.connect(alice).checkIn();
      expect(await gymBranch.totalPointsEarned(alice.address)).to.equal(POINTS_PER_VISIT);
    });

    it("emits CheckedIn event with correct args", async function () {
      await expect(gymBranch.connect(alice).checkIn())
        .to.emit(gymBranch, "CheckedIn")
        .withArgs(alice.address, POINTS_PER_VISIT, 1n);
    });

    it("reverts when gym is inactive", async function () {
      // Expire subscription by warping time past 30 days
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await gymBranch.deactivate();

      await expect(gymBranch.connect(alice).checkIn())
        .to.be.revertedWith("GymBranch: gym not active");
    });

    it("reverts for a suspended member", async function () {
      await gymBranch.connect(gymOwner).setMemberStatus(alice.address, 2); // SUSPENDED
      await expect(gymBranch.connect(alice).checkIn())
        .to.be.revertedWith("GymBranch: member suspended");
    });

    it("independent counters per member", async function () {
      await gymBranch.connect(alice).checkIn();
      await gymBranch.connect(alice).checkIn();
      await gymBranch.connect(bob).checkIn();
      expect(await gymBranch.visitCount(alice.address)).to.equal(2n);
      expect(await gymBranch.visitCount(bob.address)).to.equal(1n);
    });
  });

  // ── redeemProduct() ───────────────────────────────────────────────────────

  describe("redeemProduct()", function () {
    const PRODUCT_COST = 300n;

    beforeEach(async function () {
      // Add a product (gym owner → GymBranch → ShopProduct)
      await gymBranch.connect(gymOwner).addProduct(
        "Free Protein",
        "A scoop of protein powder",
        PRODUCT_COST,
        0, // PHYSICAL
        10  // stock
      );
      // Give alice enough points
      await gymBranch.connect(alice).checkIn();
      await gymBranch.connect(alice).checkIn();
      await gymBranch.connect(alice).checkIn(); // 300 points
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

    it("reverts when balance is insufficient", async function () {
      // bob has no points
      await expect(gymBranch.connect(bob).redeemProduct(0))
        .to.be.revertedWith("GymBranch: insufficient points");
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

  // ── awardPoints() ─────────────────────────────────────────────────────────

  describe("awardPoints()", function () {
    it("mints bonus points to a member", async function () {
      await gymBranch.connect(gymOwner).awardPoints(alice.address, 50n, "Birthday bonus");
      expect(await loyaltyToken.balanceOf(alice.address)).to.equal(50n);
    });

    it("emits PointsAwarded", async function () {
      await expect(gymBranch.connect(gymOwner).awardPoints(alice.address, 50n, "Referral"))
        .to.emit(gymBranch, "PointsAwarded")
        .withArgs(alice.address, 50n, "Referral");
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
      await gymBranch.connect(alice).checkIn();
      await gymBranch.connect(alice).checkIn();

      // Add product & redeem
      await gymBranch.connect(gymOwner).addProduct("Towel", "", 150n, 0, 5);
      await gymBranch.connect(alice).redeemProduct(0);

      const info = await gymBranch.getMemberInfo(alice.address);
      expect(info.visits).to.equal(2n);
      expect(info.pointsEarned).to.equal(POINTS_PER_VISIT * 2n);
      expect(info.pointsSpent).to.equal(150n);
      expect(info.pointBalance).to.equal(POINTS_PER_VISIT * 2n - 150n);
      expect(info.status).to.equal(0n); // ACTIVE
    });
  });
});
