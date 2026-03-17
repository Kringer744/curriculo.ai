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

  const { email, senha } = req.body;
  if (!email || !senha)
    return res.status(400).json({ error: 'Informe e-mail e senha.' });

  const TABLE = process.env.NOCODB_USERS_TABLE_ID;
  const BASE_ID = process.env.NOCODB_BASE_ID;
  const API_KEY = process.env.NOCODB_API_KEY;

  const result = await fetch(
    `${BASE}/${BASE_ID}/${TABLE}?where=(Email,eq,${encodeURIComponent(email.toLowerCase())})&limit=1`,
    { headers: { 'xc-token': API_KEY } }
  ).then(r => r.json());

  const user = result.list?.[0];
  if (!user) return res.status(401).json({ error: 'E-mail não encontrado.' });

  const hash = hashPassword(senha, email);
  if (hash !== user.SenhaHash)
    return res.status(401).json({ error: 'Senha incorreta.' });

  const token = makeToken(email);
  return res.status(200).json({ token, nome: user.Nome, email: email.toLowerCase() });
}
