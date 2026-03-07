import { useState, useEffect, useCallback } from "react";
import './index.css';

const BLUE = "#3c75bf", CHAR = "#575759", MUTED = "rgba(87,87,89,0.61)", RULE = "#e8e8e8";

// ── Scoring ────────────────────────────────────────────────────────
const DESIGN_KW = [
  "landscape architecture","landscape architect","placemaking","urban design",
  "public realm","streetscape","waterfront","park design","plaza design",
  "promenade","green infrastructure","open space design","campus grounds",
  "cultural landscape","civic landscape","community park","trail design",
  "greenway","riverwalk","town center design","master plan landscape",
  "outdoor recreation design","shoreline restoration","ecological design",
  "botanical garden","arboretum","rooftop garden","courtyard design",
  "memorial garden","playground design","dog park","spray park",
  "hardscape","softscape","site design","site furnishings","site amenities"
];
const EXCLUDE_KW = [
  "military","armament","aircraft","ammunition","heavy vehicle","pharmacy",
  "medical supply","drone","cybersecurity","software license","it services",
  "staffing","janitorial","snow removal","pest control","food service",
  "uniforms","furniture only","office supplies"
];
const MA_GEO = [
  "boston","cambridge","somerville","brookline","newton","quincy","worcester",
  "springfield","lowell","lynn","fall river","new bedford","brockton","medford",
  "malden","waltham","haverhill","gloucester","northampton","amherst","pittsfield",
  "chicopee","holyoke","fitchburg","leominster","revere","taunton","barnstable",
  "falmouth","plymouth","sandwich","yarmouth","dennis","brewster","chatham",
  "eastham","wellfleet","truro","provincetown","cape cod","nantucket",
  "lexington","concord","lincoln","sudbury","acton","arlington","belmont",
  "watertown","needham","wellesley","dedham","milton","canton","massachusetts",
  " ma ","boston area","greater boston"
];
const NE_GEO = ["connecticut","rhode island","new hampshire","vermont","maine",
  " ct "," ri "," nh "," vt "," me ","new england"];
const NY_GEO = ["new york","new jersey","pennsylvania"," ny "," nj "," pa "];

function scoreOpportunity(opp) {
  const text = `${opp.title} ${opp.description} ${opp.agency} ${opp.location}`.toLowerCase();

  // Hard exclude — non-LA work
  const excl = EXCLUDE_KW.filter(k => text.includes(k)).length;
  if (excl >= 2) return { score: 5, tier: "Poor Match", recommendation: "Pass" };

  let score = 0;

  // Design sophistication (35pts)
  const hits = DESIGN_KW.filter(k => text.includes(k)).length;
  score += Math.min(35, hits * 9);

  // Geography (25pts)
  const isMa = MA_GEO.some(c => text.includes(c));
  const isNE = NE_GEO.some(s => text.includes(s));
  const isNY = NY_GEO.some(s => text.includes(s));
  if (isMa) score += 25;
  else if (isNE) score += 18;
  else if (isNY) score += 12;
  else score += 3;

  // Budget (20pts)
  const $m = text.match(/\$[\d,.]+\s*m(illion)?/gi);
  const $k = text.match(/\$[\d,.]+\s*k/gi);
  const $raw = text.match(/\$[\d,]{4,}/g);
  if ($m?.length) score += 20;
  else if ($raw?.length) {
    const max = Math.max(...$raw.map(b => parseFloat(b.replace(/[$,]/g,""))));
    if (max >= 500000) score += 20;
    else if (max >= 200000) score += 14;
    else if (max >= 50000) score += 7;
  } else if ($k?.length) score += 5;
  else score += 8; // unknown budget

  // Type (20pts)
  if (/rfp|request for proposal/i.test(text)) score += 20;
  else if (/rfq|request for qualif/i.test(text)) score += 16;
  else if (/rfi|request for info/i.test(text)) score += 8;
  else score += 10;

  score = Math.min(100, Math.max(0, score));
  let tier, recommendation;
  if (score >= 75) { tier = "Strong Match"; recommendation = "Pursue"; }
  else if (score >= 55) { tier = "Good Match"; recommendation = "Pursue"; }
  else if (score >= 35) { tier = "Possible Match"; recommendation = "Monitor"; }
  else { tier = "Poor Match"; recommendation = "Pass"; }
  return { score, tier, recommendation };
}

// ── SAM.gov (LA-specific keywords only) ───────────────────────────
const SAM_KEYWORDS = [
  "landscape architecture",
  "landscape architect services",
  "park design landscape",
  "streetscape design",
  "urban park design",
  "waterfront park design",
  "placemaking design",
  "open space master plan",
  "public plaza design",
  "greenway trail design"
];

async function fetchSAMgov(apiKey) {
  const today = new Date();
  const past90 = new Date(today - 90 * 86400000);
  const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  const results = [];
  const seen = new Set();

  for (const kw of SAM_KEYWORDS) {
    const url = `https://api.sam.gov/opportunities/v2/search?limit=10&keywords=${encodeURIComponent(kw)}&postedFrom=${fmt(past90)}&postedTo=${fmt(today)}&api_key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`SAM.gov error: ${res.status} — ${err.slice(0,200)}`);
      }
      const data = await res.json();
      for (const item of (data.opportunitiesData || [])) {
        if (seen.has(item.noticeId)) continue;
        seen.add(item.noticeId);
        const opp = {
          id: `sam_${item.noticeId}`,
          title: item.title || "Untitled",
          agency: item.organizationName || item.fullParentPathName?.split(".").pop() || "Federal Agency",
          type: (item.type || "RFP").toUpperCase().replace("PRESOL","RFI").replace("COMBINE","RFP").replace("SOLICIT","RFP"),
          location: [item.placeOfPerformance?.city?.name, item.placeOfPerformance?.state?.code].filter(Boolean).join(", ") || "See solicitation",
          state: item.placeOfPerformance?.state?.code || "",
          deadline: item.responseDeadLine?.split("T")[0] || "TBD",
          budget: "",
          description: item.description || item.title || "",
          sourceUrl: `https://sam.gov/opp/${item.noticeId}/view`,
          postedDate: item.postedDate?.split("T")[0] || "",
          source: "SAM.gov",
          status: "New", notes: [], scoring: null,
          addedDate: new Date().toISOString().split("T")[0],
        };
        opp.scoring = scoreOpportunity(opp);
        // Only keep LA-relevant results (score > 15)
        if (opp.scoring.score > 15) results.push(opp);
      }
    } catch (e) { console.warn("SAM fetch error for", kw, e); throw e; }
  }
  return results;
}

// ── COMMBUYS scraper via allorigins proxy ─────────────────────────
async function fetchCOMMBUYS() {
  // COMMBUYS public bid search for design/architecture/landscape keywords
  const keywords = ["landscape","park design","streetscape","urban design","open space"];
  const results = [];
  const seen = new Set();

  for (const kw of keywords) {
    const commbuysUrl = `https://www.commbuys.com/bso/external/publicBids.sdo?docType=BD&keyword=${encodeURIComponent(kw)}&statusCode=A`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(commbuysUrl)}`;
    try {
      const res = await fetch(proxyUrl);
      const data = await res.json();
      const html = data.contents || "";
      // Parse bid rows from COMMBUYS HTML table
      const rowRe = /<tr[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
      let match;
      while ((match = rowRe.exec(html)) !== null) {
        const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
          c[1].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").trim()
        );
        if (cells.length < 4) continue;
        const bidNum = cells[0]?.trim();
        if (!bidNum || seen.has(bidNum)) continue;
        seen.add(bidNum);

        // Extract link
        const linkMatch = match[1].match(/href="([^"]*bidId=([^"&]+)[^"]*)"/i);
        const sourceUrl = linkMatch ? `https://www.commbuys.com${linkMatch[1]}` : "https://www.commbuys.com/bso/external/publicBids.sdo";

        const opp = {
          id: `cb_${bidNum}`,
          title: cells[1] || `COMMBUYS Bid ${bidNum}`,
          agency: cells[2] || "MA State Agency",
          type: "RFP",
          location: "Massachusetts",
          state: "MA",
          deadline: cells[4] || "TBD",
          budget: "",
          description: cells[1] || "",
          sourceUrl,
          postedDate: cells[3] || "",
          source: "COMMBUYS",
          status: "New", notes: [], scoring: null,
          addedDate: new Date().toISOString().split("T")[0],
        };
        opp.scoring = scoreOpportunity(opp);
        if (opp.scoring.score > 10) results.push(opp);
      }
    } catch(e) { console.warn("COMMBUYS fetch error:", e); }
  }
  return results;
}

// ── Boston.gov bids scraper ────────────────────────────────────────
async function fetchBostonPage(pageNum, seen, results) {
  const pageUrl = `https://www.boston.gov/bid-listings${pageNum > 0 ? `?page=${pageNum}` : ""}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(pageUrl)}`;
  const res = await fetch(proxyUrl);
  const data = await res.json();
  const html = data.contents || "";

  // Split on views-row to get individual listings
  const rowParts = html.split(/class="[^"]*views-row[^"]*"/);
  for (let i = 1; i < rowParts.length; i++) {
    const chunk = rowParts[i].slice(0, 2000);
    const titleMatch = chunk.match(/href="(\/bid-listings\/[^"]+)"[^>]*title="([^"]+)"/i)
      || chunk.match(/href="(\/bid-listings\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const sourceUrl = `https://www.boston.gov${titleMatch[1]}`;
    const title = titleMatch[2].replace(/<[^>]+>/g,"").trim();
    if (!title || title.length < 5 || seen.has(title)) continue;
    seen.add(title);
    const dueMatch = chunk.match(/Due:[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
    const postedMatch = chunk.match(/Posted:[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
    const opp = {
      id: `bos_${Date.now()}_${seen.size}`,
      title, agency: "City of Boston", type: "RFP",
      location: "Boston, MA", state: "MA",
      deadline: dueMatch?.[1] || "TBD", budget: "",
      description: title, sourceUrl,
      postedDate: postedMatch?.[1] || "",
      source: "City of Boston",
      status: "New", notes: [], scoring: null,
      addedDate: new Date().toISOString().split("T")[0],
    };
    opp.scoring = scoreOpportunity(opp);
    results.push(opp);
  }

  // Return number of pages total (detect from last page link)
  const lastPageMatch = html.match(/bid-listings\?page=(\d+)"[^>]*>Last/i)
    || html.match(/Last[^<]*<\/a>[\s\S]*?page=(\d+)/i)
    || html.match(/page=(\d+)"[^>]*rel="last"/i);
  return lastPageMatch ? parseInt(lastPageMatch[1]) : pageNum;
}

async function fetchBoston() {
  const results = [];
  const seen = new Set();
  try {
    // Fetch page 0 first — it tells us the last page number
    const lastPage = await fetchBostonPage(0, seen, results);
    // Fetch remaining pages in parallel
    const pagePromises = [];
    for (let p = 1; p <= lastPage; p++) {
      pagePromises.push(fetchBostonPage(p, seen, results));
    }
    await Promise.all(pagePromises);
  } catch(e) { console.warn("Boston fetch error:", e); }
  return results;
}

// ── Storage ────────────────────────────────────────────────────────
const SK = "ljla_v6";
const load = () => { try { return JSON.parse(localStorage.getItem(SK)||"[]"); } catch { return []; }};
const save = d => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };
const loadKey = () => localStorage.getItem("ljla_sam_key")||"";
const saveKey = k => localStorage.setItem("ljla_sam_key", k);

const TIERS = ["Strong Match","Good Match","Possible Match","Poor Match"];
const STATUSES = ["New","Reviewing","Pursuing","Submitted","Won","Passed"];
const SOURCES = ["SAM.gov","COMMBUYS","City of Boston","Manual"];

function Ring({ score, size=42 }) {
  const r=size/2-4, c=2*Math.PI*r, f=(score/100)*c;
  const clr = score>=75?BLUE:score>=55?"#5a8f3c":score>=35?"#8a7f3c":"#bbb";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={RULE} strokeWidth={3}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={clr} strokeWidth={3}
        strokeDasharray={`${f} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={size>50?13:10}
        fill={clr} fontFamily="'Nunito Sans',sans-serif">{score}</text>
    </svg>
  );
}
function Dots({ tier }) {
  const n={"Strong Match":4,"Good Match":3,"Possible Match":2,"Poor Match":1}[tier]||0;
  const clr={"Strong Match":BLUE,"Good Match":"#5a8f3c","Possible Match":"#8a7f3c","Poor Match":"#bbb"}[tier]||"#bbb";
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3}}>
      {[1,2,3,4].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:i<=n?clr:"#e0e0e0",display:"inline-block"}}/>)}
      <span style={{marginLeft:6,fontSize:11,color:CHAR}}>{tier}</span>
    </span>
  );
}
function Pill({ rec }) {
  const clr={Pursue:BLUE,Monitor:"#8a7f3c",Pass:"#bbb"}[rec]||"#bbb";
  return <span style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:clr,border:`1px solid ${clr}`,padding:"2px 10px"}}>{rec}</span>;
}
function SourceBadge({ source }) {
  const clr={"SAM.gov":"#6b7280","COMMBUYS":"#7c5c9b","City of Boston":"#2d6a4f","Manual":MUTED}[source]||MUTED;
  return <span style={{fontSize:9,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:clr,border:`1px solid ${clr}`,padding:"1px 7px",borderRadius:2}}>{source||"Manual"}</span>;
}
function statusClr(s) {
  if (["Pursuing","Submitted","Won"].includes(s)) return BLUE;
  if (s==="Passed") return "#bbb";
  return CHAR;
}

export default function App() {
  const [opps, setOpps] = useState(load);
  const [view, setView] = useState("board");
  const [sel, setSel] = useState(null);
  const [searching, setSearching] = useState(false);
  const [log, setLog] = useState("");
  const [fTier, setFTier] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fSource, setFSource] = useState("All");
  const [sort, setSort] = useState("score");
  const [note, setNote] = useState("");
  const [apiKey, setApiKey] = useState(loadKey);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [form, setForm] = useState({title:"",agency:"",type:"RFP",location:"",state:"MA",deadline:"",budget:"",description:"",sourceUrl:"",postedDate:""});

  const persist = useCallback(items => { setOpps(items); save(items); }, []);

  useEffect(() => {
    if (sel) { const f=opps.find(o=>o.id===sel.id); if(f) setSel(f); }
  }, [opps]); // eslint-disable-line

  async function search() {
    if (!apiKey) { setShowKeyInput(true); return; }
    setSearching(true);
    const allNew = [];

    // SAM.gov
    setLog("Searching SAM.gov for landscape architecture RFPs…");
    try {
      const sam = await fetchSAMgov(apiKey);
      allNew.push(...sam);
      setLog(`SAM.gov: ${sam.length} LA opportunities found. Checking COMMBUYS…`);
    } catch(e) {
      setLog(`SAM.gov error: ${e.message}. Trying other sources…`);
    }

    // COMMBUYS
    try {
      const cb = await fetchCOMMBUYS();
      allNew.push(...cb);
      setLog(prev => `${allNew.length} found so far. Checking City of Boston…`);
    } catch(e) { console.warn("COMMBUYS error", e); }

    // Boston.gov
    try {
      const bos = await fetchBoston();
      allNew.push(...bos);
    } catch(e) { console.warn("Boston error", e); }

    // Merge (no duplicates by title+agency)
    const merged = [...opps];
    let added = 0;
    for (const op of allNew) {
      const isDup = merged.some(e =>
        e.title?.toLowerCase()===op.title?.toLowerCase() &&
        e.agency?.toLowerCase()===op.agency?.toLowerCase()
      );
      if (!isDup) { merged.push(op); added++; }
    }
    persist(merged);
    setLog(`Done — ${added} new LA opportunities added across SAM.gov, COMMBUYS, and City of Boston.`);
    setSearching(false);
  }

  const scoreOne = id => persist(opps.map(o=>o.id===id?{...o,scoring:scoreOpportunity(o)}:o));
  const scoreAll = () => persist(opps.map(o=>({...o,scoring:scoreOpportunity(o)})));
  const updateStatus = (id,s) => persist(opps.map(o=>o.id===id?{...o,status:s}:o));
  const addNote = id => {
    if (!note.trim()) return;
    persist(opps.map(o=>o.id===id?{...o,notes:[...(o.notes||[]),{text:note.trim(),date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}]}:o));
    setNote("");
  };
  const del = id => { persist(opps.filter(o=>o.id!==id)); setView("board"); };
  const addManual = e => {
    e.preventDefault();
    const scored = {...form,id:`m_${Date.now()}`,source:"Manual",status:"New",notes:[],scoring:scoreOpportunity(form),addedDate:new Date().toISOString().split("T")[0]};
    persist([...opps,scored]);
    setForm({title:"",agency:"",type:"RFP",location:"",state:"MA",deadline:"",budget:"",description:"",sourceUrl:"",postedDate:""});
    setView("board");
  };

  const filtered = opps
    .filter(o=>fTier==="All"||o.scoring?.tier===fTier)
    .filter(o=>fStatus==="All"||o.status===fStatus)
    .filter(o=>fSource==="All"||(o.source||"Manual")===fSource)
    .sort((a,b)=>{
      if (sort==="score") return (b.scoring?.score||0)-(a.scoring?.score||0);
      if (sort==="deadline") return (a.deadline||"zzz").localeCompare(b.deadline||"zzz");
      return (b.addedDate||"").localeCompare(a.addedDate||"");
    });

  const stats = {
    total:opps.length,
    active:opps.filter(o=>["Pursuing","Submitted"].includes(o.status)).length,
    strong:opps.filter(o=>o.scoring?.tier==="Strong Match").length,
    unscored:opps.filter(o=>!o.scoring).length,
  };

  const P={background:BLUE,color:"#fff",border:`1px solid ${BLUE}`,padding:"8px 20px",fontSize:13,cursor:"pointer",fontFamily:"inherit"};
  const O={background:"transparent",color:CHAR,border:`1px solid ${RULE}`,padding:"7px 18px",fontSize:12,cursor:"pointer",fontFamily:"inherit"};
  const I={width:"100%",padding:"8px 0",border:"none",borderBottom:`1px solid ${RULE}`,fontSize:14,background:"transparent",outline:"none",color:CHAR,fontFamily:"inherit"};
  const L={display:"block",fontSize:10,fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,marginBottom:6};
  const SE={border:`1px solid ${RULE}`,background:"#fff",color:CHAR,fontSize:12,padding:"6px 10px",cursor:"pointer",outline:"none",fontFamily:"inherit"};

  const op = sel?(opps.find(o=>o.id===sel.id)||sel):null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#fff"}}>

      {/* HEADER */}
      <header style={{background:"#fff",borderBottom:`1px solid ${RULE}`,padding:"0 48px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:16}}>
          <span style={{fontSize:17,fontWeight:200,color:BLUE,letterSpacing:"0.01em"}}>LeBlanc Jones Landscape Architects</span>
          <span style={{fontSize:11,color:MUTED,letterSpacing:"0.06em"}}>Public Work Pipeline</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {stats.unscored>0&&<button style={O} onClick={scoreAll}>Score All ({stats.unscored})</button>}
          <button style={O} onClick={()=>setView("add")}>Add Manually</button>
          <button style={{...O,fontSize:11,padding:"6px 12px"}} onClick={()=>setShowKeyInput(!showKeyInput)} title="SAM.gov API Key">⚙ API Key</button>
          <button style={P} onClick={search} disabled={searching}>{searching?"Searching…":"Search All Sources"}</button>
        </div>
      </header>

      {/* API KEY BAR */}
      {showKeyInput&&(
        <div style={{background:"#f0f4fb",borderBottom:`1px solid ${RULE}`,padding:"12px 48px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <span style={{fontSize:12,color:CHAR}}>SAM.gov API Key</span>
          <input style={{...I,width:360,fontSize:12}} placeholder="SAM-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={apiKey} onChange={e=>setApiKey(e.target.value)}/>
          <button style={P} onClick={()=>{saveKey(apiKey);setShowKeyInput(false);setLog("API key saved");}}>Save</button>
          <button style={O} onClick={()=>setShowKeyInput(false)}>Cancel</button>
          <a href="https://sam.gov/workspace/profile/account-details" target="_blank" rel="noreferrer" style={{fontSize:11,color:BLUE}}>Get free key at sam.gov →</a>
        </div>
      )}

      {/* STATS + SOURCE LINKS */}
      <div style={{background:"#f9f9f8",borderBottom:`1px solid ${RULE}`,padding:"0 48px",height:50,display:"flex",alignItems:"center",gap:36,flexShrink:0}}>
        {[["Total",stats.total],["Active",stats.active],["Strong Matches",stats.strong]].map(([l,v])=>(
          <div key={l} style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{fontSize:18,fontWeight:200,color:BLUE}}>{v}</span>
            <span style={{fontSize:11,color:MUTED}}>{l}</span>
          </div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:16}}>
          <span style={{fontSize:10,color:MUTED,letterSpacing:"0.1em",textTransform:"uppercase"}}>Browse manually:</span>
          {[
            ["SAM.gov","https://sam.gov/search/?index=opp&keywords=landscape+architecture&sort=-modifiedDate"],
            ["COMMBUYS","https://www.commbuys.com/bso/external/publicBids.sdo?docType=BD&keyword=landscape&statusCode=A"],
            ["City of Boston","https://www.boston.gov/bid-listings"],
            ["BostonPlans","https://www.bostonplans.org/procurement/procurement-portal"],
          ].map(([l,u])=>(
            <a key={l} href={u} target="_blank" rel="noreferrer"
              style={{fontSize:11,color:BLUE,textDecoration:"none",borderBottom:`1px solid transparent`}}
              onMouseEnter={e=>e.target.style.borderBottomColor=BLUE}
              onMouseLeave={e=>e.target.style.borderBottomColor="transparent"}>{l} ↗</a>
          ))}
        </div>
        {log&&<span style={{marginLeft:16,fontSize:11,color:MUTED,fontStyle:"italic",maxWidth:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log}</span>}
      </div>

      {/* FILTER BAR */}
      {view==="board"&&(
        <div style={{background:"#fff",borderBottom:`1px solid ${RULE}`,padding:"0 48px",height:44,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:11,color:MUTED,marginRight:4}}>Filter</span>
          <select style={SE} value={fTier} onChange={e=>setFTier(e.target.value)}>
            <option value="All">All Tiers</option>{TIERS.map(t=><option key={t}>{t}</option>)}
          </select>
          <select style={SE} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="All">All Statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <select style={SE} value={fSource} onChange={e=>setFSource(e.target.value)}>
            <option value="All">All Sources</option>{SOURCES.map(s=><option key={s}>{s}</option>)}
          </select>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:MUTED}}>Sort</span>
            <select style={SE} value={sort} onChange={e=>setSort(e.target.value)}>
              <option value="score">Fit Score</option>
              <option value="deadline">Deadline</option>
              <option value="added">Date Added</option>
            </select>
            <span style={{fontSize:11,color:"#ccc",marginLeft:6}}>{filtered.length} results</span>
          </div>
        </div>
      )}

      {/* BOARD */}
      {view==="board"&&(
        <div style={{flex:1,overflowY:"auto",padding:"32px 48px"}}>
          {filtered.length===0?(
            <div style={{textAlign:"center",padding:"80px 0"}}>
              <p style={{fontSize:13,color:MUTED,marginBottom:8}}>No opportunities yet.</p>
              <p style={{fontSize:12,color:"#ccc",marginBottom:24}}>
                Click <strong>Search All Sources</strong> to pull live landscape architecture RFPs from SAM.gov, COMMBUYS, and the City of Boston.
              </p>
              <button style={P} onClick={search} disabled={searching}>{searching?"Searching…":"Search All Sources"}</button>
            </div>
          ):(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${CHAR}`}}>
                  {["Score","Project","Agency / Source","Location","Deadline","Status",""].map(h=>(
                    <th key={h} style={{padding:"6px 14px 12px",textAlign:"left",fontSize:10,fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o=>(
                  <tr key={o.id}
                    onClick={()=>{setSel(o);setView("detail");}}
                    style={{borderBottom:`1px solid ${RULE}`,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f7f9fc"}
                    onMouseLeave={e=>e.currentTarget.style.background="#fff"}
                  >
                    <td style={{padding:"14px",width:56}}>
                      {o.scoring
                        ?<Ring score={o.scoring.score} size={42}/>
                        :<button style={{...O,padding:"4px 10px",fontSize:10}} onClick={e=>{e.stopPropagation();scoreOne(o.id);}}>Score</button>
                      }
                    </td>
                    <td style={{padding:"14px",maxWidth:320}}>
                      <div style={{fontSize:14,fontWeight:400,color:"#000",lineHeight:1.35,marginBottom:4}}>{o.title}</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {o.scoring&&<Dots tier={o.scoring.tier}/>}
                      </div>
                    </td>
                    <td style={{padding:"14px",maxWidth:200}}>
                      <div style={{fontSize:13,color:CHAR,fontWeight:300,marginBottom:4}}>{o.agency}</div>
                      <SourceBadge source={o.source}/>
                    </td>
                    <td style={{padding:"14px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>{o.location}</td>
                    <td style={{padding:"14px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>
                      {o.deadline&&o.deadline!=="TBD"?o.deadline:<span style={{color:"#ccc"}}>TBD</span>}
                    </td>
                    <td style={{padding:"14px"}}>
                      <span style={{fontSize:11,color:statusClr(o.status)}}>{o.status}</span>
                    </td>
                    <td style={{padding:"14px",textAlign:"right",color:"#ccc",fontSize:16}}>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* DETAIL */}
      {view==="detail"&&op&&(
        <div style={{flex:1,overflowY:"auto",padding:"40px 48px",maxWidth:820}}>
          <button style={{...O,marginBottom:36}} onClick={()=>setView("board")}>← Back to Pipeline</button>
          <div style={{marginBottom:32}}>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,color:MUTED,border:`1px solid ${RULE}`,padding:"2px 9px"}}>{op.type||"RFP"}</span>
              {op.state&&<span style={{fontSize:11,color:MUTED,border:`1px solid ${RULE}`,padding:"2px 9px"}}>{op.state}</span>}
              <SourceBadge source={op.source}/>
              {op.scoring&&<Pill rec={op.scoring.recommendation}/>}
              <span style={{fontSize:11,color:statusClr(op.status)}}>{op.status}</span>
            </div>
            <h1 style={{fontSize:26,fontWeight:200,color:"#000",lineHeight:1.3,marginBottom:8}}>{op.title}</h1>
            <div style={{fontSize:14,color:MUTED,fontWeight:300}}>{op.agency} · {op.location}</div>
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",padding:"24px 0"}}>
            {[["Deadline",op.deadline||"TBD"],["Budget",op.budget||"Not disclosed"],["Posted",op.postedDate||"—"]].map(([l,v])=>(
              <div key={l}><span style={L}>{l}</span><span style={{fontSize:14,fontWeight:300,color:CHAR}}>{v}</span></div>
            ))}
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{padding:"24px 0"}}>
            <span style={L}>Description</span>
            <p style={{fontSize:14,lineHeight:1.75,fontWeight:300,color:CHAR,marginBottom:14}}>{op.description||"No description available."}</p>
            {op.sourceUrl&&<a href={op.sourceUrl} target="_blank" rel="noreferrer" style={{fontSize:12,color:BLUE}}>View original posting →</a>}
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{padding:"24px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <span style={L}>Fit Analysis</span>
              <button style={O} onClick={()=>scoreOne(op.id)}>Re-Score</button>
            </div>
            {op.scoring?(
              <div style={{display:"flex",alignItems:"center",gap:24}}>
                <Ring score={op.scoring.score} size={64}/>
                <div><Dots tier={op.scoring.tier}/><div style={{marginTop:10}}><Pill rec={op.scoring.recommendation}/></div></div>
                <p style={{fontSize:12,color:MUTED,lineHeight:1.6,maxWidth:400}}>
                  Scored on design keyword relevance, New England geography, estimated budget, and solicitation type.
                </p>
              </div>
            ):<p style={{fontSize:13,color:"#ccc"}}>Not scored yet.</p>}
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{padding:"24px 0"}}>
            <span style={{...L,marginBottom:14}}>Status</span>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:28}}>
              {STATUSES.map(s=>(
                <button key={s} style={{...O,borderColor:op.status===s?BLUE:RULE,color:op.status===s?BLUE:CHAR,fontWeight:op.status===s?500:400,fontSize:12}}
                  onClick={()=>updateStatus(op.id,s)}>{s}</button>
              ))}
            </div>
            <span style={{...L,marginBottom:12}}>Notes</span>
            {!(op.notes||[]).length&&<p style={{fontSize:12,color:"#ccc",marginBottom:16}}>No notes yet.</p>}
            {(op.notes||[]).map((n,i)=>(
              <div key={i} style={{borderLeft:`2px solid ${RULE}`,paddingLeft:16,marginBottom:14}}>
                <p style={{fontSize:13,fontWeight:300,color:CHAR,lineHeight:1.6}}>{n.text}</p>
                <span style={{fontSize:10,color:"#ccc"}}>{n.date}</span>
              </div>
            ))}
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <input style={{...I,flex:1}} placeholder="Add a note…" value={note}
                onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNote(op.id)}/>
              <button style={O} onClick={()=>addNote(op.id)}>Add</button>
            </div>
          </div>
          <div style={{borderTop:`1px solid ${RULE}`,paddingTop:24,textAlign:"right"}}>
            <button style={{...O,color:"#ccc",fontSize:11}} onClick={()=>{if(window.confirm("Remove this opportunity?"))del(op.id);}}>Remove from Pipeline</button>
          </div>
        </div>
      )}

      {/* ADD FORM */}
      {view==="add"&&(
        <div style={{flex:1,overflowY:"auto",padding:"40px 48px",maxWidth:680}}>
          <button style={{...O,marginBottom:36}} onClick={()=>setView("board")}>← Back</button>
          <h2 style={{fontSize:22,fontWeight:200,color:"#000",marginBottom:36}}>Add Opportunity Manually</h2>
          <form onSubmit={addManual}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"28px 32px"}}>
              {[["title","Project Title",2,"text"],["agency","Issuing Agency",2,"text"],["location","City, State",1,"text"],["state","State",1,"text"],["deadline","Deadline",1,"date"],["budget","Budget / Fee",1,"text"],["postedDate","Date Posted",1,"date"]].map(([k,label,span,type])=>(
                <div key={k} style={{gridColumn:`span ${span}`}}>
                  <label style={L}>{label}</label>
                  <input style={I} type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} required={k==="title"||k==="agency"}/>
                </div>
              ))}
              <div style={{gridColumn:"span 1"}}>
                <label style={L}>Type</label>
                <select style={{...I,cursor:"pointer"}} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                  {["RFP","RFQ","RFI","EOI"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={L}>Source URL</label>
                <input style={I} type="url" value={form.sourceUrl} onChange={e=>setForm(f=>({...f,sourceUrl:e.target.value}))}/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={L}>Description</label>
                <textarea style={{...I,resize:"vertical",minHeight:100}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:"flex",gap:12,marginTop:40}}>
              <button type="submit" style={P}>Add to Pipeline</button>
              <button type="button" style={O} onClick={()=>setView("board")}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
