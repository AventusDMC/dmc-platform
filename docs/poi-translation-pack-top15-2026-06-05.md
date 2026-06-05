# POI translation content pack — Top 15 (PT / ES / AR) — 2026-06-05

> **STATUS: DRAFT — PENDING NATIVE REVIEW.** These are assistant-drafted translations.
> Nothing here is applied to the database. PR #333 is intentionally kept **open** as a
> living draft / pending-review record — it is **not** the approved record yet. Phase
> 4A.1 (idempotent seed apply) must not start until every box below is checked and the
> pack is approved.

## Review checklist (sign off before DB seed)

- [ ] **Portuguese reviewed** (native/fluent check)
- [ ] **Spanish reviewed** (native/fluent check)
- [ ] **Arabic reviewed** (native/fluent check)
- [ ] **Religious terminology reviewed** (Mount Nebo, Bethany, Madaba)
- [ ] **Sensitive geographic terminology reviewed** (Umm Qais — Sea of Galilee / Golan Heights)
- [ ] **Place-name consistency reviewed** across PT/ES/AR (Petra, Wadi Rum, Jerash, Dead Sea, Mount Nebo, Bethany, Umm Qais)
- [ ] **Approved for DB seed** (Phase 4A.1 may proceed)

_Phase 4A.0 — **content only, review-first**. Nothing here is applied to the database.
After you approve this pack, Phase 4A.1 will apply it via an idempotent seed update._

## Purpose

Draft Portuguese, Spanish, and Arabic translations for the 15 highest-value POIs so
that PT/ES/AR proposals show localized POI titles and descriptions (instead of the
current localized-boilerplate + English-content fallback).

## How this was produced & guidelines followed

- English source = the live seeded POI content (`title` / `shortDescription` /
  `longDescription`), reproduced verbatim below for review.
- Translations are faithful and client-facing; **no inclusions were invented** — no
  tickets, pricing, meals, or guide services were added (none appear in the English
  unless shown). No overpromising.
- Place names kept consistent (e.g. Petra → البتراء, Wadi Rum → وادي رم, Jerash →
  جرش). Established Arabic site names used where they exist.
- Arabic written for natural proposal display; RTL is handled by the renderer.
- **These are machine-/assistant-drafted translations for human review.** Items that
  especially warrant a native-speaker or cultural check are flagged per-POI and
  summarized at the end. Please review before Phase 4A.1 applies them.

---

## 1. Petra Archaeological City (`PETRA_ARCHAEOLOGICAL_CITY`)

- **EN — Title:** Petra Archaeological City
- **EN — Short:** The rose-red Nabataean capital and a New Wonder of the World.
- **EN — Long:** Enter through the Siq to the Treasury (Al-Khazneh), then explore the Street of Facades, the Royal Tombs, the Monastery (Ad-Deir) and a vast carved city — a UNESCO World Heritage Site.

- **PT — Title:** Cidade Arqueológica de Petra
- **PT — Short:** A capital nabateia cor-de-rosa e uma das Novas Maravilhas do Mundo.
- **PT — Long:** Entre pelo Siq até ao Tesouro (Al-Khazneh) e explore a Rua das Fachadas, os Túmulos Reais, o Mosteiro (Ad-Deir) e uma vasta cidade esculpida na rocha — Património Mundial da UNESCO.

- **ES — Title:** Ciudad Arqueológica de Petra
- **ES — Short:** La capital nabatea de color rosa y una de las Nuevas Maravillas del Mundo.
- **ES — Long:** Ingrese por el Siq hasta el Tesoro (Al-Khazneh) y explore la Calle de las Fachadas, las Tumbas Reales, el Monasterio (Ad-Deir) y una vasta ciudad tallada en la roca — Patrimonio Mundial de la UNESCO.

- **AR — Title:** مدينة البتراء الأثرية
- **AR — Short:** العاصمة النبطية الورديّة وإحدى عجائب الدنيا الجديدة.
- **AR — Long:** ادخل عبر السيق إلى الخزنة، ثم استكشف شارع الواجهات والمقابر الملكية والدير ومدينةً شاسعة منحوتة في الصخر — موقع تراث عالمي لليونسكو.

- **Notes:** Standard names; no review concerns.

---

## 2. Wadi Rum Protected Area (`WADI_RUM_PROTECTED_AREA`)

- **EN — Title:** Wadi Rum Protected Area
- **EN — Short:** The "Valley of the Moon" — dramatic desert of sandstone and granite.
- **EN — Long:** A UNESCO desert wilderness of towering rock formations, narrow canyons and Nabataean inscriptions, best explored by 4x4 and experienced overnight in a desert camp.

- **PT — Title:** Área Protegida de Wadi Rum
- **PT — Short:** O "Vale da Lua" — um deserto deslumbrante de arenito e granito.
- **PT — Long:** Uma região selvagem desértica classificada pela UNESCO, com imponentes formações rochosas, desfiladeiros estreitos e inscrições nabateias, idealmente explorada de 4x4 e vivida com pernoita num acampamento no deserto.

- **ES — Title:** Área Protegida de Wadi Rum
- **ES — Short:** El "Valle de la Luna" — un desierto espectacular de arenisca y granito.
- **ES — Long:** Un desierto silvestre declarado por la UNESCO, con imponentes formaciones rocosas, cañones estrechos e inscripciones nabateas, que se explora mejor en 4x4 y se vive con una pernoctación en un campamento del desierto.

- **AR — Title:** محمية وادي رم
- **AR — Short:** "وادي القمر" — صحراء ساحرة من الحجر الرملي والغرانيت.
- **AR — Long:** برّية صحراوية مدرَجة على لائحة اليونسكو، بتكويناتها الصخرية الشاهقة ووديانها الضيقة ونقوشها النبطية، يُفضَّل استكشافها بمركبات الدفع الرباعي والمبيت في مخيّم صحراوي.

- **Notes:** The English mentions overnight desert camp as a description of how the site is *experienced*, not an inclusion — translations mirror that wording.

---

## 3. Jerash Archaeological Site (`JERASH_ARCHAEOLOGICAL_SITE`)

- **EN — Title:** Jerash Archaeological Site
- **EN — Short:** One of the best-preserved Greco-Roman cities in the world.
- **EN — Long:** Explore Hadrian's Arch, the Oval Plaza, the colonnaded Cardo Maximus, the Temple of Artemis and the ancient theatres of this remarkably intact Roman provincial city.

- **PT — Title:** Sítio Arqueológico de Jerash
- **PT — Short:** Uma das cidades greco-romanas mais bem preservadas do mundo.
- **PT — Long:** Explore o Arco de Adriano, a Praça Oval, o Cardo Maximus colunado, o Templo de Ártemis e os teatros antigos desta cidade provincial romana extraordinariamente intacta.

- **ES — Title:** Sitio Arqueológico de Jerash
- **ES — Short:** Una de las ciudades grecorromanas mejor conservadas del mundo.
- **ES — Long:** Explore el Arco de Adriano, la Plaza Oval, el Cardo Máximo columnado, el Templo de Artemisa y los teatros antiguos de esta ciudad provincial romana excepcionalmente intacta.

- **AR — Title:** موقع جرش الأثري
- **AR — Short:** من أفضل المدن اليونانية–الرومانية حفظًا في العالم.
- **AR — Long:** استكشف قوس هادريان والساحة البيضاوية وشارع الأعمدة (الكاردو ماكسيموس) ومعبد أرتميس والمسارح القديمة في هذه المدينة الرومانية المحفوظة بشكل لافت.

- **Notes:** No concerns.

---

## 4. Amman Citadel (`AMMAN_CITADEL`)

- **EN — Title:** Amman Citadel
- **EN — Short:** Ancient hilltop core of Amman (Jabal Al-Qal'a).
- **EN — Long:** Layered ruins on one of Amman's seven hills — the Temple of Hercules, the Umayyad Palace and the Byzantine church — with panoramic views over the city and the Roman Theatre below.

- **PT — Title:** Cidadela de Amã
- **PT — Short:** O antigo núcleo de Amã no alto da colina (Jabal Al-Qal'a).
- **PT — Long:** Ruínas sobrepostas numa das sete colinas de Amã — o Templo de Hércules, o Palácio Omíada e a igreja bizantina — com vistas panorâmicas sobre a cidade e o Teatro Romano abaixo.

- **ES — Title:** Ciudadela de Amán
- **ES — Short:** El antiguo núcleo de Amán en lo alto de la colina (Jabal Al-Qal'a).
- **ES — Long:** Ruinas superpuestas en una de las siete colinas de Amán — el Templo de Hércules, el Palacio Omeya y la iglesia bizantina — con vistas panorámicas sobre la ciudad y el Teatro Romano más abajo.

- **AR — Title:** قلعة عمّان (جبل القلعة)
- **AR — Short:** قلب عمّان التاريخي على قمة الجبل (جبل القلعة).
- **AR — Long:** أطلال متراكمة على إحدى تلال عمّان السبع — معبد هرقل والقصر الأموي والكنيسة البيزنطية — مع إطلالات بانورامية على المدينة والمدرّج الروماني في الأسفل.

- **Notes:** AR title uses the common "قلعة عمّان"; "جبل القلعة" kept in parentheses to match the English.

---

## 5. Roman Theatre (`ROMAN_THEATRE`)

- **EN — Title:** Roman Theatre
- **EN — Short:** Restored 2nd-century Roman amphitheatre in downtown Amman.
- **EN — Long:** A remarkably preserved theatre built into the hillside that once seated about 6,000 spectators, today a landmark of downtown Amman and home to two small folklore museums.

- **PT — Title:** Teatro Romano
- **PT — Short:** Anfiteatro romano do século II restaurado, no centro de Amã.
- **PT — Long:** Um teatro notavelmente preservado, escavado na encosta, que outrora acomodava cerca de 6.000 espectadores; hoje é um marco do centro de Amã e alberga dois pequenos museus de folclore.

- **ES — Title:** Teatro Romano
- **ES — Short:** Anfiteatro romano del siglo II restaurado, en el centro de Amán.
- **ES — Long:** Un teatro notablemente conservado, excavado en la ladera, que en su día albergaba a unos 6.000 espectadores; hoy es un emblema del centro de Amán y alberga dos pequeños museos de folclore.

- **AR — Title:** المدرّج الروماني
- **AR — Short:** مدرّج روماني من القرن الثاني مُرمَّم في وسط البلد بعمّان.
- **AR — Long:** مسرح محفوظ بشكل لافت محفور في سفح التلّ كان يتّسع لنحو 6000 متفرّج، وهو اليوم معلَم بارز في وسط عمّان ويضمّ متحفين صغيرين للفنون الشعبية.

- **Notes:** "amphitheatre" rendered as مدرّج (standard for Amman's theatre); ~6,000 kept as an approximation per the English.

---

## 6. Dead Sea (`DEAD_SEA`)

- **EN — Title:** Dead Sea
- **EN — Short:** The lowest point on Earth — float in mineral-rich waters.
- **EN — Long:** At over 400m below sea level, its hypersaline water lets visitors float effortlessly; the mineral mud is prized for its therapeutic properties.

- **PT — Title:** Mar Morto
- **PT — Short:** O ponto mais baixo da Terra — flutue em águas ricas em minerais.
- **PT — Long:** A mais de 400 m abaixo do nível do mar, as suas águas hipersalinas permitem flutuar sem esforço; a lama mineral é apreciada pelas suas propriedades terapêuticas.

- **ES — Title:** Mar Muerto
- **ES — Short:** El punto más bajo de la Tierra — flote en aguas ricas en minerales.
- **ES — Long:** A más de 400 m bajo el nivel del mar, sus aguas hipersalinas permiten flotar sin esfuerzo; su barro mineral es apreciado por sus propiedades terapéuticas.

- **AR — Title:** البحر الميت
- **AR — Short:** أخفض نقطة على سطح الأرض — استمتع بالطفو في مياه غنية بالمعادن.
- **AR — Long:** على عمق يتجاوز 400 متر تحت مستوى سطح البحر، تتيح مياهه شديدة الملوحة الطفو دون عناء، ويُقدَّر طينه المعدني لخصائصه العلاجية.

- **Notes:** "therapeutic properties" kept descriptive (matches English); no health claims added beyond the source.

---

## 7. Mount Nebo (`MOUNT_NEBO`)

- **EN — Title:** Mount Nebo
- **EN — Short:** Where Moses viewed the Promised Land.
- **EN — Long:** A revered pilgrimage site with the Memorial Church of Moses and panoramic views over the Jordan Valley, Dead Sea and, on clear days, Jerusalem.

- **PT — Title:** Monte Nebo
- **PT — Short:** Onde Moisés contemplou a Terra Prometida.
- **PT — Long:** Um venerado local de peregrinação com a Igreja Memorial de Moisés e vistas panorâmicas sobre o Vale do Jordão, o Mar Morto e, em dias claros, Jerusalém.

- **ES — Title:** Monte Nebo
- **ES — Short:** Donde Moisés contempló la Tierra Prometida.
- **ES — Long:** Un venerado lugar de peregrinación con la Iglesia Memorial de Moisés y vistas panorámicas sobre el Valle del Jordán, el Mar Muerto y, en días despejados, Jerusalén.

- **AR — Title:** جبل نيبو
- **AR — Short:** حيث أطلّ النبي موسى (عليه السلام) على الأرض الموعودة.
- **AR — Long:** موقع حجّ مبجَّل يضمّ كنيسة موسى التذكارية وإطلالات بانورامية على وادي الأردن والبحر الميت، وفي الأيام الصافية على القدس.

- **Notes:** ⚠️ Religious phrasing — AR adds the honorific "(عليه السلام)" after Moses, which is customary for Arabic-speaking audiences. Please confirm whether to keep the honorific (recommended for AR client display) or match the neutral English exactly.

---

## 8. Madaba (`MADABA`)

- **EN — Title:** Madaba
- **EN — Short:** The "City of Mosaics" and the 6th-century Madaba Map.
- **EN — Long:** Home to the famous Byzantine mosaic map of the Holy Land in St George's Church, plus numerous other mosaics across the town.

- **PT — Title:** Madaba
- **PT — Short:** A "Cidade dos Mosaicos" e o Mapa de Madaba, do século VI.
- **PT — Long:** Acolhe o famoso mapa-mosaico bizantino da Terra Santa, na Igreja de São Jorge, além de inúmeros outros mosaicos por toda a cidade.

- **ES — Title:** Madaba
- **ES — Short:** La "Ciudad de los Mosaicos" y el Mapa de Madaba, del siglo VI.
- **ES — Long:** Alberga el célebre mapa-mosaico bizantino de Tierra Santa, en la Iglesia de San Jorge, además de numerosos mosaicos repartidos por la ciudad.

- **AR — Title:** مادبا
- **AR — Short:** "مدينة الفسيفساء" وخريطة مادبا من القرن السادس.
- **AR — Long:** تضمّ خريطة الفسيفساء البيزنطية الشهيرة للأراضي المقدّسة في كنيسة القديس جاورجيوس، إضافةً إلى العديد من اللوحات الفسيفسائية الأخرى في أنحاء المدينة.

- **Notes:** "St George's Church" → كنيسة القديس جاورجيوس (standard Arabic form); confirm if a different church-name spelling is preferred.

---

## 9. Karak Castle (`KARAK_CASTLE`)

- **EN — Title:** Karak Castle
- **EN — Short:** A great Crusader castle on the King's Highway.
- **EN — Long:** A vast 12th-century Crusader fortress with vaulted halls and tunnels, later expanded under Ayyubid and Mamluk rule.

- **PT — Title:** Castelo de Karak
- **PT — Short:** Um grande castelo dos cruzados na Estrada dos Reis.
- **PT — Long:** Uma vasta fortaleza cruzada do século XII, com salas abobadadas e túneis, posteriormente ampliada sob os domínios aiúbida e mameluco.

- **ES — Title:** Castillo de Karak
- **ES — Short:** Un gran castillo cruzado en el Camino de los Reyes.
- **ES — Long:** Una vasta fortaleza cruzada del siglo XII, con salas abovedadas y túneles, ampliada posteriormente bajo los dominios ayubí y mameluco.

- **AR — Title:** قلعة الكرك
- **AR — Short:** قلعة صليبية كبرى على طريق الملوك.
- **AR — Long:** قلعة صليبية ضخمة من القرن الثاني عشر بقاعاتها المقبّبة وأنفاقها، جرى توسيعها لاحقًا في العهدين الأيوبي والمملوكي.

- **Notes:** "King's Highway" → طريق الملوك (the historic route's common Arabic name).

---

## 10. Little Petra (`LITTLE_PETRA`)

- **EN — Title:** Little Petra
- **EN — Short:** Siq al-Barid — a smaller Nabataean caravan suburb.
- **EN — Long:** A compact carved canyon north of Petra that served as a trading suburb, with painted Hellenistic frescoes in the Painted House.

- **PT — Title:** Pequena Petra
- **PT — Short:** Siq al-Barid — um pequeno subúrbio nabateu de caravanas.
- **PT — Long:** Um compacto desfiladeiro esculpido a norte de Petra que servia de subúrbio comercial, com frescos helenísticos pintados na Casa Pintada.

- **ES — Title:** Pequeña Petra
- **ES — Short:** Siq al-Barid — un pequeño suburbio nabateo de caravanas.
- **ES — Long:** Un compacto cañón tallado al norte de Petra que servía de suburbio comercial, con frescos helenísticos pintados en la Casa Pintada.

- **AR — Title:** البتراء الصغيرة
- **AR — Short:** سيق البارد — ضاحية نبطية صغيرة للقوافل.
- **AR — Long:** وادٍ صغير منحوت إلى الشمال من البتراء كان يُستخدَم ضاحيةً تجارية، وفيه رسوم جدارية هلنستية في "البيت المرسوم".

- **Notes:** "Siq al-Barid" kept transliterated in PT/ES (proper name); AR uses سيق البارد.

---

## 11. Ajloun Castle (`AJLOUN_CASTLE`)

- **EN — Title:** Ajloun Castle
- **EN — Short:** 12th-century Ayyubid hilltop fortress.
- **EN — Long:** Qal'at Ar-Rabad was built by a general of Saladin to control the region and command sweeping views over the northern Jordan Valley.

- **PT — Title:** Castelo de Ajloun
- **PT — Short:** Fortaleza aiúbida do século XII no alto de uma colina.
- **PT — Long:** Qal'at Ar-Rabad foi construído por um general de Saladino para controlar a região e dominar vistas amplas sobre o norte do Vale do Jordão.

- **ES — Title:** Castillo de Ajloun
- **ES — Short:** Fortaleza ayubí del siglo XII en lo alto de una colina.
- **ES — Long:** Qal'at Ar-Rabad fue construido por un general de Saladino para controlar la región y dominar amplias vistas sobre el norte del Valle del Jordán.

- **AR — Title:** قلعة عجلون
- **AR — Short:** قلعة أيوبية من القرن الثاني عشر على قمة تلّة.
- **AR — Long:** بُنيت قلعة الربض على يد أحد قادة صلاح الدين للسيطرة على المنطقة والإشراف على إطلالات واسعة على شمال وادي الأردن.

- **Notes:** AR uses the local name قلعة الربض for "Qal'at Ar-Rabad"; PT/ES keep the transliteration.

---

## 12. Wadi Mujib (`WADI_MUJIB`)

- **EN — Title:** Wadi Mujib
- **EN — Short:** Dramatic canyon reserve descending to the Dead Sea.
- **EN — Long:** The lowest-altitude nature reserve on earth, famous for the adventurous Siq water trail through a sandstone gorge (seasonal), managed by the RSCN.

- **PT — Title:** Wadi Mujib
- **PT — Short:** Espetacular reserva de desfiladeiros que desce até ao Mar Morto.
- **PT — Long:** A reserva natural de menor altitude do mundo, célebre pelo aventuroso percurso aquático do Siq através de uma garganta de arenito (sazonal), gerida pela RSCN.

- **ES — Title:** Wadi Mujib
- **ES — Short:** Espectacular reserva de cañones que desciende hasta el Mar Muerto.
- **ES — Long:** La reserva natural de menor altitud del mundo, célebre por la aventurera ruta acuática del Siq a través de un desfiladero de arenisca (de temporada), gestionada por la RSCN.

- **AR — Title:** وادي الموجب
- **AR — Short:** محمية وديان مذهلة تنحدر نحو البحر الميت.
- **AR — Long:** أخفض محمية طبيعية ارتفاعًا في العالم، تشتهر بمسار "السيق" المائي المغامِر عبر أخدود من الحجر الرملي (موسمي)، وتديرها الجمعية الملكية لحماية الطبيعة.

- **Notes:** "(seasonal)" preserved (the source notes the water trail is seasonal — not an inclusion). RSCN: kept as the acronym in PT/ES; spelled out in AR as الجمعية الملكية لحماية الطبيعة. ⚠️ Confirm preferred treatment of "RSCN" across locales (acronym vs. spelled out).

---

## 13. Downtown Amman (`DOWNTOWN_AMMAN`)

- **EN — Title:** Downtown Amman
- **EN — Short:** The lively old heart of the capital (Al-Balad).
- **EN — Long:** Bustling souks, the Grand Husseini Mosque, traditional coffee houses and street food — the historic commercial centre of Amman.

- **PT — Title:** Centro de Amã (Downtown)
- **PT — Short:** O animado coração antigo da capital (Al-Balad).
- **PT — Long:** Souks movimentados, a Grande Mesquita Al-Husseini, casas de café tradicionais e comida de rua — o centro comercial histórico de Amã.

- **ES — Title:** Centro de Amán (Downtown)
- **ES — Short:** El animado corazón antiguo de la capital (Al-Balad).
- **ES — Long:** Zocos bulliciosos, la Gran Mezquita Al-Husseini, cafeterías tradicionales y comida callejera — el centro comercial histórico de Amán.

- **AR — Title:** وسط البلد – عمّان
- **AR — Short:** قلب العاصمة القديم النابض بالحياة (البلد).
- **AR — Long:** أسواق نابضة بالحياة، ومسجد الحسيني الكبير، ومقاهٍ تقليدية، وأكلات الشارع — المركز التجاري التاريخي لعمّان.

- **Notes:** PT/ES append "(Downtown)" to the title for clarity; drop it if you prefer "Centro de Amã/Amán" alone. "Al-Balad" kept as the local name.

---

## 14. Bethany Beyond the Jordan (`BETHANY_BEYOND_THE_JORDAN`)

- **EN — Title:** Bethany Beyond the Jordan
- **EN — Short:** The baptism site of Jesus Christ (UNESCO).
- **EN — Long:** Al-Maghtas, on the east bank of the Jordan River, is the widely recognised location of the baptism of Jesus and an important pilgrimage destination.

- **PT — Title:** Betânia Além do Jordão
- **PT — Short:** O local do batismo de Jesus Cristo (UNESCO).
- **PT — Long:** Al-Maghtas, na margem oriental do rio Jordão, é o local amplamente reconhecido do batismo de Jesus e um importante destino de peregrinação.

- **ES — Title:** Betania más allá del Jordán
- **ES — Short:** El lugar del bautismo de Jesucristo (UNESCO).
- **ES — Long:** Al-Maghtas, en la ribera oriental del río Jordán, es el lugar ampliamente reconocido del bautismo de Jesús y un importante destino de peregrinación.

- **AR — Title:** المغطس (بيت عنيا عبر الأردن)
- **AR — Short:** موقع تعميد السيد المسيح (اليونسكو).
- **AR — Long:** المغطس، على الضفة الشرقية لنهر الأردن، هو الموقع المعترف به على نطاق واسع لتعميد السيد المسيح، ووجهة حجّ مهمة.

- **Notes:** ⚠️ Religious/cultural phrasing — AR title uses the official local name المغطس with the biblical name in parentheses; "Jesus Christ" → السيد المسيح (common respectful Arabic form). Please have a native reviewer confirm tone/terminology for the target audience.

---

## 15. Umm Qais (`UMM_QAIS`)

- **EN — Title:** Umm Qais
- **EN — Short:** Ruins of Gadara overlooking the Sea of Galilee and Golan Heights.
- **EN — Long:** The Greco-Roman city of Gadara, with its basalt streets, theatre and terraces offering panoramic views across three countries.

- **PT — Title:** Umm Qais
- **PT — Short:** Ruínas de Gadara com vista para o Mar da Galileia e os Montes Golã.
- **PT — Long:** A cidade greco-romana de Gadara, com as suas ruas de basalto, teatro e terraços que oferecem vistas panorâmicas sobre três países.

- **ES — Title:** Umm Qais
- **ES — Short:** Ruinas de Gádara con vistas al Mar de Galilea y los Altos del Golán.
- **ES — Long:** La ciudad grecorromana de Gádara, con sus calles de basalto, su teatro y sus terrazas que ofrecen vistas panorámicas sobre tres países.

- **AR — Title:** أم قيس
- **AR — Short:** أطلال مدينة جدارا المطلّة على بحيرة طبريا ومرتفعات الجولان.
- **AR — Long:** مدينة جدارا اليونانية–الرومانية بشوارعها البازلتية ومسرحها ومصاطبها التي تتيح إطلالات بانورامية على ثلاث دول.

- **Notes:** ⚠️ Geographic naming — "Sea of Galilee" → بحيرة طبريا and "Golan Heights" → مرتفعات الجولان (standard Arabic). These are politically sensitive place names; confirm the preferred forms for your audience.

---

## Items flagged for human review (summary)

- **#7 Mount Nebo** — AR honorific "(عليه السلام)" after Moses (keep for AR vs. match neutral English).
- **#14 Bethany Beyond the Jordan** — AR religious terminology (السيد المسيح) + المغطس/بيت عنيا naming; confirm tone.
- **#8 Madaba** — AR church-name spelling (القديس جاورجيوس).
- **#15 Umm Qais** — AR geographic names (بحيرة طبريا، مرتفعات الجولان) — politically sensitive; confirm.
- **#12 Wadi Mujib** — "RSCN" acronym vs. spelled-out across locales.
- **#13 Downtown Amman** — PT/ES "(Downtown)" suffix in the title — keep or drop.
- **Place-name consistency (cross-cutting)** — verify the recurring proper names are
  rendered consistently across PT / ES / AR everywhere they appear: **Petra, Wadi Rum,
  Jerash, Dead Sea, Mount Nebo, Bethany, Umm Qais** (and the related forms البتراء /
  وادي رم / جرش / البحر الميت / جبل نيبو / المغطس / أم قيس).

General: all translations are assistant-drafted and faithful to the English; a native PT/ES/AR pass is recommended before customer-facing use, but they are already an improvement over English-only fallback.

---

## Cleanup recommendation — `ZZ Verification POI (safe to delete)`

There is one non-real catalog record, `ZZ Verification POI (safe to delete)` (currently
**inactive**), left over from earlier verification. **Recommendation only — not deleted,
and not to be deleted yet.**

- **Preferred:** delete it *later*, **only after confirming no references exist** — i.e.
  it is not linked from any `TouringRouteStop.poiId` and has no `QuoteItineraryDayPoi`
  rows (and no translations worth keeping). A guarded cleanup step would re-check those
  references at run time and no-op if any are found.
- **Safe alternative:** simply **keep it inactive** — inactive POIs are excluded from the
  assignment picker and never appear in proposals, so it has zero customer impact.

No deletion now. Awaiting your decision; if you choose "delete later," that will be a
separate, reference-checked step (not part of the translation seed).

---

## Next step

After you approve this pack (with any edits to the flagged items), **Phase 4A.1** will
apply these PT/ES/AR translations via an **idempotent seed update** (upsert per
`[poiId, locale]`, English untouched), then verify a PT/ES/AR proposal renders the
localized POI content. No database changes happen until then.
