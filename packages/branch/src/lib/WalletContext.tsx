"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import {
  connectWallet, reconnectWallet,
  markWalletConnected, clearWalletConnected, getStoredWalletAddress,
  isMetaMaskAvailable,
} from "@/lib/wallet";

interface WalletState {
  address: string | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  address: null, signer: null, provider: null,
  isConnecting: false, error: null,
  connect: async () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address,      setAddress]      = useState<string | null>(null);
  const [signer,       setSigner]       = useState<JsonRpcSigner | null>(null);
  const [provider,     setProvider]     = useState<BrowserProvider | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Auto-reconnect on mount
  useEffect(() => {
    const storedAddress = getStoredWalletAddress();
    if (!storedAddress) return;

    // Restore address immediately from cookie so UI never shows "Connect Wallet" on refresh
    setAddress(storedAddress);

    // Try to get the full MetaMask connection (signer) in the background
    reconnectWallet()
      .then(r => {
        if (r) { setProvider(r.provider); setSigner(r.signer); setAddress(r.address); }
        // If null (MetaMask locked / not ready): address stays from cookie, signer stays null.
        // Cookie is kept so the next reload retries — only cleared on explicit disconnect below.
      })
      .catch(() => {
        setAddress(null);
        clearWalletConnected();
      });
  }, []);

  // Single global account/chain listeners
  useEffect(() => {
    if (!isMetaMaskAvailable()) return;
    const handleAccounts = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        setAddress(null); setSigner(null); setProvider(null);
        clearWalletConnected();
      } else {
        window.location.reload();
      }
    };
    const handleChain = () => window.location.reload();
    window.ethereum!.on("accountsChanged", handleAccounts);
    window.ethereum!.on("chainChanged", handleChain);
    return () => {
      window.ethereum!.removeListener("accountsChanged", handleAccounts);
      window.ethereum!.removeListener("chainChanged", handleChain);
    };
  }, []);

  async function connect() {
    setError(null);
    setIsConnecting(true);
    try {
      const r = await connectWallet();
      setProvider(r.provider); setSigner(r.signer); setAddress(r.address);
      markWalletConnected(r.address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <WalletContext.Provider value={{ address, signer, provider, isConnecting, error, connect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  return useContext(WalletContext);
}
