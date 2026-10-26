import type { MeDto, Role } from '@lc/shared';

export function makeUser(role: Role, over: Partial<MeDto> = {}): MeDto {
  return {
    id: '650000000000000000000001',
    username: `${role.toLowerCase()}@center.local`,
    fullName: `Test ${role}`,
    role,
    mustChangePassword: false,
    ...over,
  };
}
