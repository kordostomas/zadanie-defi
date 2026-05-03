"use client";

import { useEffect, useState } from "react";
import { isMetaMaskAvailable } from "@/lib/wallet";
import { useWallet } from "@/lib/WalletContext";
import {
  GymInfo, ProductInfo,
  readGymInfo, readProducts, readLoyaltyBalance, readIsMember,
  getReadProvider, getGymBranch, PRODUCT_TYPE_LABEL,
} from "@/lib/contract";
import { useTx } from "@/lib/useTx";
import { BottomNav } from "@/components/BottomNav";

export default function ShopPage() {
  const { signer, address, connect, isConnecting, error: connErr } = useWallet();
  const [gym,      setGym]      = useState<GymInfo | null>(null);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [balance,  setBalance]  = useState<bigint>(0n);
  const [isMember, setIsMember] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const redeemTx = useTx();

  const load = async (addr?: string) => {
    setLoading(true);
    try {
      const p = getReadProvider() as Parameters<typeof readGymInfo>[0];
      const g = await readGymInfo(p);
      setGym(g);
      const prods = await readProducts(g.shopProduct, p);
      setProducts(prods.filter(pr => pr.isActive));
      if (addr) {
        const [bal, mem] = await Promise.all([
          readLoyaltyBalance(addr, p),
          readIsMember(addr, p),
        ]);
        setBalance(bal);
        setIsMember(mem);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(address ?? undefined); }, [address]);

  useEffect(() => {
    if (redeemTx.state.status === "mined" && address) load(address);
  }, [redeemTx.state.status]);

  async function handleRedeem(productId: number) {
    if (!signer) return;
    const c = getGymBranch(signer);
    await redeemTx.send(() => c.redeemProduct(productId) as ReturnType<typeof c.redeemProduct>);
  }

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Shop</div>
        {address && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span className="badge green">{balance.toString()} pts</span>
          </div>
        )}
      </nav>

      <div className="page">
        <div className="hero-sm">
          <h1>Rewards Shop</h1>
          <p>Spend your loyalty points on exclusive rewards.</p>
        </div>

        {/* Connect */}
        {!address && (
          <div className="wallet-card">
            {!isMetaMaskAvailable() && (
              <p className="status error" style={{ marginBottom: "0.75rem" }}>MetaMask not detected.</p>
            )}
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              Connect your wallet to redeem rewards.
            </p>
            <button className="full" onClick={connect} disabled={!isMetaMaskAvailable() || isConnecting}>
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
            {connErr && <div className="status error">{connErr}</div>}
          </div>
        )}

        {/* Balance */}
        {address && (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="stat-label">Your Balance</div>
              <div className="stat-value">{balance.toString()} <span style={{ fontSize: "1rem", fontWeight: 600, color: "#888" }}>pts</span></div>
            </div>
            {!isMember && (
              <a href="/register" style={{ fontSize: "0.82rem" }}>Not a member → Register</a>
            )}
          </div>
        )}

        {/* Product list */}
        {loading && <p className="muted" style={{ textAlign: "center", padding: "2rem" }}>Loading shop…</p>}
        {!loading && products.length === 0 && (
          <div className="card">
            <p className="muted" style={{ textAlign: "center" }}>No products available yet.</p>
          </div>
        )}
        {!loading && products.length > 0 && (
          <div className="card">
            <div className="card-title">Available Rewards</div>
            {products.map(p => (
              <div key={p.id} className="product-row">
                <div style={{ flex: 1 }}>
                  <div className="product-name">{p.name}</div>
                  {p.description && <div className="product-desc">{p.description}</div>}
                  <div className="product-meta">
                    <span className="badge gray">{PRODUCT_TYPE_LABEL[p.productType]}</span>
                    <span className="muted" style={{ fontSize: "0.75rem" }}>Stock: {p.stock.toString()}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="product-cost">{p.loyaltyPointCost.toString()} pts</div>
                  {address && isMember && p.stock > 0n && (
                    <button
                      className="sm"
                      style={{ marginTop: "0.4rem" }}
                      disabled={balance < p.loyaltyPointCost || redeemTx.state.status === "pending"}
                      onClick={() => handleRedeem(p.id)}
                    >
                      {redeemTx.state.status === "pending" ? "…" : "Redeem"}
                    </button>
                  )}
                  {address && isMember && balance < p.loyaltyPointCost && (
                    <div style={{ fontSize: "0.7rem", color: "#888", marginTop: "0.2rem" }}>Not enough pts</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {redeemTx.state.status !== "idle" && (
          <div className={`status ${redeemTx.state.status}`}>
            {redeemTx.state.status === "pending" && "Redeeming…"}
            {redeemTx.state.status === "mined"   && "Redeemed! Reward confirmed on-chain."}
            {redeemTx.state.status === "error"   && redeemTx.state.errorMsg}
          </div>
        )}
      </div>

      <BottomNav active="shop" />
    </>
  );
}
