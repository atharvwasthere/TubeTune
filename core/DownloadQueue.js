
import proxyRotator from ('../core/ProxyRotator.js');
import { EventEmitter } from 'node:events';
import fs from 'node:fs';


export default class DownloadQueue extends EventEmitter {
    constructor(outputDir = './downloads') {
        super();
        this.queue = [];
        this.processing = new Map();
        this.completed = [];
        this.failed = [];
        this.maxConcurrent = 2;
        this.outputDir = outputDir;
        this.proxyRotator = new proxyRotator();

        // Create output Dir
        if(!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true }); // what is recursive here
        }
    }

    addUrl(){

    }

    async processNext() {

    }

    downloadVideo() {

    }

    getStatus() {

    }

    addProxy(){

    }

    clearQueue(){

    }

    pauseAll() {

    }
}