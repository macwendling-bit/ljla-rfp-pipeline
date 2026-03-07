import { useState, useEffect, useCallback } from "react";
import './index.css';

const API_KEY = process.env.REACT_APP_ANTHROPIC_KEY || "";

const FIRM_PROFILE = `LeBlanc Jones Landscape Architects is a Boston-based landscape architecture firm with offices in Boston (535 Albany St) and Falmouth, Cape Cod, MA.
STRENGTHS: High-design landscape architecture, placemaking, parks, streetscapes, waterfronts, campus grounds. Award-winning, design-forward.
IDEAL PROJECTS: Significant design component, $500K+ construction budgets, municipalities with design-forward leadership, universities, cultural institutions. MA/Boston priority, then New England, then CT/NY/NJ/PA. NOT a fit: pure engineering, small budgets, maintenance contracts.`;

const SEARCH_PROMPT = `You are a procurement researcher for a landscape architecture firm. Search for REAL, CURRENT public RFP/RFQ/RFI solicitations for landscape architecture, parks, streetscapes, waterfront, campus grounds, or public realm design posted in the last 60 days. Regions: Massachusetts, New England, Connecticut, New York, New Jersey, Pennsylvania.
Return ONLY a JSON array, no preamble, no markdown. Each item: {"title","agency","type","location","state","deadline","budget","description","sourceUrl","postedDate"}`;

const SCORE_PROMPT = `You score RFP opportunities for LeBlanc Jones Landscape Architects.
Firm: ${FIRM_PROFILE}
Scoring weights: design sophistication 35%, geographic fit (MA=100, NE=80, CT/NY/NJ/PA=60) 25%, budget adequacy 20%, project type alignment 20%.
Return ONLY a JSON object, no preamble: {"score":0-100,"tier":"Strong Match"|"Good Match"|"Possible Match"|"Poor Match","rationale":"2-3 sentences","pros":["..."],"cons":["..."],"recommendation":"Pursue"|"Monitor"|"Pass"}`;

async function callClaude(system, user, useSearch = false) {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: 4000, system, messages: [{ role: "user", content: user }] };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

function parseJSON(raw) {
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  function outer(str, o, c) {
    let s = str.indexOf(o); if (s === -1) return null;
    let d = 0;
    for (let i = s; i < str.length; i++) { if (str[i]===o) d++; else if (str[i]===c) { d--; if (!d) return str.slice(s, i+1); } }
    return null;
  }
  const arr = outer(clean,"[","]");
  if (arr) { try { return JSON.parse(arr); } catch {} }
  const obj = outer(clean,"{","}");
  if (obj) { try { const p=JSON.parse(obj); const av=Object.values(p).find(v=>Array.isArray(v)); return av||p; } catch {} }
  throw new Error("No valid JSON");
}

const SK = "ljla_v4";
const load = () => { try { return JSON.parse(localStorage.getItem(SK)||"[]"); } catch { return []; } };
const save = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };

const TIERS = ["Strong Match","Good Match","Possible Match","Poor Match"];
const STATUSES = ["New","Reviewing","Pursuing","Submitted","Won","Passed"];
const STATES = ["MA","NH","VT","ME","RI","CT","NY","NJ","PA"];
const BLUE = "#3c75bf", CHAR = "#575759", MUTED = "rgba(87,87,89,0.61)", RULE = "#e8e8e8";

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

export default function App() {
  const [opps, setOpps] = useState(load);
  const [view, setView] = useState("board");
  const [sel, setSel] = useState(null);
  const [searching, setSearching] = useState(false);
  const [scoringId, setScoringId] = useState(null);
  const [log, setLog] = useState("");
  const [fTier, setFTier] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fState, setFState] = useState("All");
  const [sort, setSort] = useState("score");
  const [note, setNote] = useState("");
  const [form, setForm] = useState({title:"",agency:"",type:"RFP",location:"",state:"MA",deadline:"",budget:"",description:"",sourceUrl:"",postedDate:""});

  const persist = useCallback(items => { setOpps(items); save(items); }, []);

  useEffect(() => {
    if (sel) { const f=opps.find(o=>o.id===sel.id); if(f) setSel(f); }
  }, [opps]); // eslint-disable-line

  async function search() {
    setSearching(true); setLog("Searching procurement portals…");
    try {
      const raw = await callClaude(SEARCH_PROMPT, "Search for current landscape architecture RFPs in MA, New England, CT, NY, NJ, PA. Return 6-10 as JSON array.", true);
      const parsed = parseJSON(raw);
      const found = Array.isArray(parsed) ? parsed : Object.values(parsed).find(v=>Array.isArray(v))||[];
      if (!found.length) throw new Error("No results — try again");
      const newOps = found.map((f,i)=>({...f,id:`s_${Date.now()}_${i}`,status:"New",notes:[],scoring:null,addedDate:new Date().toISOString().split("T")[0]}));
      const merged = [...opps];
      for (const op of newOps) { if(!merged.find(e=>e.title?.toLowerCase()===op.title?.toLowerCase()&&e.agency===op.agency)) merged.push(op); }
      persist(merged); setLog(`${newOps.length} opportunities found`);
    } catch(e) { setLog("Error: "+e.message); }
    setSearching(false);
  }

  async function score(id) {
    setScoringId(id);
    const op = opps.find(o=>o.id===id);
    try {
      const raw = await callClaude(SCORE_PROMPT, `Score: Title:${op.title} Agency:${op.agency} Location:${op.location} Type:${op.type} Budget:${op.budget} Description:${op.description}`);
      persist(opps.map(o=>o.id===id?{...o,scoring:parseJSON(raw)}:o));
    } catch(e) { console.error(e); }
    setScoringId(null);
  }

  const scoreAll = async () => { for (const op of opps.filter(o=>!o.scoring)) await score(op.id); };
  const updateStatus = (id,s) => persist(opps.map(o=>o.id===id?{...o,status:s}:o));
  const addNote = (id) => {
    if (!note.trim()) return;
    persist(opps.map(o=>o.id===id?{...o,notes:[...(o.notes||[]),{text:note.trim(),date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}]}:o));
    setNote("");
  };
  const del = (id) => { persist(opps.filter(o=>o.id!==id)); setView("board"); };
  const addManual = (e) => {
    e.preventDefault();
    persist([...opps,{...form,id:`m_${Date.now()}`,status:"New",notes:[],scoring:null,addedDate:new Date().toISOString().split("T")[0]}]);
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

  const P = { // Primary btn
    background:BLUE,color:"#fff",border:`1px solid ${BLUE}`,padding:"8px 20px",
    fontSize:13,fontWeight:400,letterSpacing:"0.02em",cursor:"pointer",fontFamily:"inherit",
  };
  const O = { // Outline btn
    background:"transparent",color:CHAR,border:`1px solid ${RULE}`,padding:"7px 18px",
    fontSize:12,fontWeight:400,cursor:"pointer",fontFamily:"inherit",
  };
  const I = { // Input
    width:"100%",padding:"8px 0",border:"none",borderBottom:`1px solid ${RULE}`,
    fontSize:14,fontWeight:300,background:"transparent",outline:"none",color:CHAR,fontFamily:"inherit",
  };
  const L = { // Label
    display:"block",fontSize:10,fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,marginBottom:6,
  };
  const SE = { // Select
    border:`1px solid ${RULE}`,background:"#fff",color:CHAR,fontSize:12,padding:"6px 10px",
    cursor:"pointer",outline:"none",fontFamily:"inherit",fontWeight:400,
  };

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
          {stats.unscored>0 && <button style={O} onClick={scoreAll} disabled={!!scoringId}>{scoringId?"Scoring…":`Score All (${stats.unscored})`}</button>}
          <button style={O} onClick={()=>setView("add")}>Add Opportunity</button>
          <button style={P} onClick={search} disabled={searching}>{searching?"Searching…":"Search for RFPs"}</button>
        </div>
      </header>

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
              <div style={{fontSize:13,color:MUTED,marginBottom:20}}>No opportunities tracked yet.</div>
              <button style={P} onClick={search}>Search for RFPs</button>
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
                    <td style={{padding:"14px 14px",width:60}}>
                      {o.scoring
                        ? <Ring score={o.scoring.score} size={42}/>
                        : <button style={{...O,padding:"4px 10px",fontSize:10}} onClick={e=>{e.stopPropagation();score(o.id);}} disabled={scoringId===o.id}>{scoringId===o.id?"…":"Score"}</button>
                      }
                    </td>
                    <td style={{padding:"14px 14px",maxWidth:300}}>
                      <div style={{fontSize:14,fontWeight:400,color:"#000",lineHeight:1.35,marginBottom:3}}>{o.title}</div>
                      {o.scoring && <Dots tier={o.scoring.tier}/>}
                    </td>
                    <td style={{padding:"14px 14px",fontSize:13,color:CHAR,fontWeight:300,maxWidth:200}}>{o.agency}</td>
                    <td style={{padding:"14px 14px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>{o.location}</td>
                    <td style={{padding:"14px 14px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>
                      {o.deadline&&o.deadline!=="TBD"?o.deadline:<span style={{color:"#ccc"}}>TBD</span>}
                    </td>
                    <td style={{padding:"14px 14px"}}>
                      <span style={{fontSize:11,fontWeight:400,color:statusClr(o.status)}}>{o.status}</span>
                    </td>
                    <td style={{padding:"14px 14px",textAlign:"right",color:"#ccc",fontSize:16}}>›</td>
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
            <p style={{fontSize:14,lineHeight:1.75,fontWeight:300,color:CHAR}}>{op.description}</p>
            {op.sourceUrl && <a href={op.sourceUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:14,fontSize:12,color:BLUE}}>View Original Solicitation →</a>}
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <div style={{padding:"28px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <span style={L}>Fit Analysis</span>
              {!op.scoring && <button style={P} onClick={()=>score(op.id)} disabled={scoringId===op.id}>{scoringId===op.id?"Analyzing…":"Run Analysis"}</button>}
            </div>
            {op.scoring ? (
              <div>
                <div style={{display:"flex",alignItems:"center",gap:24,marginBottom:20}}>
                  <Ring score={op.scoring.score} size={64}/>
                  <div><Dots tier={op.scoring.tier}/><div style={{marginTop:10}}><Pill rec={op.scoring.recommendation}/></div></div>
                </div>
                <p style={{fontSize:14,lineHeight:1.75,fontWeight:300,color:CHAR,marginBottom:24}}>{op.scoring.rationale}</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32}}>
                  <div><span style={L}>Strengths</span>{op.scoring.pros?.map((p,i)=><div key={i} style={{fontSize:13,color:CHAR,fontWeight:300,marginBottom:7,display:"flex",gap:10}}><span style={{color:BLUE,flexShrink:0}}>+</span><span>{p}</span></div>)}</div>
                  <div><span style={L}>Concerns</span>{op.scoring.cons?.map((c,i)=><div key={i} style={{fontSize:13,color:MUTED,fontWeight:300,marginBottom:7,display:"flex",gap:10}}><span style={{flexShrink:0}}>–</span><span>{c}</span></div>)}</div>
                </div>
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

