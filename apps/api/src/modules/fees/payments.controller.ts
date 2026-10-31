import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Role, VoidPaymentInput } from '@lc/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Post(':id/void')
  @HttpCode(200)
  @Roles(Role.MANAGER)
  async void(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(VoidPaymentInput)) input: VoidPaymentInput,
  ) {
    return { data: await this.svc.voidPayment(id, input, user) };
  }
}
