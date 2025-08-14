# 🎵 TuneIt

A powerful command-line tool for downloading videos from YouTube and files from Google Drive with an intuitive wizard interface.

## ✨ Features

- 🎥 **YouTube Downloads**: MP3 (audio) and MP4 (video) with quality options
- 📁 **Google Drive Integration**: Download files and entire folders (including private ones)
- 🧙‍♂️ **Interactive Wizard**: Step-by-step guided interface
- ⚡ **Queue Management**: Bulk downloads with progress tracking
- 🔄 **Resume Support**: Continue interrupted downloads
- 🌐 **Proxy Support**: Built-in proxy rotation for rate limiting
- 🔐 **OAuth2 Authentication**: Secure Google Drive access
- 📊 **Real-time Progress**: Live download status and ETA

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **yt-dlp** (for YouTube downloads)
- **ffmpeg** (for audio conversion)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tuneit.git
cd tuneit

# Install dependencies
npm install

# Make it globally accessible (optional)
npm link
```

### Basic Usage

```bash
# Start the interactive wizard
tuneit

# Or use the alias
tuneit
```

## 📖 Usage Guide

### [RECOMMENDED] Export cookies from your browser

YouTube has gotten strict. For many videos, you'll get:

❌ `"Sign in to confirm you're not a bot"`

To fix this, export your cookies from your browser using this [extension](https://www.google.com/search?q=https://chrome.google.com/webstore/detail/get-cookies-txt/gpmfngjjdkfodnhchcnoaninfbdhffx). Save the file as `cookies.txt` in the root of the project.

### YouTube Downloads

#### Quick Download
```bash
# Single video
tuneit https://youtube.com/watch?v=VIDEO_ID

# Multiple videos
tuneit URL1 URL2 URL3

# Specify format and quality
tuneit --format mp3 --quality best https://youtube.com/watch?v=VIDEO_ID
```

#### Format Options
- **MP3**: `best`, `good`, `medium`, `low`
- **MP4**: `best`, `1080p`, `720p`, `480p`, `360p`

### Google Drive Downloads

#### Setup (First Time)
```bash
# Configure Google Drive authentication
tuneit auth
```

Follow the setup wizard to:
1. Create Google Cloud project
2. Enable Drive API
3. Set up OAuth2 credentials
4. Authenticate your account

#### Download Files/Folders
```bash
# Start wizard and choose Google Drive option
tuneit

# Paste any of these formats:
# - https://drive.google.com/file/d/FILE_ID/view
# - https://drive.google.com/drive/folders/FOLDER_ID
# - Just the FILE_ID or FOLDER_ID
```

## 🛠️ Advanced Features

### Command Line Options

```bash
# Show version
tuneit --version

# System health check
tuneit doctor

# Download status
tuneit --status

# Configure settings
tuneit setup

# Format-specific downloads
tuneit --format mp4 --quality 720p [URLs...]
tuneit --format mp3 --quality best [URLs...]

# Use proxy
tuneit --proxy http://proxy:8080 [URLs...]
```

### Configuration

Settings are automatically saved in `./downloads/.tuneit-settings.json`:

```json
{
  "outputDir": "./downloads",
  "askBeforeOverwrite": true,
  "telemetry": false,
  "lastSource": "youtube",
  "lastAction": "download-as-is"
}
```

### File Organization

```
downloads/
├── mp3/                    # Audio files
├── mp4/                    # Video files
├── [google-drive-folders]/ # Drive folder downloads
├── .tuneit-settings.json
├── .queue-state.json       # Resume support
└── .gdrive-tokens.json     # Google auth tokens
```

## 🔐 Google Drive Authentication

### Option 1: Same Account (Recommended)
Use the same Google account for both:
- Creating Google Cloud project
- Accessing Drive files

### Option 2: Different Accounts
- **Account A**: Has access to Drive files
- **Account B**: Creates Google Cloud project
- Use Account B's credentials, authenticate with Account A

### Setup Steps

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project
   - Enable Google Drive API
   - Create OAuth2 credentials (Desktop Application)

2. **Run Authentication**:
   ```bash
   tuneit auth
   ```

3. **Enter Credentials**:
   - Client ID and Client Secret from step 1

4. **Choose Auth Method**:
   - Browser-based (recommended)
   - Manual code entry

## 🎯 Examples

### YouTube Playlist to MP3
```bash
# Start wizard, choose YouTube, paste playlist URL
tuneit
```

### Bulk YouTube Downloads
```bash
# Multiple URLs with specific quality
tuneit --format mp3 --quality best \
  https://youtube.com/watch?v=VIDEO1 \
  https://youtube.com/watch?v=VIDEO2 \
  https://youtube.com/watch?v=VIDEO3
```

### Google Drive Folder
```bash
# Download entire folder with subfolders
tuneit
# Choose: Download from Google Drive
# Paste: https://drive.google.com/drive/folders/FOLDER_ID
# Select: Download all files (including subfolders)
```

### Resume Downloads
```bash
# Downloads automatically resume on restart
tuneit

# Check status of ongoing downloads
tuneit --status
```

## 🔧 Troubleshooting

### Common Issues

#### YouTube Downloads
```bash
# Rate limiting
tuneit --proxy http://your-proxy:8080 [URLs...]

# Age-restricted content
# Use browser authentication or cookies

# Format not available
# Try different quality setting
```

#### Google Drive
```bash
# Private files
tuneit auth  # Authenticate first

# Large folders
# Use "Preview contents first" option

# API quota exceeded
# Wait or use different Google Cloud project
```

#### System Check
```bash
# Verify installation
tuneit doctor

# Check dependencies
# ✅ Node: v18.x.x
# ✅ ffmpeg: found
# ✅ yt-dlp: found
# ✅ Output dir writable
```

### Error Messages

| Error | Solution |
|-------|----------|
| `yt-dlp not found` | Install yt-dlp: `pip install yt-dlp` |
| `ffmpeg not found` | Install ffmpeg from [ffmpeg.org](https://ffmpeg.org) |
| `HTTP Error 429` | Use proxy or wait before retrying |
| `Private video` | Check video availability/permissions |
| `Google API credentials not found` | Run `tuneit auth` to set up |

## 🎨 Interface Guide

### Main Menu
```
┌ tuneit ───────────────────────────────────────────
│ What do you want to do?
│  1. Download from Google Drive
│  2. Download from YouTube  
│  3. Configure settings
│  4. Sign in to Google Drive
│  5. Check my system (doctor)
│  6. Exit
└────────────────────────────────────────────────────────
```

### Quick Menu (Returning Users)
```
Welcome back. Do you want to:
  1. Quick download from Drive (use last settings)
  2. Quick download from YouTube (use last settings)
  3. Download from Google Drive (step‑by‑step)
  4. Download from YouTube (step‑by‑step)
  5. Configure settings
  ...
```

## 📊 Progress Tracking

### Real-time Dashboard
```
[1/3] ████████████████████████████ 85.2% - Video Title Here
      Speed: 2.4 MB/s | ETA: 00:15 | Size: 45.2 MB

📊 Overall Progress: 34.7% | Queue: 2 | Active: 1 | Done: 0
```

### Queue Status
```
==== 📊 tuneit STATUS ====
📥 Queue       : 5
🔄 Processing  : 2  
✅ Completed   : 12
❌ Failed      : 1
🌐 Proxies     : 3 total, 1 failed
📈 Progress    : 67.3%
⏱️  ETA        : 8m 32s
⏰ Uptime      : 25m 14s
```

## 🔒 Privacy & Security

- **Local Storage**: All downloads and settings stored locally
- **Secure Authentication**: OAuth2 flow for Google Drive
- **Token Management**: Automatic refresh and secure storage
- **No Tracking**: Optional telemetry (disabled by default)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/tuneit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/tuneit/discussions)
- **Documentation**: This README and built-in help (`tuneit --help`)

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube download engine
- [FFmpeg](https://ffmpeg.org/) - Media processing
- [Google Drive API](https://developers.google.com/drive) - Drive integration

---

Made with ❤️ for content creators and data hoarders everywhere!