import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const supportedLocales = ["ar", "en"] as const;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const locale = supportedLocales.find((item) => pathname === `/${item}` || pathname.startsWith(`/${item}/`));

  if (!locale) {
    const url = request.nextUrl.clone();
    url.pathname = `/ar${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  if (pathname === `/${locale}/login`) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.userId) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
