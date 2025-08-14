// File: core/GDriveDownloader.js
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { URL } from 'node:url';

export class GoogleDriveDownloader {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || null;
    this.accessToken = this.loadAccessToken();
  }

  loadAccessToken() {
    const tokenFile = path.join('./downloads', '.gdrive-tokens.json');
    try {
      if (fs.existsSync(tokenFile)) {
        const tokens = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        
        // Check if token is expired
        if (tokens.expires_at && Date.now() > tokens.expires_at) {
          console.log('🔄 Google Drive token expired');
          return null;
        }
        
        return tokens.access_token;
      }
    } catch (error) {
      console.log('⚠️ Could not load Google Drive tokens');
    }
    return null;
  }

  saveAccessToken(accessToken, refreshToken = null) {
    const tokenFile = path.join('./downloads', '.gdrive-tokens.json');
    try {
      if (!fs.existsSync('./downloads')) {
        fs.mkdirSync('./downloads', { recursive: true });
      }
      const tokens = {
        access_token: accessToken,
        refresh_token: refreshToken,
        saved_at: new Date().toISOString()
      };
      fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
    } catch (error) {
      console.log('⚠️ Could not save Google Drive tokens');
    }
  }

  async getFileInfo(fileId) {
    // Try public access first
    let fileInfo = await this.getPublicFileInfo(fileId);
    
    // If public access fails and we have auth, try authenticated access
    if (!fileInfo.accessible && this.accessToken) {
      fileInfo = await this.getAuthenticatedFileInfo(fileId);
    }

    return fileInfo;
  }

  async getPublicFileInfo(fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,permissions`;
    
    if (this.apiKey) {
      url += `&key=${this.apiKey}`;
    }

    try {
      const response = await this.makeRequest(url);
      const data = JSON.parse(response);
      
      // Check if file is publicly accessible
      const isPublic = data.permissions && data.permissions.some(p => 
        p.type === 'anyone' && p.role === 'reader'
      );

      return {
        accessible: isPublic,
        id: data.id,
        name: data.name,
        size: this.formatFileSize(parseInt(data.size) || 0),
        mimeType: data.mimeType || 'unknown'
      };
    } catch (error) {
      return {
        accessible: false,
        id: fileId,
        name: 'Unknown File',
        size: 'Unknown',
        mimeType: 'unknown',
        error: error.message
      };
    }
  }

  async getAuthenticatedFileInfo(fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType`;
    
    try {
      const response = await this.makeRequest(url, {
        'Authorization': `Bearer ${this.accessToken}`
      });
      const data = JSON.parse(response);

      return {
        accessible: true,
        id: data.id,
        name: data.name,
        size: this.formatFileSize(parseInt(data.size) || 0),
        mimeType: data.mimeType || 'unknown'
      };
    } catch (error) {
      return {
        accessible: false,
        id: fileId,
        name: 'Unknown File',
        size: 'Unknown',
        mimeType: 'unknown',
        error: error.message
      };
    }
  }

  async downloadFile(fileId, outputPath, progressCallback = null) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get download URL
        const downloadUrl = await this.getDownloadUrl(fileId);
        if (!downloadUrl) {
          throw new Error('Could not get download URL');
        }

        // Create output directory if it doesn't exist
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Start download
        const file = fs.createWriteStream(outputPath);
        const urlObj = new URL(downloadUrl);
        
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: this.accessToken ? {
            'Authorization': `Bearer ${this.accessToken}`
          } : {}
        };

        const req = https.request(options, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            // Handle redirect
            const redirectUrl = res.headers.location;
            this.downloadFromUrl(redirectUrl, outputPath, progressCallback)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }

          const totalSize = parseInt(res.headers['content-length']) || 0;
          let downloadedSize = 0;
          let lastUpdate = 0;

          res.on('data', (chunk) => {
            downloadedSize += chunk.length;
            file.write(chunk);

            // Throttle progress updates
            const now = Date.now();
            if (progressCallback && now - lastUpdate > 200) {
              const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
              const speed = this.calculateSpeed(downloadedSize, now - (this.startTime || now));
              
              progressCallback({
                percent: percent.toFixed(1),
                downloadedSize,
                totalSize,
                speed: speed
              });
              
              lastUpdate = now;
            }
          });

          res.on('end', () => {
            file.end();
            if (progressCallback) {
              progressCallback({
                percent: 100,
                downloadedSize: totalSize,
                totalSize,
                speed: 'Complete'
              });
            }
            resolve(outputPath);
          });

          res.on('error', (error) => {
            file.destroy();
            fs.unlink(outputPath, () => {}); // Clean up partial file
            reject(error);
          });
        });

        req.on('error', (error) => {
          file.destroy();
          fs.unlink(outputPath, () => {}); // Clean up partial file
          reject(error);
        });

        this.startTime = Date.now();
        req.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  async downloadFromUrl(url, outputPath, progressCallback = null) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET'
      };

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        const totalSize = parseInt(res.headers['content-length']) || 0;
        let downloadedSize = 0;
        let lastUpdate = 0;
        const startTime = Date.now();

        res.on('data', (chunk) => {
          downloadedSize += chunk.length;
          file.write(chunk);

          const now = Date.now();
          if (progressCallback && now - lastUpdate > 200) {
            const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
            const speed = this.calculateSpeed(downloadedSize, now - startTime);
            
            progressCallback({
              percent: percent.toFixed(1),
              downloadedSize,
              totalSize,
              speed: speed
            });
            
            lastUpdate = now;
          }
        });

        res.on('end', () => {
          file.end();
          if (progressCallback) {
            progressCallback({
              percent: 100,
              downloadedSize: totalSize,
              totalSize,
              speed: 'Complete'
            });
          }
          resolve(outputPath);
        });

        res.on('error', (error) => {
          file.destroy();
          fs.unlink(outputPath, () => {});
          reject(error);
        });
      });

      req.on('error', (error) => {
        file.destroy();
        fs.unlink(outputPath, () => {});
        reject(error);
      });

      req.end();
    });
  }

  async getDownloadUrl(fileId) {
    // For public files, use direct download URL
    if (!this.accessToken) {
      return `https://drive.google.com/uc?id=${fileId}&export=download`;
    }

    // For authenticated access, get the download URL from API
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      return url;
    } catch (error) {
      // Fallback to public URL
      return `https://drive.google.com/uc?id=${fileId}&export=download`;
    }
  }

  async makeRequest(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'TubeToolkit/1.0',
          ...headers
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  calculateSpeed(downloadedBytes, elapsedMs) {
    if (elapsedMs === 0) return '0 B/s';
    
    const bytesPerSecond = (downloadedBytes * 1000) / elapsedMs;
    return this.formatFileSize(bytesPerSecond) + '/s';
  }

  extractFileId(input) {
    // Handle various Google Drive URL formats
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,  // Full URL
      /id=([a-zA-Z0-9-_]+)/,         // URL parameter  
      /^([a-zA-Z0-9-_]+)$/           // Just the ID
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  extractFolderId(input) {
    // Handle various Google Drive folder URL formats
    const patterns = [
      /\/drive\/folders\/([a-zA-Z0-9-_]+)/,  // Folder URL
      /\/drive\/u\/\d+\/folders\/([a-zA-Z0-9-_]+)/, // User-specific folder URL
      /folders\/([a-zA-Z0-9-_]+)/,           // Partial folder URL
      /^([a-zA-Z0-9-_]+)$/                   // Just the ID
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  async getFolderInfo(folderId) {
    const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,permissions`;
    
    if (this.apiKey) {
      url += `&key=${this.apiKey}`;
    }

    try {
      const response = await this.makeRequest(url, this.accessToken ? {
        'Authorization': `Bearer ${this.accessToken}`
      } : {});
      
      const data = JSON.parse(response);
      
      // Verify it's actually a folder
      if (data.mimeType !== 'application/vnd.google-apps.folder') {
        return {
          accessible: false,
          isFolder: false,
          error: 'Not a folder'
        };
      }

      // Check if folder is publicly accessible
      const isPublic = data.permissions && data.permissions.some(p => 
        p.type === 'anyone' && p.role === 'reader'
      );

      return {
        accessible: isPublic || !!this.accessToken,
        isFolder: true,
        id: data.id,
        name: data.name,
        mimeType: data.mimeType
      };
    } catch (error) {
      return {
        accessible: false,
        isFolder: false,
        id: folderId,
        name: 'Unknown Folder',
        error: error.message
      };
    }
  }

  async listFolderContents(folderId, recursive = false) {
    const files = [];
    let pageToken = null;

    do {
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
      url.searchParams.set('fields', 'nextPageToken,files(id,name,size,mimeType,parents)');
      url.searchParams.set('pageSize', '100');
      
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      
      if (this.apiKey && !this.accessToken) {
        url.searchParams.set('key', this.apiKey);
      }

      try {
        const response = await this.makeRequest(url.toString(), this.accessToken ? {
          'Authorization': `Bearer ${this.accessToken}`
        } : {});
        
        const data = JSON.parse(response);
        
        for (const file of data.files || []) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            // It's a subfolder
            files.push({
              id: file.id,
              name: file.name,
              type: 'folder',
              mimeType: file.mimeType,
              path: file.name
            });
            
            // If recursive, get contents of subfolder
            if (recursive) {
              const subFiles = await this.listFolderContents(file.id, true);
              subFiles.forEach(subFile => {
                subFile.path = `${file.name}/${subFile.path}`;
                files.push(subFile);
              });
            }
          } else {
            // It's a file
            files.push({
              id: file.id,
              name: file.name,
              type: 'file',
              size: parseInt(file.size) || 0,
              mimeType: file.mimeType,
              path: file.name
            });
          }
        }
        
        pageToken = data.nextPageToken;
      } catch (error) {
        console.log(`⚠️ Error listing folder contents: ${error.message}`);
        break;
      }
    } while (pageToken);

    return files;
  }

  async downloadFolder(folderId, outputPath, options = {}) {
    const {
      recursive = true,
      progressCallback = null,
      includeSubfolders = true,
      fileFilter = null // function to filter files
    } = options;

    try {
      // Get folder info
      const folderInfo = await this.getFolderInfo(folderId);
      if (!folderInfo.accessible) {
        throw new Error(`Cannot access folder: ${folderInfo.error || 'Permission denied'}`);
      }

      console.log(`\n📁 Scanning folder: ${folderInfo.name}`);
      
      // List all contents
      const contents = await this.listFolderContents(folderId, recursive);
      
      // Filter files if filter function provided
      const files = contents.filter(item => {
        if (item.type === 'folder') return includeSubfolders;
        return fileFilter ? fileFilter(item) : true;
      }).filter(item => item.type === 'file'); // Only download files
      
      if (files.length === 0) {
        console.log('📭 No files found in folder');
        return [];
      }

      console.log(`📊 Found ${files.length} file(s) to download`);
      
      // Create base folder structure
      const folderOutputPath = path.join(outputPath, folderInfo.name);
      if (!fs.existsSync(folderOutputPath)) {
        fs.mkdirSync(folderOutputPath, { recursive: true });
      }

      const results = [];
      let completed = 0;
      
      // Download files sequentially to avoid overwhelming the API
      for (const file of files) {
        try {
          const fileDir = path.dirname(file.path);
          const fullDir = fileDir === '.' ? folderOutputPath : path.join(folderOutputPath, fileDir);
          
          // Create subdirectory if needed
          if (!fs.existsSync(fullDir)) {
            fs.mkdirSync(fullDir, { recursive: true });
          }
          
          const filePath = path.join(fullDir, file.name);
          
          console.log(`\n📥 [${completed + 1}/${files.length}] ${file.path}`);
          
          await this.downloadFile(file.id, filePath, (progress) => {
            if (progressCallback) {
              progressCallback({
                ...progress,
                fileName: file.name,
                filePath: file.path,
                currentFile: completed + 1,
                totalFiles: files.length,
                overallPercent: ((completed / files.length) * 100 + (parseFloat(progress.percent) / files.length)).toFixed(1)
              });
            }
          });
          
          completed++;
          results.push({
            success: true,
            file: file,
            outputPath: filePath
          });
          
          console.log(`✅ ${file.name}`);
          
        } catch (error) {
          console.log(`❌ ${file.name}: ${error.message}`);
          results.push({
            success: false,
            file: file,
            error: error.message
          });
        }
      }
      
      // Summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log(`\n📊 Folder download complete:`);
      console.log(`✅ ${successful} files downloaded successfully`);
      if (failed > 0) {
        console.log(`❌ ${failed} files failed`);
      }
      console.log(`📁 Saved to: ${folderOutputPath}`);
      
      return results;
      
    } catch (error) {
      console.log(`❌ Folder download failed: ${error.message}`);
      throw error;
    }
  }

  // OAuth2 helper methods (simplified)
  getAuthUrl(clientId, redirectUri) {
    const scopes = 'https://www.googleapis.com/auth/drive.readonly';
    const authUrl = 'https://accounts.google.com/o/oauth2/auth';
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `${authUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code, clientId, clientSecret, redirectUri) {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const postData = new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
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
            if (tokens.access_token) {
              this.accessToken = tokens.access_token;
              this.saveAccessToken(tokens.access_token, tokens.refresh_token);
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
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }
}

export default GoogleDriveDownloader;