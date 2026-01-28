import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const token = request.cookies.get('auth_token')
    const { pathname } = request.nextUrl

    // Allow access to login page and public assets
    if (
        pathname.startsWith('/login') ||
        pathname.startsWith('/_next') ||
        pathname.includes('.') // file extensions (images, etc)
    ) {
        return NextResponse.next()
    }

    // Check if user is authenticated
    // We check if the token exists AND matches the environment password
    const password = process.env.PASSWORD;
    if (!token || (password && token.value !== password)) {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}
