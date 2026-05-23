import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const MONTHS   = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTHS_S = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const PINK="#FF6EB4", BLUE="#5BC8F5", MINT="#3DD9B3", PEACH="#FFB347", LILA="#C084FC", RED="#FF6B6B";
const BG="#13111A", CARD="#1E1A2E", BORDER="#2E2845";
const ETF_COLORS = [PINK, BLUE, MINT, LILA, PEACH];
const BACKEND_URL = "https://peabloom-backend.onrender.com";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxP_t5i388PWSQQaAsSQDQmB46gli4wzNX2Lzp0Vuh2zS3FexDb_ruDjdpmocZ7-EZT/exec";

const DEFAULT_SETTINGS = {
  peaEtfs: [
    { name:"PEA S&P 500", ticker:"PSP5.FR", emoji:"📈", goal:"", parts:1,  prixMoyen:50.0   },
    { name:"PEA US Tech",  ticker:"PANX.FR", emoji:"💻", goal:"", parts:1,  prixMoyen:62.891 }
  ],
  outsideEtfs: [
    { name:"AI Infrastructure",        ticker:"AIFS.DE", emoji:"🤖", parts:5, prixMoyen:6.584  },
    { name:"Nasdaq 100",               ticker:"ANAV.DE", emoji:"📡", parts:1, prixMoyen:18.468 },
    { name:"S&P 500 Consumer Staples", ticker:"IUCS.UK", emoji:"🛒", parts:5, prixMoyen:9.9275 }
  ]
};

// ─── STORAGE (localStorage uniquement hors Claude) ────────────
async function storageGet(key) {
  try {
    const r = await fetch(`${SHEETS_URL}?key=${key}`);
    const data = await r.json();
    if (data.value != null) return { value: data.value, source: "cloud" };
  } catch {}
  return null;
}
async function storageSet(key, value) {
  try {
    fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ key, value })
    });
  } catch {}
  return "cloud";
}

export default function ETFTracker() {
  const now = new Date();
  const [tab, setTab]           = useState("entry");
  const [investments, setInv]   = useState({});
  const [settings, setCfg]      = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded]     = useState(false);
  const [storageMode, setSMode] = useState(null);
  const [selYear, setSelYear]   = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth()+1);
  const [amounts, setAmounts]   = useState({});
  const [saveMsg, setSaveMsg]   = useState("");
  const [prices, setPrices]     = useState({});
  const [priceLoading, setPL]   = useState(false);
  const [priceMsg, setPriceMsg] = useState("");

  useEffect(()=>{
    if(document.querySelector("#nfont")) return;
    const l=document.createElement("link"); l.id="nfont"; l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap";
    document.head.appendChild(l);
  },[]);

  useEffect(()=>{
    (async()=>{
      const ri=await storageGet("etf5-inv"), rc=await storageGet("etf5-cfg"), rp=await storageGet("etf5-prices");
      let mode="none";
      if(ri){try{setInv(JSON.parse(ri.value)); mode=ri.source;}catch{}}
      if(rc){try{setCfg(s=>({...s,...JSON.parse(rc.value)}));}catch{}}
      if(rp){try{setPrices(JSON.parse(rp.value));}catch{}}
      setSMode(mode); setLoaded(true);
    })();
  },[]);

  useEffect(()=>{
    if(!loaded) return;
    const inv=investments[`${selYear}-${selMonth}`]||{};
    const a={};
    settings.peaEtfs.forEach((_,i)=>{ a[`e${i}`]=inv[`e${i}`]?.toString()||""; });
    setAmounts(a);
  },[selYear,selMonth,loaded,investments,settings.peaEtfs.length]);

  const saveInv = async(updated)=>{
    setInv(updated);
    const mode=await storageSet("etf5-inv",JSON.stringify(updated));
    setSMode(mode); return mode;
  };
  const saveEntry = async()=>{
    const key=`${selYear}-${selMonth}`;
    const entry={};
    settings.peaEtfs.forEach((_,i)=>{ entry[`e${i}`]=+amounts[`e${i}`]||0; });
    const mode=await saveInv({...investments,[key]:entry});
    setSaveMsg(mode==="cloud"?"☁️ Sauvegardé sur le cloud !":"💾 Sauvegardé en local");
    setTimeout(()=>setSaveMsg(""),4000);
  };
  const saveCfg=useCallback(async(s)=>{ setCfg(s); await storageSet("etf5-cfg",JSON.stringify(s)); },[]);

  // ─── Cours via backend Python ─────────────────────────────
  const fetchPrices = async () => {
    setPL(true);
    const allEtfs = [
      ...settings.peaEtfs.map(e => e.ticker),
      ...settings.outsideEtfs.map(e => e.ticker)
    ].filter(Boolean);

    try {
      setPriceMsg("📡 Connexion au serveur...");
      const url = `${BACKEND_URL}/prices?tickers=${allEtfs.join(",")}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();

      const results = {};
      allEtfs.forEach(ticker => {
        if (data[ticker] != null) results[ticker] = data[ticker];
      });

      const found = Object.keys(results).length;
      if (found > 0) {
        setPrices(results);
        await storageSet("etf5-prices", JSON.stringify(results));
        setPriceMsg(`✅ ${found}/${allEtfs.length} cours — ${data.date} à ${data.fetched_at}`);
        setTimeout(() => setPriceMsg(""), 10000);
      } else {
        setPriceMsg("😕 Serveur en réveil — réessaie dans 30s");
      }
    } catch (e) {
      if (e.name === "TimeoutError") {
        setPriceMsg("⏳ Serveur en réveil (30-60s) — réessaie");
      } else {
        setPriceMsg("❌ Erreur réseau — vérifie ta connexion");
      }
    }
    setPL(false);
  };

  // ─── Computed ─────────────────────────────────────────────
  const allYears=[...new Set([...Object.keys(investments).map(k=>+k.split("-")[0]),now.getFullYear()])].sort();
  const totByEtf=settings.peaEtfs.map((_,i)=>Object.values(investments).reduce((s,v)=>s+(v[`e${i}`]||0),0));
  const grand=totByEtf.reduce((a,b)=>a+b,0);
  const getYearEtf=(y,i)=>Array.from({length:12},(_,m)=>investments[`${y}-${m+1}`]?.[`e${i}`]||0).reduce((a,b)=>a+b,0);
  const monthData=MONTHS_S.map((m,mi)=>{
    const inv=investments[`${selYear}-${mi+1}`]||{}, row={m};
    settings.peaEtfs.forEach((etf,i)=>{ row[etf.name]=inv[`e${i}`]||0; }); return row;
  });
  const fmt=v=>`${(+v||0).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
  const fmtPct=v=>`${v>=0?"+":""}${(+v||0).toFixed(2)} %`;
  const hasPrices=Object.keys(prices).length>0;

  const calcGains=(etfs)=>etfs.map(etf=>{
    const invested=(etf.parts||0)*(etf.prixMoyen||0);
    const curPrice=prices[etf.ticker]||null;
    const curVal=curPrice!=null?curPrice*(etf.parts||0):null;
    const gain=curVal!=null?curVal-invested:null;
    const gainPct=gain!=null&&invested>0?(gain/invested)*100:null;
    return {...etf,invested,curPrice,curVal,gain,gainPct};
  });
  const calcGainsPEA=()=>settings.peaEtfs.map((etf,i)=>{
  const totalInvested=Object.values(investments).reduce((s,v)=>s+(v[`e${i}`]||0),0);
  const totalParts=Object.values(investments).filter(v=>(v[`e${i}`]||0)>0).length;
  const avgPrice=totalParts>0?totalInvested/totalParts:(etf.prixMoyen||0);
  const curPrice=prices[etf.ticker]||null;
  const curVal=curPrice!=null?curPrice*totalParts:null;
  const gain=curVal!=null?curVal-totalInvested:null;
  const gainPct=gain!=null&&totalInvested>0?(gain/totalInvested)*100:null;
  return {...etf,invested:totalInvested,parts:totalParts,avgPrice,curPrice,curVal,gain,gainPct};
});

  // ─── Styles ───────────────────────────────────────────────
  const F="Nunito, system-ui, sans-serif";
  const cardStyle=(x={})=>({background:CARD,borderRadius:20,padding:"16px 18px",boxShadow:"0 4px 28px rgba(0,0,0,0.35)",marginBottom:14,border:`1px solid ${BORDER}`,...x});
  const inp=(x={})=>({background:"#0E0C1A",border:`2px solid ${BORDER}`,borderRadius:12,padding:"11px 14px",color:"white",fontSize:14,fontFamily:F,fontWeight:700,width:"100%",outline:"none",boxSizing:"border-box",...x});
  const lbl=(c="#6B5FA0")=>({fontSize:10,fontWeight:800,color:c,textTransform:"uppercase",letterSpacing:0.8});
  const tt={background:"#1E1A2E",border:`1px solid ${BORDER}`,borderRadius:12,fontFamily:F};

  const StorageBadge=()=>{
    const map={cloud:{icon:"☁️",color:MINT,label:"Sync cloud"},local:{icon:"💾",color:PEACH,label:"Local"},none:{icon:"⚠️",color:RED,label:"Pas de mémoire"}};
    const b=storageMode?map[storageMode]:null; if(!b) return null;
    return <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,fontWeight:800,color:b.color,background:`${b.color}18`,padding:"3px 8px",borderRadius:99,border:`1px solid ${b.color}40`}}>{b.icon} {b.label}</div>;
  };
  const Nav=({id,emoji,label})=>{
    const a=tab===id;
    return <button onClick={()=>setTab(id)} style={{flex:1,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"10px 0 8px",cursor:"pointer"}}>
      <span style={{fontSize:20}}>{emoji}</span>
      <span style={{fontSize:9,fontWeight:a?900:600,color:a?PINK:"#4A4270",fontFamily:F}}>{label}</span>
      <div style={{width:a?20:0,height:3,background:`linear-gradient(90deg,${PINK},${LILA})`,borderRadius:99,transition:"width 0.25s"}}/>
    </button>;
  };

  if(!loaded) return <div style={{background:BG,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F}}><div style={{textAlign:"center"}}><div style={{fontSize:52}}>🌸</div><div style={{color:LILA,fontWeight:800,marginTop:10}}>Chargement...</div></div></div>;

  return (
    <div style={{background:BG,minHeight:"100vh",fontFamily:F,maxWidth:480,margin:"0 auto",paddingBottom:90}}>

      {/* HEADER */}
      <div style={{background:CARD,padding:"20px 20px 16px",borderBottom:`1px solid ${BORDER}`,boxShadow:"0 4px 24px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:22,fontWeight:900,color:"white",letterSpacing:-0.5}}>
              <span style={{background:`linear-gradient(90deg,${PINK},${LILA})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>PeaBloom</span> 🌸
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
              <span style={{fontSize:10,color:"#4A4270",fontWeight:700}}>DCA · XTB</span>
              <StorageBadge/>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:25,fontWeight:900,background:`linear-gradient(90deg,${PINK},${LILA})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{fmt(grand)}</div>
            <div style={{fontSize:9,color:"#4A4270",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>total investi PEA</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${settings.peaEtfs.length},1fr)`,gap:10}}>
          {settings.peaEtfs.map((etf,i)=>(
            <div key={i} style={{background:`${ETF_COLORS[i%ETF_COLORS.length]}12`,border:`1.5px solid ${ETF_COLORS[i%ETF_COLORS.length]}30`,borderRadius:14,padding:"10px 12px"}}>
              <div style={{fontSize:11,color:ETF_COLORS[i%ETF_COLORS.length],fontWeight:800}}>{etf.emoji} {etf.name}</div>
              <div style={{fontSize:17,fontWeight:900,color:"white",marginTop:2}}>{fmt(totByEtf[i])}</div>
              <div style={{fontSize:9,color:"#4A4270",fontWeight:700}}>{etf.ticker}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 16px 0"}}>

        {/* ══ SAISIE ══ */}
        {tab==="entry" && <>
          <div style={{fontSize:15,fontWeight:900,color:"white",marginBottom:14}}>✏️ Saisie mensuelle</div>
          <div style={{...cardStyle(),display:"flex",gap:10}}>
            <select value={selMonth} onChange={e=>setSelMonth(+e.target.value)} style={{...inp(),flex:2,cursor:"pointer"}}>
              {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
            </select>
            <select value={selYear} onChange={e=>setSelYear(+e.target.value)} style={{...inp(),flex:1,cursor:"pointer"}}>
              {[...allYears,now.getFullYear()+1].filter((v,i,a)=>a.indexOf(v)===i).sort().map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {(()=>{ const inv=investments[`${selYear}-${selMonth}`]; return inv&&settings.peaEtfs.some((_,i)=>inv[`e${i}`]>0)?<div style={{fontSize:11,fontWeight:800,color:MINT,marginBottom:10,paddingLeft:2}}>✔ Déjà renseigné ce mois — tu peux modifier</div>:null; })()}
          {settings.peaEtfs.map((etf,i)=>{
            const color=ETF_COLORS[i%ETF_COLORS.length], val=+amounts[`e${i}`]||0, goal=+etf.goal||0;
            return <div key={i} style={{...cardStyle(),borderLeft:`4px solid ${color}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div>
                  <div style={{fontSize:14,fontWeight:900,color:"white"}}>{etf.emoji} {etf.name}</div>
                  <div style={{fontSize:10,color:"#4A4270",fontWeight:700}}>{etf.ticker} · PEA</div>
                </div>
                {goal>0&&<div style={{fontSize:11,fontWeight:800,color:val>=goal?MINT:"#4A4270",background:val>=goal?`${MINT}20`:`${BORDER}80`,padding:"3px 10px",borderRadius:99,border:`1px solid ${val>=goal?MINT:BORDER}`}}>{val>=goal?"✓ ":""}obj. {fmt(goal)}</div>}
              </div>
              <div style={{position:"relative"}}>
                <input type="number" value={amounts[`e${i}`]||""} placeholder="0.00"
                  onChange={e=>setAmounts(p=>({...p,[`e${i}`]:e.target.value}))}
                  style={{...inp({paddingRight:44,borderColor:val>0?`${color}60`:BORDER})}}/>
                <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",color:"#4A4270",fontWeight:800,fontSize:15,pointerEvents:"none"}}>€</span>
              </div>
            </div>;
          })}
          <button onClick={saveEntry} style={{width:"100%",background:`linear-gradient(135deg,${PINK},${LILA})`,color:"white",border:"none",borderRadius:16,padding:"15px",cursor:"pointer",fontWeight:900,fontSize:16,fontFamily:F,boxShadow:`0 8px 28px ${PINK}40`,marginBottom:8}}>
            Sauvegarder 💾
          </button>
          {saveMsg&&<div style={{textAlign:"center",fontSize:12,fontWeight:800,padding:6,color:saveMsg.includes("☁️")?MINT:PEACH}}>{saveMsg}</div>}
          {storageMode==="local"&&<div style={{background:`${PEACH}12`,border:`1px solid ${PEACH}30`,borderRadius:12,padding:"10px 14px",marginTop:8,fontSize:11,color:"#9A6E3A",fontWeight:700,lineHeight:1.7}}>
            💾 Données sauvegardées sur cet appareil.
          </div>}
        </>}

        {/* ══ MENSUEL ══ */}
        {tab==="monthly" && <>
          <div style={{fontSize:15,fontWeight:900,color:"white",marginBottom:14}}>📅 Vue mensuelle</div>
          <div style={{...cardStyle(),display:"flex",alignItems:"center",gap:10}}>
            <span style={{...lbl("#4A4270"),whiteSpace:"nowrap"}}>Année</span>
            <select value={selYear} onChange={e=>setSelYear(+e.target.value)} style={{...inp(),flex:1,cursor:"pointer"}}>
              {allYears.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={cardStyle()}>
            <div style={{...lbl("#4A4270"),marginBottom:14}}>Montant investi — {selYear}</div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={monthData} margin={{top:0,right:0,left:-32,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false}/>
                <XAxis dataKey="m" tick={{fontSize:9,fill:"#4A4270",fontFamily:F}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:9,fill:"#4A4270",fontFamily:F}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={tt} formatter={v=>[fmt(v)]} labelStyle={{color:"white",fontWeight:800}}/>
                <Legend wrapperStyle={{fontSize:11,fontFamily:F}}/>
                {settings.peaEtfs.map((etf,i)=><Bar key={i} dataKey={etf.name} fill={ETF_COLORS[i%ETF_COLORS.length]} radius={[6,6,0,0]} maxBarSize={22}/>)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={cardStyle()}>
            <div style={{...lbl("#4A4270"),marginBottom:12}}>Détail {selYear}</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>
                <th style={{padding:"5px 0",textAlign:"left",...lbl("#4A4270")}}>Mois</th>
                {settings.peaEtfs.map((etf,i)=><th key={i} style={{padding:"5px 0",textAlign:"right",color:ETF_COLORS[i%ETF_COLORS.length],fontWeight:800,fontSize:10}}>{etf.ticker}</th>)}
                <th style={{padding:"5px 0",textAlign:"right",...lbl("#6B5FA0")}}>Total</th>
              </tr></thead>
              <tbody>
                {MONTHS_S.map((m,mi)=>{
                  const inv=investments[`${selYear}-${mi+1}`]||{};
                  const tot=settings.peaEtfs.reduce((s,_,i)=>s+(inv[`e${i}`]||0),0);
                  const isNow=selYear===now.getFullYear()&&mi+1===now.getMonth()+1;
                  return <tr key={m} style={{opacity:tot===0?0.3:1,background:isNow?`${PINK}10`:"transparent"}}>
                    <td style={{padding:"8px 0",fontWeight:isNow?900:600,color:isNow?PINK:"#6B5FA0"}}>{m}{isNow?" 🌸":""}</td>
                    {settings.peaEtfs.map((_,i)=><td key={i} style={{padding:"8px 0",textAlign:"right",color:ETF_COLORS[i%ETF_COLORS.length],fontWeight:700}}>{inv[`e${i}`]?fmt(inv[`e${i}`]):"—"}</td>)}
                    <td style={{padding:"8px 0",textAlign:"right",fontWeight:900,color:tot>0?"white":"#2E2845"}}>{tot>0?fmt(tot):"—"}</td>
                  </tr>;
                })}
              </tbody>
              <tfoot><tr style={{borderTop:`2px solid ${BORDER}`}}>
                <td style={{padding:"8px 0",...lbl("#4A4270")}}>Total</td>
                {settings.peaEtfs.map((_,i)=><td key={i} style={{padding:"8px 0",textAlign:"right",color:ETF_COLORS[i%ETF_COLORS.length],fontWeight:900}}>
                  {fmt(MONTHS_S.reduce((s,__,mi)=>s+(investments[`${selYear}-${mi+1}`]?.[`e${i}`]||0),0))}
                </td>)}
                <td style={{padding:"8px 0",textAlign:"right",fontWeight:900,color:"white"}}>
                  {fmt(MONTHS_S.reduce((s,_,mi)=>{ const inv=investments[`${selYear}-${mi+1}`]||{}; return s+settings.peaEtfs.reduce((ss,__,i)=>ss+(inv[`e${i}`]||0),0); },0))}
                </td>
              </tr></tfoot>
            </table>
          </div>
        </>}

        {/* ══ ANNUEL ══ */}
        {tab==="annual" && <>
          <div style={{fontSize:15,fontWeight:900,color:"white",marginBottom:14}}>📊 Vue annuelle</div>
          <div style={{...cardStyle(),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:"white"}}>💹 Cours actuels</div>
              <div style={{fontSize:10,color:"#4A4270",lineHeight:1.6}}>
                {priceMsg || (hasPrices ? "Cours chargés — clique pour mettre à jour" : "Clique pour récupérer les cours")}
              </div>
            </div>
            <button onClick={fetchPrices} disabled={priceLoading} style={{background:priceLoading?"#2E2845":`linear-gradient(135deg,${PEACH},#FF8C69)`,color:priceLoading?"#4A4270":"white",border:"none",borderRadius:12,padding:"9px 16px",fontSize:12,fontWeight:900,cursor:priceLoading?"default":"pointer",fontFamily:F,boxShadow:priceLoading?"none":`0 6px 20px ${PEACH}40`,whiteSpace:"nowrap"}}>
              {priceLoading ? "⏳ Chargement..." : "🔄 Actualiser"}
            </button>
          </div>
          <div style={cardStyle()}>
            <div style={{...lbl(PINK),marginBottom:14}}>🌸 PEA — Gains</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{borderBottom:`1px solid ${BORDER}`}}>
                <th style={{padding:"5px 0",textAlign:"left",...lbl("#4A4270")}}>ETF</th>
                <th style={{padding:"5px 0",textAlign:"right",...lbl("#4A4270")}}>Investi</th>
                <th style={{padding:"5px 0",textAlign:"right",...lbl("#4A4270")}}>Valeur</th>
                <th style={{padding:"5px 0",textAlign:"right",...lbl("#4A4270")}}>Gain</th>
              </tr></thead>
              <tbody>
                {calcGainsPEA().map((etf,i)=>{
                  const color=ETF_COLORS[i%ETF_COLORS.length];
                  const gc=etf.gain==null?"#4A4270":etf.gain>=0?MINT:RED;
                  return <tr key={i} style={{borderBottom:`1px solid ${BORDER}40`}}>
                    <td style={{padding:"10px 0"}}>
                      <div style={{fontWeight:900,color:"white",fontSize:12}}>{etf.emoji} {etf.name}</div>
                      <div style={{fontSize:9,color:"#4A4270",fontWeight:700}}>{etf.ticker} · {etf.parts} part{etf.parts>1?"s":""} @ {etf.prixMoyen} €</div>
                    </td>
                    <td style={{padding:"10px 0",textAlign:"right",color:"#6B5FA0",fontWeight:700}}>{fmt(etf.invested)}</td>
                    <td style={{padding:"10px 0",textAlign:"right",color,fontWeight:700}}>
                      {etf.curVal!=null?fmt(etf.curVal):<span style={{color:"#2E2845"}}>—</span>}
                    </td>
                    <td style={{padding:"10px 0",textAlign:"right"}}>
                      {etf.gain!=null?<div><div style={{fontWeight:900,color:gc,fontSize:12}}>{fmt(etf.gain)}</div><div style={{fontSize:9,color:gc,fontWeight:800}}>{fmtPct(etf.gainPct)}</div></div>:<span style={{color:"#2E2845",fontSize:10}}>→ Actualiser</span>}
                    </td>
                  </tr>;
                })}
              </tbody>
              {hasPrices&&(()=>{
                const gains=calcGains(settings.peaEtfs);
                const totInv=gains.reduce((s,e)=>s+e.invested,0);
                const totCur=gains.filter(e=>e.curVal!=null).reduce((s,e)=>s+e.curVal,0);
                const g=totCur-totInv, gp=totInv>0?(g/totInv)*100:0;
                return <tfoot><tr style={{borderTop:`2px solid ${BORDER}`}}>
                  <td colSpan={2} style={{padding:"8px 0",...lbl("#6B5FA0")}}>Total PEA</td>
                  <td style={{padding:"8px 0",textAlign:"right",fontWeight:900,color:"white"}}>{fmt(totCur)}</td>
                  <td style={{padding:"8px 0",textAlign:"right"}}>
                    <div style={{fontWeight:900,color:g>=0?MINT:RED,fontSize:12}}>{fmt(g)}</div>
                    <div style={{fontSize:9,color:g>=0?MINT:RED,fontWeight:800}}>{fmtPct(gp)}</div>
                  </td>
                </tr></tfoot>;
              })()}
            </table>
          </div>
          <div style={cardStyle()}>
            <div style={{...lbl("#4A4270"),marginBottom:12}}>📅 Montants investis par année</div>
            {!Object.values(investments).some(v=>settings.peaEtfs.some((_,i)=>v[`e${i}`]>0))?
              <div style={{textAlign:"center",padding:"16px 0",fontSize:12,color:"#4A4270",fontWeight:600}}>🌱 Commence par saisir tes investissements !</div>:
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>
                  <th style={{padding:"5px 0",textAlign:"left",...lbl("#4A4270")}}>Année</th>
                  {settings.peaEtfs.map((etf,i)=><th key={i} style={{padding:"5px 0",textAlign:"right",color:ETF_COLORS[i%ETF_COLORS.length],fontWeight:800,fontSize:10}}>{etf.ticker}</th>)}
                  <th style={{padding:"5px 0",textAlign:"right",...lbl("white")}}>Cumulé</th>
                </tr></thead>
                <tbody>{(()=>{ let c=0; return allYears.map(y=>{
                  const vals=settings.peaEtfs.map((_,i)=>getYearEtf(y,i)), tot=vals.reduce((a,b)=>a+b,0);
                  if(!tot) return null; c+=tot;
                  return <tr key={y} style={{borderBottom:`1px solid ${BORDER}40`}}>
                    <td style={{padding:"9px 0",fontWeight:900,color:LILA}}>{y}</td>
                    {vals.map((v,i)=><td key={i} style={{padding:"9px 0",textAlign:"right",color:ETF_COLORS[i%ETF_COLORS.length],fontWeight:700}}>{fmt(v)}</td>)}
                    <td style={{padding:"9px 0",textAlign:"right",fontWeight:900,color:"white"}}>{fmt(c)}</td>
                  </tr>;
                }).filter(Boolean); })()}</tbody>
              </table>
            }
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"4px 0 14px"}}>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${BORDER})`}}/>
            <span style={{fontSize:10,color:"#4A4270",fontWeight:800,textTransform:"uppercase",letterSpacing:1,whiteSpace:"nowrap"}}>✦ Hors PEA · en veille ✦</span>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,${BORDER},transparent)`}}/>
          </div>
          <div style={cardStyle()}>
            <div style={{...lbl(PEACH),marginBottom:10}}>🧊 Positions en veille</div>
            <div style={{background:`${PEACH}12`,border:`1.5px dashed ${PEACH}35`,borderRadius:12,padding:"10px 12px",marginBottom:14,fontSize:11,color:"#9A6E3A",fontWeight:700,lineHeight:1.7}}>
              💡 DCA en pause · conservées jusqu'à revente.
            </div>
            {(()=>{
              const gains=calcGains(settings.outsideEtfs.filter(e=>e.name));
              const totInv=gains.reduce((s,e)=>s+e.invested,0);
              const totCur=hasPrices?gains.filter(e=>e.curVal!=null).reduce((s,e)=>s+e.curVal,0):null;
              const g=totCur!=null?totCur-totInv:null, gp=g!=null&&totInv>0?(g/totInv)*100:null;
              return <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  <th style={{padding:"5px 0",textAlign:"left",...lbl("#4A4270")}}>ETF</th>
                  <th style={{padding:"5px 0",textAlign:"right",...lbl("#4A4270")}}>Investi</th>
                  <th style={{padding:"5px 0",textAlign:"right",...lbl("#4A4270")}}>Gain</th>
                </tr></thead>
                <tbody>
                  {gains.map((etf,i)=>{
                    const gc=etf.gain==null?"#4A4270":etf.gain>=0?MINT:RED;
                    return <tr key={i} style={{borderBottom:`1px solid ${BORDER}40`}}>
                      <td style={{padding:"10px 0"}}>
                        <div style={{fontWeight:900,color:"white",fontSize:12}}>{etf.emoji} {etf.name}</div>
                        <div style={{fontSize:9,color:"#4A4270",fontWeight:700}}>{etf.ticker} · {etf.parts} parts @ {etf.prixMoyen} €</div>
                      </td>
                      <td style={{padding:"10px 0",textAlign:"right",color:"#6B5FA0",fontWeight:700}}>{fmt(etf.invested)}</td>
                      <td style={{padding:"10px 0",textAlign:"right"}}>
                        {etf.gain!=null?<div><div style={{fontWeight:900,color:gc,fontSize:12}}>{fmt(etf.gain)}</div><div style={{fontSize:9,color:gc,fontWeight:800}}>{fmtPct(etf.gainPct)}</div></div>:<span style={{color:"#2E2845",fontSize:10}}>→ Actualiser</span>}
                      </td>
                    </tr>;
                  })}
                </tbody>
                <tfoot><tr style={{borderTop:`2px solid ${BORDER}`}}>
                  <td style={{padding:"8px 0",...lbl("#6B5FA0")}}>Total hors PEA</td>
                  <td style={{padding:"8px 0",textAlign:"right",fontWeight:900,color:"#6B5FA0"}}>{fmt(totInv)}</td>
                  <td style={{padding:"8px 0",textAlign:"right"}}>
                    {g!=null?<div><div style={{fontWeight:900,color:g>=0?MINT:RED,fontSize:12}}>{fmt(g)}</div><div style={{fontSize:9,color:g>=0?MINT:RED,fontWeight:800}}>{fmtPct(gp)}</div></div>:<span style={{fontSize:10,color:"#4A4270",fontWeight:700}}>→ Actualiser</span>}
                  </td>
                </tr></tfoot>
              </table>;
            })()}
          </div>
        </>}

        {/* ══ RÉGLAGES ══ */}
        {tab==="settings" && <>
          <div style={{fontSize:15,fontWeight:900,color:"white",marginBottom:14}}>⚙️ Réglages</div>
          <div style={cardStyle()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{...lbl(PINK)}}>🌸 ETF PEA actifs</div>
              <button onClick={()=>saveCfg({...settings,peaEtfs:[...settings.peaEtfs,{name:"",ticker:"",emoji:"📈",goal:"",parts:0,prixMoyen:0}]})}
                style={{background:`${PINK}20`,border:`1px solid ${PINK}40`,borderRadius:10,padding:"5px 12px",color:PINK,fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:F}}>
                + Ajouter
              </button>
            </div>
            {settings.peaEtfs.map((etf,i)=>{
              const color=ETF_COLORS[i%ETF_COLORS.length];
              return <div key={i} style={{marginBottom:14,padding:"12px",background:`${color}0A`,borderRadius:14,border:`1.5px solid ${color}20`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{...lbl(color)}}>ETF {i+1}</div>
                  {settings.peaEtfs.length>1&&<button onClick={()=>saveCfg({...settings,peaEtfs:settings.peaEtfs.filter((_,j)=>j!==i)})}
                    style={{background:`${RED}20`,border:`1px solid ${RED}30`,borderRadius:8,padding:"3px 10px",color:RED,fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:F}}>Supprimer</button>}
                </div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <input value={etf.emoji} onChange={e=>saveCfg({...settings,peaEtfs:settings.peaEtfs.map((x,j)=>j===i?{...x,emoji:e.target.value}:x)})}
                    style={{...inp({fontSize:18,padding:"9px 8px",textAlign:"center"}),width:52,flex:"none"}}/>
                  <input value={etf.name} placeholder="Nom" onChange={e=>saveCfg({...settings,peaEtfs:settings.peaEtfs.map((x,j)=>j===i?{...x,name:e.target.value}:x)})}
                    style={{...inp({fontSize:12,padding:"9px 12px"}),flex:2}}/>
                  <input value={etf.ticker} placeholder="Ticker" onChange={e=>saveCfg({...settings,peaEtfs:settings.peaEtfs.map((x,j)=>j===i?{...x,ticker:e.target.value.toUpperCase()}:x)})}
                    style={{...inp({fontSize:12,padding:"9px 12px"}),flex:1}}/>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
  <div style={{flex:1}}>
    <div style={{...lbl("#4A4270"),marginBottom:4}}>Parts</div>
    <div style={{...inp({fontSize:12,padding:"9px 12px"}),color:"rgba(245,240,238,0.85)",cursor:"default"}}>
      {Object.values(investments).filter(v=>(v[`e${i}`]||0)>0).length || "—"}
    </div>
  </div>
  <div style={{flex:1}}>
    <div style={{...lbl("#4A4270"),marginBottom:4}}>Prix moyen (€)</div>
    {Object.values(investments).filter(v=>(v[`e${i}`]||0)>0).length > 0
      ? <div style={{...inp({fontSize:12,padding:"9px 12px"}),color:"rgba(245,240,238,0.85)",cursor:"default"}}>
          {(Object.values(investments).reduce((s,v)=>s+(v[`e${i}`]||0),0) / Object.values(investments).filter(v=>(v[`e${i}`]||0)>0).length).toFixed(2)}
        </div>
      : <input type="number" step="0.0001" value={etf.prixMoyen}
          onChange={e=>saveCfg({...settings,peaEtfs:settings.peaEtfs.map((x,j)=>j===i?{...x,prixMoyen:+e.target.value}:x)})}
          style={inp({fontSize:12,padding:"9px 12px"})} placeholder="Premier prix"/>
    }
  </div>
               </div>   
                <div><div style={{...lbl("#4A4270"),marginBottom:4}}>🎯 Objectif DCA mensuel</div>
                  <div style={{position:"relative"}}>
                    <input type="number" value={etf.goal} onChange={e=>saveCfg({...settings,peaEtfs:settings.peaEtfs.map((x,j)=>j===i?{...x,goal:e.target.value}:x)})}
                      placeholder="0.00" style={inp({fontSize:12,padding:"9px 38px 9px 12px"})}/>
                    <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#4A4270",fontSize:13,pointerEvents:"none"}}>€</span>
                  </div>
                </div>
              </div>;
            })}
          </div>
          <div style={cardStyle()}>
            <div style={{...lbl(PEACH),marginBottom:14}}>🧊 ETF Hors PEA</div>
            {settings.outsideEtfs.map((etf,i)=>(
              <div key={i} style={{marginBottom:14,padding:"12px",background:`${PEACH}0A`,borderRadius:14,border:`1.5px solid ${PEACH}20`}}>
                <div style={{...lbl(PEACH),marginBottom:10}}>ETF hors PEA {i+1}</div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <input value={etf.emoji} onChange={e=>saveCfg({...settings,outsideEtfs:settings.outsideEtfs.map((x,j)=>j===i?{...x,emoji:e.target.value}:x)})}
                    style={{...inp({fontSize:18,padding:"9px 8px",textAlign:"center"}),width:52,flex:"none"}}/>
                  <input value={etf.name} placeholder="Nom" onChange={e=>saveCfg({...settings,outsideEtfs:settings.outsideEtfs.map((x,j)=>j===i?{...x,name:e.target.value}:x)})}
                    style={{...inp({fontSize:12,padding:"9px 12px"}),flex:2}}/>
                  <input value={etf.ticker} placeholder="Ticker" onChange={e=>saveCfg({...settings,outsideEtfs:settings.outsideEtfs.map((x,j)=>j===i?{...x,ticker:e.target.value.toUpperCase()}:x)})}
                    style={{...inp({fontSize:12,padding:"9px 12px"}),flex:1}}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1}}><div style={{...lbl("#4A4270"),marginBottom:4}}>Parts</div>
                    <input type="number" value={etf.parts} onChange={e=>saveCfg({...settings,outsideEtfs:settings.outsideEtfs.map((x,j)=>j===i?{...x,parts:+e.target.value}:x)})}
                      style={inp({fontSize:12,padding:"9px 12px"})}/>
                  </div>
                  <div style={{flex:1}}><div style={{...lbl("#4A4270"),marginBottom:4}}>Prix moyen (€)</div>
                    <input type="number" step="0.0001" value={etf.prixMoyen} onChange={e=>saveCfg({...settings,outsideEtfs:settings.outsideEtfs.map((x,j)=>j===i?{...x,prixMoyen:+e.target.value}:x)})}
                      style={inp({fontSize:12,padding:"9px 12px"})}/>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{...cardStyle(),border:`1.5px solid ${LILA}30`,background:`${LILA}0A`}}>
            <div style={{fontSize:13,fontWeight:800,color:LILA,marginBottom:6}}>💜 Stockage</div>
            <div style={{fontSize:11,color:"#6B5FA0",fontWeight:600,lineHeight:1.9}}>
              💾 <strong style={{color:PEACH}}>Local</strong> — données sauvegardées sur cet appareil
            </div>
            <div style={{marginTop:10,display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:"#4A4270"}}>État :</span><StorageBadge/>
            </div>
          </div>
        </>}
      </div>

      {/* NAV */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:CARD,borderTop:`1px solid ${BORDER}`,display:"flex",boxShadow:"0 -4px 24px rgba(0,0,0,0.5)"}}>
        <Nav id="entry" emoji="✏️" label="Saisie"/>
        <Nav id="monthly" emoji="📅" label="Mensuel"/>
        <Nav id="annual" emoji="📊" label="Annuel"/>
        <Nav id="settings" emoji="⚙️" label="Réglages"/>
      </div>
    </div>
  );
}
