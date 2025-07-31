import { YTDLP_ARGS_BASE } from "./Config";
import isURL from 'validator/lib/isURL';
import { spawn } from 'child_process';
import path from 'path';

export function downloadWithYtDlp(item, proxy, outputDir, emitProgress) {
    return new Promise((resolve, reject) => {
        const args = [...YTDLP_ARGS_BASE];
        args.push('--output', path.join(outputDir, '%(title)s.%(ext)s'));

        if (!isURL(item.url)) {
            throw new Error('Invalid URL');
        }

        if (proxy) {
            args.push('--proxy', proxy);
            console.log(`🌐 Using proxy: ${proxy}`);
        } else {
            console.log('🌐 No proxy - using direct connection');
        }

        args.push(item.url);

        const process = spawn('yt-dlp', args);
        let lastProgress = '';
        let hasError = false;
        let errorOutput = '';


        process.stdout.on('data', (data) => {
            const output = data.toString();

            const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%.*?at\s+(\S+)/);
            if (progressMatch && emitProgress) {
                const percent = parseFloat(progressMatch[1]);
                const speed = progressMatch[2];

                if (lastProgress !== progressMatch[0]) {
                    console.log(`📊 ${item.title}: ${percent.toFixed(1)}% at ${speed}`);
                    emitProgress({ itemId: item.id, percent, speed, title: item.title });
                    lastProgress = progressMatch[0];
                }
            }
            // Check for successful extraction
            if (output.includes('[ExtractAudio]') || output.includes('has already been downloaded')) {
                console.log(`🎵 Audio extraction completed for: ${item.title}`);
            }
        });

        process.stderr.on('data', (data) => {
            const error = data.toString();
            errorOutput += error;

            // Check for specific errors that might need proxy rotation
            if (error.includes('HTTP Error 429') ||
                error.includes('Too Many Requests') ||
                error.includes('HTTP Error 403') ||
                error.includes('blocked')) {

                console.log('🚫 Detected blocking/rate limiting - rotating proxy...');
                if (proxy) {
                    this.proxyRotator.markAsFailed(proxy);
                }
                hasError = true;
            }
        });

        process.on('close', (code) => {
            if (code === 0 && !hasError) {
                resolve();
            } else {
                const error = new Error(`yt-dlp failed with code ${code}: ${errorOutput.trim()}`);
                reject(error);
            }
        });


        process.on('error', (error) => {
            reject(new Error(`Failed to start yt-dlp: ${error.message}`));
        });


        // Store process reference for potential cancellation
        item.process = process;

    });
}