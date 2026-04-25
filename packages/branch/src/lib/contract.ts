import { Contract, BrowserProvider, JsonRpcProvider, JsonRpcSigner } from "ethers";
import deployment from "../generated/deployment.json";

// ── Addresses ──────────────────────────────────────────────────────────────

export const CHAIN_ID         = deployment.chainId;
export const FACTORY_ADDRESS  = deployment.GymFinderFactory.address;
export const LOYALTY_ADDRESS  = deployment.LoyaltyToken.address;
export const SPLITTER_ADDRESS = deployment.PaymentSplitter.address;

// Branch address is per-deployment (set via NEXT_PUBLIC_BRANCH_ADDRESS)
export const BRANCH_ADDRESS   = process.env.NEXT_PUBLIC_BRANCH_ADDRESS ?? "";

export const ETHERSCAN_BASE =
  deployment.chainId === 11155111 ? "https://sepolia.etherscan.io" :
  deployment.chainId === 1        ? "https://etherscan.io" : null;

// ── ABIs ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FACTORY_ABI       = deployment.GymFinderFactory.abi as any[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LOYALTY_ABI       = deployment.LoyaltyToken.abi as any[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GYM_BRANCH_ABI    = (deployment as Record<string, unknown>).GymBranch as { abi: any[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SHOP_PRODUCT_ABI  = (deployment as Record<string, unknown>).ShopProduct as { abi: any[] };

// ── Provider helper ─────────────────────────────────────────────────────────

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

export function getReadProvider(): BrowserProvider | JsonRpcProvider {
  if (typeof window !== "undefined" && window.ethereum) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BrowserProvider(window.ethereum as any);
  }
  return new JsonRpcProvider(RPC_URL);
}

// ── Contract factories ──────────────────────────────────────────────────────

type PS = BrowserProvider | JsonRpcProvider | JsonRpcSigner;

export function getFactory(ps: PS) {
  return new Contract(FACTORY_ADDRESS, FACTORY_ABI, ps);
}

export function getLoyaltyToken(ps: PS) {
  return new Contract(LOYALTY_ADDRESS, LOYALTY_ABI, ps);
}

export function getGymBranch(ps: PS, addr: string = BRANCH_ADDRESS) {
  return new Contract(addr, GYM_BRANCH_ABI.abi, ps);
}

export function getShopProduct(addr: string, ps: PS) {
  return new Contract(addr, SHOP_PRODUCT_ABI.abi, ps);
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface GymInfo {
  address:        string;
  name:           string;
  owner:          string;
  isActive:       boolean;
  subscriptionOk: boolean;
  monthlyFee:     bigint;
  pointsPerVisit: bigint;
  shopProduct:    string;
  checkInLimit:   bigint;
  selfReg:        boolean;
}

export interface ProductInfo {
  id:               number;
  name:             string;
  description:      string;
  loyaltyPointCost: bigint;
  productType:      number;
  stock:            bigint;
  isActive:         boolean;
}

export interface MemberInfo {
  address:       string;
  visits:        bigint;
  pointsEarned:  bigint;
  pointsSpent:   bigint;
  pointBalance:  bigint;
  status:        number; // 0=ACTIVE 1=EXPIRED 2=SUSPENDED
  lastCheckIn:   bigint;
}

export const PRODUCT_TYPE_LABEL: Record<number, string> = { 0: "Physical", 1: "Service", 2: "Discount" };
export const MEMBER_STATUS_LABEL: Record<number, string> = { 0: "Active", 1: "Expired", 2: "Suspended" };

// ── Data reads ──────────────────────────────────────────────────────────────

export async function readGymInfo(ps: BrowserProvider | JsonRpcProvider): Promise<GymInfo> {
  const c = getGymBranch(ps);
  const [name, owner, isActive, subOk, fee, rate, shop, limit, selfReg] = await Promise.all([
    c.gymName()                    as Promise<string>,
    c.owner()                      as Promise<string>,
    c.isActive()                   as Promise<boolean>,
    c.checkSubscriptionStatus()    as Promise<boolean>,
    c.monthlySubscriptionFee()     as Promise<bigint>,
    c.loyaltyPointsPerVisit()      as Promise<bigint>,
    c.shopProduct()                as Promise<string>,
    c.checkInRateLimitHours()      as Promise<bigint>,
    c.allowSelfRegistration()      as Promise<boolean>,
  ]);
  return {
    address: BRANCH_ADDRESS, name, owner, isActive,
    subscriptionOk: subOk, monthlyFee: fee, pointsPerVisit: rate,
    shopProduct: shop, checkInLimit: limit, selfReg,
  };
}

export async function readProducts(shopAddr: string, ps: BrowserProvider | JsonRpcProvider): Promise<ProductInfo[]> {
  const shop  = getShopProduct(shopAddr, ps);
  const count = Number(await shop.nextProductId() as bigint);
  if (count === 0) return [];
  const results: ProductInfo[] = [];
  for (let i = 0; i < count; i++) {
    const p = await shop.getProduct(i) as {
      name: string; description: string; loyaltyPointCost: bigint;
      productType: bigint; stock: bigint; isActive: boolean;
    };
    results.push({ id: i, name: p.name, description: p.description,
      loyaltyPointCost: p.loyaltyPointCost, productType: Number(p.productType),
      stock: p.stock, isActive: p.isActive });
  }
  return results;
}

export async function readLoyaltyBalance(addr: string, ps: BrowserProvider | JsonRpcProvider): Promise<bigint> {
  return getLoyaltyToken(ps).balanceOf(addr) as Promise<bigint>;
}

export async function readMemberInfo(addr: string, ps: BrowserProvider | JsonRpcProvider): Promise<MemberInfo> {
  const c = getGymBranch(ps);
  const info = await c.getMemberInfo(addr) as {
    visits: bigint; pointsEarned: bigint; pointsSpent: bigint;
    pointBalance: bigint; status: bigint; lastCheckIn: bigint;
  };
  return {
    address: addr, visits: info.visits, pointsEarned: info.pointsEarned,
    pointsSpent: info.pointsSpent, pointBalance: info.pointBalance,
    status: Number(info.status), lastCheckIn: info.lastCheckIn,
  };
}

export async function readMembers(ps: BrowserProvider | JsonRpcProvider): Promise<string[]> {
  return getGymBranch(ps).getMembers() as Promise<string[]>;
}

export async function readIsMember(addr: string, ps: BrowserProvider | JsonRpcProvider): Promise<boolean> {
  return getGymBranch(ps).isMember(addr) as Promise<boolean>;
}

export async function readIsOperator(addr: string, ps: BrowserProvider | JsonRpcProvider): Promise<boolean> {
  return getGymBranch(ps).isOperator(addr) as Promise<boolean>;
}

export async function readGymOwnerFees(ownerAddr: string, ps: BrowserProvider | JsonRpcProvider): Promise<bigint> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = new Contract(SPLITTER_ADDRESS, (deployment.PaymentSplitter as { abi: any[] }).abi, ps);
  return s.getAccumulatedFees(ownerAddr) as Promise<bigint>;
}
