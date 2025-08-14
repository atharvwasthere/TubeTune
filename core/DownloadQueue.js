import { DEFAULT_OUTPUT_DIR, MAX_CONCURRENT_DOWNLOADS, MAX_ATTEMPTS, DEFAULT_FORMAT, DEFAULT_QUALITY } from './Config.js';
import proxyRotator from './ProxyRotator.js';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { downloadWithYtDlp } from './Downloader.js';

export default class DownloadQueue extends EventEmitter {
    constructor(outputDir = DEFAULT_OUTPUT_DIR, defaultFormat = DEFAULT_FORMAT, defaultQuality = DEFAULT_QUALITY) {
        super();
        this.queue = [];
        this.processing = new Map();
        this.completed = [];
        this.failed = [];
        this.maxConcurrent = MAX_CONCURRENT_DOWNLOADS;
        this.outputDir = outputDir;
        this.defaultFormat = defaultFormat;
        this.defaultQuality = defaultQuality;
        this.proxyRotator = new proxyRotator();

        // Persistence
        this.queueFile = path.join(outputDir, '.queue-state.json');
        this.progressData = new Map();
        this.startTime = Date.now();
        this.totalBytes = 0;
        this.downloadedBytes = 0;

        // Create output directories
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Create format-specific subdirectories
        const mp3Dir = path.join(outputDir, 'mp3');
        const mp4Dir = path.join(outputDir, 'mp4');

        if (!fs.existsSync(mp3Dir)) fs.mkdirSync(mp3Dir, { recursive: true });
        if (!fs.existsSync(mp4Dir)) fs.mkdirSync(mp4Dir, { recursive: true });

        // Load persisted queue state
        this.loadQueueState();

        // Auto-save every 5 seconds
        setInterval(() => this.saveQueueState(), 5000);
    }

    addUrl(url, options = {}) {
        const {
            title = null,
            format = this.defaultFormat,
            quality = this.defaultQuality
        } = options;

        const item = {
            id: Date.now() + Math.random(),
            url,
            title: title || 'Unknown',
            format: format.toLowerCase(),
            quality,
            addedAt: new Date(),
            attempts: 0,
            maxAttempts: MAX_ATTEMPTS,
            status: 'queued',
            size: 0,
            downloadedSize: 0
        };

        this.queue.push(item);
        console.log(`📥 Added to queue: ${url} (${format.toUpperCase()}, ${quality})`);
        this.emit('queueUpdated', this.getStatus());
        this.saveQueueState();

        // if under max capacity start processing 
        this.processNext();
        return item.id;
    }

    // Convenience methods for different formats
    addMp3(url, quality = this.defaultQuality, title = null) {
        return this.addUrl(url, { title, format: 'mp3', quality });
    }

    addMp4(url, quality = this.defaultQuality, title = null) {
        return this.addUrl(url, { title, format: 'mp4', quality });
    }

    async processNext() {
        if (this.processing.size >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift();
        item.status = 'processing';
        item.startedAt = new Date();
        this.processing.set(item.id, item);

        console.log(`\n🚀 Starting download (${item.format.toUpperCase()}):`);
        this.emit('downloadStarted', item);
        this.saveQueueState();

        const proxy = this.proxyRotator.getCurrentProxy();

        try {
            await downloadWithYtDlp(
                item,
                proxy,
                this.outputDir,
                (progressInfo) => this.handleProgress(item.id, progressInfo),
                (proxyToFail) => this.proxyRotator.markAsFailed(proxyToFail)
            );

            item.status = 'completed';
            item.completedAt = new Date();
            this.completed.push(item);
            this.emit('downloadCompleted', item);

        } catch (error) {
            console.log(`❌ Failed: ${item.title} - ${error.message}`);
            item.attempts++;

            if (item.attempts < item.maxAttempts) {
                console.log(`🔄 Retrying (${item.attempts}/${item.maxAttempts}): ${item.title}`);
                item.status = 'queued';
                this.queue.unshift(item);
            } else {
                item.status = 'failed';
                item.failedAt = new Date();
                this.failed.push({ ...item, error: error.message });
                this.emit('downloadFailed', item, error);
            }
        }

        this.processing.delete(item.id);
        this.emit('queueUpdated', this.getStatus());
        this.saveQueueState();

        setTimeout(() => this.processNext(), 1000);
    }

    handleProgress(itemId, progressInfo) {
        this.progressData.set(itemId, progressInfo);
        this.emit('progress', { itemId, ...progressInfo });
        this.updateAggregateProgress();
    }

    updateAggregateProgress() {
        let totalProgress = 0;
        let activeDownloads = 0;
        let totalSpeed = 0;

        for (const [itemId, progress] of this.progressData) {
            if (this.processing.has(itemId)) {
                totalProgress += progress.percent || 0;
                activeDownloads++;

                const speedStr = progress.speed || '0';
                const speedMatch = speedStr.match(/([\d.]+)/);
                if (speedMatch) {
                    const speed = parseFloat(speedMatch[1]);
                    if (speedStr.includes('MB')) totalSpeed += speed * 1024;
                    else if (speedStr.includes('KB')) totalSpeed += speed;
                }
            }
        }

        const averageProgress = activeDownloads > 0 ? totalProgress / activeDownloads : 0;
        const overallProgress = this.getOverallProgress();

        // Ensure totalSpeed is a number
        const speedValue = isNaN(totalSpeed) ? 0 : totalSpeed;

        this.emit('aggregateProgress', {
            averageProgress: averageProgress.toFixed(1),
            activeDownloads,
            totalSpeed: speedValue.toFixed(1),
            overallProgress: overallProgress.toFixed(1),
            eta: this.calculateETA()
        });
    }

    getOverallProgress() {
        const total = this.completed.length + this.failed.length + this.processing.size + this.queue.length;
        const done = this.completed.length + this.failed.length;
        return total > 0 ? (done / total) * 100 : 0;
    }

    calculateETA() {
        const elapsed = Date.now() - this.startTime;
        const completed = this.completed.length;
        const total = completed + this.failed.length + this.processing.size + this.queue.length;

        if (completed === 0 || total === 0) return 'Calculating...';

        const avgTimePerItem = elapsed / completed;
        const remaining = total - completed - this.failed.length;
        const eta = remaining * avgTimePerItem;

        return this.formatDuration(eta);
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    getStatus() {
        // Get format breakdown
        const formatStats = this.getFormatBreakdown();

        return {
            queue: this.queue.length,
            processing: this.processing.size,
            completed: this.completed.length,
            failed: this.failed.length,
            totalProxies: this.proxyRotator.proxies.length,
            failedProxies: this.proxyRotator.failedProxies.size,
            overallProgress: this.getOverallProgress(),
            eta: this.calculateETA(),
            uptime: this.formatDuration(Date.now() - this.startTime),
            formats: formatStats
        };
    }

    getFormatBreakdown() {
        const init = () => ({ completed: 0, failed: 0, processing: 0, queue: 0 });
        const stats = { mp3: init(), mp4: init() };

        const bump = (fmt, key) => {
            if (!fmt) return;
            const f = String(fmt).toLowerCase();
            (stats[f] ??= init())[key] += 1;
        };

        (this.completed || []).forEach(({ format }) => bump(format, 'completed'));
        (this.failed || []).forEach(({ format }) => bump(format, 'failed'));
        (this.processing || []).forEach(({ format }) => bump(format, 'processing'));
        (this.queue || []).forEach(({ format }) => bump(format, 'queue'));

        return stats;
    }


    // Persistence Methods (same as before)
    saveQueueState() {
        const state = {
            queue: this.queue,
            completed: this.completed.map(item => ({ ...item, process: undefined })),
            failed: this.failed,
            startTime: this.startTime,
            defaultFormat: this.defaultFormat,
            defaultQuality: this.defaultQuality,
            lastSaved: new Date().toISOString()
        };

        try {
            fs.writeFileSync(this.queueFile, JSON.stringify(state, null, 2));
        } catch (error) {
            console.error('⚠️ Failed to save queue state:', error.message);
        }
    }

    loadQueueState() {
        try {
            if (fs.existsSync(this.queueFile)) {
                const state = JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));

                this.queue = state.queue?.filter(item =>
                    item.status !== 'completed' && item.status !== 'failed'
                ) || [];

                this.completed = state.completed || [];
                this.failed = state.failed || [];
                this.startTime = state.startTime || Date.now();

                // Restore format preferences if available
                if (state.defaultFormat) this.defaultFormat = state.defaultFormat;
                if (state.defaultQuality) this.defaultQuality = state.defaultQuality;

                if (this.queue.length > 0) {
                    console.log(`📂 Restored ${this.queue.length} items from previous session`);
                    const formatBreakdown = this.getFormatBreakdown();
                    console.log(`📊 Formats: MP3(${formatBreakdown.mp3.queue}), MP4(${formatBreakdown.mp4.queue})`);
                    console.log(`✅ Previous session: ${this.completed.length} completed, ${this.failed.length} failed`);

                    this.queue.forEach(item => {
                        item.status = 'queued';
                        item.attempts = item.attempts || 0;
                        // Ensure format exists (backward compatibility)
                        if (!item.format) item.format = 'mp3';
                        if (!item.quality) item.quality = 'best';
                    });

                    setTimeout(() => this.processNext(), 2000);
                }
            }
        } catch (error) {
            console.error('⚠️ Failed to load queue state:', error.message);
        }
    }

    clearQueueState() {
        try {
            if (fs.existsSync(this.queueFile)) {
                fs.unlinkSync(this.queueFile);
                console.log('🗑️ Queue state file cleared');
            }
        } catch (error) {
            console.error('⚠️ Failed to clear queue state:', error.message);
        }
    }

    addProxy(proxy) {
        this.proxyRotator.addProxy(proxy);
    }

    clearQueue() {
        this.queue = [];
        console.log('🗑️ Queue cleared');
        this.emit('queueUpdated', this.getStatus());
        this.saveQueueState();
    }

    pauseAll() {
        for (const [id, item] of this.processing) {
            if (item.process) {
                item.process.kill();
                console.log(`⏸️ Paused: ${item.title}`);
            }
        }
        this.processing.clear();
        this.saveQueueState();
    }

    getDetailedStatus() {
        const processingItems = Array.from(this.processing.values()).map(item => ({
            id: item.id,
            title: item.title,
            format: item.format,
            quality: item.quality,
            progress: this.progressData.get(item.id) || { percent: 0, speed: '0 KB/s' },
            attempts: item.attempts,
            startedAt: item.startedAt
        }));

        return {
            ...this.getStatus(),
            processingItems,
            recentCompleted: this.completed.slice(-3),
            recentFailed: this.failed.slice(-3)
        };
    }
}