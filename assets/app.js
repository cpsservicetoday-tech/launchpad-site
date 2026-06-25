/* ============================================================
   LAUNCHPAD SERVICES — shared app.js
   ============================================================ */

/* ---------- Starfield ---------- */
(function(){
  const c=document.getElementById('stars'); if(!c) return;
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const ctx=c.getContext('2d'); let stars=[];
  function size(){c.width=c.offsetWidth;c.height=c.offsetHeight;
    stars=Array.from({length:Math.min(90,c.width/14)},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.3,a:Math.random()}));}
  function draw(){ctx.clearRect(0,0,c.width,c.height);
    stars.forEach(s=>{s.a+=(Math.random()-.5)*.04;s.a=Math.max(.1,Math.min(1,s.a));
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.fillStyle='rgba(255,255,255,'+s.a*.7+')';ctx.fill();});
    if(!reduce) requestAnimationFrame(draw);}
  size();draw();addEventListener('resize',size);
})();

/* ---------- Reveal + gauges ---------- */
(function(){
  const io=new IntersectionObserver((es)=>es.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('in');
      const bars=e.target.querySelectorAll?e.target.querySelectorAll('.bar i'):[];
      bars.forEach(b=>b.style.width=b.dataset.fill+'%');
      io.unobserve(e.target);}
  }),{threshold:.18});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  setTimeout(()=>document.querySelectorAll('.console .bar i').forEach(b=>b.style.width=b.dataset.fill+'%'),400);
})();

/* ---------- Mobile menu ---------- */
(function(){const b=document.getElementById('menuBtn');if(b)b.onclick=()=>document.getElementById('navLinks').classList.toggle('show');})();

/* ============================================================
   AI MISSION CONTROL
   ------------------------------------------------------------
   PRODUCTION: set window.MC_ENDPOINT (in each page or here) to
   your serverless proxy URL, e.g. "/api/chat".
   The proxy holds your Anthropic API key — never put the key
   in this file (it ships to the browser).
   If MC_ENDPOINT is unset, it falls back to the direct API,
   which ONLY works inside Claude's preview.
   ============================================================ */
(function(){
  const ENDPOINT = window.MC_ENDPOINT || "https://api.anthropic.com/v1/messages";
  const fab=document.getElementById('mc-fab'),panel=document.getElementById('mc-panel'),
        body=document.getElementById('mc-body'),input=document.getElementById('mc-input'),
        send=document.getElementById('mc-send'),chips=document.getElementById('mc-chips');
  if(!fab) return;
  let history=[]; let greeted=false;

  const SYSTEM=`You are Mission Control, the AI assistant for Launchpad Services, a licensed residential HVAC company in Palm Bay, FL (license CAC1822716) serving Brevard County / the Space Coast: Palm Bay, Melbourne, West Melbourne, Viera, Rockledge, Cocoa, Cocoa Beach, Satellite Beach, Merritt Island, Indialantic, Melbourne Beach, Sebastian. Hours: 7 days/week, 7am-8pm. Phone: (321) 375-5582.
Memberships (Comfort Club): Comfort Club $19.99/mo, Comfort Club Plus $39.99/mo, Comfort Club Premium $79.99/mo. All tiers include seasonal maintenance, 21-point inspection, priority scheduling, no dispatch fees, 10% off services, 24/7 emergency response, and a lifetime warranty on covered repairs (active members only; refrigerant excluded; min two maintenance visits/year). Higher tiers add air filters/consumables, indoor air quality, and UV lights.
Join links (share the correct one when a visitor wants to sign up): Comfort Club $19.99 -> https://buy.stripe.com/14A3cv9e22p03bpfAz7EQ0g ; Comfort Club Plus $39.99 -> https://buy.stripe.com/4gMaEXgGue7I27ldsr7EQ07 ; Comfort Club Premium $79.99 -> https://buy.stripe.com/aFaaEX3TIgfQaDRagf7EQ09 . For one-off repairs or service calls (not memberships), direct them to book online (https://book.housecallpro.com/book/Launchpad-Services/d45290aff5b54b4597514b5b978f8e70?v2=true) or call (321) 375-5582.
Brand voice: confident, clean, slightly aspirational, human — never gimmicky. Tagline: "Our service is out of this world."
Your job: answer HVAC questions helpfully and briefly (2-4 sentences), then guide the homeowner to book online or call. Always recommend booking (https://book.housecallpro.com/book/Launchpad-Services/d45290aff5b54b4597514b5b978f8e70?v2=true) or calling (321) 375-5582 for a real diagnosis.
RULES: Never invent specific repair prices, dates, or promises beyond the membership prices above — say pricing depends on the system and a technician will confirm. For no-cooling/no-heat emergencies, urge them to call now. Stay on HVAC + Launchpad topics. Keep it short and useful.`;

  function open(){panel.classList.add('open');fab.style.display='none';
    if(!greeted){greeted=true;botMsg("Mission Control online. 🚀 What's going on with your HVAC today? I can troubleshoot, check service areas, explain the Comfort Club, or get you booked.");}
    input.focus();}
  function close(){panel.classList.remove('open');fab.style.display='flex';}
  fab.onclick=open;document.getElementById('mc-close').onclick=close;

  function botMsg(t){const d=document.createElement('div');d.className='mc-msg bot';d.textContent=t;body.appendChild(d);body.scrollTop=body.scrollHeight;}
  function userMsg(t){const d=document.createElement('div');d.className='mc-msg user';d.textContent=t;body.appendChild(d);body.scrollTop=body.scrollHeight;}
  function typing(on){let t=document.getElementById('mc-typing');
    if(on&&!t){t=document.createElement('div');t.id='mc-typing';t.className='mc-msg bot mc-typing';t.innerHTML='<i></i><i></i><i></i>';body.appendChild(t);body.scrollTop=body.scrollHeight;}
    else if(!on&&t)t.remove();}

  async function ask(text){
    userMsg(text);history.push({role:"user",content:text});typing(true);if(chips)chips.style.display='none';
    try{
      const r=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,system:SYSTEM,messages:history})});
      const data=await r.json();typing(false);
      const reply=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim()
        ||"I had trouble there — please call us at (321) 375-5582 and we'll help right away.";
      botMsg(reply);history.push({role:"assistant",content:reply});
    }catch(e){typing(false);
      botMsg("I can't reach the system right now. For fast help, call (321) 375-5582 — we're here 7am–8pm, 7 days a week.");}
  }

  function submit(){const v=input.value.trim();if(!v)return;input.value='';ask(v);}
  send.onclick=submit;
  input.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
  if(chips)chips.querySelectorAll('.mc-chip').forEach(c=>c.onclick=()=>ask(c.textContent));
})();


/* HouseCall Pro booking: open on-site modal if the widget loaded; otherwise the link navigates to HCP. */
document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('a[href*="book.housecallpro.com"]');
  if(!a)return;
  if(window.HCPWidget&&typeof window.HCPWidget.openModal==='function'){
    try{window.HCPWidget.openModal();e.preventDefault();}catch(err){/* fall through to link */}
  }
},false);
