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

// ─── COMMBUYS keyword search endpoint ─────────────────────────────────────
// COMMBUYS is a JSF app. Proper search requires:
// 1. GET base page → extract JSESSIONID cookie + javax.faces.ViewState
// 2. POST to search endpoint with ViewState + keyword → returns results HTML
app.get('/api/commbuys', async (req, res) => {
  const keyword = req.query.q || 'landscape architecture';

  function httpsRequest(urlStr, method, headers, postBody) {
    return new Promise((resolve, reject) => {
      const parsed = new url.URL(urlStr);
      const bodyBuf = postBody ? Buffer.from(postBody, 'utf8') : null;
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          ...BROWSER_HEADERS,
          ...headers,
          ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
        },
        timeout: 20000,
      };
      const req = https.request(options, response => {
        const cookies = response.headers['set-cookie'] || [];
        const location = response.headers['location'] || null;
        let body = '';
        response.setEncoding('utf8');
        response.on('data', c => { body += c; });
        response.on('end', () => resolve({ body, cookies, status: response.statusCode, location }));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  try {
    const BASE = 'https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml';

    // Step 1: GET page to acquire session cookie + ViewState
    const step1 = await httpsRequest(BASE, 'GET', {}, null);
    const cookieStr = step1.cookies.map(c => c.split(';')[0]).join('; ');

    // Extract javax.faces.ViewState from the HTML
    const vsMatch = step1.body.match(/javax\.faces\.ViewState[^>]*value="([^"]+)"/);
    if (!vsMatch) {
      return res.status(502).json({ error: 'Could not find JSF ViewState', bodySnippet: step1.body.slice(0, 500) });
    }
    const viewState = vsMatch[1];

    // Step 2: POST keyword search using the ViewState
    const formData = new URLSearchParams({
      'searchForm': 'searchForm',
      'searchForm:keywordTextBox': keyword,
      'searchForm:currentDocType': 'bids',
      'searchForm:bidSearchButton': 'searchForm:bidSearchButton',
      'javax.faces.ViewState': viewState,
      'javax.faces.partial.ajax': 'false',
    }).toString();

    const step2 = await httpsRequest(BASE, 'POST', {
      'Cookie': cookieStr,
      'Referer': BASE,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.commbuys.com',
    }, formData);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-ViewState-Found', 'true');
    res.setHeader('X-Post-Status', step2.status);
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
