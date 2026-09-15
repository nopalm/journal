const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

let trades = [];
let currentMonth = new Date(); currentMonth.setDate(1);
let selectedDateStr = null;
let breakdownPeriod = 'day';
let sortKey = 'period';
let sortDir = 'desc';
let currentImageData = null;

function pad(n){return n.toString().padStart(2,'0');}
function toDateStr(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function fmtNum(n){
  const sign = n>0 ? '+' : (n<0 ? '-' : '');
  return sign + Math.abs(n).toLocaleString('id-ID', {maximumFractionDigits:2});
}
function parseRR(rr){
  if(!rr) return null;
  rr = rr.trim();
  if(rr.includes(':')){
    const parts = rr.split(':');
    const a = parseFloat(parts[0]), b = parseFloat(parts[1]);
    if(a>0 && !isNaN(b)) return b/a;
    return null;
  }
  const n = parseFloat(rr);
  return isNaN(n) ? null : n;
}

// ---------- Koneksi Supabase ----------
const SUPABASE_URL = 'https://doohpgvxpquvssryzquj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvb2hwZ3Z4cHF1dnNzcnl6cXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NTMyOTEsImV4cCI6MjEwNTAyOTI5MX0.pk4JUEwFdGmGjra8NtFHyFDi4-ZdIWuvjH7VbxILqPc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function setConnStatus(state, msg){
  const dot = document.querySelector('#connStatus .conn-dot');
  const label = document.querySelector('#connStatus span:last-child');
  dot.className = 'conn-dot' + (state==='ok' ? ' ok' : (state==='err' ? ' err' : ''));
  label.textContent = msg;
}

function showBanner(type, msg){
  const b = document.getElementById('statusBanner');
  if(!msg){ b.className = 'status-banner'; b.textContent=''; return; }
  b.className = 'status-banner show' + (type ? ' '+type : '');
  b.textContent = msg;
}

// ---------- Storage (Supabase) ----------
async function loadTrades(){
  showBanner('loading', 'Memuat data dari Supabase...');
  try{
    const { data, error } = await supabaseClient
      .from('trades')
      .select('*')
      .order('id', { ascending: false });
    if(error) throw error;
    trades = data.map(r=>({
      id: r.id, date: r.date, pair: r.pair||'', rr: r.rr||'', unit: r.unit||'',
      pnl: Number(r.pnl), notes: r.notes||'', image: r.image||null
    }));
    setConnStatus('ok', 'Terhubung ke Supabase');
    showBanner();
  }catch(e){
    console.error(e);
    setConnStatus('err', 'Gagal terhubung');
    showBanner('error', 'Gagal memuat data dari Supabase: ' + e.message + '. Pastikan tabel "trades" sudah dibuat.');
    trades = [];
  }
}

async function upsertTrade(trade){
  const { error } = await supabaseClient
    .from('trades')
    .upsert(trade, { onConflict: 'id' });
  if(error) throw error;
}

async function deleteTradeRemote(id){
  const { error } = await supabaseClient
    .from('trades')
    .delete()
    .eq('id', id);
  if(error) throw error;
}

// ---------- Rendering ----------
function renderAll(){
  renderStats();
  renderCalendar();
  renderDayPanel();
  renderBreakdown();
}

function renderStats(){
  const closed = trades.filter(t=>t.pnl !== 0);
  const wins = trades.filter(t=>t.pnl > 0).length;
  const losses = trades.filter(t=>t.pnl < 0).length;
  const wr = closed.length ? (wins/closed.length*100) : 0;
  const totalPnl = trades.reduce((s,t)=>s+t.pnl,0);
  const rrs = trades.map(t=>parseRR(t.rr)).filter(v=>v!==null);
  const avgRR = rrs.length ? (rrs.reduce((a,b)=>a+b,0)/rrs.length) : null;

  const el = document.getElementById('statsRow');
  el.innerHTML = `
    <div class="stat-cell"><div class="val">${trades.length}</div><div class="lbl">Total trade</div></div>
    <div class="stat-cell"><div class="val">${wr.toFixed(1)}%</div><div class="lbl">Win rate</div></div>
    <div class="stat-cell"><div class="val ${totalPnl>0?'profit':(totalPnl<0?'loss':'')}">${fmtNum(totalPnl)}</div><div class="lbl">Total P/L</div></div>
    <div class="stat-cell"><div class="val">${avgRR!==null ? '1:'+avgRR.toFixed(2) : '-'}</div><div class="lbl">Rata-rata RR</div></div>
  `;
  document.getElementById('subtitle').textContent = trades.length
    ? `${trades.length} trade tercatat`
    : 'Belum ada trade — mulai catat trade pertamamu';
}

function renderCalendar(){
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  document.getElementById('calLabel').textContent = `${MONTHS[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay() - 1; // Monday = 0
  if(startOffset < 0) startOffset = 6;
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const todayStr = toDateStr(new Date());

  for(let i=0;i<startOffset;i++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    grid.appendChild(cell);
  }

  for(let d=1; d<=daysInMonth; d++){
    const dateObj = new Date(year, month, d);
    const dateStr = toDateStr(dateObj);
    const dayTrades = trades.filter(t=>t.date === dateStr);
    const dayPnl = dayTrades.reduce((s,t)=>s+t.pnl,0);
    const hasImg = dayTrades.some(t=>t.image);

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if(dateStr === todayStr) cell.classList.add('today');
    if(dayTrades.length){
      cell.classList.add(dayPnl >= 0 ? 'has-profit' : 'has-loss');
    }
    cell.dataset.date = dateStr;

    let pnlHtml = '';
    if(dayTrades.length){
      pnlHtml = `<div class="cal-pnl ${dayPnl>=0?'profit':'loss'}">${fmtNum(dayPnl)}</div>`;
    }
    cell.innerHTML = `
      <span class="daynum">${d}</span>
      <div>
        ${pnlHtml}
        <div class="cal-meta">
          ${hasImg ? '<span class="cal-imgdot"></span>' : ''}
          ${dayTrades.length>1 ? `<span class="cal-count">${dayTrades.length}x</span>` : ''}
        </div>
      </div>
    `;
    cell.addEventListener('click', ()=>{
      selectedDateStr = dateStr;
      renderDayPanel();
      document.getElementById('dayPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
    });
    grid.appendChild(cell);
  }
}

function renderDayPanel(){
  const panel = document.getElementById('dayPanel');
  if(!selectedDateStr){ panel.style.display='none'; return; }
  panel.style.display = 'block';

  const dayTrades = trades.filter(t=>t.date === selectedDateStr).sort((a,b)=>b.id-a.id);
  const [y,m,d] = selectedDateStr.split('-');
  const label = `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;

  let rows = '';
  if(dayTrades.length === 0){
    rows = `<div class="empty-state">Belum ada trade pada tanggal ini.</div>`;
  } else {
    rows = dayTrades.map(t=>{
      const img = t.image
        ? `<img src="${t.image}" data-full="${t.image}" class="trade-thumb">`
        : `<div class="no-img">no img</div>`;
      return `
      <div class="trade-row" data-id="${t.id}">
        ${img}
        <div class="trade-info">
          <div class="top-row">
            <span class="trade-pair">${t.pair || 'Tanpa nama'}</span>
            ${t.rr ? `<span class="trade-rr">RR ${t.rr}</span>` : ''}
            <span class="trade-pnl ${t.pnl>0?'profit':(t.pnl<0?'loss':'')}">${fmtNum(t.pnl)}${t.unit ? ' '+t.unit : ''}</span>
          </div>
          ${t.notes ? `<div class="trade-notes">${escapeHtml(t.notes)}</div>` : ''}
        </div>
        <div class="trade-actions">
          <button class="edit-btn" title="Edit">✎</button>
          <button class="del-btn" title="Hapus">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  panel.innerHTML = `
    <div class="day-panel-head">
      <h3>${label}</h3>
      <button class="close-day" id="closeDayBtn">Tutup ✕</button>
    </div>
    ${rows}
  `;

  document.getElementById('closeDayBtn').onclick = ()=>{ selectedDateStr = null; renderDayPanel(); };

  panel.querySelectorAll('.trade-thumb').forEach(img=>{
    img.addEventListener('click', ()=>{
      document.getElementById('lightboxImg').src = img.dataset.full;
      document.getElementById('lightbox').classList.add('open');
    });
  });
  panel.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = Number(e.target.closest('.trade-row').dataset.id);
      openModal(trades.find(t=>t.id===id));
    });
  });
  panel.querySelectorAll('.del-btn').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const id = Number(e.target.closest('.trade-row').dataset.id);
      if(confirm('Hapus trade ini?')){
        try{
          await deleteTradeRemote(id);
          trades = trades.filter(t=>t.id!==id);
          renderAll();
        }catch(err){
          alert('Gagal menghapus trade: ' + err.message);
        }
      }
    });
  });
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---------- Breakdown ----------
function getWeekStart(dateObj){
  const d = new Date(dateObj);
  const day = (d.getDay()+6)%7; // Monday=0
  d.setDate(d.getDate()-day);
  d.setHours(0,0,0,0);
  return d;
}

function renderBreakdown(){
  const groups = {};
  trades.forEach(t=>{
    const dt = new Date(t.date+'T00:00:00');
    let key, label, sortVal;
    if(breakdownPeriod === 'day'){
      key = t.date;
      const [y,m,d] = t.date.split('-');
      label = `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
      sortVal = t.date;
    } else if(breakdownPeriod === 'week'){
      const start = getWeekStart(dt);
      const end = new Date(start); end.setDate(end.getDate()+6);
      key = toDateStr(start);
      label = `${start.getDate()} - ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
      sortVal = key;
    } else {
      key = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}`;
      label = `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
      sortVal = key;
    }
    if(!groups[key]) groups[key] = {label, sortVal, trades:0, wins:0, losses:0, pnl:0};
    groups[key].trades++;
    if(t.pnl>0) groups[key].wins++;
    if(t.pnl<0) groups[key].losses++;
    groups[key].pnl += t.pnl;
  });

  let rows = Object.values(groups).map(g=>{
    const closed = g.wins+g.losses;
    g.wr = closed ? (g.wins/closed*100) : 0;
    return g;
  });

  rows.sort((a,b)=>{
    let av, bv;
    switch(sortKey){
      case 'period': av=a.sortVal; bv=b.sortVal; break;
      case 'trades': av=a.trades; bv=b.trades; break;
      case 'wins': av=a.wins; bv=b.wins; break;
      case 'losses': av=a.losses; bv=b.losses; break;
      case 'wr': av=a.wr; bv=b.wr; break;
      case 'pnl': av=a.pnl; bv=b.pnl; break;
    }
    if(av<bv) return sortDir==='asc' ? -1 : 1;
    if(av>bv) return sortDir==='asc' ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('breakdownBody');
  if(rows.length === 0){
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-dim); font-family:var(--font-ui); padding:24px;">Belum ada data untuk ditampilkan.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(g=>`
    <tr>
      <td class="period-col">${g.label}</td>
      <td>${g.trades}</td>
      <td>${g.wins}</td>
      <td>${g.losses}</td>
      <td>${g.wr.toFixed(1)}%</td>
      <td style="color:${g.pnl>0?'var(--profit)':(g.pnl<0?'var(--loss)':'var(--text)')}">${fmtNum(g.pnl)}</td>
    </tr>
  `).join('');

  document.querySelectorAll('#breakdownTable th').forEach(th=>{
    const arrow = th.querySelector('.arrow');
    if(th.dataset.k === sortKey){
      arrow.textContent = sortDir === 'asc' ? '▲' : '▼';
    } else {
      arrow.textContent = '';
    }
  });
}

// ---------- Modal ----------
function openModal(trade){
  document.getElementById('modalTitle').textContent = trade ? 'Edit trade' : 'Tambah trade';
  document.getElementById('editId').value = trade ? trade.id : '';
  document.getElementById('fDate').value = trade ? trade.date : (selectedDateStr || toDateStr(new Date()));
  document.getElementById('fPair').value = trade ? (trade.pair||'') : '';
  document.getElementById('fRR').value = trade ? (trade.rr||'') : '';
  document.getElementById('fUnit').value = trade ? (trade.unit||'') : '';
  document.getElementById('fPnl').value = trade ? trade.pnl : '';
  document.getElementById('fNotes').value = trade ? (trade.notes||'') : '';
  currentImageData = trade ? (trade.image || null) : null;
  renderImgArea();
  updatePnlHint();
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
}

function renderImgArea(){
  const area = document.getElementById('imgArea');
  if(currentImageData){
    area.innerHTML = `
      <div class="img-preview-wrap">
        <img src="${currentImageData}">
        <button class="img-remove" id="removeImgBtn">✕</button>
      </div>`;
    document.getElementById('removeImgBtn').onclick = ()=>{ currentImageData = null; renderImgArea(); };
  } else {
    area.innerHTML = `
      <div class="img-drop" id="imgDrop">
        Ketuk untuk unggah gambar
        <input type="file" id="fImage" accept="image/*">
      </div>`;
    document.getElementById('fImage').addEventListener('change', handleImageUpload);
  }
}

function handleImageUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    const img = new Image();
    img.onload = ()=>{
      const maxDim = 900;
      let w = img.width, h = img.height;
      if(w > maxDim || h > maxDim){
        if(w > h){ h = Math.round(h * maxDim/w); w = maxDim; }
        else { w = Math.round(w * maxDim/h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      currentImageData = canvas.toDataURL('image/jpeg', 0.7);
      renderImgArea();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function updatePnlHint(){
  const v = parseFloat(document.getElementById('fPnl').value);
  const hint = document.getElementById('pnlHint');
  if(isNaN(v)){ hint.textContent=''; return; }
  if(v > 0){ hint.textContent = 'Akan tercatat sebagai profit'; hint.className='pnl-hint profit'; }
  else if(v < 0){ hint.textContent = 'Akan tercatat sebagai loss'; hint.className='pnl-hint loss'; }
  else { hint.textContent = 'Breakeven'; hint.className='pnl-hint be'; }
}

async function handleSave(){
  const pnlRaw = document.getElementById('fPnl').value;
  if(pnlRaw === ''){ alert('Isi nilai profit/loss terlebih dahulu.'); return; }
  const dateVal = document.getElementById('fDate').value;
  if(!dateVal){ alert('Pilih tanggal terlebih dahulu.'); return; }

  const editId = document.getElementById('editId').value;
  const trade = {
    id: editId ? Number(editId) : Date.now(),
    date: dateVal,
    pair: document.getElementById('fPair').value.trim(),
    rr: document.getElementById('fRR').value.trim(),
    unit: document.getElementById('fUnit').value.trim(),
    pnl: parseFloat(pnlRaw),
    notes: document.getElementById('fNotes').value.trim(),
    image: currentImageData
  };

  const saveBtn = document.getElementById('btnSave');
  saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan...';
  try{
    await upsertTrade(trade);
    if(editId){
      trades = trades.map(t=> t.id === trade.id ? trade : t);
    } else {
      trades.push(trade);
    }
    closeModal();
    selectedDateStr = trade.date;
    renderAll();
  }catch(err){
    alert('Gagal menyimpan ke Supabase: ' + err.message);
  }finally{
    saveBtn.disabled = false; saveBtn.textContent = 'Simpan';
  }
}

// ---------- Events ----------
document.getElementById('btnAddTrade').addEventListener('click', ()=>openModal(null));
document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnSave').addEventListener('click', handleSave);
document.getElementById('modalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'modalOverlay') closeModal();
});
document.getElementById('fPnl').addEventListener('input', updatePnlHint);
document.getElementById('fImage').addEventListener('change', handleImageUpload);

document.getElementById('prevMonth').addEventListener('click', ()=>{
  currentMonth.setMonth(currentMonth.getMonth()-1);
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', ()=>{
  currentMonth.setMonth(currentMonth.getMonth()+1);
  renderCalendar();
});

document.getElementById('periodTabs').addEventListener('click', (e)=>{
  if(e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('#periodTabs button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  breakdownPeriod = e.target.dataset.p;
  renderBreakdown();
});

document.getElementById('breakdownTable').addEventListener('click', (e)=>{
  const th = e.target.closest('th');
  if(!th) return;
  const k = th.dataset.k;
  if(sortKey === k){ sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
  else { sortKey = k; sortDir = k==='period' ? 'desc' : 'desc'; }
  renderBreakdown();
});

document.getElementById('lightbox').addEventListener('click', ()=>{
  document.getElementById('lightbox').classList.remove('open');
});

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    closeModal();
    document.getElementById('lightbox').classList.remove('open');
  }
});

// ---------- Init ----------
(async function init(){
  await loadTrades();
  renderAll();
})();