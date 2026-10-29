import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { DuplicateMatchDto, LeadStatus } from '@lc/shared';
import { Models } from '../../database/models';
import { Lead } from '../../database/schemas/lead.schema';
import { Student } from '../../database/schemas/student.schema';

interface Candidate {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  email?: string | null;
  status: string;
  code?: string;
}

/** Finds existing leads/students that look like the same person (D3, D10). Phone must already be normalised. */
@Injectable()
export class DuplicatesService {
  constructor(
    @InjectModel(Models.Lead) private readonly leads: Model<Lead>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
  ) {}

  async find(
    input: { phone: string; email?: string | null },
    exclude: { leadId?: Types.ObjectId; studentId?: Types.ObjectId } = {},
  ): Promise<DuplicateMatchDto[]> {
    const email = input.email?.trim().toLowerCase() || null;
    const or: Array<Record<string, string>> = [{ phone: input.phone }];
    if (email) or.push({ email });

    const leadFilter: FilterQuery<Lead> = { $or: or, status: { $ne: LeadStatus.CANCELLED }, deletedAt: null };
    if (exclude.leadId) leadFilter._id = { $ne: exclude.leadId };
    const studentFilter: FilterQuery<Student> = { $or: or, deletedAt: null };
    if (exclude.studentId) studentFilter._id = { $ne: exclude.studentId };

    const [leads, students] = await Promise.all([
      this.leads.find(leadFilter).sort({ _id: 1 }).lean(),
      this.students.find(studentFilter).sort({ _id: 1 }).lean(),
    ]);

    const toMatch = (kind: 'LEAD' | 'STUDENT', c: Candidate): DuplicateMatchDto => {
      const matchedOn: Array<'phone' | 'email'> = [];
      if (c.phone === input.phone) matchedOn.push('phone');
      if (email && c.email?.toLowerCase() === email) matchedOn.push('email');
      return {
        kind,
        id: c._id.toString(),
        fullName: c.fullName,
        phone: c.phone,
        email: c.email ?? null,
        ...(kind === 'STUDENT' && c.code ? { code: c.code } : {}),
        status: c.status,
        matchedOn,
      };
    };
    return [
      ...(leads as unknown as Candidate[]).map((c) => toMatch('LEAD', c)),
      ...(students as unknown as Candidate[]).map((c) => toMatch('STUDENT', c)),
    ];
  }
}
