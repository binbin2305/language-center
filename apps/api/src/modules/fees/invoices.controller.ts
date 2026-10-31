import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApplyDiscountInput, CreateInvoiceInput, DecideDiscountInput, ListInvoicesQuery, RecordPaymentInput, Role, VoidInvoiceInput } from '@lc/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly svc: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ListInvoicesQuery)) q: ListInvoicesQuery) {
    return this.svc.list(q, user);
  }

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateInvoiceInput)) input: CreateInvoiceInput) {
    return { data: await this.svc.createSurcharge(input, user) };
  }

  // Declared before any ':id' route so 'discounts' is not captured as an id.
  @Get('discounts/pending')
  @Roles(Role.MANAGER)
  pending(@Query(new ZodValidationPipe(ListInvoicesQuery)) q: ListInvoicesQuery) {
    return this.svc.pendingDiscounts(q);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  async detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.get(id, user) };
  }

  @Post(':id/discount')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async applyDiscount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApplyDiscountInput)) input: ApplyDiscountInput,
  ) {
    return { data: await this.svc.applyDiscount(id, input, user) };
  }

  @Post(':id/discount/decision')
  @HttpCode(200)
  @Roles(Role.MANAGER)
  async decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DecideDiscountInput)) input: DecideDiscountInput,
  ) {
    return { data: await this.svc.decideDiscount(id, input, user) };
  }

  @Post(':id/payments')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async record(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordPaymentInput)) input: RecordPaymentInput,
  ) {
    return { data: await this.payments.record(id, input, user) };
  }

  @Post(':id/void')
  @HttpCode(200)
  @Roles(Role.MANAGER)
  async voidInvoice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(VoidInvoiceInput)) input: VoidInvoiceInput,
  ) {
    return { data: await this.payments.voidInvoice(id, input, user) };
  }
}
