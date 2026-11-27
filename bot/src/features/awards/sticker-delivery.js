export function isSafeTelegramTgsAnimation(animationData) {
  if (!animationData || typeof animationData !== "object") return false;
  if (!(Number(animationData.w) > 0 && Number(animationData.w) <= 512)) return false;
  if (!(Number(animationData.h) > 0 && Number(animationData.h) <= 512)) return false;
  if (!Array.isArray(animationData.layers)) return false;
  if (Array.isArray(animationData.assets) && animationData.assets.some(asset => asset?.p || asset?.u)) return false;
  return true;
}

export function parseTelegramEmojiSetName(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['t.me', 'telegram.me'].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'addemoji') return null;
    return /^[A-Za-z0-9_]{1,64}$/.test(parts[1]) ? parts[1] : null;
  } catch {
    return null;
  }
}

export function isTelegramCustomEmojiSet(stickerSet) {
  return String(stickerSet?.sticker_type || stickerSet?.type || '') === 'custom_emoji';
}

export function getTelegramStickerFormat(sticker) {
  if (sticker?.is_video === true) return 'webm';
  if (sticker?.is_animated === true) return 'tgs';
  return 'image';
}

export function getTelegramStickerFileExtension(filePath) {
  const fileName = String(filePath || '').split('/').pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

export function isTelegramStickerExtensionAllowed(responseFormat, extension) {
  if (!extension) return true;
  return responseFormat === 'tgs' ? extension === 'tgs'
    : responseFormat === 'webm' ? extension === 'webm'
    : ['webp', 'png', 'jpg', 'jpeg'].includes(extension);
}

export async function serveTelegramAwardSticker(request, env, { TELEGRAM_API, withCors, ensureWorldTables, telegram }) {
  const url = new URL(request.url);
  const packStickerId = String(url.searchParams.get('stickerId') || '').trim();
  const awardId = String(url.searchParams.get('awardId') || '').trim();
  const wantsPreview = url.searchParams.get('preview') === '1';
  let format = 'unknown';

  // Keep public responses intentionally opaque; expose only a stable diagnostic
  // code in a response header and Cloudflare logs. Never log IDs, file paths,
  // Telegram responses, or credentials.
  const fail = (reason, status = 404, diagnostics = null) => {
    console.warn('[award-sticker]', JSON.stringify({
      reason,
      preview: wantsPreview,
      format,
      status,
    }));
    return withCors(new Response(JSON.stringify({ ok: false, code: reason, ...(diagnostics || {}) }), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Voxygen-Sticker-Error': reason,
        'X-Content-Type-Options': 'nosniff',
      },
    }));
  };

  if (Boolean(packStickerId) === Boolean(awardId)) return fail('invalid_query', 400);

  try {
    await ensureWorldTables(env);
    const record = packStickerId
      ? await env.DB.prepare(`SELECT file_id,format,thumbnail_file_id FROM telegram_award_pack_stickers WHERE id=? LIMIT 1`).bind(packStickerId).first()
      : await env.DB.prepare(`SELECT sticker_file_id AS file_id,sticker_format AS format,sticker_thumbnail_file_id AS thumbnail_file_id FROM territory_awards WHERE id=? LIMIT 1`).bind(awardId).first();

    format = String(record?.format || 'unknown');
    if (!record) return fail('record_not_found');
    const isPreviewImage = wantsPreview && Boolean(record.thumbnail_file_id || record.format === 'image');
    const requestedFileId = wantsPreview
      ? (record.thumbnail_file_id || (record.format === 'image' ? record.file_id : null))
      : record.file_id;
    if (!requestedFileId) return fail(wantsPreview ? 'preview_unavailable' : 'file_id_missing');

    const fileInfo = await telegram(env, 'getFile', { file_id: requestedFileId });
    const filePath = String(fileInfo.data?.result?.file_path || '');
    if (!fileInfo.response.ok) return fail('telegram_getfile_http', 502);
    if (!fileInfo.data?.ok) return fail('telegram_getfile_api', 502);
    if (!filePath || filePath.includes('..') || filePath.startsWith('/')) return fail('telegram_file_path_invalid', 502);

    // Telegram file_path may omit the suffix entirely (for example,
    // "stickers/file_344"). In that case, trust the format stored with the
    // sticker record; when a suffix is present, still validate it.
    const extension = getTelegramStickerFileExtension(filePath);
    const responseFormat = isPreviewImage ? 'image' : String(record.format || 'image');
    if (!isTelegramStickerExtensionAllowed(responseFormat, extension)) return fail('file_extension_mismatch', 415, {
      expectedFormat: responseFormat,
      actualExtension: extension || null,
    });

    const token = String(env.BOT_TOKEN || '').trim();
    const upstream = await fetch(TELEGRAM_API + '/file/bot' + token + '/' + filePath);
    if (!upstream.ok) return fail('telegram_file_http', 502);

    const bytes = await upstream.arrayBuffer();
    const maxBytes = responseFormat === 'tgs' ? 512 * 1024 : 20 * 1024 * 1024;
    if (!bytes.byteLength || bytes.byteLength > maxBytes) return fail('file_size_invalid', 413);

    if (responseFormat === 'tgs') {
      let animationText = '';
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let totalBytes = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > 1024 * 1024) {
            await reader.cancel();
            return fail('tgs_decompressed_size_invalid', 413);
          }
          animationText += decoder.decode(value, { stream: true });
        }
        animationText += decoder.decode();
      } catch {
        return fail('tgs_decompression_failed', 415);
      }
      let animationData;
      try { animationData = JSON.parse(animationText); }
      catch { return fail('tgs_json_invalid', 415); }
      if (!isSafeTelegramTgsAnimation(animationData)) return fail('tgs_validation_failed', 415);
      return withCors(new Response(JSON.stringify(animationData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
        },
      }));
    }

    const contentType = responseFormat === 'webm' ? 'video/webm' : extension === 'png' ? 'image/png' : ['jpg','jpeg'].includes(extension) ? 'image/jpeg' : 'image/webp';
    return withCors(new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    }));
  } catch (error) {
    console.error('[award-sticker]', JSON.stringify({
      reason: 'internal_error',
      preview: wantsPreview,
      format,
    }));
    return withCors(new Response(JSON.stringify({ ok: false, code: 'internal_error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Voxygen-Sticker-Error': 'internal_error',
        'X-Content-Type-Options': 'nosniff',
      },
    }));
  }
}
