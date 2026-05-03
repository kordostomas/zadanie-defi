import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import deployment from "@/generated/deployment.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GYM_BRANCH_ABI = (deployment as Record<string, any>).GymBranch.abi as any[];

export async function POST(request: NextRequest) {
  // Verify operator JWT
  const token = request.cookies.get("operator_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
    await jwtVerify(token, secret);
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Parse body
  const body = await request.json().catch(() => null);
  const memberAddress = body?.memberAddress as string | undefined;
  if (!memberAddress || !/^0x[0-9a-fA-F]{40}$/.test(memberAddress)) {
    return NextResponse.json({ error: "Invalid member address" }, { status: 400 });
  }

  // Config
  const branchAddress = process.env.NEXT_PUBLIC_BRANCH_ADDRESS
    ?? (deployment as { GymBranch?: { address?: string } }).GymBranch?.address
    ?? "";
  const operatorKey   = process.env.OPERATOR_PRIVATE_KEY;
  const rpcUrl        = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

  if (!branchAddress || !operatorKey) {
    return NextResponse.json({ error: "Branch not configured (missing NEXT_PUBLIC_BRANCH_ADDRESS or OPERATOR_PRIVATE_KEY)" }, { status: 500 });
  }

  // Execute check-in with operator key
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const wallet   = new Wallet(operatorKey, provider);
    const contract = new Contract(branchAddress, GYM_BRANCH_ABI, wallet);

    const tx      = await contract.checkIn(memberAddress);
    const receipt = await tx.wait();
    return NextResponse.json({ ok: true, txHash: receipt.hash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
