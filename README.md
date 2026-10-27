<div align="center">

# X Scraper API

**A lightweight, third-party-powered media scraper API for public X posts.**

[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare%20Workers-F38020?style=for-the-badge)](https://workers.cloudflare.com/)
[![JavaScript](https://img.shields.io/badge/Language-JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111111)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f?style=for-the-badge)](./LICENSE)
[![API only](https://img.shields.io/badge/Product-API%20only-5965f2?style=for-the-badge)](#endpoints)

### Public post lookup · Video, GIF & photo links · Download & range streaming

[Overview](#features) · [Quick start](#quick-start) · [Endpoints](#endpoints) · [Deploy](#deploy-to-cloudflare-workers) · [License](#license)

<br />

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/davidfl678/X-scraper-api)

</div>

---

> **Project status:** Testing in progress. The repository is currently private. The deploy button is intended for use after the repository is made public; for now, follow the Wrangler CLI deployment steps below.

An API-only Cloudflare Worker that looks up publicly accessible X posts using independent third-party services. It returns available post/media metadata and direct media links, and offers download and byte-range streaming proxy endpoints.

> This is an independent community project and is not affiliated with X Corp. Use it only with public content you own or have permission to access. Private or protected posts are not supported. Follow applicable laws, platform policies, and the terms of the upstream providers.

## Features

- **Third-party lookup with fallback:** FxTwitter first, VxTwitter fallback.
- **Post URL or ID input:** Accepts X/Twitter status URLs and numeric post IDs.
- **Multiple media types:** Video, animated GIF, and photo links when exposed by the upstream.
- **Useful metadata:** Post text, author, username, thumbnail, media type, and available quality information.
- **Download proxy:** `/api/download` returns media as an attachment.
- **Range streaming:** `/api/stream` forwards the `Range` header for seeking and partial playback.
- **Cloudflare Workers runtime:** Uses standard Fetch APIs; no browser binaries or UI.
- **650 MB size guard:** Returns HTTP `413` when the upstream reports a file larger than the configured limit.
- **No secrets required** for the default setup.

### Important provider note

FxTwitter and VxTwitter are independent third-party services. They may change their response formats, rate limits, availability, or access terms without notice, and they do not provide this project with an uptime guarantee. If both services are unavailable or do not return media, the API returns an error. This project does not bypass protected-post access controls.

## Quick start

Once deployed, try a public post URL:

```bash
curl "https://YOUR-WORKER.workers.dev/api/scrape?url=https%3A%2F%2Fx.com%2FSpaceX%2Fstatus%2F1732824684683784516"
```

Or pass a numeric post ID:

```bash
curl "https://YOUR-WORKER.workers.dev/api/scrape?id=1732824684683784516"
```

## Endpoints

### `GET /` or `GET /health`

Health and endpoint information.

```bash
curl "https://YOUR-WORKER.workers.dev/health"
```

### `GET /api/scrape`

Query parameters: `url` (a public post URL) or `id` (numeric post ID).

```bash
curl "https://YOUR-WORKER.workers.dev/api/scrape?url=https%3A%2F%2Fx.com%2Fusername%2Fstatus%2F1234567890123456789"
```

### `POST /api/scrape`

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://x.com/username/status/1234567890123456789"}'
```

Numeric ID request:

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"id":"1234567890123456789"}'
```

### Example response

```json
{
  "success": true,
  "platform": "x",
  "post_id": "1732824684683784516",
  "post_url": "https://x.com/i/status/1732824684683784516",
  "title": "Post text, when returned by the provider",
  "author": "Author name",
  "username": "username",
  "thumbnail": "https://pbs.twimg.com/...",
  "created_at": null,
  "engine": "FxTwitter",
  "media": [
    {
      "id": "1732824684683784516_1",
      "type": "video",
      "quality": "2176kbps",
      "bitrate": 2176000,
      "mime_type": "video/mp4",
      "extension": "mp4",
      "url": "https://video.twimg.com/...mp4",
      "thumbnail": "https://pbs.twimg.com/...",
      "width": 1280,
      "height": 720,
      "engine": "FxTwitter",
      "download_url": "/api/download?url=...&filename=...",
      "stream_url": "/api/stream?url=..."
    }
  ]
}
```

The response fields and available media depend on what the third-party provider returns. The example is illustrative; some fields may be `null` or omitted, and quality variants can differ by post.

### `GET /api/download`

Use the returned media URL with the download endpoint. Only recognized X media CDN URLs are accepted; arbitrary URL proxying is rejected.

```bash
curl -L "https://YOUR-WORKER.workers.dev/api/download?url=ENCODED_MEDIA_URL&filename=clip.mp4" -o clip.mp4
```

The Worker returns `413 Payload Too Large` when the upstream response includes a `Content-Length` greater than 650 MB.

### `GET /api/stream`

For seeking, send a byte `Range` header. The Worker forwards it to the media host and passes back partial-content headers when supported.

```bash
curl -i \
  -H "Range: bytes=0-1023" \
  "https://YOUR-WORKER.workers.dev/api/stream?url=ENCODED_MEDIA_URL"
```

A successful partial response typically has status `206` and a `Content-Range` header. Range behavior depends on the upstream CDN.

## Error format

```json
{
  "success": false,
  "error": "Only X/Twitter post URLs are supported."
}
```

Common status codes:

| Status | Meaning |
| --- | --- |
| `200` | Request succeeded |
| `400` | Invalid URL, ID, or required parameter |
| `404` | Media resource was not found |
| `405` | HTTP method is not supported |
| `413` | Upstream-reported media size exceeds 650 MB |
| `502` | Third-party lookup or media upstream failed |

## Deploy to Cloudflare Workers

### Option A: Deploy button

The button at the top is convenient once `X-scraper-api` is public and GitHub/Cloudflare can access the repository. Click **Deploy to Cloudflare Workers**, sign in to Cloudflare, review the Worker name and settings, then confirm deployment. Cloudflare will build and publish the Worker. Your live API address will be shown in the Cloudflare dashboard, usually in the form `https://<worker-name>.<account-subdomain>.workers.dev`.

> If the repository is private, the public deploy-button flow may not be able to read it. Use Option B while testing privately.

### Option B: Deploy the private repository with Wrangler

1. **Install Node.js** (an active LTS version is recommended).
2. **Clone your private repository** on a machine that has GitHub access:

   ```bash
   git clone https://github.com/davidfl678/X-scraper-api.git
   cd X-scraper-api
   ```

3. **Install the project dependency:**

   ```bash
   npm install
   ```

4. **Sign in to Cloudflare:**

   ```bash
   npx wrangler login
   ```

   Complete the browser authorization with the Cloudflare account that should own the Worker.

5. **Run locally first:**

   ```bash
   npm run dev
   ```

   Wrangler prints a local development URL. Check the health endpoint, then test a public post:

   ```bash
   curl "http://localhost:8786/health"
   curl "http://localhost:8786/api/scrape?url=https%3A%2F%2Fx.com%2FSpaceX%2Fstatus%2F1732824684683784516"
   ```

6. **Deploy the Worker:**

   ```bash
   npm run deploy
   ```

7. Open **Cloudflare Dashboard → Workers & Pages → your Worker** to copy the production `workers.dev` URL. Test `/health` and `/api/scrape` against that URL.

The included `wrangler.toml` sets the Worker name, entry file, and compatibility date. No API secrets or environment variables are needed for the current configuration.

### Updating a deployed version

After making changes and pushing them to your repository, pull the updates on the deployment machine and run:

```bash
git pull
npm install
npm run deploy
```

## Local development

From the project root:

```bash
npm install
npm run dev
```

The development server is configured for port `8786`. To stop it, press `Ctrl+C`.

## Project structure

```text
X-scraper-api/
├── src/
│   └── index.js      # Worker routes and third-party integration
├── LICENSE           # MIT License
├── package.json      # Project metadata and commands
├── README.md         # Documentation
└── wrangler.toml     # Cloudflare Workers settings
```

## Limitations

- Supports publicly accessible single-post URLs/IDs only; it is not a profile crawler or search API.
- Does not retrieve private/protected, deleted, or login-restricted content.
- The Worker does not store media; upstream media URLs are streamed through on demand.
- The size guard depends on the upstream providing a `Content-Length` header.
- Third-party providers can throttle requests or change their API at any time.

## License

Released under the MIT License. See [`LICENSE`](./LICENSE).

---

<div align="center">

**Built for developers who want a small, serverless media API.**

</div>
