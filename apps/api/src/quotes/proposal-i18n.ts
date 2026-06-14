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
  // Phase P — the accommodation table's last column carries the meal plan
  // (BB/HB/…), not free-text notes (the contract note was dropped in Phase M);
  // label it accordingly.
  tableMeals: { en: 'Meals', pt: 'Refeições', es: 'Comidas', ar: 'الوجبات' },
  // Day by day
  dayByDay: { en: 'Day by Day', pt: 'Dia a dia', es: 'Día a día', ar: 'يومًا بيوم' },
  // Phase 3D.1M — day overnight badge prefix. Rendered as "{overnight}: {city}";
  // EN stays "Overnight" so English output is byte-identical.
  overnight: { en: 'Overnight', pt: 'Pernoite', es: 'Pernocte', ar: 'المبيت' },
  // Phase 3D.1M — pricing snapshot labels (eyebrow above the headline price).
  // EN values exactly match the strings produced by the pricing layer, so the
  // mapping is a no-op for English. See localizeSnapshotLabel.
  priceFixed: { en: 'Fixed price', pt: 'Preço fixo', es: 'Precio fijo', ar: 'سعر ثابت' },
  priceStatus: { en: 'Pricing status', pt: 'Estado do preço', es: 'Estado del precio', ar: 'حالة التسعير' },
  priceSelectedGroup: { en: 'Selected group size', pt: 'Tamanho de grupo selecionado', es: 'Tamaño de grupo seleccionado', ar: 'حجم المجموعة المحدد' },
  priceGroup: { en: 'Group pricing', pt: 'Preço de grupo', es: 'Precio de grupo', ar: 'تسعير جماعي' },
  pricePerPersonPackage: { en: 'Package sell price per person', pt: 'Preço de venda do pacote por pessoa', es: 'Precio de venta del paquete por persona', ar: 'سعر بيع الباقة للشخص' },
  // Closing
  finalDetails: { en: 'Final details', pt: 'Detalhes finais', es: 'Detalles finales', ar: 'تفاصيل ختامية' },
  inclusionsAndPricing: { en: 'Inclusions and Pricing Notes', pt: 'Inclusões e notas de preço', es: 'Inclusiones y notas de precio', ar: 'المشمولات وملاحظات الأسعار' },
  included: { en: 'Included', pt: 'Incluído', es: 'Incluido', ar: 'مشمول' },
  inclusions: { en: 'Inclusions', pt: 'Inclusões', es: 'Inclusiones', ar: 'المشمولات' },
  pricingNotesEyebrow: { en: 'Pricing notes', pt: 'Notas de preço', es: 'Notas de precio', ar: 'ملاحظات الأسعار' },
  notes: { en: 'Notes', pt: 'Notas', es: 'Notas', ar: 'ملاحظات' },
  // Phase 3D.1R — client-facing Exclusions / Not Included section.
  notIncluded: { en: 'Not included', pt: 'Não incluído', es: 'No incluido', ar: 'غير مشمول' },
  exclusions: { en: 'Exclusions', pt: 'Exclusões', es: 'Exclusiones', ar: 'الاستثناءات' },
  // Service group labels
  groupStay: { en: 'Stay', pt: 'Estadia', es: 'Estancia', ar: 'الإقامة' },
  groupTransfer: { en: 'Transfer', pt: 'Transporte', es: 'Traslado', ar: 'التنقل' },
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
  // Phase 3D.1R — default client-facing exclusions (human-authored, NOT machine
  // translated). Shown only when the operator hasn't entered quote.exclusionsText.
  exclFlights: { en: 'International flights', pt: 'Voos internacionais', es: 'Vuelos internacionales', ar: 'الرحلات الجوية الدولية' },
  exclPersonal: { en: 'Personal expenses', pt: 'Despesas pessoais', es: 'Gastos personales', ar: 'النفقات الشخصية' },
  exclTips: { en: 'Tips for guide and driver', pt: 'Gorjetas para guia e motorista', es: 'Propinas para el guía y el conductor', ar: 'إكراميات المرشد والسائق' },
  exclMealsDrinks: { en: 'Meals and drinks not mentioned', pt: 'Refeições e bebidas não mencionadas', es: 'Comidas y bebidas no mencionadas', ar: 'الوجبات والمشروبات غير المذكورة' },
  exclOptional: { en: 'Optional visits or activities', pt: 'Visitas ou atividades opcionais', es: 'Visitas o actividades opcionales', ar: 'الزيارات أو الأنشطة الاختيارية' },
  exclInsurance: { en: 'Travel insurance', pt: 'Seguro de viagem', es: 'Seguro de viaje', ar: 'تأمين السفر' },
  exclNotMentioned: { en: 'Any service not specifically mentioned as included', pt: 'Qualquer serviço não mencionado especificamente como incluído', es: 'Cualquier servicio no mencionado específicamente como incluido', ar: 'أي خدمة غير مذكورة تحديدًا ضمن المشمولات' },
  exclBorderTaxes: { en: 'Border taxes / departure taxes where applicable', pt: 'Taxas de fronteira / taxas de saída quando aplicáveis', es: 'Tasas fronterizas / tasas de salida cuando correspondan', ar: 'رسوم الحدود / رسوم المغادرة حيثما تنطبق' },
  exclVisa: { en: 'Visa fees if not included', pt: 'Taxas de visto se não incluídas', es: 'Tasas de visado si no están incluidas', ar: 'رسوم التأشيرة إن لم تكن مشمولة' },
  exclEntrances: { en: 'Entrance fees if not included', pt: 'Bilhetes de entrada se não incluídos', es: 'Entradas si no están incluidas', ar: 'رسوم الدخول إن لم تكن مشمولة' },
};

export function proposalLabel(locale: ProposalLocale, key: keyof typeof LABELS): string {
  const entry = LABELS[key];
  if (!entry) return '';
  return entry[locale] || entry.en;
}

export type ProposalLabelKey = keyof typeof LABELS;

// Phase 3D.1M — the pricing layer emits English snapshot labels dynamically
// (e.g. "Fixed price" from a FIXED-mode quote). We do NOT change pricing logic;
// instead we translate the KNOWN English labels at render time. Unknown,
// operator-authored labels pass through unchanged (we cannot translate them).
const SNAPSHOT_LABEL_MAP: Record<string, ProposalLabelKey> = {
  'fixed price': 'priceFixed',
  'pricing status': 'priceStatus',
  'selected group size': 'priceSelectedGroup',
  'group pricing': 'priceGroup',
  'package sell price per person': 'pricePerPersonPackage',
};

export function localizeSnapshotLabel(locale: ProposalLocale, label: string | null | undefined): string {
  const raw = String(label || '').trim();
  const key = SNAPSHOT_LABEL_MAP[raw.toLowerCase()];
  return key ? proposalLabel(locale, key) : raw;
}

// Phase 3D.1O — localize the system-generated pricing / inclusion note lines at
// render time. The pricing layer + PDF-consistency builder emit these in English
// (we do NOT change pricing logic); here we recognize the known system templates
// and re-emit them in the active locale, preserving dynamic values (counts,
// money, %, hotel name). EN is returned byte-identical (short-circuit). Operator
// free text and contract-authored data (child-policy descriptions, supplement
// type names) are NOT matched and pass through unchanged — those must be
// translated by the operator at the source (contract/quote text fields).
const PRICING_PHRASES: Record<string, Record<ProposalLocale, string>> = {
  doubleTwin: {
    en: 'Accommodation in double/twin sharing room',
    pt: 'Alojamento em quarto duplo/twin partilhado',
    es: 'Alojamiento en habitación doble/twin compartida',
    ar: 'إقامة في غرفة مزدوجة/توأم مشتركة',
  },
  singleSuppRequest: {
    en: 'Single supplement available on request',
    pt: 'Suplemento individual disponível mediante solicitação',
    es: 'Suplemento individual disponible bajo petición',
    ar: 'ملحق الغرفة الفردية متاح عند الطلب',
  },
  ratesPerPayingGuest: {
    en: 'Rates are shown per paying guest unless noted otherwise.',
    pt: 'As tarifas são apresentadas por hóspede pagante, salvo indicação em contrário.',
    es: 'Las tarifas se muestran por huésped de pago, salvo indicación en contrario.',
    ar: 'تُعرض الأسعار لكل ضيف دافع ما لم يُذكر خلاف ذلك.',
  },
  rateBasisLabel: { en: 'rate basis', pt: 'base tarifária', es: 'base tarifaria', ar: 'أساس التسعير' },
  basisPerRoom: { en: 'per room/night', pt: 'por quarto/noite', es: 'por habitación/noche', ar: 'لكل غرفة/ليلة' },
  basisPerPerson: { en: 'per person/night', pt: 'por pessoa/noite', es: 'por persona/noche', ar: 'لكل شخص/ليلة' },
  childPolicyLabel: { en: 'Child policy', pt: 'Política de crianças', es: 'Política de niños', ar: 'سياسة الأطفال' },
  noChildPolicy: {
    en: 'No child policy available',
    pt: 'Sem política de crianças disponível',
    es: 'Sin política de niños disponible',
    ar: 'لا تتوفر سياسة للأطفال',
  },
  totalPackagePrice: { en: 'Total Package Price', pt: 'Preço total do pacote', es: 'Precio total del paquete', ar: 'إجمالي سعر الباقة' },
  finalSlab: {
    en: 'Final slab selection depends on the confirmed group size.',
    pt: 'A seleção final do escalão depende do tamanho de grupo confirmado.',
    es: 'La selección final del tramo depende del tamaño de grupo confirmado.',
    ar: 'يعتمد اختيار الشريحة النهائي على حجم المجموعة المؤكد.',
  },
  // Phase O — single consolidated tax/service-charge note (no per-hotel percentages).
  taxesServiceIncluded: {
    en: 'Taxes and service charges are included where applicable.',
    pt: 'Impostos e taxas de serviço estão incluídos quando aplicável.',
    es: 'Los impuestos y cargos por servicio están incluidos cuando corresponda.',
    ar: 'الضرائب ورسوم الخدمة مشمولة حيثما ينطبق.',
  },
  taxesServiceMayApply: {
    en: 'Taxes and service charges may apply where applicable.',
    pt: 'Impostos e taxas de serviço podem ser aplicados quando aplicável.',
    es: 'Pueden aplicarse impuestos y cargos por servicio cuando corresponda.',
    ar: 'قد تُطبَّق الضرائب ورسوم الخدمة حيثما ينطبق.',
  },
};

function pricingPhrase(locale: ProposalLocale, key: keyof typeof PRICING_PHRASES): string {
  const entry = PRICING_PHRASES[key];
  return (entry && (entry[locale] || entry.en)) || '';
}

export function localizePricingLine(locale: ProposalLocale, line: string | null | undefined): string {
  const raw = String(line || '');
  if (locale === 'en' || !raw) return raw;
  let m: RegExpMatchArray | null;

  if ((m = raw.match(/^Based on (\d+) guests? sharing(\.?)$/))) {
    const n = m[1];
    const dot = m[2];
    const base = { pt: `Com base em ${n} hóspedes em quarto partilhado`, es: `Según ${n} huéspedes en habitación compartida`, ar: `بناءً على ${n} ضيوف في غرفة مشتركة` }[locale as 'pt' | 'es' | 'ar'];
    return base + dot;
  }
  if (raw === PRICING_PHRASES.doubleTwin.en) return pricingPhrase(locale, 'doubleTwin');
  if ((m = raw.match(/^Quotation prepared for (\d+) guests?\.$/))) {
    const n = m[1];
    return { pt: `Cotação preparada para ${n} hóspedes.`, es: `Cotización preparada para ${n} huéspedes.`, ar: `عرض السعر مُعدّ لـ ${n} ضيوف.` }[locale as 'pt' | 'es' | 'ar'];
  }
  if (raw === PRICING_PHRASES.singleSuppRequest.en) return pricingPhrase(locale, 'singleSuppRequest');
  if ((m = raw.match(/^Single supplement: (.+) per person$/))) {
    const x = m[1];
    return { pt: `Suplemento individual: ${x} por pessoa`, es: `Suplemento individual: ${x} por persona`, ar: `ملحق الغرفة الفردية: ${x} للشخص` }[locale as 'pt' | 'es' | 'ar'];
  }
  if (raw === PRICING_PHRASES.ratesPerPayingGuest.en) return pricingPhrase(locale, 'ratesPerPayingGuest');
  if ((m = raw.match(/^(.*) rate basis: (per room\/night|per person\/night)$/))) {
    const hotel = m[1];
    const basis = m[2] === 'per room/night' ? pricingPhrase(locale, 'basisPerRoom') : pricingPhrase(locale, 'basisPerPerson');
    return `${hotel} ${pricingPhrase(locale, 'rateBasisLabel')}: ${basis}`;
  }
  if ((m = raw.match(/^Child policy: (.+)$/))) {
    const rest = m[1] === PRICING_PHRASES.noChildPolicy.en ? pricingPhrase(locale, 'noChildPolicy') : m[1];
    return `${pricingPhrase(locale, 'childPolicyLabel')}: ${rest}`;
  }
  if ((m = raw.match(/^Total Package Price: (.+)$/))) {
    return `${pricingPhrase(locale, 'totalPackagePrice')}: ${m[1]}`;
  }
  // Phase O — consolidated tax/service-charge notes (fixed strings, no percentage).
  if (raw === PRICING_PHRASES.taxesServiceIncluded.en) return pricingPhrase(locale, 'taxesServiceIncluded');
  if (raw === PRICING_PHRASES.taxesServiceMayApply.en) return pricingPhrase(locale, 'taxesServiceMayApply');
  if ((m = raw.match(/^Applicable taxes are included at ([\d.]+)%\.$/))) {
    const p = m[1];
    return { pt: `Os impostos aplicáveis estão incluídos a ${p}%.`, es: `Los impuestos aplicables están incluidos al ${p}%.`, ar: `الضرائب المطبَّقة مشمولة بنسبة ${p}%.` }[locale as 'pt' | 'es' | 'ar'];
  }
  if ((m = raw.match(/^Applicable taxes are not included and may apply at ([\d.]+)%\.$/))) {
    const p = m[1];
    return { pt: `Os impostos aplicáveis não estão incluídos e podem ser aplicados a ${p}%.`, es: `Los impuestos aplicables no están incluidos y pueden aplicarse al ${p}%.`, ar: `الضرائب المطبَّقة غير مشمولة وقد تُطبَّق بنسبة ${p}%.` }[locale as 'pt' | 'es' | 'ar'];
  }
  if ((m = raw.match(/^Service charge is included at ([\d.]+)% where applicable\.$/))) {
    const p = m[1];
    return { pt: `A taxa de serviço está incluída a ${p}%, quando aplicável.`, es: `El cargo por servicio está incluido al ${p}%, cuando corresponda.`, ar: `رسوم الخدمة مشمولة بنسبة ${p}% حيثما ينطبق.` }[locale as 'pt' | 'es' | 'ar'];
  }
  if ((m = raw.match(/^Service charge is not included and may apply at ([\d.]+)% where applicable\.$/))) {
    const p = m[1];
    return { pt: `A taxa de serviço não está incluída e pode ser aplicada a ${p}%, quando aplicável.`, es: `El cargo por servicio no está incluido y puede aplicarse al ${p}%, cuando corresponda.`, ar: `رسوم الخدمة غير مشمولة وقد تُطبَّق بنسبة ${p}% حيثما ينطبق.` }[locale as 'pt' | 'es' | 'ar'];
  }
  if ((m = raw.match(/^Tourism fee paid to hotel is charged (per night per guest|per night per room) where applicable\.$/))) {
    const basisLoc = m[1] === 'per night per guest'
      ? { pt: 'por noite por hóspede', es: 'por noche por huésped', ar: 'لكل ليلة لكل ضيف' }[locale as 'pt' | 'es' | 'ar']
      : { pt: 'por noite por quarto', es: 'por noche por habitación', ar: 'لكل ليلة لكل غرفة' }[locale as 'pt' | 'es' | 'ar'];
    return { pt: `A taxa de turismo paga ao hotel é cobrada ${basisLoc}, quando aplicável.`, es: `La tasa de turismo pagada al hotel se cobra ${basisLoc}, cuando corresponda.`, ar: `رسوم السياحة المدفوعة للفندق تُحتسب ${basisLoc} حيثما ينطبق.` }[locale as 'pt' | 'es' | 'ar'];
  }
  if (raw === PRICING_PHRASES.finalSlab.en || raw === 'Final slab selection depends on confirmed group size') {
    return pricingPhrase(locale, 'finalSlab');
  }
  if ((m = raw.match(/^Current quote matches (.+)\.$/))) {
    const label = m[1];
    return { pt: `A cotação atual corresponde a ${label}.`, es: `La cotización actual corresponde a ${label}.`, ar: `يطابق العرض الحالي ${label}.` }[locale as 'pt' | 'es' | 'ar'];
  }
  return raw; // unmatched → operator/contract-authored text; passes through
}

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

// Phase 3D.1N — destination connector for the journey/heading destination line
// (e.g. "Dana and Petra"). Distinct from the cover subtitle, which uses a
// language-neutral middle dot ("Dana · Petra") and is intentionally unchanged.
//   en: "A and B" / "A, B, and C"  (byte-identical to the prior English output)
//   pt: "A e B"                    es: "A y B"
//   ar: "A وB"  (the waw connective attaches to the following word; earlier
//                items separated by the Arabic comma)
const DESTINATION_CONNECTOR: Record<ProposalLocale, string> = { en: 'and', pt: 'e', es: 'y', ar: 'و' };

export function joinDestinations(locale: ProposalLocale, items: Array<string | null | undefined>): string {
  const list = items.map((value) => String(value || '')).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  const connector = DESTINATION_CONNECTOR[locale] || DESTINATION_CONNECTOR.en;
  const last = list[list.length - 1];
  if (locale === 'ar') {
    const head = list.slice(0, -1).join('، ');
    return `${head} ${connector}${last}`;
  }
  if (list.length === 2) return `${list[0]} ${connector} ${list[1]}`;
  // 3+ items: English keeps its Oxford comma exactly as before; other Latin
  // locales use "A, B {connector} C".
  const head = list.slice(0, -1).join(', ');
  return locale === 'en' ? `${head}, ${connector} ${last}` : `${head} ${connector} ${last}`;
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
  // Phase 3D.1M — pricing summary note (under the headline price). EN values are
  // exact copies of the prior hard-coded strings, so English output is unchanged.
  pricingSummaryNote: {
    en: 'A client-facing summary of the current package pricing for the proposed journey.',
    pt: 'Um resumo, voltado para o cliente, do preço atual do pacote para a viagem proposta.',
    es: 'Un resumen, orientado al cliente, del precio actual del paquete para el viaje propuesto.',
    ar: 'ملخّص موجّه للعميل لسعر الباقة الحالي للرحلة المقترحة.',
  },
  pricingSummaryNotePending: {
    en: 'A client-facing summary of the current package pricing once the proposal pricing is confirmed.',
    pt: 'Um resumo, voltado para o cliente, do preço atual do pacote assim que o preço da proposta for confirmado.',
    es: 'Un resumen, orientado al cliente, del precio actual del paquete una vez confirmado el precio de la propuesta.',
    ar: 'ملخّص موجّه للعميل لسعر الباقة الحالي بمجرد تأكيد سعر العرض.',
  },
  // Phase 3D.1M — client-safe replacement for internal touring-route transport
  // descriptions (which carry route paths / vehicle classes / PER_VEHICLE codes).
  transportTouringSafe: {
    en: 'Private touring transport as scheduled.',
    pt: 'Transporte turístico privado conforme o itinerário.',
    es: 'Transporte turístico privado según el itinerario.',
    ar: 'نقل سياحي خاص حسب البرنامج.',
  },
  // Phase P.3X-2 — client-safe TITLE for a transport line when no client-safe
  // route label can be derived. The raw SupplierService name ("Airport Transfer")
  // must never title a non-airport touring day.
  transportTouringTitle: {
    en: 'Private touring transport',
    pt: 'Transporte turístico privado',
    es: 'Transporte turístico privado',
    ar: 'نقل سياحي خاص',
  },
  transportAirportTitle: {
    en: 'Private airport transfer',
    pt: 'Transfer privado de aeroporto',
    es: 'Traslado privado de aeropuerto',
    ar: 'نقل خاص من وإلى المطار',
  },
  // Phase Q — client-safe guide descriptions composed from the guide TYPE
  // (local/escort) since no guide-language field exists in the data model.
  guideLocalLicensed: {
    en: 'Licensed local guide.',
    pt: 'Guia local licenciado.',
    es: 'Guía local autorizado.',
    ar: 'مرشد محلي مرخّص.',
  },
  guideEscort: {
    en: 'Escort guide as scheduled.',
    pt: 'Guia acompanhante conforme o itinerário.',
    es: 'Guía acompañante según el itinerario.',
    ar: 'مرشد مرافق حسب البرنامج.',
  },
  // Phase P.3X-5B — service-card operational meta labels (prefixes joined with
  // their value, e.g. "Fecha 1 Jun 2026"). English output is byte-identical to
  // the prior hardcoded literals.
  serviceMetaDate: {
    en: 'Date',
    pt: 'Data',
    es: 'Fecha',
    ar: 'التاريخ',
  },
  serviceMetaStart: {
    en: 'Start',
    pt: 'Início',
    es: 'Inicio',
    ar: 'البداية',
  },
  serviceMetaPickup: {
    en: 'Pickup',
    pt: 'Recolha',
    es: 'Recogida',
    ar: 'الاستلام',
  },
  serviceMetaMeeting: {
    en: 'Meeting',
    pt: 'Encontro',
    es: 'Encuentro',
    ar: 'نقطة اللقاء',
  },
};

export function prosePhrase(locale: ProposalLocale, key: keyof typeof PROSE_PHRASES): string {
  const entry = PROSE_PHRASES[key];
  if (!entry) return '';
  return entry[locale] || entry.en;
}

// ---------------------------------------------------------------------------
// Phase P.3X-5D — controlled destination/place DISPLAY-name localization.
// A small, curated dictionary of place names that surface in client-facing
// proposal copy (cover/journey destination list, route/destination summary,
// overnight badge city, accommodation city, generated day-location label).
// English is returned byte-identical (short-circuit). Only EXACT, whole-string
// matches (trimmed, case-insensitive) are localized — this is deliberately NOT
// a blanket substring replacement, so raw day notes and arbitrary free text are
// never rewritten. Names NOT listed here (Amman, Jerash, Madaba, Petra,
// Wadi Rum, Wadi Musa, QAIA, …) pass through unchanged for now.
// Translations are human-authored, not machine-translated.
// ---------------------------------------------------------------------------
const PLACE_DISPLAY_NAMES: Record<string, Record<ProposalLocale, string>> = {
  'dead sea': { en: 'Dead Sea', pt: 'Mar Morto', es: 'Mar Muerto', ar: 'البحر الميت' },
  'mount nebo': { en: 'Mount Nebo', pt: 'Monte Nebo', es: 'Monte Nebo', ar: 'جبل نيبو' },
  bethany: { en: 'Bethany', pt: 'Betânia', es: 'Betania', ar: 'المغطس' },
};

export function localizePlaceName(locale: ProposalLocale, value: string | null | undefined): string {
  const raw = String(value ?? '');
  // English is unchanged; empty/whitespace passes through untouched.
  if (locale === 'en' || !raw.trim()) return raw;
  const entry = PLACE_DISPLAY_NAMES[raw.trim().toLowerCase()];
  return entry ? entry[locale] || entry.en : raw;
}

// ---------------------------------------------------------------------------
// Phase P.3X-5E-1 — controlled STRUCTURAL day-title localization.
// proposal-v3 renders a present day.title verbatim, so non-English proposals
// still show English structural titles ("Arrival Amman", "Departure",
// "Petra Visit / Wadi Rum"). This localizes ONLY a small set of safe, parseable
// structural shapes; any title that isn't one of them is returned UNCHANGED
// (free-form titles are never machine-translated). English short-circuits →
// byte-identical output. Place tokens reuse localizePlaceName (P.3X-5D), so only
// Dead Sea/Mount Nebo/Bethany change; Amman/Jerash/Madaba/Petra/Wadi Rum/
// Wadi Musa/QAIA stay as-is. Day NOTES/narrative are NOT touched here.
// ---------------------------------------------------------------------------
const DAY_TITLE_PHRASES: Record<string, Record<ProposalLocale, string>> = {
  // {place} filled at render time.
  arrival: { en: 'Arrival {place}', es: 'Llegada a {place}', pt: 'Chegada a {place}', ar: 'الوصول إلى {place}' },
  arrivalBare: { en: 'Arrival', es: 'Llegada', pt: 'Chegada', ar: 'الوصول' },
  departure: { en: 'Departure', es: 'Salida', pt: 'Saída', ar: 'المغادرة' },
  departureFrom: { en: 'Departure from {place}', es: 'Salida desde {place}', pt: 'Saída de {place}', ar: 'المغادرة من {place}' },
  visit: { en: 'Visit {place}', es: 'Visita de {place}', pt: 'Visita a {place}', ar: 'زيارة {place}' },
};

function dayTitlePhrase(locale: ProposalLocale, key: keyof typeof DAY_TITLE_PHRASES, place?: string): string {
  const entry = DAY_TITLE_PHRASES[key];
  const template = (entry && (entry[locale] || entry.en)) || '';
  return place === undefined ? template : template.split('{place}').join(place);
}

// A remainder after "Arrival"/"Departure" is treated as a place ONLY when it is a
// short, clean place-like token (letters/spaces/.'- , ≤4 words, no conjunction or
// "&"). This keeps free-form titles like "Arrival & welcome dinner" untouched.
function isCleanPlaceToken(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 40) return false;
  if (/[&]|\b(and|with|plus|y|e|con|com)\b/i.test(v)) return false;
  if (!/^[\p{L}][\p{L} .'’-]*$/u.test(v)) return false;
  return v.split(/\s+/).length <= 4;
}

// Generic words that are NOT a place after Arrival/Departure → render the bare form.
const STRUCTURAL_FILLER = /^(?:day|transfer|transfers|flight|flights|arrival|departure|arrival day|departure day|transfer day)$/i;

export function localizeStructuralDayTitle(locale: ProposalLocale, title: string | null | undefined): string {
  const raw = String(title ?? '');
  // English is byte-identical; empty passes through unchanged.
  if (locale === 'en' || !raw.trim()) return raw;
  const trimmed = raw.trim();

  // Phase P.3X-5E-1.1 — a BARE single controlled place-name title (exact whole-title
  // match) localizes via localizePlaceName, so a "Dead Sea" day heading reads
  // "Mar Muerto" like the other controlled display points. localizePlaceName is a
  // no-op for non-controlled names (Amman/Petra/…) and for any multi-word free-form
  // title ("Free day at the Dead Sea"), so only the exact controlled tokens change;
  // everything else falls through to the structural branches below / stays raw.
  const localizedWhole = localizePlaceName(locale, trimmed);
  if (localizedWhole !== trimmed) return localizedWhole;

  // Arrival [<place>] — e.g. "Arrival Amman" → "Llegada a Amman"; bare "Arrival" → "Llegada".
  let m = trimmed.match(/^arrival\b[\s:–—-]*(.*)$/i);
  if (m) {
    const rest = m[1].trim().replace(/^(?:at|in|to)\s+/i, '').trim();
    if (!rest || STRUCTURAL_FILLER.test(rest)) return dayTitlePhrase(locale, 'arrivalBare');
    if (isCleanPlaceToken(rest)) return dayTitlePhrase(locale, 'arrival', localizePlaceName(locale, rest));
    return raw; // remainder isn't a clean place → leave the whole title as free-form
  }

  // Departure [from <place>] — bare "Departure" → "Salida"; "Departure from Amman" → "Salida desde Amman".
  m = trimmed.match(/^departure\b[\s:–—-]*(?:from\s+)?(.*)$/i);
  if (m) {
    const rest = m[1].trim().replace(/^(?:at|in)\s+/i, '').trim();
    if (!rest || STRUCTURAL_FILLER.test(rest)) return dayTitlePhrase(locale, 'departure');
    if (isCleanPlaceToken(rest)) return dayTitlePhrase(locale, 'departureFrom', localizePlaceName(locale, rest));
    return raw;
  }

  // Slash route title: "A / B / C", incl. "X Visit / Y". Each segment: a "Visit"
  // marker → localized "Visit <place>"; otherwise just the (controlled) place name.
  // Non-place segments pass through unchanged, so a free-form slash title is safe.
  if (trimmed.includes('/')) {
    const segments = trimmed.split('/').map((s) => s.trim()).filter(Boolean);
    // Require ≥2 segments and at least one alphabetic segment (skip bare dates like 06/13).
    if (segments.length >= 2 && segments.some((s) => /[\p{L}]/u.test(s))) {
      const parts = segments.map((seg) => {
        const hadVisit = /\bvisit\b/i.test(seg);
        const placeText = seg.replace(/\bvisit\b/gi, '').replace(/\s+/g, ' ').trim();
        if (!placeText) return seg;
        const localizedPlace = localizePlaceName(locale, placeText);
        return hadVisit ? dayTitlePhrase(locale, 'visit', localizedPlace) : localizedPlace;
      });
      return parts.join(' / ');
    }
  }

  // Not a recognized structural pattern → unchanged (free-form title).
  return raw;
}

// ---------------------------------------------------------------------------
// Phase P.3X-5F — client-facing service DESCRIPTOR-suffix localization.
// Entrance/ticket/activity items carry a machine-built pricingDescription ending
// in an English classification suffix ("… | Entrance fee" → cleanText →
// "…, Entrance fee."). That English suffix surfaced in ES/PT/AR proposal service
// cards (P.3X-QA1 B7). This localizes ONLY a whole comma-segment that is exactly
// one of the known descriptor tokens — proper service/place NAME segments (which
// are never one of these tokens) pass through untouched, and there is NO
// substring replacement. English short-circuits → byte-identical. Internal tokens
// (PER_GROUP / Capacity / Required units / operational / …) are NOT in this map
// and are already dropped upstream (P.3X-5C / P.3X-5C.1), so none can reappear.
// ---------------------------------------------------------------------------
const SERVICE_DESCRIPTOR_SUFFIX: Record<string, Record<ProposalLocale, string>> = {
  'entrance fee': { en: 'Entrance fee', es: 'Entrada', pt: 'Entrada', ar: 'رسوم الدخول' },
  'entrance fees': { en: 'Entrance fees', es: 'Entradas', pt: 'Entradas', ar: 'رسوم الدخول' },
  activity: { en: 'Activity', es: 'Actividad', pt: 'Atividade', ar: 'نشاط' },
  experience: { en: 'Experience', es: 'Experiencia', pt: 'Experiência', ar: 'تجربة' },
  ticket: { en: 'Ticket', es: 'Entrada', pt: 'Bilhete', ar: 'تذكرة' },
};

export function localizeServiceDescriptor(locale: ProposalLocale, text: string | null | undefined): string {
  const raw = String(text ?? '');
  // English byte-identical; empty passes through unchanged.
  if (locale === 'en' || !raw.trim()) return raw;
  // cleanText already collapsed any " | " into ", "; localize each comma-segment
  // that is EXACTLY a known descriptor token (ignoring a trailing period), then
  // re-join with ", " so non-matched segments (proper names) are byte-preserved.
  return raw
    .split(', ')
    .map((segment) => {
      const trailing = /\.\s*$/.test(segment) ? '.' : '';
      const core = segment.replace(/\.\s*$/, '').trim();
      const entry = SERVICE_DESCRIPTOR_SUFFIX[core.toLowerCase()];
      return entry ? `${entry[locale] || entry.en}${trailing}` : segment;
    })
    .join(', ');
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
  // Phase Q — location-aware local guide description.
  guideLocalFor: { en: 'Local guide for {location}', pt: 'Guia local para {location}', es: 'Guía local para {location}', ar: 'مرشد محلي في {location}' },
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
