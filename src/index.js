const MAX_BYTES = 650 * 1024 * 1024;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
const VALID_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "fixupx.com", "www.fixupx.com", "fxtwitter.com", "www.fxtwitter.com", "vxtwitter.com", "www.vxtwitter.com"]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function parsePostUrl(input) {
  let value = String(input || "").trim().replace(/&amp;/g, "&");
  if (/^\d{5,30}$/.test(value)) value = `https://x.com/i/status/${value}`;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Provide a valid public X post URL or numeric post ID."); }
  if (!VALID_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error("Only X/Twitter post URLs are supported.");
  const match = parsed.pathname.match(/(?:^|\/)status\/([0-9]{5,30})(?:\/|$)/i);
  if (!match) throw new Error("The URL must point to a post containing /status/{id}.");
  return { id: match[1], username: parsed.pathname.split("/").filter(Boolean)[0] || "i", url: `https://x.com/i/status/${match[1]}` };
}

function mediaItems(payload, id, engine) {
  const candidates = [];
  const root = payload?.tweet || payload?.data || payload?.result || payload;
  const mediaRoots = [root?.media, root?.extended_entities?.media, root?.extendedEntities?.media, root?.attachments?.media, root?.includes?.media];
  for (const collection of mediaRoots) {
    if (Array.isArray(collection)) candidates.push(...collection);
    else if (collection && typeof collection === "object") {
      for (const key of ["videos", "video", "photos", "images", "all", "media"]) {
        const value = collection[key];
        if (Array.isArray(value)) candidates.push(...value);
        else if (value && typeof value === "object") candidates.push(value);
      }
    }
  }
  if (root?.video) candidates.push(root.video);
  const uniq = new Set();
  const output = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const variants = item.variants || item.video_info?.variants || item.video?.variants || [];
    const direct = [item.url, item.video_url, item.download_url, item.src, item.media_url_https, item.media_url].filter(v => typeof v === "string" && /^https?:\/\//i.test(v));
    const mp4Variants = Array.isArray(variants) ? variants.filter(v => typeof v?.url === "string" && /^https?:\/\//i.test(v.url) && !/\.m3u8(?:$|\?)/i.test(v.url) && (!v.content_type || /mp4/i.test(v.content_type) || /\.mp4(?:$|\?)/i.test(v.url))) : [];
    const options = mp4Variants.length ? mp4Variants : direct.map(url => ({ url, bitrate: 0 }));
    for (const variant of options) {
      const mediaUrl = variant.url;
      if (uniq.has(mediaUrl)) continue;
      uniq.add(mediaUrl);
      const isImage = /pbs\.twimg\.com|\.(?:jpe?g|png|webp)(?:\?|$)/i.test(mediaUrl) || /photo|image/i.test(item.type || item.media_type || "");
      const kind = isImage ? "photo" : /gif/i.test(item.type || item.media_type || "") ? "gif" : "video";
      const extension = kind === "photo" ? ((mediaUrl.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] || "jpg").toLowerCase()) : "mp4";
      output.push({ id: `${id}_${output.length + 1}`, type: kind, quality: variant.bitrate ? `${Math.round(variant.bitrate / 1000)}kbps` : (variant.label || variant.quality || "original"), bitrate: variant.bitrate || null, mime_type: kind === "photo" ? `image/${extension === "jpg" ? "jpeg" : extension}` : "video/mp4", extension, url: mediaUrl, thumbnail: item.thumbnail_url || item.preview_image_url || item.media_url_https || item.media_url || null, width: item.original_info?.width || item.width || null, height: item.original_info?.height || item.height || null, engine });
    }
  }
  return output;
}

async function fetchEngine(base, post, engine) {
  const endpoint = `${base}/${encodeURIComponent(post.username)}/status/${encodeURIComponent(post.id)}`;
  const response = await fetch(endpoint, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; MediaMetadataFetcher/1.0)" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`${engine} returned HTTP ${response.status}`);
  const payload = await response.json();
  const media = mediaItems(payload, post.id, engine);
  if (!media.length) throw new Error(`${engine} did not return downloadable media`);
  const tweet = payload?.tweet || payload?.data || payload?.result || payload;
  return { media, title: tweet.text || tweet.full_text || tweet.caption || tweet.description || null, author: tweet.author?.name || tweet.user?.name || tweet.user?.screen_name || tweet.author_name || null, username: tweet.author?.screen_name || tweet.user?.screen_name || tweet.username || null, thumbnail: media.find(x => x.thumbnail)?.thumbnail || null, created_at: tweet.created_at || null, engine };
}

async function scrape(input) {
  const post = parsePostUrl(input);
  const engines = [
    ["FxTwitter", "https://api.fxtwitter.com"],
    ["VxTwitter", "https://api.vxtwitter.com"]
  ];
  const errors = [];
  for (const [name, base] of engines) {
    try {
      const result = await fetchEngine(base, post, name);
      result.media = result.media.map((media, index) => ({ ...media, download_url: `/api/download?url=${encodeURIComponent(media.url)}&filename=${encodeURIComponent(`x_${post.id}_${index + 1}.${media.extension}`)}`, stream_url: `/api/stream?url=${encodeURIComponent(media.url)}` }));
      return { success: true, platform: "x", post_id: post.id, post_url: post.url, title: result.title, author: result.author, username: result.username, thumbnail: result.thumbnail, created_at: result.created_at, engine: result.engine, media: result.media };
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  throw new Error(`Unable to retrieve public post media. ${errors.join("; ")}`);
}

function isDirectMediaUrl(input) {
  try {
    const url = new URL(input);
    return /(^|\.)((video|pbs)\.twimg\.com|twimg\.com|t\.co)$/i.test(url.hostname) || /\.(mp4|m3u8|jpg|jpeg|png|webp)(?:$|\?)/i.test(url.href) || /format=(mp4|jpg|jpeg|png|webp)/i.test(url.search);
  } catch { return false; }
}

async function proxy(request, mode) {
  const incoming = new URL(request.url);
  const raw = incoming.searchParams.get("url");
  if (!raw) return json({ success: false, error: "Missing required url query parameter." }, 400);
  let mediaUrl;
  try { mediaUrl = new URL(raw); } catch { return json({ success: false, error: "Invalid media URL." }, 400); }
  if (!isDirectMediaUrl(mediaUrl.href)) return json({ success: false, error: "Only recognized X CDN media URLs are accepted." }, 400);
  const headers = new Headers({ accept: "*/*", "user-agent": "Mozilla/5.0" });
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  let upstream;
  try { upstream = await fetch(mediaUrl.href, { headers, redirect: "follow", signal: AbortSignal.timeout(30000) }); }
  catch (error) { return json({ success: false, error: `Media request failed: ${error.message}` }, 502); }
  if (!upstream.ok && upstream.status !== 206) return json({ success: false, error: `Media source returned HTTP ${upstream.status}.` }, upstream.status === 404 ? 404 : 502);
  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) return json({ success: false, error: "Media exceeds the 650 MB download limit." }, 413);
  const dispositionName = incoming.searchParams.get("filename") || "x_media.mp4";
  const responseHeaders = new Headers({ "access-control-allow-origin": "*", "content-type": upstream.headers.get("content-type") || "application/octet-stream", "cache-control": "no-store" });
  if (contentLength) responseHeaders.set("content-length", String(contentLength));
  if (mode === "download") responseHeaders.set("content-disposition", `attachment; filename="${dispositionName.replace(/[\"\\\r\n]/g, "_")}"`);
  for (const name of ["content-range", "accept-ranges"]) { const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value); }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...JSON_HEADERS, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, range" } });
    if (request.method !== "GET" && request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    try {
      const hasScrapeInput = url.searchParams.has("url") || url.searchParams.has("id");
      if (url.pathname === "/health" || (url.pathname === "/" && !hasScrapeInput)) return json({ success: true, name: "Twitter/X Scraper API", endpoints: ["/api/scrape", "/api/download", "/api/stream"] });
      if (url.pathname === "/api/scrape" || (url.pathname === "/" && hasScrapeInput)) {
        let input = url.searchParams.get("url") || url.searchParams.get("id");
        if (request.method === "POST") { const body = await request.json(); input = body.url || body.id || input; }
        if (!input) return json({ success: false, error: "Provide url or id." }, 400);
        try { parsePostUrl(input); return json(await scrape(input)); } catch (error) { const status = /valid public|Only X\/Twitter|must point to a post/i.test(error.message) ? 400 : 502; return json({ success: false, error: error.message }, status); }
      }
      if (url.pathname === "/api/download") return await proxy(request, "download");
      if (url.pathname === "/api/stream") return await proxy(request, "stream");
      return json({ success: false, error: "Not found." }, 404);
    } catch (error) { return json({ success: false, error: error.message || "Request failed." }, 500); }
  }
};
