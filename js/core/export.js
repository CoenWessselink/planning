
window.CWSExport = {
  toCSV(filename, rows){
    if(!rows || !rows.length){ UI.toast("Geen data om te exporteren"); return; }
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(";"),
      ...rows.map(r=> keys.map(k=> `"${(r[k]??"").toString().replace(/"/g,'""')}"`).join(";"))
    ].join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    try{ CWS.audit?.('export_csv', { filename }); }catch(e){}
    document.body.removeChild(a);
  }
};
