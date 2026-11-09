export function safeJsonLd(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
  } catch {
    throw new Error("No se pudo serializar JSON-LD");
  }
}

export function safeCdata(text: string): string {
  if (text.includes("]]>")) {
    throw new Error("CDATA no puede contener ]]>");
  }
  return text;
}
