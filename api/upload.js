import { handleUpload } from '@vercel/blob/client';

const AUTH_ENABLED = false;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  try {
    const result = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const context = JSON.parse(clientPayload ?? '{}');
        if (AUTH_ENABLED && (!process.env.UFR_ADMIN_TOKEN || context.adminToken !== process.env.UFR_ADMIN_TOKEN)) throw new Error('Usuário sem autorização para substituir bases.');
        return { allowedContentTypes: ['application/json'], addRandomSuffix: false, tokenPayload: JSON.stringify({ module: context.module, user: context.user }) };
      },
      onUploadCompleted: async () => {},
    });
    return response.status(200).json(result);
  } catch (error) { return response.status(400).json({ error: error instanceof Error ? error.message : 'Falha no upload persistente.' }); }
}
