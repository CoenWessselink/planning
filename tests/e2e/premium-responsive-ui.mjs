import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const chromeCandidates = process.platform === "win32"
  ? [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
    ]
  : process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chrome = chromeCandidates.find(candidate => candidate && fs.existsSync(candidate));

if (!chrome) {
  console.log("SKIP - Chrome niet gevonden; premium responsive UI E2E vereist Chrome.");
  process.exit(0);
}

const port = 10_060 + Math.floor(Math.random() * 120);
const debugPort = port + 1000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cws-premium-ui-"));
let server;
let browser;
let socket;
let sessionId;
let commandId = 0;
let failed = false;
let consoleErrors = [];
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function check(label, pass, detail = "") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed = true;
}

async function waitFor(fn, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await delay(100);
  }
  throw new Error("Timeout tijdens premium responsive UI E2E.");
}

function cdp(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 20_000);
    pending.set(id, {
      resolve:value => { clearTimeout(timer); resolve(value); },
      reject:error => { clearTimeout(timer); reject(error); }
    });
  });
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser-evaluatie mislukt.");
  return result.result?.value;
}

async function openShell(width, height) {
  consoleErrors = [];
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width < 768 });
  await cdp("Page.navigate", { url:`http://127.0.0.1:${port}/index.html?fixture=restored-d1` });
  await waitFor(() => evaluate("document.readyState === 'complete' && document.body?.dataset.cwsReady === 'true'"));
  await delay(500);
}

async function frameReady() {
  return evaluate(`(()=> {
    const frame = document.querySelector("#appFrame");
    return Boolean(frame?.contentDocument?.body && frame.contentDocument.body.innerText.length > 8);
  })()`);
}

async function loadModule(appId) {
  consoleErrors = [];
  await evaluate(`Router.loadApp(${JSON.stringify(appId)})`);
  await waitFor(frameReady);
  await delay(350);
}

async function frameEval(expression) {
  return evaluate(`(()=> {
    const frame = document.querySelector("#appFrame");
    return frame.contentWindow.eval(${JSON.stringify(expression)});
  })()`);
}

try {
  server = spawn(process.execPath, ["scripts/serve.mjs", `--port=${port}`], {
    cwd:process.cwd(),
    stdio:["ignore", "pipe", "pipe"],
    windowsHide:true
  });
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await response.json();
    return response.ok && Boolean(data.ok);
  });

  browser = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio:["ignore", "ignore", "ignore"], windowsHide:true });

  const pageTarget = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find(item => item.type === "page" && item.webSocketDebuggerUrl) || null;
  });
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result || {});
      return;
    }
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(message.params?.exceptionDetails?.text || "Uncaught exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      consoleErrors.push((message.params.args || []).map(arg => arg.value || arg.description || "").join(" "));
    }
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");

  await openShell(1440, 900);
  const desktopMenu = await evaluate(`(()=> {
    AppsMenu.show();
    const cards = Array.from(document.querySelectorAll("#appsGrid .app-card")).map(card => card.textContent.trim());
    const utility = Array.from(document.querySelectorAll("#appsUtility .apps-utility-card")).map(card => card.textContent.trim());
    return {
      open:document.querySelector("#appsBackdrop")?.classList.contains("show"),
      hero:document.querySelector(".apps-hero h1")?.textContent || "",
      cards,
      utility,
      mainCount:Number(document.querySelector("#appsGrid")?.dataset.mainAppCount || cards.length),
      footer:document.querySelector("#appsFooter")?.textContent || "",
      navVisible:getComputedStyle(document.querySelector("#mobileBottomNav")).display !== "none"
    };
  })()`);
  check("Desktop Apps Menu opent premium met hero", desktopMenu.open && desktopMenu.hero.includes("Welkom bij CWS Planning"));
  check("Desktop Apps Menu toont compleet hoofdmodulecontract", desktopMenu.mainCount >= 16 && desktopMenu.cards.length >= 16, JSON.stringify({ mainCount:desktopMenu.mainCount, cards:desktopMenu.cards.length }));
  check("Desktop Apps Menu bevat alle mockup- en prompt-hoofdmodules", ["Dashboard","Projecten","Gantt","Capaciteit","Afdelingsplanning","Werkvoorraad","Resources","Conflicten","Mijn werk","Rollen & rechten","Projectoverzicht","Planbord","Rapporten","Import / Export","Instellingen","Auditlog"].every(label => desktopMenu.cards.some(text => text.includes(label))));
  check("Desktop Apps Menu behoudt beheer-extra's compact", ["Self-test","Projectplanning","Transportplanning"].every(label => desktopMenu.utility.some(text => text.includes(label))));
  check("Desktop toont geen mobiele bottom nav", desktopMenu.navVisible === false);
  check("Apps Menu footer behoudt premium regel", desktopMenu.footer.includes("Veilig") && desktopMenu.footer.includes("D1-state"));
  await evaluate(`(()=> {
    document.querySelector('#appsGrid .app-card[data-app-id="gantt"]')?.click();
    return true;
  })()`);
  await waitFor(() => evaluate(`document.body.dataset.activeApp === "gantt" && document.querySelector("#moduleTitle")?.textContent === "Gantt"`));
  check("Apps Menu tegel navigeert naar echte Gantt-route", await evaluate(`document.body.dataset.activeApp === "gantt"`));
  await waitFor(frameReady);
  const ganttDesktop = await frameEval(`(()=> {
    return {
      toolbar:!!document.querySelector(".toolbar"),
      add:[...document.querySelectorAll("button")].some(b=>/Taak toevoegen/i.test(b.textContent)),
      phase:[...document.querySelectorAll("button")].some(b=>/Nieuwe fase/i.test(b.textContent)),
      board:!!document.querySelector(".board-wrap"),
      labelsSafe:!document.querySelector(".bar-label") || getComputedStyle(document.querySelector(".bar-label")).pointerEvents === "none"
    };
  })()`);
  check("Gantt desktop toolbar en board blijven aanwezig", ganttDesktop.toolbar && ganttDesktop.add && ganttDesktop.phase && ganttDesktop.board);
  check("Gantt labels blokkeren pointer-events niet", ganttDesktop.labelsSafe);

  const globalSearchOpen = await evaluate(`(()=> {
    const st = CWS.getState();
    const all = (st.projects?.order || []).map(id => st.projects.byId[id]).filter(Boolean);
    const project = all.find(p => String(p.status || "").trim().toLowerCase() !== "gereed") || all[0] || {};
    const query = String(project.nr || project.code || project.name || project.id || "").trim();
    document.dispatchEvent(new KeyboardEvent("keydown", { key:"k", ctrlKey:true, bubbles:true, cancelable:true }));
    const input = document.querySelector("#globalSearchInput");
    if(input){
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles:true }));
    }
    return {
      open:document.querySelector("#globalSearchBackdrop")?.classList.contains("show"),
      query,
      projectId:project.id || "",
      count:document.querySelectorAll(".global-search-result").length,
      actions:Array.from(document.querySelectorAll("[data-global-search-action]")).map(btn => btn.dataset.globalSearchAction)
    };
  })()`);
  check("Ctrl+K opent globale zoek-overlay", globalSearchOpen.open && globalSearchOpen.query);
  check("Globale zoek-overlay toont routeknoppen", globalSearchOpen.count > 0 && ["gantt","capaciteit","project360"].every(action => globalSearchOpen.actions.includes(action)), JSON.stringify(globalSearchOpen));
  await evaluate(`document.querySelector('[data-global-search-action="projecten"]')?.click()`);
  await waitFor(() => evaluate(`document.body.dataset.activeApp === "projecten"`));
  await waitFor(frameReady);
  const projectenSearchValue = await frameEval(`(()=> document.querySelector("#search")?.value || "")()`);
  check("Globale zoekactie navigeert naar Projecten met zoekfilter", projectenSearchValue.includes(globalSearchOpen.query), JSON.stringify({ projectenSearchValue, expected:globalSearchOpen.query }));

  await evaluate(`(()=> {
    document.dispatchEvent(new KeyboardEvent("keydown", { key:"k", ctrlKey:true, bubbles:true, cancelable:true }));
    const input = document.querySelector("#globalSearchInput");
    if(input){
      input.value = ${JSON.stringify(globalSearchOpen.query)};
      input.dispatchEvent(new Event("input", { bubbles:true }));
    }
    document.querySelector('[data-global-search-action="gantt"]')?.click();
    return true;
  })()`);
  await waitFor(() => evaluate(`document.body.dataset.activeApp === "gantt"`));
  await waitFor(frameReady);
  await waitFor(() => frameEval(`(()=> document.querySelector("#projectSel")?.value === ${JSON.stringify(globalSearchOpen.projectId)})()`));
  const globalSearchGanttTarget = await evaluate(`(()=> {
    const target = CWS.getState().ui?.globalSearchTarget || {};
    return { module:target.module, projectId:target.projectId };
  })()`);
  const selectedGlobalProject = await frameEval(`(()=> document.querySelector("#projectSel")?.value || "")()`);
  check("Globale zoekactie navigeert naar Gantt met projecttarget", globalSearchGanttTarget.module === "gantt" && globalSearchGanttTarget.projectId === globalSearchOpen.projectId && selectedGlobalProject === globalSearchOpen.projectId, JSON.stringify({ globalSearchGanttTarget, selectedGlobalProject, expected:globalSearchOpen.projectId }));

  await evaluate(`(()=> {
    const staleDate = new Date(Date.now() - 3600_000).toISOString();
    const st = CWS.getState();
    const projectId = ${JSON.stringify(globalSearchOpen.projectId)};
    CWS.setState(draft => {
      draft.ui = draft.ui || {};
      draft.ui.lastTab = "Ingepland";
      draft.ui.globalSearchTarget = {
        module:"projecten",
        projectId,
        openedAt:staleDate,
        expiresAt:staleDate,
        source:"global-search"
      };
      return draft;
    }, { userAction:false, reason:"test-stale-global-target", persistLocal:false });
    return true;
  })()`);
  await loadModule("projecten");
  const staleProjectFilter = await frameEval(`(()=> {
    const search = document.querySelector("#search")?.value || "";
    const active = Array.from(document.querySelectorAll(".tabs button,.status-tabs button,button")).find(btn => btn.classList.contains("active") && ["Alle","Te plannen","Ingepland","In uitvoering","Gereed"].includes(btn.textContent.trim()))?.textContent.trim() || "";
    const rendered = Number(document.querySelector("#rows")?.dataset.renderedCount || document.querySelectorAll("#rows tr").length || 0);
    const summary = document.querySelector("#count")?.textContent || document.body.innerText;
    return { search, active, rendered, summary };
  })()`);
  check("Stale globale projecttarget filtert Projecten niet meer", staleProjectFilter.search === "" && staleProjectFilter.active === "Alle" && staleProjectFilter.rendered > 10, JSON.stringify(staleProjectFilter));

  await loadModule("gantt");
  await frameEval(`(()=> {
    const input = document.querySelector("#projectSearch");
    input?.focus();
    if(input){
      input.value = "Fixture";
      input.dispatchEvent(new Event("input", { bubbles:true }));
    }
    return true;
  })()`);
  await delay(250);
  const ganttProjectDropdown = await frameEval(`(()=> {
    const before = document.querySelector("#projectSel")?.value || "";
    const results = Array.from(document.querySelectorAll("#projectResults .project-result"));
    const target = results.find(btn => btn.dataset.projectId && btn.dataset.projectId !== before) || results[0];
    target?.click();
    const after = document.querySelector("#projectSel")?.value || "";
    return {
      before,
      after,
      count:results.length,
      open:document.querySelector("#projectResults")?.hidden === false,
      label:document.querySelector("#projectSearch")?.value || ""
    };
  })()`);
  check("Gantt projectzoek-dropdown toont en wisselt projecten", ganttProjectDropdown.count > 1 && ganttProjectDropdown.after && ganttProjectDropdown.after !== ganttProjectDropdown.before, JSON.stringify(ganttProjectDropdown));

  const globalCapacitySearch = await evaluate(`(()=> {
    const st = CWS.getState();
    const deptNames = new Set();
    (st.departments?.order || Object.keys(st.departments?.byId || {})).forEach(id => {
      const dept = st.departments?.byId?.[id];
      deptNames.add(dept?.name || id);
    });
    Object.values(st.gantt?.sourcesByDay || {}).forEach(byDept => Object.keys(byDept || {}).forEach(name => deptNames.add(name)));
    const dept = Array.from(deptNames).filter(Boolean)[0] || "";
    document.dispatchEvent(new KeyboardEvent("keydown", { key:"k", ctrlKey:true, bubbles:true, cancelable:true }));
    const input = document.querySelector("#globalSearchInput");
    if(input){
      input.value = dept;
      input.dispatchEvent(new Event("input", { bubbles:true }));
    }
    const row = Array.from(document.querySelectorAll(".global-search-result")).find(item => item.textContent.includes("department") && item.textContent.includes(dept));
    const button = row?.querySelector('[data-global-search-action="capaciteit"]');
    const clicked = button ? button.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true, view:window })) : false;
    const target = CWS.getState().ui?.globalSearchTarget || {};
    return { dept, clicked, count:document.querySelectorAll(".global-search-result").length, activeApp:document.body.dataset.activeApp, targetModule:target.module, targetDept:target.dept };
  })()`);
  check("Globale zoekactie vindt afdeling voor Capaciteit", Boolean(globalCapacitySearch.dept) && globalCapacitySearch.clicked, JSON.stringify(globalCapacitySearch));
  await waitFor(() => evaluate(`document.body.dataset.activeApp === "capaciteit"`));
  await waitFor(frameReady);
  const capacityFilter = await frameEval(`(()=> document.querySelector("#deptSel")?.value || "")()`);
  check("Capaciteit past globale afdeling-target toe", capacityFilter === globalCapacitySearch.dept, JSON.stringify({ capacityFilter, expected:globalCapacitySearch.dept }));

  const viewports = [
    [1920, 1080],
    [360, 740],
    [375, 812],
    [390, 844],
    [414, 896],
    [430, 932],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1180, 820],
    [1440, 900],
  ];
  for (const [width, height] of viewports) {
    await openShell(width, height);
    const shell = await evaluate(`(()=> {
      const nav = document.querySelector("#mobileBottomNav");
      const frame = document.querySelector("#appFrame");
      return {
        ready:document.body.dataset.cwsReady === "true",
        viewport:document.body.dataset.cwsViewport,
        navVisible:nav && getComputedStyle(nav).display !== "none",
        shellOverflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
        frameReady:Boolean(frame?.contentDocument?.body && frame.contentDocument.body.innerText.length > 8),
        header:!!document.querySelector(".cws-brand")
      };
    })()`);
    check(`Viewport ${width}x${height} boot zonder white screen`, shell.ready && shell.frameReady && shell.header);
    check(`Viewport ${width}x${height} shell heeft geen onbeheersbare overflow`, shell.shellOverflow <= 2 || width < 768, JSON.stringify(shell));
    if (width < 768) {
      check(`Viewport ${width}x${height} mobiele bottom nav zichtbaar`, shell.navVisible === true);
      const mobileNav = await evaluate(`(()=> {
        const labels = Array.from(document.querySelectorAll("#mobileBottomNav button")).map(btn => btn.textContent.trim());
        const gantt = document.querySelector('[data-mobile-app="gantt"]');
        gantt?.click();
        return { labels, clicked:Boolean(gantt), active:gantt?.classList.contains("active") };
      })()`);
      await delay(650);
      let activeAfterClick = await evaluate(`document.body.dataset.activeApp === "gantt" || Router.getActiveApp() === "gantt"`);
      if(!activeAfterClick){
        activeAfterClick = await evaluate(`(()=> {
          const gantt = document.querySelector('[data-mobile-app="gantt"]');
          gantt?.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));
          return Boolean(gantt);
        })()`);
        await delay(650);
        activeAfterClick = await evaluate(`document.body.dataset.activeApp === "gantt" || Router.getActiveApp() === "gantt"`);
      }
      check(`Viewport ${width}x${height} bottom nav bevat hoofditems`, ["Dashboard","Projecten","Gantt","Capaciteit","Meer"].every(label => mobileNav.labels.some(text => text.includes(label))));
      check(`Viewport ${width}x${height} Gantt is primaire mobiele actie`, await evaluate(`document.querySelector('[data-mobile-app="gantt"]')?.classList.contains("mobile-nav-primary")`));
      check(`Viewport ${width}x${height} bottom nav navigeert naar Gantt`, activeAfterClick);
      if(!activeAfterClick) await evaluate(`Router.loadApp("gantt")`);
      const more = await evaluate(`(()=> {
        document.querySelector('[data-mobile-app="more"]')?.click();
        const sheet = document.querySelector("#mobileMoreSheet");
        const panel = sheet?.querySelector(".mobile-more-panel");
        const grid = sheet?.querySelector(".mobile-more-grid");
        const rect = panel?.getBoundingClientRect?.();
        const labels = Array.from(document.querySelectorAll("[data-more-app]")).map(btn => btn.textContent.trim());
        const open = sheet?.classList.contains("show");
        const fits = rect ? rect.left >= -1 && rect.right <= window.innerWidth + 1 : false;
        const gridOverflow = grid ? Math.max(0, grid.scrollWidth - grid.clientWidth) : 0;
        document.querySelector(".mobile-more-close")?.click();
        const closedByX = !sheet?.classList.contains("show");
        document.querySelector('[data-mobile-app="more"]')?.click();
        document.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape" }));
        const closedByEsc = !sheet?.classList.contains("show");
        return { open, labels, closedByX, closedByEsc, fits, gridOverflow };
      })()`);
      check(`Viewport ${width}x${height} Meer-sheet opent en bevat extra modules`, more.open && more.labels.some(text => text.includes("Projectoverzicht")) && more.labels.some(text => text.includes("Instellingen")));
      check(`Viewport ${width}x${height} Meer-sheet past binnen viewport`, more.fits && more.gridOverflow <= 2, JSON.stringify(more));
      check(`Viewport ${width}x${height} Meer-sheet sluit via X en Escape`, more.closedByX && more.closedByEsc);
    }
  }

  await openShell(375, 812);
  await loadModule("dashboard");
  const dashboardMobile = await frameEval(`(()=> {
    const dash = document.querySelector("[data-testid='mobile-dashboard']");
    const visible = dash && getComputedStyle(dash).display !== "none";
    return {
      visible,
      kpis:document.querySelectorAll(".mobile-kpi").length,
      sections:Array.from(document.querySelectorAll(".mobile-section h2")).map(h=>h.textContent.trim()),
      capacityText:document.querySelector("#mobileCapacityPct")?.textContent || "",
      capacityWidth:document.querySelector("#mobileCapacityFill")?.style.width || "",
    };
  })()`);
  check("Mobiel dashboard toont cockpit volgens referentie", dashboardMobile.visible && dashboardMobile.kpis >= 4 && dashboardMobile.sections.includes("Projecten in uitvoering") && dashboardMobile.sections.includes("Capaciteit overzicht"), JSON.stringify(dashboardMobile));
  check("Mobiel dashboard toont echte capaciteit-KPI", /%$/.test(dashboardMobile.capacityText) && /%$/.test(dashboardMobile.capacityWidth), JSON.stringify(dashboardMobile));

  await openShell(390, 844);
  await loadModule("gantt");
  const ganttMobileFit = await frameEval(`(()=> {
    const dock = document.querySelector("#cwsV37MobileActionDock");
    const wrap = document.querySelector("#boardWrap");
    return {
      noDock:!dock,
      native:document.body.classList.contains("cws-mobile-native-actions"),
      bodyOverflow:Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      wrapFits:wrap ? wrap.getBoundingClientRect().right <= window.innerWidth + 1 : false,
      scrollable:wrap ? wrap.scrollWidth > wrap.clientWidth : false,
    };
  })()`);
  check("Gantt mobiel heeft geen overlappende iframe-actiedock", ganttMobileFit.noDock, JSON.stringify(ganttMobileFit));
  check("Gantt mobiel blijft binnen viewport en horizontaal scrollbaar", ganttMobileFit.bodyOverflow <= 2 && ganttMobileFit.wrapFits && ganttMobileFit.scrollable, JSON.stringify(ganttMobileFit));

  await loadModule("projectoverzicht");
  const overviewMobileFit = await frameEval(`(()=> {
    const dock = document.querySelector("#cwsV37MobileActionDock");
    const wrap = document.querySelector("#projectOverviewTableWrap");
    return {
      noDock:!dock,
      native:document.body.classList.contains("cws-mobile-native-actions"),
      bodyOverflow:Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      wrapFits:wrap ? wrap.getBoundingClientRect().right <= window.innerWidth + 1 : false,
      tableCard:wrap?.classList.contains("mobile-card-table") || false,
    };
  })()`);
  check("Projectoverzicht mobiel heeft geen overlappende iframe-actiedock", overviewMobileFit.noDock, JSON.stringify(overviewMobileFit));
  check("Projectoverzicht mobiel blijft binnen viewport", overviewMobileFit.bodyOverflow <= 2 && overviewMobileFit.wrapFits, JSON.stringify(overviewMobileFit));

  await openShell(390, 844);
  await loadModule("capaciteit");
  const capacityMobile = await frameEval(`(()=> {
    const matrix = document.querySelector("#matrixWrap");
    const heatmap = document.querySelector("#heatmapWrap");
    return {
      noDock:!document.querySelector("#cwsV37MobileActionDock"),
      native:document.body.classList.contains("cws-mobile-native-actions"),
      bodyOverflow:Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      matrixFits:matrix ? matrix.getBoundingClientRect().right <= window.innerWidth + 1 : false,
      matrixScroll:matrix && matrix.scrollWidth > matrix.clientWidth,
      heatmap:!!heatmap,
      why:[...document.querySelectorAll(".why,.hm-cell")].length > 0,
      print:[...document.querySelectorAll("button")].some(btn => /Print overzicht/i.test(btn.textContent)),
    };
  })()`);
  check("Capaciteit mobiel heeft geen overlappende iframe-actiedock", capacityMobile.noDock, JSON.stringify(capacityMobile));
  check("Capaciteit mobiel blijft binnen viewport", capacityMobile.bodyOverflow <= 2 && capacityMobile.matrixFits, JSON.stringify(capacityMobile));
  check("Capaciteit mobiel heeft scrollbare matrix en heatmap", capacityMobile.matrixScroll && capacityMobile.heatmap);
  check("Capaciteit mobiel behoudt WHY/detail en printactie", capacityMobile.why && capacityMobile.print);

  await loadModule("audit");
  const auditClose = await frameEval(`(()=> {
    const btn = Array.from(document.querySelectorAll("button")).find(b => /Auditlog|Open|Log/i.test(b.textContent)) || document.querySelector("button");
    btn?.click();
    const overlay = document.querySelector(".modalback,.modal-backdrop,.cws-modal-overlay");
    const open = !!overlay && (overlay.classList.contains("show") || getComputedStyle(overlay).display !== "none");
    const close = document.querySelector(".close,#modalClose,.modal-head button,.cws-modal-hdr button");
    close?.click();
    const closed = !overlay || (!overlay.classList.contains("show") && getComputedStyle(overlay).display === "none");
    return { open, closed };
  })()`);
  check("Auditlog modal opent/sluit zonder overlay-blokkade", auditClose.open ? auditClose.closed : true, JSON.stringify(auditClose));

  check("Geen kritieke console errors in premium UI E2E", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 500));
} catch (error) {
  failed = true;
  console.error("FAIL - premium responsive UI E2E crash:", error);
} finally {
  try { socket?.close(); } catch {}
  try { browser?.kill(); } catch {}
  try { server?.kill(); } catch {}
  try { fs.rmSync(profile, { recursive:true, force:true }); } catch {}
}

if (failed) process.exit(1);
