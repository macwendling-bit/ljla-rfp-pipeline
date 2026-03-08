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

// ─── COMMBUYS PDF endpoint ─────────────────────────────────────────────────
// Fetches the mass.gov "New Bids Available" PDF, parses it with pdf-parse,
// and returns only bids matching landscape/park/design keywords.
app.get('/api/commbuys-pdf', async (req, res) => {
  const PDF_URL = 'https://www.mass.gov/doc/commbuys-home-page-bid-count/download';

  const KEYWORDS = [
    'landscape architect', 'landscape design', 'design services',
    'park design', 'park master plan', 'park improvement', 'park renovation',
    'park planning', 'parks design', 'streetscape', 'urban design',
    'site design', 'open space', 'waterfront design', 'trail design',
    'plaza design', 'master plan', 'campus landscape', 'planting design',
    'public realm', 'civic design', 'greenway',
  ];

  try {
    // Fetch the PDF following redirects (mass.gov → CDN)
    const pdfBuf = await new Promise((resolve, reject) => {
      function fetchUrl(targetUrl, redirects) {
        if (redirects > 8) return reject(new Error('Too many redirects'));
        const mod = targetUrl.startsWith('https') ? https : http;
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/pdf,*/*',
            'Accept-Encoding': 'identity',
          },
          timeout: 20000,
        };
        mod.get(targetUrl, options, (r) => {
          if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
            const next = r.headers.location.startsWith('http')
              ? r.headers.location
              : new url.URL(r.headers.location, targetUrl).toString();
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

    // Validate we got a PDF (starts with %PDF)
    if (pdfBuf.slice(0, 4).toString() !== '%PDF') {
      return res.status(502).json({
        error: 'Invalid PDF structure',
        hint: 'Got: ' + pdfBuf.slice(0, 40).toString(),
      });
    }

    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuf);
    const rawText = data.text;

    // ── Parse the PDF table ────────────────────────────────────────────────
    // The table has columns: Org ID | Organization | Bid Date | Bid Time | Description | Bid Number
    // pdf-parse flattens this into a text blob. Strategy:
    // 1. Find all BD-XX-XXXX-... bid numbers (anchors)
    // 2. Split the text by bid number occurrences
    // 3. For each chunk, extract org, date, description from the text before it
    //
    // Example text surrounding one bid (simplified):
    // "1344 Town of Wellesley March 5, 2026 11:07 AM Automated Vehicle Gate BD-26-1344-00400..."

    const BID_RE = /BD-\d{2}-[\w-]+-\d+/g;
    const DATE_RE = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/;
    const TIME_RE = /\d{1,2}:\d{2}\s*(?:AM|PM)/i;
    const ORG_ID_RE = /^\d{3,4}\s+/;

    // Split text into lines
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);

    // Collect all bid matches with their positions in the full text
    const bids = [];
    let match;
    BID_RE.lastIndex = 0;
    while ((match = BID_RE.exec(rawText)) !== null) {
      bids.push({ bidNum: match[0], pos: match.index });
    }

    // For each bid, find the surrounding line(s) and extract fields
    const results = [];
    const seenBids = new Set();

    for (const { bidNum } of bids) {
      if (seenBids.has(bidNum)) continue;
      seenBids.add(bidNum);

      // Find the line containing this bid number
      const bidLineIdx = lines.findIndex(l => l.includes(bidNum));
      if (bidLineIdx === -1) continue;

      // Gather context: this line + a few lines back (the table row may span multiple lines)
      const contextLines = lines.slice(Math.max(0, bidLineIdx - 4), bidLineIdx + 1).join(' ');

      // Extract date
      const dateM = contextLines.match(DATE_RE);
      const date = dateM ? dateM[0] : '';

      // Remove the bid number, date, time, and org ID from the context to get description + org
      let cleaned = contextLines
        .replace(bidNum, '')
        .replace(DATE_RE, '')
        .replace(TIME_RE, '')
        .replace(ORG_ID_RE, '')
        .trim();

      // The organization name tends to come before the description in the text
      // Split on remaining number sequences that look like org IDs
      // Heuristic: first "word group" before any all-caps or long phrase is org name
      const parts = cleaned.split(/\s{2,}/);
      let org = '';
      let desc = '';
      if (parts.length >= 2) {
        // First substantial part is org, rest is description
        org = parts[0].replace(/^\d+\s*/, '').trim();
        desc = parts.slice(1).join(' ').trim();
      } else {
        desc = cleaned;
      }

      // If desc still starts with a number (org ID bleed), strip it
      desc = desc.replace(/^\d{3,4}\s+/, '').trim();
      org = org.replace(/^\d{3,4}\s+/, '').trim();

      // Fallback: if org is empty, use "MA Agency"
      if (!org || org.length < 3) org = 'MA Agency';

      // Filter by keywords
      const lower = (desc + ' ' + org).toLowerCase();
      if (!KEYWORDS.some(kw => lower.includes(kw))) continue;

      const link = `https://www.commbuys.com/bso/external/bidDetail.sda?docId=${bidNum}&external=true&parentUrl=close`;

      results.push({ bidNum, desc: desc || bidNum, org, date, link });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ count: results.length, bids: results, pages: data.numpages });

  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ─── COMMBUYS keyword search endpoint (legacy) ────────────────────────────
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
    const step1 = await httpsRequest(BASE, 'GET', {}, null);
    const cookieStr = step1.cookies.map(c => c.split(';')[0]).join('; ');
    const vsMatch = step1.body.match(/javax\.faces\.ViewState[^>]*value="([^"]+)"/);
    if (!vsMatch) {
      return res.status(502).json({ error: 'Could not find JSF ViewState' });
    }
    const viewState = vsMatch[1];
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
    res.send(step2.body);
  } catch (e) {
    res.status(502).json({ error: `COMMBUYS fetch failed: ${e.message}` });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────
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
