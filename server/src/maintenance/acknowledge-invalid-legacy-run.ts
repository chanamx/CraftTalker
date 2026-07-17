import {
  acknowledgeGenerationRunInvalidLegacy,
  auditGenerationRunAuthority,
} from '../services/run.service.js'

const runId = process.argv[2]
if (!runId) {
  throw new Error('Usage: npm run runs:acknowledge-invalid-legacy -- <runId>')
}

const acknowledgement = await acknowledgeGenerationRunInvalidLegacy(runId)
const audit = await auditGenerationRunAuthority()

console.log(JSON.stringify({
  acknowledgement,
  authorityAudit: {
    ok: audit.ok,
    invalidLegacyCount: audit.invalidLegacyCount,
    acknowledgedInvalidLegacyRunIds: audit.acknowledgedInvalidLegacyRunIds,
    issues: audit.issues,
    truncated: audit.truncated,
  },
}, null, 2))
