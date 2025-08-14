
export default class ProxyRotator {
    constructor() {
        this.proxies = [
            // Add your proxies here later - format: 'http://ip:port' or 'socks5://ip:port'
            // 'http://proxy1.example.com:8080',
            // 'http://proxy2.example.com:8080',
            // 'http://139.167.143.182:8080'
        ];
        this.currentIndex = 0;
        this.failedProxies = new Set();
        this.rotationCount = 0;
    }

    getCurrentProxy() {
        if (this.proxies.length === 0) return null;

        //Skip the failed proxies 
        let attempts = 0;
        while (attempts < this.proxies.length) {
            const proxy = this.proxies[this.currentIndex];
            if (!this.failedProxies.has(proxy)) {
                return proxy;
            }
            this.rotateToNext();
            attempts++;
        }

        // All proxies failed, clear failed list and restart 
        console.log("🔄 All proxies failed, resetting failed list...");
        this.failedProxies.clear();
        return this.proxies[this.currentIndex];
    }

    rotateToNext() {
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        this.rotationCount++;
        console.log(`🔄 Rotated to proxy ${this.currentIndex + 1}/${this.proxies.length}`);

    }

    markAsFailed(proxy) {
        this.failedProxies.add(proxy);
        console.log(`❌ Marked proxy as failed: ${proxy}`);
        this.rotateToNext();
    }

    addProxy(proxy) {
        this.proxies.push(proxy);
        console.log(`➕ Added proxy: ${proxy}`);
    }
}

