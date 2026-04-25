// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title  GymFinder Loyalty Points Token (ERC-20)
/// @notice Loyalty points earned on gym check-in, burned on product redemption.
///         GymBranch contracts are granted MINTER_ROLE and BURNER_ROLE by the factory.
contract LoyaltyToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE  = keccak256("BURNER_ROLE");

    /// @param admin Address that receives DEFAULT_ADMIN_ROLE (the GymFinderFactory).
    constructor(address admin) ERC20("GymFinder Points", "GFP") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @dev Points are whole integers — no sub-point fractions.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Mint loyalty points to an address.
    ///         Only callable by addresses with MINTER_ROLE (i.e. GymBranch contracts).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Burn loyalty points from an address.
    ///         Bypasses ERC-20 allowances — only callable by BURNER_ROLE holders.
    ///         GymBranch calls this after a member triggers redeemProduct().
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }
}
