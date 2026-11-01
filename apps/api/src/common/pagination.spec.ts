import { isEmptyFilter } from './pagination';

describe('NFR-02 isEmptyFilter (R11: tổng của bộ lọc rỗng dùng estimatedDocumentCount)', () => {
  it.each([[{}], [{ $and: [] }], [{ $and: [{}, { $and: [] }] }]])('%j là rỗng', (f) => {
    expect(isEmptyFilter(f)).toBe(true);
  });
  it.each([[{ deletedAt: null }], [{ $and: [{ deletedAt: null }] }], [{ $and: [{}], status: 'X' }], [{ $or: [] }]])('%j không rỗng', (f) => {
    expect(isEmptyFilter(f)).toBe(false);
  });
});
