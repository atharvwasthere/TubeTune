#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { basename } from 'path';

import DownloadQueue from '../core/DownloadQueue.js';
import { printHelp, printSubtitle, printBannerOnly, printVersion } from '../utils/asciiBanner.js';

class YouTubeDownloaderCLI {
    constructor() {
        this.downloader = new DownloadQueue('./downloads');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.downloader.on('progress', () => {
        });

        this.downloader.on('downloadCompleted', (item) => {
            console.log(`\n🎉 Download completed: ${item.title}`);
            this.showStatus();
        });

        this.downloader.on('downloadFailed', (item, error) => {
            console.log(`\n💥 Download failed permanently: ${item.title}`);
            this.showStatus();
        });

        this.downloader.on('queueUpdated', () => {
        });
    }

    addVideo(url) {
        return this.downloader.addUrl(url);
    }

    addMultipleVideos(urls) {
        urls.forEach(url => this.addVideo(url));
    }

    addProxy(proxy) {
        this.downloader.addProxy(proxy);
    }

    showStatus() {
        const status = this.downloader.getStatus();

        // console.log('\n=== Download Status ===');
        // console.log(` Queue      : ${status.queue}`);
        // console.log(` Processing : ${status.processing}`);
        // console.log(` Completed  : ${status.completed} ✅`);
        // console.log(` Failed     : ${status.failed} ❌`);
        // console.log(` Proxies    : ${status.totalProxies} total | ${status.failedProxies} failed 🌐`);
        // console.log('========================\n');
    }


    showHelp() {
        console.log('\n🎵 YouTube MP3 Downloader');
        printHelp()

    }

    showVersion() {
        console.log('   You are currently using\n');
        printVersion();
    }
}

const currentFile = fileURLToPath(import.meta.url);
const isMain = basename(process.argv[1]) === basename(currentFile);

// CLI execution
if (isMain) {
    const cli = new YouTubeDownloaderCLI();
    const args = process.argv.slice(2);

    // Version cmd
    if (args.includes('--version')) {
        printSubtitle();
        cli.showVersion();

        process.exit(0);
    }

    printBannerOnly(); // Show Fastlane-style banner


    // Help cmd 
    if (args.length === 0 || args.includes('--help')) {
        cli.showHelp();
        process.exit(0);
    }



    let urls = [];
    let proxies = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--proxy' && i + 1 < args.length) {
            proxies.push(args[i + 1]);
            i++;
        } else if (args[i].includes('youtube.com') || args[i].includes('youtu.be')) {
            urls.push(args[i]);
        }
    }

    proxies.forEach(proxy => cli.addProxy(proxy));

    if (urls.length > 0) {
        console.log(`\n🎯 Adding ${urls.length} video(s) to queue...`);
        cli.addMultipleVideos(urls);
    } else {
        console.log('\n📝 No URLs provided. Add some videos:');
        console.log('Example: cli.addVideo("https://youtube.com/watch?v=...")');
        // cli.addVideo('https://www.youtube.com/watch?v=CGrFZmOWxVw');
    }
    2
    setTimeout(() => cli.showStatus(), 2000);

    process.on('SIGINT', () => {
        console.log('\n\n⏹️ Shutting down...');
        cli.downloader.pauseAll();
        process.exit(0);
    });
}
