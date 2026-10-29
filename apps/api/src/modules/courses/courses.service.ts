import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { CourseDto, CreateCourseInput, ErrorCode, ListCoursesQuery, Paginated, UpdateCourseInput } from '@lc/shared';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { Models } from '../../database/models';
import { Course } from '../../database/schemas/course.schema';
import { CourseLean, toCourseDto } from './courses.mapper';
import { isDuplicateKey } from '../../common/util/is-duplicate-key';
import { escapeRegex } from '../../common/util/escape-regex';

const SORTS = new Set(['code', 'name', 'createdAt']);

@Injectable()
export class CoursesService {
  constructor(@InjectModel(Models.Course) private readonly courses: Model<Course>) {}

  async list(q: ListCoursesQuery): Promise<Paginated<CourseDto>> {
    if (q.sort && !SORTS.has(q.sort.replace(/^[-+]/, ''))) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { sort: 'INVALID' } });
    }
    const filter: FilterQuery<Course> = {};
    if (q.status) filter.status = q.status;
    if (q.language) filter.language = q.language;
    if (q.q) {
      const re = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ code: re }, { name: re }];
    }
    const page = await paginate(this.courses, filter, { page: q.page, limit: q.limit, sort: q.sort });
    return { data: (page.data as unknown as CourseLean[]).map(toCourseDto), meta: page.meta };
  }

  async get(id: string): Promise<CourseDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const c = await this.courses.findById(id).lean();
    if (!c) throw new AppError(ErrorCode.NOT_FOUND);
    return toCourseDto(c as unknown as CourseLean);
  }

  async create(input: CreateCourseInput): Promise<CourseDto> {
    try {
      const doc = await this.courses.create(input);
      return toCourseDto(doc.toObject() as unknown as CourseLean);
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.CONFLICT, undefined, { fields: { code: 'DUPLICATE' } });
      throw e;
    }
  }

  async update(id: string, input: UpdateCourseInput): Promise<CourseDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const c = await this.courses.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
    if (!c) throw new AppError(ErrorCode.NOT_FOUND);
    return toCourseDto(c as unknown as CourseLean);
  }
}
