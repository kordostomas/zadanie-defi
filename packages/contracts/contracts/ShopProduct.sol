// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title  GymBranch Shop Products (ERC-1155)
/// @notice One contract per gym branch, deployed and owned by the GymBranch contract.
///         Each token ID represents a distinct product type.
///         Minting a token = redeeming the product (provides on-chain proof for the gym).
contract ShopProduct is ERC1155, Ownable {
    enum ProductType { PHYSICAL, SERVICE, DISCOUNT }

    struct Product {
        string      name;
        string      description;
        uint256     loyaltyPointCost;
        ProductType productType;
        uint256     stock;
        bool        isActive;
    }

    address public immutable gymBranch;
    mapping(uint256 => Product) private _products;
    uint256 public nextProductId;

    event ProductAdded(
        uint256 indexed productId,
        string  name,
        uint256 cost,
        ProductType productType
    );
    event ProductDeactivated(uint256 indexed productId);
    event StockUpdated(uint256 indexed productId, uint256 newStock);
    event Redeemed(uint256 indexed productId, address indexed user);

    /// @param gymBranchAddr The GymBranch contract that owns and manages this shop.
    constructor(address gymBranchAddr) ERC1155("") Ownable(gymBranchAddr) {
        gymBranch = gymBranchAddr;
    }

    // ── Product management (owner = GymBranch) ────────────────────────────────

    function addProduct(
        string      calldata name,
        string      calldata description,
        uint256              loyaltyPointCost,
        ProductType          productType,
        uint256              initialStock
    ) external onlyOwner returns (uint256 productId) {
        productId = nextProductId++;
        _products[productId] = Product({
            name:             name,
            description:      description,
            loyaltyPointCost: loyaltyPointCost,
            productType:      productType,
            stock:            initialStock,
            isActive:         true
        });
        emit ProductAdded(productId, name, loyaltyPointCost, productType);
    }

    function removeProduct(uint256 productId) external onlyOwner {
        _products[productId].isActive = false;
        emit ProductDeactivated(productId);
    }

    function updateStock(uint256 productId, uint256 amount) external onlyOwner {
        _products[productId].stock = amount;
        emit StockUpdated(productId, amount);
    }

    function setActive(uint256 productId, bool status) external onlyOwner {
        _products[productId].isActive = status;
    }

    /// @notice Decrements stock and mints a redemption-proof NFT to the user.
    ///         Called by GymBranch after burning the member's loyalty tokens.
    function mintRedemption(address to, uint256 productId) external onlyOwner {
        Product storage p = _products[productId];
        require(p.isActive,  "ShopProduct: product not active");
        require(p.stock > 0, "ShopProduct: out of stock");
        unchecked { p.stock--; }
        _mint(to, productId, 1, "");
        emit Redeemed(productId, to);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getProduct(uint256 productId) external view returns (Product memory) {
        return _products[productId];
    }

    /// @notice Returns all products and their IDs in a single call.
    function getAllProducts()
        external
        view
        returns (Product[] memory prods, uint256[] memory ids)
    {
        uint256 count = nextProductId;
        prods = new Product[](count);
        ids   = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            prods[i] = _products[i];
            ids[i]   = i;
        }
    }
}
