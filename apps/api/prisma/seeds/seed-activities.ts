import { PrismaClient } from '@prisma/client';

type ActivityCategoryTag = 'Adventure' | 'Historical' | 'Religious' | 'Islamic' | 'Christian' | 'Cultural' | 'Wellness';

type ActivityVariantSeed = {
  name: string;
  durationHours: number;
  difficulty: string;
  guideRequired: boolean;
  sicPossible: boolean;
  fitnessLevel: string;
  familyFriendly: boolean;
  seasonalRisk: string;
  terrainType: string;
  recommendedPaxRange: string;
  startPoint: string;
  endPoint: string;
  inclusions: string;
  exclusions: string;
  operationalNotes: string;
};

type ActivityMasterSeed = {
  code: string;
  name: string;
  description: string;
  category: string;
  categoryTags: ActivityCategoryTag[];
  city: string;
  region: string;
  durationHours: number | null;
  difficulty: string;
  guideRequired: boolean;
  sicPossible: boolean;
  fitnessLevel: string;
  familyFriendly: boolean;
  seasonalRisk: string;
  terrainType: string;
  recommendedPaxRange: string;
  startPoint: string;
  endPoint: string;
  inclusions: string;
  exclusions: string;
  operationalNotes: string;
  variants: ActivityVariantSeed[];
};

const CANONICAL_REVIEW_NOTE =
  'Golden Jordan canonical Activity Master. Activity infrastructure only; tickets, guides, and excursions remain separate.';

const ACTIVITY_OWNER_COMPANY = {
  name: 'Golden Jordan Activity Operations',
  type: 'supplier',
  country: 'Jordan',
  city: 'Amman',
};

const GOLDEN_JORDAN_ACTIVITY_MASTERS: ActivityMasterSeed[] = [
  {
    code: 'ACT-PETRA-GUIDED-EXPERIENCES',
    name: 'Petra Guided Experiences',
    description: 'Canonical Activity Master for guided Petra site experiences. Tickets remain separate ticketing records.',
    category: 'Historical / Cultural',
    categoryTags: ['Historical', 'Cultural'],
    city: 'Petra',
    region: 'South Jordan',
    durationHours: 3,
    difficulty: 'Easy to moderate',
    guideRequired: true,
    sicPossible: true,
    fitnessLevel: 'Basic walking fitness',
    familyFriendly: true,
    seasonalRisk: 'Heat, crowding, daylight, and Petra authority guidance must be checked before operation.',
    terrainType: 'Archaeological site paths, uneven stone, sand, and steps',
    recommendedPaxRange: '1-35',
    startPoint: 'Petra Visitor Center',
    endPoint: 'Petra basin or trail-specific endpoint',
    inclusions: 'Guided site experience. Entrance tickets are excluded and remain ticketing records.',
    exclusions: 'Petra entrance ticket, meals, water, transport, gratuities, and personal expenses unless separately included.',
    operationalNotes: 'Guide assignment remains separate. Match route length to guest mobility, daylight, and weather.',
    variants: [
      {
        name: 'Main Trail',
        durationHours: 3,
        difficulty: 'Easy to moderate',
        guideRequired: true,
        sicPossible: true,
        fitnessLevel: 'Basic walking fitness',
        familyFriendly: true,
        seasonalRisk: 'Heat and crowding risk in peak periods.',
        terrainType: 'Main archaeological trail with uneven sections',
        recommendedPaxRange: '1-35',
        startPoint: 'Petra Visitor Center',
        endPoint: 'Petra basin',
        inclusions: 'Guided walk along the Siq, Treasury, Street of Facades, theatre, and basin area.',
        exclusions: 'Entrance ticket, transport, meals, and gratuities.',
        operationalNotes: 'Default guided Petra experience for most groups.',
      },
      {
        name: 'Monastery Trail',
        durationHours: 5,
        difficulty: 'Moderate',
        guideRequired: true,
        sicPossible: true,
        fitnessLevel: 'Moderate stair-climbing fitness',
        familyFriendly: false,
        seasonalRisk: 'Heat and daylight risk; avoid late starts in summer.',
        terrainType: 'Long site walk with many steps to Monastery',
        recommendedPaxRange: '1-20',
        startPoint: 'Petra Visitor Center',
        endPoint: 'Monastery viewpoint',
        inclusions: 'Guided Petra main route extended to Monastery.',
        exclusions: 'Entrance ticket, transport, meals, water, and gratuities.',
        operationalNotes: 'Confirm fitness and timing before operation.',
      },
      {
        name: 'Treasury Viewpoint',
        durationHours: 2,
        difficulty: 'Moderate',
        guideRequired: true,
        sicPossible: false,
        fitnessLevel: 'Steady mobility and comfort with heights',
        familyFriendly: false,
        seasonalRisk: 'Heat and access-permission risk.',
        terrainType: 'Short steep viewpoint access and uneven steps',
        recommendedPaxRange: '1-10',
        startPoint: 'Treasury area',
        endPoint: 'Treasury viewpoint',
        inclusions: 'Guided access to a Treasury viewpoint where locally permitted.',
        exclusions: 'Entrance ticket, local access fees if applicable, meals, water, transport, and gratuities.',
        operationalNotes: 'Access permissions and safety conditions must be checked locally.',
      },
      {
        name: 'Back Trail',
        durationHours: 4,
        difficulty: 'Moderate to challenging',
        guideRequired: true,
        sicPossible: false,
        fitnessLevel: 'Good walking fitness and uneven-terrain confidence',
        familyFriendly: false,
        seasonalRisk: 'Weather, heat, and route-condition risk.',
        terrainType: 'Mountain trail and uneven back-route paths',
        recommendedPaxRange: '1-12',
        startPoint: 'Little Petra / back trail access',
        endPoint: 'Monastery or Petra basin',
        inclusions: 'Guided Petra back-trail experience.',
        exclusions: 'Entrance ticket, transport, meals, water, and gratuities.',
        operationalNotes: 'Operate only with suitable guide, weather, and guest fitness.',
      },
    ],
  },
  {
    code: 'PETRA_HIKING_EXPERIENCES',
    name: 'Petra Hiking Experiences',
    description: 'Canonical Activity Master for Petra hiking trail experiences. Preserves the existing Petra Hiking architecture.',
    category: 'Adventure / Historical',
    categoryTags: ['Adventure', 'Historical', 'Cultural'],
    city: 'Petra',
    region: 'South Jordan',
    durationHours: 4,
    difficulty: 'Moderate to strenuous',
    guideRequired: true,
    sicPossible: false,
    fitnessLevel: 'Moderate to strong hiking fitness',
    familyFriendly: false,
    seasonalRisk: 'Heat, daylight, weather, and flash-flood risk must be checked before operation.',
    terrainType: 'Mountain trails, steps, uneven paths, and exposed viewpoints',
    recommendedPaxRange: '1-12',
    startPoint: 'Petra visitor area or trail-specific trailhead',
    endPoint: 'Trail-specific endpoint',
    inclusions: 'Guided hiking experience. Entrance tickets are excluded and remain ticketing records.',
    exclusions: 'Petra entrance ticket, meals, water, transport, gratuities, and personal expenses unless separately included.',
    operationalNotes: 'Guide assignment remains separate. Maintain existing Petra Hiking variants and metadata.',
    variants: [
      {
        name: 'Monastery Trail',
        durationHours: 3,
        difficulty: 'Moderate',
        guideRequired: true,
        sicPossible: false,
        fitnessLevel: 'Moderate stair-climbing fitness',
        familyFriendly: false,
        seasonalRisk: 'Heat and daylight risk.',
        terrainType: 'Steps and mountain trail',
        recommendedPaxRange: '1-12',
        startPoint: 'Petra main trail / basin area',
        endPoint: 'Monastery viewpoint',
        inclusions: 'Guided hike to the Monastery.',
        exclusions: 'Entrance ticket, transport, meals, water, and gratuities.',
        operationalNotes: 'Local Petra guide or official accompanying guide accepted where operationally allowed.',
      },
      {
        name: 'Treasury Viewpoint Trail',
        durationHours: 2,
        difficulty: 'Moderate',
        guideRequired: true,
        sicPossible: false,
        fitnessLevel: 'Steady mobility and no vertigo concerns',
        familyFriendly: false,
        seasonalRisk: 'Access-permission, heat, and crowding risk.',
        terrainType: 'Short steep viewpoint trail',
        recommendedPaxRange: '1-10',
        startPoint: 'Treasury area',
        endPoint: 'Treasury viewpoint',
        inclusions: 'Guided viewpoint hike where locally permitted.',
        exclusions: 'Entrance ticket, access fees if applicable, meals, water, transport, and gratuities.',
        operationalNotes: 'Check local permissions before confirming.',
      },
      {
        name: 'Back Trail',
        durationHours: 4,
        difficulty: 'Moderate to challenging',
        guideRequired: true,
        sicPossible: false,
        fitnessLevel: 'Good walking fitness',
        familyFriendly: false,
        seasonalRisk: 'Weather, daylight, and route-condition risk.',
        terrainType: 'Uneven back-route mountain trail',
        recommendedPaxRange: '1-12',
        startPoint: 'Little Petra / back trail access',
        endPoint: 'Monastery or Petra basin',
        inclusions: 'Guided back-trail hiking experience.',
        exclusions: 'Entrance ticket, transport, meals, water, and gratuities.',
        operationalNotes: 'Local Petra guide required.',
      },
    ],
  },
  {
    code: 'ACT-WADI-RUM-JEEP-EXPERIENCES',
    name: 'Wadi Rum Jeep Experiences',
    description: 'Canonical Activity Master for Wadi Rum jeep-based desert experiences.',
    category: 'Adventure / Cultural',
    categoryTags: ['Adventure', 'Cultural'],
    city: 'Wadi Rum',
    region: 'South Jordan',
    durationHours: 4,
    difficulty: 'Easy',
    guideRequired: false,
    sicPossible: true,
    fitnessLevel: 'Low fitness requirement',
    familyFriendly: true,
    seasonalRisk: 'Heat, dust, wind, low visibility, and flash-flood risk in desert conditions.',
    terrainType: 'Desert tracks and sand',
    recommendedPaxRange: '1-48',
    startPoint: 'Wadi Rum Visitor Center or camp',
    endPoint: 'Wadi Rum camp or visitor center',
    inclusions: 'Jeep operation and driver-led desert routing as contracted.',
    exclusions: 'Wadi Rum entrance ticket, meals, camp stays, guide services, and gratuities unless separately included.',
    operationalNotes: 'Jeep supplier, capacity, and pickup point must be confirmed separately.',
    variants: [
      {
        name: '2h Jeep Tour',
        durationHours: 2,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: true,
        seasonalRisk: 'Heat and dust risk.',
        terrainType: 'Desert tracks and sand',
        recommendedPaxRange: '1-48',
        startPoint: 'Wadi Rum Visitor Center or camp',
        endPoint: 'Wadi Rum Visitor Center or camp',
        inclusions: 'Two-hour jeep routing through selected desert stops.',
        exclusions: 'Entrance ticket, meals, guide, and gratuities.',
        operationalNotes: 'Suitable for tight schedules and SIC operations.',
      },
      {
        name: '4h Jeep Tour',
        durationHours: 4,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: true,
        seasonalRisk: 'Heat, dust, and wind risk.',
        terrainType: 'Desert tracks and sand',
        recommendedPaxRange: '1-48',
        startPoint: 'Wadi Rum Visitor Center or camp',
        endPoint: 'Wadi Rum Visitor Center or camp',
        inclusions: 'Four-hour jeep routing through major desert stops.',
        exclusions: 'Entrance ticket, meals, guide, and gratuities.',
        operationalNotes: 'Default Wadi Rum jeep experience.',
      },
      {
        name: 'Sunset Jeep Tour',
        durationHours: 3,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: true,
        seasonalRisk: 'Sunset timing, wind, dust, and visibility risk.',
        terrainType: 'Desert tracks and viewpoint stops',
        recommendedPaxRange: '1-48',
        startPoint: 'Wadi Rum camp or visitor center',
        endPoint: 'Sunset viewpoint or camp',
        inclusions: 'Jeep routing timed around sunset.',
        exclusions: 'Entrance ticket, meals, guide, and gratuities.',
        operationalNotes: 'Confirm sunset timing and return lighting.',
      },
      {
        name: 'Stargazing Experience',
        durationHours: 2,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: true,
        seasonalRisk: 'Moon phase, clouds, cold nights, and wind risk.',
        terrainType: 'Desert night viewing area',
        recommendedPaxRange: '1-40',
        startPoint: 'Wadi Rum camp',
        endPoint: 'Wadi Rum camp',
        inclusions: 'Night desert stargazing experience as contracted.',
        exclusions: 'Specialist astronomy guide, meals, transport outside Wadi Rum, and gratuities unless separately included.',
        operationalNotes: 'Check moon phase and weather before confirming.',
      },
    ],
  },
  {
    code: 'ACT-WADI-RUM-DESERT-EXPERIENCES',
    name: 'Wadi Rum Desert Experiences',
    description: 'Canonical Activity Master for non-jeep Wadi Rum desert experiences.',
    category: 'Adventure / Cultural',
    categoryTags: ['Adventure', 'Cultural'],
    city: 'Wadi Rum',
    region: 'South Jordan',
    durationHours: 2,
    difficulty: 'Easy to moderate',
    guideRequired: false,
    sicPossible: true,
    fitnessLevel: 'Low to moderate fitness',
    familyFriendly: true,
    seasonalRisk: 'Heat, cold nights, wind, dust, and desert visibility risk.',
    terrainType: 'Desert sand, camp areas, and short walking routes',
    recommendedPaxRange: '1-40',
    startPoint: 'Wadi Rum camp',
    endPoint: 'Wadi Rum camp',
    inclusions: 'Desert experience as contracted.',
    exclusions: 'Entrance ticket, transfers, meals, overnight stay, specialist guide, and gratuities unless separately included.',
    operationalNotes: 'Supplier operation, camp location, and safety requirements must be confirmed separately.',
    variants: [
      {
        name: 'Camel Ride',
        durationHours: 1,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Basic mobility',
        familyFriendly: true,
        seasonalRisk: 'Heat and animal welfare constraints.',
        terrainType: 'Desert sand route',
        recommendedPaxRange: '1-20',
        startPoint: 'Wadi Rum camp or camel station',
        endPoint: 'Wadi Rum camp or camel station',
        inclusions: 'Short camel ride as contracted.',
        exclusions: 'Entrance ticket, meals, transport, and gratuities.',
        operationalNotes: 'Confirm animal availability and guest suitability.',
      },
      {
        name: 'Desert Camp Dinner',
        durationHours: 2,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: true,
        seasonalRisk: 'Cold nights and wind risk.',
        terrainType: 'Camp setting',
        recommendedPaxRange: '2-80',
        startPoint: 'Wadi Rum camp',
        endPoint: 'Wadi Rum camp',
        inclusions: 'Camp dinner experience as contracted.',
        exclusions: 'Transfers, entrance ticket, overnight stay, drinks, and gratuities unless separately included.',
        operationalNotes: 'Dietary requirements and camp access must be confirmed.',
      },
    ],
  },
  {
    code: 'ACT-JERASH-GUIDED-EXPERIENCES',
    name: 'Jerash Guided Experiences',
    description: 'Canonical Activity Master for guided Jerash archaeological experiences.',
    category: 'Historical / Cultural',
    categoryTags: ['Historical', 'Cultural'],
    city: 'Jerash',
    region: 'North Jordan',
    durationHours: 2,
    difficulty: 'Easy to moderate',
    guideRequired: true,
    sicPossible: true,
    fitnessLevel: 'Basic walking fitness',
    familyFriendly: true,
    seasonalRisk: 'Heat and crowding risk in exposed archaeological areas.',
    terrainType: 'Archaeological paving, steps, and exposed walking areas',
    recommendedPaxRange: '1-40',
    startPoint: 'Jerash Visitor Center',
    endPoint: 'Jerash archaeological site exit',
    inclusions: 'Guided Jerash site experience. Entrance tickets are excluded and remain ticketing records.',
    exclusions: 'Entrance ticket, transport, meals, and gratuities unless separately included.',
    operationalNotes: 'Guide assignment remains separate.',
    variants: [
      {
        name: 'Classic Jerash Guided Visit',
        durationHours: 2,
        difficulty: 'Easy to moderate',
        guideRequired: true,
        sicPossible: true,
        fitnessLevel: 'Basic walking fitness',
        familyFriendly: true,
        seasonalRisk: 'Heat in exposed areas.',
        terrainType: 'Roman archaeological site paths',
        recommendedPaxRange: '1-40',
        startPoint: 'Jerash Visitor Center',
        endPoint: 'Jerash archaeological site exit',
        inclusions: 'Guided route through major Jerash monuments.',
        exclusions: 'Entrance ticket, transport, meals, and gratuities.',
        operationalNotes: 'Default Jerash guided experience.',
      },
    ],
  },
  {
    code: 'ACT-AJLOUN-CASTLE-EXPERIENCES',
    name: 'Ajloun Castle Experiences',
    description: 'Canonical Activity Master for Ajloun Castle cultural visits.',
    category: 'Historical / Cultural',
    categoryTags: ['Historical', 'Cultural'],
    city: 'Ajloun',
    region: 'North Jordan',
    durationHours: 1.5,
    difficulty: 'Easy to moderate',
    guideRequired: false,
    sicPossible: true,
    fitnessLevel: 'Basic stair mobility',
    familyFriendly: true,
    seasonalRisk: 'Slippery surfaces in wet weather and crowding risk.',
    terrainType: 'Castle stairs, stone corridors, and viewpoints',
    recommendedPaxRange: '1-35',
    startPoint: 'Ajloun Castle entrance',
    endPoint: 'Ajloun Castle exit',
    inclusions: 'Castle visit experience. Entrance tickets are excluded and remain ticketing records.',
    exclusions: 'Entrance ticket, transport, meals, guide, and gratuities unless separately included.',
    operationalNotes: 'Guide can be assigned separately for historical interpretation.',
    variants: [
      {
        name: 'Ajloun Castle Visit',
        durationHours: 1.5,
        difficulty: 'Easy to moderate',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Basic stair mobility',
        familyFriendly: true,
        seasonalRisk: 'Wet weather and stair safety risk.',
        terrainType: 'Castle stairs and stone walkways',
        recommendedPaxRange: '1-35',
        startPoint: 'Ajloun Castle entrance',
        endPoint: 'Ajloun Castle exit',
        inclusions: 'Operational castle visit block.',
        exclusions: 'Entrance ticket, transport, guide, meals, and gratuities.',
        operationalNotes: 'Allow extra time for large groups on stairs.',
      },
    ],
  },
  {
    code: 'ACT-BLESSED-TREE-HERITAGE-EXPERIENCES',
    name: 'Blessed Tree Heritage Experiences',
    description: 'Canonical Activity Master for Blessed Tree religious heritage visits.',
    category: 'Religious / Islamic / Cultural',
    categoryTags: ['Religious', 'Islamic', 'Cultural'],
    city: 'Safawi',
    region: 'East Jordan',
    durationHours: 1,
    difficulty: 'Easy',
    guideRequired: false,
    sicPossible: false,
    fitnessLevel: 'Low fitness requirement',
    familyFriendly: true,
    seasonalRisk: 'Remote desert heat, wind, and long-distance access risk.',
    terrainType: 'Desert heritage site',
    recommendedPaxRange: '1-25',
    startPoint: 'Blessed Tree site access',
    endPoint: 'Blessed Tree site access',
    inclusions: 'Heritage site visit block. Tickets or permissions remain separate where applicable.',
    exclusions: 'Transport, meals, specialist religious guide, permissions, and gratuities unless separately included.',
    operationalNotes: 'Check access, road condition, prayer timing, and heat exposure.',
    variants: [
      {
        name: 'Blessed Tree Site Visit',
        durationHours: 1,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: false,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: true,
        seasonalRisk: 'Remote desert heat and wind risk.',
        terrainType: 'Desert heritage site',
        recommendedPaxRange: '1-25',
        startPoint: 'Blessed Tree site access',
        endPoint: 'Blessed Tree site access',
        inclusions: 'Operational visit at Blessed Tree site.',
        exclusions: 'Transport, permissions, meals, specialist guide, and gratuities.',
        operationalNotes: 'Best handled as part of a long-distance Islamic heritage route.',
      },
    ],
  },
  {
    code: 'ACT-JORDAN-VALLEY-ISLAMIC-HERITAGE-EXPERIENCES',
    name: 'Jordan Valley Islamic Heritage Experiences',
    description: 'Canonical Activity Master for Jordan Valley Islamic heritage site visits.',
    category: 'Religious / Islamic / Cultural',
    categoryTags: ['Religious', 'Islamic', 'Cultural'],
    city: 'Jordan Valley',
    region: 'Jordan Valley',
    durationHours: 3,
    difficulty: 'Easy',
    guideRequired: false,
    sicPossible: false,
    fitnessLevel: 'Low walking fitness',
    familyFriendly: true,
    seasonalRisk: 'Heat and site-access timing risk in the Jordan Valley.',
    terrainType: 'Lowland heritage sites and short walks',
    recommendedPaxRange: '1-30',
    startPoint: 'Jordan Valley Islamic site circuit',
    endPoint: 'Jordan Valley Islamic site circuit',
    inclusions: 'Islamic heritage site visit block. Tickets or permissions remain separate where applicable.',
    exclusions: 'Transport, meals, specialist religious guide, permissions, and gratuities unless separately included.',
    operationalNotes: 'Match sites to route timing and prayer schedule.',
    variants: [
      {
        name: 'Jordan Valley Islamic Sites Circuit',
        durationHours: 3,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: false,
        fitnessLevel: 'Low walking fitness',
        familyFriendly: true,
        seasonalRisk: 'Heat risk, especially in summer.',
        terrainType: 'Short walks across heritage sites',
        recommendedPaxRange: '1-30',
        startPoint: 'Jordan Valley Islamic site circuit',
        endPoint: 'Jordan Valley Islamic site circuit',
        inclusions: 'Operational site circuit block.',
        exclusions: 'Transport, entrance/permission fees, meals, specialist guide, and gratuities.',
        operationalNotes: 'Confirm which shrines/sites are included before operation.',
      },
    ],
  },
  {
    code: 'ACT-CAVE-SEVEN-SLEEPERS-EXPERIENCES',
    name: 'Cave of the Seven Sleepers Experiences',
    description: 'Canonical Activity Master for Cave of the Seven Sleepers religious and cultural visits.',
    category: 'Religious / Islamic / Christian / Cultural',
    categoryTags: ['Religious', 'Islamic', 'Christian', 'Cultural'],
    city: 'Amman',
    region: 'Central Jordan',
    durationHours: 1,
    difficulty: 'Easy',
    guideRequired: false,
    sicPossible: true,
    fitnessLevel: 'Low walking fitness',
    familyFriendly: true,
    seasonalRisk: 'Crowding and heat risk.',
    terrainType: 'Short site walk and cave access area',
    recommendedPaxRange: '1-35',
    startPoint: 'Cave of the Seven Sleepers site entrance',
    endPoint: 'Cave of the Seven Sleepers site exit',
    inclusions: 'Religious heritage visit block.',
    exclusions: 'Transport, specialist religious guide, donations/fees, meals, and gratuities unless separately included.',
    operationalNotes: 'Culturally sensitive briefing recommended. Guide remains separate if needed.',
    variants: [
      {
        name: 'Seven Sleepers Site Visit',
        durationHours: 1,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low walking fitness',
        familyFriendly: true,
        seasonalRisk: 'Crowding and heat risk.',
        terrainType: 'Short site walk',
        recommendedPaxRange: '1-35',
        startPoint: 'Site entrance',
        endPoint: 'Site exit',
        inclusions: 'Operational site visit block.',
        exclusions: 'Transport, guide, meals, fees/donations, and gratuities.',
        operationalNotes: 'Suitable as a short Amman-area religious/cultural stop.',
      },
    ],
  },
  {
    code: 'ACT-BETHANY-SPIRITUAL-EXPERIENCES',
    name: 'Bethany Spiritual Experiences',
    description: 'Canonical Activity Master for Bethany Beyond the Jordan spiritual visits.',
    category: 'Religious / Christian / Cultural',
    categoryTags: ['Religious', 'Christian', 'Cultural'],
    city: 'Bethany',
    region: 'Jordan Valley',
    durationHours: 2,
    difficulty: 'Easy',
    guideRequired: false,
    sicPossible: true,
    fitnessLevel: 'Low walking fitness',
    familyFriendly: true,
    seasonalRisk: 'Heat, sun exposure, and site shuttle timing risk.',
    terrainType: 'Managed religious site paths and shuttle routing',
    recommendedPaxRange: '1-40',
    startPoint: 'Bethany visitor reception',
    endPoint: 'Bethany visitor reception',
    inclusions: 'Spiritual site visit block. Entrance tickets are excluded and remain ticketing records.',
    exclusions: 'Entrance ticket, transport, specialist religious guide, meals, and gratuities unless separately included.',
    operationalNotes: 'Coordinate ticketing and site shuttle timing separately.',
    variants: [
      {
        name: 'Bethany Site Visit',
        durationHours: 2,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low walking fitness',
        familyFriendly: true,
        seasonalRisk: 'Heat and site shuttle timing risk.',
        terrainType: 'Managed site paths',
        recommendedPaxRange: '1-40',
        startPoint: 'Bethany visitor reception',
        endPoint: 'Bethany visitor reception',
        inclusions: 'Operational Bethany spiritual visit block.',
        exclusions: 'Entrance ticket, transport, specialist guide, meals, and gratuities.',
        operationalNotes: 'Ticketing remains separate.',
      },
    ],
  },
  {
    code: 'ACT-DEAD-SEA-RELAXATION-EXPERIENCES',
    name: 'Dead Sea Relaxation Experiences',
    description: 'Canonical Activity Master for Dead Sea wellness and relaxation experiences.',
    category: 'Wellness / Cultural',
    categoryTags: ['Wellness', 'Cultural'],
    city: 'Dead Sea',
    region: 'Dead Sea',
    durationHours: 3,
    difficulty: 'Easy',
    guideRequired: false,
    sicPossible: true,
    fitnessLevel: 'Low fitness requirement',
    familyFriendly: true,
    seasonalRisk: 'Extreme heat, sun exposure, dehydration, and pool/beach access risk.',
    terrainType: 'Resort, beach, pool, and lowland wellness areas',
    recommendedPaxRange: '1-80',
    startPoint: 'Dead Sea hotel or beach club',
    endPoint: 'Dead Sea hotel or beach club',
    inclusions: 'Dead Sea relaxation block as contracted.',
    exclusions: 'Day-use ticket, meals, spa treatments, towels, transport, and gratuities unless separately included.',
    operationalNotes: 'Day-use access, hotel rules, and swim safety remain separately confirmed.',
    variants: [
      {
        name: 'Dead Sea Beach Day Use',
        durationHours: 4,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: true,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: true,
        seasonalRisk: 'Extreme heat and dehydration risk.',
        terrainType: 'Beach club or hotel beach area',
        recommendedPaxRange: '1-80',
        startPoint: 'Dead Sea hotel or beach club',
        endPoint: 'Dead Sea hotel or beach club',
        inclusions: 'Day-use relaxation block as contracted.',
        exclusions: 'Day-use ticket if not contracted, meals, spa, transport, towels, and gratuities.',
        operationalNotes: 'Confirm day-use inclusions and access hours.',
      },
      {
        name: 'Dead Sea Spa Add-on',
        durationHours: 2,
        difficulty: 'Easy',
        guideRequired: false,
        sicPossible: false,
        fitnessLevel: 'Low fitness requirement',
        familyFriendly: false,
        seasonalRisk: 'Treatment availability and medical suitability risk.',
        terrainType: 'Spa and resort facilities',
        recommendedPaxRange: '1-20',
        startPoint: 'Dead Sea resort spa',
        endPoint: 'Dead Sea resort spa',
        inclusions: 'Spa/wellness add-on as contracted.',
        exclusions: 'Treatments not contracted, transport, meals, and gratuities.',
        operationalNotes: 'Confirm treatment slots, age limits, and contraindications.',
      },
    ],
  },
];

function normalizeActivityReviewKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function toDurationMinutes(durationHours: number | null) {
  return durationHours === null ? null : Math.round(durationHours * 60);
}

function buildMasterData(master: ActivityMasterSeed, supplierCompanyId: string) {
  return {
    name: master.name,
    description: master.description,
    category: master.category,
    categoryTags: master.categoryTags,
    city: master.city,
    region: master.region,
    supplierCompanyId,
    pricingBasis: 'PER_GROUP' as const,
    costPrice: 0,
    sellPrice: 0,
    durationMinutes: toDurationMinutes(master.durationHours),
    durationHours: master.durationHours,
    difficulty: master.difficulty,
    guideRequired: master.guideRequired,
    sicPossible: master.sicPossible,
    fitnessLevel: master.fitnessLevel,
    familyFriendly: master.familyFriendly,
    seasonalRisk: master.seasonalRisk,
    terrainType: master.terrainType,
    recommendedPaxRange: master.recommendedPaxRange,
    startPoint: master.startPoint,
    endPoint: master.endPoint,
    inclusions: master.inclusions,
    exclusions: master.exclusions,
    operationalNotes: master.operationalNotes,
    reviewNotes: CANONICAL_REVIEW_NOTE,
    active: true,
  };
}

function buildVariantData(variant: ActivityVariantSeed, index: number, activityId: string) {
  return {
    activityId,
    name: variant.name,
    durationMinutes: toDurationMinutes(variant.durationHours),
    durationHours: variant.durationHours,
    pricingBasis: 'PER_GROUP' as const,
    currency: 'JOD',
    costPrice: 0,
    sellPrice: 0,
    minPax: 1,
    maxPax: Number(variant.recommendedPaxRange.split('-')[1] || 99),
    maxPaxPerUnit: null,
    capacityPricing: false,
    active: true,
    notes: 'Canonical Golden Jordan activity variant. Pricing is intentionally not seeded here.',
    difficulty: variant.difficulty,
    guideRequired: variant.guideRequired,
    guideRequirement: variant.guideRequired ? ('BOTH_ACCEPTED' as const) : null,
    sicPossible: variant.sicPossible,
    fitnessLevel: variant.fitnessLevel,
    familyFriendly: variant.familyFriendly,
    seasonalRisk: variant.seasonalRisk,
    terrainType: variant.terrainType,
    recommendedPaxRange: variant.recommendedPaxRange,
    meetingPoint: variant.startPoint,
    startPoint: variant.startPoint,
    endPoint: variant.endPoint,
    operationalNotes: variant.operationalNotes,
    suitability: variant.familyFriendly ? 'Suitable for families subject to age, heat, and mobility review.' : 'Review age, fitness, and mobility before confirming.',
    fitnessNotes: variant.fitnessLevel,
    waterNotes: 'Carry water appropriate to weather, route duration, and guest profile.',
    seasonalNotes: variant.seasonalRisk,
    inclusions: variant.inclusions,
    exclusions: variant.exclusions,
    sortOrder: index,
  };
}

async function ensureActivityOwnerCompany(prisma: PrismaClient) {
  const existing = await prisma.company.findFirst({
    where: { name: { equals: ACTIVITY_OWNER_COMPANY.name, mode: 'insensitive' } },
  });
  if (existing) {
    return existing;
  }

  return prisma.company.create({ data: ACTIVITY_OWNER_COMPANY });
}

async function syncVariants(prisma: PrismaClient, activityId: string, variants: ActivityVariantSeed[]) {
  const existingVariants = await prisma.activityRateVariant.findMany({
    where: { activityId },
    select: { id: true, name: true },
  });
  const existingByName = new Map(existingVariants.map((variant) => [normalizeActivityReviewKey(variant.name), variant]));
  const retainedIds = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const [index, variant] of variants.entries()) {
    const existing = existingByName.get(normalizeActivityReviewKey(variant.name));
    const data = buildVariantData(variant, index, activityId);
    if (existing) {
      retainedIds.add(existing.id);
      await prisma.activityRateVariant.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      const createdVariant = await prisma.activityRateVariant.create({ data });
      retainedIds.add(createdVariant.id);
      created += 1;
    }
  }

  const removedIds = existingVariants.map((variant) => variant.id).filter((id) => !retainedIds.has(id));
  if (removedIds.length > 0) {
    await prisma.activityRateVariant.updateMany({
      where: { id: { in: removedIds } },
      data: { active: false },
    });
  }

  return { created, updated };
}

async function seedGoldenJordanActivities(prisma: PrismaClient) {
  const supplierCompany = await ensureActivityOwnerCompany(prisma);
  const canonicalCodes = GOLDEN_JORDAN_ACTIVITY_MASTERS.map((master) => master.code);
  const existingMasters = await prisma.activity.findMany({
    where: { code: { in: canonicalCodes } },
    select: { code: true },
  });
  const existingCodes = new Set(existingMasters.map((master) => master.code));
  const canonicalByReviewKey = new Map(
    GOLDEN_JORDAN_ACTIVITY_MASTERS.map((master) => [normalizeActivityReviewKey(master.name), master]),
  );

  let created = 0;
  let updated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;
  let duplicatesFlagged = 0;

  for (const master of GOLDEN_JORDAN_ACTIVITY_MASTERS) {
    const activity = await prisma.activity.upsert({
      where: { code: master.code },
      update: buildMasterData(master, supplierCompany.id),
      create: {
        code: master.code,
        ...buildMasterData(master, supplierCompany.id),
      },
    });

    if (existingCodes.has(master.code)) {
      updated += 1;
    } else {
      created += 1;
    }

    const variantSummary = await syncVariants(prisma, activity.id, master.variants);
    variantsCreated += variantSummary.created;
    variantsUpdated += variantSummary.updated;
  }

  const legacyActivities = await prisma.activity.findMany({
    where: { code: { notIn: canonicalCodes } },
    select: { id: true, code: true, name: true, description: true, reviewNotes: true },
  });

  for (const legacyActivity of legacyActivities) {
    const matched = canonicalByReviewKey.get(
      normalizeActivityReviewKey(legacyActivity.name || legacyActivity.description || ''),
    );
    if (!matched) {
      continue;
    }

    const reviewNotes = `Review duplicate/similar legacy activity against canonical ${matched.code}. Do not delete automatically.`;
    if (legacyActivity.reviewNotes === reviewNotes) {
      continue;
    }

    await prisma.activity.update({
      where: { id: legacyActivity.id },
      data: { reviewNotes },
    });
    duplicatesFlagged += 1;
  }

  const validatedMasters = await prisma.activity.count({ where: { code: { in: canonicalCodes } } });
  const validatedVariants = await prisma.activityRateVariant.count({
    where: { activity: { code: { in: canonicalCodes } }, active: true },
  });
  const expectedVariants = GOLDEN_JORDAN_ACTIVITY_MASTERS.reduce((sum, master) => sum + master.variants.length, 0);

  if (validatedMasters !== GOLDEN_JORDAN_ACTIVITY_MASTERS.length) {
    throw new Error(
      `Golden Jordan Activity Master validation failed: expected ${GOLDEN_JORDAN_ACTIVITY_MASTERS.length}, found ${validatedMasters}.`,
    );
  }
  if (validatedVariants !== expectedVariants) {
    throw new Error(`Golden Jordan Activity Variant validation failed: expected ${expectedVariants}, found ${validatedVariants}.`);
  }

  return {
    created,
    updated,
    variantsCreated,
    variantsUpdated,
    duplicatesFlagged,
    validatedMasters,
    validatedVariants,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await seedGoldenJordanActivities(prisma);
    console.log('Golden Jordan activity seed complete');
    console.log(`created: ${summary.created}`);
    console.log(`updated: ${summary.updated}`);
    console.log(`variants created: ${summary.variantsCreated}`);
    console.log(`variants updated: ${summary.variantsUpdated}`);
    console.log(`duplicates flagged: ${summary.duplicatesFlagged}`);
    console.log(`validated activity masters: ${summary.validatedMasters}`);
    console.log(`validated variants: ${summary.validatedVariants}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Golden Jordan activity seed failed');
  console.error(error);
  process.exit(1);
});
