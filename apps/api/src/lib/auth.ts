import { requireAuth } from '@clerk/express';
import { NextFunction, Request, Response } from 'express';

// Middleware to ensure user is authenticated via Clerk
export const requireAuthMw = requireAuth();

// Extended request type for role-based routes
export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    sessionClaims?: any;
  };
}

// Helper to extract role from session claims (publicMetadata)
export const getRole = (req: AuthenticatedRequest): string | null => {
  if (!req.auth || !req.auth.sessionClaims) return null;
  // Clerk puts public metadata in session claims if configured,
  // or we can fetch the user if needed.
  // For simplicity, we assume role is passed in metadata claims.
  const metadata = req.auth.sessionClaims.metadata as Record<string, any>;
  return metadata?.role || null;
};

// Role-based middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // We first ensure they are authenticated
    if (!req.auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const role = getRole(req);
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};
