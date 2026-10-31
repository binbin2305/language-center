import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatVnd, PaymentMethod } from '@lc/shared';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
};

export interface ReceiptData {
  code: string;
  invoiceCode: string;
  studentName: string;
  studentCode: string;
  amount: number;
  method: PaymentMethod;
  paidOn: string;
  recordedBy: string;
  voided: boolean;
}

/** Text and tables only: PdfService denies image / URL access. */
export function receiptDefinition(d: ReceiptData): TDocumentDefinitions {
  const row = (k: string, v: string) => [{ text: k, bold: true }, v];
  return {
    pageSize: 'A5',
    content: [
      { text: 'PHIẾU THU', fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
      ...(d.voided ? [{ text: 'ĐÃ HỦY', alignment: 'center' as const, bold: true, margin: [0, 0, 0, 8] as [number, number, number, number] }] : []),
      {
        table: {
          widths: [110, '*'],
          body: [
            row('Mã phiếu thu', d.code),
            row('Hóa đơn', d.invoiceCode),
            row('Học viên', `${d.studentName} (${d.studentCode})`),
            row('Số tiền', formatVnd(d.amount)),
            row('Hình thức', METHOD_LABEL[d.method] ?? d.method),
            row('Ngày thu', d.paidOn),
            row('Người thu', d.recordedBy),
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
  };
}
