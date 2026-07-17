interface MfaAccessInput {
  hasAdminPermission: boolean
  mustChangePassword: boolean
  requestedDestination?: string
}

export function canOpenMfaFlow({ hasAdminPermission, mustChangePassword, requestedDestination }: MfaAccessInput) {
  return hasAdminPermission || (mustChangePassword && requestedDestination === '/parola-degistir')
}

export function canEnrollTotp(hasAdminPermission: boolean) {
  return hasAdminPermission
}

