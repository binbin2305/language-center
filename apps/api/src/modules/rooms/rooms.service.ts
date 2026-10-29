import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { CreateRoomInput, ErrorCode, ListRoomsQuery, Paginated, RoomDto, UpdateRoomInput } from '@lc/shared';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { Models } from '../../database/models';
import { Room } from '../../database/schemas/room.schema';
import { escapeRegex } from '../courses/courses.service';
import { RoomLean, toRoomDto } from './rooms.mapper';

const SORTS = new Set(['code', 'name', 'capacity', 'createdAt']);

function isDuplicateKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 11000;
}

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Models.Room) private readonly rooms: Model<Room>) {}

  async list(q: ListRoomsQuery): Promise<Paginated<RoomDto>> {
    if (q.sort && !SORTS.has(q.sort.replace(/^[-+]/, ''))) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { sort: 'INVALID' } });
    }
    const filter: FilterQuery<Room> = {};
    if (q.status) filter.status = q.status;
    if (q.q) {
      const re = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ code: re }, { name: re }];
    }
    const page = await paginate(this.rooms, filter, { page: q.page, limit: q.limit, sort: q.sort });
    return { data: (page.data as unknown as RoomLean[]).map(toRoomDto), meta: page.meta };
  }

  async get(id: string): Promise<RoomDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const r = await this.rooms.findById(id).lean();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND);
    return toRoomDto(r as unknown as RoomLean);
  }

  async create(input: CreateRoomInput): Promise<RoomDto> {
    try {
      const doc = await this.rooms.create(input);
      return toRoomDto(doc.toObject() as unknown as RoomLean);
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.CONFLICT, undefined, { fields: { code: 'DUPLICATE' } });
      throw e;
    }
  }

  async update(id: string, input: UpdateRoomInput): Promise<RoomDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const r = await this.rooms.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND);
    return toRoomDto(r as unknown as RoomLean);
  }
}
