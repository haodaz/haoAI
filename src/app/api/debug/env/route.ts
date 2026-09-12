import { NextResponse } from 'next/server';
import { getInternalBaseUrl } from '@/lib/model-registry';

export async function GET() {
  const baseUrl = getInternalBaseUrl();
  const envVars = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || '(not set)',
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '(not set)',
    VERCEL_URL: process.env.VERCEL_URL || '(not set)',
    VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
    PORT: process.env.PORT || '(not set)',
    resolvedBaseUrl: baseUrl,
  };

  // Quick connectivity test
  let connectivityTest = 'not tested';
  try {
    const res = await fetch(`${baseUrl}/api/toolbox/assets?limit=1`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    connectivityTest = `status=${res.status}, ok=${res.ok}`;
  } catch (err: any) {
    connectivityTest = `FAILED: ${err.message}`;
  }

  return NextResponse.json({ 
    ...envVars, 
    connectivityTest,
    timestamp: new Date().toISOString() 
  });
}
