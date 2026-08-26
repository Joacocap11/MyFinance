import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type {
  Account,
  Category,
  Movement,
  MovementInput,
  MovementKind,
  TransferPurpose,
} from "../api/types";
import {
  Button,
  ErrorState,
  Field,
  InlineLoading,
  Input,
  LoadingState,
  SegmentedControl,
  Select,
} from "../components/ui";
import {
  categoryPath,
  formatMoney,
  kindLabels,
  sortCategories,
  today,
} from "../lib/format";
import { parseMoney } from "../lib/form";
import { useRequest } from "../lib/useRequest";

export function NewMovementPage() {
  const navigate = useNavigate();
  const catalogs = useRequest(async () => {
    const [accounts, categories] = await Promise.all([
      api.settings.accounts(),
      api.settings.categories(),
    ]);
    return { accounts, categories };
  }, []);
  return (
    <div className="drawer-backdrop drawer-backdrop--route">
      <section className="quick-entry" aria-labelledby="quick-entry-title">
        <header>
          <div>
            <p className="eyebrow">Registro rápido</p>
            <h1 id="quick-entry-title">Nuevo movimiento</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigate(-1);
            }}
            aria-label="Cerrar"
          >
            <X />
          </button>
        </header>
        {catalogs.loading ? <LoadingState rows={5} /> : null}
        {catalogs.error && !catalogs.data ? (
          <ErrorState message={catalogs.error} onRetry={catalogs.retry} />
        ) : null}
        {catalogs.data ? (
          <MovementForm
            accounts={catalogs.data.accounts}
            categories={catalogs.data.categories}
            close={() => {
              void navigate(-1);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function MovementForm({
  accounts,
  categories,
  close,
}: {
  accounts: Account[];
  categories: Category[];
  close: () => void;
}) {
  const activeAccounts = useMemo(
    () => accounts.filter((item) => item.is_active),
    [accounts],
  );
  const [kind, setKind] = useState<MovementKind>("expense");
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? 0);
  const [destinationId, setDestinationId] = useState(0);
  const [destinationAmount, setDestinationAmount] = useState("");
  const [purpose, setPurpose] = useState<TransferPurpose>("regular");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(0);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Movement | null>(null);
  const account = activeAccounts.find((item) => item.id === accountId);
  const destinations = useMemo(
    () => activeAccounts.filter((item) => item.id !== accountId),
    [accountId, activeAccounts],
  );
  const kindCategories = useMemo(
    () =>
      sortCategories(categories).filter(
        (item) => item.is_active && item.kind === kind,
      ),
    [categories, kind],
  );
  const selectKind = (nextKind: MovementKind) => {
    setKind(nextKind);
    setCategoryId(0);
    if (nextKind === "transfer") setDestinationId(destinations[0]?.id ?? 0);
  };

  const selectAccount = (nextAccountId: number) => {
    const nextDestination = activeAccounts.find(
      (item) => item.id !== nextAccountId,
    );
    setAccountId(nextAccountId);
    setDestinationId(nextDestination?.id ?? 0);
    setDestinationAmount("");
  };

  if (!activeAccounts.length)
    return (
      <div className="state state--empty">
        <div>
          <strong>Primero necesitás una cuenta</strong>
          <p>
            Creá una cuenta activa para indicar de dónde sale o entra el dinero.
          </p>
          <Link
            to="/ajustes?section=accounts"
            className="button button--primary"
          >
            Ir a Ajustes
          </Link>
        </div>
      </div>
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (
      kind === "transfer" &&
      (!destinationId || destinationId === accountId)
    ) {
      setError("Elegí otra cuenta de la misma moneda como destino.");
      return;
    }
    setSaving(true);
    const input: MovementInput = {
      kind,
      amount: parseMoney(amount),
      destination_amount:
        kind === "transfer"
          ? destinationAmount
            ? parseMoney(destinationAmount)
            : parseMoney(amount)
          : null,
      purpose: kind === "transfer" ? purpose : null,
      description: description.trim(),
      date,
      account_id: accountId,
      notes: notes.trim() || null,
      category_id: kind === "transfer" ? null : categoryId || null,
      destination_account_id: kind === "transfer" ? destinationId : null,
    };
    try {
      setCreated(await api.movements.create(input));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar el movimiento",
      );
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setAmount("");
    setDescription("");
    setCategoryId(0);
    setDate(today());
    setNotes("");
    setCreated(null);
    setError(null);
  };

  if (created) {
    return (
      <div className="success-state" role="status">
        <span className="success-state__icon">
          <Check aria-hidden="true" />
        </span>
        <p className="eyebrow">Movimiento guardado</p>
        <h2>
          {kindLabels[created.kind]} ·{" "}
          {formatMoney(created.amount, account?.currency ?? "UYU")}
        </h2>
        <dl>
          <div>
            <dt>Descripción</dt>
            <dd>{created.description}</dd>
          </div>
          <div>
            <dt>Cuenta</dt>
            <dd>{account?.name}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{created.date}</dd>
          </div>
        </dl>
        <div className="success-state__actions">
          <Link
            className="button button--secondary"
            to={`/movimientos?selected=${created.id}`}
          >
            Ver movimiento
          </Link>
          <Button variant="secondary" onClick={reset}>
            <Plus size={17} /> Agregar otro
          </Button>
          <Button onClick={close}>Listo</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="quick-form" onSubmit={(event) => void submit(event)}>
      <SegmentedControl
        label="Tipo de movimiento"
        value={kind}
        options={[
          { value: "expense", label: "Gasto" },
          { value: "income", label: "Ingreso" },
          { value: "transfer", label: "Transferencia" },
        ]}
        onChange={selectKind}
      />
      <Field label={`Monto${account ? ` · ${account.currency}` : ""}`}>
        <div className="amount-input">
          <span>{account?.currency === "USD" ? "US$" : "$"}</span>
          <Input
            autoFocus
            required
            name="amount"
            inputMode="decimal"
            pattern="^\d+(?:[.,]\d{1,2})?$"
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </Field>
      <Field label="Descripción">
        <Input
          required
          maxLength={160}
          placeholder={
            kind === "expense"
              ? "Ej. Supermercado"
              : kind === "income"
                ? "Ej. Sueldo"
                : "Ej. Ahorro del mes"
          }
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      {kind === "transfer" ? (
        <>
          <Field
            label="Cuenta de destino"
            hint={
              destinations.length
                ? `Solo cuentas en ${account?.currency}.`
                : `No hay otra cuenta activa en ${account?.currency}.`
            }
          >
            <Select
              required
              value={destinationId || ""}
              onChange={(event) => setDestinationId(Number(event.target.value))}
              disabled={!destinations.length}
            >
              <option value="">Elegí una cuenta</option>
              {destinations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Monto recibido · ${destinations.find((item) => item.id === destinationId)?.currency ?? ""}`}
          >
            <Input
              required
              inputMode="decimal"
              placeholder="Igual al origen si comparten moneda"
              value={destinationAmount}
              onChange={(event) => setDestinationAmount(event.target.value)}
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
      ) : (
        <Field label="Categoría">
          <Select
            value={categoryId || ""}
            onChange={(event) => setCategoryId(Number(event.target.value))}
          >
            <option value="">Sin categoría</option>
            {kindCategories.map((item) => (
              <option key={item.id} value={item.id}>
                {categoryPath(item, categories)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Fecha">
        <Input
          required
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={date !== today() ? "input--notice" : ""}
        />
      </Field>
      <details className="more-options">
        <summary>
          Más opciones <ChevronDown size={17} />
        </summary>
        <div className="more-options__content">
          <Field label={kind === "transfer" ? "Cuenta de origen" : "Cuenta"}>
            <Select
              required
              value={accountId || ""}
              onChange={(event) => selectAccount(Number(event.target.value))}
            >
              {activeAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notas" hint="Opcional. Solo para tu referencia.">
            <textarea
              className="input textarea"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
      </details>
      {error ? <ErrorState compact message={error} /> : null}
      <div className="quick-form__actions">
        <Button variant="secondary" onClick={close}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={saving || (kind === "transfer" && !destinations.length)}
        >
          {saving ? (
            <InlineLoading />
          ) : (
            `Guardar ${kindLabels[kind].toLowerCase()}`
          )}
        </Button>
      </div>
    </form>
  );
}
