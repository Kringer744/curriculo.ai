import { createHash, createHmac } from 'crypto';

const BASE = 'https://app.nocodb.com/api/v1/db/data/noco';

function hashPassword(password, email) {
  return createHash('sha256')
    .update(password + process.env.AUTH_SALT + email.toLowerCase())
    .digest('hex');
}

function makeToken(email) {
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), exp: Date.now() + 30 * 24 * 3600 * 1000 })
  ).toString('base64url');
  const sig = createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha)
    return res.status(400).json({ error: 'Preencha nome, e-mail e senha.' });
  if (senha.length < 6)
    return res.status(400).json({ error: 'Senha mínima de 6 caracteres.' });

  const TABLE = process.env.NOCODB_USERS_TABLE_ID;
  const BASE_ID = process.env.NOCODB_BASE_ID;
  const API_KEY = process.env.NOCODB_API_KEY;
  const headers = { 'xc-token': API_KEY, 'Content-Type': 'application/json' };

  // Check if email already exists
  const existing = await fetch(
    `${BASE}/${BASE_ID}/${TABLE}?where=(Email,eq,${encodeURIComponent(email.toLowerCase())})&limit=1`,
    { headers }
  ).then(r => r.json());

  if (existing.list?.length > 0)
    return res.status(409).json({ error: 'E-mail já cadastrado. Faça login.' });

  await fetch(`${BASE}/${BASE_ID}/${TABLE}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Nome: nome,
      Email: email.toLowerCase(),
      SenhaHash: hashPassword(senha, email),
    }),
  });

  const token = makeToken(email);
  return res.status(200).json({ token, nome, email: email.toLowerCase() });
}
