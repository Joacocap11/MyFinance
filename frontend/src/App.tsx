import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell";
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then(({ DashboardPage }) => ({
    default: DashboardPage,
  })),
);
const HistoryPage = lazy(() =>
  import("./pages/HistoryPage").then(({ HistoryPage }) => ({
    default: HistoryPage,
  })),
);
const ImportPage = lazy(() =>
  import("./pages/ImportPage").then(({ ImportPage }) => ({
    default: ImportPage,
  })),
);
const MovementsPage = lazy(() =>
  import("./pages/MovementsPage").then(({ MovementsPage }) => ({
    default: MovementsPage,
  })),
);
const NewMovementPage = lazy(() =>
  import("./pages/NewMovementPage").then(({ NewMovementPage }) => ({
    default: NewMovementPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then(({ SettingsPage }) => ({
    default: SettingsPage,
  })),
);

function DeferredPage({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div
            className="skeleton-stack"
            role="status"
            aria-label="Cargando página"
          >
            <div className="skeleton" />
            <div className="skeleton" />
            <span className="sr-only">Cargando página</span>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <DeferredPage>
            <DashboardPage />
          </DeferredPage>
        ),
      },
      {
        path: "movimientos",
        element: (
          <DeferredPage>
            <MovementsPage />
          </DeferredPage>
        ),
      },
      {
        path: "movimientos/nuevo",
        element: (
          <DeferredPage>
            <NewMovementPage />
          </DeferredPage>
        ),
      },
      {
        path: "historico",
        element: (
          <DeferredPage>
            <HistoryPage />
          </DeferredPage>
        ),
      },
      {
        path: "importar",
        element: (
          <DeferredPage>
            <ImportPage />
          </DeferredPage>
        ),
      },
      {
        path: "ajustes",
        element: (
          <DeferredPage>
            <SettingsPage />
          </DeferredPage>
        ),
      },
      {
        path: "*",
        element: (
          <div className="page">
            <div className="state state--empty">
              <div>
                <strong>Esta página no existe</strong>
                <p>Volvé al resumen para seguir revisando tus finanzas.</p>
                <Link className="button button--primary" to="/">
                  Ir al resumen
                </Link>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
