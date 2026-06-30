import { Bus, Building2, Ticket, UserRound, Utensils, Package, CircleDot } from 'lucide-react';

const ICONS: Record<string, typeof Bus> = {
  TRANSPORT: Bus,
  HOTEL: Building2,
  GUIDE: UserRound,
  ACTIVITY: Ticket,
  TICKET: Ticket,
  DINING: Utensils,
  RESTAURANT: Utensils,
  EXTERNAL_PACKAGE: Package,
};

/** Maps an operations serviceType to a lucide icon (decorative). */
export function ServiceTypeIcon({ serviceType, className }: { serviceType: string; className?: string }) {
  const Icon = ICONS[String(serviceType || '').toUpperCase()] ?? CircleDot;
  return <Icon className={className ?? 'size-4 text-muted-foreground'} aria-hidden="true" />;
}
