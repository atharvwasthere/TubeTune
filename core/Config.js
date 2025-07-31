export const YTDLP_ARGS_BASE = [
  '--extract-audio',
  '--audio-format', 'mp3',
  '--audio-quality', '0',
  '--no-playlist',
  '--restrict-filenames'
];

export const DEFAULT_OUTPUT_DIR = './downloads';
export const MAX_CONCURRENT_DOWNLOADS = 2;
export const MAX_ATTEMPTS = 3;
