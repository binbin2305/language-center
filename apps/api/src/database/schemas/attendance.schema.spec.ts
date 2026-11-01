import { model, Types } from 'mongoose';
import { AttendanceStatus } from '@lc/shared';
import { AttendanceSchema } from './attendance.schema';

describe('AttendanceSchema (R14)', () => {
  const Attendance = model('AttendanceSchemaSpec', AttendanceSchema);
  const base = {
    sessionId: new Types.ObjectId(),
    classId: new Types.ObjectId(),
    startAt: new Date('2026-01-06T02:00:00Z'),
    studentId: new Types.ObjectId(),
    enrollmentId: new Types.ObjectId(),
    status: AttendanceStatus.PRESENT,
  };

  it('FR-ATT-02: history.from = null (lần điểm danh đầu) hợp lệ khi validate document', () => {
    const doc = new Attendance({
      ...base,
      history: [{ from: null, to: AttendanceStatus.PRESENT, by: new Types.ObjectId(), at: new Date() }],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('history.to vẫn bắt buộc', () => {
    const doc = new Attendance({ ...base, history: [{ from: null, by: new Types.ObjectId(), at: new Date() }] });
    expect(doc.validateSync()?.errors['history.0.to']).toBeDefined();
  });

  it('FR-ATT-04 R12: startAt (giờ buổi, denormalized) bắt buộc', () => {
    const { startAt: _omit, ...rest } = base;
    void _omit;
    expect(new Attendance(rest).validateSync()?.errors.startAt).toBeDefined();
  });
});
