import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATH_PREFIXES = ['/invoice'];

export function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname || '/';
    const requestHeaders = new Headers(request.headers);

    requestHeaders.set('x-dmc-pathname', pathname);

    for (const prefix of PUBLIC_PATH_PREFIXES) {
      if (pathname.startsWith(prefix)) {
        break;
      }
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
};
