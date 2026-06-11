/* Role-based permissions: restrict actions (Phase 18 uses CWS.hasPermission). */
const Permissions = (() => {
  const appPerm = (appId) => {
    switch(appId){
      case "rapporten": return "view_reports";
      case "dashboard": return "view_reports";
      case "instellingen": return "admin_settings";
      case "nietwerkbaredagen": return "admin_settings";
      case "werknemerswerkweek": return "admin_settings";
      case "importexport": return "admin_settings";
      case "audit": return "audit_view";
      case "preflight": return "admin_settings";
      default: return "view_planning"; // projecten/gantt/planbord/capaciteit/toewijzingen
    }
  };

  const can = (roleIgnored, action, ctx={}) => {
    // Always allow opening menu/switching; Router will gate per-app.
    if(action === "open_apps_menu") return true;
    if(action === "switch_app"){
      const perm = appPerm(ctx.appId||"");
      if(!CWS?.hasPermission){
        console.warn("Permissions draait tijdelijk in legacy compatibiliteitsmodus.");
        return true;
      }
      if(perm === "view_planning") return CWS.hasPermission("view_planning") || CWS.hasPermission("view_projects");
      return CWS.hasPermission(perm);
    }

    // Map generic actions to permissions
    const map = {
      view: "view_planning",
      edit_project: "edit_projects",
      create_project: "edit_projects",
      edit_projects: "edit_projects",
      edit_planning: "edit_planning",
      drag_planbord: "edit_planning",
      drag_gantt: "edit_planning",
      auto_plan: "auto_plan",
      view_reports: "view_reports",
      admin_settings: "admin_settings"
    };
    const p = map[action] || action;
    if(!CWS?.hasPermission){
      console.warn("Permissions draait tijdelijk in legacy compatibiliteitsmodus.");
      return true;
    }
    return CWS.hasPermission(p);
  };

  return { can };
})();
