import { pdfText } from '../../../test/helpers/pdf-text';
import { PdfService } from './pdf.service';

describe('PdfService', () => {
  it('render PDF có dấu tiếng Việt, đọc lại được', async () => {
    const buf = await new PdfService().render({ content: 'Nguyễn Văn Ánh' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(await pdfText(buf)).toContain('Nguyễn Văn Ánh');
  });
});
