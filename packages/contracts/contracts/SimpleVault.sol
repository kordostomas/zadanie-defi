// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice A minimal vault that stores a uint256 value.
/// Anyone can overwrite the value by sending ETH (payable set).
/// The owner accumulates all ETH and can withdraw at any time.
contract SimpleVault is Ownable, ReentrancyGuard {
    uint256 private _value;
    mapping(address => uint256) public contributions;

    event ValueSet(address indexed caller, uint256 value, uint256 paid);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Store a new value. Requires sending at least 1 wei.
    function set(uint256 newValue) external payable {
        require(msg.value > 0, "SimpleVault: payment required");
        _value = newValue;
        contributions[msg.sender] += msg.value;
        emit ValueSet(msg.sender, newValue, msg.value);
    }

    /// @notice Read the current stored value.
    function get() external view returns (uint256) {
        return _value;
    }

    /// @notice Owner withdraws the full contract balance.
    function withdraw() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "SimpleVault: nothing to withdraw");
        (bool ok, ) = owner().call{value: bal}("");
        require(ok, "SimpleVault: transfer failed");
        emit Withdrawn(owner(), bal);
    }
}
