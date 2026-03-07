import React, { useState, useEffect, useCallback } from 'react';

// ─── LJLA BRAND COLORS ────────────────────────────────────────────────────────
const BRAND = {
  primary: '#2C4A3E',
  secondary: '#8B9E6E',
  accent: '#C4A882',
  light: '#F5F1EB',
  text: '#1A2E28',
  muted: '#6B7B6E',
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
  // Supporting keywords — relevant but less specific
  supporting: [
    'open space','outdoor space','landscape improvement','landscape restoration',
    'pedestrian design','pedestrian realm','outdoor environment','recreation landscape',
    'trail design','greenway design','community park','neighborhood park',
    'coastal landscape','resilient landscape','sustainable landscape',
  ],
};

// NEGATIVE SIGNALS — pure infrastructure, not design-led
const NEGATIVE_KEYWORDS = [
  'construction only','general contractor','grading only','excavation','earthwork',
  'paving contractor','concrete contractor','utility installation','sewer installation',
  'stormwater pipe','drainage pipe','retaining wall construction','fencing installation',
  'snow removal','janitorial','custodial','food service','information technology',
  'cybersecurity','medical supply','pharmaceutical','ammunition','weapons system',
  'military','defense contract','roofing','hvac','plumbing contractor',
  'electrical contractor','telecommunications','it services',
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
  if (supportingMatches.length > 0 && designScore > 0) {
    designScore = Math.min(35, designScore + supportingMatches.length * 2);
  }

  // Negative signals — significant penalty
  const negMatches = NEGATIVE_KEYWORDS.filter(k => searchText.includes(k));
  if (negMatches.length > 0) {
    designScore = Math.max(0, designScore - negMatches.length * 8);
  }

  // Geography score (up to 25 pts)
  const geo = getGeoScore(searchText);

  // Budget score (up to 20 pts)
  let budgetScore = 0;
  let budgetLabel = '';
  const amtStr = String(opp.award_amount || opp.estimated_value || '');
  const amtNum = parseFloat(amtStr.replace(/[^0-9.]/g, ''));
  if (amtNum >= 500000) { budgetScore = 20; budgetLabel = '$500K+'; }
  else if (amtNum >= 200000) { budgetScore = 14; budgetLabel = '$200K+'; }
  else if (amtNum >= 50000) { budgetScore = 7; budgetLabel = '$50K+'; }
  else if (amtNum > 0) { budgetScore = 3; budgetLabel = `$${Math.round(amtNum/1000)}K`; }

  // Solicitation type score (up to 20 pts)
  let typeScore = 0;
  const typeStr = (opp.type || opp.solicitation_type || '').toLowerCase();
  if (typeStr.includes('rfp') || typeStr.includes('request for proposal')) typeScore = 20;
  else if (typeStr.includes('rfq') || typeStr.includes('request for qualif')) typeScore = 16;
  else if (typeStr.includes('rfi')) typeScore = 8;
  else if (typeStr.includes('solicitation') || typeStr.includes('bid')) typeScore = 12;
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

// ─── SAM.GOV SEARCH KEYWORDS — LJLA-specific ──────────────────────────────────
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

// ─── COMMBUYS KEYWORDS ────────────────────────────────────────────────────────
const COMMBUYS_KEYWORDS = [
  'landscape architecture','landscape architect','planting design','park design',
  'streetscape','urban design landscape','waterfront','plaza design','open space',
  'civic landscape','outdoor amenity','site design','landscape improvement',
  'park master plan','promenade','courtyard landscape','institutional landscape',
];

// ─── STORAGE KEY ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ljla_v7';

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
      .filter(o => o.scoring.total >= 15 && !o.scoring.hasNegatives);
  }

  // ── COMMBUYS fetch ─────────────────────────────────────────────────────────
  async function fetchCOMMBUYS() {
    const allOpps = [];
    const seenTitles = new Set();

    for (const kw of COMMBUYS_KEYWORDS.slice(0, 10)) {
      try {
        setLoadingMsg(`COMMBUYS: searching "${kw}"…`);
        const targetUrl = `https://www.commbuys.com/bso/external/bidstatus.sdo?winningBidderFlag=N&currentPage=1&sortBy=6&keyword=${encodeURIComponent(kw)}`;
        const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        const html = await res.text();

        // Parse table rows
        const rowRegex = /<tr[^>]*class="[^"]*(?:odd|even)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
        let match;
        while ((match = rowRegex.exec(html)) !== null) {
          const row = match[1];
          const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
            c[1].replace(/<[^>]+>/g, '').trim()
          );
          if (cells.length >= 4) {
            const title = cells[1] || cells[0] || '';
            const agency = cells[2] || '';
            const deadline = cells[3] || '';
            const linkMatch = row.match(/href="([^"]*bidstatus\.sdo[^"]*)"/i);
            const link = linkMatch
              ? `https://www.commbuys.com${linkMatch[1].replace(/&amp;/g, '&')}`
              : 'https://www.commbuys.com/bso/external/bidstatus.sdo';

            const titleKey = title.toLowerCase().substring(0, 60);
            if (title && title.length > 5 && !seenTitles.has(titleKey)) {
              seenTitles.add(titleKey);
              allOpps.push({
                id: `commbuys-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
                source: 'COMMBUYS',
                title,
                agency,
                deadline,
                link,
                description: `MA State Bid — ${kw}`,
                type: 'Solicitation',
                status: 'New',
                notes: '',
                searchedAt: new Date().toISOString(),
              });
            }
          }
        }
      } catch (e) {
        console.warn(`COMMBUYS search failed for "${kw}":`, e.message);
      }
    }

    return allOpps.map(o => ({ ...o, scoring: scoreOpportunity(o) }));
  }

  // ── City of Boston fetch ───────────────────────────────────────────────────
  async function fetchBoston() {
    const allOpps = [];
    const seenTitles = new Set();

    setLoadingMsg('City of Boston: fetching bid listings…');

    // Get page 0 first to find total pages
    async function fetchPage(pageNum) {
      const targetUrl = `https://www.boston.gov/bid-listings${pageNum > 0 ? `?page=${pageNum}` : ''}`;
      try {
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch(e) {
        const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
        return await res.text();
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
          if (title && title.length > 4 && !seenTitles.has(titleKey)) {
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
    if (!apiKey) {
      setShowApiKey(true);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      setLoadingMsg('Starting search across all sources…');
      const [samResults, commbuysResults, bostonResults] = await Promise.all([
        fetchSAM(apiKey),
        fetchCOMMBUYS(),
        fetchBoston(),
      ]);

      const newResults = [...samResults, ...commbuysResults, ...bostonResults];

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
    <div style={{ fontFamily: "'Georgia', serif", background: BRAND.light, minHeight: '100vh', color: BRAND.text }}>
      {/* Header */}
      <div style={{ background: BRAND.primary, padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: BRAND.accent, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            LeBlanc Jones Landscape Architects
          </div>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>RFP Pipeline</div>
          <div style={{ color: BRAND.secondary, fontSize: 11, marginTop: 2 }}>
            SAM.gov · COMMBUYS · City of Boston · Manual
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="https://sam.gov/search/?index=opp&q=landscape+architecture" target="_blank" rel="noreferrer"
             style={{ color: BRAND.accent, fontSize: 11, textDecoration: 'none', opacity: 0.85 }}>SAM.gov ↗</a>
          <a href="https://www.commbuys.com/bso/external/bidstatus.sdo" target="_blank" rel="noreferrer"
             style={{ color: BRAND.accent, fontSize: 11, textDecoration: 'none', opacity: 0.85 }}>COMMBUYS ↗</a>
          <a href="https://www.boston.gov/bid-listings" target="_blank" rel="noreferrer"
             style={{ color: BRAND.accent, fontSize: 11, textDecoration: 'none', opacity: 0.85 }}>Boston.gov ↗</a>
          <a href="https://www.bostonplans.org/projects/development-projects" target="_blank" rel="noreferrer"
             style={{ color: BRAND.accent, fontSize: 11, textDecoration: 'none', opacity: 0.85 }}>BostonPlans ↗</a>
          <button onClick={() => setShowApiKey(v => !v)}
                  style={{ background: BRAND.accent, border: 'none', color: BRAND.primary, padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            ⚙ API Key
          </button>
          <button onClick={runSearch} disabled={loading}
                  style={{ background: loading ? '#6B7B6E' : '#8B9E6E', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            {loading ? '⟳ Searching…' : '⟳ Search All Sources'}
          </button>
        </div>
      </div>

      {/* API Key panel */}
      {showApiKey && (
        <div style={{ background: '#fff', borderBottom: `2px solid ${BRAND.accent}`, padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: BRAND.muted }}>SAM.gov API Key:</span>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                 placeholder="SAM-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                 style={{ flex: 1, maxWidth: 420, padding: '5px 10px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 12 }} />
          <button onClick={() => setShowApiKey(false)}
                  style={{ background: BRAND.primary, color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Save
          </button>
        </div>
      )}

      {/* Loading message */}
      {loading && (
        <div style={{ background: BRAND.secondary, color: '#fff', padding: '8px 28px', fontSize: 12, fontStyle: 'italic' }}>
          {loadingMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fff3f3', borderLeft: `4px solid #c44`, padding: '10px 28px', fontSize: 12, color: '#c44' }}>
          ⚠ {error}
        </div>
      )}

      {/* Summary bar */}
      {results.length > 0 && (
        <div style={{ background: '#fff', padding: '12px 28px', borderBottom: `1px solid ${BRAND.accent}30`, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(tierCounts).map(([tier, count]) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                 onClick={() => setFilter(filter === tier ? 'All' : tier)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 
                tier === 'Strong Match' ? BRAND.primary : tier === 'Good Match' ? BRAND.secondary : tier === 'Possible Match' ? BRAND.accent : '#ccc',
                display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: filter === tier ? BRAND.primary : BRAND.muted, fontWeight: filter === tier ? 700 : 400 }}>
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
      <div style={{ background: BRAND.light, padding: '10px 28px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: `1px solid ${BRAND.accent}30` }}>
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
          <option value="SAM.gov">SAM.gov</option>
          <option value="COMMBUYS">COMMBUYS</option>
          <option value="City of Boston">City of Boston</option>
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
      <div style={{ padding: '16px 28px', maxWidth: 1200 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: BRAND.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🌿</div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>No opportunities loaded yet.</div>
            <div style={{ fontSize: 12 }}>Set your SAM.gov API key and click Search All Sources to begin.</div>
          </div>
        )}

        {filtered.map(opp => {
          const sc = opp.scoring;
          const isExpanded = expandedId === opp.id;
          return (
            <div key={opp.id} style={{
              background: '#fff',
              borderRadius: 6,
              marginBottom: 10,
              border: `1px solid ${sc.tierColor}40`,
              borderLeft: `4px solid ${sc.tierColor}`,
              overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{ padding: '12px 16px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}
                   onClick={() => setExpandedId(isExpanded ? null : opp.id)}>
                <div>
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>
                      {opp.title}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: sc.tierColor, background: `${sc.tierColor}15`, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                      {sc.tier}
                    </span>
                    <span style={{ fontSize: 10, color: BRAND.muted, background: '#f0f0f0', padding: '2px 8px', borderRadius: 10 }}>
                      {opp.source}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: BRAND.muted }}>
                    {opp.agency && <span>🏛 {opp.agency}</span>}
                    {opp.deadline && <span>📅 {opp.deadline}</span>}
                    {sc.geoLabel && <span>📍 {sc.geoLabel}</span>}
                    {sc.matchKeywords.length > 0 && (
                      <span style={{ color: BRAND.secondary }}>🌿 {sc.matchKeywords.join(', ')}</span>
                    )}
                  </div>
                </div>

                {/* Score badge */}
                <div style={{ textAlign: 'center', minWidth: 52 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: sc.tierColor, lineHeight: 1 }}>{sc.total}</div>
                  <div style={{ fontSize: 9, color: BRAND.muted, marginTop: 2 }}>/ 100</div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${BRAND.accent}20` }}>
                  {/* Score breakdown */}
                  <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
                    <ScorePill label="Design" value={sc.designScore} max={35} color={BRAND.secondary} />
                    <ScorePill label="Geography" value={sc.geoScore} max={25} color={BRAND.primary} />
                    <ScorePill label="Budget" value={sc.budgetScore} max={20} color={BRAND.accent} />
                    <ScorePill label="Type" value={sc.typeScore} max={20} color="#9BA89E" />
                  </div>

                  {/* Description */}
                  {opp.description && (
                    <p style={{ fontSize: 12, color: BRAND.muted, margin: '8px 0', lineHeight: 1.5 }}>
                      {opp.description}
                    </p>
                  )}

                  {/* Negative flags warning */}
                  {sc.hasNegatives && (
                    <div style={{ background: '#fff8f0', border: '1px solid #f0c060', borderRadius: 4, padding: '5px 10px', fontSize: 11, color: '#996600', marginBottom: 8 }}>
                      ⚠ Non-design signals: {sc.negativeFlags.join(', ')}
                    </div>
                  )}

                  {/* Controls row */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                    <select value={opp.status} onChange={e => updateResult(opp.id, 'status', e.target.value)}
                            style={{ padding: '4px 8px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 11, background: '#fff' }}>
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
                           style={{ flex: 1, minWidth: 180, padding: '4px 8px', border: `1px solid ${BRAND.secondary}`, borderRadius: 4, fontSize: 11 }} />
                    {opp.link && (
                      <a href={opp.link} target="_blank" rel="noreferrer"
                         style={{ color: BRAND.primary, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                        View ↗
                      </a>
                    )}
                    <button onClick={() => removeResult(opp.id)}
                            style={{ background: 'none', border: `1px solid #ccc`, color: BRAND.muted, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
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
      <div style={{ padding: '20px 28px', color: BRAND.muted, fontSize: 11, borderTop: `1px solid ${BRAND.accent}30`, textAlign: 'center' }}>
        LJLA RFP Pipeline v7 · {results.length} total · {filtered.length} showing
        · Scoring: Design 35pts · Geography 25pts · Budget 20pts · Type 20pts
        · Geography covers 153 municipalities across 14 subregions (MA, ME, NH, RI, CT, NY, NJ, PA)
      </div>
    </div>
  );
}

// Score pill component
function ScorePill({ label, value, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${color}15`, borderRadius: 12, padding: '3px 10px' }}>
      <span style={{ fontSize: 10, color: color, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 12, color: color, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 9, color: `${color}99` }}>/{max}</span>
    </div>
  );
}
