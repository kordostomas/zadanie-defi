// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LoyaltyToken.sol";
import "./ShopProduct.sol";
import "./GymBranch.sol";
import "./PaymentSplitter.sol";

/// @title  GymFinderFactory
/// @notice Platform owner contract — deployed once by GymFinder.
///
///         On deployment
///           - Creates the global LoyaltyToken (ERC-20, admin = this factory).
///           - Creates the shared PaymentSplitter (owner = this factory,
///             treasury = deployer wallet).
///
///         Per gym
///           - deployGymBranch() creates a GymBranch + ShopProduct pair,
///             links them, and grants the branch minter/burner roles on the
///             global LoyaltyToken.
///
///         Fee management
///           - collectPlatformFees() pulls treasury ETH from the splitter.
///           - updateFeePercent() adjusts the split going forward.
contract GymFinderFactory is Ownable {
    LoyaltyToken    public immutable loyaltyToken;
    PaymentSplitter public immutable paymentSplitter;

    address[] public registeredGyms;
    mapping(address => bool)    public isRegisteredGym;
    mapping(address => address) public gymShopProduct;  // gymBranch → shopProduct
    mapping(address => address) public gymOwnerOf;      // gymBranch → gym owner EOA

    uint256 public platformFeePercent;

    event GymBranchDeployed(
        address indexed gymBranch,
        address indexed shopProduct,
        address indexed gymOwner,
        string  name
    );
    event PlatformFeeUpdated(uint256 newPercent);
    event PlatformFeesCollected(uint256 amount);

    /// @param _platformFeePercent  Percentage (0–100) of monthly fees kept by the platform.
    constructor(uint256 _platformFeePercent) Ownable(msg.sender) {
        require(_platformFeePercent <= 100, "GymFinderFactory: invalid fee");
        platformFeePercent = _platformFeePercent;

        // Global loyalty points token; factory = admin so it can grant roles.
        loyaltyToken = new LoyaltyToken(address(this));

        // Shared payment splitter; treasury = deployer wallet, owner = factory.
        paymentSplitter = new PaymentSplitter(
            msg.sender,           // treasury → deployer
            _platformFeePercent,
            address(this)         // owner    → factory
        );
    }

    // ── Gym deployment ────────────────────────────────────────────────────────

    /// @notice Deploy a new gym branch on the platform.
    /// @param gymName       Display name of the gym.
    /// @param gymOwner      Wallet that will own and manage the GymBranch.
    /// @param monthlyFee    Subscription cost in wei (exact amount required on payment).
    /// @param pointsPerVisit Loyalty points minted to a member on each check-in.
    function deployGymBranch(
        string  calldata gymName,
        address          gymOwner,
        uint256          monthlyFee,
        uint256          pointsPerVisit
    ) external onlyOwner returns (address gymBranchAddr) {
        // 1. Deploy GymBranch
        GymBranch gymBranch = new GymBranch(
            gymName,
            gymOwner,
            monthlyFee,
            pointsPerVisit,
            address(loyaltyToken),
            address(paymentSplitter),
            address(this)
        );
        gymBranchAddr = address(gymBranch);

        // 2. Deploy ShopProduct owned by GymBranch (owner = address(gymBranch))
        ShopProduct shop = new ShopProduct(gymBranchAddr);

        // 3. Link ShopProduct into GymBranch
        gymBranch.setShopProduct(address(shop));

        // 4. Grant the branch permission to mint and burn the global loyalty token
        loyaltyToken.grantRole(loyaltyToken.MINTER_ROLE(), gymBranchAddr);
        loyaltyToken.grantRole(loyaltyToken.BURNER_ROLE(), gymBranchAddr);

        // 5. Register
        registeredGyms.push(gymBranchAddr);
        isRegisteredGym[gymBranchAddr]  = true;
        gymShopProduct[gymBranchAddr]   = address(shop);
        gymOwnerOf[gymBranchAddr]       = gymOwner;

        emit GymBranchDeployed(gymBranchAddr, address(shop), gymOwner, gymName);
    }

    // ── Fee management ────────────────────────────────────────────────────────

    /// @notice Transfer all accumulated treasury fees from the splitter to the treasury wallet.
    function collectPlatformFees() external onlyOwner {
        uint256 amount = paymentSplitter.accumulatedTreasuryFees();
        require(amount > 0, "GymFinderFactory: no fees to collect");
        paymentSplitter.withdrawToTreasury();
        emit PlatformFeesCollected(amount);
    }

    /// @notice Update the platform's revenue-share percentage.
    function updateFeePercent(uint256 newFee) external onlyOwner {
        require(newFee <= 100, "GymFinderFactory: invalid fee");
        platformFeePercent = newFee;
        paymentSplitter.updateFeePercent(newFee);
        emit PlatformFeeUpdated(newFee);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getRegisteredGyms() external view returns (address[] memory) {
        return registeredGyms;
    }

    function getRegisteredGymsCount() external view returns (uint256) {
        return registeredGyms.length;
    }
}
