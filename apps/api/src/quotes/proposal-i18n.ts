// Phase 3A — proposal language foundation. Static label dictionary + locale
// helpers for the multilingual client proposal (en/pt/es/ar). English entries
// MUST match the previous hardcoded strings exactly so English proposals render
// unchanged. NO POI narrative composition here — that is Phase 3B.

export const PROPOSAL_LOCALES = ['en', 'pt', 'es', 'ar'] as const;
export type ProposalLocale = (typeof PROPOSAL_LOCALES)[number];

export function resolveProposalLanguage(value: string | null | undefined): ProposalLocale {
  const normalized = String(value || '').trim().toLowerCase();
  return (PROPOSAL_LOCALES as readonly string[]).includes(normalized) ? (normalized as ProposalLocale) : 'en';
}

// Intl locale used for date/number formatting. English maps to en-US so the
// existing English output is byte-identical.
const INTL_LOCALE: Record<ProposalLocale, string> = {
  en: 'en-US',
  pt: 'pt-PT',
  es: 'es-ES',
  ar: 'ar',
};

export function intlLocale(locale: ProposalLocale): string {
  return INTL_LOCALE[locale] || 'en-US';
}

export function proposalTextDirection(locale: ProposalLocale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

// Singular/plural unit words per locale (for "N nights", "N guests", etc.).
type Unit = { one: string; other: string };
const UNITS: Record<string, Record<ProposalLocale, Unit>> = {
  night: { en: { one: 'night', other: 'nights' }, pt: { one: 'noite', other: 'noites' }, es: { one: 'noche', other: 'noches' }, ar: { one: 'ليلة', other: 'ليالٍ' } },
  guest: { en: { one: 'guest', other: 'guests' }, pt: { one: 'hóspede', other: 'hóspedes' }, es: { one: 'huésped', other: 'huéspedes' }, ar: { one: 'ضيف', other: 'ضيوف' } },
  day: { en: { one: 'Day', other: 'Days' }, pt: { one: 'Dia', other: 'Dias' }, es: { one: 'Día', other: 'Días' }, ar: { one: 'يوم', other: 'أيام' } },
  service: { en: { one: 'service', other: 'services' }, pt: { one: 'serviço', other: 'serviços' }, es: { one: 'servicio', other: 'servicios' }, ar: { one: 'خدمة', other: 'خدمات' } },
  itineraryDay: { en: { one: 'itinerary day', other: 'itinerary days' }, pt: { one: 'dia de itinerário', other: 'dias de itinerário' }, es: { one: 'día de itinerario', other: 'días de itinerario' }, ar: { one: 'يوم في البرنامج', other: 'أيام في البرنامج' } },
};

export function unitLabel(locale: ProposalLocale, unit: keyof typeof UNITS, count: number): string {
  const entry = UNITS[unit][locale] || UNITS[unit].en;
  return count === 1 ? entry.one : entry.other;
}

// Static labels rendered in the proposal chrome + fixed list content. English
// values are exact copies of the prior hardcoded strings.
const LABELS: Record<string, Record<ProposalLocale, string>> = {
  // Cover + meta
  reference: { en: 'Reference', pt: 'Referência', es: 'Referencia', ar: 'المرجع' },
  prepared: { en: 'Prepared', pt: 'Preparado', es: 'Preparado', ar: 'تاريخ الإعداد' },
  preparedFor: { en: 'Prepared for', pt: 'Preparado para', es: 'Preparado para', ar: 'أُعد لـ' },
  travelDates: { en: 'Travel dates', pt: 'Datas de viagem', es: 'Fechas de viaje', ar: 'تواريخ السفر' },
  duration: { en: 'Duration', pt: 'Duração', es: 'Duración', ar: 'المدة' },
  guests: { en: 'Guests', pt: 'Hóspedes', es: 'Huéspedes', ar: 'الضيوف' },
  pricingSummary: { en: 'Pricing summary', pt: 'Resumo de preços', es: 'Resumen de precios', ar: 'ملخص الأسعار' },
  totalPackagePrice: { en: 'Total Package Price', pt: 'Preço total do pacote', es: 'Precio total del paquete', ar: 'إجمالي سعر الباقة' },
  pricePerPerson: { en: 'Price per Person', pt: 'Preço por pessoa', es: 'Precio por persona', ar: 'السعر للشخص' },
  quoteCurrency: { en: 'Quote Currency', pt: 'Moeda da cotação', es: 'Moneda de la cotización', ar: 'عملة العرض' },
  // Overview
  journeyOverview: { en: 'Journey overview', pt: 'Visão geral da viagem', es: 'Resumen del viaje', ar: 'نظرة عامة على الرحلة' },
  travelers: { en: 'Travelers', pt: 'Viajantes', es: 'Viajeros', ar: 'المسافرون' },
  services: { en: 'Services', pt: 'Serviços', es: 'Servicios', ar: 'الخدمات' },
  itinerary: { en: 'Itinerary', pt: 'Itinerário', es: 'Itinerario', ar: 'البرنامج' },
  highlights: { en: 'Highlights', pt: 'Destaques', es: 'Lo más destacado', ar: 'أبرز المعالم' },
  keyMoments: { en: 'Key moments', pt: 'Momentos-chave', es: 'Momentos clave', ar: 'لحظات بارزة' },
  accommodation: { en: 'Accommodation', pt: 'Alojamento', es: 'Alojamiento', ar: 'الإقامة' },
  stayOverview: { en: 'Stay Overview', pt: 'Resumo das estadias', es: 'Resumen de estancias', ar: 'ملخص الإقامة' },
  // Accommodation table headers
  tableDay: { en: 'Day', pt: 'Dia', es: 'Día', ar: 'اليوم' },
  tableHotel: { en: 'Hotel', pt: 'Hotel', es: 'Hotel', ar: 'الفندق' },
  tableLocation: { en: 'Location', pt: 'Local', es: 'Ubicación', ar: 'الموقع' },
  tableRoom: { en: 'Room', pt: 'Quarto', es: 'Habitación', ar: 'الغرفة' },
  tableNotes: { en: 'Notes', pt: 'Notas', es: 'Notas', ar: 'ملاحظات' },
  // Day by day
  dayByDay: { en: 'Day by Day', pt: 'Dia a dia', es: 'Día a día', ar: 'يومًا بيوم' },
  // Closing
  finalDetails: { en: 'Final details', pt: 'Detalhes finais', es: 'Detalles finales', ar: 'تفاصيل ختامية' },
  inclusionsAndPricing: { en: 'Inclusions and Pricing Notes', pt: 'Inclusões e notas de preço', es: 'Inclusiones y notas de precio', ar: 'المشمولات وملاحظات الأسعار' },
  included: { en: 'Included', pt: 'Incluído', es: 'Incluido', ar: 'مشمول' },
  inclusions: { en: 'Inclusions', pt: 'Inclusões', es: 'Inclusiones', ar: 'المشمولات' },
  pricingNotesEyebrow: { en: 'Pricing notes', pt: 'Notas de preço', es: 'Notas de precio', ar: 'ملاحظات الأسعار' },
  notes: { en: 'Notes', pt: 'Notas', es: 'Notas', ar: 'ملاحظات' },
  // Service group labels
  groupStay: { en: 'Stay', pt: 'Estadia', es: 'Estancia', ar: 'الإقامة' },
  groupTransfer: { en: 'Transfer', pt: 'Transfere', es: 'Traslado', ar: 'التنقل' },
  groupExperience: { en: 'Experience', pt: 'Experiência', es: 'Experiencia', ar: 'تجربة' },
  groupMeal: { en: 'Meal', pt: 'Refeição', es: 'Comida', ar: 'وجبة' },
  groupGuide: { en: 'Guide', pt: 'Guia', es: 'Guía', ar: 'مرشد' },
  groupPartnerPackage: { en: 'Partner Package', pt: 'Pacote de parceiro', es: 'Paquete de socio', ar: 'باقة شريك' },
  groupOther: { en: 'Other', pt: 'Outros', es: 'Otros', ar: 'أخرى' },
  // Default inclusions (fixed)
  inclAccommodation: { en: 'Accommodation as outlined in the itinerary.', pt: 'Alojamento conforme descrito no itinerário.', es: 'Alojamiento según lo indicado en el itinerario.', ar: 'الإقامة كما هو موضح في البرنامج.' },
  inclTransport: { en: 'Private transport and transfers as scheduled.', pt: 'Transporte privado e traslados conforme programado.', es: 'Transporte privado y traslados según lo programado.', ar: 'النقل الخاص والتنقلات حسب الجدول.' },
  inclExperiences: { en: 'Experiences and touring specifically mentioned in the program.', pt: 'Experiências e passeios especificamente mencionados no programa.', es: 'Experiencias y visitas mencionadas específicamente en el programa.', ar: 'التجارب والجولات المذكورة تحديدًا في البرنامج.' },
  inclGuiding: { en: 'Guiding services where indicated.', pt: 'Serviços de guia onde indicado.', es: 'Servicios de guía donde se indique.', ar: 'خدمات الإرشاد حيثما أُشير إليها.' },
  inclPartner: { en: 'Partner DMC package services as described in the program.', pt: 'Serviços de pacote do DMC parceiro conforme descrito no programa.', es: 'Servicios del paquete del DMC asociado según lo descrito en el programa.', ar: 'خدمات باقة شريك الـ DMC كما هو موضح في البرنامج.' },
  // Default notes (fixed)
  noteAvailability: { en: 'Prices are subject to availability and final confirmation at the time of booking.', pt: 'Os preços estão sujeitos a disponibilidade e confirmação final no momento da reserva.', es: 'Los precios están sujetos a disponibilidad y confirmación final en el momento de la reserva.', ar: 'الأسعار خاضعة للتوافر والتأكيد النهائي عند الحجز.' },
  noteAltSimple: { en: 'Alternative arrangements can be prepared on request.', pt: 'Podem ser preparadas alternativas mediante solicitação.', es: 'Se pueden preparar alternativas a solicitud.', ar: 'يمكن إعداد ترتيبات بديلة عند الطلب.' },
  noteRegulations: { en: 'Any government taxes, entrance rules, or local regulations remain subject to change without prior notice.', pt: 'Quaisquer taxas governamentais, regras de entrada ou regulamentos locais permanecem sujeitos a alterações sem aviso prévio.', es: 'Cualquier impuesto gubernamental, norma de entrada o reglamento local queda sujeto a cambios sin previo aviso.', ar: 'تظل أي ضرائب حكومية أو قواعد دخول أو أنظمة محلية عرضة للتغيير دون إشعار مسبق.' },
};

export function proposalLabel(locale: ProposalLocale, key: keyof typeof LABELS): string {
  const entry = LABELS[key];
  if (!entry) return '';
  return entry[locale] || entry.en;
}

export type ProposalLabelKey = keyof typeof LABELS;
