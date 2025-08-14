import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { createInterface } from 'readline';

export class GoogleDriveAuth {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || this.loadClientConfig()?.client_id;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || this.loadClientConfig()?.client_secret;
    this.redirectUri = 'http://localhost:8080/callback';
    this.scopes = 'https://www.googleapis.com/auth/drive.readonly';
    this.tokensFile = path.join('./downloads', '.gdrive-tokens.json');
    
    if (!this.clientId || !this.clientSecret) {
      console.log('⚠️ Google API credentials not found. Please set up credentials first.');
    }
  }

  loadClientConfig() {
    const configFile = path.join('./downloads', '.google-credentials.json');
    try {
      if (fs.existsSync(configFile)) {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        return config.installed || config.web;
      }
    } catch (error) {
      console.log('⚠️ Could not load Google credentials');
    }
    return null;
  }

  saveClientConfig(clientId, clientSecret) {
    const configFile = path.join('./downloads', '.google-credentials.json');
    try {
      if (!fs.existsSync('./downloads')) {
        fs.mkdirSync('./downloads', { recursive: true });
      }
      
      const config = {
        installed: {
          client_id: clientId,
          client_secret: clientSecret,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          redirect_uris: ["http://localhost:8080/callback"]
        }
      };
      
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      
      console.log('✅ Google credentials saved');
    } catch (error) {
      console.log('❌ Could not save Google credentials');
    }
  }

  getAuthUrl() {
    if (!this.clientId) {
      throw new Error('Google Client ID not configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state: Math.random().toString(36).substring(2, 15)
    });

    return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
  }

  async authenticateWithBrowser() {
    return new Promise((resolve, reject) => {
      if (!this.clientId || !this.clientSecret) {
        reject(new Error('Google API credentials not configured'));
        return;
      }

      console.log('\n🔐 Starting Google Drive authentication...');
      
      // Create temporary web server to handle callback
      const server = createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:8080`);
        
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>❌ Authentication Failed</h2>
                  <p>Error: ${error}</p>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(`Authentication failed: ${error}`));
            return;
          }
          
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>✅ Authentication Successful!</h2>
                  <p>You can close this window and return to TubeToolkit.</p>
                  <p>Your Google Drive access has been granted.</p>
                </body>
              </html>
            `);
            
            server.close();
            
            // Exchange code for tokens
            this.exchangeCodeForTokens(code)
              .then(resolve)
              .catch(reject);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>❌ No Authorization Code</h2>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('No authorization code received'));
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(8080, (err) => {
        if (err) {
          reject(new Error('Could not start local server for authentication'));
          return;
        }

        const authUrl = this.getAuthUrl();
        console.log('🌐 Opening browser for authentication...');
        console.log(`🔗 If browser doesn't open automatically, visit: ${authUrl}`);
        
        // Try to open browser automatically
        this.openBrowser(authUrl);
        
        console.log('\n⏳ Waiting for you to complete authentication in browser...');
        console.log('💡 After signing in, you\'ll be redirected back to TubeToolkit');
      });
    });
  }

  async authenticateWithManualCode() {
    return new Promise((resolve, reject) => {
      if (!this.clientId || !this.clientSecret) {
        reject(new Error('Google API credentials not configured'));
        return;
      }

      // Use a simplified redirect URI for manual flow
      const manualRedirectUri = 'urn:ietf:wg:oauth:2.0:oob';
      
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: manualRedirectUri,
        scope: this.scopes,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent'
      });

      const authUrl = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
      
      console.log('\n🔐 Manual Google Drive authentication');
      console.log('📋 Please follow these steps:');
      console.log('1. Copy and paste this URL into your browser:');
      console.log(`\n${authUrl}\n`);
      console.log('2. Sign in to your Google account');
      console.log('3. Grant permission to access your Google Drive');
      console.log('4. Copy the authorization code from the browser');
      console.log('5. Paste it below\n');

      // Try to open browser
      this.openBrowser(authUrl);

      const readline = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question('Paste the authorization code here: ', (code) => {
        readline.close();
        
        if (!code.trim()) {
          reject(new Error('No authorization code provided'));
          return;
        }

        // Exchange code for tokens using manual redirect URI
        this.exchangeCodeForTokens(code.trim(), manualRedirectUri)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  openBrowser(url) {
    const platform = process.platform;
    let command;

    switch (platform) {
      case 'darwin': // macOS
        command = 'open';
        break;
      case 'win32': // Windows
        command = 'start';
        break;
      default: // Linux and others
        command = 'xdg-open';
        break;
    }

    try {
      if (platform === 'win32') {
        spawn('cmd', ['/c', 'start', url], { stdio: 'ignore' });
      } else {
        spawn(command, [url], { stdio: 'ignore' });
      }
    } catch (error) {
      console.log('⚠️ Could not open browser automatically');
    }
  }

  async exchangeCodeForTokens(code, redirectUri = null) {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const postData = new URLSearchParams({
      code: code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri || this.redirectUri,
      grant_type: 'authorization_code'
    }).toString();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'oauth2.googleapis.com',
        port: 443,
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': postData.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const tokens = JSON.parse(data);
            
            if (tokens.error) {
              reject(new Error(`Token exchange failed: ${tokens.error_description || tokens.error}`));
              return;
            }
            
            if (tokens.access_token) {
              this.saveTokens(tokens);
              console.log('✅ Google Drive authentication successful!');
              console.log('🔐 Access tokens saved securely');
              resolve(tokens);
            } else {
              reject(new Error('No access token received'));
            }
          } catch (error) {
            reject(new Error('Invalid token response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Token exchange failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  saveTokens(tokens) {
    try {
      if (!fs.existsSync('./downloads')) {
        fs.mkdirSync('./downloads', { recursive: true });
      }
      
      const tokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        token_type: tokens.token_type,
        scope: tokens.scope,
        expires_at: Date.now() + (tokens.expires_in * 1000),
        created_at: new Date().toISOString()
      };
      
      fs.writeFileSync(this.tokensFile, JSON.stringify(tokenData, null, 2));
    } catch (error) {
      console.log('⚠️ Could not save tokens:', error.message);
    }
  }

  loadTokens() {
    try {
      if (fs.existsSync(this.tokensFile)) {
        const tokens = JSON.parse(fs.readFileSync(this.tokensFile, 'utf8'));
        
        // Check if token is expired
        if (tokens.expires_at && Date.now() > tokens.expires_at) {
          console.log('🔄 Access token expired, attempting refresh...');
          return this.refreshAccessToken(tokens.refresh_token);
        }
        
        return tokens;
      }
    } catch (error) {
      console.log('⚠️ Could not load tokens:', error.message);
    }
    return null;
  }

  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const postData = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token'
    }).toString();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'oauth2.googleapis.com',
        port: 443,
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': postData.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const tokens = JSON.parse(data);
            
            if (tokens.error) {
              reject(new Error(`Token refresh failed: ${tokens.error_description || tokens.error}`));
              return;
            }
            
            if (tokens.access_token) {
              // Preserve the refresh token if not provided in response
              tokens.refresh_token = tokens.refresh_token || refreshToken;
              this.saveTokens(tokens);
              console.log('🔄 Access token refreshed successfully');
              resolve(tokens);
            } else {
              reject(new Error('No access token received during refresh'));
            }
          } catch (error) {
            reject(new Error('Invalid token response during refresh'));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Token refresh failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  getAccessToken() {
    const tokens = this.loadTokens();
    return tokens?.access_token || null;
  }

  isAuthenticated() {
    const tokens = this.loadTokens();
    return !!(tokens?.access_token && (!tokens.expires_at || Date.now() < tokens.expires_at));
  }

  clearTokens() {
    try {
      if (fs.existsSync(this.tokensFile)) {
        fs.unlinkSync(this.tokensFile);
        console.log('🗑️ Google Drive tokens cleared');
      }
    } catch (error) {
      console.log('⚠️ Could not clear tokens:', error.message);
    }
  }

  // Setup wizard for first-time users - FIXED: Use ES module createInterface
  async setupCredentials() {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🔧 Google Drive API Setup');
    console.log('📋 You need to create a Google Cloud project and OAuth2 credentials.');
    console.log('\n📖 Steps:');
    console.log('1. Go to: https://console.cloud.google.com/');
    console.log('2. Create a new project or select existing one');
    console.log('3. Enable Google Drive API');
    console.log('4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"');
    console.log('5. Choose "Desktop Application"');
    console.log('6. Copy your Client ID and Client Secret');
    console.log('\n📋 Enter your credentials:');

    return new Promise((resolve, reject) => {
      readline.question('Client ID: ', (clientId) => {
        readline.question('Client Secret: ', (clientSecret) => {
          readline.close();
          
          if (!clientId.trim() || !clientSecret.trim()) {
            reject(new Error('Client ID and Secret are required'));
            return;
          }

          this.saveClientConfig(clientId.trim(), clientSecret.trim());
          resolve({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
        });
      });
    });
  }
}

export default GoogleDriveAuth;