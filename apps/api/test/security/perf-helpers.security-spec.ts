import { Types } from 'mongoose';
import { captureQueries, hasCollscan, p95 } from '../perf/explain';
import { models } from '../factories';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Helpers of the NFR-02 perf run (test/perf/p95.ts, D36): percentile and COLLSCAN detection. */
describe('NFR-02 perf helpers', () => {
  describe('p95', () => {
    it('p95([1..100]) = 95 (phần tử ceil(0.95·n)−1 sau sắp tăng, kể cả khi đầu vào không sắp)', () => {
      const ms = Array.from({ length: 100 }, (_, i) => 100 - i);
      expect(p95(ms)).toBe(95);
      expect(ms[0]).toBe(100); // input is not mutated
    });

    it('p95([5]) = 5', () => {
      expect(p95([5])).toBe(5);
    });
  });

  describe('captureQueries + hasCollscan (explain queryPlanner)', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp();
      await models(t.conn).Room.insertMany(
        Array.from({ length: 20 }, (_, i) => ({ code: `PH${i}`, name: `Phòng ${i}`, capacity: 10 + i })),
      );
    });
    afterAll(async () => {
      await t.close();
    });

    it('find trên field không index (rooms.name) → bắt được query, hasCollscan = true', async () => {
      const qs = await captureQueries(() => models(t.conn).Room.find({ name: 'Phòng 3' }).lean().exec());
      const find = qs.find((q) => q.collection === 'rooms' && q.method === 'find');
      expect(find).toBeDefined();
      expect(await hasCollscan(t.conn, find!)).toBe(true);
    });

    it('find theo _id → hasCollscan = false', async () => {
      const qs = await captureQueries(() => models(t.conn).Room.find({ _id: new Types.ObjectId() }).lean().exec());
      const find = qs.find((q) => q.collection === 'rooms' && q.method === 'find');
      expect(find).toBeDefined();
      expect(await hasCollscan(t.conn, find!)).toBe(false);
    });

    it('aggregate $match trên field không index → true; $match theo code (index unique) → false', async () => {
      const scan = await captureQueries(() => models(t.conn).Room.aggregate([{ $match: { capacity: 12 } }, { $limit: 5 }]).exec());
      const ix = await captureQueries(() => models(t.conn).Room.aggregate([{ $match: { code: 'PH3' } }]).exec());
      expect(await hasCollscan(t.conn, scan.find((q) => q.method === 'aggregate')!)).toBe(true);
      expect(await hasCollscan(t.conn, ix.find((q) => q.method === 'aggregate')!)).toBe(false);
    });

    it('countDocuments trên field không index → true; sau captureQueries debug được tắt (không bắt thêm)', async () => {
      const qs = await captureQueries(() => models(t.conn).Room.countDocuments({ capacity: { $gt: 15 } }).exec());
      const count = qs.find((q) => q.collection === 'rooms');
      expect(count).toBeDefined();
      expect(await hasCollscan(t.conn, count!)).toBe(true);
      const before = qs.length;
      await models(t.conn).Room.find({}).lean().exec();
      expect(qs.length).toBe(before);
    });
  });
});
