// eslint-disable-next-line @typescript-eslint/no-require-imports
const parse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;

/** Extracts the text of a PDF buffer (test helper). */
export async function pdfText(buf: Buffer): Promise<string> {
  return (await parse(buf)).text;
}
