export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const url = process.env.VITE_SUPABASE_URL?.trim();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return res.status(200).json({ configured: false });

  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res.status(200).json({ configured: true, url, anonKey });
}
