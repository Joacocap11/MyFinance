import {
  Archive,
  ArrowDownUp,
  FileUp,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  WalletCards,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

const primaryNavigation = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/movimientos", label: "Movimientos", icon: ArrowDownUp },
  { to: "/cuentas", label: "Cuentas", icon: WalletCards },
  { to: "/historico", label: "Histórico", icon: Archive },
  { to: "/importar", label: "Importar", icon: FileUp },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
];

function isPrimaryNavigationActive(
  to: string,
  pathname: string,
  search: string,
  end?: boolean,
) {
  if (to === "/cuentas") {
    return pathname === "/cuentas" || (
      pathname === "/ajustes" &&
      new URLSearchParams(search).get("section") === "accounts"
    );
  }
  if (to === "/ajustes") {
    return pathname === "/ajustes" &&
      new URLSearchParams(search).get("section") !== "accounts";
  }
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell() {
  const { logout, session } = useAuth();
  const location = useLocation();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="MyFinance — Resumen">
          <img className="brand__logo" src="/branding/apple-touch-icon.png" alt="" />
          <span>MyFinance</span>
        </NavLink>
        <nav aria-label="Navegación principal">
          {primaryNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={() =>
                `nav-link ${isPrimaryNavigationActive(to, location.pathname, location.search, end) ? "is-active" : ""}`
              }
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/movimientos/nuevo"
          className="button button--primary sidebar__add"
        >
          <Plus size={18} aria-hidden="true" /> Nuevo movimiento
        </NavLink>
        {session?.user.email ? (
          <p className="sidebar__note" title={session.user.email}>
            {session.user.email}
          </p>
        ) : null}
        <button className="button button--secondary" type="button" onClick={logout}>
          <LogOut size={16} aria-hidden="true" /> Salir
        </button>
      </aside>

      <main id="contenido" className="main-content">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? "is-active" : "")}
        >
          <LayoutDashboard aria-hidden="true" />
          <span>Resumen</span>
        </NavLink>
        <NavLink
          to="/movimientos"
          className={({ isActive }) => (isActive ? "is-active" : "")}
        >
          <ArrowDownUp aria-hidden="true" />
          <span>Movimientos</span>
        </NavLink>
        <NavLink
          to="/movimientos/nuevo"
          className="bottom-nav__add"
          aria-label="Nuevo movimiento"
        >
          <Plus aria-hidden="true" />
        </NavLink>
        <NavLink
          to="/importar"
          className={({ isActive }) => (isActive ? "is-active" : "")}
        >
          <FileUp aria-hidden="true" />
          <span>Importar</span>
        </NavLink>
        <NavLink
          to="/ajustes"
          className={({ isActive }) => (isActive ? "is-active" : "")}
        >
          <Settings aria-hidden="true" />
          <span>Ajustes</span>
        </NavLink>
      </nav>
    </div>
  );
}
