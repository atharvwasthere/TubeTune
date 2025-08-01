
export default class ProxyRotator {
    constructor() {
        this.proxies = [
            // Add your proxies here later - format: 'http://ip:port' or 'socks5://ip:port'
            // 'http://proxy1.example.com:8080',
            // 'http://proxy2.example.com:8080',
            'http://getvfzch:ecvfmkkgvt3z@23.95.150.145:6114',
            'http://getvfzch:ecvfmkkgvt3z@198.23.239.134:6540',
            'http://getvfzch:ecvfmkkgvt3z@45.38.107.97:6014',
            'http://getvfzch:ecvfmkkgvt3z@207.244.217.165:6712',
            'http://getvfzch:ecvfmkkgvt3z@107.172.163.27:6543',
            'http://getvfzch:ecvfmkkgvt3z@104.222.161.211:6343',
            'http://getvfzch:ecvfmkkgvt3z@64.137.96.74:6641',
            'http://getvfzch:ecvfmkkgvt3z@216.10.27.159:6837',
            'http://getvfzch:ecvfmkkgvt3z@136.0.207.84:6661',
            'http://getvfzch:ecvfmkkgvt3z@142.147.128.93:6593'
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

