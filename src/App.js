import { useState, useEffect, useCallback } from "react";
import './index.css';

// ── Config ────────────────────────────────────────────────────────
const BLUE = "#3c75bf", CHAR = "#575759", MUTED = "rgba(87,87,89,0.61)", RULE = "#e8e8e8";

const DESIGN_KEYWORDS = [
  "landscape architecture","placemaking","urban design","public realm","streetscape",
  "waterfront","park design","plaza","promenade","green infrastructure","open space",
  "campus","cultural","civic","community park","trail","greenway","riverwalk",
  "town center","master plan","design services"
];
const ENGINEERING_KEYWORDS = [
  "civil engineering","stormwater","utilities","pavement","road construction",
  "maintenance","mowing","snow removal","janitorial","inspection only"
];
const MA_CITIES = [
  "boston","cambridge","somerville","brookline","newton","quincy","worcester",
  "springfield","lowell","lynn","fall river","new bedford","brockton","lawrence",
  "medford","malden","waltham","haverhill","gloucester","northampton","amherst",
  "pittsfield","chicopee","holyoke","fitchburg","leominster","revere","taunton",
  "barnstable","falmouth","plymouth","sandwich","yarmouth","dennis","brewster",
  "chatham","eastham","wellfleet","truro","provincetown","cape cod","martha's vineyard",
  "nantucket","lexington","concord","lincoln","sudbury","acton","arlington",
  "belmont","watertown","needham","wellesley","dedham","milton","canton"
];
const NE_STATES = ["massachusetts","ma","connecticut","ct","rhode island","ri",
  "new hampshire","nh","vermont","vt","maine","me"];
const NY_STATES = ["new york","ny","new jersey","nj","pennsylvania","pa"];

function scoreOpportunity(opp) {
  const text = `${opp.title} ${opp.description} ${opp.agency} ${opp.location}`.toLowerCase();
  let score = 0;

  // Design sophistication (35%)
  const designHits = DESIGN_KEYWORDS.filter(k => text.includes(k)).length;
  const engHits = ENGINEERING_KEYWORDS.filter(k => text.includes(k)).length;
  const designScore = Math.min(35, designHits * 8 - engHits * 10);
  score += Math.max(0, designScore);

  // Geography (25%)
  const isMa = MA_CITIES.some(c => text.includes(c)) || text.includes(" ma ") || text.includes("massachusetts");
  const isNE = NE_STATES.some(s => text.includes(s));
  const isNY = NY_STATES.some(s => text.includes(s));
  if (isMa) score += 25;
  else if (isNE) score += 20;
  else if (isNY) score += 15;
  else score += 5;

  // Budget (20%) — look for dollar amounts
  const budgetMatch = text.match(/\$[\d,]+[km]?/g);
  if (budgetMatch) {
    const amounts = budgetMatch.map(b => {
      const n = parseFloat(b.replace(/[$,]/g, ""));
      if (b.toLowerCase().includes("m")) return n * 1000000;
      if (b.toLowerCase().includes("k")) return n * 1000;
      return n;
    });
    const max = Math.max(...amounts);
    if (max >= 1000000) score += 20;
    else if (max >= 500000) score += 16;
    else if (max >= 200000) score += 10;
    else if (max >= 50000) score += 5;
  } else {
    score += 10; // unknown budget — give partial credit
  }

  // Project type (20%)
  if (text.includes("rfp") || text.includes("request for proposal")) score += 20;
  else if (text.includes("rfq") || text.includes("request for qualifications")) score += 15;
  else if (text.includes("rfi")) score += 8;

  score = Math.min(100, Math.max(0, score));

  let tier, recommendation;
  if (score >= 75) { tier = "Strong Match"; recommendation = "Pursue"; }
  else if (score >= 55) { tier = "Good Match"; recommendation = "Pursue"; }
  else if (score >= 35) { tier = "Possible Match"; recommendation = "Monitor"; }
  else { tier = "Poor Match"; recommendation = "Pass"; }

  return { score, tier, recommendation };
}

// ── SAM.gov API ────────────────────────────────────────────────────
async function fetchSAMgov(apiKey) {
  const today = new Date();
  const past60 = new Date(today - 60 * 86400000);
  const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;

  const keywords = [
    "landscape architecture",
    "park design",
    "streetscape",
    "public realm design",
    "urban design",
    "waterfront design"
  ];

  const results = [];
  const seen = new Set();

  for (const kw of keywords) {
    const url = `https://api.sam.gov/opportunities/v2/search?limit=10&keywords=${encodeURIComponent(kw)}&postedFrom=${fmt(past60)}&postedTo=${fmt(today)}&ptype=o&api_key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.opportunitiesData || [])) {
        if (seen.has(item.noticeId)) continue;
        seen.add(item.noticeId);
        results.push({
          id: `sam_${item.noticeId}`,
          title: item.title || "Untitled",
          agency: item.organizationName || item.fullParentPathName || "Federal Agency",
          type: (item.type || "RFP").toUpperCase(),
          location: `${item.placeOfPerformance?.city?.name || ""}, ${item.placeOfPerformance?.state?.code || ""}`.replace(/^, |, $/g, "") || "See solicitation",
          state: item.placeOfPerformance?.state?.code || "",
          deadline: item.responseDeadLine ? item.responseDeadLine.split("T")[0] : "TBD",
          budget: "",
          description: item.description || item.title || "",
          sourceUrl: `https://sam.gov/opp/${item.noticeId}/view`,
          postedDate: item.postedDate ? item.postedDate.split("T")[0] : "",
          status: "New",
          notes: [],
          scoring: null,
          addedDate: new Date().toISOString().split("T")[0],
        });
      }
    } catch (e) { console.warn("SAM fetch error:", e); }
  }
  return results;
}

// ── Storage ────────────────────────────────────────────────────────
const SK = "ljla_v5";
const load = () => { try { return JSON.parse(localStorage.getItem(SK) || "[]"); } catch { return []; } };
const save = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };
const loadKey = () => localStorage.getItem("ljla_sam_key") || "";
const saveKey = (k) => localStorage.setItem("ljla_sam_key", k);

const TIERS = ["Strong Match","Good Match","Possible Match","Poor Match"];
const STATUSES = ["New","Reviewing","Pursuing","Submitted","Won","Passed"];
const STATES = ["MA","NH","VT","ME","RI","CT","NY","NJ","PA"];

// ── Mini components ────────────────────────────────────────────────
function Ring({ score, size=42 }) {
  const r = size/2-4, c = 2*Math.PI*r, f = (score/100)*c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={RULE} strokeWidth={3}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={BLUE} strokeWidth={3}
        strokeDasharray={`${f} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={size>50?13:10} fontWeight="400"
        fill={BLUE} fontFamily="'Nunito Sans',sans-serif">{score}</text>
    </svg>
  );
}
function Dots({ tier }) {
  const n = {"Strong Match":4,"Good Match":3,"Possible Match":2,"Poor Match":1}[tier]||0;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3}}>
      {[1,2,3,4].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:i<=n?BLUE:"#e0e0e0",display:"inline-block"}}/>)}
      <span style={{marginLeft:6,fontSize:11,color:CHAR,fontWeight:400}}>{tier}</span>
    </span>
  );
}
function Pill({ rec }) {
  const clr = {Pursue:BLUE,Monitor:"#8a7f3c",Pass:"#aaa"}[rec]||"#aaa";
  return <span style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:clr,border:`1px solid ${clr}`,padding:"2px 10px"}}>{rec}</span>;
}
function statusClr(s) {
  if (["Pursuing","Submitted","Won"].includes(s)) return BLUE;
  if (s==="Passed") return "#bbb";
  return CHAR;
}

// ── Main App ───────────────────────────────────────────────────────
export default function App() {
  const [opps, setOpps] = useState(load);
  const [view, setView] = useState("board");
  const [sel, setSel] = useState(null);
  const [searching, setSearching] = useState(false);
  const [log, setLog] = useState("");
  const [fTier, setFTier] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fState, setFState] = useState("All");
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
    setLog("Searching SAM.gov…");
    try {
      const found = await fetchSAMgov(apiKey);
      if (!found.length) throw new Error("No results — check your API key or try again");
      const scored = found.map(f => ({ ...f, scoring: scoreOpportunity(f) }));
      const merged = [...opps];
      for (const op of scored) {
        if (!merged.find(e => e.title?.toLowerCase()===op.title?.toLowerCase() && e.agency===op.agency)) merged.push(op);
      }
      persist(merged);
      setLog(`${scored.length} opportunities found & scored`);
    } catch(e) { setLog("Error: " + e.message); }
    setSearching(false);
  }

  const scoreOne = (id) => {
    persist(opps.map(o => o.id===id ? {...o, scoring: scoreOpportunity(o)} : o));
  };
  const scoreAll = () => persist(opps.map(o => ({...o, scoring: scoreOpportunity(o)})));
  const updateStatus = (id,s) => persist(opps.map(o=>o.id===id?{...o,status:s}:o));
  const addNote = (id) => {
    if (!note.trim()) return;
    persist(opps.map(o=>o.id===id?{...o,notes:[...(o.notes||[]),{text:note.trim(),date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}]}:o));
    setNote("");
  };
  const del = (id) => { persist(opps.filter(o=>o.id!==id)); setView("board"); };
  const addManual = (e) => {
    e.preventDefault();
    const scored = { ...form, id:`m_${Date.now()}`, status:"New", notes:[], scoring:scoreOpportunity(form), addedDate:new Date().toISOString().split("T")[0] };
    persist([...opps, scored]);
    setForm({title:"",agency:"",type:"RFP",location:"",state:"MA",deadline:"",budget:"",description:"",sourceUrl:"",postedDate:""});
    setView("board");
  };

  const filtered = opps
    .filter(o=>fTier==="All"||o.scoring?.tier===fTier)
    .filter(o=>fStatus==="All"||o.status===fStatus)
    .filter(o=>fState==="All"||o.state===fState)
    .sort((a,b)=>{
      if (sort==="score") return (b.scoring?.score||0)-(a.scoring?.score||0);
      if (sort==="deadline") return (a.deadline||"zzz").localeCompare(b.deadline||"zzz");
      return (b.addedDate||"").localeCompare(a.addedDate||"");
    });

  const stats = {
    total: opps.length,
    active: opps.filter(o=>["Pursuing","Submitted"].includes(o.status)).length,
    strong: opps.filter(o=>o.scoring?.tier==="Strong Match").length,
    unscored: opps.filter(o=>!o.scoring).length,
  };

  const P = { background:BLUE,color:"#fff",border:`1px solid ${BLUE}`,padding:"8px 20px",fontSize:13,fontWeight:400,letterSpacing:"0.02em",cursor:"pointer",fontFamily:"inherit" };
  const O = { background:"transparent",color:CHAR,border:`1px solid ${RULE}`,padding:"7px 18px",fontSize:12,fontWeight:400,cursor:"pointer",fontFamily:"inherit" };
  const I = { width:"100%",padding:"8px 0",border:"none",borderBottom:`1px solid ${RULE}`,fontSize:14,fontWeight:300,background:"transparent",outline:"none",color:CHAR,fontFamily:"inherit" };
  const L = { display:"block",fontSize:10,fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,marginBottom:6 };
  const SE = { border:`1px solid ${RULE}`,background:"#fff",color:CHAR,fontSize:12,padding:"6px 10px",cursor:"pointer",outline:"none",fontFamily:"inherit",fontWeight:400 };

  const op = sel ? (opps.find(o=>o.id===sel.id)||sel) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#fff"}}>

      {/* HEADER */}
      <header style={{background:"#fff",borderBottom:`1px solid ${RULE}`,padding:"0 48px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:16}}>
          <span style={{fontSize:17,fontWeight:200,color:BLUE,letterSpacing:"0.01em"}}>LeBlanc Jones Landscape Architects</span>
          <span style={{fontSize:11,color:MUTED,fontWeight:300,letterSpacing:"0.06em"}}>Public Work Pipeline</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {stats.unscored>0 && <button style={O} onClick={scoreAll}>Score All ({stats.unscored})</button>}
          <button style={O} onClick={()=>setView("add")}>Add Opportunity</button>
          <button style={{...O,fontSize:11,padding:"6px 12px"}} onClick={()=>setShowKeyInput(!showKeyInput)} title="SAM.gov API Key">⚙ API Key</button>
          <button style={P} onClick={search} disabled={searching}>{searching?"Searching…":"Search SAM.gov"}</button>
        </div>
      </header>

      {/* API KEY BANNER */}
      {showKeyInput && (
        <div style={{background:"#f0f4fb",borderBottom:`1px solid ${RULE}`,padding:"12px 48px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <span style={{fontSize:12,color:CHAR,fontWeight:400}}>SAM.gov API Key</span>
          <input style={{...I,width:340,fontSize:12}} placeholder="Paste your free SAM.gov API key here…"
            value={apiKey} onChange={e=>setApiKey(e.target.value)}/>
          <button style={P} onClick={()=>{ saveKey(apiKey); setShowKeyInput(false); setLog("API key saved"); }}>Save</button>
          <button style={O} onClick={()=>setShowKeyInput(false)}>Cancel</button>
          <a href="https://sam.gov/profile/details" target="_blank" rel="noreferrer" style={{fontSize:11,color:BLUE}}>Get free key at sam.gov →</a>
        </div>
      )}

      {/* STAT BAR */}
      <div style={{background:"#f9f9f8",borderBottom:`1px solid ${RULE}`,padding:"0 48px",height:44,display:"flex",alignItems:"center",gap:40,flexShrink:0}}>
        {[["Total",stats.total],["Pursuing / Submitted",stats.active],["Strong Matches",stats.strong],["Unscored",stats.unscored]].map(([l,v])=>(
          <div key={l} style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:18,fontWeight:200,color:BLUE}}>{v}</span>
            <span style={{fontSize:11,color:MUTED}}>{l}</span>
          </div>
        ))}
        {log && <span style={{marginLeft:"auto",fontSize:12,color:MUTED,fontStyle:"italic"}}>{log}</span>}
      </div>

      {/* FILTER BAR */}
      {view==="board" && (
        <div style={{background:"#fff",borderBottom:`1px solid ${RULE}`,padding:"0 48px",height:44,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:11,color:MUTED,marginRight:4}}>Filter</span>
          <select style={SE} value={fTier} onChange={e=>setFTier(e.target.value)}>
            <option value="All">All Tiers</option>{TIERS.map(t=><option key={t}>{t}</option>)}
          </select>
          <select style={SE} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="All">All Statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <select style={SE} value={fState} onChange={e=>setFState(e.target.value)}>
            <option value="All">All States</option>{STATES.map(s=><option key={s}>{s}</option>)}
          </select>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:MUTED}}>Sort by</span>
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
      {view==="board" && (
        <div style={{flex:1,overflowY:"auto",padding:"32px 48px"}}>
          {filtered.length===0 ? (
            <div style={{textAlign:"center",padding:"100px 0"}}>
              <div style={{fontSize:13,color:MUTED,marginBottom:20}}>
                {opps.length===0 ? "No opportunities yet." : "No results match your filters."}
              </div>
              {opps.length===0 && (
                <div>
                  <p style={{fontSize:12,color:MUTED,marginBottom:16}}>
                    To search SAM.gov, you need a free API key.<br/>
                    <a href="https://sam.gov/profile/details" target="_blank" rel="noreferrer" style={{color:BLUE}}>
                      Get yours free at sam.gov →
                    </a> (no credit card)
                  </p>
                  <button style={P} onClick={()=>setShowKeyInput(true)}>Enter API Key & Search</button>
                </div>
              )}
            </div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${CHAR}`}}>
                  {["Score","Project","Agency","Location","Deadline","Status",""].map(h=>(
                    <th key={h} style={{padding:"6px 14px 12px",textAlign:"left",fontSize:10,fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o=>(
                  <tr key={o.id}
                    onClick={()=>{setSel(o);setView("detail");}}
                    style={{borderBottom:`1px solid ${RULE}`,cursor:"pointer",background:"#fff"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f7f9fc"}
                    onMouseLeave={e=>e.currentTarget.style.background="#fff"}
                  >
                    <td style={{padding:"14px",width:60}}>
                      {o.scoring
                        ? <Ring score={o.scoring.score} size={42}/>
                        : <button style={{...O,padding:"4px 10px",fontSize:10}} onClick={e=>{e.stopPropagation();scoreOne(o.id);}}>Score</button>
                      }
                    </td>
                    <td style={{padding:"14px",maxWidth:300}}>
                      <div style={{fontSize:14,fontWeight:400,color:"#000",lineHeight:1.35,marginBottom:3}}>{o.title}</div>
                      {o.scoring && <Dots tier={o.scoring.tier}/>}
                    </td>
                    <td style={{padding:"14px",fontSize:13,color:CHAR,fontWeight:300,maxWidth:200}}>{o.agency}</td>
                    <td style={{padding:"14px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>{o.location}</td>
                    <td style={{padding:"14px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>
                      {o.deadline&&o.deadline!=="TBD"?o.deadline:<span style={{color:"#ccc"}}>TBD</span>}
                    </td>
                    <td style={{padding:"14px"}}>
                      <span style={{fontSize:11,fontWeight:400,color:statusClr(o.status)}}>{o.status}</span>
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
      {view==="detail" && op && (
        <div style={{flex:1,overflowY:"auto",padding:"40px 48px",maxWidth:800}}>
          <button style={{...O,marginBottom:36,fontSize:12}} onClick={()=>setView("board")}>← Back to Pipeline</button>
          <div style={{marginBottom:36}}>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,color:MUTED,border:`1px solid ${RULE}`,padding:"2px 9px"}}>{op.type}</span>
              <span style={{fontSize:11,color:MUTED,border:`1px solid ${RULE}`,padding:"2px 9px"}}>{op.state}</span>
              {op.scoring && <Pill rec={op.scoring.recommendation}/>}
              <span style={{fontSize:11,color:statusClr(op.status)}}>{op.status}</span>
            </div>
            <h1 style={{fontSize:26,fontWeight:200,color:"#000",lineHeight:1.3,marginBottom:8}}>{op.title}</h1>
            <div style={{fontSize:14,color:MUTED,fontWeight:300}}>{op.agency} · {op.location}</div>
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",padding:"28px 0"}}>
            {[["Deadline",op.deadline||"TBD"],["Budget",op.budget||"Not disclosed"],["Posted",op.postedDate||"—"]].map(([l,v])=>(
              <div key={l}><span style={L}>{l}</span><span style={{fontSize:14,fontWeight:300,color:CHAR}}>{v}</span></div>
            ))}
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{padding:"28px 0"}}>
            <span style={L}>Description</span>
            <p style={{fontSize:14,lineHeight:1.75,fontWeight:300,color:CHAR}}>{op.description||"No description available."}</p>
            {op.sourceUrl && <a href={op.sourceUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:14,fontSize:12,color:BLUE}}>View on SAM.gov →</a>}
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{padding:"28px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <span style={L}>Fit Analysis</span>
              <button style={P} onClick={()=>scoreOne(op.id)}>Re-Score</button>
            </div>
            {op.scoring ? (
              <div>
                <div style={{display:"flex",alignItems:"center",gap:24,marginBottom:20}}>
                  <Ring score={op.scoring.score} size={64}/>
                  <div><Dots tier={op.scoring.tier}/><div style={{marginTop:10}}><Pill rec={op.scoring.recommendation}/></div></div>
                </div>
                <p style={{fontSize:13,color:MUTED,lineHeight:1.6}}>
                  Score based on design keyword match, geography, budget indicators, and solicitation type.
                </p>
              </div>
            ) : <p style={{fontSize:13,color:"#ccc"}}>No analysis yet.</p>}
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{padding:"28px 0"}}>
            <span style={{...L,marginBottom:14}}>Status</span>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:32}}>
              {STATUSES.map(s=>(
                <button key={s} style={{...O,borderColor:op.status===s?BLUE:RULE,color:op.status===s?BLUE:CHAR,fontWeight:op.status===s?500:400,fontSize:12}}
                  onClick={()=>updateStatus(op.id,s)}>{s}</button>
              ))}
            </div>
            <span style={{...L,marginBottom:12}}>Notes</span>
            {!(op.notes||[]).length && <p style={{fontSize:12,color:"#ccc",marginBottom:16}}>No notes yet.</p>}
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
            <button style={{...O,color:"#ccc",borderColor:RULE,fontSize:11}} onClick={()=>{if(window.confirm("Remove?"))del(op.id);}}>Remove from Pipeline</button>
          </div>
        </div>
      )}

      {/* ADD FORM */}
      {view==="add" && (
        <div style={{flex:1,overflowY:"auto",padding:"40px 48px",maxWidth:680}}>
          <button style={{...O,marginBottom:36}} onClick={()=>setView("board")}>← Back</button>
          <h2 style={{fontSize:22,fontWeight:200,color:"#000",marginBottom:36}}>Add Opportunity</h2>
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
