/** Shared collection rules for the document previews and full browser. */
export const DOCUMENT_COLLECTIONS = [
  { id: "explainers", title: "Explainers" },
  { id: "plans", title: "Plans" },
];

export function isCollectionType(type, collection) {
  const normalized = String(type || "").trim().toLowerCase();
  if (collection === "explainers") return normalized === "explainer";
  if (collection === "plans") return /\bspecifications?$/.test(normalized);
  return false;
}
