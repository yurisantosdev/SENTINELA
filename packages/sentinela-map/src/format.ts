export function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatRate(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
