export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nome, email, telefone, cpf } = req.body;

  if (!nome || !email || !telefone || !cpf) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const ABACATEPAY_KEY = process.env.ABACATE_KEY;
  const NOCODB_TABLE_ID = process.env.NOCODB_TABLE_ID;
  const NOCODB_API_KEY = process.env.NOCODB_API_KEY;

  if (!ABACATEPAY_KEY) {
    return res.status(500).json({ error: 'Chave AbacatePay não configurada no servidor.' });
  }

  // Format phone: ensure +55 prefix, strip non-digits first
  const phoneDigits = telefone.replace(/\D/g, '');
  const cellphone = phoneDigits.startsWith('55')
    ? `+${phoneDigits}`
    : `+55${phoneDigits}`;

  // Strip non-digits from CPF
  const taxId = cpf.replace(/\D/g, '');

  try {
    // 1. Create PIX QR Code via AbacatePay
    const pixRes = await fetch('https://api.abacatepay.com/v1/pixQrCode/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_KEY}`,
      },
      body: JSON.stringify({
        amount: 900, // R$9,00 em centavos
        expiresIn: 600,
        description: 'CurriculoAI PDF',
        customer: { name: nome, cellphone, email, taxId },
      }),
    });

    const pixText = await pixRes.text();
    let pixJson;
    try { pixJson = JSON.parse(pixText); }
    catch(e) { return res.status(502).json({ error: 'Resposta inválida do AbacatePay: ' + pixText.slice(0,120) }); }

    if (!pixJson.data) {
      return res.status(502).json({ error: pixJson.error || JSON.stringify(pixJson) });
    }

    const pix = pixJson.data;

    // 2. Save record to NocoDB
    try {
      await fetch(`https://app.nocodb.com/api/v2/tables/${NOCODB_TABLE_ID}/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xc-token': NOCODB_API_KEY,
        },
        body: JSON.stringify({
          Nome: nome,
          Email: email,
          Telefone: telefone,
          CPF: taxId,
          PixId: pix.id,
          Status: 'PENDING',
          Valor: 900,
        }),
      });
    } catch (dbErr) {
      // Don't fail the payment if DB write fails — just log
      console.error('NocoDB write error:', dbErr.message);
    }

    return res.status(200).json({
      pixId: pix.id,
      brCode: pix.brCode,
      brCodeBase64: pix.brCodeBase64,
      expiresAt: pix.expiresAt,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
