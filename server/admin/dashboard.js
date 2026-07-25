// Minimal self-contained observability dashboard: a live room list that opens a
// per-player event timeline. Kept out of index.js so the server file stays
// readable. `token` is the already-URL-encoded admin token, threaded into the
// page's fetch calls.
const renderDashboard = (token) => `<!doctype html><html><head><meta charset="utf-8"><title>WST Observability</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0d0d1a;color:#e6e6e6;margin:0;padding:16px}
  h1{color:#ffe66d;font-size:18px;margin:0 0 12px} h2{color:#4ecdc4;font-size:14px;margin:16px 0 8px}
  table{border-collapse:collapse;width:100%;font-size:12px} th,td{border-bottom:1px solid #2d2d44;padding:4px 8px;text-align:left;vertical-align:top}
  th{color:#888;font-weight:600} tr:hover{background:#161629}
  .room{cursor:pointer;color:#4ecdc4;text-decoration:underline} .in{color:#a8e6cf} .sys{color:#ff8b94}
  .muted{color:#666} .info{color:#c39bd3;white-space:pre-wrap;word-break:break-word;max-width:420px}
  button{background:#2d2d44;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 10px;cursor:pointer;font-family:inherit}
</style></head><body>
<h1>🎲 Who Said That — Observability</h1>
<button onclick="loadRooms()">↻ Refresh rooms</button>
<div id="rooms"></div>
<div id="timeline"></div>
<script>
const T="${token}";
const j=(u)=>fetch(u+(u.includes('?')?'&':'?')+'token='+T).then(r=>r.json());
async function loadRooms(){
  const {rooms}=await j('/admin/rooms');
  const el=document.getElementById('rooms');
  if(!rooms||!rooms.length){el.innerHTML='<p class=muted>No live rooms.</p>';return;}
  el.innerHTML='<h2>Live rooms ('+rooms.length+')</h2><table><tr><th>Code</th><th>Game</th><th>Phase</th><th>Players</th><th>Connected</th></tr>'+
    rooms.map(r=>'<tr><td class=room onclick="loadLog(\\''+r.code+'\\')">'+r.code+'</td><td>'+r.gameType+'</td><td>'+r.phase+'</td><td>'+r.players+'</td><td>'+r.connected+'</td></tr>').join('')+'</table>';
}
async function loadLog(code){
  const {events}=await j('/admin/rooms/'+code+'/log');
  const el=document.getElementById('timeline');
  const fmt=(t)=>(t/1000).toFixed(1)+'s';
  el.innerHTML='<h2>Timeline — '+code+' ('+events.length+' events)</h2><table><tr><th>t</th><th>dir</th><th>event</th><th>player</th><th>phase</th><th>info</th></tr>'+
    events.map(e=>'<tr><td class=muted>'+fmt(e.t)+'</td><td class='+e.dir+'>'+e.dir+'</td><td>'+e.event+'</td><td class=muted>'+(e.pid?e.pid.slice(0,8):'-')+'</td><td>'+(e.phase||'-')+'</td><td class=info>'+(e.info!=null?JSON.stringify(e.info):'')+'</td></tr>').join('')+'</table>';
  window.scrollTo(0,document.body.scrollHeight);
}
loadRooms();
</script></body></html>`;

module.exports = { renderDashboard };
