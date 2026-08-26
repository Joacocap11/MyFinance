import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { Account, Category, Movement } from "../api/types";
import {
  categoryPath,
  formatDate,
  kindLabels,
  signedMoney,
} from "../lib/format";
import { StatusPill } from "./ui";

export function MovementRow({
  movement,
  accounts,
  categories,
  onSelect,
}: {
  movement: Movement;
  accounts: Account[];
  categories: Category[];
  onSelect?: (movement: Movement) => void;
}) {
  const account = accounts.find((item) => item.id === movement.account_id);
  const category = categories.find((item) => item.id === movement.category_id);
  const Icon =
    movement.kind === "expense"
      ? ArrowUpRight
      : movement.kind === "income"
        ? ArrowDownLeft
        : ArrowLeftRight;
  const content = (
    <>
      <span className={`movement-icon movement-icon--${movement.kind}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="movement-row__main">
        <strong>{movement.description || kindLabels[movement.kind]}</strong>
        <span>
          {category
            ? categoryPath(category, categories)
            : movement.kind === "transfer"
              ? "Entre cuentas"
              : "Sin categoría"}{" "}
          · {account?.name ?? "Cuenta"}
        </span>
      </span>
      <span className="movement-row__meta">
        <strong className={`amount amount--${movement.kind}`}>
          {signedMoney(movement, account)}
        </strong>
        <span>{formatDate(movement.date)}</span>
      </span>
      {movement.is_voided ? (
        <StatusPill tone="danger">Anulado</StatusPill>
      ) : null}
    </>
  );
  return onSelect ? (
    <button
      type="button"
      className="movement-row movement-row--button"
      onClick={() => onSelect(movement)}
    >
      {content}
    </button>
  ) : (
    <div className="movement-row">{content}</div>
  );
}
