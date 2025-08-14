import path from 'node:path';

// Base arguments for yt-dlp
const YTDLP_BASE = [
  '--no-playlist',
  '--restrict-filenames',
  '--cookies', path.resolve('./core/cookies.txt')
];

// MP3 (Audio Only) Configuration
export const YTDLP_ARGS_MP3 = [
  ...YTDLP_BASE,
  '--extract-audio',
  '--audio-format', 'mp3',
  '--audio-quality', '0', // Best quality
];

// MP4 (Video) Configuration
export const YTDLP_ARGS_MP4 = [
  ...YTDLP_BASE,
  '--format', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
  '--merge-output-format', 'mp4'
];

// Quality presets for MP4
export const MP4_QUALITY_PRESETS = {
  'best': 'best[ext=mp4]/best',
  '1080p': 'best[height<=1080][ext=mp4]/best[height<=1080]',
  '720p': 'best[height<=720][ext=mp4]/best[height<=720]',
  '480p': 'best[height<=480][ext=mp4]/best[height<=480]',
  '360p': 'best[height<=360][ext=mp4]/best[height<=360]'
};

// Audio quality presets for MP3
export const MP3_QUALITY_PRESETS = {
  'best': '0',      // Best quality
  'good': '2',      // ~190 kbps
  'medium': '5',    // ~128 kbps
  'low': '9'        // ~64 kbps
};

export const SUPPORTED_FORMATS = ['mp3', 'mp4'];
export const DEFAULT_FORMAT = 'mp3';
export const DEFAULT_QUALITY = 'best';

export const DEFAULT_OUTPUT_DIR = './downloads';
export const MAX_CONCURRENT_DOWNLOADS = 2;
export const MAX_ATTEMPTS = 3;

// Helper function to get yt-dlp args based on format and quality
export function getYtDlpArgs(format = DEFAULT_FORMAT, quality = DEFAULT_QUALITY) {
  let args;
  
  switch (format.toLowerCase()) {
    case 'mp4':
      args = [...YTDLP_ARGS_MP4];
      if (MP4_QUALITY_PRESETS[quality]) {
        // Replace the format argument with quality-specific one
        const formatIndex = args.findIndex(arg => arg === '--format');
        if (formatIndex !== -1) {
          args[formatIndex + 1] = MP4_QUALITY_PRESETS[quality];
        }
      }
      break;
      
    case 'mp3':
    default:
      args = [...YTDLP_ARGS_MP3];
      if (MP3_QUALITY_PRESETS[quality]) {
        const qualityIndex = args.findIndex(arg => arg === '--audio-quality');
        if (qualityIndex !== -1) {
          args[qualityIndex + 1] = MP3_QUALITY_PRESETS[quality];
        }
      }
      break;
  }
  
  return args;
}

// Helper to get file extension based on format
export function getFileExtension(format = DEFAULT_FORMAT) {
  switch (format.toLowerCase()) {
    case 'mp4': return '.mp4';
    case 'mp3': 
    default: return '.mp3';
  }
}