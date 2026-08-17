// =========================================================================
// 🎮 Esport — compétitions, rosters, tournois.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'esport',
  label: 'Esport',
  description: 'Compétitions, rosters, tournois et scènes FR / internationales.',
  mode: 'fr-intl',

  searchTerms:
    '(esport OR esports OR e-sport OR VCT OR LEC OR LCK OR LFL OR LCS OR EWC OR "Esports World Cup" OR CS2 OR "Counter-Strike" OR BLAST OR IEM OR PGL OR RLCS OR roster OR "mercato esport" OR playoffs OR qualifiers)',

  // "mercato" et "transfer" seuls sont bannis à dessein : ce sont les mots
  // génériques du marché des transferts dans TOUS les sports (foot, rugby,
  // basket...), pas spécifiques à l'esport. La source "L'Équipe Esport"
  // cherche sur lequipe.fr, un domaine généraliste - un "mercato" foot passait
  // le filtre à cause de ce mot seul (ex. transfert de Rodri au FC Barcelone).
  // On les garde uniquement scopés à l'esport ; les noms de jeu/ligue/orga
  // ci-dessous suffisent à couvrir les vraies news de recrutement esport.
  positiveKeywords: [
    'esport', 'e-sport', 'esports', 'league of legends', 'valorant', 'counter-strike', 'cs2',
    'rocket league', 'dota 2', 'overwatch', 'lec', 'lck', 'lfl', 'lcs', 'vct', 'rlcs', 'blast',
    'iem', 'pgl', 'ewc', 'esports world cup', 'playoffs', 'qualifier', 'qualifications',
    'tournament', 'tournoi', 'roster', 'mercato esport', 'transfert esport', 'bench', 'team vitality',
    'karmine', 'fnatic', 'g2 esports', 'hltv', 'stage 1', 'bracket', 'worlds', 'msi'
  ],

  negativeKeywords: [
    'how to complete', 'questline', 'quest line', 'week ', 'challenges', 'challenge guide',
    'where to find', 'how to solve', 'how to earn', 'unlock ', 'walkthrough', 'loadout',
    'build guide', 'codes ', 'camos', 'weapon prestige', 'night market', 'far far west',
    'tier list', 'patch notes', 'notes de patch', 'carte interactive', 'soluce',
    'planning des patchs', 'boutique officielle', 'nos partenaires', 'nos ambassadeurs',
    'maillot ', 'tapis de souris', 't-shirt', 'accueil - mandatory'
  ],

  maxAgeDays: { google: 3, rss: 7 },
  caps: { fr: 14, intl: 18, total: 36 },

  editorialHints: [
    "- Ignore guides, quêtes, patch notes génériques, culture gaming hors compétition.",
    "- Ne déforme pas le niveau de compétition : qualifier, playoffs, phase de groupes, ligue régionale, tournoi principal restent distincts.",
    "- Si un article parle de qualifications EMEA pour un tournoi, écris 'qualifications EMEA pour <tournoi>', jamais 'au <tournoi>'."
  ].join('\n'),

  sources: [
    { name: 'Mandatory.gg',           region: 'fr',   method: 'google', siteDomain: 'mandatory.gg',     max: 5 },
    { name: 'Millenium',              region: 'fr',   method: 'google', siteDomain: 'millenium.org',    max: 5 },
    { name: 'Team-aAa',               region: 'fr',   method: 'rss',    url: 'https://www.team-aaa.com/rss/full.xml', max: 7 },
    { name: 'Breakflip',              region: 'fr',   method: 'google', siteDomain: 'breakflip.com',    max: 5 },
    { name: "L'Équipe Esport",        region: 'fr',   method: 'google', siteDomain: 'lequipe.fr',       max: 4 },
    { name: 'Dot Esports',            region: 'intl', method: 'rss',    url: 'https://dotesports.com/feed', max: 6 },
    { name: 'Dexerto Esports',        region: 'intl', method: 'rss',    url: 'https://www.dexerto.com/esports/feed/', max: 6 },
    { name: 'Esports Insider',        region: 'intl', method: 'rss',    url: 'https://esportsinsider.com/feed', max: 6 },
    { name: 'HLTV',                   region: 'intl', method: 'rss',    url: 'https://www.hltv.org/rss/news', max: 4 },
    { name: 'Sheep Esports',          region: 'intl', method: 'google', siteDomain: 'sheepesports.com', max: 4 },
    { name: 'Win.gg',                 region: 'intl', method: 'google', siteDomain: 'win.gg',           max: 4 },
    { name: 'Esports Charts',         region: 'intl', method: 'google', siteDomain: 'escharts.com',     max: 3 },
    { name: 'The Esports Advocate',   region: 'intl', method: 'rss',    url: 'https://esportsadvocate.net/feed', max: 4 }
  ]
};
