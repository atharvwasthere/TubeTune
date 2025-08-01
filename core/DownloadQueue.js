import { DEFAULT_OUTPUT_DIR, MAX_CONCURRENT_DOWNLOADS ,MAX_ATTEMPTS } from './Config.js';
import proxyRotator from './ProxyRotator.js';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { downloadWithYtDlp } from './Downloader.js';


export default class DownloadQueue extends EventEmitter {
    constructor(outputDir = DEFAULT_OUTPUT_DIR) {
        super();
        this.queue = [];
        this.processing = new Map();
        this.completed = [];
        this.failed = [];
        this.maxConcurrent = MAX_CONCURRENT_DOWNLOADS;
        this.outputDir = outputDir;
        this.proxyRotator = new proxyRotator();

        // Create output Dir
        if(!fs.existsSync(outputDir)) {
            // recursive creates or copies the exact dir structure mentioned here 
            fs.mkdirSync(outputDir, { recursive: true }); 

        }
    }

    addUrl(url, title = null){
        const item = {
            id: Date.now() + Math.random(),
            url,
            title: title || 'Unknown',
            addedAt: new Date(),
            attempts:0,
            maxAttempts: MAX_ATTEMPTS
        };

        this.queue.push(item);
        console.log(`📥 Added to queue: ${url}`);
        this.emit('queueUpdated', this.getStatus());

        // if under max capacity start processing 
        this.processNext();

        return item.id;
    }

    async processNext() {
        if(this.processing.size >= this.MAX_CONCURRENT_DOWNLOADS || this.queue.length === 0 ) {
            return;
        }

        const item = this.queue.shift(); // popping
        this.processing.set(item.id, item);

        console.log(`\n🚀 Starting download: ${item.url}`);
        this.emit('downloadStarted', item);
        
        const proxy = this.proxyRotator.getCurrentProxy();

        try {
            await downloadWithYtDlp(item, proxy, this.outputDir, this.emit.bind(this, 'progress'));
            this.completed.push(item);
            console.log(`✅ Completed: ${item.title}`);
            this.emit('downloadCompleted', item);
        } catch (error) {
            console.log(`❌Uh Oh! Failed: ${item.title} - ${error.message}`);

            item.attempts++;
            if( item.attempts < item.maxAttempts) {
                console.log(`🔄 Retrying (${item.attempts}/${item.maxAttempts}): ${item.title}`);
                this.queue.unshift(item); // Add back to front of queue
            } else {
                this.failed.push({ ...item, error: error.message });
                this.emit('downloadFailed', item, error);
            }
        }

        this.processing.delete(item.id);
        this.emit('queueUpdated', this.getStatus());

        // Process it again 
        setTimeout(()=> this.processNext(), 1000);

    }


    getStatus() {
        return {
            queue: this.queue.length,
            processing: this.processing.size,
            completed: this.completed.length,
            failed: this.failed.length,
            totalProxies: this.proxyRotator.proxies.length,
            failedProxies: this.proxyRotator.failedProxies.size
        };
    }

    addProxy(proxy){
        this.proxyRotator.addProxy(proxy);
    }

    clearQueue(){
        this.queue = [];
        console.log('🗑️ Queue cleared');
        this.emit('queueUpdated', this.getStatus());
    }

    pauseAll() {
        // Kill all the running process
        for(const [id, item] of this.processing) {
            if (item.process) {
                item.process.kill();
                console.log(`⏸️ Paused: ${item.title}`);
            }
        }
        this.processing.clear();
    }
}