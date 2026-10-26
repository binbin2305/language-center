import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditAction, CreateUserInput, ErrorCode, Role } from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { AppError } from '../../common/errors/app-error';
import { Models } from '../../database/models';
import { Student } from '../../database/schemas/student.schema';
import { User, UserDoc } from '../../database/schemas/user.schema';
import { generateTempPassword, hashPassword } from '../auth/password';

function isDuplicateKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 11000;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly audit: AuditService,
  ) {}

  /** Creates the STUDENT login (username = student code, no email). The caller links `student.userId`. */
  async createStudentAccount(
    studentId: Types.ObjectId,
    code: string,
    s?: ClientSession,
  ): Promise<{ userId: Types.ObjectId; tempPassword: string }> {
    const student = await this.students.findById(studentId).session(s ?? null).select('fullName');
    if (!student) throw new AppError(ErrorCode.NOT_FOUND);
    const tempPassword = generateTempPassword();
    const [user] = await this.users.create(
      [
        {
          username: code,
          passwordHash: await hashPassword(tempPassword),
          fullName: student.fullName,
          role: Role.STUDENT,
          studentId,
          mustChangePassword: true,
        },
      ],
      { session: s },
    );
    return { userId: user._id, tempPassword };
  }

  /** Creates a non-student account (email is the username) with a temporary password. */
  async createStaff(input: CreateUserInput, actor: AuthUser): Promise<{ user: UserDoc; tempPassword: string }> {
    if (input.role === Role.STUDENT) throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { role: 'STUDENT' } });
    const email = input.email.trim().toLowerCase();
    const tempPassword = generateTempPassword();
    let user: UserDoc;
    try {
      user = await this.users.create({
        email,
        username: email,
        passwordHash: await hashPassword(tempPassword),
        fullName: input.fullName,
        ...(input.phone ? { phone: input.phone } : {}),
        role: input.role,
        mustChangePassword: true,
        ...(input.role === Role.TEACHER && input.teacherProfile ? { teacherProfile: input.teacherProfile } : {}),
      });
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.CONFLICT, undefined, { fields: { email: 'DUPLICATE' } });
      throw e;
    }
    await this.audit.log({
      actor,
      action: AuditAction.CREATE,
      entity: Models.User,
      entityId: user._id,
      after: { username: user.username, email: user.email, fullName: user.fullName, role: user.role },
    });
    return { user, tempPassword };
  }
}
