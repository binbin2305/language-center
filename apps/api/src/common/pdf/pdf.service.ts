import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake') as {
  setLocalAccessPolicy(cb: (path: string) => boolean): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  addFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(def: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};


const fontDir = join(require.resolve('pdfmake/package.json'), '..', 'fonts', 'Roboto');
// Fonts load from the bundled dir only; documents may not read other local files.
pdfmake.setLocalAccessPolicy((path) => path.startsWith(fontDir));
pdfmake.setUrlAccessPolicy(() => false);
// Roboto carries Vietnamese glyphs; pdfmake bundles it.
pdfmake.addFonts({
  Roboto: {
    normal: join(fontDir, 'Roboto-Regular.ttf'),
    bold: join(fontDir, 'Roboto-Medium.ttf'),
    italics: join(fontDir, 'Roboto-Italic.ttf'),
    bolditalics: join(fontDir, 'Roboto-MediumItalic.ttf'),
  },
});

@Injectable()
export class PdfService {
  async render(def: TDocumentDefinitions): Promise<Buffer> {
    const doc = { ...def, defaultStyle: { font: 'Roboto', ...def.defaultStyle } };
    return Buffer.from(await pdfmake.createPdf(doc).getBuffer());
  }
}
