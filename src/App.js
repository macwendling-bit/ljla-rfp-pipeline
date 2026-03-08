import React, { useState, useEffect, useCallback } from 'react';

// ─── BRAND ────────────────────────────────────────────────────────────────────
const BRAND = {
  primary:   '#3C75BF',
  secondary: '#575759',
  text:      '#1A1A1A',
  muted:     '#888888',
  border:    '#E8E8E8',
  bg:        '#F7F7F7',
};

// ─── FILTER ───────────────────────────────────────────────────────────────────
const PASS_TERMS = [
  'landscape architect','landscape architecture','landscape design',
  'planting design','horticultural','site landscape',
  'design services','planning and design','design and planning',
  'design consultant','planning services','master plan','masterplan',
  'conceptual design','schematic design','professional design',
  'park design','park master plan','park improvement','park renovation',
  'park planning','parks design','recreation design','playground design',
  'open space design','open space plan','greenway design','trail design',
  'waterfront design','waterfront planning','waterfront master plan',
  'harbor design','esplanade design','riverwalk','harborwalk',
  'plaza design','plaza improvement','streetscape design',
  'streetscape improvement','streetscape planning','promenade design',
  'campus design','campus landscape','institutional landscape',
  'urban design','public realm design','civic design',
  'courtyard design','rooftop garden','outdoor amenity design',
  'residential landscape','amenity landscape','designer services',
  'site design','site planning','landscape services rfp','landscape services rfq',
];

const HARD_NO = [
  'snow removal','snow plowing','salting','sanding',
  'lawn care','mowing','grounds keeping','landscape maintenance','turf management',
  'janitorial','custodial','cleaning services','trash removal','rubbish','waste removal',
  'hvac','plumbing','electrical contractor','boiler','mechanical','generator',
  'elevator','fire suppression','roofing','roof replacement',
  'water main','sewer line','roadway construction','paving contractor','asphalt',
  'concrete contractor','crack seal','pavement marking','guardrail',
  'retaining wall','sidewalk repair','curb replacement',
  'audit','accounting','legal services','food service','catering',
  'printing services','mailing','shuttle','vehicle purchase','fuel supply',
  'medical','pharmaceutical','ammunition','weapons','staffing agency',
  'security guard','real estate broker','insurance services',
  'information technology','cybersecurity','software development',
  'network infrastructure','telecommunications',
];

function isRelevant(title, description) {
  const t = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (HARD_NO.some(k => t.includes(k))) return false;
  return PASS_TERMS.some(k => t.includes(k));
}

// ─── SAM.GOV KEYWORDS ─────────────────────────────────────────────────────────
const SAM_SEARCHES = [
  'landscape architecture','landscape architect','landscape design',
  'park design','streetscape design','waterfront design',
  'urban plaza design','open space design','site design services',
  'planting design',
];

// ─── COMMBUYS SEARCH TERMS (used as keyword queries against COMMBUYS search API) ──
const COMMBUYS_SEARCH_TERMS = [
  'landscape architecture',
  'landscape architect',
  'park design',
  'streetscape',
  'waterfront design',
  'urban design',
  'open space',
  'master plan',
  'plaza design',
  'site design',
];

const STORAGE_KEY = 'ljla_v17';

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [results, setResults]             = useState([]);
  const [loading, setLoading]             = useState(false);
  const [loadingMsg, setLoadingMsg]       = useState('');
  const [error, setError]                 = useState(null);
  const [apiKey, setApiKey]               = useState('');
  const [showApiKey, setShowApiKey]       = useState(false);
  const [sourceFilter, setSourceFilter]   = useState('All');
  const [sortBy, setSortBy]               = useState('deadline');
  const [lastSearched, setLastSearched]   = useState(null);
  const [expandedId, setExpandedId]       = useState(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualForm, setManualForm]       = useState({ title:'', agency:'', deadline:'', link:'', notes:'' });

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { results:r, lastSearched:ls, apiKey:ak } = JSON.parse(saved);
        if (r) setResults(r);
        if (ls) setLastSearched(ls);
        if (ak) setApiKey(ak);
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ results, lastSearched, apiKey })); }
    catch(e) {}
  }, [results, lastSearched, apiKey]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  async function fetchViaProxy(url) {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    return res.text();
  }

  function makeId(prefix, str) {
    return `${prefix}-${(str||'').replace(/\W+/g,'-').substring(0,35).replace(/-$/,'')}`;
  }

  // ── SAM.gov ───────────────────────────────────────────────────────────────────
  async function fetchSAM(key) {
    const allOpps = [];
    const seenIds = new Set();
    const NE = ['MA','ME','NH','VT','RI','CT','NY','NJ','PA','MD','VA','DC'];
    for (const kw of SAM_SEARCHES) {
      try {
        setLoadingMsg(`SAM.gov: "${kw}"…`);
        const url = `https://api.sam.gov/opportunities/v2/search?api_key=${key}&q=${encodeURIComponent(kw)}&limit=25&postedFrom=01/01/2025&active=true`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        for (const o of (data.opportunitiesData || [])) {
          if (seenIds.has(o.noticeId)) continue;
          const state = (o.placeOfPerformance?.state?.code || '').toUpperCase();
          if (!NE.includes(state)) continue;
          if (!isRelevant(o.title)) continue;
          seenIds.add(o.noticeId);
          allOpps.push({
            id: `sam-${o.noticeId}`,
            source:'SAM.gov', title:o.title,
            agency: o.organizationHierarchy?.[0]?.name || 'Federal',
            deadline: o.responseDeadLine?.substring(0,10) || '',
            link: `https://sam.gov/opp/${o.noticeId}/view`,
            description: o.description?.substring(0,200) || '',
            type: o.type || 'Solicitation',
          });
        }
      } catch(e) { console.warn('SAM error:', e.message); }
    }
    return allOpps;
  }

  // ── City of Boston ─────────────────────────────────────────────────────────────
  async function fetchBoston() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('City of Boston…');
    async function getPage(n) {
      const url = `https://www.boston.gov/bid-listings${n > 0 ? `?page=${n}` : ''}`;
      try { const r = await fetch(url); if (!r.ok) throw new Error(); return r.text(); }
      catch { return fetchViaProxy(url); }
    }
    try {
      const p0 = await getPage(0);
      const nums = [...new Set((p0.match(/\?page=(\d+)/g)||[]).map(m=>parseInt(m.replace('?page=',''))))];
      const maxPage = nums.length ? Math.max(...nums) : 0;
      const pages = [p0, ...await Promise.all(Array.from({length:maxPage},(_,i)=>getPage(i+1)))];
      for (const html of pages) {
        const parts = html.split('views-row');
        for (let i = 1; i < parts.length; i++) {
          const block = parts[i];
          const linkMatch = block.match(/href="(\/bid-listings\/[^"]+)"/);
          const titleMatch = block.match(/title="([^"]{5,200})"/i) || block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
          const deadlineMatch = block.match(/Due[:\s]+([A-Za-z]+ \d+,?\s*\d{4})/i) || block.match(/(\w+ \d+,\s*\d{4})/);
          const agencyMatch = block.match(/Department[:\s]*([^<\n]{3,60})/i);
          const link = linkMatch ? `https://www.boston.gov${linkMatch[1]}` : '';
          const title = (titleMatch ? titleMatch[1] : '').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim();
          if (!title || title.length < 5) continue;
          if (!isRelevant(title)) continue;
          const idKey = link || title.substring(0,40);
          if (seenIds.has(idKey)) continue;
          seenIds.add(idKey);
          allOpps.push({
            id: makeId('boston', idKey),
            source:'City of Boston', title,
            agency: agencyMatch ? `Boston — ${agencyMatch[1].trim()}` : 'City of Boston',
            deadline: deadlineMatch ? deadlineMatch[1].trim() : '',
            link: link || 'https://www.boston.gov/bid-listings',
            description:'', type:'Bid',
          });
        }
      }
    } catch(e) { console.warn('Boston error:', e.message); }
    return allOpps;
  }

  // ── COMMBUYS (MA statewide) ────────────────────────────────────────────────────
  // Uses keyword search URL for each term — far more targeted than generic open-bids listing.
  // Each search term fetches pages 1–2 (up to 50 results). Deduped by bid number.
  async function fetchCOMMBUYS() {
    const allOpps = [];
    const seenIds = new Set();

    function parseCommbuysBidRows(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const rows = doc.querySelectorAll('table tr');
      const results = [];
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) continue;
        // Actual column layout (verified from live DOM):
        // Col 0: Bid Solicitation # (link), Col 2: Organization Name,
        // Col 6: Description, Col 7: Bid Opening Date
        const bidLink = cells[0]?.querySelector('a');
        if (!bidLink) continue;
        const bidNum = bidLink.textContent.trim();
        if (!bidNum) continue;
        const href = bidLink.getAttribute('href') || '';
        const link = href.startsWith('http') ? href : `https://www.commbuys.com${href}`;
        const orgName = cells[2]?.textContent.trim() || '';
        const description = cells[6]?.textContent.trim() || '';
        const dateText = cells[7]?.textContent.trim() || '';
        results.push({ bidNum, link, orgName, description, dateText });
      }
      return results;
    }

    for (const term of COMMBUYS_SEARCH_TERMS) {
      setLoadingMsg(`COMMBUYS — searching "${term}"…`);
      try {
        for (let page = 1; page <= 2; page++) {
          // Use dedicated /api/commbuys endpoint which handles JSF session cookie
          const html = await fetch(`/api/commbuys?q=${encodeURIComponent(term)}&page=${page}`).then(r => r.text());
          const rows = parseCommbuysBidRows(html);
          let newOnPage = 0;
          for (const { bidNum, link, orgName, description, dateText } of rows) {
            if (seenIds.has(bidNum)) continue;
            if (!isRelevant(description + ' ' + bidNum)) continue;
            seenIds.add(bidNum);
            newOnPage++;
            allOpps.push({
              id: `commbuys-${bidNum.replace(/\W+/g, '-')}`,
              source: 'COMMBUYS',
              title: description || bidNum,
              agency: orgName || 'MA Agency',
              deadline: dateText,
              link,
              description: '',
              bid_number: bidNum,
              type: /rfp|request for proposal/i.test(description) ? 'RFP'
                  : /rfq/i.test(description) ? 'RFQ'
                  : 'Bid',
            });
          }
          // If page 1 returned no rows at all, no point fetching page 2
          if (page === 1 && rows.length === 0) break;
        }
      } catch(e) { console.warn(`COMMBUYS error (term: "${term}"):`, e.message); }
    }
    return allOpps;
  }

  // ── Watertown MA ───────────────────────────────────────────────────────────────
  async function fetchWatertown() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Watertown MA…');
    try {
      const html = await fetchViaProxy('https://www.watertown-ma.gov/bids');
      const blocks = html.split('widgetDesc');
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const titleMatch = block.match(/<h2[^>]*>([^<]{5,150})<\/h2>/i);
        const linkMatch  = block.match(/href="(https?:\/\/www\.watertown-ma\.gov\/[^"]+)"/i) || block.match(/href="(\/[^"]+)"/i);
        const dateMatch  = block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        const title = titleMatch ? titleMatch[1].replace(/&amp;/g,'&').trim() : '';
        if (!title || !isRelevant(title)) continue;
        const link = linkMatch ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.watertown-ma.gov${linkMatch[1]}`) : 'https://www.watertown-ma.gov/bids';
        if (seenIds.has(title)) continue;
        seenIds.add(title);
        allOpps.push({ id:makeId('watertown',title), source:'Watertown MA', title, agency:'Town of Watertown', deadline:dateMatch?dateMatch[0]:'', link, description:'', type:'Bid' });
      }
    } catch(e) { console.warn('Watertown error:', e.message); }
    return allOpps;
  }

  // ── Somerville MA ──────────────────────────────────────────────────────────────
  async function fetchSomerville() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Somerville MA…');
    try {
      const html = await fetchViaProxy('https://www.somervillema.gov/departments/finance/procurement-and-contracting-services');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      for (const row of doc.querySelectorAll('table tr')) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) continue;
        const a = cells[1]?.querySelector('a');
        if (!a) continue;
        const title = a.textContent.replace(/\s+/g,' ').trim();
        if (!title || !isRelevant(title)) continue;
        const href = a.getAttribute('href') || '';
        const link = href.startsWith('http') ? href : `https://www.somervillema.gov${href}`;
        const bidNum = cells[0]?.textContent.trim() || '';
        if (seenIds.has(bidNum || link)) continue;
        seenIds.add(bidNum || link);
        allOpps.push({ id:makeId('somerville',bidNum||link), source:'Somerville MA', title, agency:'City of Somerville', deadline:cells[cells.length-1]?.textContent.trim()||'', link, description:'', type:/rfp/i.test(bidNum)?'RFP':/rfq/i.test(bidNum)?'RFQ':'Bid', bid_number:bidNum });
      }
    } catch(e) { console.warn('Somerville error:', e.message); }
    return allOpps;
  }

  // ── Providence RI ──────────────────────────────────────────────────────────────
  async function fetchProvidence() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Providence RI…');
    try {
      const html = await fetchViaProxy('https://www.providenceri.gov/purchasing/openrfpsummary/');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        if (!href.includes('wp-content/uploads') && !href.includes('/purchasing/')) continue;
        const title = a.textContent.replace(/\s+/g,' ').trim();
        if (!title || title.length < 10) continue;
        if (/addend(um|a)\s*\d/i.test(title)) continue;
        if (!isRelevant(title)) continue;
        const url = href.startsWith('http') ? href : `https://www.providenceri.gov${href}`;
        const idKey = title.substring(0,40);
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
        allOpps.push({ id:makeId('providence',idKey), source:'Providence RI', title, agency:'City of Providence', deadline:'', link:url, description:'', type:/rfp/i.test(title)?'RFP':/rfq/i.test(title)?'RFQ':'Bid' });
      }
    } catch(e) { console.warn('Providence error:', e.message); }
    return allOpps;
  }

  // ── Portsmouth NH (OpenGov) ────────────────────────────────────────────────────
  async function fetchPortsmouth() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Portsmouth NH…');
    try {
      // Portsmouth migrated to OpenGov - try both
      const urls = [
        'https://procurement.opengov.com/portal/portsmouthnh',
        'https://www.portsmouthnh.gov/finance/purchasing-bids-and-proposals',
      ];
      for (const baseUrl of urls) {
        try {
          const html = await fetchViaProxy(baseUrl);
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const items = doc.querySelectorAll('article, .views-row, li, tr');
          for (const item of items) {
            const a = item.querySelector('a[href]');
            if (!a) continue;
            const title = a.textContent.replace(/\s+/g,' ').trim();
            if (!title || title.length < 8 || !isRelevant(title)) continue;
            const href = a.getAttribute('href');
            const link = href.startsWith('http') ? href : `https://www.portsmouthnh.gov${href}`;
            if (seenIds.has(link)) continue;
            seenIds.add(link);
            const dateMatch = item.textContent.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
            allOpps.push({ id:makeId('portsmouth',link), source:'Portsmouth NH', title, agency:'City of Portsmouth NH', deadline:dateMatch?dateMatch[0]:'', link, description:'', type:'Bid' });
          }
          if (allOpps.length > 0) break;
        } catch(e) { /* try next URL */ }
      }
    } catch(e) { console.warn('Portsmouth error:', e.message); }
    return allOpps;
  }

  // ── CivicEngage generic ────────────────────────────────────────────────────────
  async function fetchCivicEngage(townName, baseUrl, agency) {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg(`${townName}…`);
    try {
      const html = await fetchViaProxy(baseUrl);
      const origin = new URL(baseUrl).origin;
      const bidBlocks = html.split(/class="listItemsRow bid/i);
      for (let i = 1; i < bidBlocks.length; i++) {
        const block = bidBlocks[i];
        if (/bidStatusClosed|Closed|Awarded|Cancelled/i.test(block.substring(0,400))) continue;
        const linkMatch = block.match(/href="([^"]*(?:bids?\.aspx\?bidID=\d+|BidID=\d+)[^"]*)"/i);
        const titleMatch = block.match(/class="bidTitle[^"]*"[^>]*>\s*(?:<[^>]+>)*([^<]{5,200})/i)
                        || block.match(/<a[^>]+bidID=\d+[^>]*>([^<]{5,200})<\/a>/i);
        if (!linkMatch || !titleMatch) continue;
        const title = titleMatch[1].replace(/&amp;/g,'&').replace(/&#\d+;/g,'').replace(/\s+/g,' ').trim();
        if (!title || !isRelevant(title)) continue;
        const href = linkMatch[1];
        const link = href.startsWith('http') ? href : `${origin}/${href.replace(/^\//,'')}`;
        if (seenIds.has(link)) continue;
        seenIds.add(link);
        const dateMatch = block.match(/(?:Clos|Due)[^:]*:\s*([A-Za-z]+ \d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
        const descMatch = block.match(/class="bidDescription[^"]*"[^>]*>([^<]{10,300})/i);
        allOpps.push({
          id: makeId(townName.toLowerCase().replace(/\s+/g,'-'), link),
          source:townName, title, agency,
          deadline: dateMatch ? dateMatch[1] : '',
          link, description: descMatch ? descMatch[1].replace(/&amp;/g,'&').trim() : '',
          type: /rfp|proposal/i.test(title)?'RFP':/rfq|qualifications/i.test(title)?'RFQ':'Bid',
        });
      }
    } catch(e) { console.warn(`${townName} error:`, e.message); }
    return allOpps;
  }

  // ── NH DAS (statewide NH procurement) ─────────────────────────────────────────
  async function fetchNHDAS() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('NH State Procurement…');
    try {
      const html = await fetchViaProxy('https://apps.das.nh.gov/NHProcurement/Bid');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const rows = doc.querySelectorAll('table tr, .bid-item, article');
      for (const row of rows) {
        const a = row.querySelector('a[href]');
        if (!a) continue;
        const title = a.textContent.replace(/\s+/g,' ').trim();
        if (!title || title.length < 8 || !isRelevant(title)) continue;
        const href = a.getAttribute('href') || '';
        const link = href.startsWith('http') ? href : `https://apps.das.nh.gov${href}`;
        const idKey = link;
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
        const dateMatch = row.textContent.match(/(\d{1,2}\/\d{1,2}\/\d{4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        allOpps.push({ id:makeId('nhdas',link), source:'NH State', title, agency:'State of NH', deadline:dateMatch?dateMatch[0]:'', link, description:'', type:'Bid' });
      }
    } catch(e) { console.warn('NH DAS error:', e.message); }
    return allOpps;
  }

  // ── Add manual entry ───────────────────────────────────────────────────────────
  function addManual() {
    if (!manualForm.title.trim()) return;
    setResults(prev => [{
      id: `manual-${Date.now()}`,
      source:'Manual', title:manualForm.title.trim(),
      agency:manualForm.agency.trim() || 'Manual entry',
      deadline:manualForm.deadline.trim(), link:manualForm.link.trim(),
      description:manualForm.notes.trim(), type:'Manual',
    }, ...prev]);
    setManualForm({ title:'', agency:'', deadline:'', link:'', notes:'' });
    setShowAddManual(false);
  }

  // ── Run search ─────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const civicEngageTowns = [
      // ── Currently in production ──
      ['Falmouth MA',      'https://www.falmouthma.gov/Bids.aspx',           'Town of Falmouth'],
      ['Chatham MA',       'https://www.chatham-ma.gov/Bids.aspx',            'Town of Chatham'],
      ['Lexington MA',     'https://www.lexingtonma.gov/Bids.aspx',           'Town of Lexington'],
      ['Concord MA',       'https://www.concordma.gov/Bids.aspx',             'Town of Concord'],
      ['Needham MA',       'https://www.needhamma.gov/Bids.aspx',             'Town of Needham'],
      ['Gloucester MA',    'https://www.gloucester-ma.gov/Bids.aspx',         'City of Gloucester'],
      ['Salem MA',         'https://www.salemma.gov/Bids.aspx',               'City of Salem'],
      ['Newburyport MA',   'https://www.cityofnewburyport.com/Bids.aspx',     'City of Newburyport'],
      ['Marblehead MA',    'https://www.marblehead.org/Bids.aspx',            'Town of Marblehead'],
      ['Hingham MA',       'https://www.hingham-ma.gov/Bids.aspx',            'Town of Hingham'],
      ['Cohasset MA',      'https://www.cohassetma.org/Bids.aspx',            'Town of Cohasset'],
      ['Duxbury MA',       'https://www.town.duxbury.ma.us/Bids.aspx',        'Town of Duxbury'],
      ['Scituate MA',      'https://www.scituatema.gov/Bids.aspx',            'Town of Scituate'],
      // ── New additions ──
      ['Brookline MA',     'https://www.brooklinema.gov/Bids.aspx',           'Town of Brookline'],
      ['Belmont MA',       'https://www.belmont-ma.gov/bids.aspx',            'Town of Belmont'],
      ['Milton MA',        'https://www.miltonma.gov/bids.aspx',              'Town of Milton'],
      ['Wellesley MA',     'https://www.wellesleyma.gov/Bids.aspx',           'Town of Wellesley'],
      ['Weston MA',        'https://www.weston.org/bids.aspx',                'Town of Weston'],
      ['Beverly MA',       'https://www.beverlyma.gov/Bids.aspx',             'City of Beverly'],
      ['Ipswich MA',       'https://www.ipswichma.gov/Bids.aspx',             'Town of Ipswich'],
      ['Rockport MA',      'https://www.rockportma.gov/Bids.aspx',            'Town of Rockport'],
      ['Wenham MA',        'https://www.wenhamma.gov/bids.aspx',              'Town of Wenham'],
      ['Yarmouth MA',      'https://www.yarmouth.ma.us/Bids.aspx',            'Town of Yarmouth'],
      ['Orleans MA',       'https://www.town.orleans.ma.us/Bids.aspx',        'Town of Orleans'],
      ['Madison CT',       'https://www.madisonct.org/bids.aspx',             'Town of Madison CT'],
      ['Winchester MA',    'https://www.winchester-ma.gov/bids.aspx',         'Town of Winchester'],
      ['Hanover MA',       'https://www.hanover-ma.gov/bids.aspx',            'Town of Hanover'],
      ['Norwell MA',       'https://www.norwell.ma.us/bids.aspx',             'Town of Norwell'],
    ];

    try {
      setLoadingMsg('Searching all sources in parallel…');
      const [
        samResults,
        bostonResults,
        commbuysResults,
        watertownResults,
        portsmouthResults,
        somervilleResults,
        providenceResults,
        nhdasResults,
        ...civicArrays
      ] = await Promise.all([
        apiKey ? fetchSAM(apiKey) : Promise.resolve([]),
        fetchBoston(),
        fetchCOMMBUYS(),
        fetchWatertown(),
        fetchPortsmouth(),
        fetchSomerville(),
        fetchProvidence(),
        fetchNHDAS(),
        ...civicEngageTowns.map(([name, url, agency]) => fetchCivicEngage(name, url, agency)),
      ]);

      const incoming = [
        ...samResults,
        ...bostonResults,
        ...commbuysResults,
        ...watertownResults,
        ...portsmouthResults,
        ...somervilleResults,
        ...providenceResults,
        ...nhdasResults,
        ...civicArrays.flat(),
      ];

      setResults(prev => {
        const manuals = prev.filter(r => r.source === 'Manual');
        const existingIds = new Set(prev.map(r => r.id));
        const fresh = incoming.filter(r => !existingIds.has(r.id));
        const updated = prev.filter(r => r.source !== 'Manual').map(r => {
          const match = incoming.find(n => n.id === r.id);
          return match ? { ...match, description: r.description || match.description } : r;
        });
        return [...manuals, ...updated, ...fresh];
      });

      setLastSearched(new Date().toISOString());
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // ── Filter & sort ──────────────────────────────────────────────────────────────
  const sources = ['All', ...new Set(results.map(r => r.source))].sort((a,b) => a==='All'?-1:a.localeCompare(b));

  const filtered = results
    .filter(r => sourceFilter === 'All' || r.source === sourceFilter)
    .sort((a, b) => {
      if (sortBy === 'deadline') return (a.deadline||'zzzz').localeCompare(b.deadline||'zzzz');
      if (sortBy === 'source')   return a.source.localeCompare(b.source);
      if (sortBy === 'title')    return a.title.localeCompare(b.title);
      return 0;
    });

  // ── Render ─────────────────────────────────────────────────────────────────────
  const inputStyle = {
    padding:'7px 12px', border:`1px solid ${BRAND.border}`, borderRadius:0,
    fontSize:12, fontFamily:"'Poppins','Helvetica Neue',Arial,sans-serif",
    color:BRAND.text, background:'#fff', outline:'none',
  };
  const btnGhost = {
    background:'transparent', border:`1px solid ${BRAND.border}`, color:BRAND.secondary,
    padding:'7px 16px', cursor:'pointer', fontSize:11, letterSpacing:0.3,
    fontFamily:"'Poppins','Helvetica Neue',Arial,sans-serif",
  };
  const btnPrimary = {
    background:BRAND.primary, border:'none', color:'#fff',
    padding:'7px 22px', cursor:'pointer', fontSize:11, fontWeight:600, letterSpacing:0.5,
    fontFamily:"'Poppins','Helvetica Neue',Arial,sans-serif",
  };

  return (
    <div style={{ fontFamily:"'Poppins','Helvetica Neue',Arial,sans-serif", background:'#fff', minHeight:'100vh', color:BRAND.text }}>

      {/* Top nav — mirrors leblancjones.com header */}
      <div style={{ padding:'22px 48px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${BRAND.border}` }}>
        <div style={{ color:BRAND.primary, fontSize:14, fontWeight:400, letterSpacing:0.2 }}>
          LeBlanc Jones Landscape Architects
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => setShowApiKey(v=>!v)} style={btnGhost}>SAM Key</button>
          <button onClick={() => setShowAddManual(v=>!v)} style={btnGhost}>+ Add</button>
          <button onClick={runSearch} disabled={loading}
            style={{ ...btnPrimary, background: loading ? BRAND.muted : BRAND.primary, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Title row */}
      <div style={{ padding:'32px 48px 0' }}>
        <div style={{ fontSize:11, color:BRAND.muted, letterSpacing:1.5, textTransform:'uppercase', marginBottom:6 }}>Public Work</div>
        <div style={{ fontSize:28, fontWeight:300, color:BRAND.text, letterSpacing:-0.5, lineHeight:1.2 }}>Opportunity Pipeline</div>
      </div>

      {/* Panels */}
      {showApiKey && (
        <div style={{ margin:'16px 48px 0', padding:'16px 20px', background:BRAND.bg, border:`1px solid ${BRAND.border}` }}>
          <div style={{ fontSize:11, color:BRAND.muted, marginBottom:8, letterSpacing:0.5 }}>SAM.GOV API KEY</div>
          <div style={{ display:'flex', gap:8 }}>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="SAM-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{ ...inputStyle, flex:1, maxWidth:420 }} />
            <button onClick={() => setShowApiKey(false)} style={btnPrimary}>Save</button>
          </div>
        </div>
      )}

      {showAddManual && (
        <div style={{ margin:'16px 48px 0', padding:'16px 20px', background:BRAND.bg, border:`1px solid ${BRAND.border}` }}>
          <div style={{ fontSize:11, color:BRAND.muted, marginBottom:10, letterSpacing:0.5 }}>ADD MANUAL ENTRY</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[['Title *','title','280px'],['Agency','agency','160px'],['Due Date','deadline','120px'],['URL','link','220px']].map(([ph,field,w]) => (
              <input key={field} placeholder={ph} value={manualForm[field]}
                onChange={e => setManualForm(f=>({...f,[field]:e.target.value}))}
                style={{ ...inputStyle, width:w }} />
            ))}
            <button onClick={addManual} style={btnPrimary}>Add</button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ margin:'16px 48px 0', padding:'8px 0', borderTop:`2px solid ${BRAND.primary}` }}>
          <div style={{ fontSize:11, color:BRAND.primary, letterSpacing:0.3 }}>{loadingMsg}</div>
        </div>
      )}

      {error && (
        <div style={{ margin:'12px 48px 0', fontSize:12, color:'#c44' }}>⚠ {error}</div>
      )}

      {/* Filter / stats bar */}
      <div style={{ padding:'20px 48px 0', display:'flex', gap:14, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:12, color:BRAND.secondary }}>
          {filtered.length} {filtered.length === 1 ? 'opportunity' : 'opportunities'}
          {results.length !== filtered.length ? <span style={{ color:BRAND.muted }}> of {results.length}</span> : ''}
        </span>
        {lastSearched && (
          <span style={{ fontSize:11, color:BRAND.muted }}>
            · searched {new Date(lastSearched).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
          </span>
        )}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ ...inputStyle, paddingRight:8 }}>
            {sources.map(s => <option key={s} value={s}>{s === 'All' ? 'All Sources' : s}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle, paddingRight:8 }}>
            <option value="deadline">Due Date</option>
            <option value="source">Source</option>
            <option value="title">Title</option>
          </select>
          {results.length > 0 && (
            <button onClick={() => setResults(r => r.filter(x => x.source === 'Manual'))} style={btnGhost}>Clear</button>
          )}
        </div>
      </div>

      {/* Opportunity list — editorial rows, no card boxes */}
      <div style={{ padding:'12px 48px 48px' }}>

        {filtered.length === 0 && !loading && (
          <div style={{ padding:'80px 0', textAlign:'center', color:BRAND.muted }}>
            <div style={{ fontSize:12, marginBottom:6 }}>No opportunities yet.</div>
            <div style={{ fontSize:11 }}>Click Search to scan all sources.</div>
          </div>
        )}

        {filtered.map((opp, idx) => {
          const isExpanded = expandedId === opp.id;
          const typeColor = opp.type === 'RFP' ? BRAND.primary : opp.type === 'RFQ' ? '#5A9BD4' : BRAND.muted;
          return (
            <div key={opp.id}>
              {/* Hairline divider */}
              <div style={{ borderTop: idx === 0 ? `1px solid ${BRAND.border}` : 'none' }} />
              <div style={{ borderTop:`1px solid ${BRAND.border}`, padding:'18px 0', cursor:'pointer' }}
                onClick={() => setExpandedId(isExpanded ? null : opp.id)}>

                <div style={{ display:'flex', alignItems:'flex-start', gap:20 }}>

                  {/* Type pill — left column, fixed width */}
                  <div style={{ minWidth:44, paddingTop:2 }}>
                    <span style={{ fontSize:9, color:typeColor, fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>
                      {opp.type || 'Bid'}
                    </span>
                  </div>

                  {/* Main content */}
                  <div style={{ flex:1, minWidth:0 }}>
                    {opp.link ? (
                      <a href={opp.link} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color:BRAND.text, fontWeight:400, fontSize:14, textDecoration:'none', lineHeight:1.5 }}
                        onMouseOver={e => e.target.style.color=BRAND.primary}
                        onMouseOut={e => e.target.style.color=BRAND.text}>
                        {opp.title}
                      </a>
                    ) : (
                      <span style={{ fontSize:14, color:BRAND.text, lineHeight:1.5 }}>{opp.title}</span>
                    )}
                    <div style={{ display:'flex', gap:16, marginTop:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:BRAND.secondary }}>{opp.agency || opp.source}</span>
                      {opp.agency && opp.agency !== opp.source && (
                        <span style={{ fontSize:11, color:BRAND.muted }}>{opp.source}</span>
                      )}
                      {opp.deadline && (
                        <span style={{ fontSize:11, color:BRAND.muted }}>Due {opp.deadline}</span>
                      )}
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <div style={{ fontSize:10, color:BRAND.muted, paddingTop:4, userSelect:'none' }}>
                    {isExpanded ? '−' : '+'}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div style={{ marginTop:12, paddingLeft:64 }}>
                    {opp.bid_number && (
                      <div style={{ fontSize:10, color:BRAND.muted, fontFamily:'monospace', marginBottom:8 }}>
                        {opp.bid_number}
                      </div>
                    )}
                    {opp.description && (
                      <p style={{ fontSize:12, color:BRAND.secondary, lineHeight:1.7, margin:'0 0 12px' }}>
                        {opp.description}
                      </p>
                    )}
                    <div style={{ display:'flex', gap:10 }}>
                      {opp.link && (
                        <a href={opp.link} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize:11, color:BRAND.primary, textDecoration:'none', letterSpacing:0.3 }}
                          onMouseOver={e => e.target.style.textDecoration='underline'}
                          onMouseOut={e => e.target.style.textDecoration='none'}>
                          View Bid ↗
                        </a>
                      )}
                      <span style={{ color:BRAND.border }}>·</span>
                      <button
                        onClick={e => { e.stopPropagation(); setResults(prev => prev.filter(r => r.id !== opp.id)); setExpandedId(null); }}
                        style={{ background:'none', border:'none', padding:0, fontSize:11, color:BRAND.muted, cursor:'pointer' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding:'16px 48px', borderTop:`1px solid ${BRAND.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:10, color:BRAND.muted }}>LeBlanc Jones Landscape Architects · Public Work Pipeline v17</span>
        <span style={{ fontSize:10, color:BRAND.muted }}>29 towns · Boston · COMMBUYS · NH · Providence · SAM.gov</span>
      </div>
    </div>
  );
}
