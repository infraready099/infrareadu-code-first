import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  // Forward the pathname so server components (e.g. dashboard layout) can
  // read it via headers() and preserve it through the login redirect.
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and the auth callback.
     * This keeps the middleware lean — only runs on page requests.
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback).*)",
  ],
};
