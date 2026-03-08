const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// ─── Generic proxy endpoint ────────────────────────────────────────────────
app.get('/api/fetch', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });

  let parsed;
  try {
    parsed = new url.URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol))
      return res.status(400).json({ error: 'Only http/https URLs allowed' });
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const protocol = parsed.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: BROWSER_HEADERS,
    timeout: 15000,
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
      const redirectUrl = proxyRes.headers.location;
      if (redirectUrl && req.query._redirects < 5) {
        const absRedirect = redirectUrl.startsWith('http')
          ? redirectUrl
          : `${parsed.protocol}//${parsed.hostname}${redirectUrl}`;
        return res.redirect(`/api/fetch?url=${encodeURIComponent(absRedirect)}&_redirects=${(parseInt(req.query._redirects) || 0) + 1}`);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/html');
    res.setHeader('X-Proxy-Status', proxyRes.statusCode);
    let body = '';
    proxyRes.setEncoding('utf8');
    proxyRes.on('data', chunk => { body += chunk; });
    proxyRes.on('end', () => res.send(body));
  });

  proxyReq.on('timeout', () => { proxyReq.destroy(); res.status(504).json({ error: 'Request timed out' }); });
  proxyReq.on('error', (err) => res.status(502).json({ error: `Proxy error: ${err.message}` }));
  proxyReq.end();
});

// ─── COMMBUYS dedicated endpoint ──────────────────────────────────────────
// COMMBUYS is a JSF app — requires a valid JSESSIONID session cookie for
// search results to render. This endpoint does a two-step fetch:
// 1. GET the base search page → capture JSESSIONID cookie
// 2. GET the keyword search URL with that cookie → returns results HTML
app.get('/api/commbuys', async (req, res) => {
  const keyword = req.query.q || 'landscape architecture';
  const pageNum = req.query.page || '1';

  function httpsGet(urlStr, extraHeaders) {
    return new Promise((resolve, reject) => {
      const parsed = new url.URL(urlStr);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { ...BROWSER_HEADERS, ...extraHeaders },
        timeout: 15000,
      };
      const req = https.request(options, response => {
        const cookies = response.headers['set-cookie'] || [];
        let body = '';
        response.setEncoding('utf8');
        response.on('data', c => { body += c; });
        response.on('end', () => resolve({ body, cookies, status: response.statusCode }));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    // Step 1: GET base page to acquire session cookie
    const baseUrl = 'https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml';
    const step1 = await httpsGet(baseUrl, {});
    const cookieStr = step1.cookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: GET search results with session cookie
    const searchUrl = `${baseUrl}?q=${encodeURIComponent(keyword)}&currentDocType=bids&pageNum=${pageNum}`;
    const step2 = await httpsGet(searchUrl, { 'Cookie': cookieStr, 'Referer': baseUrl });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/html');
    res.send(step2.body);
  } catch (e) {
    res.status(502).json({ error: `COMMBUYS fetch failed: ${e.message}` });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Serve React build ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`LJLA RFP Pipeline server running on port ${PORT}`);
});
