// Re-export the shared lib helpers so existing imports in the admin pages
// keep working unchanged. Phase 2A consolidated this logic into
// apps/admin-web/app/lib/route-standards.ts so the auto-builder and the
// admin pages share the same presentation source.
export {
  classifyRouteTimingConfidence,
  presentRouteTimingConfidence as computeTimingConfidenceLabel,
  type TimingConfidenceLabel,
  type TimingConfidencePresentation,
} from '../lib/route-standards';
