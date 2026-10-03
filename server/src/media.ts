import { Router } from 'express';
import multer from 'multer';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { z } from 'zod';
import { db } from './firebase';
import { ApiError, authenticate, parseId, requireMember, userOf } from './security';

export const assetSchema = z.object({ id: z.string(), ownerId: z.string(), conversationId: z.string().nullable(),
  name: z.string(), kind: z.enum(['image', 'audio', 'file']), purpose: z.enum(['profile', 'group', 'attachment']),
  url: z.string(), blobUrl: z.string(), mimeType: z.string(), size: z.number(), createdAt: z.number() });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3_000_000, files: 1, fields: 4 } });
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'application/pdf', 'text/plain']);
export const mediaRouter = Router();

async function assertRead(asset: z.infer<typeof assetSchema>, uid: string) {
  if (asset.ownerId === uid || asset.purpose === 'profile') return;
  if (asset.purpose === 'group' && !asset.conversationId) {
    const groups = await db.collection('conversations').where('photoUrl', '==', asset.url).get();
    if (groups.docs.some((group) => (group.data().memberIds as string[]).includes(uid))) return;
  }
  if (!asset.conversationId) throw new ApiError(403, 'Este arquivo é privado.');
  await requireMember(asset.conversationId, uid);
}
function signature(assetId: string, uid: string, expires: number): string {
  if (!process.env.CRON_SECRET) throw new ApiError(503, 'O serviço de mídia precisa de configuração.');
  return createHmac('sha256', process.env.CRON_SECRET).update(`media:${assetId}:${uid}:${expires}`).digest('hex');
}

mediaRouter.post('/', authenticate, upload.single('file'), async (request, response) => {
  const uid = userOf(request).uid;
  const { purpose, conversationId } = z.object({ purpose: z.enum(['profile', 'group', 'attachment']), conversationId: z.string().optional() }).parse(request.body);
  const file = request.file;
  if (!file || !allowed.has(file.mimetype)) throw new ApiError(400, 'Selecione uma imagem, áudio, PDF ou texto compatível, com até 3 MB.');
  if ((purpose === 'profile' || purpose === 'group') && !file.mimetype.startsWith('image/')) throw new ApiError(400, 'A foto precisa ser uma imagem.');
  if (purpose === 'attachment' && !conversationId) throw new ApiError(400, 'Escolha a conversa do arquivo.');
  if (conversationId) await requireMember(parseId(conversationId), uid, purpose === 'group');
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) throw new ApiError(503, 'O armazenamento de mídia ainda não está configurado.');
  const id = `a_${randomUUID().replaceAll('-', '')}`;
  const name = file.originalname.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180);
  const blob = await put(`${uid}/${id}/${name}`, file.buffer, { access: 'private', contentType: file.mimetype, addRandomSuffix: true });
  const base = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT || 4000}/api`;
  const asset = assetSchema.parse({ id, ownerId: uid, conversationId: conversationId ?? null, name,
    purpose, kind: file.mimetype.startsWith('image/') ? 'image' : file.mimetype.startsWith('audio/') ? 'audio' : 'file',
    mimeType: file.mimetype, size: file.size, createdAt: Date.now(), url: `${base}/media/${id}`, blobUrl: blob.url });
  await db.doc(`assets/${id}`).create(asset);
  const { blobUrl: _blobUrl, ownerId: _ownerId, purpose: _purpose, createdAt: _createdAt, conversationId: _conversationId, ...result } = asset;
  response.status(201).json(result);
});

mediaRouter.get('/:id/link', authenticate, async (request, response) => {
  const id = parseId(request.params.id);
  const asset = assetSchema.parse((await db.doc(`assets/${id}`).get()).data());
  const uid = userOf(request).uid;
  await assertRead(asset, uid);
  const expires = Date.now() + 5 * 60_000;
  response.json({ url: `${asset.url}?uid=${encodeURIComponent(uid)}&expires=${expires}&signature=${signature(id, uid, expires)}` });
});

mediaRouter.get('/:id', async (request, response) => {
  const id = parseId(request.params.id);
  const { uid, expires, signature: provided } = z.object({ uid: z.string(), expires: z.coerce.number(), signature: z.string().regex(/^[a-f0-9]{64}$/) }).parse(request.query);
  if (expires <= Date.now() || expires > Date.now() + 5 * 60_000) throw new ApiError(401, 'Este link expirou. Abra o arquivo novamente.');
  if (!timingSafeEqual(Buffer.from(signature(id, uid, expires)), Buffer.from(provided))) throw new ApiError(401, 'Link inválido.');
  const asset = assetSchema.parse((await db.doc(`assets/${id}`).get()).data());
  await assertRead(asset, uid);
  const blob = await get(asset.blobUrl, { access: 'private', useCache: false });
  if (!blob || !blob.stream) throw new ApiError(404, 'Arquivo não encontrado.');
  response.setHeader('Content-Type', asset.mimeType);
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
  response.send(Buffer.from(await new Response(blob.stream).arrayBuffer()));
});

export async function readAssetBytes(id: string, uid: string, conversationId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const asset = assetSchema.parse((await db.doc(`assets/${id}`).get()).data());
  if (asset.conversationId !== conversationId || asset.kind !== 'audio') throw new ApiError(400, 'Escolha um áudio desta conversa.');
  await assertRead(asset, uid);
  const blob = await get(asset.blobUrl, { access: 'private', useCache: false });
  if (!blob || !blob.stream) throw new ApiError(404, 'Áudio não encontrado.');
  return { bytes: Buffer.from(await new Response(blob.stream).arrayBuffer()), mimeType: asset.mimeType };
}
