import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATH_PREFIXES = ['/invoice'];

export function middleware(request: NextRequest) {
  try {
    const requestHeaders = new Headers(request.headers);
    const pathname = request.nextUrl.pathname;
    requestHeaders.set('x-dmc-pathname', pathname);

    if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error('[middleware] failed to attach pathname header', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
