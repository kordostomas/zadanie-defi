// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISimpleVault {
    function withdraw() external;
}

/// @dev Test-only contract used to verify that SimpleVault's ReentrancyGuard works.
contract ReentrancyAttacker {
    ISimpleVault public immutable vault;

    constructor(address _vault) {
        vault = ISimpleVault(_vault);
    }

    function attack() external {
        vault.withdraw();
    }

    receive() external payable {
        // Try to re-enter withdraw. ReentrancyGuard must block this.
        vault.withdraw();
    }
}
