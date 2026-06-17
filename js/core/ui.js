
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

  const companyPrintInfo = () => {
    const root = window.parent?.CWS || window.CWS || {};
    const st = root.getState?.() || {};
    const companyName = root.getCompanyName?.() || (Array.isArray(st.settings?.tables?.company) && st.settings.tables.company[0]?.name) || st.company?.name || "CWS Planning";
    const logo = root.getCompanyLogo?.() || st.company?.logo?.dataUrl || "";
    return { companyName, logo };
  };

  const printA3 = (title, subtitle, html, options = {}) => {
    const w = window.open("", "_blank");
    if(!w) return toast("Pop-up geblokkeerd");
    const { companyName, logo } = companyPrintInfo();
    const logoHtml = logo ? `<img class="print-logo" src="${logo}" alt="Bedrijfslogo">` : `<div class="print-logo-placeholder">${escapeHtml(companyName).slice(0,2).toUpperCase()}</div>`;
    const paper = options.paper || "A3 landscape";
    const extraCss = options.extraCss || "";
    const printDate = new Date().toLocaleString("nl-NL");
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: ${paper}; margin: 12mm; }
        *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        html,body{ width:100%; min-height:100%; }
        body{ font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; margin:0; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .hdr{ display:flex; justify-content:space-between; align-items:flex-start; gap:18px; border-bottom:1px solid #cbd5e1; padding-bottom:10px; margin-bottom:12px;}
        .hdr h1{ margin:0; font-size:20px; line-height:1.15;}
        .hdr .sub{ font-size:11px; color:#475569; margin-top:3px;}
        .hdr .logo-wrap{min-width:150px;text-align:right;}
        .print-logo{max-width:170px;max-height:64px;object-fit:contain;}
        .print-logo-placeholder{display:inline-flex;align-items:center;justify-content:center;width:78px;height:44px;border:1px solid #cbd5e1;border-radius:10px;color:#475569;font-weight:900;background:#f8fafc;}
        table{ width:100%; border-collapse:collapse; font-size:10.5px; page-break-inside:auto;}
        tr{ page-break-inside:avoid; page-break-after:auto;}
        th,td{ border:1px solid #dbe3ef; padding:5px 7px; text-align:left; vertical-align:top;}
        th{ background:#f8fafc; font-weight:900; color:#334155;}
        .print-meta{font-size:10px;color:#64748b;margin-top:5px;}
        .status-badge,.health-badge,.task-state{display:inline-flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:999px;border:1px solid #dbe3ef;font-weight:800;font-size:10px;}
        .status-badge.gereed,.task-state.gereed{background:#dcfce7;border-color:#86efac;color:#166534;}
        .status-badge.vertraagd,.task-state.vertraagd{background:#fee2e2;border-color:#fca5a5;color:#991b1b;}
        .status-badge.uitvoering,.task-state.lopend{background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8;}
        .status-badge.aandacht,.health-badge.att-orange{background:#fff7ed;border-color:#fed7aa;color:#92400e;}
        .status-badge.niet,.task-state.nvt,.health-badge.att-gray{background:#f8fafc;border-color:#e2e8f0;color:#475569;}
        .health-badge.att-green{background:#dcfce7;border-color:#86efac;color:#166534;}
        .health-badge.att-red{background:#fee2e2;border-color:#fca5a5;color:#991b1b;}
        .progress{width:120px;height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(15,23,42,.06);}
        .progress i{display:block;height:100%;background:#2f6fbd;border-radius:999px;}
        .smallmuted{color:#64748b;font-size:10px;}
        ${extraCss}
      </style></head><body>
      <div class="hdr"><div><h1>${escapeHtml(title)}</h1><div class="sub"><b>${escapeHtml(companyName)}</b>${subtitle ? ` · ${escapeHtml(subtitle)}` : ""}</div><div class="print-meta">Afdruk: ${escapeHtml(printDate)}</div></div><div class="logo-wrap">${logoHtml}</div></div>
      ${html}
    </body></html>`);
    w.document.close();
    w.focus();
    try{ CWS.audit?.('print_a3', { title, paper }); }catch(e){}
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
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'cws-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cws-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('tabindex', '-1');

    const hdr = document.createElement('div');
    hdr.className = 'cws-modal-hdr';
    const h = document.createElement('div');
    h.innerHTML = `<div class="cws-modal-title">${escapeHtml(title)}</div>${subtitle ? `<div class="cws-modal-sub">${escapeHtml(subtitle)}</div>` : ''}`;
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = '✕';
    close.title = 'Sluiten';
    close.setAttribute('aria-label', 'Sluiten');
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

    let closed = false;
    const onKey = (e) => {
      if (e.key === 'Escape') api.close();
      if (e.key !== 'Tab') return;
      const focusable = Array.from(modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) {
        e.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const api = {
      close: () => {
        if (closed) return;
        closed = true;
        window.removeEventListener('keydown', onKey);
        overlay.remove();
        if (previousFocus?.focus) requestAnimationFrame(() => previousFocus.focus());
      },
      overlay,
      modal,
      body
    };
    window.addEventListener('keydown', onKey);
    close.addEventListener('click', api.close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) api.close(); });
    requestAnimationFrame(() => (modal.querySelector('button,input,select,textarea') || modal).focus());
    return api;
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Column wizard (Planbord-style): show/hide, reorder, rename.
  // Persists per tableKey in state.ui.tableColumns.
  const openColumnWizard = ({ tableKey, columns, onApply }) => {
    const st = (typeof CWS !== 'undefined' && CWS.getState) ? CWS.getState() : {};
    const saved = st.ui?.tableColumns?.[tableKey];
    const defaultCols = (Array.isArray(columns) ? columns : []).map(c => ({...c}));
    const defaultByKey = new Map(defaultCols.map(c => [String(c.key), c]));
    const seen = new Set();
    const cols = [];
    if(saved && Array.isArray(saved)){
      saved.forEach(c => {
        const k = String(c.key);
        const base = defaultByKey.get(k) || {};
        cols.push({ ...base, ...c, locked: base.locked || c.locked });
        seen.add(k);
      });
    }
    defaultCols.forEach(c => { if(!seen.has(String(c.key))) cols.push({ ...c }); });

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
    // Optional custom delete handler. Return false to keep the table unchanged.
    onDelete = null,
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
    const defaultCols = (Array.isArray(columns) ? columns : []).map(c=>({...c}));
    const defaultByKey = new Map(defaultCols.map(c => [String(c.key), c]));
    const seenCols = new Set();
    let cols = [];
    if(savedCols && Array.isArray(savedCols)){
      savedCols.forEach(c => { const k=String(c.key); const base=defaultByKey.get(k)||{}; cols.push({...base, ...c, locked:base.locked||c.locked}); seenCols.add(k); });
    }
    defaultCols.forEach(c => { if(!seenCols.has(String(c.key))) cols.push({...c}); });
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
    const colorApi = () => (typeof CWS !== 'undefined' && CWS.colors) ? CWS.colors : null;
    const colorMap = () => colorApi()?.map || {};
    const colorNames = () => colorApi()?.names || {};
    const normalizeColor = (value) => colorApi()?.normalize ? colorApi().normalize(value) : String(value || '');
    const colorOptionsHtml = (value) => {
      const map = colorMap();
      const names = colorNames();
      const key = normalizeColor(value);
      return Object.keys(map).map(k => `<option value="${escapeHtml(k)}" ${k===key?'selected':''} style="background:linear-gradient(90deg, ${escapeHtml(map[k])} 0 22px, #fff 22px);color:#0f172a;padding-left:26px">${escapeHtml(names[k] || k)}</option>`).join('');
    };
    const departmentOptionsHtml = (value) => {
      const st = (typeof CWS !== 'undefined' && CWS.getState) ? CWS.getState() : {};
      const seen = new Set();
      const rows = [];
      const add = (id, name) => {
        const v = String(id || name || '').trim();
        const label = String(name || id || '').trim();
        if(!v || seen.has(v)) return;
        seen.add(v);
        rows.push({ value:v, label:label || v });
      };
      (st.departments?.order || []).forEach(id => add(id, st.departments?.byId?.[id]?.name || id));
      (Array.isArray(st.settings?.tables?.departments) ? st.settings.tables.departments : []).forEach(d => add(d.id || d.name || d.code, d.name || d.id || d.code));
      (st.resources?.order || []).forEach(id => add(st.resources?.byId?.[id]?.dept, st.resources?.byId?.[id]?.dept));
      if(value && !rows.some(r => String(r.value) === String(value) || String(r.label) === String(value))) add(value, value);
      return rows.map(r => `<option value="${escapeHtml(r.value)}" ${String(r.value)===String(value)||String(r.label)===String(value)?'selected':''}>${escapeHtml(r.label)}</option>`).join('');
    };

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
          const isColor = !ro && (c.type === 'color' || String(c.key).toLowerCase() === 'color');
          const isDepartment = !ro && (c.type === 'department' || ['dept','department','afdeling'].includes(String(c.key).toLowerCase()));
          td.contentEditable = (ro || isColor || isDepartment) ? 'false' : 'true';
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
          if(isColor){
            const key = normalizeColor(cellVal);
            const hex = colorMap()[key] || cellVal || '#6b7280';
            td.innerHTML = `<span class="color-pick"><span class="color-swatch" style="background:${escapeHtml(hex)}"></span><select class="input" data-kind="color">${colorOptionsHtml(cellVal)}</select></span>`;
            const sel = td.querySelector('select');
            sel.addEventListener('change', () => {
              writeRows(arr => { const rr = arr[idx] || {}; rr[c.key] = colorMap()[sel.value] || sel.value; arr[idx] = rr; return arr; });
              render();
            });
            tr.appendChild(td);
            return;
          }
          if(isDepartment){
            td.innerHTML = `<select class="input" data-kind="department">${departmentOptionsHtml(cellVal)}</select>`;
            const sel = td.querySelector('select');
            sel.addEventListener('change', () => {
              writeRows(arr => { const rr = arr[idx] || {}; rr[c.key] = sel.value; arr[idx] = rr; return arr; });
              render();
            });
            tr.appendChild(td);
            return;
          }
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
          if(typeof onDelete === 'function'){
            const handled = onDelete({ row:r, index:idx, rows:readRows(), render, writeRows });
            if(handled !== false) render();
            return;
          }
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
