import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  try {
    const result = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const context = JSON.parse(clientPayload ?? '{}');
        return { allowedContentTypes: ['application/json'], addRandomSuffix: false, tokenPayload: JSON.stringify({ module: context.module }) };
      },
      onUploadCompleted: async () => {},
    });
    return response.status(200).json(result);
  } catch (error) { return response.status(400).json({ error: error instanceof Error ? error.message : 'Falha no upload persistente.' }); }
}
