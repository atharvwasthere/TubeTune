import { getYtDlpArgs, getFileExtension } from "./Config.js";
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

export function downloadWithYtDlp(item, proxy, outputDir, emitProgress, markProxyAsFailed) {
    return new Promise(async (resolve, reject) => {
        if (!isURL(item.url)) throw new Error('Invalid URL');

        console.log('\n📡 Making request to YouTube...');
        console.log('🔄 Fetching video metadata...');

        if (item.title === 'Unknown') {
            try {
                item.title = await fetchTitle(item.url);
            } catch (error) {
                console.log('⚠️ Could not fetch title, using URL as title');
                item.title = item.url.split('/').pop() || 'Unknown';
            }
        }

        // Get format-specific arguments and file paths
        const format = item.format || 'mp3';
        const quality = item.quality || 'best';
        const fileExtension = getFileExtension(format);
        const safeTitle = sanitize(item.title).replace(/\s+/g, '_');
        
        // Create format-specific subdirectory
        const formatDir = path.join(outputDir, format);
        if (!fs.existsSync(formatDir)) {
            fs.mkdirSync(formatDir, { recursive: true });
        }
        
        const filePath = path.join(formatDir, `${safeTitle}${fileExtension}`);

        // Check if file already exists
        if (fs.existsSync(filePath)) {
            console.log(`📁 File already exists: ${path.basename(filePath)} (${format.toUpperCase()})`);
            resolve();
            return;
        }

        // Get format and quality specific arguments
        const args = getYtDlpArgs(format, quality);
        args.push('--output', path.join(formatDir, '%(title)s.%(ext)s'));
        args.push(item.url);

        if (proxy) {
            args.push('--proxy', proxy);
            console.log(`🌐 Using proxy: ${proxy}`);
        } else {
            console.log('🌐 No proxy - using direct connection');
        }

        // Enhanced console output with format info
        console.log(`🎬 Title: ${item.title}`);
        console.log(`📺 Format: ${format.toUpperCase()} (${quality})`);
        console.log(`📁 Output: ./${format}/${safeTitle}${fileExtension}`);
        console.log(''); // Just a clean line break, no flashy messages

        // NO individual progress bar - let the dashboard handle it
        const process = spawn('yt-dlp', args);
        let lastPercent = -1;
        let hasError = false;
        let extracted = false;
        let errorOutput = '';
        let currentProxy = proxy;
        let downloadPhase = format === 'mp4' ? 'downloading' : 'downloading';

        process.stdout.on('data', (data) => {
            const output = data.toString();
            
            // Match different progress patterns for MP4 vs MP3
            let progressMatch;
            
            if (format === 'mp4') {
                // For MP4, we might get video + audio download progress
                progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%.*?at\s+(\S+).*?ETA\s+(\S+)/) ||
                               output.match(/\[ffmpeg\].*?(\d+\.?\d*)%/);
            } else {
                // For MP3, standard download + extraction
                progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%.*?at\s+(\S+).*?ETA\s+(\S+)/);
            }
            
            // File size info
            const sizeMatch = output.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+(\S+)/);

            if (progressMatch) {
                const percent = parseFloat(progressMatch[1]);
                const speed = progressMatch[2] || 'Unknown';
                const estimate = progressMatch[3] || 'Calculating...';

                if (percent !== lastPercent) {
                    // Update phase for different stages
                    let phaseInfo = '';
                    if (format === 'mp4') {
                        if (output.includes('[ffmpeg]')) {
                            phaseInfo = 'Processing';
                        } else if (output.includes('video')) {
                            phaseInfo = 'Video';
                        } else if (output.includes('audio')) {
                            phaseInfo = 'Audio';
                        }
                    } else {
                        if (extracted) {
                            phaseInfo = 'Converting';
                        }
                    }

                    // Only emit progress for dashboard - no console progress bar
                    if (emitProgress) {
                        emitProgress({
                            itemId: item.id,
                            percent: percent,
                            speed: speed,
                            estimate: estimate,
                            title: item.title,
                            format: format,
                            quality: quality,
                            size: sizeMatch ? sizeMatch[2] : 'Unknown',
                            phase: phaseInfo || downloadPhase
                        });
                    }
                    
                    lastPercent = percent;
                }
            }

            // Check for extraction/processing phase
            if (format === 'mp3' && !extracted && (output.includes('[ExtractAudio]') || output.includes('has already been downloaded'))) {
                extracted = true;
                downloadPhase = 'converting';
            }

            // Check for MP4 processing
            if (format === 'mp4' && output.includes('[ffmpeg]')) {
                downloadPhase = 'processing';
            }
        });

        process.stderr.on('data', (data) => {
            const error = data.toString();
            errorOutput += error;

            // Same error handling as before
            if (error.includes('HTTP Error 429') || error.includes('Too Many Requests')) {
                console.log('\n🚫 Rate limited - rotating proxy...');
                hasError = true;
                if (currentProxy && markProxyAsFailed) {
                    markProxyAsFailed(currentProxy);
                }
            } else if (error.includes('HTTP Error 403') || error.includes('Forbidden')) {
                console.log('\n🚫 Access forbidden - rotating proxy...');
                hasError = true;
                if (currentProxy && markProxyAsFailed) {
                    markProxyAsFailed(currentProxy);
                }
            } else if (error.includes('blocked')) {
                console.log('\n🚫 IP blocked - rotating proxy...');
                hasError = true;
                if (currentProxy && markProxyAsFailed) {
                    markProxyAsFailed(currentProxy);
                }
            } else if (error.includes('Private video') || error.includes('Video unavailable')) {
                hasError = true;
                errorOutput = 'Video is private or unavailable';
            } else if (error.includes('Sign in to confirm your age')) {
                hasError = true;
                errorOutput = 'Age-restricted content - requires authentication';
            }

            // Log warnings for MP4 format issues
            if (format === 'mp4' && error.includes('Requested format is not available')) {
                console.log(`⚠️ ${quality} quality not available, falling back to best available`);
            }

            if (error.includes('[youtube] Warning:') || error.includes('WARNING:')) {
                console.log(`⚠️ Warning: ${error.trim()}`);
            }
        });

        process.on('close', (code) => {
            console.log(); // Clean spacing

            if (code === 0 && !hasError) {
                try {
                    // Verify file exists and get stats
                    const stats = fs.statSync(filePath);
                    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(1);
                    
                    // Simple, clean completion message
                    const formatIcon = format === 'mp4' ? '🎥' : '🎵';
                    console.log(`${formatIcon} ${chalk.green('✓')} ${item.title} ${chalk.dim(`(${fileSizeMB} MB)`)}`);

                    // Final progress update
                    if (emitProgress) {
                        emitProgress({
                            itemId: item.id,
                            percent: 100,
                            speed: 'Complete',
                            estimate: 'Done',
                            title: item.title,
                            format: format,
                            quality: quality,
                            fileSize: fileSizeMB + ' MB',
                            filePath: filePath
                        });
                    }

                    resolve();
                    
                } catch (err) {
                    console.log(`⚠️ Download completed but could not verify file: ${err.message}`);
                    resolve();
                }
            } else {
                // Simple error message - no flashy boxes
                let errorMessage = `yt-dlp failed with code ${code}`;
                
                if (hasError) {
                    if (errorOutput.includes('Private video')) {
                        errorMessage = 'Video is private or unavailable';
                    } else if (errorOutput.includes('HTTP Error 429')) {
                        errorMessage = 'Rate limited - try again later or use different proxy';
                    } else if (errorOutput.includes('HTTP Error 403')) {
                        errorMessage = 'Access forbidden - proxy or region issue';
                    } else if (errorOutput.includes('blocked')) {
                        errorMessage = 'IP/Proxy blocked by YouTube';
                    } else if (errorOutput.includes('Sign in to confirm')) {
                        errorMessage = 'Age-restricted content requires authentication';
                    } else if (format === 'mp4' && errorOutput.includes('No video formats')) {
                        errorMessage = `No ${quality} MP4 format available for this video`;
                    } else if (format === 'mp3' && errorOutput.includes('No suitable formats')) {
                        errorMessage = 'No audio stream available for extraction';
                    } else {
                        errorMessage = errorOutput.trim() || `Unknown ${format.toUpperCase()} download error`;
                    }
                }

                console.log(`❌ ${item.title} - ${errorMessage}`);
                reject(new Error(errorMessage));
            }
        });

        process.on('error', (error) => {
            console.log(`💥 Process error: ${error.message}`);
            reject(new Error(`Failed to start yt-dlp: ${error.message}`));
        });

        // Store process reference for potential cancellation
        item.process = process;
    });
}