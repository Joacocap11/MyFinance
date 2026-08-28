import {
  Archive,
  Banknote,
  CalendarClock,
  ChevronRight,
  FolderTree,
  ListRestart,
  Pencil,
  Plus,
  Tags,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth";
import type {
  Account,
  Category,
  CategoryKind,
  CategoryRule,
  Currency,
  RecurringExpense,
} from "../api/types";
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
import { categoryPath, formatMoney, sortCategories } from "../lib/format";
import { useRequest } from "../lib/useRequest";

type SettingsSection =
  "accounts" | "categories" | "rules" | "recurring" | "budget" | "users";

const sectionNavigation: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof WalletCards;
}> = [
  { id: "accounts", label: "Cuentas", icon: WalletCards },
  { id: "categories", label: "Categorías", icon: FolderTree },
  { id: "rules", label: "Reglas", icon: Tags },
  { id: "recurring", label: "Gastos recurrentes", icon: CalendarClock },
  { id: "budget", label: "Presupuesto", icon: Banknote },
  { id: "users", label: "Usuarios", icon: UserRound },
];

export function SettingsPage() {
  const { session } = useAuth();
  const visibleSections = sectionNavigation.filter(
    (item) => item.id !== "users" || session?.user.is_admin,
  );
  const [search, setSearch] = useSearchParams();
  const rawSection = search.get("section");
  const section: SettingsSection = visibleSections.some(
    (item) => item.id === rawSection,
  )
    ? (rawSection as SettingsSection)
    : "accounts";
  const selectSection = (value: SettingsSection) => {
    const next = new URLSearchParams(search);
    next.set("section", value);
    setSearch(next, { replace: true });
  };
  return (
    <div className="page page--settings">
      <PageHeader
        eyebrow="Tu forma de organizarte"
        title="Ajustes"
        description="Configuración compacta; tu historial siempre se conserva."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Secciones de ajustes">
          {visibleSections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={section === id ? "is-active" : ""}
              onClick={() => selectSection(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {section === "accounts" ? <AccountsSettings /> : null}
          {section === "categories" ? <CategoriesSettings /> : null}
          {section === "rules" ? <RulesSettings /> : null}
          {section === "recurring" ? <RecurringSettings /> : null}
          {section === "budget" ? <BudgetSettings /> : null}
          {section === "users" && session?.user.is_admin ? <UsersSettings /> : null}
        </section>
      </div>
    </div>
  );
}

function SettingsHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="settings-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function AccountsSettings() {
  const state = useRequest(() => api.settings.accounts(), []);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [reconciling, setReconciling] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      if (editing === "new")
        await api.settings.createAccount({
          name: formText(data, "name"),
          currency: formText(data, "currency") as Currency,
          opening_balance: parseMoney(formText(data, "opening_balance")),
          is_active: true,
        });
      else if (editing)
        await api.settings.updateAccount(editing.id, {
          name: formText(data, "name"),
        });
      setEditing(null);
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  };
  const reconcile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reconciling) return;
    const data = new FormData(event.currentTarget);
    const actual = parseMoney(formText(data, "actual_balance"));
    const difference = decimalDifference(actual, reconciling.current_balance);
    if (
      !window.confirm(
        `Saldo actual en MyFinance: ${formatMoney(reconciling.current_balance, reconciling.currency)}\n` +
          `Nuevo saldo real: ${formatMoney(actual, reconciling.currency)}\n` +
          `Ajuste que se registrará: ${formatMoney(String(difference), reconciling.currency)}`,
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      await api.settings.reconcileAccount(reconciling.id, {
        actual_balance: actual,
        date: formText(data, "date"),
        note: formText(data, "note"),
      });
      setReconciling(null);
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  };
  const archive = async (account: Account) => {
    if (
      !window.confirm(
        `${account.is_active ? "Archivar" : "Reactivar"} “${account.name}”? Su historial financiero se conservará.`,
      )
    )
      return;
    try {
      await api.settings.updateAccount(account.id, {
        is_active: !account.is_active,
      });
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  const remove = async (account: Account) => {
    if (
      !window.confirm(
        `¿Eliminar “${account.name}”? Solo se puede eliminar si no tiene movimientos ni configuraciones asociadas.`,
      )
    )
      return;
    try {
      await api.settings.deleteAccount(account.id);
      if (editing && editing !== "new" && editing.id === account.id)
        setEditing(null);
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  return (
    <>
      <SettingsHeading
        title="Cuentas"
        description="La moneda queda fija para proteger saldos e historial."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> Nueva cuenta
          </Button>
        }
      />
      {reconciling ? (
        <form
          className="settings-form"
          onSubmit={(event) => void reconcile(event)}
        >
          <h3>Conciliar saldo · {reconciling.name}</h3>
          <p className="notice">
            Saldo calculado por MyFinance:{" "}
            {formatMoney(reconciling.current_balance, reconciling.currency)}
          </p>
          <Field label="Saldo real">
            <Input
              name="actual_balance"
              required
              autoFocus
              inputMode="decimal"
              defaultValue={reconciling.current_balance}
              pattern="^-?\d+(?:[.,]\d{1,2})?$"
            />
          </Field>
          <Field label="Fecha del ajuste">
            <Input
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Nota">
            <Input
              name="note"
              required
              defaultValue="Conciliación con saldo bancario"
              maxLength={240}
            />
          </Field>
          <FormActions saving={saving} cancel={() => setReconciling(null)} />
        </form>
      ) : null}
      {error ? <ErrorState compact message={error} /> : null}
      {editing ? (
        <form className="settings-form" onSubmit={(event) => void save(event)}>
          <h3>{editing === "new" ? "Nueva cuenta" : "Editar cuenta"}</h3>
          <Field label="Nombre">
            <Input
              name="name"
              required
              maxLength={80}
              defaultValue={editing === "new" ? "" : editing.name}
            />
          </Field>
          {editing === "new" ? (
            <>
              <Field label="Moneda">
                <Select name="currency" defaultValue="UYU">
                  <option value="UYU">Pesos uruguayos (UYU)</option>
                  <option value="USD">Dólares estadounidenses (USD)</option>
                  <option value="UI">Unidades indexadas (UI)</option>
                </Select>
              </Field>
              <Field
                label="Saldo inicial"
                hint="Puede ser negativo. Se guarda con hasta 2 decimales."
              >
                <Input
                  name="opening_balance"
                  required
                  inputMode="decimal"
                  defaultValue="0"
                  pattern="^-?\d+(?:[.,]\d{1,2})?$"
                />
              </Field>
            </>
          ) : (
            <p className="notice">
              La moneda {editing.currency} y el saldo inicial no se editan una
              vez creada la cuenta. Usá “Conciliar saldo” para corregir el saldo
              actual de forma auditable.
            </p>
          )}
          <FormActions saving={saving} cancel={() => setEditing(null)} />
        </form>
      ) : null}
      {state.data ? (
        state.data.length ? (
          <div className="settings-list">
            {state.data.map((account) => (
              <article
                className={!account.is_active ? "is-inactive" : ""}
                key={account.id}
              >
                <div className="settings-list__icon">
                  <WalletCards />
                </div>
                <div>
                  <strong>{account.name}</strong>
                  <span>
                    {account.currency} · Saldo actual{" "}
                    {formatMoney(account.current_balance, account.currency)}
                  </span>
                  {account.adjustments?.[0] ? (
                    <small>
                      Última conciliación: {account.adjustments?.[0]?.date} ·{" "}
                      {formatMoney(
                        account.adjustments?.[0]?.amount ?? "0",
                        account.currency,
                      )}
                    </small>
                  ) : null}
                </div>
                <StatusPill tone={account.is_active ? "success" : "neutral"}>
                  {account.is_active ? "Activa" : "Archivada"}
                </StatusPill>
                <div className="row-actions">
                  <Button variant="quiet" onClick={() => setEditing(account)}>
                    <Pencil size={16} /> Editar
                  </Button>
                  <Button variant="danger" onClick={() => void remove(account)}>
                    <Trash2 size={16} /> Eliminar
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => setReconciling(account)}
                  >
                    Conciliar saldo
                  </Button>
                  <Button variant="quiet" onClick={() => void archive(account)}>
                    <Archive size={16} />{" "}
                    {account.is_active ? "Archivar" : "Reactivar"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="No hay cuentas"
            description="Creá una para empezar a registrar movimientos."
          />
        )
      ) : null}
    </>
  );
}

function UsersSettings() {
  const state = useRequest(() => api.admin.users(), []);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = formText(data, "password");
    if (password !== formText(data, "confirm_password")) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.admin.createUser({ email: formText(data, "email"), password });
      setCreating(false);
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (user: { id: number; is_active: boolean }) => {
    try {
      await api.admin.updateUser(user.id, { is_active: !user.is_active });
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  return (
    <>
      <SettingsHeading
        title="Usuarios"
        description="Administrá el acceso sin mezclar datos financieros entre usuarios."
        action={<Button onClick={() => setCreating(true)}><Plus size={16} /> Nuevo usuario</Button>}
      />
      {error ? <ErrorState compact message={error} /> : null}
      {creating ? (
        <form className="settings-form" onSubmit={(event) => void save(event)}>
          <h3>Nuevo usuario</h3>
          <Field label="Email"><Input name="email" type="email" required autoFocus /></Field>
          <Field label="Contraseña inicial"><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
          <Field label="Confirmar contraseña"><Input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" /></Field>
          <FormActions saving={saving} cancel={() => setCreating(false)} />
        </form>
      ) : null}
      {state.data ? (
        <div className="settings-list">
          {state.data.map((user) => (
            <article key={user.id}>
              <div className="settings-list__icon"><UserRound /></div>
              <div><strong>{user.email}</strong><span>{user.is_admin ? "Administrador" : "Usuario"} · {user.is_active ? "Activo" : "Inactivo"}</span></div>
              <StatusPill tone={user.is_active ? "success" : "neutral"}>{user.is_active ? "Activo" : "Inactivo"}</StatusPill>
              <div className="row-actions">
                <Button variant="quiet" onClick={() => void toggle(user)}>{user.is_active ? "Desactivar" : "Activar"}</Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

function CategoriesSettings() {
  const state = useRequest(() => api.settings.categories(), []);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [newKind, setNewKind] = useState<CategoryKind>("expense");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const parentId = Number(formText(data, "parent_id")) || null;
    try {
      if (editing === "new")
        await api.settings.createCategory({
          name: formText(data, "name"),
          kind: formText(data, "kind") as CategoryKind,
          parent_id: parentId,
          is_active: true,
        });
      else if (editing)
        await api.settings.updateCategory(editing.id, {
          name: formText(data, "name"),
          parent_id: parentId,
        });
      setEditing(null);
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (category: Category) => {
    try {
      await api.settings.updateCategory(category.id, {
        is_active: !category.is_active,
      });
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  const selectedKind = editing === "new" ? newKind : editing?.kind;
  const categories = sortCategories(state.data ?? []);
  return (
    <>
      <SettingsHeading
        title="Categorías"
        description="Árboles separados para gastos e ingresos. Cambiar la categoría padre no altera movimientos pasados."
        action={
          <Button
            onClick={() => {
              setNewKind("expense");
              setEditing("new");
            }}
          >
            <Plus size={16} /> Nueva categoría
          </Button>
        }
      />
      {error ? <ErrorState compact message={error} /> : null}
      {editing ? (
        <form className="settings-form" onSubmit={(event) => void save(event)}>
          <h3>{editing === "new" ? "Nueva categoría" : "Editar categoría"}</h3>
          <Field label="Nombre">
            <Input
              name="name"
              required
              maxLength={80}
              defaultValue={editing === "new" ? "" : editing.name}
            />
          </Field>
          {editing === "new" ? (
            <Field label="Tipo">
              <Select
                name="kind"
                value={newKind}
                onChange={(event) =>
                  setNewKind(event.target.value as CategoryKind)
                }
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </Select>
            </Field>
          ) : null}
          <Field
            label="Categoría padre"
            hint="Opcional. Debe ser del mismo tipo."
          >
            <Select
              name="parent_id"
              defaultValue={editing === "new" ? "" : (editing.parent_id ?? "")}
            >
              <option value="">Ninguna (principal)</option>
              {categories
                .filter(
                  (item) =>
                    item.id !== (editing === "new" ? -1 : editing.id) &&
                    (!selectedKind || item.kind === selectedKind) &&
                    item.is_active,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {categoryPath(item, categories)}
                  </option>
                ))}
            </Select>
          </Field>
          <FormActions saving={saving} cancel={() => setEditing(null)} />
        </form>
      ) : null}
      {state.loading ? <LoadingState rows={5} /> : null}
      {state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : null}
      {state.data ? (
        categories.length ? (
          <div className="category-groups">
            {(["expense", "income"] as const).map((kind) => (
              <section key={kind}>
                <h3>{kind === "expense" ? "Gastos" : "Ingresos"}</h3>
                <div className="settings-list">
                  {categories
                    .filter((item) => item.kind === kind)
                    .map((category) => (
                      <article
                        className={!category.is_active ? "is-inactive" : ""}
                        key={category.id}
                      >
                        <div className="settings-list__icon">
                          <FolderTree />
                        </div>
                        <div>
                          <strong>{categoryPath(category, categories)}</strong>
                          <span>
                            {category.parent_id
                              ? "Subcategoría"
                              : "Categoría principal"}
                          </span>
                        </div>
                        <StatusPill
                          tone={category.is_active ? "success" : "neutral"}
                        >
                          {category.is_active ? "Activa" : "Archivada"}
                        </StatusPill>
                        <div className="row-actions">
                          <Button
                            variant="quiet"
                            onClick={() => setEditing(category)}
                          >
                            <Pencil size={16} /> Editar
                          </Button>
                          <Button
                            variant="quiet"
                            onClick={() => void toggle(category)}
                          >
                            <Archive size={16} />{" "}
                            {category.is_active ? "Archivar" : "Reactivar"}
                          </Button>
                        </div>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="No hay categorías"
            description="Creá categorías para entender dónde se mueve el dinero."
          />
        )
      ) : null}
    </>
  );
}

function RulesSettings() {
  const state = useRequest(async () => {
    const [rules, categories] = await Promise.all([
      api.settings.rules(),
      api.settings.categories(),
    ]);
    return { rules, categories };
  }, []);
  const [editing, setEditing] = useState<CategoryRule | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const input = {
      needle: formText(data, "needle"),
      category_id: Number(formText(data, "category_id")),
      priority: Number(formText(data, "priority")),
      is_active: true,
    };
    try {
      if (editing === "new") await api.settings.createRule(input);
      else if (editing)
        await api.settings.updateRule(editing.id, {
          ...input,
          is_active: editing.is_active,
        });
      setEditing(null);
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (rule: CategoryRule) => {
    try {
      await api.settings.updateRule(rule.id, { is_active: !rule.is_active });
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  const ruleData = state.data;
  return (
    <>
      <SettingsHeading
        title="Reglas de categorización"
        description="La primera coincidencia por prioridad gana; una categoría elegida manualmente siempre prevalece."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> Nueva regla
          </Button>
        }
      />
      {error ? <ErrorState compact message={error} /> : null}
      {editing && ruleData ? (
        <form className="settings-form" onSubmit={(event) => void save(event)}>
          <h3>{editing === "new" ? "Nueva regla" : "Editar regla"}</h3>
          <Field label="La descripción contiene">
            <Input
              name="needle"
              required
              maxLength={120}
              placeholder="Ej. supermercado"
              defaultValue={editing === "new" ? "" : editing.needle}
            />
          </Field>
          <Field label="Asignar categoría">
            <Select
              name="category_id"
              required
              defaultValue={editing === "new" ? "" : editing.category_id}
            >
              <option value="">Elegí una categoría</option>
              {sortCategories(ruleData.categories)
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {categoryPath(item, ruleData.categories)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Prioridad">
            <Input
              name="priority"
              type="number"
              min="0"
              max="9999"
              required
              defaultValue={
                editing === "new"
                  ? nextPriority(ruleData.rules)
                  : editing.priority
              }
            />
          </Field>
          <FormActions saving={saving} cancel={() => setEditing(null)} />
        </form>
      ) : null}
      {state.loading ? <LoadingState rows={4} /> : null}
      {state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : null}
      {ruleData ? (
        ruleData.rules.length ? (
          <div className="settings-list">
            {[...ruleData.rules]
              .sort((a, b) => a.priority - b.priority || a.id - b.id)
              .map((rule) => {
                const category = ruleData.categories.find(
                  (item) => item.id === rule.category_id,
                );
                return (
                  <article
                    className={!rule.is_active ? "is-inactive" : ""}
                    key={rule.id}
                  >
                    <div className="priority-badge">{rule.priority}</div>
                    <div>
                      <strong>Contiene “{rule.needle}”</strong>
                      <span>
                        Entonces:{" "}
                        {category
                          ? categoryPath(category, ruleData.categories)
                          : "Categoría no disponible"}
                      </span>
                    </div>
                    <StatusPill tone={rule.is_active ? "success" : "neutral"}>
                      {rule.is_active ? "Activa" : "Inactiva"}
                    </StatusPill>
                    <div className="row-actions">
                      <Button variant="quiet" onClick={() => setEditing(rule)}>
                        <Pencil size={16} /> Editar
                      </Button>
                      <Button variant="quiet" onClick={() => void toggle(rule)}>
                        {rule.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </article>
                );
              })}
          </div>
        ) : (
          <EmptyState
            compact
            title="No hay reglas"
            description="Creá una para sugerir categorías durante las importaciones."
          />
        )
      ) : null}
    </>
  );
}

function RecurringSettings() {
  const state = useRequest(async () => {
    const [items, accounts, categories] = await Promise.all([
      api.settings.recurring(),
      api.settings.accounts(),
      api.settings.categories(),
    ]);
    return { items, accounts, categories };
  }, []);
  const [editing, setEditing] = useState<RecurringExpense | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const input = {
      description: formText(data, "description"),
      amount: parseMoney(formText(data, "amount")),
      day_of_month: Number(formText(data, "day_of_month")),
      account_id: Number(formText(data, "account_id")),
      category_id: Number(formText(data, "category_id")),
      is_active: true,
    };
    try {
      if (editing === "new") await api.settings.createRecurring(input);
      else if (editing)
        await api.settings.updateRecurring(editing.id, {
          ...input,
          is_active: editing.is_active,
        });
      setEditing(null);
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (item: RecurringExpense) => {
    try {
      await api.settings.updateRecurring(item.id, {
        is_active: !item.is_active,
      });
      state.retry();
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  const recurringData = state.data;
  return (
    <>
      <SettingsHeading
        title="Gastos recurrentes"
        description="Son definiciones mensuales de referencia y nunca publican movimientos automáticamente."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> Nuevo recurrente
          </Button>
        }
      />
      {error ? <ErrorState compact message={error} /> : null}
      {editing && recurringData ? (
        <form className="settings-form" onSubmit={(event) => void save(event)}>
          <h3>
            {editing === "new" ? "Nuevo gasto recurrente" : "Editar recurrente"}
          </h3>
          <Field label="Descripción">
            <Input
              name="description"
              required
              maxLength={160}
              defaultValue={editing === "new" ? "" : editing.description}
            />
          </Field>
          <Field label="Monto">
            <Input
              name="amount"
              required
              inputMode="decimal"
              pattern="^\d+(?:[.,]\d{1,2})?$"
              defaultValue={editing === "new" ? "" : editing.amount}
            />
          </Field>
          <Field label="Cuenta">
            <Select
              name="account_id"
              required
              defaultValue={editing === "new" ? "" : editing.account_id}
            >
              <option value="">Elegí una cuenta</option>
              {recurringData.accounts
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.currency}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Categoría de gasto">
            <Select
              name="category_id"
              required
              defaultValue={editing === "new" ? "" : editing.category_id}
            >
              <option value="">Elegí una categoría</option>
              {sortCategories(recurringData.categories)
                .filter((item) => item.is_active && item.kind === "expense")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {categoryPath(item, recurringData.categories)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Día del mes">
            <Input
              required
              type="number"
              min="1"
              max="31"
              defaultValue={editing === "new" ? "1" : editing.day_of_month}
            />
          </Field>
          <FormActions saving={saving} cancel={() => setEditing(null)} />
        </form>
      ) : null}
      {state.loading ? <LoadingState rows={4} /> : null}
      {state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : null}
      {recurringData ? (
        recurringData.items.length ? (
          <div className="settings-list">
            {recurringData.items.map((item) => {
              const account = recurringData.accounts.find(
                (entry) => entry.id === item.account_id,
              );
              const category = recurringData.categories.find(
                (entry) => entry.id === item.category_id,
              );
              return (
                <article
                  className={!item.is_active ? "is-inactive" : ""}
                  key={item.id}
                >
                  <div className="settings-list__icon">
                    <ListRestart />
                  </div>
                  <div>
                    <strong>
                      {item.description} ·{" "}
                      {formatMoney(item.amount, account?.currency ?? "UYU")}
                    </strong>
                    <span>
                      Día {item.day_of_month} · {account?.name} ·{" "}
                      {category?.name}
                    </span>
                  </div>
                  <StatusPill tone={item.is_active ? "success" : "neutral"}>
                    {item.is_active ? "Activo" : "Inactivo"}
                  </StatusPill>
                  <div className="row-actions">
                    <Button variant="quiet" onClick={() => setEditing(item)}>
                      <Pencil size={16} /> Editar
                    </Button>
                    <Button variant="quiet" onClick={() => void toggle(item)}>
                      {item.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            compact
            title="No hay gastos recurrentes"
            description="Agregá definiciones para recordar compromisos mensuales sin crear movimientos automáticos."
          />
        )
      ) : null}
    </>
  );
}

function BudgetSettings() {
  const [currency, setCurrency] = useState<Currency>("UYU");
  const state = useRequest(() => api.settings.budget(currency), [currency]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const data = new FormData(event.currentTarget);
    const raw = formText(data, "amount").trim();
    try {
      state.setData(
        await api.settings.updateBudget(currency, raw ? parseMoney(raw) : null),
      );
      setSaved(true);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <SettingsHeading
        title="Presupuesto mensual"
        description="Un monto por moneda, repetido cada mes. Cuenta gastos activos; transferencias y anulados quedan fuera."
      />{" "}
      <div
        className="currency-tabs"
        role="group"
        aria-label="Moneda del presupuesto"
      >
        {(["UYU", "USD", "UI"] as const).map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => {
              state.setData(null);
              setCurrency(item);
              setSaved(false);
            }}
            className={currency === item ? "is-active" : ""}
          >
            {item}
          </button>
        ))}
      </div>
      {state.loading ? <LoadingState rows={3} /> : null}
      {state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : null}
      {state.data ? (
        <form
          className="settings-form budget-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="budget-form__icon">
            <Banknote />
          </div>
          <div>
            <p className="eyebrow">Límite mensual · {currency}</p>
            <h3>
              {state.data.amount
                ? formatMoney(state.data.amount, currency)
                : "Sin límite definido"}
            </h3>
          </div>
          <Field
            label={`Monto en ${currency}`}
            hint="Dejalo vacío para quitar el presupuesto."
          >
            <Input
              key={`${currency}-${state.data.amount ?? ""}`}
              name="amount"
              inputMode="decimal"
              pattern="^\d+(?:[.,]\d{1,2})?$"
              defaultValue={state.data.amount ?? ""}
              placeholder="0,00"
            />
          </Field>
          {error ? <ErrorState compact message={error} /> : null}
          {saved ? (
            <p className="save-confirmation" role="status">
              Presupuesto guardado.
            </p>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? <InlineLoading /> : "Guardar presupuesto"}
          </Button>
        </form>
      ) : null}
    </>
  );
}

function FormActions({
  saving,
  cancel,
}: {
  saving: boolean;
  cancel: () => void;
}) {
  return (
    <div className="form-actions">
      <Button variant="secondary" onClick={cancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={saving}>
        {saving ? <InlineLoading /> : "Guardar"}
      </Button>
    </div>
  );
}

function messageOf(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : "No se pudo guardar el cambio";
}

function decimalDifference(left: string, right: string): string {
  const cents = (value: string) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace("-", "").split(".");
    const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
    return negative ? -result : result;
  };
  const result = cents(left) - cents(right);
  return `${result < 0 ? "-" : ""}${Math.floor(Math.abs(result) / 100)}.${String(
    Math.abs(result) % 100,
  ).padStart(2, "0")}`;
}

function nextPriority(rules: CategoryRule[]): number {
  return rules.length
    ? Math.max(...rules.map((rule) => rule.priority)) + 10
    : 10;
}
