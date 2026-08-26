import { ArrowRight, BarChart3 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { Currency } from "../api/types";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SegmentedControl,
} from "../components/ui";
import { formatMoney, formatMonth } from "../lib/format";
import { useRequest } from "../lib/useRequest";

export function HistoryPage() {
  const [search, setSearch] = useSearchParams();
  const currency: Currency =
    search.get("currency") === "USD"
      ? "USD"
      : search.get("currency") === "UI"
        ? "UI"
        : "UYU";
  const state = useRequest(
    (signal) => api.reports.history(12, currency, signal),
    [currency],
  );
  const { data: rawData } = state;
  const scopedData = rawData?.currency === currency ? rawData : null;
  const setCurrency = (value: Currency) => {
    const next = new URLSearchParams(search);
    next.set("currency", value);
    setSearch(next, { replace: true });
  };
  const chartData =
    scopedData?.months.map((item) => ({
      ...item,
      Gastos: Number(item.expenses),
      Ingresos: Number(item.income),
    })) ?? [];
  return (
    <div className="page page--history">
      <PageHeader
        eyebrow="Una mirada más larga"
        title="Histórico"
        description="Doce meses en una sola moneda, para ver dirección y ritmo."
        actions={
          <SegmentedControl
            label="Moneda"
            value={currency}
            options={[
              { value: "UYU", label: "UYU" },
              { value: "USD", label: "USD" },
              { value: "UI", label: "UI" },
            ]}
            onChange={setCurrency}
          />
        }
      />
      {state.loading || (!scopedData && !state.error) ? (
        <div className="panel">
          <LoadingState rows={7} label="Cargando histórico" />
        </div>
      ) : null}
      {state.error && !scopedData ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : null}
      {scopedData ? (
        scopedData.months.length ? (
          <>
            {state.error ? (
              <ErrorState compact message={state.error} onRetry={state.retry} />
            ) : null}
            <section
              className="panel history-chart"
              aria-labelledby="trend-title"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Tendencia · {currency}</p>
                  <h2 id="trend-title">Ingresos y gastos</h2>
                </div>
                <div className="chart-legend">
                  <span className="legend-dot legend-dot--expense" /> Gastos{" "}
                  <span className="legend-dot legend-dot--income" /> Ingresos
                </div>
              </div>
              <div className="chart-container" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(value: string) => value.slice(5)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={64}
                      tickFormatter={(value: number) =>
                        new Intl.NumberFormat("es-UY", {
                          notation: "compact",
                        }).format(value)
                      }
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value) =>
                        formatMoney(
                          typeof value === "number" || typeof value === "string"
                            ? String(value)
                            : "",
                          currency,
                        )
                      }
                      labelFormatter={(label) =>
                        formatMonth(typeof label === "string" ? label : "")
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="Gastos"
                      stroke="var(--color-coral)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Ingresos"
                      stroke="var(--color-positive)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel history-table-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Archivo mensual</p>
                  <h2>Mes a mes</h2>
                </div>
              </div>
              {scopedData.months.length < 2 ? (
                <p className="notice">
                  <BarChart3 size={18} /> Las comparaciones aparecerán cuando
                  completes otro mes.
                </p>
              ) : null}
              <div
                className="history-list"
                role="table"
                aria-label={`Histórico en ${currency}`}
              >
                <div className="history-list__header" role="row">
                  <span role="columnheader">Mes</span>
                  <span role="columnheader">Gastos</span>
                  <span role="columnheader">Ingresos</span>
                  <span role="columnheader">Resultado</span>
                  <span />
                </div>
                {[...scopedData.months].reverse().map((item) => (
                  <Link
                    role="row"
                    className="history-row"
                    key={item.month}
                    to={`/?month=${item.month}&currency=${currency}`}
                  >
                    <strong role="cell">{formatMonth(item.month)}</strong>
                    <span role="cell" className="amount">
                      {formatMoney(item.expenses, currency)}
                    </span>
                    <span role="cell" className="amount">
                      {formatMoney(item.income, currency)}
                    </span>
                    <span
                      role="cell"
                      className={`amount ${Number(item.net) >= 0 ? "text-positive" : "text-negative"}`}
                    >
                      {formatMoney(item.net, currency)}
                    </span>
                    <ArrowRight role="cell" size={17} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : (
          <EmptyState
            title="Todavía no hay meses para comparar"
            description={`Cuando registres movimientos en ${currency}, vas a ver su evolución acá.`}
            actions={
              <Link to="/movimientos/nuevo" className="button button--primary">
                Agregar movimiento
              </Link>
            }
          />
        )
      ) : null}
    </div>
  );
}
