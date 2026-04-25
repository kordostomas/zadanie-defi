// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./LoyaltyToken.sol";
import "./ShopProduct.sol";
import "./PaymentSplitter.sol";

/// @title GymBranch
/// @notice One contract per physical gym location, deployed by GymFinderFactory.
///
/// Operators
/// - Owner manages a set of operators via addOperator / removeOperator.
/// - Operators can register members and perform check-ins.
/// - Operators can also redeem products on behalf of members (counter redemption).
///
/// Members
/// - Registered by an operator or owner. Self-registration optional via allowSelfRegistration.
/// - Unregistered by the owner only.
/// - Can call redeemProduct(id) themselves, or have an operator call redeemFor(member, id).
///
/// Check-in
/// - Operator calls checkIn(user) on a registered, non-suspended member.
/// - Rate-limited per member by checkInRateLimitHours (default: 20h, 0 = no limit).
///
/// Gym owner
/// - Calls payMonthlyFee() to keep the gym active on the platform.
/// - Manages the shop (addProduct / removeProduct / updateProductStock).
/// - Can award bonus points (awardPoints) and manage member statuses.
///
/// Subscription
/// - Gym is active for 30 days from each payment (or from deployment).
/// - After expiry anyone can call deactivate(); paying again reactivates.
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
    ShopProduct public shopProduct; // set once by factory after deployment

    uint256 public constant SUBSCRIPTION_PERIOD = 30 days;

    // ── Operators ─────────────────────────────────────────────────────────────
    mapping(address => bool) public isOperator;

    // ── Member registry ───────────────────────────────────────────────────────
    mapping(address => bool)    public  isMember;
    address[]                   private _members;
    mapping(address => uint256) private _memberIndex; // 1-based index into _members
    bool public allowSelfRegistration;

    // ── Per-member data ───────────────────────────────────────────────────────
    mapping(address => uint256)          public visitCount;
    mapping(address => uint256)          public totalPointsEarned;
    mapping(address => uint256)          public totalPointsSpent;
    mapping(address => MembershipStatus) public memberStatus;
    mapping(address => uint256)          public lastCheckInTimestamp;

    uint256 public checkInRateLimitHours; // default 20, 0 = no limit

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
    event CheckInRateLimitUpdated(uint256 newLimitHours);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event MemberRegistered(address indexed member);
    event MemberUnregistered(address indexed member);
    event SelfRegistrationUpdated(bool allowed);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyActiveGym() {
        require(isActive, "GymBranch: gym not active");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "GymBranch: not factory");
        _;
    }

    modifier onlyOperator() {
        require(
            msg.sender == owner() || isOperator[msg.sender],
            "GymBranch: not operator"
        );
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        string memory _gymName,
        address _owner,
        uint256 _monthlyFee,
        uint256 _pointsPerVisit,
        address _loyaltyToken,
        address _paymentSplitter,
        address _factory
    ) Ownable(_owner) {
        gymName                  = _gymName;
        monthlySubscriptionFee   = _monthlyFee;
        loyaltyPointsPerVisit    = _pointsPerVisit;
        loyaltyToken             = LoyaltyToken(_loyaltyToken);
        paymentSplitter          = PaymentSplitter(payable(_paymentSplitter));
        factory                  = _factory;
        isActive                 = true;
        lastPaymentTimestamp     = block.timestamp; // 30-day grace period from deployment
        checkInRateLimitHours    = 20;              // default: one check-in per 20 hours
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

    /// @notice Operator checks in a registered member and awards loyaltyPointsPerVisit tokens.
    ///         Rate-limited per member by checkInRateLimitHours (0 = no limit).
    function checkIn(address user) external onlyOperator onlyActiveGym {
        require(isMember[user], "GymBranch: not a member");
        require(
            memberStatus[user] != MembershipStatus.SUSPENDED,
            "GymBranch: member suspended"
        );
        if (checkInRateLimitHours > 0) {
            require(
                block.timestamp >= lastCheckInTimestamp[user] + checkInRateLimitHours * 1 hours,
                "GymBranch: check-in rate limit"
            );
        }
        lastCheckInTimestamp[user] = block.timestamp;
        uint256 visits = ++visitCount[user];
        uint256 points = loyaltyPointsPerVisit;
        totalPointsEarned[user] += points;
        loyaltyToken.mint(user, points);
        emit CheckedIn(user, points, visits);
    }

    // ── Member: product redemption ────────────────────────────────────────────

    /// @notice Member redeems a product themselves (self-service).
    ///         Burns loyalty tokens and mints an ERC-1155 proof NFT.
    function redeemProduct(uint256 productId) external onlyActiveGym nonReentrant {
        _redeem(msg.sender, productId);
    }

    /// @notice Operator redeems a product on behalf of a member (counter redemption).
    ///         Useful for custodial UX where the member has no wallet / gas.
    function redeemFor(address member, uint256 productId)
        external
        onlyOperator
        onlyActiveGym
        nonReentrant
    {
        _redeem(member, productId);
    }

    /// @dev Shared redemption logic.
    function _redeem(address user, uint256 productId) internal {
        require(isMember[user], "GymBranch: not a member");
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
        string calldata name,
        string calldata description,
        uint256 loyaltyPointCost,
        ShopProduct.ProductType productType,
        uint256 initialStock
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
        address user,
        uint256 points,
        string calldata reason
    ) external onlyOwner {
        require(isMember[user], "GymBranch: not a member");
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

    function setCheckInRateLimit(uint256 hours_) external onlyOwner {
        checkInRateLimitHours = hours_;
        emit CheckInRateLimitUpdated(hours_);
    }

    // ── Gym owner: operator management ───────────────────────────────────────

    function addOperator(address op) external onlyOwner {
        require(op != address(0), "GymBranch: zero address");
        require(!isOperator[op], "GymBranch: already operator");
        isOperator[op] = true;
        emit OperatorAdded(op);
    }

    function removeOperator(address op) external onlyOwner {
        require(isOperator[op], "GymBranch: not operator");
        isOperator[op] = false;
        emit OperatorRemoved(op);
    }

    // ── Member registration ───────────────────────────────────────────────────

    /// @notice Register a member. Caller must be an operator, the owner, or the
    ///         member themselves when allowSelfRegistration is enabled.
    function registerMember(address member) external onlyActiveGym {
        require(
            msg.sender == owner() ||
            isOperator[msg.sender] ||
            (allowSelfRegistration && msg.sender == member),
            "GymBranch: not authorized"
        );
        require(!isMember[member], "GymBranch: already a member");
        isMember[member] = true;
        _memberIndex[member] = _members.length + 1; // 1-based
        _members.push(member);
        emit MemberRegistered(member);
    }

    /// @notice Unregister a member and remove them from the member list.
    function unregisterMember(address member) external onlyOwner {
        require(isMember[member], "GymBranch: not a member");
        isMember[member] = false;
        // O(1) swap-and-pop
        uint256 idx  = _memberIndex[member] - 1; // 0-based
        uint256 last = _members.length - 1;
        if (idx != last) {
            address moved = _members[last];
            _members[idx] = moved;
            _memberIndex[moved] = idx + 1;
        }
        _members.pop();
        _memberIndex[member] = 0;
        emit MemberUnregistered(member);
    }

    function setAllowSelfRegistration(bool allow) external onlyOwner {
        allowSelfRegistration = allow;
        emit SelfRegistrationUpdated(allow);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getMemberInfo(address user)
        external
        view
        returns (
            uint256 visits,
            uint256 pointsEarned,
            uint256 pointsSpent,
            uint256 pointBalance,
            MembershipStatus status,
            uint256 lastCheckIn
        )
    {
        return (
            visitCount[user],
            totalPointsEarned[user],
            totalPointsSpent[user],
            loyaltyToken.balanceOf(user),
            memberStatus[user],
            lastCheckInTimestamp[user]
        );
    }

    function getMembers() external view returns (address[] memory) {
        return _members;
    }

    function getMemberCount() external view returns (uint256) {
        return _members.length;
    }

    function getShopProductAddress() external view returns (address) {
        return address(shopProduct);
    }

    function subscriptionExpiresAt() external view returns (uint256) {
        return lastPaymentTimestamp + SUBSCRIPTION_PERIOD;
    }
}
