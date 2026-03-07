// Poppins font loaded via index.html or inline
import React, { useState, useEffect, useCallback } from 'react';

// ─── LJLA BRAND COLORS ────────────────────────────────────────────────────────
const BRAND = {
  primary: '#3C75BF',    // LJLA blue — from logo/nav text on leblancjones.com
  secondary: '#575759',  // Body text grey from site
  accent: '#3C75BF',     // Same blue for accents
  light: '#FFFFFF',      // White background
  text: '#1A1A1A',       // Near-black text
  muted: '#888888',      // Muted grey
  border: '#E8E8E8',     // Light border
  bg: '#F7F7F7',         // Off-white page bg
};
};

// ─── BD MAP: TARGET GEOGRAPHY BY SUBREGION ────────────────────────────────────
// Derived from leblanc_jones_bd_map_v1.xlsx — all 153 municipalities across 8 states
const GEO_SUBREGIONS = {
  'Boston Metro':        ['brookline','newton','boston','cambridge','wellesley','weston','dover','lincoln',
                          'concord','belmont','lexington','needham','carlisle','medfield','sherborn',
                          'sudbury','wayland','winchester'],
  'Cape Cod':            ['chatham','provincetown','truro','wellfleet','barnstable','brewster','dennis',
                          'eastham','falmouth','harwich','mashpee','orleans','sandwich','yarmouth'],
  'Islands':             ['edgartown','nantucket','aquinnah','west tisbury','oak bluffs','tisbury',
                          'chilmark','gosnold'],
  'North Shore MA':      ['manchester','beverly','gloucester','ipswich','marblehead','rockport','essex',
                          'hamilton','nahant','newburyport','rowley','swampscott','wenham'],
  'South Shore MA':      ['cohasset','hingham','duxbury','scituate','milton','hanover','marshfield','norwell'],
  'Maine Coast':         ['cape elizabeth','kennebunkport','portland','falmouth','rockport','yarmouth',
                          'biddeford','boothbay harbor','camden','cumberland','freeport','kennebunk',
                          'kittery','ogunquit','saco','scarborough','wells','york','bar harbor','mount desert'],
  'NH Coast/Lakes':      ['portsmouth','new castle','rye','exeter','hampton falls','hanover','meredith',
                          'moultonborough','new london','wolfeboro'],
  'Rhode Island Coast':  ['newport','middletown','jamestown','barrington','bristol','little compton',
                          'narragansett','south kingstown','tiverton','westerly'],
  'CT Gold Coast':       ['greenwich','westport','darien','new canaan','stamford','norwalk','weston',
                          'easton','fairfield','ridgefield','wilton'],
  'Long Island/East End':['east hampton','southampton','huntington','north hempstead','oyster bay',
                          'shelter island'],
  'Westchester/Hudson':  ['bedford','pound ridge','greenburgh','lewisboro','mamaroneck','north salem','scarsdale'],
  'NJ Estate Belt':      ['bedminster','bernards','bernardsville','far hills','harding','mendham'],
  'NJ Shore':            ['rumson','sea girt','spring lake','bay head','colts neck','fair haven',
                          'little silver','mantoloking','middletown'],
  'PA Main Line/Bucks':  ['haverford','lower merion','radnor','solebury','tredyffrin','upper makefield',
                          'charlestown','east goshen','easttown','newtown','westtown','willistown'],
};

// Flatten for fast lookup: municipality → subregion
const MUNI_TO_SUBREGION = {};
Object.entries(GEO_SUBREGIONS).forEach(([subregion, munis]) => {
  munis.forEach(m => { MUNI_TO_SUBREGION[m] = subregion; });
});

// Geography score tiers (out of 25 pts)
const GEO_SCORES = {
  'Boston Metro':         25,
  'Cape Cod':             23,
  'Islands':              23,
  'North Shore MA':       22,
  'South Shore MA':       22,
  'CT Gold Coast':        20,
  'RI Coast':             20,
  'Rhode Island Coast':   20,
  'Maine Coast':          19,
  'NH Coast/Lakes':       18,
  'Long Island/East End': 17,
  'Westchester/Hudson':   16,
  'NJ Estate Belt':       15,
  'NJ Shore':             14,
  'PA Main Line/Bucks':   13,
};

// State-level fallback scores
const STATE_GEO_SCORES = {
  MA: 22, ME: 17, NH: 16, RI: 18, CT: 18, NY: 14, NJ: 13, PA: 11,
  VT: 10, VA: 7, DC: 8, MD: 7,
};

function getGeoScore(text) {
  const lower = text.toLowerCase();
  // Check specific municipalities first
  for (const [muni, subregion] of Object.entries(MUNI_TO_SUBREGION)) {
    if (lower.includes(muni)) {
      return { score: GEO_SCORES[subregion] || 15, label: `${subregion}` };
    }
  }
  // Check subregion names directly
  for (const [subregion, score] of Object.entries(GEO_SCORES)) {
    if (lower.includes(subregion.toLowerCase())) {
      return { score, label: subregion };
    }
  }
  // State fallback
  for (const [state, score] of Object.entries(STATE_GEO_SCORES)) {
    const patterns = [
      new RegExp(`\\b${state}\\b`),
      ...(['Massachusetts','Maine','New Hampshire','Rhode Island','Connecticut',
           'New York','New Jersey','Pennsylvania','Vermont','Virginia',
           'District of Columbia','Maryland'].filter((_,i) => 
             Object.keys(STATE_GEO_SCORES)[i] === state
           )),
    ];
    if (lower.match(new RegExp(`\\b${state}\\b`, 'i'))) {
      return { score, label: state };
    }
  }
  // Full state names
  const stateNameMap = {
    'massachusetts': 22, 'maine': 17, 'new hampshire': 16, 'rhode island': 18,
    'connecticut': 18, 'new york': 14, 'new jersey': 13, 'pennsylvania': 11,
    'vermont': 10, 'virginia': 7, 'maryland': 7,
  };
  for (const [name, score] of Object.entries(stateNameMap)) {
    if (lower.includes(name)) return { score, label: name };
  }
  return { score: 3, label: 'Out of region' };
}

// ─── LJLA VISION-ALIGNED SCORING ──────────────────────────────────────────────
// Reflects: planting sophistication, spatial composition, durable beauty, human experience

// DESIGN QUALITY KEYWORDS — highest value (35 pts max)
const DESIGN_KEYWORDS = {
  // Core LA design vocabulary — what LJLA is known for
  high: [
    'landscape architecture','landscape architect','planting design','plant palette',
    'horticultural','botanical','ecological planting','native planting','planting strategy',
    'landscape design','garden design','designed landscape','landscape masterplan',
    'spatial composition','landscape framework','site design','site planning landscape',
  ],
  // Civic/public realm project types LJLA wants
  civic: [
    'waterfront park','waterfront promenade','promenade','waterfront landscape',
    'urban plaza','civic plaza','public square','plaza design',
    'park design','park master plan','parkland','greenway','green space design',
    'streetscape design','streetscape improvement','complete streets landscape',
    'institutional landscape','campus landscape','university landscape','museum landscape',
    'cultural landscape','historic landscape','restorative landscape',
  ],
  // Multifamily/developer — strong fit for LJLA
  multifamily: [
    'multifamily landscape','residential landscape','courtyard garden','amenity landscape',
    'rooftop garden','rooftop amenity','pool terrace','outdoor amenity','shared garden',
    'mixed use landscape','transit-oriented landscape','developer landscape',
  ],
  // Supporting keywords — relevant but less specific (still design-adjacent)
  supporting: [
    'open space','outdoor space','landscape improvement','landscape restoration',
    'pedestrian design','pedestrian realm','outdoor environment',
    'trail design','greenway design','community park','neighborhood park',
    'coastal landscape','resilient landscape','sustainable landscape',
    'green infrastructure','urban forestry','tree planting','bioretention',
    'rain garden','permeable','stormwater design',
  ],
};

// CITY PORTAL INTAKE FILTER — must match at least one to be ingested at all
// These are design/planning signals. Without one, the bid is construction/maintenance noise.
const CITY_PORTAL_REQUIRED = [
  'landscape architect','landscape architecture','landscape design','planting design',
  'site design','park design','plaza design','streetscape design','waterfront design',
  'open space design','greenway design','trail design','outdoor amenity',
  'park','plaza','waterfront','promenade','greenway','streetscape',
  'playground design','playground renovation','playfield','recreation design',
  'garden','grounds design','courtyard','outdoor space improvement',
  'pedestrian improvement','bike path','bikeway','multiuse path',
  'planning and design','design services','rfp','request for proposal','request for qualifications',
];
};

// NEGATIVE SIGNALS — discard entirely if title matches these
const NEGATIVE_KEYWORDS = [
  // Maintenance (not design)
  'maintenance','mowing','lawn care','grounds keeping','snow removal','plowing','salting','sanding',
  'janitorial','custodial','cleaning services','waste removal','trash','rubbish',
  'landscape maintenance','turf management','pest control',
  // Pure construction trades (no design component)
  'roofing','hvac','plumbing','electrical contractor','telecommunications','it services',
  'information technology','cybersecurity','software','hardware','network',
  'generator','elevator','boiler','mechanical','fire suppression',
  // Infrastructure/civil (not LA)
  'water main','sewer','drainage pipe','stormwater pipe','roadway construction',
  'paving','asphalt','concrete contractor','crack seal','pavement marking',
  'roadway mill','overlay','patch','sidewalk repair','curb','guardrail',
  // Unrelated services
  'audit','accounting','legal services','insurance','food service','catering',
  'printing','mailing','shuttle','transit','vehicle','truck','fuel',
  'medical','pharmaceutical','ammunition','weapons','military','defense',
  'real estate broker','property management','security guard','staffing',
];

function scoreOpportunity(opp) {
  const searchText = `${opp.title} ${opp.description || ''} ${opp.agency || ''}`.toLowerCase();
  let designScore = 0;
  let designMatches = [];

  // High-value design keywords (up to 35 pts)
  let highMatches = DESIGN_KEYWORDS.high.filter(k => searchText.includes(k));
  let civicMatches = DESIGN_KEYWORDS.civic.filter(k => searchText.includes(k));
  let multifamilyMatches = DESIGN_KEYWORDS.multifamily.filter(k => searchText.includes(k));
  let supportingMatches = DESIGN_KEYWORDS.supporting.filter(k => searchText.includes(k));

  if (highMatches.length > 0) {
    designScore += Math.min(35, 20 + highMatches.length * 5);
    designMatches.push(...highMatches.slice(0, 2));
  }
  if (civicMatches.length > 0) {
    designScore = Math.min(35, designScore + civicMatches.length * 6);
    designMatches.push(...civicMatches.slice(0, 2));
  }
  if (multifamilyMatches.length > 0) {
    designScore = Math.min(35, designScore + multifamilyMatches.length * 5);
    designMatches.push(...multifamilyMatches.slice(0, 1));
  }
  // Supporting keywords score even without a primary match
  if (supportingMatches.length > 0) {
    const bonus = supportingMatches.length * 4;
    designScore = Math.min(35, designScore + bonus);
    if (designMatches.length === 0) designMatches.push(...supportingMatches.slice(0, 2));
  }

  // Negative signals — significant penalty
  const negMatches = NEGATIVE_KEYWORDS.filter(k => searchText.includes(k));
  if (negMatches.length > 0) {
    designScore = Math.max(0, designScore - negMatches.length * 8);
  }

  // Geography score (up to 25 pts)
  // First check if source is a known city portal — use that city directly
  const SOURCE_CITY_GEO = {
    'City of Boston':   { score: 25, label: 'Boston Metro' },
    'Watertown MA':     { score: 25, label: 'Boston Metro' },
    'Somerville MA':    { score: 25, label: 'Boston Metro' },
    'Lexington MA':     { score: 25, label: 'Boston Metro' },
    'Concord MA':       { score: 25, label: 'Boston Metro' },
    'Needham MA':       { score: 25, label: 'Boston Metro' },
    'Falmouth MA':      { score: 22, label: 'Cape Cod' },
    'Chatham MA':       { score: 22, label: 'Cape Cod' },
    'Gloucester MA':    { score: 22, label: 'North Shore MA' },
    'Salem MA':         { score: 22, label: 'North Shore MA' },
    'Newburyport MA':   { score: 22, label: 'North Shore MA' },
    'Marblehead MA':    { score: 22, label: 'North Shore MA' },
    'Hingham MA':       { score: 22, label: 'South Shore MA' },
    'Cohasset MA':      { score: 22, label: 'South Shore MA' },
    'Duxbury MA':       { score: 22, label: 'South Shore MA' },
    'Scituate MA':      { score: 22, label: 'South Shore MA' },
    'Portsmouth NH':    { score: 18, label: 'NH Coast/Lakes' },
    'Providence RI':    { score: 18, label: 'RI Coast' },
  };
  const geo = SOURCE_CITY_GEO[opp.source] || getGeoScore(searchText);

  // Budget score (up to 20 pts)
  let budgetScore = 0;
  let budgetLabel = '';
  const amtStr = String(opp.award_amount || opp.estimated_value || '');
  const amtNum = parseFloat(amtStr.replace(/[^0-9.]/g, ''));
  if (amtNum >= 500000) { budgetScore = 20; budgetLabel = '$500K+'; }
  else if (amtNum >= 200000) { budgetScore = 14; budgetLabel = '$200K+'; }
  else if (amtNum >= 50000) { budgetScore = 7; budgetLabel = '$50K+'; }
  else if (amtNum > 0) { budgetScore = 3; budgetLabel = `$${Math.round(amtNum/1000)}K`; }
  // City portal bids without budget data — give base score
  else if (opp.source !== 'SAM.gov') { budgetScore = 7; budgetLabel = 'Est. public bid'; }

  // Solicitation type score (up to 20 pts)
  let typeScore = 0;
  const typeStr = (opp.type || opp.solicitation_type || opp.title || '').toLowerCase();
  const titleLower = (opp.title || '').toLowerCase();
  if (typeStr.includes('rfp') || titleLower.includes('rfp') || typeStr.includes('request for proposal')) typeScore = 20;
  else if (typeStr.includes('rfq') || titleLower.includes('rfq') || typeStr.includes('request for qualif')) typeScore = 16;
  else if (typeStr.includes('rfi')) typeScore = 8;
  else if (typeStr.includes('solicitation') || typeStr.includes('bid') || opp.source !== 'SAM.gov') typeScore = 12;
  else typeScore = 10;

  const total = designScore + geo.score + budgetScore + typeScore;

  // Tier classification
  let tier, tierColor;
  if (total >= 75) { tier = 'Strong Match'; tierColor = '#2C4A3E'; }
  else if (total >= 55) { tier = 'Good Match'; tierColor = '#5C8A6E'; }
  else if (total >= 35) { tier = 'Possible Match'; tierColor = '#8B9E6E'; }
  else { tier = 'Poor Match'; tierColor = '#9BA89E'; }

  return {
    total,
    designScore,
    geoScore: geo.score,
    geoLabel: geo.label,
    budgetScore,
    budgetLabel,
    typeScore,
    tier,
    tierColor,
    matchKeywords: [...new Set(designMatches)].slice(0, 3),
    hasNegatives: negMatches.length > 0,
    negativeFlags: negMatches.slice(0, 2),
  };
}

// ─── SAM.GOV SEARCH KEYWORDS — broader net, LJLA-relevant ────────────────────
const SAM_SEARCHES = [
  'landscape architecture',
  'landscape architect',
  'landscape design',
  'park design',
  'streetscape design',
  'waterfront design',
  'urban plaza',
  'open space design',
  'site design',
  'planting design',
  'civic landscape',
  'outdoor amenity',
];

// ─── COMMBUYS KEYWORDS — broader net ─────────────────────────────────────────
const COMMBUYS_KEYWORDS = [
  'landscape','park','streetscape','waterfront','plaza','open space',
  'outdoor','site design','promenade','greenway','urban design',
];

// ─── STORAGE KEY ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ljla_v10';

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [filter, setFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [sortBy, setSortBy] = useState('score');
  const [lastSearched, setLastSearched] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualForm, setManualForm] = useState({ title: '', agency: '', deadline: '', link: '', notes: '' });
  const [geoFilterSubregion, setGeoFilterSubregion] = useState('All');

  // Load saved data
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setResults(data.results || []);
        setLastSearched(data.lastSearched || null);
        setApiKey(data.apiKey || '');
      } catch (e) {}
    }
  }, []);

  // Save data
  useEffect(() => {
    if (results.length > 0 || lastSearched) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ results, lastSearched, apiKey }));
    }
  }, [results, lastSearched, apiKey]);

  // ── SAM.gov fetch ──────────────────────────────────────────────────────────
  async function fetchSAM(key) {
    const allOpps = [];
    const seenIds = new Set();

    for (const keyword of SAM_SEARCHES) {
      try {
        setLoadingMsg(`SAM.gov: searching "${keyword}"…`);
        const url = `https://api.sam.gov/opportunities/v2/search?api_key=${key}&limit=25&postedFrom=01/01/2024&keywords=${encodeURIComponent(keyword)}&active=true`;
        const res = await fetch(url);
        const data = await res.json();
        const opps = data.opportunitiesData || [];
        for (const opp of opps) {
          if (!seenIds.has(opp.noticeId)) {
            seenIds.add(opp.noticeId);
            allOpps.push({
              id: `sam-${opp.noticeId}`,
              source: 'SAM.gov',
              title: opp.title || 'Untitled',
              agency: opp.fullParentPathName || opp.organizationName || '',
              deadline: opp.responseDeadLine || opp.archiveDate || '',
              link: `https://sam.gov/opp/${opp.noticeId}/view`,
              description: `${opp.typeOfSetAside || ''} ${opp.naicsCode || ''} ${opp.placeOfPerformance?.state?.name || ''}`,
              type: opp.type || '',
              status: 'New',
              notes: '',
              searchedAt: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.warn(`SAM search failed for "${keyword}":`, e.message);
      }
    }

    // Score and filter — drop very poor matches
    return allOpps
      .map(o => ({ ...o, scoring: scoreOpportunity(o) }))
      .filter(o => o.scoring.total >= 10 && !o.scoring.hasNegatives);
  }

  // ── City portal fetch helper ───────────────────────────────────────────────
  // Uses our Railway server-side proxy — no CORS restrictions, real browser headers
  async function fetchViaProxy(url) {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
    return res.text();
  }

  // ── Watertown MA fetch ────────────────────────────────────────────────────
  async function fetchWatertown() {
    const allOpps = [];
    const seenTitles = new Set();
    setLoadingMsg('Watertown MA: fetching bids…');
    try {
      const html = await fetchViaProxy('https://www.watertown-ma.gov/bids');
      // Bids are in .widgetDesc divs with h2 titles
      const blocks = html.split('widgetDesc');
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const titleMatch = block.match(/<h2[^>]*>([^<]{5,150})<\/h2>/i);
        const linkMatch = block.match(/href="(https?:\/\/www\.watertown-ma\.gov\/[^"]+)"/i)
                       || block.match(/href="(\/[^"]+bids?[^"]+)"/i);
        const dateMatch = block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        const title = titleMatch ? titleMatch[1].replace(/&amp;/g,'&').replace(/&#\d+;/g,'').trim() : '';
        const link = linkMatch ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.watertown-ma.gov${linkMatch[1]}`) : 'https://www.watertown-ma.gov/bids';
        const deadline = dateMatch ? dateMatch[0] : '';
        const titleKey = title.toLowerCase().substring(0, 60);
        const tl = title.toLowerCase();
        const hasSignal = CITY_PORTAL_REQUIRED.some(k => tl.includes(k));
        const hasNeg = NEGATIVE_KEYWORDS.some(k => tl.includes(k));
        if (title && title.length > 5 && !seenTitles.has(titleKey) && hasSignal && !hasNeg) {
          seenTitles.add(titleKey);
          allOpps.push({ id: `watertown-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, source: 'Watertown MA', title, agency: 'Town of Watertown', deadline, link, description: block.replace(/<[^>]+>/g,' ').trim().substring(0,200), type: 'Bid', status: 'New', notes: '', searchedAt: new Date().toISOString() });
        }
      }
    } catch(e) { console.warn('Watertown fetch failed:', e.message); }
    return allOpps.map(o => ({ ...o, scoring: scoreOpportunity(o) }));
  }

  // ── Portsmouth NH fetch ───────────────────────────────────────────────────
  async function fetchPortsmouth() {
    const allOpps = [];
    const seenTitles = new Set();
    setLoadingMsg('Portsmouth NH: fetching bids…');
    try {
      const html = await fetchViaProxy('https://www.portsmouthnh.gov/bids-and-rfps/');
      // Parse links that look like bid/rfp entries
      const linkMatches = [...html.matchAll(/<a[^>]+href="([^"]*(?:bid|rfp|solicitation)[^"]*)"[^>]*>([^<]{5,150})<\/a>/gi)];
      // Also parse any h2/h3 with nearby links
      const blocks = html.split(/<(?:h2|h3|article|li)[^>]*>/i);
      for (const block of blocks) {
        const titleMatch = block.match(/^([A-Z][^<\n]{10,120})/);
        const linkMatch = block.match(/href="(https?:\/\/[^"]+|\/[^"]+)"/) ;
        const dateMatch = block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g,'').trim() : '';
        if (!title || title.length < 8) continue;
        const link = linkMatch ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.portsmouthnh.gov${linkMatch[1]}`) : 'https://www.portsmouthnh.gov/bids-and-rfps/';
        const deadline = dateMatch ? dateMatch[0] : '';
        const titleKey = title.toLowerCase().substring(0,60);
        if (!seenTitles.has(titleKey) && /bid|rfp|design|project|landscape|park|service|contract/i.test(block)) {
          seenTitles.add(titleKey);
          allOpps.push({ id: `portsmouth-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, source: 'Portsmouth NH', title, agency: 'City of Portsmouth NH', deadline, link, description: block.replace(/<[^>]+>/g,' ').trim().substring(0,200), type: 'Bid', status: 'New', notes: '', searchedAt: new Date().toISOString() });
        }
      }
      // Also add any direct bid links found
      for (const [,href,label] of linkMatches) {
        const titleKey = label.toLowerCase().substring(0,60);
        if (!seenTitles.has(titleKey)) {
          seenTitles.add(titleKey);
          const fullLink = href.startsWith('http') ? href : `https://www.portsmouthnh.gov${href}`;
          allOpps.push({ id: `portsmouth-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, source: 'Portsmouth NH', title: label.trim(), agency: 'City of Portsmouth NH', deadline: '', link: fullLink, description: '', type: 'Bid', status: 'New', notes: '', searchedAt: new Date().toISOString() });
        }
      }
    } catch(e) { console.warn('Portsmouth fetch failed:', e.message); }
    return allOpps.map(o => ({ ...o, scoring: scoreOpportunity(o) }));
  }

  // ── CivicEngage generic parser ─────────────────────────────────────────────
  // Used by: Falmouth, Chatham, Lexington, Concord, Needham, Salem, Gloucester,
  //          and dozens more New England towns. URL pattern: town.gov/Bids.aspx
  async function fetchCivicEngage(townName, baseUrl, agency) {
    const allOpps = [];
    const seenTitles = new Set();
    setLoadingMsg(`${townName}: fetching bids…`);
    try {
      const html = await fetchViaProxy(baseUrl);
      // CivicEngage structure: <div class="listItemsRow bid"> ... <div class="bidTitle"><span><a href="bids.aspx?bidID=N">Title</a>
      const bidBlocks = html.split(/class="listItemsRow bid/i);
      const origin = new URL(baseUrl).origin;

      for (let i = 1; i < bidBlocks.length; i++) {
        const block = bidBlocks[i];
        // Title + link
        const titleMatch = block.match(/href="(bids\.aspx\?bidID=\d+|Bids\.aspx\?bidID=\d+)"[^>]*>([^<]{5,200})<\/a>/i)
                        || block.match(/href="([^"]*bidID=\d+)"[^>]*>([^<]{5,200})<\/a>/i);
        if (!titleMatch) continue;
        const linkPath = titleMatch[1];
        const title = titleMatch[2].replace(/&amp;/g,'&').replace(/&#\d+;/g,'').trim();
        const link = linkPath.startsWith('http') ? linkPath : `${origin}/${linkPath}`;

        // Description
        const descMatch = block.match(/<span>([^<]{10,300})<\/span>/);
        const description = descMatch ? descMatch[1].replace(/&amp;/g,'&').trim() : '';

        // Deadline
        const dateMatch = block.match(/Closes?[:\s]*([A-Z][a-z]+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i)
                       || block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        const deadline = dateMatch ? dateMatch[1] : '';

        // Status — skip closed/awarded
        if (/class="bidStatusClosed"|Closed|Awarded|Cancelled/i.test(block.substring(0, 500))) continue;

        const titleKey = title.toLowerCase().substring(0, 60);
        if (!seenTitles.has(titleKey) && title.length > 5) {
          seenTitles.add(titleKey);
          allOpps.push({
            id: `${townName.toLowerCase().replace(/\s+/g,'-')}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
            source: townName,
            title,
            agency,
            deadline,
            link,
            description,
            type: /rfp|request for proposal/i.test(title + description) ? 'RFP' : /rfq|qualifications/i.test(title + description) ? 'RFQ' : 'Bid',
            status: 'New',
            notes: '',
            searchedAt: new Date().toISOString(),
          });
        }
      }
    } catch(e) { console.warn(`${townName} CivicEngage fetch failed:`, e.message); }
    return allOpps.map(o => ({ ...o, scoring: scoreOpportunity(o) }));
  }

  // ── Somerville MA fetch ────────────────────────────────────────────────────
  async function fetchSomerville() {
    const allOpps = [];
    const seenTitles = new Set();
    setLoadingMsg('Somerville MA: fetching bids…');
    try {
      const html = await fetchViaProxy('https://www.somervillema.gov/departments/finance/purchasing/bids-and-proposals');
      // Somerville uses standard HTML list/table layout
      const blocks = html.split(/<(?:article|div class="view-row|li class)/i);
      for (const block of blocks) {
        const titleMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]{10,200})<\/a>/i);
        if (!titleMatch) continue;
        const rawTitle = titleMatch[2].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim();
        if (rawTitle.length < 8) continue;
        const href = titleMatch[1];
        const link = href.startsWith('http') ? href : `https://www.somervillema.gov${href}`;
        const dateMatch = block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        const deadline = dateMatch ? dateMatch[0] : '';
        const titleKey = rawTitle.toLowerCase().substring(0, 60);
        if (!seenTitles.has(titleKey)) {
          seenTitles.add(titleKey);
          allOpps.push({
            id: `somerville-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
            source: 'Somerville MA',
            title: rawTitle,
            agency: 'City of Somerville',
            deadline,
            link,
            description: block.replace(/<[^>]+>/g,' ').trim().substring(0, 200),
            type: /rfp|proposal/i.test(rawTitle) ? 'RFP' : /rfq|qualifications/i.test(rawTitle) ? 'RFQ' : 'Bid',
            status: 'New',
            notes: '',
            searchedAt: new Date().toISOString(),
          });
        }
      }
    } catch(e) { console.warn('Somerville fetch failed:', e.message); }
    return allOpps.map(o => ({ ...o, scoring: scoreOpportunity(o) }));
  }

  // ── Providence RI fetch ────────────────────────────────────────────────────
  async function fetchProvidence() {
    const allOpps = [];
    const seenTitles = new Set();
    setLoadingMsg('Providence RI: fetching solicitations…');
    try {
      const html = await fetchViaProxy('https://www.providenceri.gov/purchasing/solicitations/');
      const blocks = html.split(/<(?:tr|li|article|div class="[^"]*(?:row|item|entry)[^"]*")/i);
      for (const block of blocks) {
        const titleMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]{10,200})<\/a>/i);
        if (!titleMatch) continue;
        const rawTitle = titleMatch[2].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim();
        if (rawTitle.length < 8) continue;
        const href = titleMatch[1];
        const link = href.startsWith('http') ? href : `https://www.providenceri.gov${href}`;
        const dateMatch = block.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
        const deadline = dateMatch ? dateMatch[0] : '';
        const titleKey = rawTitle.toLowerCase().substring(0, 60);
        if (!seenTitles.has(titleKey)) {
          seenTitles.add(titleKey);
          allOpps.push({
            id: `providence-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
            source: 'Providence RI',
            title: rawTitle,
            agency: 'City of Providence',
            deadline,
            link,
            description: block.replace(/<[^>]+>/g,' ').trim().substring(0, 200),
            type: /rfp|proposal/i.test(rawTitle) ? 'RFP' : /rfq|qualifications/i.test(rawTitle) ? 'RFQ' : 'Bid',
            status: 'New',
            notes: '',
            searchedAt: new Date().toISOString(),
          });
        }
      }
    } catch(e) { console.warn('Providence fetch failed:', e.message); }
    return allOpps.map(o => ({ ...o, scoring: scoreOpportunity(o) }));
  }

  // ── City of Boston fetch ───────────────────────────────────────────────────
  async function fetchBoston() {
    const allOpps = [];
    const seenTitles = new Set();

    setLoadingMsg('City of Boston: fetching bid listings…');

    // Get page — direct fetch works (boston.gov allows CORS), codetabs as fallback
    async function fetchPage(pageNum) {
      const targetUrl = `https://www.boston.gov/bid-listings${pageNum > 0 ? `?page=${pageNum}` : ''}`;
      try {
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) {
        // Fallback to our server-side proxy
        return await fetchViaProxy(targetUrl);
      }
    }

    try {
      const page0Html = await fetchPage(0);

      // Find total pages
      const pageMatches = page0Html.match(/\?page=(\d+)/g);
      let maxPage = 0;
      if (pageMatches) {
        pageMatches.forEach(m => {
          const n = parseInt(m.replace('?page=', ''));
          if (n > maxPage) maxPage = n;
        });
      }

      // Fetch all pages in parallel
      const pages = [page0Html];
      if (maxPage > 0) {
        const rest = await Promise.all(
          Array.from({ length: maxPage }, (_, i) => fetchPage(i + 1))
        );
        pages.push(...rest);
      }

      for (const html of pages) {
        const parts = html.split('views-row');
        for (let i = 1; i < parts.length; i++) {
          const block = parts[i];

          // Extract title and link
          const linkMatch = block.match(/href="(\/bid-listings\/[^"]+)"[^>]*title="([^"]+)"/);
          const altLinkMatch = block.match(/href="(\/bid-listings\/[^"]+)"/);
          const titleTagMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);

          let link = '';
          let title = '';

          if (linkMatch) {
            link = `https://www.boston.gov${linkMatch[1]}`;
            title = linkMatch[2];
          } else if (altLinkMatch) {
            link = `https://www.boston.gov${altLinkMatch[1]}`;
            if (titleTagMatch) title = titleTagMatch[1].replace(/<[^>]+>/g, '').trim();
          }

          if (!title && titleTagMatch) {
            title = titleTagMatch[1].replace(/<[^>]+>/g, '').trim();
          }

          // Extract deadline
          let deadline = '';
          const dueMatch = block.match(/Due[:\s]*([A-Za-z]+ \d+,?\s*\d{4})/i) ||
                           block.match(/(\w+ \d+,\s*\d{4})/);
          if (dueMatch) deadline = dueMatch[1].trim();

          // Extract agency/department
          let agency = 'City of Boston';
          const deptMatch = block.match(/Department[:\s]*([^<\n]+)/i);
          if (deptMatch) agency = `Boston — ${deptMatch[1].trim()}`;

          const titleKey = (title || '').toLowerCase().substring(0, 60);
          const tl = (title || '').toLowerCase();
          const hasSignal = CITY_PORTAL_REQUIRED.some(k => tl.includes(k));
          const hasNeg = NEGATIVE_KEYWORDS.some(k => tl.includes(k));
          if (title && title.length > 4 && !seenTitles.has(titleKey) && hasSignal && !hasNeg) {
            seenTitles.add(titleKey);
            allOpps.push({
              id: `boston-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
              source: 'City of Boston',
              title,
              agency,
              deadline,
              link: link || 'https://www.boston.gov/bid-listings',
              description: 'City of Boston active bid',
              type: 'Bid',
              status: 'New',
              notes: '',
              searchedAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch (e) {
      console.warn('Boston.gov fetch failed:', e.message);
    }

    return allOpps.map(o => ({ ...o, scoring: scoreOpportunity(o) }));
  }

  // ── Main search handler ────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);

    // CivicEngage towns — each needs base URL + agency name
    const civicEngageTowns = [
      ['Falmouth MA',  'https://www.falmouthma.gov/Bids.aspx',       'Town of Falmouth'],
      ['Chatham MA',   'https://www.chatham-ma.gov/Bids.aspx',        'Town of Chatham'],
      ['Lexington MA', 'https://www.lexingtonma.gov/Bids.aspx',       'Town of Lexington'],
      ['Concord MA',   'https://www.concordma.gov/Bids.aspx',         'Town of Concord'],
      ['Needham MA',   'https://www.needhamma.gov/Bids.aspx',         'Town of Needham'],
      ['Gloucester MA','https://www.gloucester-ma.gov/Bids.aspx',     'City of Gloucester'],
      ['Salem MA',     'https://www.salemma.gov/Bids.aspx',           'City of Salem'],
      ['Newburyport MA','https://www.cityofnewburyport.com/Bids.aspx','City of Newburyport'],
      ['Marblehead MA','https://www.marblehead.org/Bids.aspx',        'Town of Marblehead'],
      ['Hingham MA',   'https://www.hingham-ma.gov/Bids.aspx',        'Town of Hingham'],
      ['Cohasset MA',  'https://www.cohassetma.org/Bids.aspx',        'Town of Cohasset'],
      ['Duxbury MA',   'https://www.town.duxbury.ma.us/Bids.aspx',    'Town of Duxbury'],
      ['Scituate MA',  'https://www.scituatema.gov/Bids.aspx',        'Town of Scituate'],
    ];

    try {
      setLoadingMsg('Starting search across all sources…');

      // Run all sources in parallel
      const [
        samResults,
        watertownResults,
        portsmouthResults,
        somervilleResults,
        providenceResults,
        bostonResults,
        ...civicResults
      ] = await Promise.all([
        apiKey ? fetchSAM(apiKey) : Promise.resolve([]),
        fetchWatertown(),
        fetchPortsmouth(),
        fetchSomerville(),
        fetchProvidence(),
        fetchBoston(),
        ...civicEngageTowns.map(([name, url, agency]) => fetchCivicEngage(name, url, agency)),
      ]);

      const civicFlat = civicResults.flat();
      const newResults = [
        ...samResults,
        ...watertownResults,
        ...portsmouthResults,
        ...somervilleResults,
        ...providenceResults,
        ...bostonResults,
        ...civicFlat,
      ];

      // Merge with existing (preserve notes/status, don't duplicate)
      setResults(prev => {
        const existingMap = {};
        prev.forEach(r => { existingMap[r.id] = r; });
        const merged = [...prev];
        for (const nr of newResults) {
          if (existingMap[nr.id]) {
            // Update but preserve user edits
            const existing = existingMap[nr.id];
            Object.assign(existingMap[nr.id], nr, {
              status: existing.status,
              notes: existing.notes,
            });
          } else {
            merged.push(nr);
          }
        }
        return merged;
      });

      setLastSearched(new Date().toISOString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, [apiKey]);

  // ── Add manual entry ───────────────────────────────────────────────────────
  function addManual() {
    if (!manualForm.title) return;
    const opp = {
      id: `manual-${Date.now()}`,
      source: 'Manual',
      title: manualForm.title,
      agency: manualForm.agency || '',
      deadline: manualForm.deadline || '',
      link: manualForm.link || '',
      description: manualForm.notes || '',
      type: 'Manual',
      status: 'Review',
      notes: manualForm.notes || '',
      searchedAt: new Date().toISOString(),
    };
    opp.scoring = scoreOpportunity(opp);
    setResults(prev => [opp, ...prev]);
    setManualForm({ title: '', agency: '', deadline: '', link: '', notes: '' });
    setShowAddManual(false);
  }

  // ── Update status/notes ────────────────────────────────────────────────────
  function updateResult(id, field, value) {
    setResults(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function removeResult(id) {
    setResults(prev => prev.filter(r => r.id !== id));
  }

  // ── Filtering & sorting ────────────────────────────────────────────────────
  const filtered = results
    .filter(r => filter === 'All' || r.scoring.tier === filter)
    .filter(r => sourceFilter === 'All' || r.source === sourceFilter)
    .filter(r => {
      if (geoFilterSubregion === 'All') return true;
      return r.scoring.geoLabel === geoFilterSubregion;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return b.scoring.total - a.scoring.total;
      if (sortBy === 'deadline') return (a.deadline || 'zzzz').localeCompare(b.deadline || 'zzzz');
      if (sortBy === 'recent') return b.searchedAt.localeCompare(a.searchedAt);
      return 0;
    });

  const tierCounts = {
    'Strong Match': results.filter(r => r.scoring.tier === 'Strong Match').length,
    'Good Match': results.filter(r => r.scoring.tier === 'Good Match').length,
    'Possible Match': results.filter(r => r.scoring.tier === 'Possible Match').length,
    'Poor Match': results.filter(r => r.scoring.tier === 'Poor Match').length,
  };

  const uniqueSubregions = [...new Set(results.map(r => r.scoring.geoLabel).filter(Boolean))].sort();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Poppins', 'Helvetica Neue', Arial, sans-serif", background: BRAND.bg, minHeight: '100vh', color: BRAND.text }}>
      {/* Header — clean white like leblancjones.com */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BRAND.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: BRAND.primary, fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>
            LeBlanc Jones Landscape Architects
          </div>
          <div style={{ color: BRAND.muted, fontSize: 11, marginTop: 2 }}>
            Public Work Pipeline · Boston · Watertown · Portsmouth · Somerville · Providence · 13 CivicEngage towns
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="https://sam.gov/search/?index=opp&q=landscape+architecture" target="_blank" rel="noreferrer"
             style={{ color: BRAND.muted, fontSize: 11, textDecoration: 'none' }}>SAM.gov ↗</a>
          <a href="https://www.watertown-ma.gov/bids" target="_blank" rel="noreferrer"
             style={{ color: BRAND.muted, fontSize: 11, textDecoration: 'none' }}>Watertown ↗</a>
          <a href="https://www.boston.gov/bid-listings" target="_blank" rel="noreferrer"
             style={{ color: BRAND.muted, fontSize: 11, textDecoration: 'none' }}>Boston.gov ↗</a>
          <a href="https://www.bostonplans.org/projects/development-projects" target="_blank" rel="noreferrer"
             style={{ color: BRAND.muted, fontSize: 11, textDecoration: 'none' }}>BostonPlans ↗</a>
          <button onClick={() => setShowApiKey(v => !v)}
                  style={{ background: 'transparent', border: `1px solid ${BRAND.border}`, color: BRAND.secondary, padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
            ⚙ API Key
          </button>
          <button onClick={runSearch} disabled={loading}
                  style={{ background: loading ? BRAND.muted : BRAND.primary, border: 'none', color: '#fff', padding: '7px 18px', borderRadius: 3, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: 0.3 }}>
            {loading ? '⟳ Searching…' : '⟳ Search All Sources'}
          </button>
        </div>
      </div>

      {/* API Key panel */}
      {showApiKey && (
        <div style={{ background: '#fff', borderBottom: `1px solid ${BRAND.border}`, padding: '12px 32px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: BRAND.muted }}>SAM.gov API Key:</span>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                 placeholder="SAM-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                 style={{ flex: 1, maxWidth: 420, padding: '5px 10px', border: `1px solid ${BRAND.border}`, borderRadius: 3, fontSize: 12 }} />
          <button onClick={() => setShowApiKey(false)}
                  style={{ background: BRAND.primary, color: '#fff', border: 'none', padding: '5px 14px', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}>
            Save
          </button>
        </div>
      )}

      {/* Loading message */}
      {loading && (
        <div style={{ background: BRAND.primary, color: '#fff', padding: '7px 32px', fontSize: 11, opacity: 0.85 }}>
          {loadingMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fff3f3', borderLeft: `3px solid #c44`, padding: '10px 32px', fontSize: 12, color: '#c44' }}>
          ⚠ {error}
        </div>
      )}

      {/* Summary bar */}
      {results.length > 0 && (
        <div style={{ background: '#fff', padding: '10px 32px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(tierCounts).map(([tier, count]) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                 onClick={() => setFilter(filter === tier ? 'All' : tier)}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background:
                tier === 'Strong Match' ? BRAND.primary : tier === 'Good Match' ? '#4A90D9' : tier === 'Possible Match' ? '#AAC4E8' : '#DDD',
                display: 'inline-block' }} />
              <span style={{ fontSize: 11, color: filter === tier ? BRAND.primary : BRAND.muted, fontWeight: filter === tier ? 700 : 400 }}>
                {count} {tier}
              </span>
            </div>
          ))}
          <span style={{ color: BRAND.muted, fontSize: 11, marginLeft: 'auto' }}>
            {lastSearched ? `Last searched: ${new Date(lastSearched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ background: '#fff', padding: '10px 32px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: `1px solid ${BRAND.border}` }}>
        {/* Tier filter */}
        <select value={filter} onChange={e => setFilter(e.target.value)}
                style={{ padding: '5px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12, background: '#fff' }}>
          <option value="All">All Tiers</option>
          <option value="Strong Match">Strong Match</option>
          <option value="Good Match">Good Match</option>
          <option value="Possible Match">Possible Match</option>
          <option value="Poor Match">Poor Match</option>
        </select>

        {/* Source filter */}
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                style={{ padding: '5px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12, background: '#fff' }}>
          <option value="All">All Sources</option>
          <option value="City of Boston">Boston</option>
          <option value="Watertown MA">Watertown MA</option>
          <option value="Somerville MA">Somerville MA</option>
          <option value="Lexington MA">Lexington MA</option>
          <option value="Concord MA">Concord MA</option>
          <option value="Needham MA">Needham MA</option>
          <option value="Falmouth MA">Falmouth MA</option>
          <option value="Chatham MA">Chatham MA</option>
          <option value="Gloucester MA">Gloucester MA</option>
          <option value="Salem MA">Salem MA</option>
          <option value="Newburyport MA">Newburyport MA</option>
          <option value="Marblehead MA">Marblehead MA</option>
          <option value="Hingham MA">Hingham MA</option>
          <option value="Cohasset MA">Cohasset MA</option>
          <option value="Duxbury MA">Duxbury MA</option>
          <option value="Scituate MA">Scituate MA</option>
          <option value="Portsmouth NH">Portsmouth NH</option>
          <option value="Providence RI">Providence RI</option>
          <option value="SAM.gov">SAM.gov</option>
          <option value="Manual">Manual</option>
        </select>

        {/* Geography filter */}
        <select value={geoFilterSubregion} onChange={e => setGeoFilterSubregion(e.target.value)}
                style={{ padding: '5px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12, background: '#fff' }}>
          <option value="All">All Regions</option>
          {uniqueSubregions.map(sr => (
            <option key={sr} value={sr}>{sr}</option>
          ))}
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ padding: '5px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12, background: '#fff' }}>
          <option value="score">Sort: Score</option>
          <option value="deadline">Sort: Deadline</option>
          <option value="recent">Sort: Recent</option>
        </select>

        <button onClick={() => setShowAddManual(v => !v)}
                style={{ marginLeft: 'auto', background: BRAND.accent, border: 'none', color: BRAND.primary, padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          + Add Manual
        </button>
      </div>

      {/* Manual entry form */}
      {showAddManual && (
        <div style={{ background: '#fff', padding: '16px 28px', borderBottom: `2px solid ${BRAND.accent}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input placeholder="Project title *" value={manualForm.title} onChange={e => setManualForm(f => ({ ...f, title: e.target.value }))}
                 style={{ padding: '6px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12 }} />
          <input placeholder="Agency / Client" value={manualForm.agency} onChange={e => setManualForm(f => ({ ...f, agency: e.target.value }))}
                 style={{ padding: '6px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12 }} />
          <input placeholder="Deadline" value={manualForm.deadline} onChange={e => setManualForm(f => ({ ...f, deadline: e.target.value }))}
                 style={{ padding: '6px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12 }} />
          <input placeholder="Link / URL" value={manualForm.link} onChange={e => setManualForm(f => ({ ...f, link: e.target.value }))}
                 style={{ padding: '6px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12 }} />
          <input placeholder="Notes" value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                 style={{ gridColumn: 'span 2', padding: '6px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12 }} />
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
            <button onClick={addManual}
                    style={{ background: BRAND.primary, color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Add Entry
            </button>
            <button onClick={() => setShowAddManual(false)}
                    style={{ background: '#eee', color: BRAND.muted, border: 'none', padding: '7px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div style={{ padding: '20px 32px', maxWidth: 1100 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: BRAND.muted }}>
            <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 500 }}>No opportunities loaded yet.</div>
            <div style={{ fontSize: 12 }}>Set your SAM.gov API key and click Search All Sources to begin.</div>
          </div>
        )}

        {filtered.map(opp => {
          const sc = opp.scoring;
          const isExpanded = expandedId === opp.id;
          return (
            <div key={opp.id} style={{
              background: '#fff',
              borderRadius: 2,
              marginBottom: 8,
              border: `1px solid ${BRAND.border}`,
              borderLeft: `3px solid ${sc.tierColor}`,
              overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{ padding: '14px 20px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}
                   onClick={() => setExpandedId(isExpanded ? null : opp.id)}>
                <div>
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, letterSpacing: 0.1 }}>
                      {opp.title}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: sc.tierColor, background: `${sc.tierColor}12`, padding: '2px 8px', borderRadius: 2, whiteSpace: 'nowrap' }}>
                      {sc.tier}
                    </span>
                    <span style={{ fontSize: 10, color: BRAND.muted, background: BRAND.bg, padding: '2px 8px', borderRadius: 2 }}>
                      {opp.source}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: BRAND.muted }}>
                    {opp.agency && <span>{opp.agency}</span>}
                    {opp.deadline && <span>Due: {opp.deadline}</span>}
                    {sc.geoLabel && <span>{sc.geoLabel}</span>}
                    {sc.matchKeywords?.length > 0 && (
                      <span style={{ color: BRAND.primary }}>{sc.matchKeywords.join(', ')}</span>
                    )}
                  </div>
                </div>

                {/* Score badge */}
                <div style={{ textAlign: 'right', minWidth: 48 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: sc.tierColor, lineHeight: 1 }}>{sc.total}</div>
                  <div style={{ fontSize: 9, color: BRAND.muted, marginTop: 1 }}>/ 100</div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${BRAND.border}` }}>
                  {/* Score breakdown */}
                  <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
                    <ScorePill label="Design" value={sc.designScore} max={35} color={BRAND.primary} />
                    <ScorePill label="Geography" value={sc.geoScore} max={25} color="#4A90D9" />
                    <ScorePill label="Budget" value={sc.budgetScore} max={20} color="#888" />
                    <ScorePill label="Type" value={sc.typeScore} max={20} color="#AAA" />
                  </div>

                  {/* Description */}
                  {opp.description && (
                    <p style={{ fontSize: 12, color: BRAND.muted, margin: '8px 0', lineHeight: 1.6 }}>
                      {opp.description}
                    </p>
                  )}

                  {/* Controls row */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                    <select value={opp.status} onChange={e => updateResult(opp.id, 'status', e.target.value)}
                            style={{ padding: '4px 8px', border: `1px solid ${BRAND.border}`, borderRadius: 2, fontSize: 11, background: '#fff', color: BRAND.secondary }}>
                      <option value="New">New</option>
                      <option value="Review">Under Review</option>
                      <option value="Pursuing">Pursuing</option>
                      <option value="Submitted">Submitted</option>
                      <option value="Won">Won</option>
                      <option value="No Bid">No Bid</option>
                      <option value="Passed">Passed</option>
                    </select>
                    <input value={opp.notes} onChange={e => updateResult(opp.id, 'notes', e.target.value)}
                           placeholder="Add notes…"
                           style={{ flex: 1, minWidth: 180, padding: '4px 8px', border: `1px solid ${BRAND.border}`, borderRadius: 2, fontSize: 11 }} />
                    {opp.link && (
                      <a href={opp.link} target="_blank" rel="noreferrer"
                         style={{ color: BRAND.primary, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                        View ↗
                      </a>
                    )}
                    <button onClick={() => removeResult(opp.id)}
                            style={{ background: 'none', border: `1px solid ${BRAND.border}`, color: BRAND.muted, padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontSize: 11 }}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '24px 32px', color: BRAND.muted, fontSize: 11, borderTop: `1px solid ${BRAND.border}`, textAlign: 'center' }}>
        LJLA RFP Pipeline v11 · {results.length} total · {filtered.length} showing
        · Scoring: Design 35pts · Geography 25pts · Budget 20pts · Type 20pts
        · Geography covers 153 municipalities across 14 subregions (MA, ME, NH, RI, CT, NY, NJ, PA)
      </div>
    </div>
  );
}

// Score pill component
function ScorePill({ label, value, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${color}12`, borderRadius: 2, padding: '3px 10px' }}>
      <span style={{ fontSize: 10, color: color, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: color, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 9, color: `${color}88` }}>/{max}</span>
    </div>
  );
}
