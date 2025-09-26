// api/lifi/status.ts
// Vercel API route to proxy Li.Fi bridge status API calls

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const txHash = searchParams.get('txHash');
    const fromChainId = searchParams.get('fromChainId');
    const toChainId = searchParams.get('toChainId');

    // Validate required parameters
    if (!txHash || !fromChainId || !toChainId) {
      return NextResponse.json(
        { error: 'Missing required parameters: txHash, fromChainId, toChainId' },
        { status: 400 }
      );
    }

    // Validate chain IDs
    if (isNaN(Number(fromChainId)) || isNaN(Number(toChainId))) {
      return NextResponse.json(
        { error: 'Invalid chain IDs' },
        { status: 400 }
      );
    }

    // Get API key from environment variables
    const apiKey = process.env.VITE_LIFI_API_KEY;
    if (!apiKey) {
      console.error('VITE_LIFI_API_KEY not found in environment variables');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Proxy the request to Li.Fi API
    const response = await fetch(
      `https://li.quest/v1/status?txHash=${txHash}&fromChainId=${fromChainId}&toChainId=${toChainId}`,
      {
        method: 'GET',
        headers: {
          'x-lifi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`Li.Fi API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: 'Failed to check bridge status' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in bridge status API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
