export const MODULE_ID = 'multi-token-edit';
export const SUPPORTED_PLACEABLES = [
  'Token',
  'MeasuredTemplate',
  'Tile',
  'Drawing',
  'Wall',
  'AmbientLight',
  'AmbientSound',
  'Note',
  'Region',
];
export const UI_DOCS = ['FAVORITES', 'ALL', ...SUPPORTED_PLACEABLES];
export const SUPPORTED_SHEET_CONFIGS = [...SUPPORTED_PLACEABLES, 'Actor', 'PlaylistSound', 'Scene'];
export const SUPPORTED_COLLECTIONS = ['Item', 'Cards', 'RollTable', 'Actor', 'JournalEntry', 'Scene'];

export const IMAGE_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'svg', 'apng', 'avif', 'bmp', 'gif', 'tif'];
export const VIDEO_EXTENSIONS = ['mp4', 'ogv', 'webm', 'm4v'];
export const AUDIO_EXTENSIONS = ['aac', 'flac', 'm4a', 'mid', 'mp3', 'ogg', 'opus', 'wav'];
export const FILE_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

export const LINKER_DOC_ICONS = {
  Token: 'modules/multi-token-edit/images/linker/person-fill.svg',
  MeasuredTemplate: 'modules/multi-token-edit/images/linker/rulers.svg',
  Tile: 'modules/multi-token-edit/images/linker/boxes.svg',
  Drawing: 'modules/multi-token-edit/images/linker/pencil-fill.svg',
  Wall: 'modules/multi-token-edit/images/linker/bricks.svg',
  AmbientLight: 'modules/multi-token-edit/images/linker/lightbulb-fill.svg',
  AmbientSound: 'modules/multi-token-edit/images/linker/music-note-beamed.svg',
  Note: 'modules/multi-token-edit/images/linker/bookmark-fill.svg',
  Region: 'modules/multi-token-edit/images/linker/border-outer.svg',
};

export const LINKER_DOC_COLORS = {
  Token: 0xcec66e,
  MeasuredTemplate: 0xff0000,
  Tile: 0x23e230,
  Drawing: 0xe223ce,
  Wall: 0xb7b7b7,
  AmbientLight: 0xffff00,
  AmbientSound: 0x00e3ff,
  Note: 0xffffff,
  Region: 0xdc006b,
};

export const PIVOTS = {
  TOP_LEFT: 0,
  TOP: 1,
  TOP_RIGHT: 2,
  LEFT: 3,
  CENTER: 4,
  RIGHT: 5,
  BOTTOM_LEFT: 6,
  BOTTOM: 7,
  BOTTOM_RIGHT: 8,
};

export const THRESHOLDS = {
  PIXEL_PERFECT_ALPHA: 0.75,
};
