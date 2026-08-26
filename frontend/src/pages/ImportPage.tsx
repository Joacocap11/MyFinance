import {
  Check,
  FileSpreadsheet,
  FileUp,
  Info,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type {
  Account,
  Category,
  ImportBatch,
  ImportConfirmation,
  ImportDisposition,
  ImportMapping,
  ImportRow,
} from "../api/types";
import {
  Button,
  ErrorState,
  Field,
  InlineLoading,
  LoadingState,
  PageHeader,
  Select,
  StatusPill,
} from "../components/ui";
import {
  categoryPath,
  formatDate,
  formatMoney,
  kindLabels,
  sortCategories,
} from "../lib/format";
import { useRequest } from "../lib/useRequest";

export function ImportPage() {
  const catalogs = useRequest(async () => {
    const [accounts, categories] = await Promise.all([
      api.settings.accounts(),
      api.settings.categories(),
    ]);
    return {
      accounts: accounts.filter((item) => item.is_active),
      categories: categories.filter((item) => item.is_active),
    };
  }, []);
  return (
    <div className="page page--import">
      <PageHeader
        eyebrow="Desde tu estado de cuenta"
        title="Importar CSV"
        description="Revisás cada interpretación antes de modificar tus números."
      />
      {catalogs.loading ? (
        <div className="panel">
          <LoadingState rows={5} />
        </div>
      ) : null}
      {catalogs.error && !catalogs.data ? (
        <ErrorState message={catalogs.error} onRetry={catalogs.retry} />
      ) : null}
      {catalogs.data ? (
        <ImportWorkflow
          accounts={catalogs.data.accounts}
          categories={catalogs.data.categories}
        />
      ) : null}
    </div>
  );
}

function ImportWorkflow({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({
    date: "",
    description: "",
    amount: "",
  });
  const [amountMode, setAmountMode] = useState<"signed" | "split">("signed");
  const [result, setResult] = useState<ImportConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = accounts.find((item) => item.id === accountId);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("El archivo debe tener extensión .csv.");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("El archivo supera el máximo de 2 MiB.");
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const uploaded = await api.imports.upload(file);
      setBatch(uploaded);
      const normalized = uploaded.headers.map((header) =>
        header.toLocaleLowerCase("es"),
      );
      const findHeader = (candidates: string[]) =>
        uploaded.headers[
          normalized.findIndex((header) =>
            candidates.some((candidate) => header.includes(candidate)),
          )
        ] ?? "";
      const amount = findHeader(["importe", "monto", "amount"]);
      const debit = findHeader(["débito", "debito", "debe", "debit"]);
      const credit = findHeader(["crédito", "credito", "haber", "credit"]);
      const splitAmounts = !amount && Boolean(debit || credit);
      setAmountMode(splitAmounts ? "split" : "signed");
      setMapping({
        date: findHeader(["fecha", "date"]),
        description: findHeader([
          "descripción",
          "descripcion",
          "concepto",
          "description",
        ]),
        amount: splitAmounts ? undefined : amount,
        debit: splitAmounts ? debit : undefined,
        credit: splitAmounts ? credit : undefined,
        kind: findHeader(["tipo", "kind"]) || undefined,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo subir el archivo",
      );
    } finally {
      setBusy(false);
    }
  };

  const preview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!batch || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      setBatch(await api.imports.preview(batch.id, accountId, mapping));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo generar la vista previa",
      );
    } finally {
      setBusy(false);
    }
  };

  const updateRow = async (
    row: ImportRow,
    input: { category_id?: number | null; disposition?: ImportDisposition },
  ) => {
    if (!batch) return;
    setError(null);
    const oldRows = batch.rows ?? [];
    setBatch({
      ...batch,
      rows: oldRows.map((item) =>
        item.id === row.id ? { ...item, ...input } : item,
      ),
    });
    try {
      const updated = await api.imports.updateRow(batch.id, row.id, input);
      setBatch((current) =>
        current
          ? {
              ...current,
              rows: (current.rows ?? []).map((item) =>
                item.id === row.id ? updated : item,
              ),
            }
          : current,
      );
    } catch (reason) {
      setBatch((current) =>
        current ? { ...current, rows: oldRows } : current,
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo actualizar la fila",
      );
    }
  };

  const confirm = async () => {
    if (!batch) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.imports.confirm(batch.id));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo confirmar la importación",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!accounts.length)
    return (
      <div className="state state--empty">
        <div>
          <strong>Necesitás una cuenta activa</strong>
          <p>
            La cuenta define la moneda y el destino de los movimientos
            importados.
          </p>
          <Link
            to="/ajustes?section=accounts"
            className="button button--primary"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    );
  if (result)
    return (
      <section className="panel import-result" role="status">
        <span className="success-state__icon">
          <Check />
        </span>
        <p className="eyebrow">Importación confirmada</p>
        <h2>{result.imported_count} movimientos importados</h2>
        <p>
          {result.skipped_count} filas omitidas. Reintentar esta confirmación no
          volverá a crear movimientos.
        </p>
        <div>
          <Link className="button button--primary" to="/movimientos">
            Ver movimientos
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setBatch(null);
              setResult(null);
              setError(null);
            }}
          >
            Importar otro archivo
          </Button>
        </div>
      </section>
    );

  const rows = batch?.rows ?? [];
  const ready = rows.filter(
    (row) => row.disposition === "import" && !row.error,
  );
  const invalid = rows.filter((row) => Boolean(row.error));
  const unresolved = rows.filter(
    (row) => row.disposition === "possible_duplicate",
  );
  const skipped = rows.filter(
    (row) => row.disposition === "skip" && !row.error,
  );
  const omitted = skipped.length + invalid.length;
  const attention = invalid.length + unresolved.length;

  return (
    <>
      <ol className="stepper" aria-label="Progreso de importación">
        <li className="is-complete">
          <span>1</span> Subir
        </li>
        <li className={batch ? "is-complete" : ""}>
          <span>2</span> Mapear
        </li>
        <li className={batch?.state === "previewed" ? "is-complete" : ""}>
          <span>3</span> Revisar
        </li>
        <li>
          <span>4</span> Confirmar
        </li>
      </ol>
      {!batch ? (
        <section className="panel upload-panel">
          <div>
            <FileSpreadsheet size={34} aria-hidden="true" />
            <h2>Elegí cuenta y archivo</h2>
            <p>CSV de hasta 2 MiB. La vista previa no crea movimientos.</p>
          </div>
          <Field
            label="Cuenta de destino"
            hint={
              account
                ? `Todos los montos se interpretarán en ${account.currency}.`
                : undefined
            }
          >
            <Select
              value={accountId || ""}
              onChange={(event) => setAccountId(Number(event.target.value))}
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </Select>
          </Field>
          <label
            className={`button button--primary file-button ${busy || !accountId ? "is-disabled" : ""}`}
          >
            <FileUp size={17} /> {busy ? "Subiendo…" : "Seleccionar CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void upload(event)}
              disabled={busy || !accountId}
            />
          </label>
          {error ? <ErrorState compact message={error} /> : null}
        </section>
      ) : null}

      {batch && batch.state === "uploaded" ? (
        <section className="panel mapping-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{batch.filename}</p>
              <h2>Indicá qué significa cada columna</h2>
            </div>
            <StatusPill>{account?.currency}</StatusPill>
          </div>
          <form
            onSubmit={(event) => void preview(event)}
            className="mapping-grid"
          >
            <MappingField
              label="Fecha"
              value={mapping.date}
              headers={batch.headers}
              onChange={(value) => setMapping({ ...mapping, date: value })}
            />
            <MappingField
              label="Descripción"
              value={mapping.description}
              headers={batch.headers}
              onChange={(value) =>
                setMapping({ ...mapping, description: value })
              }
            />
            <Field label="Formato de importes">
              <Select
                value={amountMode}
                onChange={(event) => {
                  const mode = event.target.value as "signed" | "split";
                  setAmountMode(mode);
                  setMapping((current) =>
                    mode === "signed"
                      ? {
                          ...current,
                          amount: "",
                          debit: undefined,
                          credit: undefined,
                        }
                      : {
                          ...current,
                          amount: undefined,
                          debit: "",
                          credit: "",
                        },
                  );
                }}
              >
                <option value="signed">Una columna con signo</option>
                <option value="split">Columnas de débito y crédito</option>
              </Select>
            </Field>
            {amountMode === "signed" ? (
              <MappingField
                label="Monto con signo"
                value={mapping.amount ?? ""}
                headers={batch.headers}
                onChange={(value) => setMapping({ ...mapping, amount: value })}
              />
            ) : (
              <>
                <MappingField
                  optional
                  label="Débito"
                  value={mapping.debit ?? ""}
                  headers={batch.headers}
                  onChange={(value) =>
                    setMapping({ ...mapping, debit: value || undefined })
                  }
                />
                <MappingField
                  optional
                  label="Crédito"
                  value={mapping.credit ?? ""}
                  headers={batch.headers}
                  onChange={(value) =>
                    setMapping({ ...mapping, credit: value || undefined })
                  }
                />
              </>
            )}
            <MappingField
              optional
              label="Tipo (opcional)"
              value={mapping.kind ?? ""}
              headers={batch.headers}
              onChange={(value) =>
                setMapping({ ...mapping, kind: value || undefined })
              }
            />
            <div className="mapping-preview">
              <strong>Ejemplo del archivo</strong>
              {batch.sample_rows.slice(0, 3).map((row, index) => (
                <dl key={index}>
                  {Object.entries(row).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
            {error ? <ErrorState compact message={error} /> : null}
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setBatch(null)}>
                Cambiar archivo
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !mapping.date ||
                  !mapping.description ||
                  (amountMode === "signed"
                    ? !mapping.amount
                    : !mapping.debit && !mapping.credit)
                }
              >
                {busy ? (
                  <InlineLoading label="Interpretando…" />
                ) : (
                  "Generar vista previa"
                )}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {batch?.state === "previewed" ? (
        <section className="panel preview-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Vista previa · todavía sin impacto</p>
              <h2>Revisá antes de confirmar</h2>
            </div>
            <div className="preview-counts">
              <StatusPill tone="success">{ready.length} listos</StatusPill>
              <StatusPill tone="warning">{omitted} omitidos</StatusPill>
              {attention ? (
                <StatusPill tone="danger">{attention} con atención</StatusPill>
              ) : null}
            </div>
          </div>
          <p className="notice">
            <ShieldCheck size={18} /> El servidor decide posibles duplicados.
            Una compra repetida legítimamente se puede incluir.
          </p>
          {error ? <ErrorState compact message={error} /> : null}
          <div
            className="import-rows"
            role="table"
            aria-label="Filas de la importación"
          >
            <div className="import-rows__header" role="row">
              <span>Fila y estado</span>
              <span>Movimiento interpretado</span>
              <span>Categoría</span>
              <span>Decisión</span>
            </div>
            {rows.map((row) => (
              <ImportPreviewRow
                key={row.id}
                row={row}
                account={account}
                categories={categories}
                update={(input) => void updateRow(row, input)}
              />
            ))}
          </div>
          <div className="confirm-bar">
            <div>
              <strong>{ready.length} movimientos se crearán</strong>
              <span>{omitted} filas no se importarán.</span>
            </div>
            <Button
              onClick={() => void confirm()}
              disabled={busy || ready.length === 0 || unresolved.length > 0}
            >
              {busy ? (
                <InlineLoading label="Confirmando…" />
              ) : (
                "Confirmar importación"
              )}
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function MappingField({
  label,
  value,
  headers,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <Field label={label}>
      <Select
        required={!optional}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{optional ? "No usar" : "Elegí una columna"}</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ImportPreviewRow({
  row,
  account,
  categories,
  update,
}: {
  row: ImportRow;
  account: Account | undefined;
  categories: Category[];
  update: (input: {
    category_id?: number | null;
    disposition?: ImportDisposition;
  }) => void;
}) {
  return (
    <div role="row" className={`import-row ${row.error ? "has-error" : ""}`}>
      <div role="cell">
        <strong>Fila {row.row_number}</strong>
        {row.error ? (
          <StatusPill tone="danger">Revisar</StatusPill>
        ) : row.possible_duplicate ? (
          <StatusPill tone="warning">Posible duplicado</StatusPill>
        ) : (
          <StatusPill tone="success">Lista</StatusPill>
        )}
      </div>
      <div role="cell">
        <strong>{row.description}</strong>
        <span>
          {row.kind ? `${kindLabels[row.kind]} · ` : ""}
          {row.date ? formatDate(row.date) : "Fecha inválida"} ·{" "}
          {row.amount
            ? formatMoney(row.amount, account?.currency ?? "UYU")
            : "Monto inválido"}
        </span>
        {row.possible_duplicate ? (
          <small>
            <Info size={14} /> Coincide semánticamente con otro movimiento;
            verificá antes de omitir.
          </small>
        ) : null}
        {row.error ? (
          <small className="text-negative">
            <TriangleAlert size={14} /> {row.error}
          </small>
        ) : null}
      </div>
      <div role="cell">
        <Select
          disabled={Boolean(row.error)}
          aria-label={`Categoría de fila ${row.row_number}`}
          value={row.category_id ?? ""}
          onChange={(event) =>
            update({ category_id: Number(event.target.value) || null })
          }
        >
          <option value="">Sin categoría</option>
          {sortCategories(categories)
            .filter((item) => item.is_active && item.kind === row.kind)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {categoryPath(item, categories)}
              </option>
            ))}
        </Select>
      </div>
      <div role="cell">
        <Select
          disabled={Boolean(row.error)}
          aria-label={`Decisión de fila ${row.row_number}`}
          value={row.disposition}
          onChange={(event) =>
            update({ disposition: event.target.value as ImportDisposition })
          }
        >
          <option value="possible_duplicate" disabled>
            Elegí importar u omitir
          </option>
          <option value="import">Importar</option>
          <option value="skip">Omitir</option>
        </Select>
      </div>
    </div>
  );
}
