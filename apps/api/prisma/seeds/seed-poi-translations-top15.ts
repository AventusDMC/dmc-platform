import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

// Phase 4A.1 — apply the APPROVED PT/ES/AR translations for the top-15 POIs
// (content pack approved 2026-06-05, see docs/poi-translation-pack-top15-2026-06-05.md).
// Idempotent: upserts one PointOfInterestTranslation per [poiId, locale]; the English
// (en) row is NEVER touched. No routing / pricing / proposal-logic / schema changes.
// Dry-run by default; pass --apply to write.

type Tri = { title: string; short: string; long: string };
type PoiTranslations = { code: string; name: string; pt: Tri; es: Tri; ar: Tri };

const TRANSLATIONS: PoiTranslations[] = [
  {
    code: 'PETRA_ARCHAEOLOGICAL_CITY', name: 'Petra Archaeological City',
    pt: { title: 'Cidade Arqueológica de Petra', short: 'A capital nabateia cor-de-rosa e uma das Novas Maravilhas do Mundo.', long: 'Entre pelo Siq até ao Tesouro (Al-Khazneh) e explore a Rua das Fachadas, os Túmulos Reais, o Mosteiro (Ad-Deir) e uma vasta cidade esculpida na rocha — Património Mundial da UNESCO.' },
    es: { title: 'Ciudad Arqueológica de Petra', short: 'La capital nabatea de color rosa y una de las Nuevas Maravillas del Mundo.', long: 'Ingrese por el Siq hasta el Tesoro (Al-Khazneh) y explore la Calle de las Fachadas, las Tumbas Reales, el Monasterio (Ad-Deir) y una vasta ciudad tallada en la roca — Patrimonio Mundial de la UNESCO.' },
    ar: { title: 'مدينة البتراء الأثرية', short: 'العاصمة النبطية الورديّة وإحدى عجائب الدنيا الجديدة.', long: 'ادخل عبر السيق إلى الخزنة، ثم استكشف شارع الواجهات والمقابر الملكية والدير ومدينةً شاسعة منحوتة في الصخر — موقع تراث عالمي لليونسكو.' },
  },
  {
    code: 'WADI_RUM_PROTECTED_AREA', name: 'Wadi Rum Protected Area',
    pt: { title: 'Área Protegida de Wadi Rum', short: 'O "Vale da Lua" — um deserto deslumbrante de arenito e granito.', long: 'Uma região selvagem desértica classificada pela UNESCO, com imponentes formações rochosas, desfiladeiros estreitos e inscrições nabateias, idealmente explorada de 4x4 e vivida com pernoita num acampamento no deserto.' },
    es: { title: 'Área Protegida de Wadi Rum', short: 'El "Valle de la Luna" — un desierto espectacular de arenisca y granito.', long: 'Un desierto silvestre declarado por la UNESCO, con imponentes formaciones rocosas, cañones estrechos e inscripciones nabateas, que se explora mejor en 4x4 y se vive con una pernoctación en un campamento del desierto.' },
    ar: { title: 'محمية وادي رم', short: '"وادي القمر" — صحراء ساحرة من الحجر الرملي والغرانيت.', long: 'برّية صحراوية مدرَجة على لائحة اليونسكو، بتكويناتها الصخرية الشاهقة ووديانها الضيقة ونقوشها النبطية، يُفضَّل استكشافها بمركبات الدفع الرباعي والمبيت في مخيّم صحراوي.' },
  },
  {
    code: 'JERASH_ARCHAEOLOGICAL_SITE', name: 'Jerash Archaeological Site',
    pt: { title: 'Sítio Arqueológico de Jerash', short: 'Uma das cidades greco-romanas mais bem preservadas do mundo.', long: 'Explore o Arco de Adriano, a Praça Oval, o Cardo Maximus colunado, o Templo de Ártemis e os teatros antigos desta cidade provincial romana extraordinariamente intacta.' },
    es: { title: 'Sitio Arqueológico de Jerash', short: 'Una de las ciudades grecorromanas mejor conservadas del mundo.', long: 'Explore el Arco de Adriano, la Plaza Oval, el Cardo Máximo columnado, el Templo de Artemisa y los teatros antiguos de esta ciudad provincial romana excepcionalmente intacta.' },
    ar: { title: 'موقع جرش الأثري', short: 'من أفضل المدن اليونانية–الرومانية حفظًا في العالم.', long: 'استكشف قوس هادريان والساحة البيضاوية وشارع الأعمدة (الكاردو ماكسيموس) ومعبد أرتميس والمسارح القديمة في هذه المدينة الرومانية المحفوظة بشكل لافت.' },
  },
  {
    code: 'AMMAN_CITADEL', name: 'Amman Citadel',
    pt: { title: 'Cidadela de Amã', short: "O antigo núcleo de Amã no alto da colina (Jabal Al-Qal'a).", long: 'Ruínas sobrepostas numa das sete colinas de Amã — o Templo de Hércules, o Palácio Omíada e a igreja bizantina — com vistas panorâmicas sobre a cidade e o Teatro Romano abaixo.' },
    es: { title: 'Ciudadela de Amán', short: "El antiguo núcleo de Amán en lo alto de la colina (Jabal Al-Qal'a).", long: 'Ruinas superpuestas en una de las siete colinas de Amán — el Templo de Hércules, el Palacio Omeya y la iglesia bizantina — con vistas panorámicas sobre la ciudad y el Teatro Romano más abajo.' },
    ar: { title: 'قلعة عمّان (جبل القلعة)', short: 'قلب عمّان التاريخي على قمة الجبل (جبل القلعة).', long: 'أطلال متراكمة على إحدى تلال عمّان السبع — معبد هرقل والقصر الأموي والكنيسة البيزنطية — مع إطلالات بانورامية على المدينة والمدرّج الروماني في الأسفل.' },
  },
  {
    code: 'ROMAN_THEATRE', name: 'Roman Theatre',
    pt: { title: 'Teatro Romano', short: 'Anfiteatro romano do século II restaurado, no centro de Amã.', long: 'Um teatro notavelmente preservado, escavado na encosta, que outrora acomodava cerca de 6.000 espectadores; hoje é um marco do centro de Amã e alberga dois pequenos museus de folclore.' },
    es: { title: 'Teatro Romano', short: 'Anfiteatro romano del siglo II restaurado, en el centro de Amán.', long: 'Un teatro notablemente conservado, excavado en la ladera, que en su día albergaba a unos 6.000 espectadores; hoy es un emblema del centro de Amán y alberga dos pequeños museos de folclore.' },
    ar: { title: 'المدرّج الروماني', short: 'مدرّج روماني من القرن الثاني مُرمَّم في وسط البلد بعمّان.', long: 'مسرح محفوظ بشكل لافت محفور في سفح التلّ كان يتّسع لنحو 6000 متفرّج، وهو اليوم معلَم بارز في وسط عمّان ويضمّ متحفين صغيرين للفنون الشعبية.' },
  },
  {
    code: 'DEAD_SEA', name: 'Dead Sea',
    pt: { title: 'Mar Morto', short: 'O ponto mais baixo da Terra — flutue em águas ricas em minerais.', long: 'A mais de 400 m abaixo do nível do mar, as suas águas hipersalinas permitem flutuar sem esforço; a lama mineral é apreciada pelas suas propriedades terapêuticas.' },
    es: { title: 'Mar Muerto', short: 'El punto más bajo de la Tierra — flote en aguas ricas en minerales.', long: 'A más de 400 m bajo el nivel del mar, sus aguas hipersalinas permiten flotar sin esfuerzo; su barro mineral es apreciado por sus propiedades terapéuticas.' },
    ar: { title: 'البحر الميت', short: 'أخفض نقطة على سطح الأرض — استمتع بالطفو في مياه غنية بالمعادن.', long: 'على عمق يتجاوز 400 متر تحت مستوى سطح البحر، تتيح مياهه شديدة الملوحة الطفو دون عناء، ويُقدَّر طينه المعدني لخصائصه العلاجية.' },
  },
  {
    code: 'MOUNT_NEBO', name: 'Mount Nebo',
    pt: { title: 'Monte Nebo', short: 'Onde Moisés contemplou a Terra Prometida.', long: 'Um venerado local de peregrinação com a Igreja Memorial de Moisés e vistas panorâmicas sobre o Vale do Jordão, o Mar Morto e, em dias claros, Jerusalém.' },
    es: { title: 'Monte Nebo', short: 'Donde Moisés contempló la Tierra Prometida.', long: 'Un venerado lugar de peregrinación con la Iglesia Memorial de Moisés y vistas panorámicas sobre el Valle del Jordán, el Mar Muerto y, en días despejados, Jerusalén.' },
    ar: { title: 'جبل نيبو', short: 'حيث أطلّ النبي موسى على الأرض الموعودة.', long: 'مزار النبي موسى في جبل نيبو؛ موقع حجّ مبجَّل يضمّ كنيسة موسى التذكارية وإطلالات بانورامية على وادي الأردن والبحر الميت، وفي الأيام الصافية على القدس.' },
  },
  {
    code: 'MADABA', name: 'Madaba',
    pt: { title: 'Madaba', short: 'A "Cidade dos Mosaicos" e o Mapa de Madaba, do século VI.', long: 'Acolhe o famoso mapa-mosaico bizantino da Terra Santa, na Igreja de São Jorge, além de inúmeros outros mosaicos por toda a cidade.' },
    es: { title: 'Madaba', short: 'La "Ciudad de los Mosaicos" y el Mapa de Madaba, del siglo VI.', long: 'Alberga el célebre mapa-mosaico bizantino de Tierra Santa, en la Iglesia de San Jorge, además de numerosos mosaicos repartidos por la ciudad.' },
    ar: { title: 'مادبا', short: '"مدينة الفسيفساء" وخارطة مادبا من القرن السادس.', long: 'تضمّ خارطة مادبا — خريطة الفسيفساء البيزنطية الشهيرة للأراضي المقدّسة — في كنيسة القديس جاورجيوس للروم الأرثوذكس، إضافةً إلى العديد من اللوحات الفسيفسائية الأخرى في أنحاء المدينة.' },
  },
  {
    code: 'KARAK_CASTLE', name: 'Karak Castle',
    pt: { title: 'Castelo de Karak', short: 'Um grande castelo dos cruzados na Estrada dos Reis.', long: 'Uma vasta fortaleza cruzada do século XII, com salas abobadadas e túneis, posteriormente ampliada sob os domínios aiúbida e mameluco.' },
    es: { title: 'Castillo de Karak', short: 'Un gran castillo cruzado en el Camino de los Reyes.', long: 'Una vasta fortaleza cruzada del siglo XII, con salas abovedadas y túneles, ampliada posteriormente bajo los dominios ayubí y mameluco.' },
    ar: { title: 'قلعة الكرك', short: 'قلعة صليبية كبرى على طريق الملوك.', long: 'قلعة صليبية ضخمة من القرن الثاني عشر بقاعاتها المقبّبة وأنفاقها، جرى توسيعها لاحقًا في العهدين الأيوبي والمملوكي.' },
  },
  {
    code: 'LITTLE_PETRA', name: 'Little Petra',
    pt: { title: 'Pequena Petra', short: 'Siq al-Barid — um pequeno subúrbio nabateu de caravanas.', long: 'Um compacto desfiladeiro esculpido a norte de Petra que servia de subúrbio comercial, com frescos helenísticos pintados na Casa Pintada.' },
    es: { title: 'Pequeña Petra', short: 'Siq al-Barid — un pequeño suburbio nabateo de caravanas.', long: 'Un compacto cañón tallado al norte de Petra que servía de suburbio comercial, con frescos helenísticos pintados en la Casa Pintada.' },
    ar: { title: 'البتراء الصغيرة', short: 'سيق البارد — ضاحية نبطية صغيرة للقوافل.', long: 'وادٍ صغير منحوت إلى الشمال من البتراء كان يُستخدَم ضاحيةً تجارية، وفيه رسوم جدارية هلنستية في "البيت المرسوم".' },
  },
  {
    code: 'AJLOUN_CASTLE', name: 'Ajloun Castle',
    pt: { title: 'Castelo de Ajloun', short: 'Fortaleza aiúbida do século XII no alto de uma colina.', long: "Qal'at Ar-Rabad foi construído por um general de Saladino para controlar a região e dominar vistas amplas sobre o norte do Vale do Jordão." },
    es: { title: 'Castillo de Ajloun', short: 'Fortaleza ayubí del siglo XII en lo alto de una colina.', long: "Qal'at Ar-Rabad fue construido por un general de Saladino para controlar la región y dominar amplias vistas sobre el norte del Valle del Jordán." },
    ar: { title: 'قلعة عجلون', short: 'قلعة أيوبية من القرن الثاني عشر على قمة تلّة.', long: 'بُنيت قلعة الربض على يد أحد قادة صلاح الدين للسيطرة على المنطقة والإشراف على إطلالات واسعة على شمال وادي الأردن.' },
  },
  {
    code: 'WADI_MUJIB', name: 'Wadi Mujib',
    pt: { title: 'Wadi Mujib', short: 'Espetacular reserva de desfiladeiros que desce até ao Mar Morto.', long: 'A reserva natural de menor altitude do mundo, célebre pelo aventuroso percurso aquático do Siq através de uma garganta de arenito (sazonal), gerida pela RSCN.' },
    es: { title: 'Wadi Mujib', short: 'Espectacular reserva de cañones que desciende hasta el Mar Muerto.', long: 'La reserva natural de menor altitud del mundo, célebre por la aventurera ruta acuática del Siq a través de un desfiladero de arenisca (de temporada), gestionada por la RSCN.' },
    ar: { title: 'وادي الموجب', short: 'محمية وديان مذهلة تنحدر نحو البحر الميت.', long: 'أخفض محمية طبيعية ارتفاعًا في العالم، تشتهر بمسار "السيق" المائي المغامِر عبر أخدود من الحجر الرملي (موسمي)، وتديرها الجمعية الملكية لحماية الطبيعة.' },
  },
  {
    code: 'DOWNTOWN_AMMAN', name: 'Downtown Amman',
    pt: { title: 'Centro de Amã (Downtown)', short: 'O animado coração antigo da capital (Al-Balad).', long: 'Souks movimentados, a Grande Mesquita Al-Husseini, casas de café tradicionais e comida de rua — o centro comercial histórico de Amã.' },
    es: { title: 'Centro de Amán (Downtown)', short: 'El animado corazón antiguo de la capital (Al-Balad).', long: 'Zocos bulliciosos, la Gran Mezquita Al-Husseini, cafeterías tradicionales y comida callejera — el centro comercial histórico de Amán.' },
    ar: { title: 'وسط البلد – عمّان', short: 'قلب العاصمة القديم النابض بالحياة (البلد).', long: 'أسواق نابضة بالحياة، ومسجد الحسيني الكبير، ومقاهٍ تقليدية، وأكلات الشارع — المركز التجاري التاريخي لعمّان.' },
  },
  {
    code: 'BETHANY_BEYOND_THE_JORDAN', name: 'Bethany Beyond the Jordan',
    pt: { title: 'Betânia Além do Jordão', short: 'O local do batismo de Jesus Cristo (UNESCO).', long: 'Al-Maghtas, na margem oriental do rio Jordão, é o local amplamente reconhecido do batismo de Jesus e um importante destino de peregrinação.' },
    es: { title: 'Betania más allá del Jordán', short: 'El lugar del bautismo de Jesucristo (UNESCO).', long: 'Al-Maghtas, en la ribera oriental del río Jordán, es el lugar ampliamente reconocido del bautismo de Jesús y un importante destino de peregrinación.' },
    ar: { title: 'المغطس (موقع معمودية السيد المسيح)', short: 'موقع معمودية السيد المسيح (اليونسكو).', long: 'المغطس، على الضفة الشرقية لنهر الأردن، هو الموقع المعترف به على نطاق واسع لمعمودية السيد المسيح، ووجهة حجّ مهمة. ويُعرف أيضاً باسم بيت عنيا عبر الأردن.' },
  },
  {
    code: 'UMM_QAIS', name: 'Umm Qais',
    pt: { title: 'Umm Qais', short: 'Ruínas de Gadara com vista para o Mar da Galileia e os Montes Golã.', long: 'A cidade greco-romana de Gadara, com as suas ruas de basalto, teatro e terraços que oferecem vistas panorâmicas sobre três países.' },
    es: { title: 'Umm Qais', short: 'Ruinas de Gádara con vistas al Mar de Galilea y los Altos del Golán.', long: 'La ciudad grecorromana de Gádara, con sus calles de basalto, su teatro y sus terrazas que ofrecen vistas panorámicas sobre tres países.' },
    ar: { title: 'أم قيس', short: 'أطلال مدينة جدارا المطلّة على بحيرة طبريا ومرتفعات الجولان.', long: 'مدينة جدارا اليونانية–الرومانية بشوارعها البازلتية ومسرحها ومصاطبها التي تتيح إطلالات بانورامية على ثلاث دول.' },
  },
];

const LOCALES: Array<'pt' | 'es' | 'ar'> = ['pt', 'es', 'ar'];

export async function seedPoiTranslationsTop15(prisma: PrismaLike, options: { dryRun?: boolean; logger?: Logger } = {}) {
  const dryRun = options.dryRun ?? true;
  const logger = options.logger ?? console;
  const summary = { dryRun, poisFound: 0, poisMissing: 0, missingCodes: [] as string[], written: { pt: 0, es: 0, ar: 0 } };

  for (const poi of TRANSLATIONS) {
    const found = await prisma.pointOfInterest.findUnique({ where: { code: poi.code }, select: { id: true } });
    if (!found) {
      summary.poisMissing += 1;
      summary.missingCodes.push(poi.code);
      logger.warn(`POI not found by code: ${poi.code} (${poi.name}) — skipped`);
      continue;
    }
    summary.poisFound += 1;
    for (const locale of LOCALES) {
      const tri = poi[locale];
      if (dryRun) {
        logger.log(`[dry-run] upsert ${poi.code} [${locale}] title="${tri.title}"`);
        summary.written[locale] += 1;
        continue;
      }
      await prisma.pointOfInterestTranslation.upsert({
        where: { poiId_locale: { poiId: found.id, locale } },
        create: { poiId: found.id, locale, title: tri.title, shortDescription: tri.short, longDescription: tri.long },
        update: { title: tri.title, shortDescription: tri.short, longDescription: tri.long },
      });
      summary.written[locale] += 1;
    }
  }

  logger.log(`POI top-15 translation seed summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = !process.argv.includes('--apply');
  try {
    await seedPoiTranslationsTop15(prisma as unknown as PrismaLike, { dryRun });
    if (dryRun) {
      console.log('Dry-run only. Re-run with --apply to write PT/ES/AR translations (English untouched).');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('POI top-15 translation seed failed');
    console.error(error);
    process.exit(1);
  });
}
