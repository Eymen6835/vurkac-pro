// Schreibvarianten derselben Stadt aus unterschiedlichen Portalen zusammenführen
const CITY_ALIASES: Record<string, string> = {
  Ludwigshafen: "Ludwigshafen am Rhein",
};

export function normalizeCity(city: string): string {
  const trimmed = (city ?? "").trim();
  return CITY_ALIASES[trimmed] ?? trimmed;
}
