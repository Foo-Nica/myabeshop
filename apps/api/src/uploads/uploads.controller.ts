import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { CurrentStore, RequirePermission } from '../common/decorators';
import { AppError } from '../common/errors';
import { config } from '../common/config';
import type { StoreContext } from '../common/request';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'];

/**
 * Images are resized and converted to WebP on upload (§5.2) so storefronts stay under 500 KB in 3G.
 * Stored on local disk for now; the storage target moves to Cloudflare R2 in production.
 */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller('stores/:storeId/uploads')
export class UploadsController {
  @Post()
  @RequirePermission('products.write', 'store.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(@CurrentStore() ctx: StoreContext, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Aucun fichier reçu');
    if (!ALLOWED.includes(file.mimetype)) throw new AppError('UNSUPPORTED_FILE', 'Format d’image non pris en charge');
    let output: Buffer;
    try {
      output = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch {
      throw new AppError('UNSUPPORTED_FILE', 'Image illisible');
    }
    const dir = join(config.uploadDir, ctx.storeId);
    await mkdir(dir, { recursive: true });
    const name = `${randomBytes(10).toString('hex')}.webp`;
    await writeFile(join(dir, name), output);
    return { url: `${config.apiUrl}/uploads/${ctx.storeId}/${name}`, bytes: output.length };
  }
}
