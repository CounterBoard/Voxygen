export function createCustomizationImageService({ withCors } = {}) {
  async function serveCustomizationItemImage(request, env, itemId) {
  const startedAt = Date.now();
  try {
    const id = String(itemId || '').trim();
    if (!id || id.length > 160) return withCors(new Response('Not found', { status: 404 }));
    const row = await env.DB.prepare(`SELECT image_data,active FROM customization_items WHERE id=? LIMIT 1`).bind(id).first();
    // Visibility controls only catalogue exposure; already selected markers/covers keep rendering.
    if (!row || !row.image_data) {
      return withCors(new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }));
    }
    const match = String(row.image_data).match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) {
      return withCors(new Response('Unsupported image', { status: 415, headers: { 'Cache-Control': 'no-store' } }));
    }
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return withCors(new Response(bytes, { status: 200, headers: {
      'Content-Type': match[1],
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Server-Timing': `customization-image;dur=${Math.max(0, Date.now() - startedAt)}`,
    }}));
  } catch (error) {
    console.error(JSON.stringify({ event: 'customization_image_failed', code: 'IMAGE_READ_FAILED' }));
    return withCors(new Response('Image unavailable', { status: 500, headers: { 'Cache-Control': 'no-store', 'Server-Timing': `customization-image;dur=${Math.max(0, Date.now() - startedAt)}` } }));
  }
}

  return { serveCustomizationItemImage };
}
