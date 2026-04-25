import { expect } from "chai";
import { ethers } from "hardhat";
import { LoyaltyToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("LoyaltyToken", function () {
  let token: LoyaltyToken;
  let admin: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let burner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  let MINTER_ROLE: string;
  let BURNER_ROLE: string;

  beforeEach(async function () {
    [admin, minter, burner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LoyaltyToken");
    token = (await Factory.deploy(admin.address)) as LoyaltyToken;
    await token.waitForDeployment();

    MINTER_ROLE = await token.MINTER_ROLE();
    BURNER_ROLE  = await token.BURNER_ROLE();

    await token.connect(admin).grantRole(MINTER_ROLE, minter.address);
    await token.connect(admin).grantRole(BURNER_ROLE,  burner.address);
  });

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("deployment", function () {
    it("sets the correct name and symbol", async function () {
      expect(await token.name()).to.equal("GymFinder Points");
      expect(await token.symbol()).to.equal("GFP");
    });

    it("has 0 decimals", async function () {
      expect(await token.decimals()).to.equal(0);
    });

    it("mints zero supply on deployment", async function () {
      expect(await token.totalSupply()).to.equal(0n);
    });

    it("grants DEFAULT_ADMIN_ROLE to admin", async function () {
      const DEFAULT_ADMIN = await token.DEFAULT_ADMIN_ROLE();
      expect(await token.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
    });
  });

  // ── mint() ────────────────────────────────────────────────────────────────

  describe("mint()", function () {
    it("mints tokens to the recipient", async function () {
      await token.connect(minter).mint(alice.address, 100n);
      expect(await token.balanceOf(alice.address)).to.equal(100n);
    });

    it("increases total supply", async function () {
      await token.connect(minter).mint(alice.address, 50n);
      await token.connect(minter).mint(bob.address,   50n);
      expect(await token.totalSupply()).to.equal(100n);
    });

    it("reverts when called without MINTER_ROLE", async function () {
      await expect(
        token.connect(alice).mint(alice.address, 100n)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("allows minting 0 tokens without reverting", async function () {
      await expect(token.connect(minter).mint(alice.address, 0n)).not.to.be.reverted;
    });
  });

  // ── burn() ────────────────────────────────────────────────────────────────

  describe("burn()", function () {
    beforeEach(async function () {
      await token.connect(minter).mint(alice.address, 500n);
    });

    it("burns tokens from the account", async function () {
      await token.connect(burner).burn(alice.address, 200n);
      expect(await token.balanceOf(alice.address)).to.equal(300n);
    });

    it("decreases total supply", async function () {
      await token.connect(burner).burn(alice.address, 500n);
      expect(await token.totalSupply()).to.equal(0n);
    });

    it("reverts when called without BURNER_ROLE", async function () {
      await expect(
        token.connect(alice).burn(alice.address, 100n)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("reverts when burning more than balance", async function () {
      await expect(
        token.connect(burner).burn(alice.address, 600n)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  // ── Role management ───────────────────────────────────────────────────────

  describe("role management", function () {
    it("admin can revoke MINTER_ROLE", async function () {
      await token.connect(admin).revokeRole(MINTER_ROLE, minter.address);
      await expect(
        token.connect(minter).mint(alice.address, 100n)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("non-admin cannot grant roles", async function () {
      await expect(
        token.connect(alice).grantRole(MINTER_ROLE, bob.address)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  // ── Standard ERC-20 transfers ─────────────────────────────────────────────

  describe("ERC-20 transfers", function () {
    beforeEach(async function () {
      await token.connect(minter).mint(alice.address, 300n);
    });

    it("transfers between accounts", async function () {
      await token.connect(alice).transfer(bob.address, 100n);
      expect(await token.balanceOf(alice.address)).to.equal(200n);
      expect(await token.balanceOf(bob.address)).to.equal(100n);
    });

    it("transfers via approve + transferFrom", async function () {
      await token.connect(alice).approve(bob.address, 150n);
      await token.connect(bob).transferFrom(alice.address, bob.address, 150n);
      expect(await token.balanceOf(alice.address)).to.equal(150n);
    });
  });
});
