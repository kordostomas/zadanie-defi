"use client";

import { BrowserProvider, JsonRpcSigner } from "ethers";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const TARGET_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337", 10);

export function isMetaMaskAvailable(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectWallet(): Promise<{ provider: BrowserProvider; signer: JsonRpcSigner; address: string }> {
  if (!isMetaMaskAvailable()) {
    throw new Error("MetaMask is not installed. Please install it from metamask.io.");
  }
  const provider = new BrowserProvider(window.ethereum!);
  await provider.send("eth_requestAccounts", []);

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== TARGET_CHAIN_ID) {
    await switchToTargetChain();
  }

  const signer  = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

async function switchToTargetChain(): Promise<void> {
  const chainHex = "0x" + TARGET_CHAIN_ID.toString(16);
  try {
    await window.ethereum!.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 4902 && TARGET_CHAIN_ID === 31337) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chainHex,
          chainName: "Hardhat Local",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["http://127.0.0.1:8545"],
        }],
      });
    } else {
      throw err;
    }
  }
}

export function onAccountChange(cb: () => void): () => void {
  if (!isMetaMaskAvailable()) return () => {};
  const handler = () => cb();
  window.ethereum!.on("accountsChanged", handler);
  return () => window.ethereum!.removeListener("accountsChanged", handler);
}

export function onChainChange(cb: () => void): () => void {
  if (!isMetaMaskAvailable()) return () => {};
  const handler = () => cb();
  window.ethereum!.on("chainChanged", handler);
  return () => window.ethereum!.removeListener("chainChanged", handler);
}

const WALLET_COOKIE = "wallet_addr";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export function markWalletConnected(address: string): void {
  document.cookie = `${WALLET_COOKIE}=${address}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Strict`;
}

export function clearWalletConnected(): void {
  document.cookie = `${WALLET_COOKIE}=; path=/; max-age=0; SameSite=Strict`;
}

export function wasWalletConnected(): boolean {
  return getStoredWalletAddress() !== null;
}

export function getStoredWalletAddress(): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split(";").find(c => c.trim().startsWith(`${WALLET_COOKIE}=`));
  if (!entry) return null;
  const value = entry.trim().slice(WALLET_COOKIE.length + 1);
  return value || null;
}

export async function reconnectWallet(): Promise<{
  provider: BrowserProvider; signer: JsonRpcSigner; address: string;
} | null> {
  if (!isMetaMaskAvailable()) return null;
  const provider = new BrowserProvider(window.ethereum!);
  const accounts = await provider.send("eth_accounts", []) as string[];
  if (!accounts.length) return null;
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== TARGET_CHAIN_ID) return null;
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}
