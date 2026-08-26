import { ArrowRight, CalendarDays, Plus, Upload } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Account, Category, Currency, MonthlyReport } from "../api/types";
import { MovementRow } from "../components/MovementRow";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SegmentedControl,
} from "../components/ui";
import { currentMonth, formatMoney, formatMonth } from "../lib/format";
import { useRequest } from "../lib/useRequest";

interface DashboardData {
  report: MonthlyReport;
  accounts: Account[];
  categories: Category[];
}

export function DashboardPage() {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const month = search.get("month") ?? currentMonth();
  const currency: Currency = search.get("currency") === "USD" ? "USD" : "UYU";
  const state = useRequest<DashboardData>(
    async (signal) => {
      const [report, accounts, categories] = await Promise.all([
        api.reports.monthly(month, currency, signal),
        api.settings.accounts(),
        api.settings.categories(),
      ]);
      return { report, accounts, categories };
    },
    [month, currency],
  );
  const scopedData =
    state.data?.report.currency === currency &&
    state.data.report.month === month
      ? state.data
      : null;

  const updateScope = (key: "month" | "currency", value: string) => {
    const next = new URLSearchParams(search);
    next.set(key, value);
    setSearch(next, { replace: true });
  };

  const explorerLink = (categoryId?: number | null) => {
    const params = new URLSearchParams({ month, currency });
    if (categoryId !== undefined && categoryId !== null)
      params.set("category_id", String(categoryId));
    return `/movimientos?${params.toString()}`;
  };

  return (
    <div className="page page--dashboard">
      <PageHeader
        eyebrow="Tu mes en claro"
        title="Resumen"
        description="Gastos y decisiones, sin mezclar monedas."
        actions={
          <div className="scope-controls">
            <label className="month-control">
              <span className="sr-only">Mes</span>
              <CalendarDays size={17} aria-hidden="true" />
              <input
                type="month"
                value={month}
                onChange={(event) => updateScope("month", event.target.value)}
              />
            </label>
            <SegmentedControl
              label="Moneda"
              value={currency}
              options={[
                { value: "UYU", label: "UYU" },
                { value: "USD", label: "USD" },
              ]}
              onChange={(value) => updateScope("currency", value)}
            />
          </div>
        }
      />

      {state.loading || (!scopedData && !state.error) ? (
        <DashboardSkeleton />
      ) : null}
      {state.error && !scopedData ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : null}
      {scopedData ? (
        <>
          {state.refreshing ? (
            <p className="refresh-notice" role="status">
              Actualizando {formatMonth(month)}…
            </p>
          ) : null}
          {state.error ? (
            <ErrorState compact message={state.error} onRetry={state.retry} />
          ) : null}
          <DashboardContent
            data={scopedData}
            month={month}
            currency={currency}
            explorerLink={explorerLink}
            onOpenMovement={(id) => {
              void navigate(
                `/movimientos?month=${month}&currency=${currency}&selected=${id}`,
              );
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <section className="summary-strip" aria-label="Cargando resumen">
        <LoadingState rows={3} />
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <LoadingState rows={5} />
        </section>
        <section className="panel">
          <LoadingState rows={4} />
        </section>
      </div>
    </>
  );
}

function DashboardContent({
  data,
  month,
  currency,
  explorerLink,
  onOpenMovement,
}: {
  data: DashboardData;
  month: string;
  currency: Currency;
  explorerLink: (categoryId?: number | null) => string;
  onOpenMovement: (id: number) => void;
}) {
  const { report, accounts, categories } = data;
  const hasActivity =
    report.categories.length > 0 ||
    report.recent_transactions.length > 0 ||
    Number(report.income) !== 0 ||
    Number(report.expenses) !== 0;
  if (!hasActivity) {
    return (
      <EmptyState
        title={`Todavía no hay movimientos en ${formatMonth(month)}`}
        description={`Agregá un movimiento en ${currency} o importá un archivo para empezar a entender el mes.`}
        actions={
          <>
            <Link className="button button--primary" to="/movimientos/nuevo">
              <Plus size={17} /> Agregar movimiento
            </Link>
            <Link className="button button--secondary" to="/importar">
              <Upload size={17} /> Importar CSV
            </Link>
          </>
        }
      />
    );
  }
  const change = report.comparison?.change_percentage;
  const comparisonText =
    change === null || change === undefined
      ? "No hay una base comparable en el mes anterior."
      : `${Math.abs(Number(change)).toLocaleString("es-UY", { maximumFractionDigits: 1 })}% ${Number(change) > 0 ? "más" : Number(change) < 0 ? "menos" : "igual"} que el período comparable.`;
  const spent =
    report.spent_percentage === null ? null : Number(report.spent_percentage);

  return (
    <>
      <section className="summary-strip" aria-label="Totales del mes">
        <div className="summary-strip__lead">
          <span>Gastos</span>
          <strong>{formatMoney(report.expenses, currency)}</strong>
          <p>{comparisonText}</p>
        </div>
        <div>
          <span>Ingresos</span>
          <strong>{formatMoney(report.income, currency)}</strong>
        </div>
        <div>
          <span>Resultado del mes</span>
          <strong
            className={
              Number(report.net) >= 0 ? "text-positive" : "text-negative"
            }
          >
            {formatMoney(report.net, currency)}
          </strong>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel category-analysis">
          <div className="section-heading">
            <div>
              <p className="eyebrow">En qué se fue</p>
              <h2>Gastos por categoría</h2>
            </div>
            <Link to={explorerLink()}>
              Ver movimientos <ArrowRight size={16} />
            </Link>
          </div>
          {report.categories.length ? (
            <ol className="category-bars">
              {report.categories.map((category) => {
                const percentage = Math.max(
                  0,
                  Math.min(100, Number(category.percentage)),
                );
                return (
                  <li key={category.category_id ?? category.name}>
                    <Link
                      to={explorerLink(category.category_id)}
                      aria-label={`${category.name}: ${formatMoney(category.amount, currency)}, ${percentage.toLocaleString("es-UY")}%`}
                    >
                      <span className="category-bar__label">
                        <strong>{category.name}</strong>
                        <span>
                          {formatMoney(category.amount, currency)} ·{" "}
                          {percentage.toLocaleString("es-UY", {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </span>
                      </span>
                      <span className="category-bar__track">
                        <span style={{ width: `${percentage}%` }} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              compact
              title="No hubo gastos"
              description={`Los ingresos y transferencias de ${formatMonth(month)} no cuentan como gastos.`}
            />
          )}
        </section>

        <aside className="dashboard-side">
          <section className="panel budget-panel">
            <p className="eyebrow">Presupuesto mensual · {currency}</p>
            <h2>
              {report.budget
                ? `${formatMoney(report.expenses, currency)} de ${formatMoney(report.budget, currency)}`
                : "Sin presupuesto definido"}
            </h2>
            {report.budget && spent !== null ? (
              <>
                <div
                  className="budget-track"
                  aria-label={`${spent.toLocaleString("es-UY")}% del presupuesto usado`}
                >
                  <span
                    className={spent > 100 ? "is-over" : ""}
                    style={{ width: `${Math.min(spent, 100)}%` }}
                  />
                </div>
                <p>
                  {spent > 100
                    ? `Superaste el presupuesto por ${Math.abs(spent - 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%.`
                    : `Usaste ${spent.toLocaleString("es-UY", { maximumFractionDigits: 1 })}% del presupuesto.`}
                </p>
              </>
            ) : (
              <p>
                Definí un monto repetido cada mes para seguir tu ritmo de gasto.
              </p>
            )}
            <Link to="/ajustes?section=budget">
              {report.budget ? "Editar presupuesto" : "Definir presupuesto"}{" "}
              <ArrowRight size={15} />
            </Link>
          </section>
          <section className="panel insights-panel">
            <p className="eyebrow">Qué cambió</p>
            <h2>Señales del mes</h2>
            {report.insights.length ? (
              <ul>
                {report.insights.slice(0, 3).map((insight, index) => (
                  <li key={`${insight.type}-${index}`}>
                    <Link to={explorerLink(insight.category_id)}>
                      <strong>{insight.title}</strong>
                      <span>{insight.detail}</span>
                      <ArrowRight size={15} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Las señales aparecerán cuando haya suficientes movimientos
                comparables.
              </p>
            )}
          </section>
        </aside>
      </div>

      <div className="evidence-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Mayor impacto</p>
              <h2>Gastos principales</h2>
            </div>
          </div>
          {report.top_expenses.length ? (
            <div className="movement-list">
              {report.top_expenses.map((movement) => (
                <MovementRow
                  key={movement.id}
                  movement={movement}
                  accounts={accounts}
                  categories={categories}
                  onSelect={() => onOpenMovement(movement.id)}
                />
              ))}
            </div>
          ) : (
            <p className="muted">No hubo gastos en este período.</p>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Actividad</p>
              <h2>Movimientos recientes</h2>
            </div>
            <Link to={explorerLink()}>
              Ver todos <ArrowRight size={16} />
            </Link>
          </div>
          {report.recent_transactions.length ? (
            <div className="movement-list">
              {report.recent_transactions.map((movement) => (
                <MovementRow
                  key={movement.id}
                  movement={movement}
                  accounts={accounts}
                  categories={categories}
                  onSelect={() => onOpenMovement(movement.id)}
                />
              ))}
            </div>
          ) : (
            <p className="muted">No hay movimientos recientes.</p>
          )}
        </section>
      </div>
    </>
  );
}
