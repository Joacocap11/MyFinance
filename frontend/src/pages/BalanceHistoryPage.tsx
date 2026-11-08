import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type {
  Account,
  BalanceAtDate,
  BalanceHistory,
  BalanceSummary,
  Category,
  Movement,
  Page,
} from "../api/types";
import { MovementRow } from "../components/MovementRow";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SegmentedControl,
  Select,
} from "../components/ui";
import {
  formatDate,
  formatMoney,
  getDefaultAccount,
  today,
} from "../lib/format";
import { useRequest } from "../lib/useRequest";

type RangeOption = "7d" | "30d" | "month" | "prev-month" | "custom";

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "month", label: "Mes actual" },
  { value: "prev-month", label: "Mes anterior" },
  { value: "custom", label: "Personalizado" },
];

function addDays(value: string, days: number): string {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function endOfMonth(value: string): string {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function resolveRange(
  range: RangeOption,
  anchor: string,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  switch (range) {
    case "7d":
      return { from: addDays(anchor, -6), to: anchor };
    case "30d":
      return { from: addDays(anchor, -29), to: anchor };
    case "month":
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case "prev-month": {
      const previousMonthAnchor = addDays(startOfMonth(anchor), -1);
      return {
        from: startOfMonth(previousMonthAnchor),
        to: endOfMonth(previousMonthAnchor),
      };
    }
    case "custom":
      return { from: customFrom || anchor, to: customTo || anchor };
  }
}

interface BalancePageData {
  accounts: Account[];
  categories: Category[];
  atDate: BalanceAtDate | null;
  dayMovements: Page<Movement> | null;
  history: BalanceHistory | null;
  summary: BalanceSummary | null;
}

export function BalanceHistoryPage() {
  const [search, setSearch] = useSearchParams();
  const selectedDate = search.get("date") || today();
  const range = (search.get("range") as RangeOption | null) ?? "30d";
  const customFrom = search.get("from") || selectedDate;
  const customTo = search.get("to") || selectedDate;
  const { from, to } = resolveRange(range, selectedDate, customFrom, customTo);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearch(next, { replace: true });
  };

  const state = useRequest<BalancePageData>(
    async (signal) => {
      const [accounts, categories] = await Promise.all([
        api.settings.accounts(),
        api.settings.categories(),
      ]);
      const accountId = search.get("account_id")
        ? Number(search.get("account_id"))
        : getDefaultAccount(accounts.filter((item) => item.is_active))?.id;
      if (!accountId) {
        return {
          accounts,
          categories,
          atDate: null,
          dayMovements: null,
          history: null,
          summary: null,
        };
      }
      const [atDate, dayMovements, history, summary] = await Promise.all([
        api.analytics.balanceAtDate(accountId, selectedDate, "closing", signal),
        api.movements.list(
          {
            account_id: accountId,
            date_from: selectedDate,
            date_to: selectedDate,
            page_size: 100,
          },
          signal,
        ),
        api.analytics.balanceHistory(accountId, from, to, signal),
        api.analytics.balanceSummary(accountId, from, to, signal),
      ]);
      return { accounts, categories, atDate, dayMovements, history, summary };
    },
    [search.get("account_id"), selectedDate, from, to],
  );

  const accountId = state.data?.atDate?.account_id ?? null;
  const account = state.data?.accounts.find((item) => item.id === accountId);
  const chartData = useMemo(
    () =>
      state.data?.history?.days.map((day) => ({
        date: day.date,
        Saldo: Number(day.closing_balance),
      })) ?? [],
    [state.data?.history],
  );

  return (
    <div className="page page--balance-history">
      <PageHeader
        eyebrow="Una respuesta concreta"
        title="Saldo histórico"
        description="¿Cuánta plata tenías un día puntual? Elegí cuenta y fecha."
        actions={
          state.data?.accounts.length ? (
            <Select
              value={accountId ?? ""}
              onChange={(event) => setParam("account_id", event.target.value)}
            >
              {state.data.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      />

      {state.loading ? (
        <div className="panel">
          <LoadingState rows={5} label="Cargando saldo histórico" />
        </div>
      ) : null}
      {state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : null}

      {state.data && !accountId ? (
        <EmptyState
          title="No hay cuentas activas"
          description="Creá una cuenta en Ajustes para consultar su saldo histórico."
        />
      ) : null}

      {state.data && accountId && state.data.atDate ? (
        <>
          <section className="panel balance-headline">
            <div className="balance-headline__date">
              <label>
                <span className="sr-only">Fecha</span>
                <input
                  type="date"
                  value={selectedDate}
                  max={today()}
                  onChange={(event) => setParam("date", event.target.value)}
                />
              </label>
              <div className="balance-quick-dates">
                <button type="button" onClick={() => setParam("date", today())}>
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setParam("date", addDays(today(), -1))}
                >
                  Ayer
                </button>
                <button
                  type="button"
                  onClick={() => setParam("date", startOfMonth(today()))}
                >
                  Inicio de mes
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setParam("date", addDays(startOfMonth(today()), -1))
                  }
                >
                  Fin de mes pasado
                </button>
              </div>
            </div>
            <p className="eyebrow">
              Saldo al cierre · {formatDate(selectedDate)}
            </p>
            <strong className="balance-headline__amount">
              {formatMoney(
                state.data.atDate.closing_balance,
                account?.currency ?? "UYU",
              )}
            </strong>
            <div className="balance-metrics">
              <div>
                <span>Saldo inicial del día</span>
                <strong>
                  {formatMoney(
                    state.data.atDate.opening_balance,
                    account?.currency ?? "UYU",
                  )}
                </strong>
              </div>
              <div>
                <span>Ingresos</span>
                <strong>
                  {formatMoney(
                    state.data.atDate.income,
                    account?.currency ?? "UYU",
                  )}
                </strong>
              </div>
              <div>
                <span>Gastos</span>
                <strong>
                  {formatMoney(
                    state.data.atDate.expenses,
                    account?.currency ?? "UYU",
                  )}
                </strong>
              </div>
              <div>
                <span>Transferencias entrada</span>
                <strong>
                  {formatMoney(
                    state.data.atDate.transfers_in,
                    account?.currency ?? "UYU",
                  )}
                </strong>
              </div>
              <div>
                <span>Transferencias salida</span>
                <strong>
                  {formatMoney(
                    state.data.atDate.transfers_out,
                    account?.currency ?? "UYU",
                  )}
                </strong>
              </div>
              <div>
                <span>Variación neta</span>
                <strong
                  className={
                    Number(state.data.atDate.net_change) >= 0
                      ? "text-positive"
                      : "text-negative"
                  }
                >
                  {formatMoney(
                    state.data.atDate.net_change,
                    account?.currency ?? "UYU",
                  )}
                </strong>
              </div>
              <div>
                <span>Movimientos</span>
                <strong>{state.data.atDate.transaction_count}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Qué explica el cambio</p>
                <h2>Movimientos del día</h2>
              </div>
            </div>
            {state.data.dayMovements?.items.length ? (
              <div className="movement-list">
                {state.data.dayMovements.items.map((movement) => (
                  <MovementRow
                    key={movement.id}
                    movement={movement}
                    accounts={state.data!.accounts}
                    categories={state.data!.categories}
                  />
                ))}
              </div>
            ) : (
              <p className="muted">
                No hubo movimientos este día; el saldo se mantuvo.
              </p>
            )}
          </section>

          <section
            className="panel history-chart"
            aria-labelledby="balance-trend-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Evolución</p>
                <h2 id="balance-trend-title">Saldo en el período</h2>
              </div>
              <SegmentedControl
                label="Rango"
                value={range}
                options={RANGE_OPTIONS}
                onChange={(value) => setParam("range", value)}
              />
            </div>
            {range === "custom" ? (
              <div className="balance-custom-range">
                <label>
                  Desde
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(event) => setParam("from", event.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={today()}
                    onChange={(event) => setParam("to", event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <div className="chart-container" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => value.slice(5)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={72}
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
                      formatMoney(String(value), account?.currency ?? "UYU")
                    }
                    labelFormatter={(label) =>
                      formatDate(typeof label === "string" ? label : "")
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="Saldo"
                    stroke="var(--color-positive)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {state.data.summary ? (
              <div className="balance-metrics balance-metrics--summary">
                <div>
                  <span>Saldo inicial del período</span>
                  <strong>
                    {formatMoney(
                      state.data.summary.opening_balance,
                      account?.currency ?? "UYU",
                    )}
                  </strong>
                </div>
                <div>
                  <span>Saldo final del período</span>
                  <strong>
                    {formatMoney(
                      state.data.summary.closing_balance,
                      account?.currency ?? "UYU",
                    )}
                  </strong>
                </div>
                <div>
                  <span>
                    Saldo mínimo ·{" "}
                    {formatDate(state.data.summary.min_balance_date)}
                  </span>
                  <strong>
                    {formatMoney(
                      state.data.summary.min_balance,
                      account?.currency ?? "UYU",
                    )}
                  </strong>
                </div>
                <div>
                  <span>
                    Saldo máximo ·{" "}
                    {formatDate(state.data.summary.max_balance_date)}
                  </span>
                  <strong>
                    {formatMoney(
                      state.data.summary.max_balance,
                      account?.currency ?? "UYU",
                    )}
                  </strong>
                </div>
                <div>
                  <span>Variación neta</span>
                  <strong
                    className={
                      Number(state.data.summary.net_change) >= 0
                        ? "text-positive"
                        : "text-negative"
                    }
                  >
                    {formatMoney(
                      state.data.summary.net_change,
                      account?.currency ?? "UYU",
                    )}
                  </strong>
                </div>
                <div>
                  <span>Movimientos del período</span>
                  <strong>{state.data.summary.transaction_count}</strong>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
