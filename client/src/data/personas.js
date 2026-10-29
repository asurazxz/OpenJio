// Demo accounts. In demo mode, signing in means picking one of these people.

export const PERSONAS = [
  {
    id: 'u-mei',
    name: 'Mei Lin',
    color: 'tomato',
    homeArea: 'tiong-bahru',
    bio: 'Plans the group outings. Will travel for good kopi.',
    interests: { cafes: 1, food: 0.8, arts: 0.6, markets: 0.5 },
    reviewer: true,
  },
  {
    id: 'u-arjun',
    name: 'Arjun Nair',
    color: 'teal',
    homeArea: 'jurong-east',
    bio: 'Board games, bouldering and anything with a scoreboard.',
    interests: { games: 1, outdoors: 0.7, food: 0.6 },
  },
  {
    id: 'u-farah',
    name: 'Farah Ismail',
    color: 'mustard',
    homeArea: 'katong',
    bio: 'Museums by day, live music by night.',
    interests: { museums: 1, music: 0.8, arts: 0.7, food: 0.4 },
  },
  {
    id: 'u-jun',
    name: 'Jun Hao Tan',
    color: 'plum',
    homeArea: 'tampines',
    bio: 'Hawker centre completionist.',
    interests: { food: 1, markets: 0.8, nightlife: 0.5 },
  },
  {
    id: 'u-priya',
    name: 'Priya Raman',
    color: 'sky',
    homeArea: 'holland-village',
    bio: 'Sunrise walks and weekend workshops.',
    interests: { outdoors: 1, wellness: 0.8, workshops: 0.7, cafes: 0.5 },
  },
  {
    id: 'u-daniel',
    name: 'Daniel Ong',
    color: 'tomato',
    homeArea: 'bugis',
    bio: 'Always down for a late dinner.',
    interests: { nightlife: 1, food: 0.8, shopping: 0.5, music: 0.5 },
  },
]

export function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
