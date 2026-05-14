import { ENTITY_TYPES } from './constants.js';

/**
 * Generate verse text from parsed intent
 * @param {Object} payload - { entities: Object }
 * @returns {string} generatedVerse
 */
export function generateVerse({ entities }) {
  const subjects = entities[ENTITY_TYPES.SUBJECT] || [];
  const moods = entities[ENTITY_TYPES.MOOD] || [];
  const effects = entities[ENTITY_TYPES.EFFECT] || [];
  const colors = entities[ENTITY_TYPES.COLOR] || [];

  const subject = subjects[0] || 'vision';
  const mood = moods[0] || 'mysterious';
  const effect = effects[0];
  const color = colors[0];
  
  const subjectVerses = {
    dragon: {
      heroic: "The dragon soars through golden skies so bright\nWith fire burning in its eyes so light\nThe wings spread wide across the morning sun\nThe battle of the ages has begun",
      dark: "The shadow dragon takes its darksome flight\nThrough endless realms of everlasting night\nWith scales of obsidian gleaming cold\nA tale of ancient power to be told",
      magical: "The crystal dragon weaves its spell so deep\nWhere ancient powers in the darkness sleep\nWith scales that shimmer bright with arcane light\nIt guards the secrets of the endless night",
      default: "The dragon rises from its lair of stone\nWith thunder in its mighty roar so lone\nThe fire burns within its scaled breast\nPut all the watching warriors to the test",
    },
    knight: {
      heroic: "The knight stands tall with sword held up so high\nBeneath the watchful golden shining sky\nWith armor gleaming bright in morning light\nThe hero prepares for the coming fight",
      dark: "The fallen knight in armor black as night\nWalks the path of no return from fight\nWith shadow in its hollow eyes so deep\nThe cursed warrior has a vow to keep",
      magical: "The enchanted knight with runes aglow so bright\nChannels power from the depths of night\nWith magic flowing through the steel so cold\nA story of ancient power to be told",
      default: "The knight rides forth upon the battlefield\nWith courage as its only shield so sealed\nThe banner waves above the armored head\nAmong the living and among the dead",
    },
    forest: {
      peaceful: "The ancient forest breathes so calm and still\nUpon the green and gently sloping hill\nWith leaves that whisper soft in morning breeze\nThe trees stand tall and proud among these",
      mysterious: "Through misty woods where shadows dance and play\nThe hidden path leads ever far away\nWith secrets in the darkness deep concealed\nThe forest keeps its magic well sealed",
      magical: "The enchanted woods with leaves of silver light\nShimmer softly through the starlit night\nWith magic in every branch and root so deep\nThe forest has its ancient vows to keep",
      default: "The forest grows where ancient rivers flow\nWith moss upon the stones that gleam so low\nThe creatures hide within the shadows deep\nWhere nature has its promises to keep",
    },
    crystal: {
      magical: "The crystal grows with facets shining bright\nRefracting pure and ethereal light\nWith colors dancing through the gem so clear\nThe magic of the earth is present here",
      mysterious: "Deep within the crystal cave so dark\nWhere light meets shadow on the water spark\nWith gems that gleam with power from below\nThe crystal has its secrets to bestow",
      default: "The crystal palace rises from the stone\nWith towers gleaming bright and all alone\nWith walls of gem and floors of shining glass\nThe ages watch the crystal kingdom pass",
    },
    castle: {
      heroic: "The castle stands upon the hill so high\nWith banners waving in the morning sky\nWith stone walls strong against the enemy\nThe fortress of the brave and bold to be",
      dark: "The ruined castle crumbles in the night\nWhere shadows dance in pale and ghostly light\nWith broken towers reaching for the sky\nThe castle watches centuries go by",
      magical: "The enchanted castle gleams with arcane light\nWith magic wards that glow throughout the night\nWith spells upon each stone and tower high\nThe castle reaches for the starlit sky",
      default: "The ancient castle guards the valley floor\nWith stone walls strong as they were before\nWith turrets reaching for the clouds above\nThe castle stands as testament to love",
    },
    phoenix: {
      magical: "The phoenix rises from the ashes bright\nWith feathers burning in eternal light\nWith fire in its wings and song so clear\nThe bird of rebirth has no need for fear",
      default: "The phoenix flies across the burning sky\nWith flames that never fade and never die\nWith song that echoes through the ages long\nThe phoenix sings its everlasting song",
    },
    warrior: {
      heroic: "The warrior stands upon the battlefield\nWith courage as its only trusty shield\nWith sword held high against the enemy\nThe fighter shows what brave can be",
      default: "The warrior fights beneath the banner red\nAmong the living and among the dead\nWith strength that comes from deep within the soul\nThe fighter plays its destined role",
    },
    shadow: {
      dark: "The shadow creeps across the darkened floor\nWith darkness seeping through the ancient door\nWith silence in its wake so deep and cold\nThe shadow has its secrets to unfold",
      mysterious: "The shadow dances on the moonlit wall\nWith whispers that echo through the hall\nWith mystery in every darkened space\nThe shadow moves with silent grace",
      default: "The shadow falls across the sleeping land\nWith darkness gentle as a mother's hand\nWith night that covers all beneath its wing\nThe shadow has its quiet song to sing",
    },
    fire: {
      fierce: "The fire burns with fury bright and bold\nWith flames that reach and twist and never fold\nWith heat that waves across the burning air\nThe fire shows its power everywhere",
      default: "The fire crackles in the hearth so warm\nWith flames that dance and twist in every form\nWith light that pushes back the dark of night\nThe fire gives its comforting delight",
    },
    ocean: {
      peaceful: "The ocean waves roll gently on the shore\nWith rhythm that has echoed evermore\nWith water blue that stretches far and wide\nThe ocean has its secrets deep inside",
      default: "The ocean roars beneath the stormy sky\nWith waves that reach and touch the clouds so high\nWith power that no mortal can contain\nThe ocean shows its wild domain",
    },
    mountain: {
      heroic: "The mountain rises proud against the sky\nWith peaks that touch the clouds that float so high\nWith stone that stands against the test of time\nThe mountain climbs in majesty sublime",
      default: "The mountain stands so ancient and so still\nWith snow upon its cold and rocky hill\nWith valleys deep below its mighty peak\nThe mountain has its silent song to speak",
    },
    palace: {
      magical: "The palace gleams with magic in each stone\nWith spells and wards that make it all alone\nWith towers reaching for the starlit sky\nThe palace watches centuries go by",
      default: "The palace rises from the marble floor\nWith golden gates and every wealthy door\nWith halls that echo with the royal sound\nThe palace has its glory all around",
    },
    temple: {
      mysterious: "The temple stands in silence deep and old\nWith secrets that the priests have never told\nWith stone that holds the prayers of ages past\nThe temple has its shadows that will last",
      magical: "The temple glows with runes upon the wall\nWith magic that answers every prayerful call\nWith power flowing through the sacred stone\nThe temple stands eternal and alone",
      default: "The ancient temple guards its holy ground\nWith silence as its most sacred sound\nWith altars raised to gods of days before\nThe temple opens wide its sacred door",
    },
    light: {
      heroic: "The light breaks forth across the darkened sky\nWith brilliance that no shadow can deny\nWith radiance that fills the world so bright\nThe light defeats the darkness of the night",
      magical: "The light dances with colors in the air\nWith magic that shows beauty everywhere\nWith glow that comes from deep within the soul\nThe light makes every broken spirit whole",
      default: "The light shines down from heavens up above\nWith warmth that fills the heart with endless love\nWith beams that chase the shadows far away\nThe light brings hope to every brand new day",
    },
    moon: {
      mysterious: "The moon hangs pale against the darkened sky\nWith light that makes the shadows dance and fly\nWith silver beams that touch the sleeping earth\nThe moon has watched the world since ancient birth",
      magical: "The moon glows bright with magic in its light\nWith power that awakens in the night\nWith influence upon the tides so deep\nThe moon has ancient promises to keep",
      default: "The moon rises above the darkened hill\nWith silence that the nighttime makes so still\nWith face that watches all the world below\nThe moon has seen the ages come and go",
    },
    star: {
      magical: "The star burns bright against the velvet night\nWith magic in its shimmering silver light\nWith distance that no mortal can conceive\nThe star has wonders that it can achieve",
      default: "The star twinkles in the darkened sky so deep\nWith promises that it will always keep\nWith light that travels through the endless space\nThe star shows hope to all the human race",
    },
    wizard: {
      magical: "The wizard stands with staff held up so high\nWith magic crackling in the stormy sky\nWith robes that flow with power from within\nThe wizard casts away the force of sin",
      default: "The wizard reads from books of ancient lore\nWith spells that open every locked door\nWith knowledge gathered through the ages long\nThe wizard sings his powerful song",
    },
  };
  
  const subjectData = subjectVerses[subject];
  if (subjectData) {
    return subjectData[mood] || subjectData.heroic || subjectData.default || Object.values(subjectData)[0];
  }
  
  const colorWord = color || 'bright';
  
  return `The ${subject} stands in ${mood} grace so ${colorWord}\n${effect ? `With ${effect} dancing all around this place` : 'In this sacred and most hallowed place'}\nBathed in brilliant radiant golden light\nA vision burning ever pure and bright`;
}