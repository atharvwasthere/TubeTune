import chalk from 'chalk';
import { performance } from 'perf_hooks';

export default class ProgressDashboard {
    constructor() {
        this.activeDownloads = new Map();
        this.isActive = false;
        this.lastUpdate = 0;
        this.updateInterval = null;
        this.stats = {
            totalFiles: 0,
            completedFiles: 0,
            failedFiles: 0,
            startTime: Date.now()
        };
    }

    initialize(totalFiles = 0) {
        if (this.isActive) return;

        this.stats.totalFiles = totalFiles;
        this.stats.startTime = Date.now();
        this.isActive = true;

        // Hide cursor for clean updates
        process.stdout.write('\x1B[?25l');
        
        // Start update loop (every 500ms for smooth but not flashy updates)
        this.updateInterval = setInterval(() => {
            this.renderProgress();
        }, 500);

        console.log(chalk.dim('\n📊 Starting downloads...\n'));
    }

    addDownload(itemId, title, totalSize = 100) {
        if (!this.isActive) return;

        const shortTitle = this.truncateTitle(title, 35);
        this.activeDownloads.set(itemId, {
            title: shortTitle,
            progress: 0,
            speed: 'Starting...',
            eta: 'Calculating...',
            status: 'downloading'
        });
    }

    updateDownload(itemId, progressInfo) {
        if (!this.isActive || !this.activeDownloads.has(itemId)) return;

        const now = performance.now();
        if (now - this.lastUpdate < 200) return; // Throttle to prevent flashing
        this.lastUpdate = now;

        const download = this.activeDownloads.get(itemId);
        download.progress = Math.round(progressInfo.percent || 0);
        download.speed = this.cleanSpeed(progressInfo.speed || '0');
        download.eta = this.cleanETA(progressInfo.estimate || 'Unknown');
    }

    completeDownload(itemId, success = true) {
        if (!this.isActive || !this.activeDownloads.has(itemId)) return;

        const download = this.activeDownloads.get(itemId);
        
        if (success) {
            download.progress = 100;
            download.speed = 'Complete';
            download.eta = 'Done';
            download.status = 'completed';
            this.stats.completedFiles++;
            
            // Show completion briefly then remove
            setTimeout(() => {
                this.activeDownloads.delete(itemId);
            }, 2000);
        } else {
            download.status = 'failed';
            download.speed = 'Failed';
            download.eta = 'Error';
            this.stats.failedFiles++;
            
            // Remove failed items after showing error
            setTimeout(() => {
                this.activeDownloads.delete(itemId);
            }, 3000);
        }
    }

    renderProgress() {
        if (!this.isActive || this.activeDownloads.size === 0) return;

        // Clear previous lines (up to 10 lines for safety)
        for (let i = 0; i < 10; i++) {
            process.stdout.write('\x1B[1A\x1B[2K'); // Move up and clear line
        }

        const downloads = Array.from(this.activeDownloads.values());
        const totalProcessed = this.stats.completedFiles + this.stats.failedFiles;
        const overallProgress = this.stats.totalFiles > 0 ? 
            Math.round((totalProcessed / this.stats.totalFiles) * 100) : 0;

        // Overall status line
        const statusLine = this.buildStatusLine(downloads.length, overallProgress);
        console.log(statusLine);

        // Individual download lines (max 5 shown)
        const visibleDownloads = downloads.slice(0, 5);
        visibleDownloads.forEach(download => {
            console.log(this.buildDownloadLine(download));
        });

        // Show "and X more..." if there are more downloads
        if (downloads.length > 5) {
            console.log(chalk.dim(`   ... and ${downloads.length - 5} more downloading`));
        }

        console.log(''); // Empty line for spacing
    }

    buildStatusLine(activeCount, overallProgress) {
        const elapsed = this.formatDuration(Date.now() - this.stats.startTime);
        const totalProgress = `${this.stats.completedFiles + this.stats.failedFiles}/${this.stats.totalFiles}`;
        
        return chalk.cyan('📊 ') + 
               chalk.white(`${totalProgress} (${overallProgress}%) `) +
               chalk.dim(`| ${activeCount} downloading | ${elapsed}`);
    }

    buildDownloadLine(download) {
        const { title, progress, speed, eta, status } = download;
        
        // Progress bar (simple ASCII, 20 chars)
        const barLength = 20;
        const filled = Math.round((progress / 100) * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        
        // Status icon
        let icon = '⬇️';
        if (status === 'completed') icon = '✅';
        else if (status === 'failed') icon = '❌';
        
        // Color based on status
        let progressColor = chalk.blue;
        if (status === 'completed') progressColor = chalk.green;
        else if (status === 'failed') progressColor = chalk.red;
        
        return `${icon} ${progressColor(bar)} ${chalk.yellow(progress + '%').padStart(4)} ` +
               `${chalk.white(title.padEnd(35))} ` +
               `${chalk.dim(speed.padStart(10))} ${chalk.dim(eta)}`;
    }

    updateAggregateProgress(aggregateData) {
        // We handle aggregate display in renderProgress()
        // This method exists for compatibility but doesn't need to do much
    }

    stop() {
        if (!this.isActive) return;

        this.isActive = false;
        
        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Show cursor again
        process.stdout.write('\x1B[?25h');

        // Clear progress lines
        for (let i = 0; i < 10; i++) {
            process.stdout.write('\x1B[1A\x1B[2K');
        }

        this.showFinalSummary();
        this.cleanup();
    }

    showFinalSummary() {
        const elapsed = Date.now() - this.stats.startTime;
        const successRate = this.stats.totalFiles > 0 ? 
            Math.round((this.stats.completedFiles / this.stats.totalFiles) * 100) : 0;

        console.log(chalk.green('✅ Session Complete!'));
        console.log(chalk.dim(`   ${this.stats.completedFiles} completed, ${this.stats.failedFiles} failed (${successRate}% success)`));
        console.log(chalk.dim(`   Total time: ${this.formatDuration(elapsed)}\n`));
    }

    cleanup() {
        this.activeDownloads.clear();
    }

    // Utility methods
    truncateTitle(title, maxLength = 35) {
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength - 3) + '...';
    }

    cleanSpeed(speed) {
        if (!speed || speed === 'Unknown') return '0 KB/s';
        if (speed.includes('Complete') || speed.includes('Done')) return 'Complete';
        if (speed.includes('Failed') || speed.includes('Error')) return 'Failed';
        
        // Extract just the speed value
        const match = speed.match(/([\d.]+\s*[KMG]?B\/s)/);
        return match ? match[1] : speed.substring(0, 10);
    }

    cleanETA(eta) {
        if (!eta || eta === 'Unknown' || eta === 'Calculating...') return '...';
        if (eta.includes('Done') || eta.includes('Complete')) return 'Done';
        if (eta.includes('Error') || eta.includes('Failed')) return 'Error';
        
        // Clean up ETA format
        return eta.replace(/^ETA\s*:?\s*/, '').substring(0, 8);
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) return `${hours}h${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m${seconds % 60}s`;
        return `${seconds}s`;
    }

    // Simple status display for when dashboard is not active
    showSimpleStatus(status) {
        const { queue, processing, completed, failed, overallProgress, eta, uptime } = status;
        
        console.log(chalk.cyan('\n══════════════════════════════════════'));
        console.log(chalk.cyan.bold('         TubeToolkit Status           '));
        console.log(chalk.cyan('══════════════════════════════════════'));
        
        console.log(`📊 Progress: ${chalk.yellow(overallProgress.toFixed(1) + '%')} | ETA: ${chalk.magenta(eta)} | Uptime: ${chalk.blue(uptime)}`);
        console.log(`📥 Queue: ${chalk.yellow(queue)} | 🔄 Active: ${chalk.blue(processing)} | ✅ Done: ${chalk.green(completed)} | ❌ Failed: ${chalk.red(failed)}`);
        
        if (processing > 0) {
            console.log(chalk.green(`\n🚀 ${processing} download(s) in progress...`));
        }
        
        console.log(chalk.cyan('══════════════════════════════════════\n'));
    }

    startSimpleMonitoring(downloadQueue) {
        const updateInterval = setInterval(() => {
            if (!downloadQueue) {
                clearInterval(updateInterval);
                return;
            }
            
            const status = downloadQueue.getStatus();
            this.showSimpleStatus(status);
            
            if (status.queue === 0 && status.processing === 0) {
                clearInterval(updateInterval);
                console.log(chalk.green('🎉 All downloads completed!\n'));
            }
        }, 3000); // Update every 3 seconds for status monitoring

        return updateInterval;
    }
}