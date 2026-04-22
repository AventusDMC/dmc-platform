export type ServiceTypeOption = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

export function formatServiceTypeLabel(serviceType: Pick<ServiceTypeOption, 'name' | 'code'>) {
  return serviceType.code ? `${serviceType.name} (${serviceType.code})` : serviceType.name;
}
