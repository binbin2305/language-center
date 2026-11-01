import { PipelineStage, Types } from 'mongoose';
import { captureQueries, hasCollscan, isExplainable, p95, planHasCollscan } from '../perf/explain';
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

  describe('planHasCollscan (kế hoạch dựng tay)', () => {
    const ix = (name: string) => ({ stage: 'IXSCAN', indexName: name });
    it('COLLSCAN lồng sâu trong inputStage → inputStages (OR) → true', () => {
      const plan = { queryPlanner: { winningPlan: { stage: 'LIMIT', inputStage: { stage: 'FETCH', inputStage: { stage: 'OR', inputStages: [ix('a_1'), { stage: 'COLLSCAN' }] } } } } };
      expect(planHasCollscan(plan)).toBe(true);
    });
    it('$or SORT_MERGE có một nhánh COLLSCAN → true; hai nhánh IXSCAN → false', () => {
      const merge = (kids: unknown[]) => ({ queryPlanner: { winningPlan: { stage: 'FETCH', inputStage: { stage: 'SORT_MERGE', inputStages: kids } } } });
      expect(planHasCollscan(merge([ix('a_1'), { stage: 'COLLSCAN' }]))).toBe(true);
      expect(planHasCollscan(merge([ix('a_1'), ix('b_1')]))).toBe(false);
    });
    it('SBE EQ_LOOKUP strategy HashJoin / NestedLoopJoin → true (quét collection ngoài)', () => {
      for (const strategy of ['HashJoin', 'NestedLoopJoin']) {
        const plan = { queryPlanner: { winningPlan: { queryPlan: { stage: 'EQ_LOOKUP', foreignCollection: 'db.sessions', strategy, inputStage: { stage: 'FETCH', inputStage: ix('a_1') } } } } };
        expect({ strategy, scan: planHasCollscan(plan) }).toEqual({ strategy, scan: true });
      }
    });
    it('SBE EQ_LOOKUP strategy IndexedLoopJoin trên IXSCAN → false', () => {
      const plan = { queryPlanner: { winningPlan: { queryPlan: { stage: 'EQ_LOOKUP', strategy: 'IndexedLoopJoin', indexName: '_id_', inputStage: { stage: 'FETCH', inputStage: ix('a_1') } } } } };
      expect(planHasCollscan(plan)).toBe(false);
    });
    it('COLLSCAN chỉ nằm trong rejectedPlans → false', () => {
      const plan = { queryPlanner: { winningPlan: { stage: 'FETCH', inputStage: ix('a_1') }, rejectedPlans: [{ stage: 'COLLSCAN' }] } };
      expect(planHasCollscan(plan)).toBe(false);
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

    describe('phía collection ngoài của $lookup / $unionWith / $facet', () => {
      const agg = async (pipeline: PipelineStage[]) => {
        const qs = await captureQueries(() => models(t.conn).Room.aggregate(pipeline).exec());
        return hasCollscan(t.conn, qs.find((q) => q.method === 'aggregate')!);
      };
      const local = { $match: { code: 'PH3' } };
      it('$lookup localField/foreignField trên field ngoài không index (name) → true; foreignField _id / code (index) → false', async () => {
        expect(await agg([local, { $lookup: { from: 'rooms', localField: 'name', foreignField: 'name', as: 'x' } }])).toBe(true);
        expect(await agg([local, { $lookup: { from: 'rooms', localField: '_id', foreignField: '_id', as: 'x' } }])).toBe(false);
        expect(await agg([local, { $lookup: { from: 'rooms', localField: 'code', foreignField: 'code', as: 'x' } }])).toBe(false);
      });
      it('$lookup let + pipeline lọc field không index → true; lọc theo code (index) → false', async () => {
        const lookup = (field: string) => ({ $lookup: { from: 'rooms', let: { v: `$${field}` }, pipeline: [{ $match: { $expr: { $eq: [`$${field}`, '$$v'] } } }], as: 'x' } });
        expect(await agg([local, lookup('name')])).toBe(true);
        expect(await agg([local, lookup('code')])).toBe(false);
      });
      it('$unionWith pipeline không index → true; theo code → false', async () => {
        expect(await agg([local, { $unionWith: { coll: 'rooms', pipeline: [{ $match: { capacity: 12 } }] } }])).toBe(true);
        expect(await agg([local, { $unionWith: { coll: 'rooms', pipeline: [{ $match: { code: 'PH1' } }] } }])).toBe(false);
      });
      it('$lookup không index nằm trong $facet → true', async () => {
        expect(await agg([local, { $facet: { rows: [{ $lookup: { from: 'rooms', localField: 'name', foreignField: 'name', as: 'x' } }] } }])).toBe(true);
      });
    });

    it('estimatedDocumentCount (R11, đếm theo metadata) → bắt được, isExplainable = true, hasCollscan = false', async () => {
      const qs = await captureQueries(() => models(t.conn).Room.estimatedDocumentCount().exec());
      const count = qs.find((q) => q.collection === 'rooms' && q.method === 'estimatedDocumentCount');
      expect(count).toBeDefined();
      expect(isExplainable(count!)).toBe(true);
      expect(await hasCollscan(t.conn, count!)).toBe(false);
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
