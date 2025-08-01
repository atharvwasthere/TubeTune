import { YTDLP_ARGS_BASE } from "./Config.js";
import isURL from 'validator/lib/isURL.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'node:fs';
import sanitize from 'sanitize-filename';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import boxen from 'boxen';

async function fetchTitle(url) {
    return new Promise((resolve) => {
        const proc = spawn('yt-dlp', ['--print', '%(title)s', url]);
        let title = '';
        proc.stdout.on('data', data => title += data.toString());
        proc.stderr.on('data', err => console.error('[yt-dlp error]', err.toString()));
        proc.on('close', () => resolve(title.trim()));
    });
}

export function downloadWithYtDlp(item, proxy, outputDir, emitProgress) {
    return new Promise(async (resolve, reject) => {
        if (!isURL(item.url)) throw new Error('Invalid URL');

        console.log('\n📡 Making request to YouTube...');
        console.log('\n🔄 Fetching video metadata...');

        if (item.title === 'Unknown') {
            item.title = await fetchTitle(item.url);
        }

        const safeTitle = sanitize(item.title).replace(/\s+/g, '_');
        const filePath = (path.join(outputDir, `${safeTitle}.mp3`));

        const args = [...YTDLP_ARGS_BASE];
        args.push('--output', path.join(outputDir, '%(title)s.%(ext)s'));
        args.push(item.url);

        if (proxy) {
            args.push('--proxy', proxy);
            console.log(`\n🌐 Using proxy: ${proxy}`);
        } else {
            console.log('\n🌐 No proxy - using direct connection');
        }

        console.log(`\n🎬 Title: ${item.title}`);
        console.log('⬇️  Downloading audio stream...\n');

        const progressBar = new cliProgress.SingleBar({
            format: `📊 {title} | {bar} {percentage}% | Speed: {speed}`,
            barCompleteChar: '█',
            barIncompleteChar: '░',
            barsize: 20,
            hideCursor: true,
        });

        const process = spawn('yt-dlp', args);
        let lastPercent = -1;
        let hasError = false;
        let extracted = false;
        let errorOutput = '';

        progressBar.start(100, 0, {
            title: item.title,
            speed: '...'
        });

        process.stdout.on('data', (data) => {
            const output = data.toString();
            const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%.*?at\s+(\S+).*?ETA\s+(\S+)/);

            if (progressMatch && emitProgress) {
                const percent = parseFloat(progressMatch[1]);
                const speed = progressMatch[2];
                const estimate = progressMatch[3];

                if (percent !== lastPercent) {
                    progressBar.update(percent, {
                        title: item.title.slice(0, 30),
                        speed: `${speed} | ETA :${estimate} `
                    });

                    emitProgress({ itemId: item.id, percent, speed, estimate, title: item.title });
                    lastPercent = percent;
                }
            }

            if (!extracted && (output.includes('[ExtractAudio]') || output.includes('has already been downloaded'))) {
                extracted = true;
                // console.log(`\n🎵 Audio extraction completed for: ${item.title}`);
            }
        });

        process.stderr.on('data', (data) => {
            const error = data.toString();
            errorOutput += error;

            if (error.includes('HTTP Error 429') || error.includes('Too Many Requests') ||
                error.includes('HTTP Error 403') || error.includes('blocked')) {
                console.log('🚫 Detected blocking/rate limiting - rotating proxy...');
                if (proxy && this.proxyRotator) this.proxyRotator.markAsFailed(proxy);
                hasError = true;
            }
        });

        process.on('close', (code) => {
            progressBar.stop();
            console.log(); // for spacing

            if (code === 0 && !hasError) {
                try {
                    const stats = fs.statSync(filePath);

                    const boxedPath = boxen(
                        chalk.hex('#f5a9b8')(`💾 Saved to:\n${filePath}`),
                        {
                            padding: 0.5,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'magenta',
                            align: 'center',
                        }
                    );
                    console.log(boxedPath);

                    console.log(`📁 File Size: ~${(stats.size / 1024 / 1024).toFixed(1)} MB`);
                } catch (err) {
                    console.log(`⚠️  Could not verify file size: ${err.message}`);
                }

                console.log(`\n✅ Done! Your MP3 is ready.\n`);
                resolve();
            } else {
                reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput.trim()}`));
            }
        });

        process.on('error', (error) => {
            progressBar.stop();
            reject(new Error(`Failed to start yt-dlp: ${error.message}`));
        });

        item.process = process;
    });
}
