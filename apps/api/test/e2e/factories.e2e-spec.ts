import { CounterService } from '../../src/common/db/counter.service';
import { makeClass, makeCourse, makeInvoice, makePayment, makeRoom, makeStudent, models } from '../factories';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('test factories', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('mã HV của factory không trùng mã do CounterService sinh cho 2026', async () => {
    const counter = t.app.get(CounterService);
    const fromFactory = await makeStudent(t.conn);
    const n = Number(fromFactory.code.slice(-5));
    const serviceCode = counter.formatCode('HV', '2026', n, 5);
    expect(serviceCode).not.toBe(fromFactory.code);
    // A service-generated student with the same sequence number must insert cleanly.
    await expect(makeStudent(t.conn, { code: serviceCode })).resolves.toBeDefined();
  });

  it('mã HD/PT/lớp/khóa/phòng của factory nằm ngoài namespace của service', async () => {
    const invoice = await makeInvoice(t.conn);
    const payment = await makePayment(t.conn, { invoiceId: invoice._id });
    expect(invoice.code).toMatch(/^HD1999\d{2}\d{4}$/);
    expect(payment.code).toMatch(/^PT1999\d{2}\d{4}$/);
    expect((await makeStudent(t.conn)).code).toMatch(/^HV1999\d{5}$/);
    expect((await makeClass(t.conn)).code).toMatch(/^F-/);
    expect((await makeCourse(t.conn)).code).toMatch(/^F-/);
    expect((await makeRoom(t.conn)).code).toMatch(/^F-/);
    expect(await models(t.conn).Invoice.countDocuments({ code: /^HD2026/ })).toBe(0);
  });
});
