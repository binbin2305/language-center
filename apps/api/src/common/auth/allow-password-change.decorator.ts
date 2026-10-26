import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'auth:allowPasswordChangeRequired';
/** Lets tokens with `mcp: true` (must change password) reach this handler/controller (the /auth/* controller). */
export const AllowPasswordChangeRequired = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
