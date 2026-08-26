import {
  Archive,
  ArrowDownUp,
  FileUp,
  LayoutDashboard,
  Plus,
  Settings,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const primaryNavigation = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/movimientos", label: "Movimientos", icon: ArrowDownUp },
  { to: "/historico", label: "Histórico", icon: Archive },
  { to: "/importar", label: "Importar", icon: FileUp },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
];

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="MyFinance — Resumen">
          <span className="brand__mark">M</span>
          <span>MyFinance</span>
        </NavLink>
        <nav aria-label="Navegación principal">
          {primaryNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-link ${isActive ? "is-active" : ""}`
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
        <p className="sidebar__note">Tus datos, en tu espacio.</p>
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
