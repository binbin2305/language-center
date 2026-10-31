import { OUTSTANDING_CHECKER, OutstandingChecker } from '../../src/common/contracts/outstanding-checker';
import { FeesModule } from '../../src/modules/fees/fees.module';
import { makeInvoice, makeStudent } from '../factories';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

describe('F-05 OutstandingChecker (FEES_OUTSTANDING)', () => {
  let t: TestApp;
  let checker: OutstandingChecker;

  beforeAll(async () => {
    t = await createTestApp();
    // The global no-op still wins at root until merge; resolve FeesModule's own provider.
    checker = t.app.select(FeesModule).get<OutstandingChecker>(OUTSTANDING_CHECKER);
  });
  beforeEach(() => t.clock.set(DEFAULT_NOW));
  afterAll(async () => {
    await t.close();
  });

  const day = (d: string) => new Date(`${d}T00:00:00+07:00`);

  it('hasOverdueBalance true khi một hóa đơn quá hạn còn nợ', async () => {
    const st = await makeStudent(t.conn);
    await makeInvoice(t.conn, { studentId: st._id, dueDate: day('2026-01-12') });
    await makeInvoice(t.conn, { studentId: st._id, dueDate: day('2026-01-04') });
    expect(await checker.hasOverdueBalance(st._id)).toBe(true);
  });

  it('hasOverdueBalance false khi PAID, VOID, hoặc dueDate hôm nay', async () => {
    const st = await makeStudent(t.conn);
    await makeInvoice(t.conn, { studentId: st._id, dueDate: day('2026-01-01'), status: 'PAID', balance: 0, amountPaid: 3_000_000 });
    await makeInvoice(t.conn, { studentId: st._id, dueDate: day('2026-01-01'), status: 'VOID' });
    await makeInvoice(t.conn, { studentId: st._id, dueDate: day('2026-01-05') });
    expect(await checker.hasOverdueBalance(st._id)).toBe(false);
    t.clock.set(new Date('2026-01-05T17:00:00Z')); // 00:00 VN 06/01 -> today's invoice now overdue
    expect(await checker.hasOverdueBalance(st._id)).toBe(true);
  });

  it('hóa đơn HV khác không ảnh hưởng', async () => {
    const st = await makeStudent(t.conn);
    await makeInvoice(t.conn, { dueDate: day('2026-01-01') });
    expect(await checker.hasOverdueBalance(st._id)).toBe(false);
  });
});
