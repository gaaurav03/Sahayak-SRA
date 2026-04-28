export const COORDINATOR_ADMIN_EMAIL = "gaurav21687@gmail.com";

export function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}

export function isCoordinatorAdminEmail(email: string | null | undefined) {
  return normalizeEmail(email) === COORDINATOR_ADMIN_EMAIL;
}
