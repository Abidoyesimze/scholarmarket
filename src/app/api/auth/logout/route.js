import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserFromCookie } from '@/lib/api/auth';
import { auditLog } from '@/lib/api/audit';

import { logger } from "@/lib/logger";
export async function POST(request) {
  try {
    const user = await getUserFromCookie(request);

    const cookieHeader = request.headers.get("cookie") || "";
    const refreshMatch = cookieHeader.match(/(?:^|;\s*)refresh_token=([^;]+)/);
    const refreshToken = refreshMatch ? decodeURIComponent(refreshMatch[1]) : null;
    
    // Even if user isn't found, we'll try to clear the cookie
    const response = NextResponse.json({ success: true });

    // Expire the cookies by setting maxAge to 0
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    response.cookies.set('refresh_token', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 0,
    });

    const db = await getDb();
    if (refreshToken) {
      await db.collection('refresh_tokens').deleteMany({ token: refreshToken });
    }

    if (user) {
      const identifiers = [user.sub, user._id?.toString(), user.id?.toString(), user.walletAddress].filter(Boolean);
      await db.collection('refresh_tokens').deleteMany({
        userId: { $in: identifiers }
      });
      
      auditLog({
        event: "auth_logout_success",
        route: "auth/logout",
        method: "POST",
        status: 200,
        address: user.walletAddress,
      });
    }

    return response;
  } catch (error) {
    logger.error('POST /api/auth/logout error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
