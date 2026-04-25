import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/operator/scanner", "/operator/members"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token  = request.cookies.get("operator_token")?.value;
  if (!token) return NextResponse.redirect(new URL("/operator/login", request.url));

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/operator/login", request.url));
    res.cookies.delete("operator_token");
    return res;
  }
}

export const config = {
  matcher: ["/operator/:path*"],
};
