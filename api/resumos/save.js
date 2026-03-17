import { createHmac } from 'crypto';

const BASE = 'https://app.nocodb.com/api/v1/db/data/noco';

function verifyToken(token) {
  if (!token) throw new Error('Token ausente');
  const [payload, sig] = token.split('.');
  if (!payload || !sig) throw new Error('Token inválido');
  const expected = createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
  if (expected !== sig) throw new Error('Token inválido');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.exp < Date.now()) throw new Error('Sessão expirada. Faça login novamente.');
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  let user;
  try { user = verifyToken(token); } catch (e) {
    return res.status(401).json({ error: e.message });
  }

  const { nomeCompleto, cargo, dadosCV, pixId, pago } = req.body;
  const TABLE = process.env.NOCODB_CURRICULOS_TABLE_ID;
  const BASE_ID = process.env.NOCODB_BASE_ID;
  const API_KEY = process.env.NOCODB_API_KEY;
  const headers = { 'xc-token': API_KEY, 'Content-Type': 'application/json' };

  // If pixId exists, try to update existing record first
  if (pixId) {
    const existing = await fetch(
      `${BASE}/${BASE_ID}/${TABLE}?where=(UserEmail,eq,${encodeURIComponent(user.email)})~and(PixId,eq,${encodeURIComponent(pixId)})&limit=1`,
      { headers }
    ).then(r => r.json());

    if (existing.list?.[0]) {
      const id = existing.list[0].Id;
      await fetch(`${BASE}/${BASE_ID}/${TABLE}/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ Pago: !!pago }),
      });
      return res.status(200).json({ id });
    }
  }

  // Create new record
  const result = await fetch(`${BASE}/${BASE_ID}/${TABLE}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      UserEmail: user.email,
      NomeCompleto: nomeCompleto || '',
      Cargo: cargo || '',
      DadosCV: typeof dadosCV === 'string' ? dadosCV : JSON.stringify(dadosCV),
      PixId: pixId || '',
      Pago: !!pago,
    }),
  }).then(r => r.json());

  return res.status(200).json({ id: result.Id });
}
