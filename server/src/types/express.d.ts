import type { Role } from "../generated/prisma/enums.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerifiedAt: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
      sessionId?: string;
    }
  }
}
