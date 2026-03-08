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

// ─── FILTER: moderate — LA design services + park/waterfront/plaza/streetscape
// A bid passes if its title contains at least one PASS term
// and does NOT contain any HARD_NO term.

const PASS_TERMS = [
  // Explicit LA
  'landscape architect','landscape architecture','landscape design',
  'planting design','horticultural','site landscape',
  // Design services
  'design services','planning and design','design and planning',
  'design consultant','planning services','master plan','masterplan',
  'conceptual design','schematic design','professional design',
  // Park / open space
  'park design','park master plan','park improvement','park renovation',
  'park planning','parks design','recreation design','playground design',
  'open space design','open space plan','greenway design','trail design',
  // Waterfront / civic
  'waterfront design','waterfront planning','waterfront master plan',
  'harbor design','esplanade design','riverwalk','harborwalk',
  'plaza design','plaza improvement','streetscape design',
  'streetscape improvement','streetscape planning','promenade design',
  // Campus / institutional
  'campus design','campus landscape','institutional landscape',
  'urban design','public realm design','civic design',
  // Multifamily / amenity
  'courtyard design','rooftop garden','outdoor amenity design',
  'residential landscape','amenity landscape',
];

const HARD_NO = [
  'snow removal','snow plowing','salting','sanding',
  'lawn care','mowing','grounds keeping','landscape maintenance','turf management',
  'janitorial','custodial','cleaning services','trash','rubbish','waste removal',
  'hvac','plumbing','electrical contractor','boiler','mechanical','generator',
  'elevator','fire suppression','roofing',
  'water main','sewer','roadway construction','paving contractor','asphalt',
  'concrete contractor','crack seal','pavement marking','guardrail',
  'retaining wall','sidewalk repair','curb replacement',
  'audit','accounting','legal services','food service','catering',
  'printing services','mailing','shuttle','vehicle purchase','fuel supply',
  'medical','pharmaceutical','ammunition','weapons','staffing agency',
  'security guard','real estate broker','insurance services',
  'it services','information technology','cybersecurity','software development',
  'network infrastructure','telecommunications',
];

function isRelevant(title) {
  const t = (title || '').toLowerCase();
  if (HARD_NO.some(k => t.includes(k))) return false;
  return PASS_TERMS.some(k => t.includes(k));
}

// ─── SAM.GOV KEYWORDS ────────────────────────────────────────────────────────
const SAM_SEARCHES = [
  'landscape architecture','landscape architect','landscape design',
  'park design','streetscape design','waterfront design',
  'urban plaza design','open space design','site design services',
  'planting design',
];

const STORAGE_KEY = 'ljla_v13';

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [results, setResults]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [loadingMsg, setLoadingMsg]     = useState('');
  const [error, setError]               = useState(null);
  const [apiKey, setApiKey]             = useState('');
  const [showApiKey, setShowApiKey]     = useState(false);
  const [sourceFilter, setSourceFilter] = useState('All');
  const [sortBy, setSortBy]             = useState('deadline');
  const [lastSearched, setLastSearched] = useState(null);
  const [expandedId, setExpandedId]     = useState(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualForm, setManualForm]     = useState({ title: '', agency: '', deadline: '', link: '', notes: '' });

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { results: r, lastSearched: ls, apiKey: ak } = JSON.parse(saved);
        if (r) setResults(r);
        if (ls) setLastSearched(ls);
        if (ak) setApiKey(ak);
      }
    } catch(e) { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ results, lastSearched, apiKey }));
    } catch(e) { /* ignore */ }
  }, [results, lastSearched, apiKey]);

  // ── Proxy helper ─────────────────────────────────────────────────────────────
  async function fetchViaProxy(url) {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    return res.text();
  }

  // ── SAM.gov ───────────────────────────────────────────────────────────────────
  async function fetchSAM(key) {
    const allOpps = [];
    const seenIds = new Set();
    const NE_STATES = ['MA','ME','NH','VT','RI','CT','NY','NJ','PA','MD','VA','DC'];

    for (const keyword of SAM_SEARCHES) {
      try {
        setLoadingMsg(`SAM.gov: searching "${keyword}"…`);
        const url = `https://api.sam.gov/opportunities/v2/search?api_key=${key}&q=${encodeURIComponent(keyword)}&limit=25&postedFrom=01/01/2025&active=true`;
        const res  = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        for (const opp of (data.opportunitiesData || [])) {
          if (seenIds.has(opp.noticeId)) continue;
          const state = (opp.placeOfPerformance?.state?.code || '').toUpperCase();
          if (!NE_STATES.includes(state)) continue;
          if (!isRelevant(opp.title)) continue;
          seenIds.add(opp.noticeId);
          allOpps.push({
            id: `sam-${opp.noticeId}`,
            source: 'SAM.gov',
            title: opp.title,
            agency: opp.organizationHierarchy?.[0]?.name || opp.fullParentPathName || 'Federal',
            deadline: opp.responseDeadLine ? opp.responseDeadLine.substring(0,10) : '',
            link: `https://sam.gov/opp/${opp.noticeId}/view`,
            description: opp.description?.substring(0,200) || '',
            type: opp.type || 'Solicitation',
          });
        }
      } catch(e) { console.warn('SAM search failed:', e.message); }
    }
    return allOpps;
  }

  // ── City of Boston ────────────────────────────────────────────────────────────
  async function fetchBoston() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('City of Boston: fetching bids…');

    async function getPage(n) {
      const url = `https://www.boston.gov/bid-listings${n > 0 ? `?page=${n}` : ''}`;
      try { const r = await fetch(url); if (!r.ok) throw new Error(); return r.text(); }
      catch { return fetchViaProxy(url); }
    }

    try {
      const p0 = await getPage(0);
      const pageNums = [...new Set((p0.match(/\?page=(\d+)/g) || []).map(m => parseInt(m.replace('?page=',''))))];
      const maxPage = pageNums.length ? Math.max(...pageNums) : 0;
      const pages = [p0, ...await Promise.all(Array.from({length: maxPage}, (_,i) => getPage(i+1)))];

      for (const html of pages) {
        const parts = html.split('views-row');
        for (let i = 1; i < parts.length; i++) {
          const block = parts[i];
          const linkMatch = block.match(/href="(\/bid-listings\/[^"]+)"/);
          const titleMatch = block.match(/title="([^"]{5,200})"/i)
                          || block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
          const deadlineMatch = block.match(/Due[:\s]+([A-Za-z]+ \d+,?\s*\d{4})/i)
                             || block.match(/(\w+ \d+,\s*\d{4})/);
          const agencyMatch = block.match(/Department[:\s]*([^<\n]{3,60})/i);

          const link = linkMatch ? `https://www.boston.gov${linkMatch[1]}` : '';
          const title = (titleMatch ? titleMatch[1] : '').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim();
          if (!title || title.length < 5) continue;
          if (!isRelevant(title)) continue;
          const idKey = link || title.substring(0,40);
          if (seenIds.has(idKey)) continue;
          seenIds.add(idKey);

          allOpps.push({
            id: `boston-${idKey.replace(/\W+/g,'-')}`,
            source: 'City of Boston',
            title,
            agency: agencyMatch ? `Boston — ${agencyMatch[1].trim()}` : 'City of Boston',
            deadline: deadlineMatch ? deadlineMatch[1].trim() : '',
            link: link || 'https://www.boston.gov/bid-listings',
            description: '',
            type: 'Bid',
          });
        }
      }
    } catch(e) { console.warn('Boston fetch failed:', e.message); }
    return allOpps;
  }

  // ── Watertown MA ─────────────────────────────────────────────────────────────
  async function fetchWatertown() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Watertown MA: fetching bids…');
    try {
      const html = await fetchViaProxy('https://www.watertown-ma.gov/bids');
      const blocks = html.split('widgetDesc');
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const titleMatch = block.match(/<h2[^>]*>([^<]{5,150})<\/h2>/i);
        const linkMatch  = block.match(/href="(https?:\/\/www\.watertown-ma\.gov\/[^"]+)"/i)
                        || block.match(/href="(\/[^"]+)"/i);
        const dateMatch  = block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        const title = titleMatch ? titleMatch[1].replace(/&amp;/g,'&').trim() : '';
        if (!title || !isRelevant(title)) continue;
        const link = linkMatch ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.watertown-ma.gov${linkMatch[1]}`) : 'https://www.watertown-ma.gov/bids';
        if (seenIds.has(title)) continue;
        seenIds.add(title);
        allOpps.push({
          id: `watertown-${title.substring(0,30).replace(/\W+/g,'-')}`,
          source: 'Watertown MA', title,
          agency: 'Town of Watertown',
          deadline: dateMatch ? dateMatch[0] : '',
          link, description: '', type: 'Bid',
        });
      }
    } catch(e) { console.warn('Watertown fetch failed:', e.message); }
    return allOpps;
  }

  // ── Portsmouth NH ─────────────────────────────────────────────────────────────
  async function fetchPortsmouth() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Portsmouth NH: fetching bids…');
    try {
      const html = await fetchViaProxy('https://www.portsmouthnh.gov/bids-and-rfps/');
      // Portsmouth lists bids as <article> or <li> blocks with title+link
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const items = doc.querySelectorAll('article, .views-row, li.bid');
      for (const item of items) {
        const a = item.querySelector('a[href]');
        if (!a) continue;
        const title = a.textContent.replace(/\s+/g,' ').trim();
        if (!title || !isRelevant(title)) continue;
        const href = a.getAttribute('href');
        const link = href.startsWith('http') ? href : `https://www.portsmouthnh.gov${href}`;
        if (seenIds.has(link)) continue;
        seenIds.add(link);
        const dateMatch = item.textContent.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        allOpps.push({
          id: `portsmouth-${href.replace(/\W+/g,'-').substring(0,30)}`,
          source: 'Portsmouth NH', title,
          agency: 'City of Portsmouth NH',
          deadline: dateMatch ? dateMatch[0] : '',
          link, description: '', type: 'Bid',
        });
      }
    } catch(e) { console.warn('Portsmouth fetch failed:', e.message); }
    return allOpps;
  }

  // ── Somerville MA ─────────────────────────────────────────────────────────────
  async function fetchSomerville() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Somerville MA: fetching bids…');
    try {
      const html = await fetchViaProxy('https://www.somervillema.gov/departments/finance/procurement-and-contracting-services');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Open bids table: col 0 = bid number, col 1 = title link, last col = due date
      const rows = doc.querySelectorAll('table tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) continue;
        const titleLink = cells[1]?.querySelector('a');
        if (!titleLink) continue;
        const title = titleLink.textContent.replace(/\s+/g,' ').trim();
        if (!title || !isRelevant(title)) continue;
        const href = titleLink.getAttribute('href') || '';
        const link = href.startsWith('http') ? href : `https://www.somervillema.gov${href}`;
        const bidNum = cells[0]?.textContent.trim() || '';
        const idKey = bidNum || link;
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
        const lastCell = cells[cells.length - 1];
        allOpps.push({
          id: `somerville-${idKey.replace(/\W+/g,'-')}`,
          source: 'Somerville MA', title,
          agency: 'City of Somerville',
          deadline: lastCell?.textContent.trim() || '',
          link, description: '',
          type: /rfp/i.test(bidNum) ? 'RFP' : /rfq/i.test(bidNum) ? 'RFQ' : 'Bid',
        });
      }
    } catch(e) { console.warn('Somerville fetch failed:', e.message); }
    return allOpps;
  }

  // ── Providence RI ─────────────────────────────────────────────────────────────
  async function fetchProvidence() {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg('Providence RI: fetching bids…');
    try {
      const html = await fetchViaProxy('https://www.providenceri.gov/purchasing/openrfpsummary/');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Each open bid is a link to a PDF or bid page
      const links = doc.querySelectorAll('a[href]');
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        // Only actual bid content — PDFs in wp-content or purchasing sub-pages
        if (!href.includes('wp-content/uploads') && !href.includes('/purchasing/')) continue;
        const title = a.textContent.replace(/\s+/g,' ').trim();
        if (!title || title.length < 10) continue;
        // Skip addenda entries
        if (/addend(um|a)\s*\d/i.test(title)) continue;
        if (!isRelevant(title)) continue;
        const url = href.startsWith('http') ? href : `https://www.providenceri.gov${href}`;
        const bidNum = url.match(/PVD[\d-]+/)?.[0] || '';
        const idKey = bidNum || title.substring(0,40);
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
        allOpps.push({
          id: `providence-${idKey.replace(/\W+/g,'-')}`,
          source: 'Providence RI', title,
          agency: 'City of Providence',
          deadline: '',
          link: url, description: '',
          type: /rfp|request for proposal/i.test(title) ? 'RFP' : /rfq|qualifications/i.test(title) ? 'RFQ' : 'Bid',
        });
      }
    } catch(e) { console.warn('Providence fetch failed:', e.message); }
    return allOpps;
  }

  // ── CivicEngage towns ─────────────────────────────────────────────────────────
  async function fetchCivicEngage(townName, baseUrl, agency) {
    const allOpps = [];
    const seenIds = new Set();
    setLoadingMsg(`${townName}: fetching bids…`);
    try {
      const html = await fetchViaProxy(baseUrl);
      const origin = new URL(baseUrl).origin;
      // CivicEngage: <div class="listItemsRow bid"> contains bidTitle link
      const bidBlocks = html.split(/class="listItemsRow bid/i);
      for (let i = 1; i < bidBlocks.length; i++) {
        const block = bidBlocks[i];
        // Skip closed/awarded
        if (/bidStatusClosed|Closed|Awarded|Cancelled/i.test(block.substring(0,400))) continue;
        // Title + direct link to individual bid
        const linkMatch = block.match(/href="([^"]*(?:bids?\.aspx\?bidID=\d+|BidID=\d+)[^"]*)"/i);
        const titleMatch = block.match(/class="bidTitle[^"]*"[^>]*>\s*(?:<[^>]+>)*([^<]{5,200})/i)
                        || block.match(/<a[^>]+bidID=\d+[^>]*>([^<]{5,200})<\/a>/i);
        if (!linkMatch || !titleMatch) continue;
        const title = titleMatch[1].replace(/&amp;/g,'&').replace(/&#\d+;/g,'').replace(/\s+/g,' ').trim();
        if (!title || !isRelevant(title)) continue;
        const href = linkMatch[1];
        const link = href.startsWith('http') ? href : `${origin}/${href.replace(/^\//, '')}`;
        const idKey = link;
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
        const dateMatch = block.match(/(?:Clos|Due)[^:]*:\s*([A-Za-z]+ \d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
        const descMatch = block.match(/class="bidDescription[^"]*"[^>]*>([^<]{10,300})/i);
        allOpps.push({
          id: `${townName.toLowerCase().replace(/\s+/g,'-')}-${idKey.replace(/\W+/g,'-').substring(0,30)}`,
          source: townName, title, agency,
          deadline: dateMatch ? dateMatch[1] : '',
          link,
          description: descMatch ? descMatch[1].replace(/&amp;/g,'&').trim() : '',
          type: /rfp|proposal/i.test(title) ? 'RFP' : /rfq|qualifications/i.test(title) ? 'RFQ' : 'Bid',
        });
      }
    } catch(e) { console.warn(`${townName} fetch failed:`, e.message); }
    return allOpps;
  }

  // ── Add manual entry ──────────────────────────────────────────────────────────
  function addManual() {
    if (!manualForm.title.trim()) return;
    setResults(prev => [{
      id: `manual-${Date.now()}`,
      source: 'Manual',
      title: manualForm.title.trim(),
      agency: manualForm.agency.trim() || 'Manual entry',
      deadline: manualForm.deadline.trim(),
      link: manualForm.link.trim(),
      description: manualForm.notes.trim(),
      type: 'Manual',
    }, ...prev]);
    setManualForm({ title: '', agency: '', deadline: '', link: '', notes: '' });
    setShowAddManual(false);
  }

  // ── Run search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const civicEngageTowns = [
      ['Falmouth MA',    'https://www.falmouthma.gov/Bids.aspx',         'Town of Falmouth'],
      ['Chatham MA',     'https://www.chatham-ma.gov/Bids.aspx',          'Town of Chatham'],
      ['Lexington MA',   'https://www.lexingtonma.gov/Bids.aspx',         'Town of Lexington'],
      ['Concord MA',     'https://www.concordma.gov/Bids.aspx',           'Town of Concord'],
      ['Needham MA',     'https://www.needhamma.gov/Bids.aspx',           'Town of Needham'],
      ['Gloucester MA',  'https://www.gloucester-ma.gov/Bids.aspx',       'City of Gloucester'],
      ['Salem MA',       'https://www.salemma.gov/Bids.aspx',             'City of Salem'],
      ['Newburyport MA', 'https://www.cityofnewburyport.com/Bids.aspx',   'City of Newburyport'],
      ['Marblehead MA',  'https://www.marblehead.org/Bids.aspx',          'Town of Marblehead'],
      ['Hingham MA',     'https://www.hingham-ma.gov/Bids.aspx',          'Town of Hingham'],
      ['Cohasset MA',    'https://www.cohassetma.org/Bids.aspx',          'Town of Cohasset'],
      ['Duxbury MA',     'https://www.town.duxbury.ma.us/Bids.aspx',      'Town of Duxbury'],
      ['Scituate MA',    'https://www.scituatema.gov/Bids.aspx',          'Town of Scituate'],
    ];

    try {
      setLoadingMsg('Searching all sources in parallel…');
      const [
        samResults,
        bostonResults,
        watertownResults,
        portsmouthResults,
        somervilleResults,
        providenceResults,
        ...civicArrays
      ] = await Promise.all([
        apiKey ? fetchSAM(apiKey) : Promise.resolve([]),
        fetchBoston(),
        fetchWatertown(),
        fetchPortsmouth(),
        fetchSomerville(),
        fetchProvidence(),
        ...civicEngageTowns.map(([name, url, agency]) => fetchCivicEngage(name, url, agency)),
      ]);

      const incoming = [
        ...samResults,
        ...bostonResults,
        ...watertownResults,
        ...portsmouthResults,
        ...somervilleResults,
        ...providenceResults,
        ...civicArrays.flat(),
      ];

      // Merge — keep manual entries, preserve notes, don't duplicate
      setResults(prev => {
        const manuals = prev.filter(r => r.source === 'Manual');
        const existingIds = new Set(prev.map(r => r.id));
        const fresh = incoming.filter(r => !existingIds.has(r.id));
        // Update existing non-manuals in place
        const updated = prev
          .filter(r => r.source !== 'Manual')
          .map(r => {
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

  // ── Filtering & sorting ───────────────────────────────────────────────────────
  const sources = ['All', ...new Set(results.map(r => r.source))].sort((a,b) => a === 'All' ? -1 : a.localeCompare(b));

  const filtered = results
    .filter(r => sourceFilter === 'All' || r.source === sourceFilter)
    .sort((a, b) => {
      if (sortBy === 'deadline') {
        const da = a.deadline || 'zzzz';
        const db = b.deadline || 'zzzz';
        return da.localeCompare(db);
      }
      if (sortBy === 'source') return a.source.localeCompare(b.source);
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return 0;
    });

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Poppins','Helvetica Neue',Arial,sans-serif", background: BRAND.bg, minHeight: '100vh', color: BRAND.text }}>

      {/* ── Header ── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BRAND.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: BRAND.primary, fontSize: 13, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            LeBlanc Jones Landscape Architects
          </div>
          <div style={{ color: BRAND.text, fontSize: 20, fontWeight: 700, marginTop: 2, letterSpacing: -0.3 }}>
            Public Work Pipeline
          </div>
          <div style={{ color: BRAND.muted, fontSize: 11, marginTop: 3 }}>
            Boston · Somerville · Watertown · Portsmouth · Providence · 13 CivicEngage towns · SAM.gov
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowApiKey(v => !v)}
            style={{ background: 'transparent', border: `1px solid ${BRAND.border}`, color: BRAND.secondary, padding: '6px 14px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
            ⚙ SAM API Key
          </button>
          <button onClick={() => setShowAddManual(v => !v)}
            style={{ background: 'transparent', border: `1px solid ${BRAND.border}`, color: BRAND.secondary, padding: '6px 14px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
            + Add Manual
          </button>
          <button onClick={runSearch} disabled={loading}
            style={{ background: loading ? BRAND.muted : BRAND.primary, border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 3, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
            {loading ? '⟳ Searching…' : '⟳ Search All Sources'}
          </button>
        </div>
      </div>

      {/* ── API Key panel ── */}
      {showApiKey && (
        <div style={{ background: '#fff', borderBottom: `1px solid ${BRAND.border}`, padding: '10px 32px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: BRAND.muted }}>SAM.gov API Key:</span>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="SAM-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ flex: 1, maxWidth: 400, padding: '5px 10px', border: `1px solid ${BRAND.border}`, borderRadius: 3, fontSize: 12 }} />
          <button onClick={() => setShowApiKey(false)}
            style={{ background: BRAND.primary, color: '#fff', border: 'none', padding: '5px 14px', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}>Save</button>
        </div>
      )}

      {/* ── Add Manual panel ── */}
      {showAddManual && (
        <div style={{ background: '#fff', borderBottom: `1px solid ${BRAND.border}`, padding: '16px 32px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: BRAND.primary }}>Add Manual Entry</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['Title *','title','flex:2;min-width:260px'],['Agency','agency','flex:1;min-width:160px'],['Due Date','deadline','width:120px'],['Link (URL)','link','flex:1;min-width:200px']].map(([ph,field,style]) => (
              <input key={field} placeholder={ph} value={manualForm[field]} onChange={e => setManualForm(f => ({...f, [field]: e.target.value}))}
                style={{ ...Object.fromEntries(style.split(';').map(s => { const [k,v]=s.split(':'); return [k.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()), v?.trim()]; }).filter(([k,v])=>k&&v)), padding: '6px 10px', border: `1px solid ${BRAND.border}`, borderRadius: 3, fontSize: 12 }} />
            ))}
            <button onClick={addManual} style={{ background: BRAND.primary, color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}>Add</button>
          </div>
        </div>
      )}

      {/* ── Loading bar ── */}
      {loading && (
        <div style={{ background: BRAND.primary, color: '#fff', padding: '6px 32px', fontSize: 11 }}>{loadingMsg}</div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ background: '#fff3f3', borderLeft: `3px solid #c44`, padding: '10px 32px', fontSize: 12, color: '#c44' }}>⚠ {error}</div>
      )}

      {/* ── Stats + filter bar ── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BRAND.border}`, padding: '10px 32px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>
          {filtered.length} bid{filtered.length !== 1 ? 's' : ''} {results.length !== filtered.length ? `(of ${results.length} total)` : ''}
        </span>
        {lastSearched && (
          <span style={{ fontSize: 11, color: BRAND.muted }}>
            Last searched: {new Date(lastSearched).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            style={{ padding: '5px 10px', border: `1px solid ${BRAND.border}`, borderRadius: 3, fontSize: 12, background: '#fff' }}>
            {sources.map(s => <option key={s} value={s}>{s === 'All' ? 'All Sources' : s}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '5px 10px', border: `1px solid ${BRAND.border}`, borderRadius: 3, fontSize: 12, background: '#fff' }}>
            <option value="deadline">Sort: Due Date</option>
            <option value="source">Sort: Source</option>
            <option value="title">Sort: Title</option>
          </select>
          {results.length > 0 && (
            <button onClick={() => setResults(r => r.filter(x => x.source === 'Manual'))}
              style={{ background: 'transparent', border: `1px solid ${BRAND.border}`, color: BRAND.muted, padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
              Clear Results
            </button>
          )}
        </div>
      </div>

      {/* ── Bid list ── */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>
        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: BRAND.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No bids yet</div>
            <div style={{ fontSize: 12 }}>Click "Search All Sources" to pull current LA design service bids.</div>
          </div>
        )}

        {filtered.map(opp => {
          const isExpanded = expandedId === opp.id;
          const typeColor = opp.type === 'RFP' ? '#1A5CA8' : opp.type === 'RFQ' ? '#3C75BF' : BRAND.muted;
          return (
            <div key={opp.id}
              style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>

              {/* ── Card row ── */}
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer' }}
                onClick={() => setExpandedId(isExpanded ? null : opp.id)}>

                {/* Type badge */}
                <div style={{ minWidth: 36, paddingTop: 2 }}>
                  <span style={{ background: `${typeColor}18`, color: typeColor, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 2, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {opp.type || 'BID'}
                  </span>
                </div>

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title — clickable link */}
                  {opp.link ? (
                    <a href={opp.link} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ color: BRAND.primary, fontWeight: 600, fontSize: 14, textDecoration: 'none', lineHeight: 1.4 }}
                      onMouseOver={e => e.target.style.textDecoration='underline'}
                      onMouseOut={e => e.target.style.textDecoration='none'}>
                      {opp.title}
                    </a>
                  ) : (
                    <span style={{ color: BRAND.text, fontWeight: 600, fontSize: 14 }}>{opp.title}</span>
                  )}

                  {/* Meta row */}
                  <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: BRAND.secondary, fontWeight: 500 }}>
                      {opp.agency || opp.source}
                    </span>
                    {opp.source !== opp.agency && (
                      <span style={{ fontSize: 11, color: BRAND.muted }}>{opp.source}</span>
                    )}
                    {opp.deadline && (
                      <span style={{ fontSize: 11, color: BRAND.muted }}>
                        Due: <strong style={{ color: BRAND.secondary }}>{opp.deadline}</strong>
                      </span>
                    )}
                  </div>

                  {/* Description — if available */}
                  {opp.description && (
                    <p style={{ fontSize: 11, color: BRAND.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
                      {opp.description.substring(0, 180)}{opp.description.length > 180 ? '…' : ''}
                    </p>
                  )}
                </div>

                {/* Expand chevron */}
                <div style={{ color: BRAND.muted, fontSize: 11, paddingTop: 3 }}>{isExpanded ? '▲' : '▼'}</div>
              </div>

              {/* ── Expanded panel ── */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${BRAND.border}`, padding: '12px 20px 14px', background: BRAND.bg }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    {opp.link && (
                      <a href={opp.link} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: '#fff', background: BRAND.primary, padding: '5px 14px', borderRadius: 3, textDecoration: 'none', fontWeight: 600 }}>
                        Open Bid ↗
                      </a>
                    )}
                    <button onClick={() => { setResults(prev => prev.filter(r => r.id !== opp.id)); setExpandedId(null); }}
                      style={{ fontSize: 11, color: '#c44', background: 'transparent', border: `1px solid #e8b`, padding: '5px 12px', borderRadius: 3, cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                  {opp.description && (
                    <p style={{ fontSize: 12, color: BRAND.secondary, lineHeight: 1.6, margin: 0 }}>{opp.description}</p>
                  )}
                  {opp.bid_number && (
                    <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 6 }}>Bid #: {opp.bid_number}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '20px 32px', color: BRAND.muted, fontSize: 10, borderTop: `1px solid ${BRAND.border}`, textAlign: 'center', background: '#fff', marginTop: 16 }}>
        LJLA Public Work Pipeline v13 · Filter: landscape architecture &amp; design services · Sources: Boston · Somerville · Watertown · Portsmouth · Providence · 13 CivicEngage towns · SAM.gov
      </div>
    </div>
  );
}
