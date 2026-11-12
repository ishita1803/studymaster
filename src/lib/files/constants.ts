/**
 * Shared upload rules used by both the client form and the server extractor.
 * Keep this file free of Node-only imports so it can be bundled for the browser.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "20 MB";

export const ACCEPTED_EXTENSIONS = [
  "pdf",
  "docx",
  "txt",
  "md",
  "markdown",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export type AcceptedExtension = (typeof ACCEPTED_EXTENSIONS)[number];

export const IMAGE_EXTENSIONS: readonly AcceptedExtension[] = ["png", "jpg", "jpeg", "webp"];

export const UPLOAD_ACCEPT = [
  ...ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`),
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

export const UPLOAD_SUMMARY =
  "PDF, DOCX, TXT, MD, CSV or a photo/scan (PNG, JPG, WEBP)";

export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

export function isAcceptedFileName(name: string) {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

export function formatMegabytes(bytes: number) {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}
