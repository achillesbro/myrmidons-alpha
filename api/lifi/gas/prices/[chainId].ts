// api/lifi/gas/prices/[chainId].ts
// Vercel serverless function to proxy Li.Fi gas prices API calls

export default async function handler(req: any, res: any) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { chainId } = req.query;
    
    // Validate chainId
    if (!chainId || isNaN(Number(chainId))) {
      return res.status(400).json({
        error: 'Invalid chain ID'
      });
    }

    // Get API key from environment variables
    const apiKey = process.env.VITE_LIFI_API_KEY;
    if (!apiKey) {
      console.error('VITE_LIFI_API_KEY not found in environment variables');
      return res.status(500).json({
        error: 'API key not configured'
      });
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
      return res.status(response.status).json({
        error: 'Failed to fetch gas prices'
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error in gas prices API route:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}
