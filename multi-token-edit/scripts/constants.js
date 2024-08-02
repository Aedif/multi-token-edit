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
];
export const UI_DOCS = ['FAVORITES', 'ALL', ...SUPPORTED_PLACEABLES];
export const SUPPORTED_SHEET_CONFIGS = [...SUPPORTED_PLACEABLES, 'Actor', 'PlaylistSound', 'Scene'];
export const SUPPORTED_COLLECTIONS = ['Item', 'Cards', 'RollTable', 'Actor', 'JournalEntry', 'Scene'];

export const IMAGE_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'svg', 'apng', 'avif', 'bmp', 'gif', 'tif'];
export const VIDEO_EXTENSIONS = ['mp4', 'ogv', 'webm', 'm4v'];
export const AUDIO_EXTENSIONS = ['aac', 'flac', 'm4a', 'mid', 'mp3', 'ogg', 'opus', 'wav'];
export const FILE_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
