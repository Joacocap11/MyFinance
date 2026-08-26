export function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function parseMoney(value: string): string {
  const token = value
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "");
  if (!/^[+-]?\d[\d.,]*$/.test(token)) throw new Error("Importe inválido");
  const sign = token.startsWith("-") ? "-" : "";
  const unsigned = token.replace(/^[+-]/, "");
  const commas = [...unsigned.matchAll(/,/g)].map((match) => match.index ?? 0);
  const dots = [...unsigned.matchAll(/\./g)].map((match) => match.index ?? 0);
  let integer = unsigned;
  let fraction = "";
  if (commas.length && dots.length) {
    const decimal = commas.at(-1)! > dots.at(-1)! ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    const parts = unsigned.split(decimal);
    const decimalPart = parts[1] ?? "";
    if (parts.length !== 2 || decimalPart.length < 1 || decimalPart.length > 2)
      throw new Error("Importe inválido");
    integer = parts[0] ?? "";
    fraction = decimalPart;
    if (integer.includes(grouping)) {
      const groups = integer.split(grouping);
      if (
        !/^[1-3]\d{0,2}$/.test(groups[0] ?? "") ||
        groups.slice(1).some((part) => !/^\d{3}$/.test(part))
      )
        throw new Error("Importe inválido");
      integer = groups.join("");
    }
  } else if (commas.length || dots.length) {
    const separator = commas.length ? "," : ".";
    const parts = unsigned.split(separator);
    const decimalPart = parts[1] ?? "";
    if (parts.length > 2) {
      if (
        parts.some((part, index) =>
          index === 0 ? !/^\d{1,3}$/.test(part) : !/^\d{3}$/.test(part),
        )
      )
        throw new Error("Importe inválido");
      integer = parts.join("");
    } else if (decimalPart.length <= 2) {
      integer = parts[0] ?? "";
      fraction = decimalPart;
    } else if (decimalPart.length === 3 && (parts[0]?.length ?? 0) <= 3) {
      integer = parts.join("");
    } else {
      throw new Error("Importe inválido");
    }
  }
  if (!/^\d+$/.test(integer) || (fraction && !/^\d{1,2}$/.test(fraction)))
    throw new Error("Importe inválido");
  const normalized = `${integer}.${(fraction + "00").slice(0, 2)}`;
  return `${sign}${normalized}`;
}
