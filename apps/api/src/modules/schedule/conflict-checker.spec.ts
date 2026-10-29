import { findSlotConflicts, overlaps, Slot } from './conflict-checker';

const at = (hhmm: string) => new Date(`2026-01-06T${hhmm}:00+07:00`);
const range = (s: string, e: string) => ({ startAt: at(s), endAt: at(e) });
const slot = (s: string, e: string, roomId: string, teacherId: string): Slot => ({ roomId, teacherId, ...range(s, e) });

describe('FR-SCH-03 Xung đột lịch', () => {
  describe('overlaps', () => {
    it.each([
      ['chồng hoàn toàn', '18:00', '19:30', '18:00', '19:30', true],
      ['chồng một phần đầu', '18:00', '19:30', '17:00', '18:30', true],
      ['chồng một phần cuối', '18:00', '19:30', '19:00', '20:00', true],
      ['nằm trong', '18:00', '21:00', '19:00', '20:00', true],
      ['liền kề 18:00-19:30 và 19:30-21:00 không xung đột', '18:00', '19:30', '19:30', '21:00', false],
      ['liền kề ngược chiều', '19:30', '21:00', '18:00', '19:30', false],
      ['tách rời', '08:00', '09:30', '18:00', '19:30', false],
    ])('%s', (_n, as, ae, bs, be, expected) => {
      expect(overlaps(range(as, ae), range(bs, be))).toBe(expected);
    });
  });

  describe('findSlotConflicts', () => {
    const cand = slot('18:00', '19:30', 'R1', 'T1');

    it('cùng phòng khác GV -> ROOM', () => {
      const ex = slot('18:30', '20:00', 'R1', 'T2');
      expect(findSlotConflicts(cand, [ex])).toEqual([{ slot: ex, kind: 'ROOM' }]);
    });
    it('cùng GV khác phòng -> TEACHER', () => {
      const ex = slot('18:30', '20:00', 'R2', 'T1');
      expect(findSlotConflicts(cand, [ex])).toEqual([{ slot: ex, kind: 'TEACHER' }]);
    });
    it('cùng phòng và cùng GV -> hai phần tử ROOM, TEACHER', () => {
      const ex = slot('18:30', '20:00', 'R1', 'T1');
      expect(findSlotConflicts(cand, [ex])).toEqual([
        { slot: ex, kind: 'ROOM' },
        { slot: ex, kind: 'TEACHER' },
      ]);
    });
    it('liền kề cùng phòng cùng GV -> không xung đột', () => {
      expect(findSlotConflicts(cand, [slot('19:30', '21:00', 'R1', 'T1')])).toEqual([]);
    });
    it('khác phòng khác GV -> không xung đột', () => {
      expect(findSlotConflicts(cand, [slot('18:30', '20:00', 'R2', 'T2')])).toEqual([]);
    });
    it('bỏ qua chính nó theo id', () => {
      const ex = { ...slot('18:00', '19:30', 'R1', 'T1'), id: 'S1' };
      expect(findSlotConflicts({ ...cand, id: 'S1' }, [ex])).toEqual([]);
    });
  });
});
