export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const ABACATEPAY_KEY = process.env.ABACATEPAY_KEY;
  const NOCODB_TABLE_ID = process.env.NOCODB_TABLE_ID;
  const NOCODB_API_KEY = process.env.NOCODB_API_KEY;

  try {
    // 1. Check status on AbacatePay
    const statusRes = await fetch(
      `https://api.abacatepay.com/v1/pixQrCode/check?id=${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${ABACATEPAY_KEY}` },
      }
    );

    const statusJson = await statusRes.json();
    const status = statusJson.data?.status;

    // 2. If paid, update NocoDB record
    if (status === 'PAID') {
      try {
        // Find the record by PixId
        const searchRes = await fetch(
          `https://app.nocodb.com/api/v2/tables/${NOCODB_TABLE_ID}/records?where=(PixId,eq,${encodeURIComponent(id)})&limit=1`,
          { headers: { 'xc-token': NOCODB_API_KEY } }
        );
        const searchJson = await searchRes.json();
        const record = searchJson.list?.[0];

        if (record && record.Status !== 'PAID') {
          await fetch(`https://app.nocodb.com/api/v2/tables/${NOCODB_TABLE_ID}/records`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'xc-token': NOCODB_API_KEY,
            },
            body: JSON.stringify({ Id: record.Id, Status: 'PAID' }),
          });
        }
      } catch (dbErr) {
        console.error('NocoDB update error:', dbErr.message);
      }
    }

    return res.status(200).json({ status: status || 'UNKNOWN' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
