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

// ─── CTSOURCE SEARCH TERMS ────────────────────────────────────────────────────
const CTSOURCE_KEYWORDS = [
  'landscape architecture',
  'landscape design',
  'design services',
  'park design',
];

const STORAGE_KEY = 'ljla_v27';

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [results, setResults]             = useState([]);
  const [loading, setLoading]             = useState(false);
  const [loadingMsg, setLoadingMsg]       = useState('');
  const [error, setError]                 = useState(null);
  const [sourceFilter, setSourceFilter]   = useState('All');
  const [sortBy, setSortBy]               = useState('deadline');
  const [lastSearched, setLastSearched]   = useState(null);
  const [expandedId, setExpandedId]       = useState(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualForm, setManualForm]       = useState({ title:'', agency:'', deadline:'', link:'', notes:'' });
  const [searchScope, setSearchScope]     = useState('all');
  const [showScopeMenu, setShowScopeMenu] = useState(false);

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { results:r, lastSearched:ls } = JSON.parse(saved);
        if (r) setResults(r);
        if (ls) setLastSearched(ls);
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ results, lastSearched })); }
    catch(e) {}
  }, [results, lastSearched]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  async function fetchViaProxy(url) {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    return res.text();
  }

  function makeId(prefix, str) {
    return `${prefix}-${(str||'').replace(/\W+/g,'-').substring(0,35).replace(/-$/,'')}`;
  }

  // ── CTSource (CT statewide) — WebProcure JSON API ────────────────────────────
  // CT DAS Bid Board is powered by WebProcure (Proactis). The JSON API is public.
  // customerid=51 = State of Connecticut. Returns 10 per page; hits = total count.
  // Bid link: https://webprocure.proactiscloud.com/wp-web-public/en/#/bidboard/bid/{bidid}?customerid=51
  async function fetchCTSource() {
    const allOpps = [];
    const seenIds = new Set();
    for (const kw of CTSOURCE_KEYWORDS) {
      setLoadingMsg(`CTSource — "${kw}"…`);
      try {
        const apiUrl = `https://webprocure.proactiscloud.com/wp-full-text-search/search/sols?customerid=51&q=${encodeURIComponent(kw)}&from=0&sort=r&f=&oids=`;
        const text = await fetchViaProxy(apiUrl);
        const data = JSON.parse(text);
        const records = data.records || [];
        console.log(`CTSource "${kw}": ${records.length} of ${data.hits} results`);
        for (const r of records) {
          if (seenIds.has(r.bidid)) continue;
          // Skip closed/awarded
          const status = r.ctBidstatus?.publicStatus || r.ctBidstatus?.name || '';
          if (/awarded|cancel|retract|closed/i.test(status)) continue;
          const title = r.title || '';
          const desc = r.description || '';
          if (!isRelevant(title, desc)) continue;
          seenIds.add(r.bidid);
          const agency = r.creatorOrg?.name || r.ownerOrg?.name || 'CT State';
          const deadline = r.prtcpEndDate ? new Date(r.prtcpEndDate).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
          const link = `https://webprocure.proactiscloud.com/wp-web-public/en/#/bidboard/bid/${r.bidid}?customerid=51`;
          const type = /rfp|proposal/i.test(r.orgBidClassType?.description || '') ? 'RFP' : /rfq|qualif/i.test(r.orgBidClassType?.description || '') ? 'RFQ' : 'Bid';
          allOpps.push({
            id: `ctsource-${r.bidid}`,
            source: 'CTSource',
            title, agency, deadline, link,
            description: desc.substring(0, 200),
            bid_number: r.bidNumber || '',
            type,
          });
        }
      } catch(e) { console.warn(`CTSource "${kw}" error:`, e.message); }
    }
    console.log(`CTSource total: ${allOpps.length}`);
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

  // ── COMMBUYS (MA statewide) — via server-side PDF parser ──────────────────────
  // The mass.gov "New Bids Available" PDF is updated regularly and contains all
  // recent COMMBUYS postings with bid numbers and descriptions. Our server parses it
  // and filters for landscape/park/design keywords server-side.
  async function fetchCOMMBUYS() {
    const allOpps = [];
    setLoadingMsg('COMMBUYS — parsing new bids PDF…');
    try {
      const data = await fetch('/api/commbuys-pdf').then(r => r.json());
      if (data.error) throw new Error(data.error);
      console.log(`COMMBUYS PDF: ${data.count} relevant bids from ${data.pages} pages`);
      for (const { bidNum, desc, link, org, date } of (data.bids || [])) {
        allOpps.push({
          id: `commbuys-${bidNum.replace(/\W+/g,'-')}`,
          source: 'COMMBUYS',
          title: desc || bidNum,
          agency: org || 'MA Agency',
          deadline: date || '',
          link,
          description: '',
          bid_number: bidNum,
          type: /rfp|request for proposal/i.test(desc) ? 'RFP' : /rfq/i.test(desc) ? 'RFQ' : 'Bid',
        });
      }
    } catch(e) { console.warn('COMMBUYS PDF error:', e.message); }
    return allOpps;
  }

  // ── OpenGov generic fetcher ────────────────────────────────────────────────────
  // Many NE cities use OpenGov procurement. The API returns JSON with open projects.
  async function fetchOpenGov(cityName, subdomain, agencyName) {
    const allOpps = [];
    setLoadingMsg(`${cityName}…`);
    try {
      // Try the public JSON API first
      const apiUrl = `https://procurement.opengov.com/api/procurements/v2/public/projects?status=published&subdomain=${subdomain}&limit=50`;
      const text = await fetchViaProxy(apiUrl);
      let projects = [];
      try {
        const data = JSON.parse(text);
        projects = data.projects || data.data || data.results || data.items || [];
      } catch {
        // API didn't return JSON — fall back to HTML scrape of the embed portal
        const htmlUrl = `https://procurement.opengov.com/portal/${subdomain}`;
        const html = await fetchViaProxy(htmlUrl);
        // OpenGov renders via React so HTML scrape rarely works — just return empty
        console.warn(`${cityName} OpenGov: API returned non-JSON, HTML fallback unlikely to work`);
        return allOpps;
      }
      console.log(`${cityName} OpenGov: ${projects.length} open projects`);
      for (const p of projects) {
        const title = p.name || p.title || p.subject || '';
        const desc = p.description || p.summary || p.detail || '';
        if (!isRelevant(title, desc)) continue;
        const id = `opengov-${subdomain}-${p.id || p.uuid || title.substring(0,20)}`;
        const link = `https://procurement.opengov.com/portal/${subdomain}/projects/${p.id || ''}`;
        const deadline = p.close_date || p.due_date || p.closes_at || p.deadline || '';
        allOpps.push({
          id, source: cityName, title,
          agency: agencyName,
          deadline: deadline ? deadline.split('T')[0] : '',
          link, description: desc.substring(0,200),
          type: /rfp|proposal/i.test(title) ? 'RFP' : /rfq|qualifications/i.test(title) ? 'RFQ' : 'Bid',
        });
      }
    } catch(e) { console.warn(`${cityName} OpenGov error:`, e.message); }
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

  // ── CivicEngage / CivicPlus generic (Bids.aspx) ───────────────────────────────
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

  // ── Town lists ─────────────────────────────────────────────────────────────────

  // CivicPlus (Bids.aspx) towns — scraped with fetchCivicEngage
  const civicEngageTowns = [
    // MA — established
    ['Falmouth MA',       'https://www.falmouthma.gov/Bids.aspx',              'Town of Falmouth'],
    ['Chatham MA',        'https://www.chatham-ma.gov/Bids.aspx',              'Town of Chatham'],
    ['Lexington MA',      'https://www.lexingtonma.gov/Bids.aspx',             'Town of Lexington'],
    ['Concord MA',        'https://www.concordma.gov/Bids.aspx',               'Town of Concord'],
    ['Needham MA',        'https://www.needhamma.gov/Bids.aspx',               'Town of Needham'],
    ['Gloucester MA',     'https://www.gloucester-ma.gov/Bids.aspx',           'City of Gloucester'],
    ['Salem MA',          'https://www.salemma.gov/Bids.aspx',                 'City of Salem'],
    ['Newburyport MA',    'https://www.cityofnewburyport.com/Bids.aspx',       'City of Newburyport'],
    ['Marblehead MA',     'https://www.marblehead.org/Bids.aspx',              'Town of Marblehead'],
    ['Hingham MA',        'https://www.hingham-ma.gov/Bids.aspx',              'Town of Hingham'],
    ['Cohasset MA',       'https://www.cohassetma.org/Bids.aspx',              'Town of Cohasset'],
    ['Duxbury MA',        'https://www.town.duxbury.ma.us/Bids.aspx',          'Town of Duxbury'],
    ['Scituate MA',       'https://www.scituatema.gov/Bids.aspx',              'Town of Scituate'],
    ['Brookline MA',      'https://www.brooklinema.gov/Bids.aspx',             'Town of Brookline'],
    ['Belmont MA',        'https://www.belmont-ma.gov/bids.aspx',              'Town of Belmont'],
    ['Milton MA',         'https://www.miltonma.gov/bids.aspx',                'Town of Milton'],
    ['Wellesley MA',      'https://www.wellesleyma.gov/Bids.aspx',             'Town of Wellesley'],
    ['Weston MA',         'https://www.weston.org/bids.aspx',                  'Town of Weston'],
    ['Beverly MA',        'https://www.beverlyma.gov/Bids.aspx',               'City of Beverly'],
    ['Ipswich MA',        'https://www.ipswichma.gov/Bids.aspx',               'Town of Ipswich'],
    ['Rockport MA',       'https://www.rockportma.gov/Bids.aspx',              'Town of Rockport'],
    ['Wenham MA',         'https://www.wenhamma.gov/bids.aspx',                'Town of Wenham'],
    ['Yarmouth MA',       'https://www.yarmouth.ma.us/Bids.aspx',              'Town of Yarmouth'],
    ['Orleans MA',        'https://www.town.orleans.ma.us/Bids.aspx',          'Town of Orleans'],
    ['Winchester MA',     'https://www.winchester-ma.gov/bids.aspx',           'Town of Winchester'],
    ['Hanover MA',        'https://www.hanover-ma.gov/bids.aspx',              'Town of Hanover'],
    ['Norwell MA',        'https://www.norwell.ma.us/bids.aspx',               'Town of Norwell'],
    // MA — new
    ['Lowell MA',         'https://www.lowellma.gov/Bids.aspx',                'City of Lowell'],
    ['Chelmsford MA',     'https://www.chelmsfordma.gov/Bids.aspx',            'Town of Chelmsford'],
    ['Tewksbury MA',      'https://www.tewksbury-ma.gov/Bids.aspx',            'Town of Tewksbury'],
    // CT
    ['Madison CT',        'https://www.madisonct.org/bids.aspx',               'Town of Madison CT'],
    ['Norwalk CT',        'https://www.norwalkct.gov/bids.aspx',               'City of Norwalk CT'],
    ['Danbury CT',        'https://www.danbury-ct.gov/Bids.aspx',              'City of Danbury CT'],
    ['Enfield CT',        'https://www.enfield-ct.gov/Bids.aspx',              'Town of Enfield CT'],
    ['Granby CT',         'https://www.granby-ct.gov/Bids.aspx',               'Town of Granby CT'],
    ['Wolcott CT',        'https://www.wolcottct.org/Bids.aspx',               'Town of Wolcott CT'],
    // NH
    ['Concord NH',        'https://www.concordnh.gov/Bids.aspx',               'City of Concord NH'],
    ['Rochester NH',      'https://www.rochesternh.gov/bids',                  'City of Rochester NH'],
    // VT
    ['Burlington VT',     'https://www.burlingtonvt.gov/Bids.aspx',            'City of Burlington VT'],
    ['South Burlington VT','https://www.southburlingtonvt.gov/bids.aspx',      'City of South Burlington VT'],
    ['Montpelier VT',     'https://www.montpelier-vt.org/Bids.aspx',           'City of Montpelier VT'],
    // ME
    ['Lewiston ME',       'https://www.ci.lewiston.me.us/Bids.aspx',           'City of Lewiston ME'],
    ['Bangor ME',         'https://www.bangormaine.gov/Bids.aspx',             'City of Bangor ME'],
    ['South Portland ME', 'https://www.southportland.gov/Bids.aspx',           'City of South Portland ME'],
  ];

  // OpenGov cities — fetched via fetchOpenGov API
  const openGovCities = [
    ['Cambridge MA',  'cambridgema',        'City of Cambridge MA'],
    ['Fall River MA', 'fallriverma',        'City of Fall River MA'],
    ['New Haven CT',  'newhavenct',         'City of New Haven CT'],
    ['Bridgeport CT', 'bridgeportct',       'City of Bridgeport CT'],
    ['Portsmouth NH', 'cityofportsmouth',   'City of Portsmouth NH'],
  ];

  // ── Merge incoming results into state ──────────────────────────────────────
  function mergeResults(incoming) {
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
  }

  const runSearch = useCallback(async (scope) => {
    const activeScope = scope || searchScope;
    setLoading(true);
    setError(null);
    setShowScopeMenu(false);

    try {
      // ── Single-source searches ──────────────────────────────────────────────
      if (activeScope === 'commbuys') {
        mergeResults(await fetchCOMMBUYS());

      } else if (activeScope === 'ctsource') {
        mergeResults(await fetchCTSource());

      } else if (activeScope === 'boston') {
        mergeResults(await fetchBoston());

      } else if (activeScope === 'somerville') {
        mergeResults(await fetchSomerville());

      } else if (activeScope === 'watertown') {
        mergeResults(await fetchWatertown());

      } else if (activeScope === 'portsmouth') {
        mergeResults(await fetchOpenGov('Portsmouth NH', 'cityofportsmouth', 'City of Portsmouth NH'));

      } else if (activeScope === 'providence') {
        mergeResults(await fetchProvidence());

      } else if (activeScope === 'nhdas') {
        mergeResults(await fetchNHDAS());

      } else if (activeScope === 'towns') {
        setLoadingMsg('Searching all CivicEngage towns…');
        const arrays = await Promise.all(
          civicEngageTowns.map(([name, url, agency]) => fetchCivicEngage(name, url, agency))
        );
        mergeResults(arrays.flat());

      } else if (activeScope === 'opengov') {
        setLoadingMsg('Searching OpenGov cities…');
        const arrays = await Promise.all(
          openGovCities.map(([name, sub, agency]) => fetchOpenGov(name, sub, agency))
        );
        mergeResults(arrays.flat());

      // ── Search All: COMMBUYS first, then CTSource, then everything in parallel ──
      } else {
        // Step 1: COMMBUYS via PDF (server-side)
        mergeResults(await fetchCOMMBUYS());

        // Step 2: CTSource (CT statewide) — high value, run solo
        mergeResults(await fetchCTSource());

        // Step 3: Everything else in parallel
        setLoadingMsg('Searching remaining sources…');
        const [
          bostonResults, watertownResults,
          somervilleResults, providenceResults, nhdasResults,
          ...restArrays
        ] = await Promise.all([
          fetchBoston(),
          fetchWatertown(),
          fetchSomerville(),
          fetchProvidence(),
          fetchNHDAS(),
          ...civicEngageTowns.map(([name, url, agency]) => fetchCivicEngage(name, url, agency)),
          ...openGovCities.map(([name, sub, agency]) => fetchOpenGov(name, sub, agency)),
        ]);

        mergeResults([
          ...bostonResults, ...watertownResults,
          ...somervilleResults, ...providenceResults, ...nhdasResults,
          ...restArrays.flat(),
        ]);
      }

      setLastSearched(new Date().toISOString());
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchScope]);

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

      {/* Top nav */}
      <div style={{ padding:'22px 48px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${BRAND.border}` }}>
        <div style={{ color:BRAND.primary, fontSize:14, fontWeight:400, letterSpacing:0.2 }}>
          LeBlanc Jones Landscape Architects
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => setShowAddManual(v=>!v)} style={btnGhost}>+ Add</button>

          {/* Split search button */}
          <div style={{ position:'relative', display:'flex' }}>
            <button
              disabled={loading}
              onClick={() => setShowScopeMenu(v => !v)}
              style={{ ...btnPrimary, background: loading ? BRAND.muted : BRAND.primary, cursor: loading ? 'not-allowed' : 'pointer', padding:'7px 10px', borderRight:'1px solid rgba(255,255,255,0.25)' }}
            >▾</button>
            <button
              disabled={loading}
              onClick={() => runSearch(searchScope)}
              style={{ ...btnPrimary, background: loading ? BRAND.muted : BRAND.primary, cursor: loading ? 'not-allowed' : 'pointer', borderLeft:'none' }}
            >
              {loading ? (loadingMsg || 'Searching…') : (
                searchScope === 'all'        ? 'Search All' :
                searchScope === 'commbuys'   ? 'Search COMMBUYS' :
                searchScope === 'ctsource'   ? 'Search CTSource' :
                searchScope === 'boston'     ? 'Search Boston' :
                searchScope === 'somerville' ? 'Search Somerville' :
                searchScope === 'watertown'  ? 'Search Watertown' :
                searchScope === 'portsmouth' ? 'Search Portsmouth' :
                searchScope === 'providence' ? 'Search Providence' :
                searchScope === 'nhdas'      ? 'Search NH State' :
                searchScope === 'opengov'    ? 'Search OpenGov Cities' :
                searchScope === 'towns'      ? 'Search Towns' : 'Search'
              )}
            </button>
            {showScopeMenu && !loading && (
              <div style={{ position:'absolute', top:'100%', right:0, zIndex:100, background:'#fff', border:`1px solid ${BRAND.border}`, boxShadow:'0 4px 16px rgba(0,0,0,0.1)', minWidth:220, marginTop:4 }}>
                {[
                  ['all',        'Search All Sources'],
                  ['commbuys',   'COMMBUYS (MA statewide)'],
                  ['ctsource',   'CTSource (CT statewide)'],
                  ['boston',     'City of Boston'],
                  ['somerville', 'Somerville MA'],
                  ['watertown',  'Watertown MA'],
                  ['portsmouth', 'Portsmouth NH'],
                  ['providence', 'Providence RI'],
                  ['nhdas',      'NH State Procurement'],
                  ['opengov',    'OpenGov Cities'],
                  ['towns',      'All Towns'],
                ].map(([key, label]) => (
                  <div
                    key={key}
                    onClick={() => { setSearchScope(key); setShowScopeMenu(false); }}
                    style={{ padding:'10px 16px', fontSize:12, cursor:'pointer', fontWeight: searchScope===key ? 600 : 400, color: searchScope===key ? BRAND.primary : BRAND.text, background: searchScope===key ? BRAND.bg : '#fff', borderBottom:`1px solid ${BRAND.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = BRAND.bg}
                    onMouseLeave={e => e.currentTarget.style.background = searchScope===key ? BRAND.bg : '#fff'}
                  >{label}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Title row */}
      <div style={{ padding:'32px 48px 0' }}>
        <div style={{ fontSize:11, color:BRAND.muted, letterSpacing:1.5, textTransform:'uppercase', marginBottom:6 }}>Public Work</div>
        <div style={{ fontSize:28, fontWeight:300, color:BRAND.text, letterSpacing:-0.5, lineHeight:1.2 }}>Opportunity Pipeline</div>
      </div>

      {/* Panels */}

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

      {/* Opportunity list */}
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
              <div style={{ borderTop: idx === 0 ? `1px solid ${BRAND.border}` : 'none' }} />
              <div style={{ borderTop:`1px solid ${BRAND.border}`, padding:'18px 0', cursor:'pointer' }}
                onClick={() => setExpandedId(isExpanded ? null : opp.id)}>

                <div style={{ display:'flex', alignItems:'flex-start', gap:20 }}>

                  <div style={{ minWidth:44, paddingTop:2 }}>
                    <span style={{ fontSize:9, color:typeColor, fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>
                      {opp.type || 'Bid'}
                    </span>
                  </div>

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

                  <div style={{ fontSize:10, color:BRAND.muted, paddingTop:4, userSelect:'none' }}>
                    {isExpanded ? '−' : '+'}
                  </div>
                </div>

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
        <span style={{ fontSize:10, color:BRAND.muted }}>LeBlanc Jones Landscape Architects · Public Work Pipeline v27</span>
        <span style={{ fontSize:10, color:BRAND.muted }}>44 towns · Boston · COMMBUYS · CTSource · OpenGov cities · NH · Providence</span>
      </div>
    </div>
  );
}
