
const UI = (() => {
  const toastEl = () => document.getElementById("toast");
  let tmr = null;
  const toast = (msg) => {
    const el = toastEl();
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(tmr);
    tmr = setTimeout(()=>el.classList.remove("show"), 1600);
  };

  const statusToColor = (status) => {
    switch(status){
      case "Te plannen": return "var(--st-teplannen)";
      case "Ingepland": return "var(--st-ingepland)";
      case "In uitvoering": return "var(--st-uitvoering)";
      case "Gereed": return "var(--st-gereed)";
      default: return "#64748b";
    }
  };

  const statusBadge = (status) => {
    const span = document.createElement("span");
    span.className = "badge";
    span.style.background = statusToColor(status);
    span.textContent = status;
    return span;
  };

  const weekKey = (wk) => `${wk.year}-W${String(wk.week).padStart(2,"0")}`;

  const downloadText = (filename, text, mime="text/plain;charset=utf-8") => {
    const blob = new Blob([text], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  };

  const downloadCSV = (filename, rows) => {
    const esc = (v) => {
      const s = (v==null ? "" : String(v));
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    };
    const csv = rows.map(r => r.map(esc).join(",")).join("\n");
    downloadText(filename, csv, "text/csv;charset=utf-8");
  };

  const printA3 = (title, subtitle, html) => {
    const w = window.open("", "_blank");
    if(!w) return toast("Pop-up geblokkeerd");
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
      <title>${title}</title>
      <style>
        @page { size: A3 landscape; margin: 12mm; }
        body{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; }
        .hdr{ display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid #cbd5e1; padding-bottom:8px; margin-bottom:10px;}
        .hdr h1{ margin:0; font-size:18px;}
        .hdr .sub{ font-size:12px; color:#475569;}
        table{ width:100%; border-collapse:collapse; font-size:11px;}
        th,td{ border:1px solid #e2e8f0; padding:6px 8px; text-align:left; }
        th{ background:#f8fafc; }
      </style></head><body>
      <div class="hdr"><div><h1>${title}</h1><div class="sub">${subtitle||""}</div></div>
      <div class="sub">${new Date().toLocaleString()}</div></div>
      ${html}
    </body></html>`);
    w.document.close();
    w.focus();
    try{ CWS.audit?.('print_a3', { title }); }catch(e){}
    w.print();
  };

  // Cross-origin safe Apps Menu opener.
  // Layers are often embedded in iframes; direct parent access can throw SecurityError.
  const openAppsMenuSafe = () => {
    const w = window;
    try {
      if (w.parent && w.parent !== w && w.parent.AppsMenu && typeof w.parent.AppsMenu.show === "function") {
        w.parent.AppsMenu.show();
        return true;
      }
    } catch (e) {}
    try {
      if (w.top && w.top !== w && w.top.AppsMenu && typeof w.top.AppsMenu.show === "function") {
        w.top.AppsMenu.show();
        return true;
      }
    } catch (e) {}
    toast("Apps Menu niet bereikbaar (embedded).");
    return false;
  };

  // -----------------------------
  // Modal + Wizard helpers
  // -----------------------------
  const openModal = ({ title="", subtitle="", contentEl=null, actions=[] } = {}) => {
    const overlay = document.createElement('div');
    overlay.className = 'cws-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cws-modal';

    const hdr = document.createElement('div');
    hdr.className = 'cws-modal-hdr';
    const h = document.createElement('div');
    h.innerHTML = `<div class="cws-modal-title">${escapeHtml(title)}</div>${subtitle ? `<div class="cws-modal-sub">${escapeHtml(subtitle)}</div>` : ''}`;
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = '✕';
    close.title = 'Sluiten';
    hdr.appendChild(h);
    hdr.appendChild(close);

    const body = document.createElement('div');
    body.className = 'cws-modal-body';
    if (contentEl) body.appendChild(contentEl);

    const ftr = document.createElement('div');
    ftr.className = 'cws-modal-ftr';
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = a.className || 'btn';
      b.textContent = a.label || 'OK';
      b.addEventListener('click', () => {
        try { a.onClick && a.onClick({ close: api.close }); } catch (e) { console.error(e); }
      });
      ftr.appendChild(b);
    });

    modal.appendChild(hdr);
    modal.appendChild(body);
    modal.appendChild(ftr);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const api = {
      close: () => { overlay.remove(); },
      overlay,
      modal,
      body
    };
    const onKey = (e) => { if (e.key === 'Escape') api.close(); };
    window.addEventListener('keydown', onKey);
    const cleanup = () => window.removeEventListener('keydown', onKey);
    close.addEventListener('click', () => { api.close(); cleanup(); });
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) { api.close(); cleanup(); } });
    return api;
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Column wizard (Planbord-style): show/hide, reorder, rename.
  // Persists per tableKey in state.ui.tableColumns.
  const openColumnWizard = ({ tableKey, columns, onApply }) => {
    const st = (typeof CWS !== 'undefined' && CWS.getState) ? CWS.getState() : {};
    const saved = st.ui?.tableColumns?.[tableKey];
    const cols = (saved && Array.isArray(saved)) ? saved.map(c => ({...c})) : columns.map(c => ({...c}));

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="smallmuted" style="margin-bottom:10px;">Kolommen verslepen, hernoemen en (de)selecteren. Wijzigingen worden opgeslagen.</div>
      <div class="cws-colwiz" id="colwiz"></div>
      <div class="smallmuted" style="margin-top:10px;">Tip: sleep via ☰ om volgorde te wijzigen.</div>
    `;
    const list = wrap.querySelector('#colwiz');

    const render = () => {
      list.innerHTML = '';
      cols.forEach((c, idx) => {
        const row = document.createElement('div');
        row.className = 'cws-colwiz-row';
        row.draggable = !c.locked;
        row.dataset.idx = String(idx);
        row.innerHTML = `
          <span class="cws-drag">☰</span>
          <label style="display:flex;align-items:center;gap:10px;flex:1;">
            <input type="checkbox" ${c.visible===false ? '' : 'checked'} />
            <span class="cws-colwiz-key">${escapeHtml(c.key||'')}</span>
            <input class="input" value="${escapeHtml(c.label||'')}" style="flex:1;" />
          </label>
          ${c.locked ? `<span class="pill">vast</span>` : `<button class="btn" data-act="del">Verwijder</button>`}
        `;
        const cb = row.querySelector('input[type=checkbox]');
        const inp = row.querySelector('input.input');
        cb.addEventListener('change', () => { c.visible = cb.checked; });
        inp.addEventListener('input', () => { c.label = inp.value; });
        const del = row.querySelector('[data-act=del]');
        if (del) del.addEventListener('click', () => {
          cols.splice(idx,1);
          render();
        });

        // dnd reorder
        row.addEventListener('dragstart', (e) => {
          if(c.locked){ e.preventDefault(); return; }
          e.dataTransfer.setData('text/plain', row.dataset.idx);
          e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect='move'; });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData('text/plain'),10);
          const to = parseInt(row.dataset.idx,10);
          if (!Number.isFinite(from)||!Number.isFinite(to)||from===to) return;
          const [it] = cols.splice(from,1);
          cols.splice(to,0,it);
          render();
        });
        list.appendChild(row);
      });
    };
    render();

    const api = openModal({
      title: 'Kolommen beheren',
      subtitle: tableKey,
      contentEl: wrap,
      actions: [
        { label: 'Annuleren', className: 'btn', onClick: ({close}) => close() },
        { label: 'Toepassen', className: 'btn primary', onClick: ({close}) => {
            try{
              CWS.setState(s=>{
                s.ui = s.ui || {};
                s.ui.tableColumns = s.ui.tableColumns || {};
                s.ui.tableColumns[tableKey] = cols;
                return s;
              });
            }catch(e){}
            try{ onApply && onApply(cols); }catch(e){ console.error(e); }
            close();
        }}
      ]
    });
    return api;
  };

  // Generic Table Manager (Phase 21): CRUD + search + export + column wizard.
  // Data is stored at statePath, e.g. "settings.datasets.clients" (array of objects).
  // Column layout is stored in state.ui.tableColumns[tableKey].
  const openTableManager = ({
    title = 'Tabel',
    subtitle = '',
    tableKey = 'table',
    statePath = '',
    defaultRow = () => ({}),
    columns = [],
    // Optional extra buttons to add to the toolbar
    // Example: [{ label:'Werkweek & kalender', act:'openWorkweek', primary:true }]
    extraButtons = [],
    // Optional handler for custom toolbar actions
    onAction = null,
    // Optional callback invoked after any add/edit/delete write
    onChange = null,
  } = {}) => {
    const getAtPath = (obj, path) => {
      const parts = (path||'').split('.').filter(Boolean);
      let cur = obj;
      for (const p of parts){ if(!cur) return undefined; cur = cur[p]; }
      return cur;
    };
    const ensureAtPath = (obj, path, fallback) => {
      const parts = (path||'').split('.').filter(Boolean);
      let cur = obj;
      for (let i=0;i<parts.length;i++){
        const p = parts[i];
        if(i===parts.length-1){
          if (cur[p] == null) cur[p] = fallback;
          return cur[p];
        }
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
      return cur;
    };

    const st0 = (typeof CWS !== 'undefined' && CWS.getState) ? CWS.getState() : {};
    const savedCols = st0.ui?.tableColumns?.[tableKey];
    let cols = (savedCols && Array.isArray(savedCols)) ? savedCols.map(c=>({...c})) : columns.map(c=>({...c}));
    cols.forEach(c => { if (c.visible == null) c.visible = true; });

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateRows = 'auto auto 1fr auto';
    wrap.style.gap = '10px';
    wrap.style.minHeight = '520px';

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.gap = '10px';
    top.style.flexWrap = 'wrap';
    top.style.alignItems = 'center';
    const extraBtnHtml = (Array.isArray(extraButtons) ? extraButtons : []).map(b=>{
      const cls = (b && b.primary) ? 'btn primary' : 'btn';
      const act = (b && b.act) ? String(b.act) : '';
      const label = (b && b.label) ? String(b.label) : '';
      return `<button class="${cls}" data-act="${escapeHtml(act)}">${escapeHtml(label)}</button>`;
    }).join('');

    top.innerHTML = `
      <input class="input" data-el="q" placeholder="Zoeken…" style="min-width:240px;"/>
      <button class="btn" data-act="clear">Leeg</button>
      <button class="btn" data-act="cols">Kolommen</button>
      <button class="btn" data-act="add">Nieuw</button>
      <button class="btn" data-act="export">Export CSV</button>
      ${extraBtnHtml}
    `;

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';
    tableWrap.style.maxHeight = '440px';

    const table = document.createElement('table');
    table.innerHTML = `<thead><tr></tr></thead><tbody></tbody>`;
    tableWrap.appendChild(table);

    const footer = document.createElement('div');
    footer.className = 'footerbar';
    footer.innerHTML = `<div class="smallmuted" data-el="count">0 items</div><div class="smallmuted">${escapeHtml(subtitle||'')}</div>`;

    wrap.appendChild(top);
    wrap.appendChild(tableWrap);
    wrap.appendChild(footer);

    const els = {
      q: top.querySelector('[data-el=q]'),
      count: footer.querySelector('[data-el=count]'),
      headRow: table.querySelector('thead tr'),
      body: table.querySelector('tbody')
    };

    const readRows = () => {
      const st = (typeof CWS !== 'undefined' && CWS.getState) ? CWS.getState() : {};
      const arr = getAtPath(st, statePath);
      return Array.isArray(arr) ? arr : [];
    };
    const writeRows = (fn) => {
      try{
        CWS.setState(s => {
          const arr = ensureAtPath(s, statePath, []);
          const next = fn(Array.isArray(arr) ? arr.slice() : []);
          // write back
          const parts = (statePath||'').split('.').filter(Boolean);
          let cur = s;
          for (let i=0;i<parts.length;i++){
            const p = parts[i];
            if(i===parts.length-1){ cur[p] = next; break; }
            cur[p] = cur[p] || {};
            cur = cur[p];
          }
          return s;
        });
        // fire callback after state applied
        // Run synchronously so computed/read-only columns (e.g. totals)
        // can be updated before the next render.
        try{
          if(typeof onChange === 'function') { try{ onChange(); }catch(_){} }
        }catch(_){ }
      }catch(e){ console.error(e); }
    };

    const visibleCols = () => cols.filter(c => c.visible !== false);

    const render = () => {
      const q = (els.q.value||'').toLowerCase().trim();
      const rows = readRows();
      const vcols = visibleCols();
      els.headRow.innerHTML = '';
      vcols.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c.label || c.key;
        th.dataset.key = c.key;
        els.headRow.appendChild(th);
      });
      const thAct = document.createElement('th');
      thAct.textContent = 'Acties';
      thAct.style.textAlign = 'right';
      thAct.style.width = '120px';
      els.headRow.appendChild(thAct);

      els.body.innerHTML = '';
      let shown = 0;
      rows.forEach((r, idx) => {
        const txt = JSON.stringify(r||{}).toLowerCase();
        if(q && !txt.includes(q)) return;
        shown++;
        const tr = document.createElement('tr');
        tr.dataset.idx = String(idx);
        vcols.forEach(c => {
          const td = document.createElement('td');
          const ro = !!(c.readonly || c.readOnly);
          td.contentEditable = ro ? 'false' : 'true';
          td.dataset.key = c.key;
          // Support computed columns
          let cellVal = '';
          try{
            if(typeof c.valueGetter === 'function'){
              cellVal = c.valueGetter(r, { rowIndex: idx, rows, state: (typeof CWS!=='undefined' && CWS.getState)?CWS.getState():{} })
            } else {
              cellVal = (r?.[c.key] ?? '');
            }
          }catch(_){ cellVal = (r?.[c.key] ?? ''); }
          td.textContent = (cellVal ?? '').toString();
          td.addEventListener('blur', () => {
            const key = td.dataset.key;
            if(ro) return;
            let val = td.textContent;
            // Basic typing support
            if(c.type === 'number'){
              const num = parseFloat(String(val).replace(',','.'));
              val = Number.isFinite(num) ? num : 0;
            }
            if(c.type === 'boolean'){
              const s = String(val).toLowerCase().trim();
              val = (s === 'true' || s === '1' || s === 'ja' || s === 'yes');
            }
            writeRows(arr => {
              const rr = arr[idx] || {};
              rr[key] = val;
              arr[idx] = rr;
              return arr;
            });
            // Re-render so computed/read-only values (e.g. totals) update immediately.
            render();
          });
          tr.appendChild(td);
        });
        const tdA = document.createElement('td');
        tdA.style.textAlign = 'right';
        tdA.innerHTML = `<button class="btn" data-act="del">Verwijder</button>`;
        tdA.querySelector('[data-act=del]').addEventListener('click', () => {
          if(!confirm('Rij verwijderen?')) return;
          writeRows(arr => { arr.splice(idx,1); return arr; });
          render();
        });
        tr.appendChild(tdA);
        els.body.appendChild(tr);
      });
      els.count.textContent = `${shown} items`;
    };

    top.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if(!b) return;
      const act = b.dataset.act;
      if(act === 'clear'){ els.q.value=''; render(); }
      if(act === 'add'){
        writeRows(arr => { arr.push(defaultRow()); return arr; });
        render();
      }
      if(act === 'export'){
        const vcols = visibleCols();
        const rows = readRows();
        const out = [ vcols.map(c=>c.label||c.key) ];
        rows.forEach(r => out.push(vcols.map(c => (r?.[c.key] ?? ''))));
        downloadCSV(`${tableKey}.csv`, out);
      }
      if(act === 'cols'){
        openColumnWizard({ tableKey, columns: cols, onApply: (newCols) => { cols = newCols.map(c=>({...c})); render(); } });
      }
      // Custom actions
      if(act && act !== 'clear' && act !== 'add' && act !== 'export' && act !== 'cols'){
        try{ if(typeof onAction === 'function') onAction(act, { close: ()=>{ try{ api && api.close && api.close(); }catch(_){} } }); }catch(_){ }
      }
    });
    els.q.addEventListener('input', render);

    const api = openModal({
      title,
      subtitle,
      contentEl: wrap,
      actions: [ { label: 'Sluiten', className: 'btn', onClick: ({close}) => close() } ]
    });
    // initial ensure dataset exists
    writeRows(arr => arr);
    render();
    return api;
  };

  return { toast, statusBadge, statusToColor, weekKey, downloadText, downloadCSV, printA3, openAppsMenuSafe, openModal, openColumnWizard, openTableManager };
})();

// Expose UI helpers globally for layer scripts
try {
  if (typeof window !== 'undefined') {
    window.CWS_UI = window.CWS_UI || UI;
    window.UI = window.UI || UI;
  }
} catch {}
