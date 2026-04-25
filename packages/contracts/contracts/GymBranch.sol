// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./LoyaltyToken.sol";
import "./ShopProduct.sol";
import "./PaymentSplitter.sol";

/// @title  GymBranch
/// @notice One contract per physical gym location, deployed by GymFinderFactory.
///
///         Members
///           - Call checkIn() to earn loyalty points.
///           - Call redeemProduct(id) to burn points and receive an ERC-1155 proof NFT.
///
///         Gym owner
///           - Calls payMonthlyFee() to keep the gym active on the platform.
///           - Manages the shop (addProduct / removeProduct / updateProductStock).
///           - Can award bonus points (awardPoints) and manage member statuses.
///
///         Subscription
///           - Gym is active for 30 days from each payment (or from deployment).
///           - After expiry anyone can call deactivate(); paying again reactivates.
contract GymBranch is Ownable, ReentrancyGuard {
    enum MembershipStatus { ACTIVE, EXPIRED, SUSPENDED }

    // ── Immutables ────────────────────────────────────────────────────────────
    LoyaltyToken    public immutable loyaltyToken;
    PaymentSplitter public immutable paymentSplitter;
    address         public immutable factory;

    // ── Mutable state ─────────────────────────────────────────────────────────
    string      public gymName;
    uint256     public monthlySubscriptionFee;
    uint256     public loyaltyPointsPerVisit;
    bool        public isActive;
    uint256     public lastPaymentTimestamp;
    ShopProduct public shopProduct;          // set once by factory after deployment

    uint256 public constant SUBSCRIPTION_PERIOD = 30 days;

    // ── Per-member data ───────────────────────────────────────────────────────
    mapping(address => uint256)          public visitCount;
    mapping(address => uint256)          public totalPointsEarned;
    mapping(address => uint256)          public totalPointsSpent;
    mapping(address => MembershipStatus) public memberStatus;

    // ── Events ────────────────────────────────────────────────────────────────
    event CheckedIn(address indexed user, uint256 pointsAwarded, uint256 visitNumber);
    event PointsAwarded(address indexed user, uint256 points, string reason);
    event ProductRedeemed(address indexed user, uint256 indexed productId, uint256 pointsBurned);
    event SubscriptionPaid(uint256 amount, uint256 validUntil);
    event GymDeactivated();
    event GymReactivated();
    event ShopProductSet(address indexed shopProduct);
    event MemberStatusUpdated(address indexed member, MembershipStatus status);
    event LoyaltyRateUpdated(uint256 newRate);
    event MonthlyFeeUpdated(uint256 newFee);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyActiveGym() {
        require(isActive, "GymBranch: gym not active");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "GymBranch: not factory");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        string  memory _gymName,
        address        _owner,
        uint256        _monthlyFee,
        uint256        _pointsPerVisit,
        address        _loyaltyToken,
        address        _paymentSplitter,
        address        _factory
    ) Ownable(_owner) {
        gymName                = _gymName;
        monthlySubscriptionFee = _monthlyFee;
        loyaltyPointsPerVisit  = _pointsPerVisit;
        loyaltyToken           = LoyaltyToken(_loyaltyToken);
        paymentSplitter        = PaymentSplitter(payable(_paymentSplitter));
        factory                = _factory;
        isActive               = true;
        lastPaymentTimestamp   = block.timestamp; // 30-day grace period from deployment
    }

    // ── Factory setup (called once) ───────────────────────────────────────────

    /// @notice Links the ShopProduct contract deployed alongside this branch.
    ///         Only callable by the factory, only once.
    function setShopProduct(address _shopProduct) external onlyFactory {
        require(address(shopProduct) == address(0), "GymBranch: shop already set");
        shopProduct = ShopProduct(_shopProduct);
        emit ShopProductSet(_shopProduct);
    }

    // ── Subscription ──────────────────────────────────────────────────────────

    /// @notice Gym owner pays the monthly platform subscription fee.
    ///         Exact amount required (msg.value must equal monthlySubscriptionFee).
    function payMonthlyFee() external payable onlyOwner {
        require(msg.value == monthlySubscriptionFee, "GymBranch: wrong fee amount");
        lastPaymentTimestamp = block.timestamp;
        if (!isActive) {
            isActive = true;
            emit GymReactivated();
        }
        paymentSplitter.splitPayment{value: msg.value}(address(this), owner());
        emit SubscriptionPaid(msg.value, block.timestamp + SUBSCRIPTION_PERIOD);
    }

    /// @notice Returns true when the current subscription period has not yet expired.
    function checkSubscriptionStatus() public view returns (bool) {
        return block.timestamp <= lastPaymentTimestamp + SUBSCRIPTION_PERIOD;
    }

    /// @notice Deactivates the gym after its subscription has expired.
    ///         Anyone can call this once the period is over.
    function deactivate() external {
        require(!checkSubscriptionStatus(), "GymBranch: subscription still active");
        require(isActive, "GymBranch: already inactive");
        isActive = false;
        emit GymDeactivated();
    }

    // ── Member: check-in ──────────────────────────────────────────────────────

    /// @notice Member self-check-in: msg.sender earns loyaltyPointsPerVisit tokens.
    function checkIn() external onlyActiveGym {
        address user = msg.sender;
        require(
            memberStatus[user] != MembershipStatus.SUSPENDED,
            "GymBranch: member suspended"
        );
        uint256 visits = ++visitCount[user];
        uint256 points = loyaltyPointsPerVisit;
        totalPointsEarned[user] += points;
        loyaltyToken.mint(user, points);
        emit CheckedIn(user, points, visits);
    }

    // ── Member: product redemption ────────────────────────────────────────────

    /// @notice Burn loyalty tokens to redeem a shop product.
    ///         An ERC-1155 proof NFT is minted to msg.sender.
    function redeemProduct(uint256 productId) external onlyActiveGym nonReentrant {
        address user = msg.sender;
        require(
            memberStatus[user] != MembershipStatus.SUSPENDED,
            "GymBranch: member suspended"
        );
        require(address(shopProduct) != address(0), "GymBranch: no shop configured");

        ShopProduct.Product memory p = shopProduct.getProduct(productId);
        require(p.isActive, "GymBranch: product not active");

        uint256 cost = p.loyaltyPointCost;
        require(loyaltyToken.balanceOf(user) >= cost, "GymBranch: insufficient points");

        totalPointsSpent[user] += cost;
        loyaltyToken.burn(user, cost);
        shopProduct.mintRedemption(user, productId);

        emit ProductRedeemed(user, productId, cost);
    }

    // ── Gym owner: shop management ────────────────────────────────────────────

    function addProduct(
        string      calldata name,
        string      calldata description,
        uint256              loyaltyPointCost,
        ShopProduct.ProductType productType,
        uint256              initialStock
    ) external onlyOwner returns (uint256) {
        require(address(shopProduct) != address(0), "GymBranch: no shop configured");
        return shopProduct.addProduct(name, description, loyaltyPointCost, productType, initialStock);
    }

    function removeProduct(uint256 productId) external onlyOwner {
        shopProduct.removeProduct(productId);
    }

    function updateProductStock(uint256 productId, uint256 amount) external onlyOwner {
        shopProduct.updateStock(productId, amount);
    }

    // ── Gym owner: member management ─────────────────────────────────────────

    /// @notice Manually award bonus loyalty points to any member.
    function awardPoints(
        address        user,
        uint256        points,
        string calldata reason
    ) external onlyOwner {
        totalPointsEarned[user] += points;
        loyaltyToken.mint(user, points);
        emit PointsAwarded(user, points, reason);
    }

    function setMemberStatus(address member, MembershipStatus status) external onlyOwner {
        memberStatus[member] = status;
        emit MemberStatusUpdated(member, status);
    }

    // ── Gym owner: config ─────────────────────────────────────────────────────

    function setLoyaltyPointsRate(uint256 points) external onlyOwner {
        loyaltyPointsPerVisit = points;
        emit LoyaltyRateUpdated(points);
    }

    function setMonthlyFee(uint256 fee) external onlyOwner {
        monthlySubscriptionFee = fee;
        emit MonthlyFeeUpdated(fee);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getMemberInfo(address user)
        external
        view
        returns (
            uint256          visits,
            uint256          pointsEarned,
            uint256          pointsSpent,
            uint256          pointBalance,
            MembershipStatus status
        )
    {
        return (
            visitCount[user],
            totalPointsEarned[user],
            totalPointsSpent[user],
            loyaltyToken.balanceOf(user),
            memberStatus[user]
        );
    }

    function getShopProductAddress() external view returns (address) {
        return address(shopProduct);
    }
}
