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

// ---------------------------------------------------------------------------
// Phase 3A.1 — free-form proposal PROSE (intros, summaries, helper sentences).
// English values reproduce the prior hardcoded strings EXACTLY (so English
// output stays unchanged); pt/es/ar are human-authored translations. These are
// STATIC boilerplate sentences only — no POI narrative composition (that is
// Phase 3B). Templates use {token} placeholders filled at render time.
// ---------------------------------------------------------------------------

// Locale-aware list joiner. English preserves the prior Oxford-comma behavior
// (`a, b, and c`) byte-for-byte; other locales use a natural connector word.
const LIST_AND: Record<ProposalLocale, string> = { en: 'and', pt: 'e', es: 'y', ar: 'و' };

export function joinProseList(locale: ProposalLocale, items: Array<string | null | undefined>): string {
  const list = items.map((value) => String(value || '')).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (locale === 'en') {
    // Exactly reproduces the previous `arr.join(', ').replace(/, ([^,]*)$/, ', and $1')`.
    return list.join(', ').replace(/, ([^,]*)$/, ', and $1');
  }
  const connector = LIST_AND[locale] || LIST_AND.en;
  const last = list[list.length - 1];
  const head = list.slice(0, -1).join(', ');
  return `${head} ${connector} ${last}`;
}

// Short reusable phrase fragments composed into the sentences above.
const PROSE_PHRASES: Record<string, Record<ProposalLocale, string>> = {
  // Cover-intro program parts
  programStays: { en: 'stays', pt: 'estadias', es: 'estancias', ar: 'الإقامات' },
  programTransfers: { en: 'transfers', pt: 'traslados', es: 'traslados', ar: 'التنقلات' },
  programExperiences: { en: 'experiences', pt: 'experiências', es: 'experiencias', ar: 'التجارب' },
  programPartner: { en: 'partner arrangements', pt: 'serviços de parceiros', es: 'servicios de socios', ar: 'ترتيبات الشركاء' },
  programFallback: { en: 'travel arrangements', pt: 'serviços de viagem', es: 'servicios de viaje', ar: 'ترتيبات السفر' },
  // Journey-summary pillars
  pillarStays: { en: 'selected stays', pt: 'estadias selecionadas', es: 'estancias seleccionadas', ar: 'إقامات مختارة' },
  pillarTransport: { en: 'private ground arrangements', pt: 'transporte terrestre privado', es: 'transporte terrestre privado', ar: 'ترتيبات نقل بري خاصة' },
  pillarExperiences: { en: 'included experiences', pt: 'experiências incluídas', es: 'experiencias incluidas', ar: 'تجارب مشمولة' },
  pillarPartner: { en: 'partner DMC services', pt: 'serviços do DMC parceiro', es: 'servicios del DMC asociado', ar: 'خدمات شريك الـ DMC' },
  pillarFallback: { en: 'the confirmed services', pt: 'os serviços confirmados', es: 'los servicios confirmados', ar: 'الخدمات المؤكدة' },
  // Cover-signature focus parts
  focusExperiences: { en: 'destination experiences', pt: 'experiências no destino', es: 'experiencias en el destino', ar: 'تجارب الوجهة' },
  focusTransfers: { en: 'smooth transfers', pt: 'traslados sem complicações', es: 'traslados sin contratiempos', ar: 'تنقلات سلسة' },
  focusStays: { en: 'well-placed stays', pt: 'estadias bem localizadas', es: 'estancias bien ubicadas', ar: 'إقامات في مواقع مميزة' },
  focusFallback: { en: 'the confirmed journey flow', pt: 'o fluxo confirmado da viagem', es: 'el flujo confirmado del viaje', ar: 'تسلسل الرحلة المؤكد' },
  // Phase 3D.1K — placeholders/labels that were previously hard-coded in English.
  datesToBeConfirmed: { en: 'Dates to be confirmed', pt: 'Datas a confirmar', es: 'Fechas por confirmar', ar: 'سيتم تأكيد التواريخ' },
  stayOptionsBelow: { en: 'Hotel options are outlined below for review and selection.', pt: 'As opções de hotel estão descritas abaixo para análise e seleção.', es: 'Las opciones de hotel se detallan a continuación para su revisión y selección.', ar: 'خيارات الفنادق موضّحة أدناه للمراجعة والاختيار.' },
};

export function prosePhrase(locale: ProposalLocale, key: keyof typeof PROSE_PHRASES): string {
  const entry = PROSE_PHRASES[key];
  if (!entry) return '';
  return entry[locale] || entry.en;
}

// Sentence templates. {token} placeholders are substituted at render time.
const PROSE_TEMPLATES: Record<string, Record<ProposalLocale, string>> = {
  // Cover intro
  coverIntroWithDest: {
    en: 'A destination-aware proposal for {dest}, with {program} sequenced around the itinerary.',
    pt: 'Uma proposta adaptada ao destino {dest}, com {program} organizados em torno do itinerário.',
    es: 'Una propuesta adaptada al destino {dest}, con {program} organizados en torno al itinerario.',
    ar: 'عرض مصمم حسب وجهة {dest}، مع {program} منظّمة وفق البرنامج.',
  },
  coverIntroNoDest: {
    en: 'A destination-aware proposal with {program} sequenced around the itinerary.',
    pt: 'Uma proposta adaptada ao destino, com {program} organizados em torno do itinerário.',
    es: 'Una propuesta adaptada al destino, con {program} organizados en torno al itinerario.',
    ar: 'عرض مصمم حسب الوجهة، مع {program} منظّمة وفق البرنامج.',
  },
  // Journey summary
  journeyWithDest: {
    en: 'A {dayCount}-day journey through {dest} for {guests}, shaped around {arrangement}.',
    pt: 'Uma viagem de {dayCount} dias por {dest} para {guests}, estruturada em torno de {arrangement}.',
    es: 'Un viaje de {dayCount} días por {dest} para {guests}, organizado en torno a {arrangement}.',
    ar: 'رحلة مدتها {dayCount} يومًا عبر {dest} لـ {guests}، مصمَّمة حول {arrangement}.',
  },
  journeyNoDest: {
    en: 'A {dayCount}-day private journey for {guests}, shaped around {arrangement}.',
    pt: 'Uma viagem privada de {dayCount} dias para {guests}, estruturada em torno de {arrangement}.',
    es: 'Un viaje privado de {dayCount} días para {guests}, organizado en torno a {arrangement}.',
    ar: 'رحلة خاصة مدتها {dayCount} يومًا لـ {guests}، مصمَّمة حول {arrangement}.',
  },
  // Day-by-day intro
  dayByDayWithDestOvernight: {
    en: 'A {dayCount}-day outline following the route through {dest}, with overnight stays noted as the program develops.',
    pt: 'Um resumo de {dayCount} dias seguindo a rota por {dest}, com as pernoitas indicadas à medida que o programa avança.',
    es: 'Un esquema de {dayCount} días siguiendo la ruta por {dest}, con las pernoctaciones indicadas a medida que avanza el programa.',
    ar: 'مخطط مدته {dayCount} يومًا يتتبع المسار عبر {dest}، مع الإشارة إلى ليالي المبيت مع تطور البرنامج.',
  },
  dayByDayWithDestServices: {
    en: 'A {dayCount}-day outline following the route through {dest}, with services grouped by day.',
    pt: 'Um resumo de {dayCount} dias seguindo a rota por {dest}, com os serviços agrupados por dia.',
    es: 'Un esquema de {dayCount} días siguiendo la ruta por {dest}, con los servicios agrupados por día.',
    ar: 'مخطط مدته {dayCount} يومًا يتتبع المسار عبر {dest}، مع تجميع الخدمات حسب اليوم.',
  },
  dayByDayWithDestPlain: {
    en: 'A {dayCount}-day outline following the route through {dest}.',
    pt: 'Um resumo de {dayCount} dias seguindo a rota por {dest}.',
    es: 'Un esquema de {dayCount} días siguiendo la ruta por {dest}.',
    ar: 'مخطط مدته {dayCount} يومًا يتتبع المسار عبر {dest}.',
  },
  dayByDayNoDestServices: {
    en: 'A {dayCount}-day outline with confirmed services grouped by day.',
    pt: 'Um resumo de {dayCount} dias com os serviços confirmados agrupados por dia.',
    es: 'Un esquema de {dayCount} días con los servicios confirmados agrupados por día.',
    ar: 'مخطط مدته {dayCount} يومًا مع تجميع الخدمات المؤكدة حسب اليوم.',
  },
  dayByDayFinalizing: {
    en: 'The itinerary structure is being finalized and will be shared in the confirmed proposal.',
    pt: 'A estrutura do itinerário está a ser finalizada e será partilhada na proposta confirmada.',
    es: 'La estructura del itinerario se está finalizando y se compartirá en la propuesta confirmada.',
    ar: 'يجري وضع اللمسات الأخيرة على هيكل البرنامج وستتم مشاركته في العرض المؤكد.',
  },
  // Cover signature
  signatureWithDest: {
    en: 'Tailored around {dest}, with {focus} coordinated into one proposal.',
    pt: 'Personalizado em torno de {dest}, com {focus} coordenados numa única proposta.',
    es: 'Personalizado en torno a {dest}, con {focus} coordinados en una sola propuesta.',
    ar: 'مصمَّم حول {dest}، مع تنسيق {focus} في عرض واحد.',
  },
  signatureNoDest: {
    en: 'Tailored with {focus} coordinated into one proposal.',
    pt: 'Personalizado com {focus} coordenados numa única proposta.',
    es: 'Personalizado con {focus} coordinados en una sola propuesta.',
    ar: 'مصمَّم مع تنسيق {focus} في عرض واحد.',
  },
  // Accommodation story
  accomByLocation: {
    en: 'Accommodation options are organized by stay location across {cities}.',
    pt: 'As opções de alojamento estão organizadas por local de estadia em {cities}.',
    es: 'Las opciones de alojamiento están organizadas por lugar de estancia en {cities}.',
    ar: 'خيارات الإقامة منظَّمة حسب موقع الإقامة عبر {cities}.',
  },
  accomRouting: {
    en: 'Accommodation options are aligned to the {dest} routing.',
    pt: 'As opções de alojamento estão alinhadas com o percurso de {dest}.',
    es: 'Las opciones de alojamiento están alineadas con el recorrido de {dest}.',
    ar: 'خيارات الإقامة متوائمة مع مسار {dest}.',
  },
  // Fallback service titles
  svcStayIn: { en: 'Stay in {location}', pt: 'Estadia em {location}', es: 'Estancia en {location}', ar: 'الإقامة في {location}' },
  svcStayArrangements: { en: 'Stay arrangements', pt: 'Detalhes de alojamento', es: 'Detalles de alojamiento', ar: 'ترتيبات الإقامة' },
  svcTransferTo: { en: 'Private Transfer to {location}', pt: 'Traslado privado para {location}', es: 'Traslado privado a {location}', ar: 'تنقّل خاص إلى {location}' },
  svcTransferArrangements: { en: 'Transfer arrangements', pt: 'Detalhes do traslado', es: 'Detalles del traslado', ar: 'ترتيبات التنقل' },
  svcVisit: { en: 'Visit {location}', pt: 'Visita a {location}', es: 'Visita a {location}', ar: 'زيارة {location}' },
  // Phase 3D.1J — touring-route movement context (only emitted when the day carries
  // a touring-route transport package whose route path is known). Never invents
  // breakfast/meals/hotels — see composeDayNarrativeFromPois.
  moveDepartFrom: { en: 'Depart from {city}', pt: 'Partida de {city}', es: 'Salida desde {city}', ar: 'الانطلاق من {city}' },
  moveDepartFromHotel: { en: 'Depart from your hotel in {city}', pt: 'Partida do seu hotel em {city}', es: 'Salida desde su hotel en {city}', ar: 'الانطلاق من فندقك في {city}' },
  moveContinueTo: { en: 'Continue to {location}', pt: 'Siga para {location}', es: 'Continúe hacia {location}', ar: 'المتابعة إلى {location}' },
  moveReturnTo: { en: 'Return to {city}', pt: 'Regresso a {city}', es: 'Regreso a {city}', ar: 'العودة إلى {city}' },
  moveReturnToHotel: { en: 'Return to your hotel in {city}', pt: 'Regresso ao seu hotel em {city}', es: 'Regreso a su hotel en {city}', ar: 'العودة إلى فندقك في {city}' },
  moveOvernightIn: { en: 'Overnight in {city}', pt: 'Pernoite em {city}', es: 'Noche en {city}', ar: 'المبيت في {city}' },
  // Phase 3D.1K — day label + deterministic cover highlights (were hard-coded English).
  dayNumberLabel: { en: 'Day {n}', pt: 'Dia {n}', es: 'Día {n}', ar: 'اليوم {n}' },
  riRoutePlanned: { en: 'Route planned through {dest}.', pt: 'Percurso planeado por {dest}.', es: 'Ruta planificada por {dest}.', ar: 'مسار مُخطّط عبر {dest}.' },
  riTimeInProgram: { en: 'Time built into the program for {dest}.', pt: 'Tempo reservado no programa para {dest}.', es: 'Tiempo reservado en el programa para {dest}.', ar: 'وقت مخصّص في البرنامج لزيارة {dest}.' },
  svcExperienceDetails: { en: 'Experience details', pt: 'Detalhes da experiência', es: 'Detalles de la experiencia', ar: 'تفاصيل التجربة' },
  svcDiningIn: { en: 'Dining in {location}', pt: 'Refeição em {location}', es: 'Comida en {location}', ar: 'تناول الطعام في {location}' },
  svcDiningArrangements: { en: 'Dining arrangements', pt: 'Detalhes das refeições', es: 'Detalles de las comidas', ar: 'ترتيبات الطعام' },
  svcGuidedTourOf: { en: 'Guided Tour of {location}', pt: 'Visita guiada a {location}', es: 'Visita guiada de {location}', ar: 'جولة بصحبة مرشد في {location}' },
  svcGuideArrangements: { en: 'Guide arrangements', pt: 'Detalhes do guia', es: 'Detalles del guía', ar: 'ترتيبات الإرشاد' },
  svcProgramDetails: { en: 'Program details', pt: 'Detalhes do programa', es: 'Detalles del programa', ar: 'تفاصيل البرنامج' },
};

export function proseTemplate(
  locale: ProposalLocale,
  key: keyof typeof PROSE_TEMPLATES,
  vars: Record<string, string | number> = {},
): string {
  const entry = PROSE_TEMPLATES[key];
  if (!entry) return '';
  let text = entry[locale] || entry.en;
  for (const [token, value] of Object.entries(vars)) {
    text = text.split(`{${token}}`).join(String(value));
  }
  return text;
}

export type ProsePhraseKey = keyof typeof PROSE_PHRASES;
export type ProseTemplateKey = keyof typeof PROSE_TEMPLATES;
