import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const storeIsLinked = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_WEBHOOK_PUBLIC_KEY);
    return response.status(503).json({
      error: storeIsLinked
        ? 'O Vercel Blob está vinculado, mas a credencial BLOB_READ_WRITE_TOKEN não está disponível neste deployment.'
        : 'O Vercel Blob não está configurado neste deployment.',
    });
  }
  try {
    const result = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const context = JSON.parse(clientPayload ?? '{}');
        if (!process.env.UFR_ADMIN_TOKEN || context.adminToken !== process.env.UFR_ADMIN_TOKEN) throw new Error('Usuário sem autorização para substituir bases.');
        return { allowedContentTypes: ['application/json'], addRandomSuffix: false, tokenPayload: JSON.stringify({ module: context.module, user: context.user }) };
      },
      onUploadCompleted: async () => {},
    });
    return response.status(200).json(result);
  } catch (error) { return response.status(400).json({ error: error instanceof Error ? error.message : 'Falha no upload persistente.' }); }
}
