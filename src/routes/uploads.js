import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const ALLOWED_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export default async function uploadsRoutes(app) {
  app.post('/api/uploads', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no file uploaded' });

    const ext = ALLOWED_MIME_EXT[file.mimetype];
    if (!ext) {
      return reply.code(400).send({ error: `unsupported file type: ${file.mimetype}` });
    }

    const filename = `${randomUUID()}.${ext}`;
    await pipeline(file.file, createWriteStream(join(app.uploadsDir, filename)));

    if (file.file.truncated) {
      return reply.code(413).send({ error: 'file too large (5 MB limit)' });
    }

    return reply.code(201).send({ url: `/uploads/${filename}` });
  });
}
