// api/lifi/gas/prices/[chainId].ts
// Vercel API route to proxy Li.Fi gas prices API calls

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { chainId: string } }
) {
  try {
    const { chainId } = params;
    
    // Validate chainId
    if (!chainId || isNaN(Number(chainId))) {
      return NextResponse.json(
        { error: 'Invalid chain ID' },
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
    const response = await fetch(`https://li.quest/v1/gas/prices/${chainId}`, {
      method: 'GET',
      headers: {
        'x-lifi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Li.Fi API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch gas prices' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in gas prices API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
