import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Filter,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type {
  Account,
  Category,
  Currency,
  Movement,
  MovementFilters,
  MovementKind,
  Page,
  TransferPurpose,
} from "../api/types";
import { MovementRow } from "../components/MovementRow";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  InlineLoading,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusPill,
} from "../components/ui";
import { formText, parseMoney } from "../lib/form";
import {
  categoryPath,
  formatDate,
  formatMoney,
  kindLabels,
} from "../lib/format";
import { useRequest } from "../lib/useRequest";

interface ExplorerData {
  page: Page<Movement>;
  accounts: Account[];
  categories: Category[];
}

const PAGE_SIZE = 20;

export function MovementsPage() {
  const [search, setSearch] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pageNumber = Number(search.get("page") ?? "1");
  const selectedValue = Number(search.get("selected"));
  const selectedId =
    Number.isInteger(selectedValue) && selectedValue > 0 ? selectedValue : null;
  const filters = useMemo<MovementFilters>(
    () => ({
      month: search.get("month") || undefined,
      currency:
        search.get("currency") === "USD"
          ? "USD"
          : search.get("currency") === "UYU"
            ? "UYU"
            : search.get("currency") === "UI"
              ? "UI"
              : undefined,
      date_from: search.get("date_from") || undefined,
      date_to: search.get("date_to") || undefined,
      kind: (search.get("kind") as MovementKind | null) || undefined,
      category_id: search.get("category_id")
        ? Number(search.get("category_id"))
        : undefined,
      account_id: search.get("account_id")
        ? Number(search.get("account_id"))
        : undefined,
      min_amount: search.get("min_amount") || undefined,
      max_amount: search.get("max_amount") || undefined,
      search: search.get("search") || undefined,
      include_voided: search.get("include_voided") === "true",
      page: pageNumber,
      page_size: PAGE_SIZE,
    }),
    [search, pageNumber],
  );
  const state = useRequest<ExplorerData>(
    async (signal) => {
      const [page, accounts, categories] = await Promise.all([
        api.movements.list(filters, signal),
        api.settings.accounts(),
        api.settings.categories(),
      ]);
      return { page, accounts, categories };
    },
    [search.toString()],
  );
  const selectedState = useRequest<Movement | null>(
    (signal) =>
      selectedId
        ? api.movements.get(selectedId, signal)
        : Promise.resolve(null),
    [selectedId],
  );
  const selected =
    selectedState.data?.id === selectedId ? selectedState.data : null;
  const activeFilterCount = [...search.keys()].filter(
    (key) => !["page", "selected", "currency"].includes(key),
  ).length;

  const setParam = (key: string, value: string | null, replace = true) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearch(next, { replace });
  };
  const clearFilters = () => {
    const next = new URLSearchParams();
    const currency = search.get("currency");
    if (currency) next.set("currency", currency);
    setSearch(next);
  };
  const removeSelection = () => setParam("selected", null);

  return (
    <div className="page page--explorer">
      <PageHeader
        eyebrow="Evidencia de tus números"
        title="Movimientos"
        description="Buscá, filtrá y corregí sin perder el contexto."
        actions={
          <>
            <Link className="button button--secondary" to="/historico">
              <Archive size={17} /> Histórico
            </Link>
            <Link className="button button--primary" to="/movimientos/nuevo">
              <Plus size={17} /> Nuevo
            </Link>
          </>
        }
      />
      <div className="explorer-toolbar">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Buscar por descripción</span>
          <input
            value={search.get("search") ?? ""}
            onChange={(event) => setParam("search", event.target.value)}
            placeholder="Buscar descripción…"
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal size={17} /> Filtros{" "}
          {activeFilterCount ? (
            <span className="filter-count">{activeFilterCount}</span>
          ) : null}
        </Button>
      </div>
      {activeFilterCount ? (
        <div className="filter-chips" aria-label="Filtros aplicados">
          {filterChips(
            search,
            state.data?.accounts ?? [],
            state.data?.categories ?? [],
          ).map((chip) => (
            <button
              type="button"
              key={chip.key}
              onClick={() => setParam(chip.key, null)}
            >
              {chip.label}
              <X size={14} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="clear-chip" onClick={clearFilters}>
            Limpiar todo
          </button>
        </div>
      ) : null}

      <div className={`explorer-layout ${filtersOpen ? "has-filters" : ""}`}>
        {filtersOpen ? (
          <FilterPanel
            search={search}
            accounts={state.data?.accounts ?? []}
            categories={state.data?.categories ?? []}
            setParam={setParam}
            clear={clearFilters}
            close={() => setFiltersOpen(false)}
          />
        ) : null}
        <section className="results-panel" aria-live="polite">
          {state.loading ? (
            <LoadingState rows={7} label="Cargando movimientos" />
          ) : null}
          {state.error && !state.data ? (
            <ErrorState message={state.error} onRetry={state.retry} />
          ) : null}
          {state.data ? (
            <>
              <div className="results-heading">
                <div>
                  <strong>
                    {state.data.page.total.toLocaleString("es-UY")} movimientos
                  </strong>
                  <span>Página {state.data.page.page}</span>
                </div>
                {state.refreshing ? (
                  <InlineLoading label="Actualizando…" />
                ) : null}
              </div>
              {state.error ? (
                <ErrorState
                  compact
                  message={state.error}
                  onRetry={state.retry}
                />
              ) : null}
              {state.data.page.items.length ? (
                <div className="movement-list movement-list--results">
                  {state.data.page.items.map((movement) => (
                    <MovementRow
                      key={movement.id}
                      movement={movement}
                      accounts={state.data?.accounts ?? []}
                      categories={state.data?.categories ?? []}
                      onSelect={(item) =>
                        setParam("selected", String(item.id), false)
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={
                    activeFilterCount
                      ? "No encontramos coincidencias"
                      : "Tu registro está listo para empezar"
                  }
                  description={
                    activeFilterCount
                      ? "Probá quitando uno o más filtros para ampliar la búsqueda."
                      : "Agregá tu primer movimiento o importá un estado de cuenta."
                  }
                  actions={
                    activeFilterCount ? (
                      <Button variant="secondary" onClick={clearFilters}>
                        Limpiar filtros
                      </Button>
                    ) : (
                      <>
                        <Link
                          className="button button--primary"
                          to="/movimientos/nuevo"
                        >
                          Agregar movimiento
                        </Link>
                        <Link
                          className="button button--secondary"
                          to="/importar"
                        >
                          Importar CSV
                        </Link>
                      </>
                    )
                  }
                />
              )}
              {state.data.page.total > PAGE_SIZE ? (
                <Pagination
                  page={pageNumber}
                  total={state.data.page.total}
                  onPage={(page) => setParam("page", String(page), false)}
                />
              ) : null}
            </>
          ) : null}
        </section>
      </div>
      {selectedId && selectedState.error ? (
        <ErrorState
          compact
          message={selectedState.error}
          onRetry={selectedState.retry}
        />
      ) : null}
      {selected && state.data ? (
        <MovementDetail
          movement={selected}
          accounts={state.data.accounts}
          categories={state.data.categories}
          onClose={removeSelection}
          onChanged={() => {
            removeSelection();
            state.retry();
          }}
        />
      ) : null}
    </div>
  );
}

function FilterPanel({
  search,
  accounts,
  categories,
  setParam,
  clear,
  close,
}: {
  search: URLSearchParams;
  accounts: Account[];
  categories: Category[];
  setParam: (key: string, value: string | null) => void;
  clear: () => void;
  close: () => void;
}) {
  const selectedCurrency: Currency | "" =
    search.get("currency") === "USD"
      ? "USD"
      : search.get("currency") === "UYU"
        ? "UYU"
        : search.get("currency") === "UI"
          ? "UI"
          : "";
  const visibleAccounts = selectedCurrency
    ? accounts.filter((item) => item.currency === selectedCurrency)
    : accounts;
  return (
    <aside className="filter-panel" aria-label="Filtros de movimientos">
      <div className="filter-panel__heading">
        <strong>
          <Filter size={17} /> Filtros
        </strong>
        <button type="button" onClick={close} aria-label="Cerrar filtros">
          <X />
        </button>
      </div>
      <Field label="Mes">
        <Input
          type="month"
          value={search.get("month") ?? ""}
          onChange={(event) => setParam("month", event.target.value)}
        />
      </Field>
      <div className="field-pair">
        <Field label="Desde">
          <Input
            type="date"
            value={search.get("date_from") ?? ""}
            onChange={(event) => setParam("date_from", event.target.value)}
          />
        </Field>
        <Field label="Hasta">
          <Input
            type="date"
            value={search.get("date_to") ?? ""}
            onChange={(event) => setParam("date_to", event.target.value)}
          />
        </Field>
      </div>
      <Field label="Tipo">
        <Select
          value={search.get("kind") ?? ""}
          onChange={(event) => setParam("kind", event.target.value)}
        >
          <option value="">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
          <option value="transfer">Transferencias</option>
        </Select>
      </Field>
      <Field label="Cuenta">
        <Select
          value={search.get("account_id") ?? ""}
          onChange={(event) => setParam("account_id", event.target.value)}
        >
          <option value="">Todas las cuentas</option>
          {visibleAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Categoría"
        hint="Las categorías principales incluyen sus subcategorías."
      >
        <Select
          value={search.get("category_id") ?? ""}
          onChange={(event) => setParam("category_id", event.target.value)}
        >
          <option value="">Todas</option>
          {categories
            .filter((item) => item.is_active)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {categoryPath(category, categories)}
              </option>
            ))}
        </Select>
      </Field>
      <div className="field-pair">
        <Field label="Monto mínimo">
          <Input
            inputMode="decimal"
            value={search.get("min_amount") ?? ""}
            onChange={(event) => setParam("min_amount", event.target.value)}
          />
        </Field>
        <Field label="Monto máximo">
          <Input
            inputMode="decimal"
            value={search.get("max_amount") ?? ""}
            onChange={(event) => setParam("max_amount", event.target.value)}
          />
        </Field>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={search.get("include_voided") === "true"}
          onChange={(event) =>
            setParam("include_voided", event.target.checked ? "true" : null)
          }
        />{" "}
        Incluir anulados
      </label>
      <div className="filter-panel__actions">
        <Button variant="quiet" onClick={clear}>
          Limpiar todo
        </Button>
        <Button onClick={close}>Ver resultados</Button>
      </div>
    </aside>
  );
}

function MovementDetail({
  movement,
  accounts,
  categories,
  onClose,
  onChanged,
}: {
  movement: Movement;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editKind, setEditKind] = useState<MovementKind>(movement.kind);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destinationAmount] = useState(
    movement.destination_amount ?? movement.amount,
  );
  const [purpose, setPurpose] = useState<TransferPurpose>(
    movement.purpose ?? "regular",
  );
  const account = accounts.find((item) => item.id === movement.account_id);
  const destinations = accounts.filter(
    (item) => item.is_active && item.id !== movement.account_id,
  );
  const category = categories.find((item) => item.id === movement.category_id);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const values = new FormData(event.currentTarget);
    try {
      await api.movements.update(movement.id, {
        kind: editKind,
        description: formText(values, "description"),
        amount: parseMoney(formText(values, "amount")),
        destination_amount:
          editKind === "transfer"
            ? parseMoney(formText(values, "destination_amount"))
            : null,
        purpose: editKind === "transfer" ? purpose : null,
        destination_account_id:
          editKind === "transfer"
            ? Number(formText(values, "destination_account_id"))
            : null,
        date: formText(values, "date"),
        notes: formText(values, "notes") || null,
        category_id:
          editKind === "transfer"
            ? null
            : Number(formText(values, "category_id")) || null,
      });
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  const voidMovement = async () => {
    if (
      !window.confirm(
        "¿Anular este movimiento? Quedará visible en el historial y no afectará los totales.",
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      await api.movements.void(movement.id);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo anular");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="detail-drawer" aria-label="Detalle del movimiento">
        <header>
          <div>
            <p className="eyebrow">{kindLabels[movement.kind]}</p>
            <h2>{movement.description}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </header>
        {editing ? (
          <form onSubmit={(event) => void submit(event)} className="form-stack">
            <Field label="Tipo">
              <Select
                name="kind"
                value={editKind}
                onChange={(event) => setEditKind(event.target.value as MovementKind)}
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
                <option value="transfer">Transferencia</option>
              </Select>
            </Field>
            <Field label="Descripción">
              <Input
                name="description"
                defaultValue={movement.description}
                required
              />
            </Field>
            <Field label={`Monto · ${account?.currency ?? ""}`}>
              <Input
                name="amount"
                inputMode="decimal"
                defaultValue={movement.amount}
                required
                pattern="^\\d+(?:[.,]\\d{1,2})?$"
              />
            </Field>
            {editKind === "transfer" ? (
              <>
                <Field label="Cuenta de destino">
                  <Select
                    name="destination_account_id"
                    defaultValue={movement.destination_account_id ?? ""}
                    required
                  >
                    <option value="">Elegí una cuenta</option>
                    {destinations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.currency}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Monto recibido">
                  <Input
                    name="destination_amount"
                    inputMode="decimal"
                    defaultValue={destinationAmount}
                    required
                    pattern="^\\d+(?:[.,]\\d{1,2})?$"
                  />
                </Field>
                <Field label="Propósito">
                  <Select
                    value={purpose}
                    onChange={(event) =>
                      setPurpose(event.target.value as TransferPurpose)
                    }
                  >
                    <option value="regular">Transferencia</option>
                    <option value="savings">Ahorro</option>
                    <option value="investment">Inversión</option>
                  </Select>
                </Field>
              </>
            ) : null}
            <Field label="Fecha">
              <Input
                name="date"
                type="date"
                defaultValue={movement.date}
                required
              />
            </Field>
            {editKind !== "transfer" ? (
              <Field label="Categoría">
                <Select
                  name="category_id"
                  defaultValue={movement.category_id ?? ""}
                >
                  <option value="">Sin categoría</option>
                  {categories
                    .filter(
                      (item) => item.kind === editKind && item.is_active,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {categoryPath(item, categories)}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Notas">
              <Input name="notes" defaultValue={movement.notes ?? ""} />
            </Field>
            {error ? <ErrorState compact message={error} /> : null}
            <div className="drawer-actions">
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <InlineLoading /> : "Guardar cambios"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="detail-list">
            <div>
              <span>Monto</span>
              <strong>
                {formatMoney(movement.amount, account?.currency ?? "UYU")}
              </strong>
            </div>
            <div>
              <span>Fecha</span>
              <strong>{formatDate(movement.date)}</strong>
            </div>
            <div>
              <span>Cuenta</span>
              <strong>
                {account?.name ?? "Cuenta no disponible"} · {account?.currency}
              </strong>
            </div>
            {movement.kind !== "transfer" ? (
              <div>
                <span>Categoría</span>
                <strong>
                  {category
                    ? categoryPath(category, categories)
                    : "Sin categoría"}
                </strong>
              </div>
            ) : null}
            {movement.notes ? (
              <div>
                <span>Notas</span>
                <strong>{movement.notes}</strong>
              </div>
            ) : null}
            <div>
              <span>Estado</span>
              <strong>
                {movement.is_voided ? (
                  <StatusPill tone="danger">Anulado</StatusPill>
                ) : (
                  <StatusPill tone="success">Activo</StatusPill>
                )}
              </strong>
            </div>
            {error ? <ErrorState compact message={error} /> : null}
            {!movement.is_voided ? (
              <div className="drawer-actions">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Editar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void voidMovement()}
                  disabled={saving}
                >
                  {saving ? <InlineLoading /> : "Anular movimiento"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}

function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  return (
    <nav className="pagination" aria-label="Paginación">
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft size={16} /> Anterior
      </Button>
      <span>
        {page} de {pages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Siguiente <ChevronRight size={16} />
      </Button>
    </nav>
  );
}

function filterChips(
  search: URLSearchParams,
  accounts: Account[],
  categories: Category[],
): Array<{ key: string; label: string }> {
  const labels: Record<string, string> = {
    month: "Mes",
    date_from: "Desde",
    date_to: "Hasta",
    kind: "Tipo",
    min_amount: "Mín.",
    max_amount: "Máx.",
    search: "Busca",
    include_voided: "Incluye anulados",
  };
  return [...search.entries()]
    .filter(([key]) => !["page", "selected", "currency"].includes(key))
    .map(([key, value]) => {
      if (key === "account_id")
        return {
          key,
          label: `Cuenta: ${accounts.find((item) => item.id === Number(value))?.name ?? value}`,
        };
      if (key === "category_id")
        return {
          key,
          label: `Categoría: ${categories.find((item) => item.id === Number(value))?.name ?? value}`,
        };
      if (key === "kind")
        return { key, label: `Tipo: ${kindLabels[value as MovementKind]}` };
      return {
        key,
        label: `${labels[key] ?? key}: ${value === "true" ? "Sí" : value}`,
      };
    });
}
