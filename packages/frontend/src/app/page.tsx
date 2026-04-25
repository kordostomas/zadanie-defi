"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, JsonRpcSigner, formatEther, parseEther } from "ethers";
import {
  FACTORY_ADDRESS,
  LOYALTY_TOKEN_ADDRESS,
  ETHERSCAN_BASE,
  PRODUCT_TYPE_LABEL,
  GymInfo,
  ProductInfo,
  getFactory,
  getGymBranch,
  getSplitter,
  readAllGyms,
  readGymInfo,
  readLoyaltyBalance,
  readFactoryOwner,
  readPlatformFeePercent,
  readProducts,
  readAccumulatedTreasuryFees,
  readGymOwnerFees,
} from "@/lib/contract";
import {
  connectWallet,
  isMetaMaskAvailable,
  onAccountChange,
  onChainChange,
} from "@/lib/wallet";
import { useTx } from "@/lib/useTx";

// ── Types ──────────────────────────────────────────────────────────────────

interface ExpandedGym extends GymInfo {
  products: ProductInfo[];
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  // Wallet
  const [provider,  setProvider]  = useState<BrowserProvider | null>(null);
  const [signer,    setSigner]    = useState<JsonRpcSigner | null>(null);
  const [address,   setAddress]   = useState<string | null>(null);

  // Platform
  const [factoryOwner,    setFactoryOwner]    = useState<string | null>(null);
  const [platformFee,     setPlatformFee]     = useState<bigint>(0n);
  const [gyms,            setGyms]            = useState<GymInfo[]>([]);
  const [pendingFees,     setPendingFees]     = useState<bigint>(0n);
  const [loyaltyBalance,  setLoyaltyBalance]  = useState<bigint>(0n);
  const [gymOwnerFees,    setGymOwnerFees]    = useState<bigint>(0n);

  // UI state
  const [connectError,    setConnectError]    = useState<string | null>(null);
  const [loadingGyms,     setLoadingGyms]     = useState(false);
  const [expandedGym,     setExpandedGym]     = useState<ExpandedGym | null>(null);
  const [activeTab,       setActiveTab]       = useState<"member" | "gym" | "admin">("member");

  // TX hooks (one per action type)
  const checkInTx      = useTx();
  const redeemTx       = useTx();
  const paySubTx       = useTx();
  const addProductTx   = useTx();
  const awardTx        = useTx();
  const deployGymTx    = useTx();
  const collectFeesTx  = useTx();
  const updateFeeTx    = useTx();
  const withdrawGymTx  = useTx();

  // Admin form state
  const [newGymName,    setNewGymName]    = useState("");
  const [newGymOwner,   setNewGymOwner]   = useState("");
  const [newGymFee,     setNewGymFee]     = useState("0.01");
  const [newGymPts,     setNewGymPts]     = useState("100");
  const [newFeePercent, setNewFeePercent] = useState("");

  // Gym manager form state
  const [prodName,      setProdName]      = useState("");
  const [prodDesc,      setProdDesc]      = useState("");
  const [prodCost,      setProdCost]      = useState("");
  const [prodType,      setProdType]      = useState("0");
  const [prodStock,     setProdStock]     = useState("10");
  const [awardAddr,     setAwardAddr]     = useState("");
  const [awardAmt,      setAwardAmt]      = useState("");
  const [awardReason,   setAwardReason]   = useState("");

  // Derived
  const isAdmin    = !!(address && factoryOwner && address.toLowerCase() === factoryOwner.toLowerCase());
  const ownedGyms  = gyms.filter(g => address && g.owner.toLowerCase() === address.toLowerCase());
  const isGymOwner = ownedGyms.length > 0;

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadPlatform = useCallback(async (p: BrowserProvider, addr?: string) => {
    try {
      const [owner, fee, gymAddresses, pendingT] = await Promise.all([
        readFactoryOwner(p),
        readPlatformFeePercent(p),
        readAllGyms(p),
        readAccumulatedTreasuryFees(p),
      ]);
      setFactoryOwner(owner);
      setPlatformFee(fee);
      setPendingFees(pendingT);

      setLoadingGyms(true);
      const gymInfos = await Promise.all(gymAddresses.map(a => readGymInfo(a, p)));
      setGyms(gymInfos);
      setLoadingGyms(false);

      if (addr) {
        const [bal, ownerFees] = await Promise.all([
          readLoyaltyBalance(addr, p),
          readGymOwnerFees(addr, p),
        ]);
        setLoyaltyBalance(bal);
        setGymOwnerFees(ownerFees);
      }
    } catch {
      setLoadingGyms(false);
    }
  }, []);

  // Auto-refresh on tx mined
  const anyMined =
    [checkInTx, redeemTx, paySubTx, addProductTx, awardTx,
     deployGymTx, collectFeesTx, updateFeeTx, withdrawGymTx]
      .some(t => t.state.status === "mined");

  useEffect(() => {
    if (anyMined && provider) loadPlatform(provider, address ?? undefined);
  }, [anyMined, provider, address, loadPlatform]);

  // Reload expanded gym products on tx
  useEffect(() => {
    if ((addProductTx.state.status === "mined" || redeemTx.state.status === "mined") && expandedGym && provider) {
      readProducts(expandedGym.shopProduct, provider).then(products =>
        setExpandedGym(eg => eg ? { ...eg, products } : null)
      );
    }
  }, [addProductTx.state.status, redeemTx.state.status, expandedGym, provider]);

  // Wallet/chain change → reload
  useEffect(() => {
    const unsubA = onAccountChange(() => window.location.reload());
    const unsubC = onChainChange(() => window.location.reload());
    return () => { unsubA(); unsubC(); };
  }, []);

  // ── Connect wallet ────────────────────────────────────────────────────────

  async function handleConnect() {
    setConnectError(null);
    try {
      const result = await connectWallet();
      setProvider(result.provider);
      setSigner(result.signer);
      setAddress(result.address);
      await loadPlatform(result.provider, result.address);
    } catch (e: unknown) {
      setConnectError(e instanceof Error ? e.message : "Connection failed");
    }
  }

  // ── Expand gym (load products) ────────────────────────────────────────────

  async function handleExpandGym(gym: GymInfo) {
    if (expandedGym?.address === gym.address) {
      setExpandedGym(null);
      return;
    }
    if (!provider) return;
    const products = await readProducts(gym.shopProduct, provider);
    setExpandedGym({ ...gym, products });
  }

  // ── Member actions ────────────────────────────────────────────────────────

  async function handleCheckIn(gymAddr: string) {
    if (!signer) return;
    const c = getGymBranch(gymAddr, signer);
    await checkInTx.send(() => c.checkIn() as Promise<Awaited<ReturnType<typeof c.checkIn>>>);
  }

  async function handleRedeem(gymAddr: string, productId: number) {
    if (!signer) return;
    const c = getGymBranch(gymAddr, signer);
    await redeemTx.send(() =>
      c.redeemProduct(productId) as Promise<Awaited<ReturnType<typeof c.redeemProduct>>>
    );
  }

  // ── Gym owner actions ─────────────────────────────────────────────────────

  async function handlePaySubscription(gymAddr: string, fee: bigint) {
    if (!signer) return;
    const c = getGymBranch(gymAddr, signer);
    await paySubTx.send(() =>
      c.payMonthlyFee({ value: fee }) as Promise<Awaited<ReturnType<typeof c.payMonthlyFee>>>
    );
  }

  async function handleAddProduct(gymAddr: string) {
    if (!signer || !prodName || !prodCost) return;
    const c = getGymBranch(gymAddr, signer);
    await addProductTx.send(() =>
      c.addProduct(
        prodName,
        prodDesc,
        BigInt(prodCost),
        Number(prodType),
        Number(prodStock)
      ) as Promise<Awaited<ReturnType<typeof c.addProduct>>>
    );
    setProdName(""); setProdDesc(""); setProdCost(""); setProdStock("10");
  }

  async function handleAwardPoints(gymAddr: string) {
    if (!signer || !awardAddr || !awardAmt) return;
    const c = getGymBranch(gymAddr, signer);
    await awardTx.send(() =>
      c.awardPoints(awardAddr, BigInt(awardAmt), awardReason) as Promise<Awaited<ReturnType<typeof c.awardPoints>>>
    );
    setAwardAddr(""); setAwardAmt(""); setAwardReason("");
  }

  async function handleWithdrawGymFees() {
    if (!signer) return;
    const s = getSplitter(signer);
    await withdrawGymTx.send(() =>
      s.withdrawGymFees() as Promise<Awaited<ReturnType<typeof s.withdrawGymFees>>>
    );
  }

  // ── Admin actions ─────────────────────────────────────────────────────────

  async function handleDeployGym() {
    if (!signer || !newGymName || !newGymOwner) return;
    const f = getFactory(signer);
    await deployGymTx.send(() =>
      f.deployGymBranch(
        newGymName,
        newGymOwner,
        parseEther(newGymFee),
        BigInt(newGymPts)
      ) as Promise<Awaited<ReturnType<typeof f.deployGymBranch>>>
    );
    setNewGymName(""); setNewGymOwner(""); setNewGymFee("0.01"); setNewGymPts("100");
  }

  async function handleCollectFees() {
    if (!signer) return;
    const f = getFactory(signer);
    await collectFeesTx.send(() =>
      f.collectPlatformFees() as Promise<Awaited<ReturnType<typeof f.collectPlatformFees>>>
    );
  }

  async function handleUpdateFee() {
    if (!signer || !newFeePercent) return;
    const f = getFactory(signer);
    await updateFeeTx.send(() =>
      f.updateFeePercent(BigInt(newFeePercent)) as Promise<Awaited<ReturnType<typeof f.updateFeePercent>>>
    );
    setNewFeePercent("");
  }

  // ── Explorer helpers ──────────────────────────────────────────────────────

  const explorerTx   = (hash: string) => ETHERSCAN_BASE ? `${ETHERSCAN_BASE}/tx/${hash}` : null;
  const explorerAddr = (addr: string) => ETHERSCAN_BASE ? `${ETHERSCAN_BASE}/address/${addr}` : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ── */}
      <div className="card" style={{ textAlign: "center", marginBottom: "1rem" }}>
        <h1>GymFinder Loyalty</h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Check in. Earn points. Redeem rewards.
        </p>
      </div>

      {/* ── Wallet ── */}
      <div className="card">
        <h2>Wallet</h2>
        {!address ? (
          <>
            {!isMetaMaskAvailable() && (
              <p style={{ color: "#fca5a5", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                MetaMask not detected. Install it to continue.
              </p>
            )}
            <button onClick={handleConnect} disabled={!isMetaMaskAvailable()}>
              Connect MetaMask
            </button>
            {connectError && <div className="status error">{connectError}</div>}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div>
              <div className="label">Connected address</div>
              <div className="address">
                {address}
                {isAdmin    && <span className="badge admin">Platform Admin</span>}
                {isGymOwner && <span className="badge gym-owner">Gym Owner</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.25rem" }}>
              <div>
                <div className="label">Loyalty points (GFP)</div>
                <div className="value">{loyaltyBalance.toString()}</div>
              </div>
              <div>
                <div className="label">Registered gyms</div>
                <div className="value">{gyms.length}</div>
              </div>
              {isAdmin && (
                <div>
                  <div className="label">Platform fee</div>
                  <div className="value">{platformFee.toString()}%</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Tab navigation (only when connected) ── */}
      {address && (
        <div className="tab-bar">
          <button
            className={`tab ${activeTab === "member" ? "active" : ""}`}
            onClick={() => setActiveTab("member")}
          >
            Member
          </button>
          {isGymOwner && (
            <button
              className={`tab ${activeTab === "gym" ? "active" : ""}`}
              onClick={() => setActiveTab("gym")}
            >
              Gym Manager
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab ${activeTab === "admin" ? "active" : ""}`}
              onClick={() => setActiveTab("admin")}
            >
              Platform Admin
            </button>
          )}
        </div>
      )}

      {/* ── Member tab ── */}
      {(!address || activeTab === "member") && (
        <>
          <div className="card">
            <h2>Registered Gyms</h2>
            {loadingGyms && <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading gyms…</p>}
            {!loadingGyms && gyms.length === 0 && (
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>No gyms registered yet.</p>
            )}
            {gyms.map(gym => (
              <GymCard
                key={gym.address}
                gym={gym}
                address={address}
                expanded={expandedGym?.address === gym.address}
                expandedGym={expandedGym}
                loyaltyBalance={loyaltyBalance}
                onToggle={() => handleExpandGym(gym)}
                onCheckIn={() => handleCheckIn(gym.address)}
                onRedeem={(pid) => handleRedeem(gym.address, pid)}
                checkInTx={checkInTx}
                redeemTx={redeemTx}
                explorerTx={explorerTx}
                explorerAddr={explorerAddr}
              />
            ))}
          </div>

          {address && (
            <div className="card">
              <h2>My Points</h2>
              <div style={{ display: "flex", gap: "2rem" }}>
                <div>
                  <div className="label">GFP Balance</div>
                  <div className="value">{loyaltyBalance.toString()} pts</div>
                </div>
              </div>
              <div className="label" style={{ marginTop: "1rem", fontSize: "0.75rem" }}>
                Token contract
              </div>
              <div className="address" style={{ fontSize: "0.75rem" }}>
                {explorerAddr(LOYALTY_TOKEN_ADDRESS) ? (
                  <a href={explorerAddr(LOYALTY_TOKEN_ADDRESS)!} target="_blank" rel="noopener noreferrer">
                    {LOYALTY_TOKEN_ADDRESS}
                  </a>
                ) : LOYALTY_TOKEN_ADDRESS}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Gym Manager tab ── */}
      {address && activeTab === "gym" && isGymOwner && (
        <>
          {ownedGyms.map(gym => (
            <GymManagerPanel
              key={gym.address}
              gym={gym}
              gymOwnerFees={gymOwnerFees}
              prodName={prodName}      setProdName={setProdName}
              prodDesc={prodDesc}      setProdDesc={setProdDesc}
              prodCost={prodCost}      setProdCost={setProdCost}
              prodType={prodType}      setProdType={setProdType}
              prodStock={prodStock}    setProdStock={setProdStock}
              awardAddr={awardAddr}    setAwardAddr={setAwardAddr}
              awardAmt={awardAmt}      setAwardAmt={setAwardAmt}
              awardReason={awardReason} setAwardReason={setAwardReason}
              onPaySub={() => handlePaySubscription(gym.address, gym.monthlyFee)}
              onAddProduct={() => handleAddProduct(gym.address)}
              onAwardPoints={() => handleAwardPoints(gym.address)}
              onWithdrawFees={() => handleWithdrawGymFees()}
              paySubTx={paySubTx}
              addProductTx={addProductTx}
              awardTx={awardTx}
              withdrawGymTx={withdrawGymTx}
              explorerTx={explorerTx}
            />
          ))}
        </>
      )}

      {/* ── Platform Admin tab ── */}
      {address && activeTab === "admin" && isAdmin && (
        <AdminPanel
          platformFee={platformFee}
          pendingFees={pendingFees}
          newGymName={newGymName}     setNewGymName={setNewGymName}
          newGymOwner={newGymOwner}   setNewGymOwner={setNewGymOwner}
          newGymFee={newGymFee}       setNewGymFee={setNewGymFee}
          newGymPts={newGymPts}       setNewGymPts={setNewGymPts}
          newFeePercent={newFeePercent} setNewFeePercent={setNewFeePercent}
          onDeployGym={() => handleDeployGym()}
          onCollectFees={() => handleCollectFees()}
          onUpdateFee={() => handleUpdateFee()}
          deployGymTx={deployGymTx}
          collectFeesTx={collectFeesTx}
          updateFeeTx={updateFeeTx}
          explorerTx={explorerTx}
          explorerAddr={explorerAddr}
          factoryAddress={FACTORY_ADDRESS}
        />
      )}

      {/* ── Footer ── */}
      <footer>
        <div>
          Factory:{" "}
          {explorerAddr(FACTORY_ADDRESS) ? (
            <a href={explorerAddr(FACTORY_ADDRESS)!} target="_blank" rel="noopener noreferrer">
              {FACTORY_ADDRESS}
            </a>
          ) : (
            <span className="address">{FACTORY_ADDRESS}</span>
          )}
        </div>
        <div style={{ marginTop: "0.25rem" }}>DMBLOCK Assignment 2 · GymFinder Loyalty dApp</div>
      </footer>
    </>
  );
}

// ── GymCard Component ──────────────────────────────────────────────────────

function GymCard({
  gym, address, expanded, expandedGym, loyaltyBalance,
  onToggle, onCheckIn, onRedeem,
  checkInTx, redeemTx, explorerTx, explorerAddr,
}: {
  gym: GymInfo;
  address: string | null;
  expanded: boolean;
  expandedGym: ExpandedGym | null;
  loyaltyBalance: bigint;
  onToggle: () => void;
  onCheckIn: () => void;
  onRedeem: (id: number) => void;
  checkInTx: ReturnType<typeof useTx>;
  redeemTx: ReturnType<typeof useTx>;
  explorerTx: (h: string) => string | null;
  explorerAddr: (a: string) => string | null;
}) {
  const statusColor = gym.isActive && gym.subscriptionOk ? "#86efac" : "#fca5a5";
  const statusText  = !gym.isActive ? "Inactive" : gym.subscriptionOk ? "Active" : "Subscription expired";

  return (
    <div className="gym-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "1rem" }}>{gym.name}</div>
          <div className="address" style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}>
            {explorerAddr(gym.address) ? (
              <a href={explorerAddr(gym.address)!} target="_blank" rel="noopener noreferrer">{gym.address}</a>
            ) : gym.address}
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
            <div>
              <div className="label">Points/visit</div>
              <div style={{ fontWeight: 600 }}>{gym.pointsPerVisit.toString()}</div>
            </div>
            <div>
              <div className="label">Monthly fee</div>
              <div style={{ fontWeight: 600 }}>{formatEther(gym.monthlyFee)} ETH</div>
            </div>
            <div>
              <div className="label">Status</div>
              <div style={{ fontWeight: 600, color: statusColor }}>{statusText}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: "120px" }}>
          {address && gym.isActive && (
            <button
              style={{ marginTop: 0 }}
              onClick={onCheckIn}
              disabled={checkInTx.state.status === "pending"}
            >
              {checkInTx.state.status === "pending" ? "Sending…" : "Check In"}
            </button>
          )}
          <button className="secondary" style={{ marginTop: 0 }} onClick={onToggle}>
            {expanded ? "▲ Hide shop" : "▼ View shop"}
          </button>
        </div>
      </div>

      {checkInTx.state.status !== "idle" && (
        <TxFeedback state={checkInTx.state} explorerFn={explorerTx} />
      )}

      {expanded && expandedGym && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid #2d2d3d", paddingTop: "1rem" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem", color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Shop Products
          </div>
          {expandedGym.products.length === 0 && (
            <p style={{ color: "#64748b", fontSize: "0.85rem" }}>No products in this shop.</p>
          )}
          {expandedGym.products.map(p => (
            <div key={p.id} className="product-row">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                {p.description && <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{p.description}</div>}
                <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem" }}>
                  <span className="label">{PRODUCT_TYPE_LABEL[p.productType]}</span>
                  <span className="label">Stock: {p.stock.toString()}</span>
                  {!p.isActive && <span style={{ color: "#fca5a5", fontSize: "0.75rem" }}>Inactive</span>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, color: "#818cf8" }}>{p.loyaltyPointCost.toString()} pts</div>
                {address && p.isActive && p.stock > 0n && (
                  <button
                    style={{ marginTop: "0.3rem", padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                    disabled={loyaltyBalance < p.loyaltyPointCost || redeemTx.state.status === "pending"}
                    onClick={() => onRedeem(p.id)}
                  >
                    Redeem
                  </button>
                )}
              </div>
            </div>
          ))}
          {redeemTx.state.status !== "idle" && (
            <TxFeedback state={redeemTx.state} explorerFn={explorerTx} />
          )}
        </div>
      )}
    </div>
  );
}

// ── GymManagerPanel Component ──────────────────────────────────────────────

function GymManagerPanel({
  gym, gymOwnerFees,
  prodName, setProdName, prodDesc, setProdDesc,
  prodCost, setProdCost, prodType, setProdType,
  prodStock, setProdStock,
  awardAddr, setAwardAddr, awardAmt, setAwardAmt,
  awardReason, setAwardReason,
  onPaySub, onAddProduct, onAwardPoints, onWithdrawFees,
  paySubTx, addProductTx, awardTx, withdrawGymTx,
  explorerTx,
}: {
  gym: GymInfo;
  gymOwnerFees: bigint;
  prodName: string;      setProdName: (v: string) => void;
  prodDesc: string;      setProdDesc: (v: string) => void;
  prodCost: string;      setProdCost: (v: string) => void;
  prodType: string;      setProdType: (v: string) => void;
  prodStock: string;     setProdStock: (v: string) => void;
  awardAddr: string;     setAwardAddr: (v: string) => void;
  awardAmt: string;      setAwardAmt: (v: string) => void;
  awardReason: string;   setAwardReason: (v: string) => void;
  onPaySub: () => void;
  onAddProduct: () => void;
  onAwardPoints: () => void;
  onWithdrawFees: () => void;
  paySubTx: ReturnType<typeof useTx>;
  addProductTx: ReturnType<typeof useTx>;
  awardTx: ReturnType<typeof useTx>;
  withdrawGymTx: ReturnType<typeof useTx>;
  explorerTx: (h: string) => string | null;
}) {
  return (
    <>
      {/* Subscription */}
      <div className="card">
        <h2>Gym Manager — {gym.name}</h2>
        <div className="label">Subscription status</div>
        <div style={{ fontWeight: 600, color: gym.subscriptionOk ? "#86efac" : "#fca5a5" }}>
          {gym.subscriptionOk ? "Active" : "Expired"}
        </div>
        <div className="label" style={{ marginTop: "0.75rem" }}>Monthly fee</div>
        <div style={{ fontWeight: 600 }}>{formatEther(gym.monthlyFee)} ETH</div>
        <button
          style={{ marginTop: "0.75rem" }}
          onClick={onPaySub}
          disabled={paySubTx.state.status === "pending"}
        >
          {paySubTx.state.status === "pending" ? "Sending…" : "Pay Monthly Fee"}
        </button>
        <TxFeedback state={paySubTx.state} explorerFn={explorerTx} />

        {gymOwnerFees > 0n && (
          <div style={{ marginTop: "1rem" }}>
            <div className="label">Accumulated fee share (withdrawable)</div>
            <div style={{ fontWeight: 600, color: "#86efac" }}>{formatEther(gymOwnerFees)} ETH</div>
            <button
              className="secondary"
              onClick={onWithdrawFees}
              disabled={withdrawGymTx.state.status === "pending"}
            >
              {withdrawGymTx.state.status === "pending" ? "Sending…" : "Withdraw My Share"}
            </button>
            <TxFeedback state={withdrawGymTx.state} explorerFn={explorerTx} />
          </div>
        )}
      </div>

      {/* Add product */}
      <div className="card">
        <h2>Add Shop Product</h2>
        <div className="label">Product name</div>
        <input type="text" placeholder="e.g. Protein Shake" value={prodName} onChange={e => setProdName(e.target.value)} />
        <div className="label" style={{ marginTop: "0.5rem" }}>Description</div>
        <input type="text" placeholder="Short description" value={prodDesc} onChange={e => setProdDesc(e.target.value)} />
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <div>
            <div className="label">Loyalty point cost</div>
            <input type="number" min="1" placeholder="200" value={prodCost} onChange={e => setProdCost(e.target.value)} />
          </div>
          <div>
            <div className="label">Initial stock</div>
            <input type="number" min="1" placeholder="10" value={prodStock} onChange={e => setProdStock(e.target.value)} />
          </div>
        </div>
        <div className="label" style={{ marginTop: "0.5rem" }}>Product type</div>
        <select
          value={prodType}
          onChange={e => setProdType(e.target.value)}
          style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: "6px", padding: "0.5rem 0.75rem", color: "#e2e8f0", fontSize: "1rem", marginTop: "0.25rem" }}
        >
          <option value="0">Physical</option>
          <option value="1">Service</option>
          <option value="2">Discount</option>
        </select>
        <button
          onClick={onAddProduct}
          disabled={!prodName || !prodCost || addProductTx.state.status === "pending"}
        >
          {addProductTx.state.status === "pending" ? "Sending…" : "Add Product"}
        </button>
        <TxFeedback state={addProductTx.state} explorerFn={explorerTx} />
      </div>

      {/* Award points */}
      <div className="card">
        <h2>Award Bonus Points</h2>
        <div className="label">Member address</div>
        <input type="text" placeholder="0x…" value={awardAddr} onChange={e => setAwardAddr(e.target.value)} />
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <div>
            <div className="label">Points to award</div>
            <input type="number" min="1" placeholder="100" value={awardAmt} onChange={e => setAwardAmt(e.target.value)} />
          </div>
          <div>
            <div className="label">Reason</div>
            <input type="text" placeholder="Referral, birthday…" value={awardReason} onChange={e => setAwardReason(e.target.value)} />
          </div>
        </div>
        <button
          onClick={onAwardPoints}
          disabled={!awardAddr || !awardAmt || awardTx.state.status === "pending"}
        >
          {awardTx.state.status === "pending" ? "Sending…" : "Award Points"}
        </button>
        <TxFeedback state={awardTx.state} explorerFn={explorerTx} />
      </div>
    </>
  );
}

// ── AdminPanel Component ───────────────────────────────────────────────────

function AdminPanel({
  platformFee, pendingFees,
  newGymName, setNewGymName, newGymOwner, setNewGymOwner,
  newGymFee, setNewGymFee, newGymPts, setNewGymPts,
  newFeePercent, setNewFeePercent,
  onDeployGym, onCollectFees, onUpdateFee,
  deployGymTx, collectFeesTx, updateFeeTx,
  explorerTx, explorerAddr, factoryAddress,
}: {
  platformFee: bigint;
  pendingFees: bigint;
  newGymName: string;     setNewGymName: (v: string) => void;
  newGymOwner: string;    setNewGymOwner: (v: string) => void;
  newGymFee: string;      setNewGymFee: (v: string) => void;
  newGymPts: string;      setNewGymPts: (v: string) => void;
  newFeePercent: string;  setNewFeePercent: (v: string) => void;
  onDeployGym: () => void;
  onCollectFees: () => void;
  onUpdateFee: () => void;
  deployGymTx: ReturnType<typeof useTx>;
  collectFeesTx: ReturnType<typeof useTx>;
  updateFeeTx: ReturnType<typeof useTx>;
  explorerTx: (h: string) => string | null;
  explorerAddr: (a: string) => string | null;
  factoryAddress: string;
}) {
  return (
    <>
      {/* Platform stats */}
      <div className="card">
        <h2>Platform Overview</h2>
        <div style={{ display: "flex", gap: "2rem" }}>
          <div>
            <div className="label">Current platform fee</div>
            <div className="value">{platformFee.toString()}%</div>
          </div>
          <div>
            <div className="label">Pending treasury fees</div>
            <div className="value">{formatEther(pendingFees)} ETH</div>
          </div>
        </div>
        <div className="label" style={{ marginTop: "1rem", fontSize: "0.75rem" }}>Factory contract</div>
        <div className="address" style={{ fontSize: "0.75rem" }}>
          {explorerAddr(factoryAddress) ? (
            <a href={explorerAddr(factoryAddress)!} target="_blank" rel="noopener noreferrer">{factoryAddress}</a>
          ) : factoryAddress}
        </div>
        <button
          style={{ marginTop: "0.75rem" }}
          onClick={onCollectFees}
          disabled={pendingFees === 0n || collectFeesTx.state.status === "pending"}
        >
          {collectFeesTx.state.status === "pending" ? "Sending…" : `Collect ${formatEther(pendingFees)} ETH`}
        </button>
        <TxFeedback state={collectFeesTx.state} explorerFn={explorerTx} />
      </div>

      {/* Update fee */}
      <div className="card">
        <h2>Update Platform Fee</h2>
        <div className="label">New fee percentage (0–100)</div>
        <input
          type="number"
          min="0"
          max="100"
          placeholder={`Current: ${platformFee}%`}
          value={newFeePercent}
          onChange={e => setNewFeePercent(e.target.value)}
        />
        <button
          onClick={onUpdateFee}
          disabled={!newFeePercent || updateFeeTx.state.status === "pending"}
        >
          {updateFeeTx.state.status === "pending" ? "Sending…" : "Update Fee"}
        </button>
        <TxFeedback state={updateFeeTx.state} explorerFn={explorerTx} />
      </div>

      {/* Deploy gym */}
      <div className="card">
        <h2>Deploy New Gym Branch</h2>
        <div className="label">Gym name</div>
        <input type="text" placeholder="Iron Palace" value={newGymName} onChange={e => setNewGymName(e.target.value)} />
        <div className="label" style={{ marginTop: "0.5rem" }}>Gym owner address</div>
        <input type="text" placeholder="0x…" value={newGymOwner} onChange={e => setNewGymOwner(e.target.value)} />
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <div>
            <div className="label">Monthly fee (ETH)</div>
            <input type="number" min="0" step="0.001" placeholder="0.01" value={newGymFee} onChange={e => setNewGymFee(e.target.value)} />
          </div>
          <div>
            <div className="label">Points per visit</div>
            <input type="number" min="1" placeholder="100" value={newGymPts} onChange={e => setNewGymPts(e.target.value)} />
          </div>
        </div>
        <button
          onClick={onDeployGym}
          disabled={!newGymName || !newGymOwner || deployGymTx.state.status === "pending"}
        >
          {deployGymTx.state.status === "pending" ? "Deploying…" : "Deploy Gym Branch"}
        </button>
        <TxFeedback state={deployGymTx.state} explorerFn={explorerTx} />
      </div>
    </>
  );
}

// ── TxFeedback Component ───────────────────────────────────────────────────

function TxFeedback({
  state,
  explorerFn,
}: {
  state: ReturnType<typeof useTx>["state"];
  explorerFn: (hash: string) => string | null;
}) {
  if (state.status === "idle") return null;
  if (state.status === "pending") {
    const url = state.hash ? explorerFn(state.hash) : null;
    return (
      <div className="status pending">
        Transaction pending…{" "}
        {url && <a href={url} target="_blank" rel="noopener noreferrer">View on explorer</a>}
      </div>
    );
  }
  if (state.status === "mined") {
    const url = state.hash ? explorerFn(state.hash) : null;
    return (
      <div className="status mined">
        Confirmed!{" "}
        {url && <a href={url} target="_blank" rel="noopener noreferrer">View on explorer</a>}
      </div>
    );
  }
  return <div className="status error">{state.errorMsg}</div>;
}
