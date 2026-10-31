import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApplyDiscountInput, DecideDiscountInput, ListInvoicesQuery, Role } from '@lc/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  // Declared before any ':id' route so 'discounts' is not captured as an id.
  @Get('discounts/pending')
  @Roles(Role.MANAGER)
  pending(@Query(new ZodValidationPipe(ListInvoicesQuery)) q: ListInvoicesQuery) {
    return this.svc.pendingDiscounts(q);
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
}
