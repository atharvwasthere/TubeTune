#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { basename } from 'path';

import DownloadQueue from '../core/DownloadQueue.js';
import ProgressDashboard from '../utils/Progress.js';
import {
  SUPPORTED_FORMATS,
  DEFAULT_FORMAT,
  DEFAULT_QUALITY,
  MP4_QUALITY_PRESETS,
  MP3_QUALITY_PRESETS
} from '../core/Config.js';
import { printSubtitle, printBannerOnly, printVersion } from '../utils/asciiBanner.js';

class YouTubeDownloaderCLI {
  constructor() {
    this.downloader = new DownloadQueue('./downloads');
    this.dashboard = new ProgressDashboard();
    this.statusInterval = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.downloader.on('progress', (progressData) => {
      this.dashboard.updateDownload(progressData.itemId, progressData);
    });

    this.downloader.on('downloadStarted', (item) => {
      this.dashboard.addDownload(item.id, `${item.title} (${item.format.toUpperCase()})`);
    });

    this.downloader.on('downloadCompleted', (item) => {
      console.log(`\n🎉 ${item.format.toUpperCase()} Download completed: ${item.title}`);
      this.dashboard.completeDownload(item.id, true);
    });

    this.downloader.on('downloadFailed', (item) => {
      console.log(`\n💥 ${item.format.toUpperCase()} Download failed permanently: ${item.title}`);
      this.dashboard.completeDownload(item.id, false);
    });

    this.downloader.on('aggregateProgress', (aggregateData) => {
      this.dashboard.updateAggregateProgress(aggregateData);
    });

    this.downloader.on('queueUpdated', (status) => {
      if (status.queue === 0 && status.processing === 0 && (status.completed > 0 || status.failed > 0)) {
        setTimeout(() => {
          this.dashboard.stop();
          this.stopStatusMonitoring();
          console.log('\n🏁 All downloads finished!');
        }, 1000);
      }
    });
  }

  addVideo(url, format = DEFAULT_FORMAT, quality = DEFAULT_QUALITY, title = null) {
    return this.downloader.addUrl(url, { title, format, quality });
  }

  addMultipleVideos(urls, format = DEFAULT_FORMAT, quality = DEFAULT_QUALITY) {
    this.dashboard.initialize(urls.length);
    urls.forEach((url) => this.addVideo(url, format, quality));
    this.startStatusMonitoring();
  }

  addProxy(proxy) {
    this.downloader.addProxy(proxy);
  }

  startStatusMonitoring() {
    this.statusInterval = setInterval(() => {
      const status = this.downloader.getStatus();
      if (status.processing === 0 && status.queue === 0) {
        this.stopStatusMonitoring();
        return;
      }
      if (status.processing > 0) {
        console.log(`\n📊 Status: ${status.processing} downloading, ${status.queue} queued, ${status.completed} done`);
      }
    }, 10000);
  }

  stopStatusMonitoring() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  // Minimal header (kept), no box outlines elsewhere
  showStatus() {
    const s = this.downloader.getDetailedStatus();

    console.log('\n==== 📊 TUBETOOLKIT STATUS ====');
    console.log(`📥 Queue       : ${s.queue}`);
    console.log(`🔄 Processing  : ${s.processing}`);
    console.log(`✅ Completed   : ${s.completed}`);
    console.log(`❌ Failed      : ${s.failed}`);
    console.log(`🌐 Proxies     : ${s.totalProxies} total, ${s.failedProxies} failed`);
    console.log(`📈 Progress    : ${Number.isFinite(s.overallProgress) ? s.overallProgress.toFixed(1) : '0.0'}%`);
    console.log(`⏱️  ETA        : ${s.eta}`);
    console.log(`⏰ Uptime      : ${s.uptime}`);

    console.log('\nFORMAT STATS');
    const f = s.formats || { mp3: {}, mp4: {} };
    console.log(
      `🎵 MP3  → ${f.mp3?.completed ?? 0}✅  ${f.mp3?.failed ?? 0}❌  ${f.mp3?.processing ?? 0}🔄  ${f.mp3?.queue ?? 0}📥`
    );
    console.log(
      `🎥 MP4  → ${f.mp4?.completed ?? 0}✅  ${f.mp4?.failed ?? 0}❌  ${f.mp4?.processing ?? 0}🔄  ${f.mp4?.queue ?? 0}📥`
    );

    if (s.processingItems?.length > 0) {
      console.log('\nCURRENTLY DOWNLOADING');
      s.processingItems.forEach((item, idx) => {
        const p = item.progress || {};
        const percent = Number.isFinite(p.percent) ? p.percent.toFixed(1) : '0.0';
        const speed = p.speed || '0 KB/s';
        const icon = item.format === 'mp4' ? '🎥' : '🎵';
        const name = (item.title || '').length > 40 ? `${item.title.slice(0, 37)}...` : item.title;
        console.log(`  ${idx + 1}. ${icon} ${name} — ${percent}% @ ${speed} [${item.quality}]`);
      });
    }

    if (s.recentCompleted?.length > 0) {
      console.log('\nRECENTLY COMPLETED');
      s.recentCompleted.forEach((item, idx) => {
        const icon = item.format === 'mp4' ? '🎥' : '🎵';
        console.log(`  ${idx + 1}. ${icon} ${item.title} [${item.quality}]`);
      });
    }

    if (s.recentFailed?.length > 0) {
      console.log('\nRECENT FAILURES');
      s.recentFailed.forEach((item, idx) => {
        const icon = item.format === 'mp4' ? '🎥' : '🎵';
        console.log(`  ${idx + 1}. ${icon} ${item.title} [${item.quality}] - ${item.error}`);
      });
    }

    console.log('');
  }

  showHelp() {
    console.log('\n🎵 TubeToolkit - YouTube Downloader');
    console.log('\n📖 Usage:');
    console.log('  node cli/index.js [options] <urls...>');

    console.log('\n🎯 Options:');
    console.log('  --format, -f <format>     Download format: mp3, mp4 (default: mp3)');
    console.log('  --quality, -q <quality>   Quality preset (see below)');
    console.log('  --proxy <proxy>           Use proxy: http://ip:port or socks5://ip:port');
    console.log('  --status                  Show current queue status');
    console.log('  --help                    Show this help message');
    console.log('  --version                 Show version information');

    console.log('\n🎵 MP3 Quality Options:');
    console.log('  best    - Best quality (~320 kbps)');
    console.log('  good    - Good quality (~190 kbps)');
    console.log('  medium  - Medium quality (~128 kbps)');
    console.log('  low     - Low quality (~64 kbps)');

    console.log('\n🎥 MP4 Quality Options:');
    console.log('  best    - Best available quality');
    console.log('  1080p   - Full HD (1080p)');
    console.log('  720p    - HD (720p)');
    console.log('  480p    - Standard (480p)');
    console.log('  360p    - Low (360p)');

    console.log('\n📝 Examples:');
    console.log('  # Download MP3 (default)');
    console.log('  node cli/index.js "https://youtube.com/watch?v=..."');
    console.log('');
    console.log('  # Download MP4 in 720p');
    console.log('  node cli/index.js --format mp4 --quality 720p "URL"');
    console.log('');
    console.log('  # Download multiple with proxy');
    console.log('  node cli/index.js --format mp3 --proxy "http://proxy:8080" "URL1" "URL2"');
    console.log('');
    console.log('  # Mix formats (requires multiple commands)');
    console.log('  node cli/index.js --format mp3 --quality best "URL1"');
    console.log('  node cli/index.js --format mp4 --quality 1080p "URL2"');

    console.log('\n💡 Tips:');
    console.log('  • Queue persists across sessions - crashes auto-resume');
    console.log('  • Use --status to monitor downloads from another terminal');
    console.log('  • Files are organized: ./downloads/mp3/ and ./downloads/mp4/');
    console.log('  • Ctrl+C gracefully saves queue state');
  }

  showVersion() {
    console.log('   You are currently using\n');
    printVersion();
  }

  shutdown() {
    console.log('\n\n⏹️ Shutting down gracefully...');
    this.dashboard.stop();
    this.stopStatusMonitoring();
    this.downloader.pauseAll();

    setTimeout(() => {
      console.log('💾 Queue state saved. You can resume later!');
      process.exit(0);
    }, 1000);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && basename(process.argv[1]) === basename(currentFile);

// CLI execution
if (isMain) {
  const cli = new YouTubeDownloaderCLI();
  const args = process.argv.slice(2);

  // Version
  if (args.includes('--version')) {
    printSubtitle();
    cli.showVersion();
    process.exit(0);
  }

  printBannerOnly();

  // Help
  if (args.length === 0 || args.includes('--help')) {
    cli.showHelp();
    process.exit(0);
  }

  // Status
  if (args.includes('--status')) {
    cli.showStatus();
    process.exit(0);
  }

  // Parse arguments
  let urls = [];
  let proxies = [];
  let format = DEFAULT_FORMAT;
  let quality = DEFAULT_QUALITY;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--format' || args[i] === '-f') && i + 1 < args.length) {
      format = args[i + 1].toLowerCase();
      if (!SUPPORTED_FORMATS.includes(format)) {
        console.log(`❌ Unsupported format: ${format}. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
        process.exit(1);
      }
      i++;
    } else if ((args[i] === '--quality' || args[i] === '-q') && i + 1 < args.length) {
      quality = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--proxy' && i + 1 < args.length) {
      proxies.push(args[i + 1]);
      i++;
    } else if (args[i].includes('youtube.com') || args[i].includes('youtu.be')) {
      urls.push(args[i]);
    }
  }

  // Validate quality
  const validQualities = format === 'mp4'
    ? Object.keys(MP4_QUALITY_PRESETS)
    : Object.keys(MP3_QUALITY_PRESETS);

  if (!validQualities.includes(quality)) {
    console.log(`❌ Invalid quality '${quality}' for ${format.toUpperCase()}. Valid options: ${validQualities.join(', ')}`);
    process.exit(1);
  }

  // Add proxies (no-op if you don't pass any)
  proxies.forEach((proxy) => cli.addProxy(proxy));

  if (urls.length > 0) {
    const formatIcon = format === 'mp4' ? '🎥' : '🎵';
    console.log(`\n🎯 Adding ${urls.length} video(s) to ${format.toUpperCase()} download queue (${quality})...`);
    console.log(`${formatIcon} Format: ${format.toUpperCase()} | Quality: ${quality} | Output: ./downloads/${format}/`);

    cli.addMultipleVideos(urls, format, quality);

    setTimeout(() => cli.showStatus(), 3000);
  } else {
    console.log('\n📝 No URLs provided. Add some videos:');
    console.log(`Example: node cli/index.js --format ${format} --quality ${quality} "https://youtube.com/watch?v=..."`);
    console.log('\n💡 Use --help for all options and examples');
    console.log('💡 Use --status to check current queue status');

    setTimeout(() => {
      const status = cli.downloader.getStatus();
      if (status.queue > 0 || status.processing > 0) {
        console.log('\n📂 Found existing queue from previous session:');
        cli.showStatus();
      }
    }, 1000);
  }

  // Graceful shutdown
  process.on('SIGINT', () => cli.shutdown());
  process.on('SIGTERM', () => cli.shutdown());
  process.on('uncaughtException', (error) => {
    console.error('\n💥 Unexpected error:', error.message);
    cli.shutdown();
  });
}
