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
};

function httpsReq(urlStr, method, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(urlStr);
    const buf = body ? Buffer.from(body, 'utf8') : null;
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...BROWSER_HEADERS, ...headers, ...(buf ? { 'Content-Length': buf.length } : {}) },
      timeout: 20000,
    }, res => {
      const cookies = res.headers['set-cookie'] || [];
      const location = res.headers['location'] || null;
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve({ body: data, cookies, status: res.statusCode, location }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (buf) req.write(buf);
    req.end();
  });
}

// Generic proxy
app.get('/api/fetch', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url' });
  let parsed;
  try { parsed = new url.URL(targetUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'http/https only' });
  const protocol = parsed.protocol === 'https:' ? https : http;
  const proxyReq = protocol.request({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: BROWSER_HEADERS,
    timeout: 15000,
  }, proxyRes => {
    if ([301,302,303,307,308].includes(proxyRes.statusCode)) {
      const loc = proxyRes.headers.location;
      if (loc && (req.query._redirects || 0) < 5) {
        const abs = loc.startsWith('http') ? loc : `${parsed.protocol}//${parsed.hostname}${loc}`;
        return res.redirect(`/api/fetch?url=${encodeURIComponent(abs)}&_redirects=${(parseInt(req.query._redirects)||0)+1}`);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/html');
    let body = '';
    proxyRes.setEncoding('utf8');
    proxyRes.on('data', c => body += c);
    proxyRes.on('end', () => res.send(body));
  });
  proxyReq.on('timeout', () => { proxyReq.destroy(); res.status(504).json({ error: 'timeout' }); });
  proxyReq.on('error', e => res.status(502).json({ error: e.message }));
  proxyReq.end();
});

// COMMBUYS multi-page scraper — runs server-side to maintain JSF session
app.get('/api/commbuys-all', async (req, res) => {
  const BASE = 'https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml';
  const MAX_PAGES = 40;

  try {
    // Step 1: GET initial page — establish session + get ViewState
    const step1 = await httpsReq(BASE + '?openBids=true&pageSize=25', 'GET', {}, null);
    let cookieStr = step1.cookies.map(c => c.split(';')[0]).join('; ');

    // Extract ViewState
    const vsMatch = step1.body.match(/javax\.faces\.ViewState[^>]*value="([^"]+)"/);
    if (!vsMatch) return res.status(502).json({ error: 'No ViewState found' });

    // Parse rows from HTML
    function parseRows(html) {
      const rows = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(html)) !== null) {
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) cells.push(tdMatch[1]);
        if (cells.length < 8) continue;
        const linkMatch = cells[0].match(/href="([^"]+)"[^>]*>([^<]+)</);
        if (!linkMatch) continue;
        const bidNum = linkMatch[2].trim();
        if (!bidNum.startsWith('BD-')) continue;
        const href = linkMatch[1];
        const link = href.startsWith('http') ? href : 'https://www.commbuys.com' + href;
        const stripTags = s => s.replace(/<[^>]+>/g, '').trim();
        rows.push({
          bidNum,
          link,
          org: stripTags(cells[2]),
          desc: stripTags(cells[6]),
          date: stripTags(cells[7]),
        });
      }
      return rows;
    }

    const allRows = parseRows(step1.body);
    let viewState = vsMatch[1];

    // Step 2: paginate via JSF partial POST
    for (let page = 2; page <= MAX_PAGES; page++) {
      // j_idt419 = "Next page" button in bidSearchResultsForm
      const NEXT_BTN = 'bidSearchResultsForm:bidResultId:j_idt419';
      const formData = new URLSearchParams({
        'bidSearchResultsForm': 'bidSearchResultsForm',
        'javax.faces.ViewState': viewState,
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': NEXT_BTN,
        'javax.faces.partial.execute': NEXT_BTN,
        'javax.faces.partial.render': 'bidSearchResultsForm:bidResultId',
        [NEXT_BTN]: NEXT_BTN,
      }).toString();

      const step = await httpsReq(BASE, 'POST', {
        'Cookie': cookieStr,
        'Referer': BASE + '?openBids=true',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.commbuys.com',
        'X-Requested-With': 'XMLHttpRequest',
        'Faces-Request': 'partial/ajax',
      }, formData);

      // Update cookies
      if (step.cookies.length) cookieStr = step.cookies.map(c => c.split(';')[0]).join('; ');

      // Update ViewState from partial response
      const newVs = step.body.match(/javax\.faces\.ViewState[^>]*<!\[CDATA\[([^\]]+)\]\]>/) ||
                    step.body.match(/javax\.faces\.ViewState[^"]*"([^"]{20,})"/);
      if (newVs) viewState = newVs[1];

      const rows = parseRows(step.body);
      if (rows.length === 0) break;
      allRows.push(...rows);

      // Dedupe check — if we're seeing the same bids, we've hit the end
      const lastBid = rows[rows.length - 1]?.bidNum;
      if (allRows.filter(r => r.bidNum === lastBid).length > 1) break;
    }

    // Deduplicate
    const seen = new Set();
    const unique = allRows.filter(r => { if (seen.has(r.bidNum)) return false; seen.add(r.bidNum); return true; });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ count: unique.length, bids: unique });
  } catch(e) {
    res.status(502).json({ error: e.message });
  }
});


// DEBUG: show raw page-2 POST response so we can inspect it
app.get('/api/commbuys-debug', async (req, res) => {
  const BASE = 'https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml';
  try {
    const step1 = await httpsReq(BASE + '?openBids=true', 'GET', {}, null);
    const cookieStr = step1.cookies.map(c => c.split(';')[0]).join('; ');
    const vsMatch = step1.body.match(/javax\.faces\.ViewState[^>]*value="([^"]+)"/);
    if (!vsMatch) return res.json({ error: 'no ViewState', snippet: step1.body.slice(0, 300) });
    const viewState = vsMatch[1];
    const NEXT_BTN = 'bidSearchResultsForm:bidResultId:j_idt419';
    const formData = new URLSearchParams({
      'bidSearchResultsForm': 'bidSearchResultsForm',
      'javax.faces.ViewState': viewState,
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': NEXT_BTN,
      'javax.faces.partial.execute': NEXT_BTN,
      'javax.faces.partial.render': 'bidSearchResultsForm:bidResultId',
      [NEXT_BTN]: NEXT_BTN,
    }).toString();
    const step2 = await httpsReq(BASE, 'POST', {
      'Cookie': cookieStr, 'Referer': BASE + '?openBids=true',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.commbuys.com',
      'X-Requested-With': 'XMLHttpRequest', 'Faces-Request': 'partial/ajax',
    }, formData);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ status: step2.status, bodyLength: step2.body.length, first500: step2.body.slice(0, 500), last300: step2.body.slice(-300), hasBD: step2.body.includes('BD-'), cookies: step2.cookies.length });
  } catch(e) { res.status(502).json({ error: e.message }); }
});


// COMMBUYS PDF endpoint — parses mass.gov "New Bids Available" PDF
app.get('/api/commbuys-pdf', async (req, res) => {
  const PDF_URL = 'https://www.mass.gov/doc/commbuys-home-page-bid-count/download';
  const KEYWORDS = ['landscape architecture', 'landscape design', 'design services', 'park'];
  try {
    // Fetch PDF as binary
    // Follow redirects manually (mass.gov redirects to CDN)
    const pdfBuf = await new Promise((resolve, reject) => {
      function fetchUrl(targetUrl, redirects) {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        const mod = targetUrl.startsWith('https') ? https : http;
        const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/pdf,*/*', 'Accept-Encoding': 'identity' } };
        mod.get(targetUrl, options, (r) => {
          if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
            const next = r.headers.location.startsWith('http') ? r.headers.location : new url.URL(r.headers.location, targetUrl).toString();
            r.resume();
            return fetchUrl(next, redirects + 1);
          }
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => resolve(Buffer.concat(chunks)));
          r.on('error', reject);
        }).on('error', reject);
      }
      fetchUrl(PDF_URL, 0);
    });

    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuf);
    const text = data.text;

    // Each row looks like: OrgID  OrgName  Date  Time  Description  BidNumber
    // Split into lines and parse BD- entries
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const bids = [];
    for (const line of lines) {
      const bidMatch = line.match(/(BD-[\w-]+)/);
      if (!bidMatch) continue;
      const bidNum = bidMatch[1];
      const lower = line.toLowerCase();
      if (!KEYWORDS.some(kw => lower.includes(kw))) continue;
      // Extract description — everything between date/time and bid number
      const desc = line.replace(/(BD-[\w-]+)/, '').replace(/\d{1,2}\/\d{1,2}\/\d{4}/, '').replace(/\d{1,2}:\d{2}\s*(AM|PM)/i, '').replace(/^\d+\s+/, '').trim();
      bids.push({
        bidNum,
        desc: desc || bidNum,
        link: `https://www.commbuys.com/bso/external/bidDetail.sda?docId=${bidNum}&external=true&parentUrl=close`,
      });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ count: bids.length, bids, pages: data.numpages });
  } catch(e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')));
app.listen(PORT, () => console.log(`LJLA RFP Pipeline server on port ${PORT}`));
