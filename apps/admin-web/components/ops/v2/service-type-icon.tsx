import { Bus, Building2, Ticket, UserRound, Utensils, Package, CircleDot } from 'lucide-react';

// Ops-DG-1: covers the operationType vocabulary the grid already sends (serviceType is
// operationType-first on the backend). Unknown values still fall back to CircleDot.
const ICONS: Record<string, typeof Bus> = {
  // Transport / transfers
  TRANSPORT: Bus,
  AIRPORT_TRANSFER: Bus,
  POINT_TO_POINT: Bus,
  ROUTE_TRANSFER: Bus,
  FULL_DAY: Bus,
  // Accommodation
  HOTEL: Building2,
  // People
  GUIDE: UserRound,
  // Tickets / activities / entrances
  ACTIVITY: Ticket,
  JEEP_TOUR: Ticket,
  ENTRANCE: Ticket,
  TICKET: Ticket,
  // Dining
  MEAL: Utensils,
  DINING: Utensils,
  RESTAURANT: Utensils,
  // Packages
  EXTERNAL_PACKAGE: Package,
};

/** Maps an operations serviceType/operationType to a lucide icon (decorative). */
export function ServiceTypeIcon({ serviceType, className }: { serviceType: string; className?: string }) {
  const Icon = ICONS[String(serviceType || '').toUpperCase()] ?? CircleDot;
  return <Icon className={className ?? 'size-4 text-muted-foreground'} aria-hidden="true" />;
}
