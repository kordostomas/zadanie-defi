import { Contract, JsonRpcSigner, BrowserProvider, formatEther } from "ethers";
import deployment from "../generated/deployment.json";

export const CONTRACT_ADDRESS: string = deployment.address;
export const CONTRACT_CHAIN_ID: number = deployment.chainId;
const ABI = deployment.abi;

export const ETHERSCAN_BASE =
  deployment.chainId === 11155111
    ? "https://sepolia.etherscan.io"
    : deployment.chainId === 1
    ? "https://etherscan.io"
    : null;

export function getReadContract(provider: BrowserProvider) {
  return new Contract(CONTRACT_ADDRESS, ABI, provider);
}

export function getWriteContract(signer: JsonRpcSigner) {
  return new Contract(CONTRACT_ADDRESS, ABI, signer);
}

export async function readValue(provider: BrowserProvider): Promise<bigint> {
  const c = getReadContract(provider);
  return (c.get as () => Promise<bigint>)();
}

export async function readOwner(provider: BrowserProvider): Promise<string> {
  const c = getReadContract(provider);
  return (c.owner as () => Promise<string>)();
}

export async function readContractBalance(provider: BrowserProvider): Promise<string> {
  const bal = await provider.getBalance(CONTRACT_ADDRESS);
  return formatEther(bal);
}
