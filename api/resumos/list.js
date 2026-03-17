import { createHmac } from 'crypto';

const BASE = 'https://app.nocodb.com/api/v1/db/data/noco';

function verifyToken(token) {
  if (!token) throw new Error('Token ausente');
  const [payload, sig] = token.split('.');
  if (!payload || !sig) throw new Error('Token inválido');
  const expected = createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
  if (expected !== sig) throw new Error('Token inválido');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.exp < Date.now()) throw new Error('Sessão expirada.');
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  let user;
  try { user = verifyToken(token); } catch (e) {
    return res.status(401).json({ error: e.message });
  }

  const TABLE = process.env.NOCODB_CURRICULOS_TABLE_ID;
  const BASE_ID = process.env.NOCODB_BASE_ID;
  const API_KEY = process.env.NOCODB_API_KEY;

  const result = await fetch(
    `${BASE}/${BASE_ID}/${TABLE}?where=(UserEmail,eq,${encodeURIComponent(user.email)})&sort=-CreatedAt&limit=50`,
    { headers: { 'xc-token': API_KEY } }
  ).then(r => r.json());

  const list = (result.list || []).map(r => ({
    id: r.Id,
    nomeCompleto: r.NomeCompleto,
    cargo: r.Cargo,
    dadosCV: r.DadosCV,
    pago: r.Pago,
    criadoEm: r.CreatedAt,
  }));

  return res.status(200).json({ list });
}
