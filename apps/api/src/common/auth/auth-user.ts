import { Types } from 'mongoose';
import { Role } from '@lc/shared';

export type AuthUser = { id: Types.ObjectId; role: Role; studentId?: Types.ObjectId };
