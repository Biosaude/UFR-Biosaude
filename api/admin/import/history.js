import { apiError, requireAdmin, supabase } from '../../_lib/supabase.js';
export default async function handler(req, res) { if (req.method !== 'GET') return res.status(405).end(); if (!await requireAdmin(req, res)) return; try { const { body } = await supabase('importacoes?select=*&order=created_at.desc&limit=100'); return res.status(200).json(body); } catch (e) { return apiError(res, e); } }
