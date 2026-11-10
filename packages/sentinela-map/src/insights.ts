import type { CatMetrics } from "./types";

export type InsightPlace = {
  id: string;
  name: string;
  total: number;
  deaths: number;
  typical: number;
  commute: number;
  disease: number;
  population: number;
  rate: number | null;
};

export type AccidentKind = "typical" | "commute" | "disease";

export const ACCIDENT_KINDS: { key: AccidentKind; label: string; hint: string; color: string }[] = [
  { key: "typical", label: "Típico", hint: "durante o trabalho", color: "#38bdf8" },
  { key: "commute", label: "Trajeto", hint: "no deslocamento", color: "#fbbf24" },
  { key: "disease", label: "Doença", hint: "doença relacionada ao trabalho", color: "#34d399" },
];

export type CompositionSlice = {
  key: AccidentKind | "other";
  label: string;
  hint: string;
  color: string;
  value: number;
  share: number;
};

export type InsightStory = {
  title: string;
  body: string;
};

export function pluralPlace(noun: "estado" | "município") {
  return noun === "estado" ? "estados" : "municípios";
}

export function placeFromMetrics(id: string, name: string, metrics: CatMetrics): InsightPlace {
  return { id, name, ...metrics };
}

export function lethality(deaths: number, total: number) {
  if (total <= 0) {
    return null;
  }
  return (deaths / total) * 100;
}

export function expectedCats(population: number, baselineRate: number | null) {
  if (baselineRate == null || population <= 0) {
    return null;
  }
  return (baselineRate * population) / 100_000;
}

export function compositionOf(metrics: Pick<CatMetrics, "total" | "typical" | "commute" | "disease">): CompositionSlice[] {
  const classified = metrics.typical + metrics.commute + metrics.disease;
  const other = Math.max(0, metrics.total - classified);
  const slices: CompositionSlice[] = ACCIDENT_KINDS.map((kind) => ({
    key: kind.key,
    label: kind.label,
    hint: kind.hint,
    color: kind.color,
    value: metrics[kind.key],
    share: metrics.total > 0 ? metrics[kind.key] / metrics.total : 0,
  }));

  if (other > 0) {
    slices.push({
      key: "other",
      label: "Outros",
      hint: "tipo não classificado nestas três categorias",
      color: "#94a3b8",
      value: other,
      share: metrics.total > 0 ? other / metrics.total : 0,
    });
  }

  return slices;
}

export function topByTotal(places: InsightPlace[], count: number) {
  const ranked = [...places].sort((left, right) => right.total - left.total);
  const total = places.reduce((sum, place) => sum + place.total, 0);
  const top = ranked.slice(0, count);
  const topTotal = top.reduce((sum, place) => sum + place.total, 0);
  return {
    total,
    top,
    share: total > 0 ? topTotal / total : 0,
  };
}

export function placesWithVolume(places: InsightPlace[], scopeTotal: number) {
  const floor = Math.max(40, Math.round(scopeTotal * 0.004));
  const eligible = places.filter((place) => place.total >= floor && place.rate != null);
  if (eligible.length >= 3) {
    return eligible;
  }
  return places.filter((place) => place.total > 0 && place.rate != null);
}

function highestRate(places: InsightPlace[]) {
  return places.reduce<InsightPlace | null>((best, place) => {
    if (place.rate == null) {
      return best;
    }
    if (!best || best.rate == null || place.rate > best.rate) {
      return place;
    }
    return best;
  }, null);
}

function highestTotal(places: InsightPlace[]) {
  return places.reduce<InsightPlace | null>((best, place) => {
    if (!best || place.total > best.total) {
      return place;
    }
    return best;
  }, null);
}

function kindShare(metrics: Pick<CatMetrics, "total" | "typical" | "commute" | "disease">, key: AccidentKind) {
  if (metrics.total <= 0) {
    return 0;
  }
  return metrics[key] / metrics.total;
}

export function buildStories(input: {
  scopeName: string;
  scope: CatMetrics;
  baselineName: string;
  baseline: CatMetrics | null;
  places: InsightPlace[];
  placeNoun: "estado" | "município";
  groups?: { name: string; metrics: CatMetrics }[];
}): InsightStory[] {
  if (input.scope.total <= 0) {
    return [
      {
        title: "Sem comunicações neste recorte",
        body: "A população do IBGE já entra na conta, mas não há CAT para ler taxa, tipo de acidente ou óbitos.",
      },
    ];
  }

  const stories: InsightStory[] = [];
  const comparable = input.baseline && input.baselineName !== input.scopeName ? input.baseline : null;
  const byRate = highestRate(input.places);
  const byVolume = highestTotal(input.places);

  if (byRate && byVolume && byRate.id !== byVolume.id && byRate.rate != null) {
    const volumeShare = input.scope.total > 0 ? byVolume.total / input.scope.total : 0;
    stories.push({
      title: "Volume e taxa contam histórias diferentes",
      body: `${byRate.name} tem a maior taxa deste recorte, ${formatRateInline(byRate.rate)} CAT por 100 mil habitantes. ${byVolume.name} concentra ${formatShareInline(volumeShare)} das comunicações (${formatCountInline(byVolume.total)}), com taxa de ${formatRateInline(byVolume.rate)}.`,
    });
  } else if (byRate?.rate != null) {
    stories.push({
      title: "Onde a taxa é mais alta",
      body: `${byRate.name} lidera este recorte, com ${formatRateInline(byRate.rate)} CAT por 100 mil habitantes e ${formatCountInline(byRate.total)} comunicações.`,
    });
  }

  if (comparable?.rate != null && input.scope.rate != null) {
    const expected = expectedCats(input.scope.population, comparable.rate);
    if (expected != null && expected > 0) {
      const gap = input.scope.total - expected;
      const relative = gap / expected;
      if (Math.abs(relative) < 0.05) {
        stories.push({
          title: `Perto da taxa do ${input.baselineName}`,
          body: `${input.scopeName} fica a menos de 5% da taxa de referência (${formatRateInline(comparable.rate)} por 100 mil). A diferença é de cerca de ${formatCountInline(Math.abs(Math.round(gap)))} comunicações.`,
        });
      } else {
        const direction = gap > 0 ? "a mais" : "a menos";
        stories.push({
          title: gap > 0 ? "Acima da referência nacional" : "Abaixo da referência nacional",
          body: `Se ${input.scopeName} tivesse a taxa do ${input.baselineName} (${formatRateInline(comparable.rate)}), seriam esperadas cerca de ${formatCountInline(Math.round(expected))} CAT. Há ${formatCountInline(Math.abs(Math.round(gap)))} ${direction}.`,
        });
      }
    }
  } else if (input.groups && input.groups.length > 1 && input.scope.rate != null) {
    const ranked = [...input.groups].filter((group) => group.metrics.rate != null);
    ranked.sort((left, right) => (right.metrics.rate ?? 0) - (left.metrics.rate ?? 0));
    const highest = ranked[0];
    const lowest = ranked[ranked.length - 1];
    if (highest && lowest && highest.name !== lowest.name && highest.metrics.rate != null && lowest.metrics.rate != null) {
      stories.push({
        title: "O Brasil não tem uma taxa só",
        body: `${highest.name} registra ${formatRateInline(highest.metrics.rate)} CAT por 100 mil. ${lowest.name} registra ${formatRateInline(lowest.metrics.rate)}. A média nacional, ${formatRateInline(input.scope.rate)}, fica entre esses extremos.`,
      });
    }
  }

  if (comparable) {
    const gaps = ACCIDENT_KINDS.map((kind) => ({
      label: kind.label.toLowerCase(),
      hint: kind.hint,
      delta: kindShare(input.scope, kind.key) - kindShare(comparable, kind.key),
    })).sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
    const standout = gaps[0];
    if (standout && Math.abs(standout.delta) >= 0.03) {
      const direction = standout.delta > 0 ? "acima" : "abaixo";
      stories.push({
        title: "A mistura dos acidentes muda",
        body: `A parcela de acidentes do tipo ${standout.label} (${standout.hint}) fica ${formatRateInline(Math.abs(standout.delta) * 100)} pontos percentuais ${direction} da parcela do ${input.baselineName}.`,
      });
    }
  }

  if (input.places.length >= 5) {
    const concentration = topByTotal(input.places, 3);
    if (concentration.share >= 0.35 && concentration.top.length === 3) {
      const names = concentration.top.map((place) => place.name).join(", ");
      stories.push({
        title: "Os casos se concentram",
        body: `${names} reúnem ${formatShareInline(concentration.share)} das comunicações deste recorte. Os demais ${pluralPlace(input.placeNoun)} dividem o restante.`,
      });
    }
  }

  const lethalPool = placesWithVolume(input.places, input.scope.total);
  const mostLethal = lethalPool.reduce<InsightPlace | null>((best, place) => {
    const score = lethality(place.deaths, place.total);
    if (score == null) {
      return best;
    }
    if (!best || score > (lethality(best.deaths, best.total) ?? 0)) {
      return place;
    }
    return best;
  }, null);

  if (mostLethal && mostLethal.deaths > 0 && stories.length < 4) {
    const score = lethality(mostLethal.deaths, mostLethal.total);
    stories.push({
      title: "Taxa alta não é o mesmo que mais óbitos",
      body: `Entre ${pluralPlace(input.placeNoun)} com volume relevante, ${mostLethal.name} tem a maior letalidade: ${formatRateInline(score)}% das comunicações indicam óbito (${formatCountInline(mostLethal.deaths)} de ${formatCountInline(mostLethal.total)}).`,
    });
  }

  return stories.slice(0, 4);
}

function formatCountInline(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatRateInline(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function formatShareInline(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}
