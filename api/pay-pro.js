export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nome, email, telefone, cpf, feature } = req.body;

  if (!nome || !email || !telefone || !cpf) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const ABACATEPAY_KEY = process.env.ABACATEPAY_KEY;
  const NOCODB_TABLE_ID = process.env.NOCODB_TABLE_ID;
  const NOCODB_API_KEY = process.env.NOCODB_API_KEY;

  const phoneDigits = telefone.replace(/\D/g, '');
  const cellphone = phoneDigits.startsWith('55') ? `+${phoneDigits}` : `+55${phoneDigits}`;
  const taxId = cpf.replace(/\D/g, '');

  const featureLabel = {
    adaptar: 'Adaptar para outra vaga',
    ingles: 'Versão em inglês',
    carta: 'Carta de apresentação',
  }[feature] || 'Pro';

  try {
    const pixRes = await fetch('https://api.abacatepay.com/v1/pixQrCode/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ABACATEPAY_KEY}` },
      body: JSON.stringify({
        amount: 1900, // R$19,00 em centavos
        expiresIn: 600,
        description: `CurriculoAI Pro - ${featureLabel}`,
        customer: { name: nome, cellphone, email, taxId },
      }),
    });

    const pixJson = await pixRes.json();
    if (!pixJson.data) return res.status(502).json({ error: pixJson.error || 'Erro ao criar PIX Pro' });

    const pix = pixJson.data;

    // Save to NocoDB payment table
    try {
      await fetch(`https://app.nocodb.com/api/v1/db/data/noco/p3wsy6twa4cp83k/${NOCODB_TABLE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xc-token': NOCODB_API_KEY },
        body: JSON.stringify({
          Nome: nome, Email: email, Telefone: telefone, CPF: taxId,
          PixId: pix.id, Status: 'PENDING', Valor: 1900,
        }),
      });
    } catch (dbErr) {
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
