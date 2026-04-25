// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  PaymentSplitter
/// @notice Receives monthly gym subscription fees and splits them between the
///         GymFinder platform treasury and the individual gym owner.
///         Uses a pull-over-push pattern: both parties withdraw accumulated balances.
contract PaymentSplitter is Ownable, ReentrancyGuard {
    address public gymFinderTreasury;
    uint256 public platformCutPercent;

    /// @dev Accumulated treasury fees waiting to be withdrawn.
    uint256 public accumulatedTreasuryFees;

    /// @dev Accumulated gym-owner shares keyed by gym owner address.
    mapping(address => uint256) public accumulatedGymFees;

    event PaymentSplit(
        address indexed gymBranch,
        address indexed gymOwner,
        uint256 gymAmount,
        uint256 platformAmount
    );
    event TreasuryWithdrawn(uint256 amount);
    event GymFeesWithdrawn(address indexed gymOwner, uint256 amount);
    event FeePercentUpdated(uint256 newPercent);
    event TreasuryUpdated(address newTreasury);

    /// @param treasury    Address that receives the platform's cut.
    /// @param cutPercent  Platform's percentage share (0–100).
    /// @param admin       Owner of this contract (the GymFinderFactory).
    constructor(
        address treasury,
        uint256 cutPercent,
        address admin
    ) Ownable(admin) {
        require(cutPercent <= 100, "PaymentSplitter: invalid cut");
        gymFinderTreasury  = treasury;
        platformCutPercent = cutPercent;
    }

    // ── Incoming payments ─────────────────────────────────────────────────────

    /// @notice Called by GymBranch.payMonthlyFee(); splits the incoming ETH.
    function splitPayment(address gymBranch, address gymOwner) external payable {
        uint256 amount = msg.value;
        require(amount > 0, "PaymentSplitter: zero value");
        uint256 platformCut = (amount * platformCutPercent) / 100;
        uint256 gymCut      = amount - platformCut;
        accumulatedTreasuryFees         += platformCut;
        accumulatedGymFees[gymOwner]    += gymCut;
        emit PaymentSplit(gymBranch, gymOwner, gymCut, platformCut);
    }

    // ── Withdrawals ───────────────────────────────────────────────────────────

    /// @notice Platform (factory) owner pulls accumulated treasury fees.
    function withdrawToTreasury() external onlyOwner nonReentrant {
        uint256 amount = accumulatedTreasuryFees;
        require(amount > 0, "PaymentSplitter: nothing to withdraw");
        accumulatedTreasuryFees = 0;
        (bool ok,) = gymFinderTreasury.call{value: amount}("");
        require(ok, "PaymentSplitter: transfer failed");
        emit TreasuryWithdrawn(amount);
    }

    /// @notice Gym owner pulls their accumulated fee share.
    function withdrawGymFees() external nonReentrant {
        uint256 amount = accumulatedGymFees[msg.sender];
        require(amount > 0, "PaymentSplitter: nothing to withdraw");
        accumulatedGymFees[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "PaymentSplitter: transfer failed");
        emit GymFeesWithdrawn(msg.sender, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getAccumulatedFees(address gymOwner) external view returns (uint256) {
        return accumulatedGymFees[gymOwner];
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function updateFeePercent(uint256 newPercent) external onlyOwner {
        require(newPercent <= 100, "PaymentSplitter: invalid percent");
        platformCutPercent = newPercent;
        emit FeePercentUpdated(newPercent);
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "PaymentSplitter: zero address");
        gymFinderTreasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }
}
