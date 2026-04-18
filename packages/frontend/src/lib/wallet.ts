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

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

async function switchToTargetChain(): Promise<void> {
  const chainHex = "0x" + TARGET_CHAIN_ID.toString(16);
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  } catch (err: unknown) {
    const switchErr = err as { code?: number };
    // Chain not added yet — add it (only for local Hardhat)
    if (switchErr.code === 4902 && TARGET_CHAIN_ID === 31337) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainHex,
            chainName: "Hardhat Local",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["http://127.0.0.1:8545"],
          },
        ],
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
