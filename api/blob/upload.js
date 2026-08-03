import { handleUpload } from '@vercel/blob/client';

const blobToken = () => process.env.ufrdabiosaude_READ_WRITE_TOKEN;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  const token = blobToken();
  if (!token) return response.status(500).json({ error: 'A variável ufrdabiosaude_READ_WRITE_TOKEN não está disponível no ambiente.' });

  try {
    const result = await handleUpload({
      body: request.body,
      request,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const normalizedArtifact = pathname.includes('/versions/') && pathname.toLowerCase().endsWith('.json');
        const sourceWorkbook = pathname.includes('/sources/') && pathname.toLowerCase().endsWith('.xlsx');
        if (!normalizedArtifact && !sourceWorkbook) throw new Error('Somente planilhas .xlsx e seus artefatos internos validados são permitidos.');
        return { allowedContentTypes: normalizedArtifact ? ['application/json'] : ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'], maximumSizeInBytes: 100 * 1024 * 1024, addRandomSuffix: true, tokenPayload: clientPayload ?? '' };
      },
      onUploadCompleted: async () => {},
    });
    return response.status(200).json(result);
  } catch (error) {
    console.error('Erro completo no upload Blob:', error);
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Falha ao gerar o token de upload.' });
  }
}
