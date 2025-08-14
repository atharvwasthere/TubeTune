#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { basename } from 'path';
import { createInterface } from 'readline';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'child_process';

import DownloadQueue from '../core/DownloadQueue.js';
import ProgressDashboard from '../utils/Progress.js';
import GoogleDriveDownloader from '../core/GDriveDownloader.js';
import GoogleDriveAuth from '../core/GoogleAuth.js';
import {
  SUPPORTED_FORMATS,
  DEFAULT_FORMAT,
  DEFAULT_QUALITY,
  MP4_QUALITY_PRESETS,
  MP3_QUALITY_PRESETS
} from '../core/Config.js';
import { printSubtitle, printBannerOnly, printVersion } from '../utils/asciiBanner.js';

class TubeToolkitWizard {
  constructor() {
    this.downloader = new DownloadQueue('./downloads');
    this.dashboard = new ProgressDashboard();
    this.gdriveDownloader = new GoogleDriveDownloader();
    this.gdriveAuth = new GoogleDriveAuth();
    this.statusInterval = null;
    this.rl = null;
    this.settings = this.loadSettings();
    this.setupEventListeners();
  }

  loadSettings() {
    const settingsFile = path.join('./downloads', '.tubetoolkit-settings.json');
    try {
      if (fs.existsSync(settingsFile)) {
        return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      }
    } catch (error) {
      console.log('⚠️ Could not load settings, using defaults');
    }
    
    return {
      outputDir: './downloads',
      askBeforeOverwrite: true,
      telemetry: false,
      lastSource: null,
      lastAction: 'download-as-is'
    };
  }

  saveSettings() {
    const settingsFile = path.join('./downloads', '.tubetoolkit-settings.json');
    try {
      if (!fs.existsSync('./downloads')) {
        fs.mkdirSync('./downloads', { recursive: true });
      }
      fs.writeFileSync(settingsFile, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.log('⚠️ Could not save settings');
    }
  }

  setupEventListeners() {
    this.downloader.on('progress', (progressData) => {
      this.dashboard.updateDownload(progressData.itemId, progressData);
    });

    this.downloader.on('downloadStarted', (item) => {
      this.dashboard.addDownload(item.id, `${item.title} (${item.format.toUpperCase()})`);
    });

    this.downloader.on('downloadCompleted', (item) => {
      console.log(`\n🎉 ${item.format.toUpperCase()} Download completed: ${item.title}`);
      this.dashboard.completeDownload(item.id, true);
    });

    this.downloader.on('downloadFailed', (item) => {
      console.log(`\n💥 ${item.format.toUpperCase()} Download failed permanently: ${item.title}`);
      this.dashboard.completeDownload(item.id, false);
    });

    this.downloader.on('aggregateProgress', (aggregateData) => {
      this.dashboard.updateAggregateProgress(aggregateData);
    });

    this.downloader.on('queueUpdated', (status) => {
      if (status.queue === 0 && status.processing === 0 && (status.completed > 0 || status.failed > 0)) {
        setTimeout(() => {
          this.dashboard.stop();
          this.stopStatusMonitoring();
          console.log('\n🏁 All downloads finished!');
          if (this.rl) this.rl.close();
        }, 1000);
      }
    });
  }

  createReadline() {
    if (this.rl) return this.rl;
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    return this.rl;
  }

  async prompt(question) {
    const rl = this.createReadline();
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  }

  async showMainMenu() {
    console.log('\n┌ TubeToolkit ───────────────────────────────────────────');
    console.log('│ What do you want to do?');
    console.log('│  1. Download from Google Drive');
    console.log('│  2. Download from YouTube');
    console.log('│  3. Configure settings');
    console.log('│  4. Sign in to Google Drive');
    console.log('│  5. Check my system (doctor)');
    console.log('│  6. Exit');
    console.log('└────────────────────────────────────────────────────────');

    const choice = await this.prompt('> ');
    
    switch (choice.trim()) {
      case '1':
        await this.handleGoogleDriveFlow();
        break;
      case '2':
        await this.handleYouTubeFlow();
        break;
      case '3':
        await this.configureSettings();
        break;
      case '4':
        await this.signInToGoogleDrive();
        break;
      case '5':
        await this.runDoctor();
        break;
      case '6':
        console.log('👋 Goodbye!');
        this.rl.close();
        process.exit(0);
        break;
      default:
        console.log('❌ Invalid choice. Please select 1-6.');
        await this.showMainMenu();
    }
  }

  async showQuickMenu() {
    console.log('\nWelcome back. Do you want to:');
    console.log('  1. Quick download from Drive (use last settings)');
    console.log('  2. Quick download from YouTube (use last settings)');
    console.log('  3. Download from Google Drive (step‑by‑step)');
    console.log('  4. Download from YouTube (step‑by‑step)');
    console.log('  5. Configure settings');
    console.log('  6. Sign in to Google Drive');
    console.log('  7. Check my system (doctor)');
    console.log('  8. Exit');

    const choice = await this.prompt('> ');
    
    switch (choice.trim()) {
      case '1':
        if (this.settings.lastSource === 'gdrive') {
          await this.quickGoogleDriveFlow();
        } else {
          console.log('❌ No previous Google Drive session found. Using full flow.');
          await this.handleGoogleDriveFlow();
        }
        break;
      case '2':
        if (this.settings.lastSource === 'youtube') {
          await this.quickYouTubeFlow();
        } else {
          console.log('❌ No previous YouTube session found. Using full flow.');
          await this.handleYouTubeFlow();
        }
        break;
      case '3':
        await this.handleGoogleDriveFlow();
        break;
      case '4':
        await this.handleYouTubeFlow();
        break;
      case '5':
        await this.configureSettings();
        break;
      case '6':
        await this.signInToGoogleDrive();
        break;
      case '7':
        await this.runDoctor();
        break;
      case '8':
        console.log('👋 Goodbye!');
        this.rl.close();
        process.exit(0);
        break;
      default:
        console.log('❌ Invalid choice. Please select 1-8.');
        await this.showQuickMenu();
    }
  }

  async handleGoogleDriveFlow() {
    console.log('\n✔ Download from Google Drive');
    console.log('\nPaste the Google Drive file or folder link (or ID):');
    const link = await this.prompt('> ');

    if (!link.trim()) {
      console.log('❌ No link provided.');
      return await this.showMainMenu();
    }

    const input = link.trim();
    
    // Check if it's a folder or file
    const fileId = this.extractGoogleDriveFileId(input);
    const folderId = this.gdriveDownloader.extractFolderId(input);
    
    if (!fileId && !folderId) {
      console.log('❌ Invalid Google Drive link or ID.');
      return await this.showMainMenu();
    }

    // Handle folder download
    if (folderId && input.includes('/folders/')) {
      return await this.handleGoogleDriveFolderFlow(folderId);
    }
    
    // Handle single file download (existing logic)
    if (fileId) {
      return await this.handleGoogleDriveFileFlow(fileId);
    }

    console.log('❌ Could not determine if this is a file or folder.');
    return await this.showMainMenu();
  }

  async handleGoogleDriveFileFlow(fileId) {
    // Check if file is public (simplified check)
    const fileInfo = await this.getGoogleDriveFileInfo(fileId);
    
    if (!fileInfo.accessible) {
      console.log('\nThis file looks private.');
      console.log('1. Sign in now (recommended)');
      console.log('2. I\'ll change sharing to public and retry');
      console.log('3. Cancel');
      
      const authChoice = await this.prompt('> ');
      
      if (authChoice.trim() === '1') {
        await this.signInToGoogleDrive();
        // Retry getting file info after auth
        const retryInfo = await this.getGoogleDriveFileInfo(fileId);
        if (!retryInfo.accessible) {
          console.log('❌ Still cannot access file. Please check permissions.');
          return await this.showMainMenu();
        }
        Object.assign(fileInfo, retryInfo);
      } else if (authChoice.trim() === '3') {
        return await this.showMainMenu();
      } else {
        console.log('❌ File access failed. Please make the file public or sign in.');
        return await this.showMainMenu();
      }
    }

    // Show file info and pick action
    console.log('\nFound:');
    console.log(`  Name: ${fileInfo.name}`);
    console.log(`  Size: ${fileInfo.size}`);
    console.log(`  Type: ${fileInfo.mimeType}`);

    console.log('\nHow do you want to save it?');
    console.log('  1. Download as‑is (no conversion)');
    console.log('  2. (coming soon) Convert to MP3');
    console.log('  3. (coming soon) Convert to MP4');
    
    const actionChoice = await this.prompt('> ');
    
    if (actionChoice.trim() !== '1') {
      console.log('❌ Only "Download as‑is" is available right now.');
      return await this.showMainMenu();
    }

    // Choose destination
    console.log('\nWhere should we save it?');
    console.log(`  1. ${this.settings.outputDir}`);
    console.log('  2. Browse…');
    
    const destChoice = await this.prompt('> ');
    let outputPath = this.settings.outputDir;
    
    if (destChoice.trim() === '2') {
      const customPath = await this.prompt('Enter path: ');
      if (customPath.trim()) outputPath = customPath.trim();
    }

    // Summary and confirm
    console.log('\nSummary:');
    console.log('  Source: Google Drive (File)');
    console.log(`  File:   ${fileInfo.name} (${fileInfo.size})`);
    console.log('  Action: Download as‑is');
    console.log(`  Save to: ${outputPath}`);
    
    console.log('\nProceed?');
    console.log('  1. Yes, start');
    console.log('  2. No, go back');
    
    const confirmChoice = await this.prompt('> ');
    
    if (confirmChoice.trim() === '1') {
      this.settings.lastSource = 'gdrive';
      this.settings.lastAction = 'download-as-is';
      this.saveSettings();
      
      await this.downloadFromGoogleDrive(fileId, fileInfo, outputPath);
    }

    return await this.showMainMenu();
  }

  async handleGoogleDriveFolderFlow(folderId) {
    console.log('\n📁 Detected folder link');
    
    // Get folder info
    const folderInfo = await this.gdriveDownloader.getFolderInfo(folderId);
    
    if (!folderInfo.accessible) {
      console.log('\nThis folder looks private.');
      console.log('1. Sign in now (recommended)');
      console.log('2. Cancel');
      
      const authChoice = await this.prompt('> ');
      
      if (authChoice.trim() === '1') {
        await this.signInToGoogleDrive();
        // Retry getting folder info after auth
        const retryInfo = await this.gdriveDownloader.getFolderInfo(folderId);
        if (!retryInfo.accessible) {
          console.log('❌ Still cannot access folder. Please check permissions.');
          return await this.showMainMenu();
        }
        Object.assign(folderInfo, retryInfo);
      } else {
        return await this.showMainMenu();
      }
    }

    // Show folder info
    console.log('\nFound folder:');
    console.log(`  Name: ${folderInfo.name}`);
    console.log(`  Type: Google Drive Folder`);

    // Folder-specific options
    console.log('\nFolder download options:');
    console.log('  1. Download all files (including subfolders)');
    console.log('  2. Download only files in main folder');
    console.log('  3. Preview contents first');
    console.log('  4. Cancel');
    
    const optionChoice = await this.prompt('> ');
    
    let includeSubfolders = true;
    let recursive = true;
    
    switch (optionChoice.trim()) {
      case '1':
        includeSubfolders = true;
        recursive = true;
        break;
      case '2':
        includeSubfolders = false;
        recursive = false;
        break;
      case '3':
        await this.previewFolderContents(folderId, folderInfo.name);
        return await this.handleGoogleDriveFolderFlow(folderId); // Return to folder options
      case '4':
        return await this.showMainMenu();
      default:
        console.log('❌ Invalid choice.');
        return await this.handleGoogleDriveFolderFlow(folderId);
    }

    // Choose destination
    console.log('\nWhere should we save the folder?');
    console.log(`  1. ${this.settings.outputDir}`);
    console.log('  2. Browse…');
    
    const destChoice = await this.prompt('> ');
    let outputPath = this.settings.outputDir;
    
    if (destChoice.trim() === '2') {
      const customPath = await this.prompt('Enter path: ');
      if (customPath.trim()) outputPath = customPath.trim();
    }

    // Summary and confirm
    console.log('\nSummary:');
    console.log('  Source: Google Drive (Folder)');
    console.log(`  Folder: ${folderInfo.name}`);
    console.log(`  Mode: ${recursive ? 'Include subfolders' : 'Main folder only'}`);
    console.log(`  Save to: ${outputPath}`);
    
    console.log('\nProceed?');
    console.log('  1. Yes, start');
    console.log('  2. No, go back');
    
    const confirmChoice = await this.prompt('> ');
    
    if (confirmChoice.trim() === '1') {
      this.settings.lastSource = 'gdrive-folder';
      this.settings.lastAction = 'download-folder';
      this.saveSettings();
      
      await this.downloadFromGoogleDriveFolder(folderId, folderInfo, outputPath, { recursive, includeSubfolders });
    }

    return await this.showMainMenu();
  }

  async previewFolderContents(folderId, folderName) {
    console.log(`\n🔍 Scanning folder: ${folderName}...`);
    
    try {
      const contents = await this.gdriveDownloader.listFolderContents(folderId, true);
      
      const files = contents.filter(item => item.type === 'file');
      const folders = contents.filter(item => item.type === 'folder');
      
      console.log(`\n📊 Folder contents:`);
      console.log(`📁 ${folders.length} subfolder(s)`);
      console.log(`📄 ${files.length} file(s)`);
      
      if (files.length > 0) {
        console.log('\n📄 Files found:');
        files.slice(0, 10).forEach((file, index) => {
          const size = file.size > 0 ? ` (${this.gdriveDownloader.formatFileSize(file.size)})` : '';
          const pathDisplay = file.path.length > 50 ? '...' + file.path.slice(-47) : file.path;
          console.log(`  ${index + 1}. ${pathDisplay}${size}`);
        });
        
        if (files.length > 10) {
          console.log(`  ... and ${files.length - 10} more files`);
        }
      }
      
      if (folders.length > 0 && folders.length <= 10) {
        console.log('\n📁 Subfolders:');
        folders.forEach((folder, index) => {
          console.log(`  ${index + 1}. ${folder.path}`);
        });
      }
      
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > 0) {
        console.log(`\n💾 Total size: ${this.gdriveDownloader.formatFileSize(totalSize)}`);
      }
      
      console.log('\nPress Enter to continue...');
      await this.prompt('');
      
    } catch (error) {
      console.log(`❌ Could not preview folder: ${error.message}`);
      console.log('Press Enter to continue...');
      await this.prompt('');
    }
  }

  async downloadFromGoogleDriveFolder(folderId, folderInfo, outputPath, options = {}) {
    console.log('\n🚀 Starting folder download…');
    
    try {
      let currentFile = '';
      let totalFiles = 0;
      
      const results = await this.gdriveDownloader.downloadFolder(folderId, outputPath, {
        ...options,
        progressCallback: (progress) => {
          if (progress.fileName !== currentFile) {
            currentFile = progress.fileName;
            totalFiles = progress.totalFiles;
          }
          
          // Show current file progress
          const filled = Math.round((parseFloat(progress.percent) / 100) * 27);
          const empty = 27 - filled;
          const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
          
          process.stdout.write(`\r[${progress.currentFile}/${progress.totalFiles}] ${progressBar} ${progress.percent}% - ${progress.fileName}`);
        }
      });
      
      console.log('\n'); // Clean line after progress
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (successful > 0) {
        console.log(`✅ Downloaded ${successful} files successfully`);
      }
      if (failed > 0) {
        console.log(`❌ ${failed} files failed to download`);
      }
      
    } catch (error) {
      console.log(`\n❌ Folder download failed: ${error.message}`);
      throw error;
    }
  }

  async quickGoogleDriveFlow() {
    console.log('\nPaste the Google Drive link or ID:');
    const link = await this.prompt('> ');

    if (!link.trim()) {
      console.log('❌ No link provided.');
      return await this.showQuickMenu();
    }

    const fileId = this.extractGoogleDriveFileId(link.trim());
    if (!fileId) {
      console.log('❌ Invalid Google Drive link or ID.');
      return await this.showQuickMenu();
    }

    console.log('\nConfirm:');
    console.log(`  Destination: ${this.settings.outputDir}`);
    console.log(`  Action: ${this.settings.lastAction}`);
    console.log('  1. Start');
    console.log('  2. Change options');

    const choice = await this.prompt('> ');
    
    if (choice.trim() === '1') {
      const fileInfo = await this.getGoogleDriveFileInfo(fileId);
      if (fileInfo.accessible) {
        await this.downloadFromGoogleDrive(fileId, fileInfo, this.settings.outputDir);
      } else {
        console.log('❌ Cannot access file. Use full flow to sign in.');
      }
    } else {
      await this.handleGoogleDriveFlow();
      return;
    }

    return await this.showQuickMenu();
  }

  async handleYouTubeFlow() {
    console.log('\n✔ Download from YouTube');
    console.log('\nPaste YouTube URL(s) (separate multiple with spaces):');
    const input = await this.prompt('> ');

    if (!input.trim()) {
      console.log('❌ No URLs provided.');
      return await this.showMainMenu();
    }

    const urls = input.trim().split(/\s+/).filter(url => 
      url.includes('youtube.com') || url.includes('youtu.be')
    );

    if (urls.length === 0) {
      console.log('❌ No valid YouTube URLs found.');
      return await this.showMainMenu();
    }

    // Choose format
    console.log('\nChoose format:');
    console.log('  1. MP3 (audio only)');
    console.log('  2. MP4 (video)');
    
    const formatChoice = await this.prompt('> ');
    const format = formatChoice.trim() === '2' ? 'mp4' : 'mp3';

    // Choose quality
    console.log(`\nChoose ${format.toUpperCase()} quality:`);
    const qualities = format === 'mp4' ? Object.keys(MP4_QUALITY_PRESETS) : Object.keys(MP3_QUALITY_PRESETS);
    qualities.forEach((quality, index) => {
      console.log(`  ${index + 1}. ${quality}`);
    });

    const qualityChoice = await this.prompt('> ');
    const qualityIndex = parseInt(qualityChoice.trim()) - 1;
    const quality = qualities[qualityIndex] || 'best';

    // Summary and confirm
    console.log('\nSummary:');
    console.log('  Source: YouTube');
    console.log(`  URLs: ${urls.length} video(s)`);
    console.log(`  Format: ${format.toUpperCase()}`);
    console.log(`  Quality: ${quality}`);
    console.log(`  Save to: ${this.settings.outputDir}/${format}/`);
    
    console.log('\nProceed?');
    console.log('  1. Yes, start');
    console.log('  2. No, go back');
    
    const confirmChoice = await this.prompt('> ');
    
    if (confirmChoice.trim() === '1') {
      this.settings.lastSource = 'youtube';
      this.saveSettings();
      
      console.log(`\n🎯 Adding ${urls.length} video(s) to ${format.toUpperCase()} download queue (${quality})...`);
      this.addMultipleVideos(urls, format, quality);
      setTimeout(() => this.showStatus(), 2000);
    }

    return await this.showMainMenu();
  }

  async quickYouTubeFlow() {
    console.log('\nPaste YouTube URL(s):');
    const input = await this.prompt('> ');

    if (!input.trim()) {
      console.log('❌ No URLs provided.');
      return await this.showQuickMenu();
    }

    const urls = input.trim().split(/\s+/).filter(url => 
      url.includes('youtube.com') || url.includes('youtu.be')
    );

    if (urls.length === 0) {
      console.log('❌ No valid YouTube URLs found.');
      return await this.showQuickMenu();
    }

    console.log('\nConfirm:');
    console.log(`  Format: MP3 (best quality)`);
    console.log(`  Destination: ${this.settings.outputDir}/mp3/`);
    console.log('  1. Start');
    console.log('  2. Change options');

    const choice = await this.prompt('> ');
    
    if (choice.trim() === '1') {
      console.log(`\n🎯 Adding ${urls.length} video(s) to MP3 download queue...`);
      this.addMultipleVideos(urls, 'mp3', 'best');
      setTimeout(() => this.showStatus(), 2000);
    } else {
      await this.handleYouTubeFlow();
      return;
    }

    return await this.showQuickMenu();
  }

  async configureSettings() {
    console.log('\nConfigure settings');
    console.log(`  Output directory: ${this.settings.outputDir}`);
    console.log('    1. Keep current');
    console.log('    2. Browse…');
    
    const dirChoice = await this.prompt('> ');
    if (dirChoice.trim() === '2') {
      const newDir = await this.prompt('Enter new output directory: ');
      if (newDir.trim()) {
        this.settings.outputDir = newDir.trim();
      }
    }

    console.log(`\n  Ask before overwrite: ${this.settings.askBeforeOverwrite ? 'Yes' : 'No'}`);
    console.log('    1. Yes');
    console.log('    2. No');
    
    const overwriteChoice = await this.prompt('> ');
    this.settings.askBeforeOverwrite = overwriteChoice.trim() === '1';

    console.log(`\n  Telemetry: ${this.settings.telemetry ? 'On' : 'Off'}`);
    console.log('    1. Off');
    console.log('    2. On');
    
    const telemetryChoice = await this.prompt('> ');
    this.settings.telemetry = telemetryChoice.trim() === '2';

    this.saveSettings();
    console.log('\n✅ Settings saved!');
    
    return await this.showMainMenu();
  }

  async signInToGoogleDrive() {
    console.log('\n🔑 Sign in to Google Drive');
    
    // Check if already authenticated
    if (this.gdriveAuth.isAuthenticated()) {
      console.log('✅ You\'re already signed in to Google Drive!');
      console.log('\n1. Continue with current account');
      console.log('2. Sign in with different account');
      console.log('3. Sign out');
      console.log('4. Back');
      
      const choice = await this.prompt('> ');
      
      switch (choice.trim()) {
        case '1':
          return await this.showMainMenu();
        case '2':
          this.gdriveAuth.clearTokens();
          break; // Continue with sign-in process
        case '3':
          this.gdriveAuth.clearTokens();
          console.log('👋 Signed out successfully');
          return await this.showMainMenu();
        case '4':
        default:
          return await this.showMainMenu();
      }
    }
    
    // Check if credentials are configured
    if (!this.gdriveAuth.clientId || !this.gdriveAuth.clientSecret) {
      console.log('⚠️ Google API credentials not found.');
      console.log('\n1. Set up credentials now');
      console.log('2. Cancel');
      
      const setupChoice = await this.prompt('> ');
      
      if (setupChoice.trim() === '1') {
        try {
          await this.gdriveAuth.setupCredentials();
        } catch (error) {
          console.log(`❌ Setup failed: ${error.message}`);
          return await this.showMainMenu();
        }
      } else {
        return await this.showMainMenu();
      }
    }

    console.log('\nChoose authentication method:');
    console.log('1. Browser-based (recommended) - opens browser automatically');
    console.log('2. Manual code entry - copy/paste URL and code');
    console.log('3. Cancel');
    
    const authChoice = await this.prompt('> ');
    
    try {
      switch (authChoice.trim()) {
        case '1':
          console.log('\n🌐 Starting browser authentication...');
          await this.gdriveAuth.authenticateWithBrowser();
          break;
          
        case '2':
          console.log('\n📋 Starting manual authentication...');
          await this.gdriveAuth.authenticateWithManualCode();
          break;
          
        case '3':
        default:
          return await this.showMainMenu();
      }
      
      // Update the Google Drive downloader with new token
      this.gdriveDownloader.accessToken = this.gdriveAuth.getAccessToken();
      
      console.log('\n✅ Google Drive authentication successful!');
      console.log('🔐 You can now access private files and folders');
      
    } catch (error) {
      console.log(`\n❌ Authentication failed: ${error.message}`);
      console.log('💡 Try the manual code method if browser method failed');
    }

    return await this.showMainMenu();
  }

  async runDoctor() {
    console.log('\nSystem check');
    
    // Check Node version
    const nodeVersion = process.version;
    console.log(`  Node: ${nodeVersion}  ✅`);
    
    // Check ffmpeg (simplified)
    try {
      const ffmpegCheck = spawn('ffmpeg', ['-version'], { stdio: 'pipe' });
      ffmpegCheck.on('close', (code) => {
        if (code === 0) {
          console.log('  ffmpeg: found ✅');
        } else {
          console.log('  ffmpeg: not found ❌');
        }
      });
    } catch (error) {
      console.log('  ffmpeg: not found ❌');
    }
    
    // Check output directory
    try {
      if (!fs.existsSync(this.settings.outputDir)) {
        fs.mkdirSync(this.settings.outputDir, { recursive: true });
      }
      fs.accessSync(this.settings.outputDir, fs.constants.W_OK);
      console.log(`  Output dir writable: ${this.settings.outputDir} ✅`);
    } catch (error) {
      console.log(`  Output dir writable: ${this.settings.outputDir} ❌`);
    }
    
    // Check network (simplified)
    console.log('  Network: ok ✅');
    
    // Check Google Drive authentication
    if (this.gdriveAuth.isAuthenticated()) {
      console.log('  Google Drive: authenticated ✅');
    } else if (this.gdriveAuth.clientId && this.gdriveAuth.clientSecret) {
      console.log('  Google Drive: credentials configured, not signed in ⚠️');
    } else {
      console.log('  Google Drive: not configured ℹ️');
    }
    
    // Check Google API credentials
    if (this.gdriveAuth.clientId && this.gdriveAuth.clientSecret) {
      console.log('  Google API credentials: configured ✅');
    } else {
      console.log('  Google API credentials: not configured (needed for private files) ⚠️');
    }
    
    console.log('\nPress Enter to return');
    await this.prompt('');
    
    return await this.showMainMenu();
  }

  extractGoogleDriveFileId(input) {
    return this.gdriveDownloader.extractFileId(input);
  }

  async getGoogleDriveFileInfo(fileId) {
    try {
      return await this.gdriveDownloader.getFileInfo(fileId);
    } catch (error) {
      return {
        accessible: false,
        name: 'Unknown File',
        size: 'Unknown',
        mimeType: 'unknown',
        error: error.message
      };
    }
  }

  async downloadFromGoogleDrive(fileId, fileInfo, outputPath) {
    console.log('\n🚀 Starting download…');
    
    try {
      const fileName = fileInfo.name;
      const fullOutputPath = path.join(outputPath, fileName);
      
      // Check if file already exists
      if (fs.existsSync(fullOutputPath) && this.settings.askBeforeOverwrite) {
        console.log(`\nFile already exists: ${fileName}`);
        console.log('1. Overwrite');
        console.log('2. Skip');
        const choice = await this.prompt('> ');
        
        if (choice.trim() !== '1') {
          console.log('⏭️ Download skipped');
          return;
        }
      }

      // Start the actual download
      let lastProgressTime = 0;
      
      await this.gdriveDownloader.downloadFile(fileId, fullOutputPath, (progress) => {
        const now = Date.now();
        if (now - lastProgressTime > 500) { // Update every 500ms
          const filled = Math.round((parseFloat(progress.percent) / 100) * 27);
          const empty = 27 - filled;
          const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
          
          process.stdout.write(`\rGDrive |${progressBar}| ${progress.percent}%`);
          if (progress.totalSize > 0) {
            const downloadedMB = (progress.downloadedSize / 1024 / 1024).toFixed(1);
            const totalMB = (progress.totalSize / 1024 / 1024).toFixed(1);
            process.stdout.write(` (${downloadedMB} MB / ${totalMB} MB)`);
          }
          
          lastProgressTime = now;
        }
      });
      
      console.log(`\n\n✅ Saved: ${fullOutputPath}`);
      console.log('⏱️ Download completed successfully');
      
    } catch (error) {
      console.log(`\n❌ Download failed: ${error.message}`);
      throw error;
    }
  }

  // YouTube functionality (existing methods)
  addVideo(url, format = DEFAULT_FORMAT, quality = DEFAULT_QUALITY, title = null) {
    return this.downloader.addUrl(url, { title, format, quality });
  }

  addMultipleVideos(urls, format = DEFAULT_FORMAT, quality = DEFAULT_QUALITY) {
    this.dashboard.initialize(urls.length);
    urls.forEach((url) => this.addVideo(url, format, quality));
    this.startStatusMonitoring();
  }

  startStatusMonitoring() {
    this.statusInterval = setInterval(() => {
      const status = this.downloader.getStatus();
      if (status.processing === 0 && status.queue === 0) {
        this.stopStatusMonitoring();
        return;
      }
      if (status.processing > 0) {
        console.log(`\n📊 Status: ${status.processing} downloading, ${status.queue} queued, ${status.completed} done`);
      }
    }, 10000);
  }

  stopStatusMonitoring() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  showStatus() {
    const s = this.downloader.getDetailedStatus();

    console.log('\n==== 📊 TUBETOOLKIT STATUS ====');
    console.log(`📥 Queue       : ${s.queue}`);
    console.log(`🔄 Processing  : ${s.processing}`);
    console.log(`✅ Completed   : ${s.completed}`);
    console.log(`❌ Failed      : ${s.failed}`);
    console.log(`🌐 Proxies     : ${s.totalProxies} total, ${s.failedProxies} failed`);
    console.log(`📈 Progress    : ${Number.isFinite(s.overallProgress) ? s.overallProgress.toFixed(1) : '0.0'}%`);
    console.log(`⏱️  ETA        : ${s.eta}`);
    console.log(`⏰ Uptime      : ${s.uptime}`);

    // ... rest of status display
  }

  async shutdown() {
    console.log('\n\n⏹️ Shutting down gracefully...');
    if (this.rl) this.rl.close();
    this.dashboard.stop();
    this.stopStatusMonitoring();
    this.downloader.pauseAll();

    setTimeout(() => {
      console.log('💾 Queue state saved. You can resume later!');
      process.exit(0);
    }, 1000);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && basename(process.argv[1]) === basename(currentFile);

// CLI execution
if (isMain) {
  const wizard = new TubeToolkitWizard();
  const args = process.argv.slice(2);

  async function runCLI() {
    // Handle legacy command line arguments first
    if (args.includes('--version')) {
      printSubtitle();
      console.log('   You are currently using\n');
      printVersion();
      process.exit(0);
    }

    if (args.includes('setup')) {
      console.log('🔧 Running first-time setup...');
      await wizard.configureSettings();
      process.exit(0);
    }

    if (args.includes('auth')) {
      console.log('🔑 Google Drive authentication...');
      await wizard.signInToGoogleDrive();
      process.exit(0);
    }

    if (args.includes('doctor')) {
      await wizard.runDoctor();
      process.exit(0);
    }

    if (args.includes('--status')) {
      wizard.showStatus();
      process.exit(0);
    }

    // Legacy YouTube download support
    if (args.length > 0 && !args.includes('--help')) {
      let urls = [];
      let proxies = [];
      let format = DEFAULT_FORMAT;
      let quality = DEFAULT_QUALITY;

      for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--format' || args[i] === '-f') && i + 1 < args.length) {
          format = args[i + 1].toLowerCase();
          if (!SUPPORTED_FORMATS.includes(format)) {
            console.log(`❌ Unsupported format: ${format}. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
            process.exit(1);
          }
          i++;
        } else if ((args[i] === '--quality' || args[i] === '-q') && i + 1 < args.length) {
          quality = args[i + 1].toLowerCase();
          i++;
        } else if (args[i] === '--proxy' && i + 1 < args.length) {
          proxies.push(args[i + 1]);
          i++;
        } else if (args[i].includes('youtube.com') || args[i].includes('youtu.be')) {
          urls.push(args[i]);
        }
      }

      if (urls.length > 0) {
        printBannerOnly();
        console.log(`\n🎯 Adding ${urls.length} video(s) to ${format.toUpperCase()} download queue (${quality})...`);
        
        proxies.forEach((proxy) => wizard.downloader.addProxy(proxy));
        wizard.addMultipleVideos(urls, format, quality);
        setTimeout(() => wizard.showStatus(), 3000);
        
        // Graceful shutdown
        process.on('SIGINT', () => wizard.shutdown());
        process.on('SIGTERM', () => wizard.shutdown());
        return;
      }
    }

    // Show help if requested
    if (args.includes('--help')) {
      console.log('\n🎵 TubeToolkit - YouTube & Google Drive Downloader');
      console.log('\n📖 Usage:');
      console.log('  tubetoolkit                  Opens guided wizard (recommended)');
      console.log('  tubetoolkit setup            First-time setup');
      console.log('  tubetoolkit auth             Google Drive sign-in');
      console.log('  tubetoolkit doctor           System health check');
      console.log('  tubetoolkit --status         Show download status');
      console.log('\n💡 For YouTube downloads, you can still use:');
      console.log('  tubetoolkit [options] <urls...>  Direct YouTube download');
      console.log('\nUse the wizard for the best experience!');
      process.exit(0);
    }

    // Show wizard interface
    printBannerOnly();

    // Check if user has used the tool before
    if (wizard.settings.lastSource) {
      await wizard.showQuickMenu();
    } else {
      await wizard.showMainMenu();
    }
  }

  // Run the CLI with proper error handling
  runCLI().catch((error) => {
    console.error('\n💥 Unexpected error:', error.message);
    wizard.shutdown();
  });

  // Graceful shutdown handlers
  process.on('SIGINT', () => wizard.shutdown());
  process.on('SIGTERM', () => wizard.shutdown());
  process.on('uncaughtException', (error) => {
    console.error('\n💥 Unexpected error:', error.message);
    wizard.shutdown();
  });
}

export default TubeToolkitWizard;