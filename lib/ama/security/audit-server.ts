import 'server-only'

import type { SecurityAuditSink } from './service'

export const amaSecurityAuditSink: SecurityAuditSink = {
  write(event) {
    console.warn(JSON.stringify(event))
  },
}
