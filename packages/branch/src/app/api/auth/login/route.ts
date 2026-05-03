import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.pin) return NextResponse.json({ error: "PIN required" }, { status: 400 });
  
  var pinHash = process.env.OPERATOR_PIN_HASH;
  if (!pinHash) return NextResponse.json({ error: "Operator PIN not configured" }, { status: 500 });
  if(!pinHash.startsWith("$2b$")) pinHash = "$2a$14$" + pinHash; 
  console.log("Comparing PIN", body.pin, "with hash", pinHash);
  const valid = await bcrypt.compare(String(body.pin), pinHash);
  if (!valid) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
  const token  = await new SignJWT({ role: "operator" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("operator_token", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   8 * 3600,
    path:     "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("operator_token");
  return res;
}
