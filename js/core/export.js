window.CWSExport = {
  toCSV(filename, rows){
    if(!rows || !rows.length){ UI.toast("Geen data om te exporteren"); return; }
    const keys = Object.keys(rows[0]);
    const neutralize = value => {
      const text = value == null ? "" : String(value);
      return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
    };
    const quote = value => `"${neutralize(value).replace(/"/g,'""')}"`;
    const csv = [
      keys.map(quote).join(";"),
      ...rows.map(row => keys.map(key => quote(row[key])).join(";"))
    ].join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    try{ CWS.audit?.("export_csv", { filename }); }catch(_error){}
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
};
