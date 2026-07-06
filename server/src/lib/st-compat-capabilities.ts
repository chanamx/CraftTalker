export type StCompatCapabilityId =
  | 'extension-management'
  | 'image-backend-proxy'
  | 'network-proxy'
  | 'unsafe-script-runtime'

export interface BlockedCompatCapabilityOptions {
  capabilityId: StCompatCapabilityId
  feature: string
  reason: string
  status?: number
  trustRequirement?: string
  details?: Record<string, unknown>
}

export function createBlockedCompatCapability(options: BlockedCompatCapabilityOptions) {
  const trustRequirement = options.trustRequirement
    ?? 'Enable this only through an explicit trusted compatibility boundary.'

  return {
    success: false,
    blocked: true,
    capabilityId: options.capabilityId,
    capability_id: options.capabilityId,
    feature: options.feature,
    reason: options.reason,
    trustRequired: true,
    trust_required: true,
    trustRequirement,
    trust_requirement: trustRequirement,
    error: `${options.feature} is blocked in the CraftTalker compatibility runtime: ${options.reason}`,
    details: options.details,
  }
}
