// api/lifi/status.ts
// Vercel serverless function to proxy Li.Fi bridge status API calls

export default async function handler(req: any, res: any) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { txHash, fromChainId, toChainId } = req.query;

    // Validate required parameters
    if (!txHash || !fromChainId || !toChainId) {
      return res.status(400).json({
        error: 'Missing required parameters: txHash, fromChainId, toChainId'
      });
    }

    // Validate chain IDs
    if (isNaN(Number(fromChainId)) || isNaN(Number(toChainId))) {
      return res.status(400).json({
        error: 'Invalid chain IDs'
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
      return res.status(response.status).json({
        error: 'Failed to check bridge status'
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error in bridge status API route:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}
