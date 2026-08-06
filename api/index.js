import admin from '../server/admin.js';
import auth from '../server/auth.js';
import dashboard from '../server/dashboard.js';

const handlers = { admin, auth, dashboard };

export default async function handler(req, res) {
  const scope = getScope(req);
  const scopedHandler = handlers[scope];

  if (!scopedHandler) {
    return res.status(404).json({ error: 'Endpoint não encontrado.' });
  }

  return scopedHandler(req, res);
}

function getScope(req) {
  if (req.query?.scope) {
    return Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
  }

  const host = req.headers.host || 'localhost';
  return new URL(req.url || '/api', `http://${host}`).searchParams.get('scope') || '';
}
