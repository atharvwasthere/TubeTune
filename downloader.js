const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

async function downloadYouTubeToMP3(url, outputPath) {
    try {
        // Get video info
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, ''); // Clean filename
        
        console.log(`Downloading: ${title}`);
        
        // Create audio stream
        const audioStream = ytdl(url, {
            filter: 'audioonly',
            quality: 'highestaudio',
        });
        
        // Convert to MP3 using FFmpeg
        const outputFile = path.join(outputPath, `${title}.mp3`);
        
        ffmpeg(audioStream)
            .audioBitrate(128)
            .save(outputFile)
            .on('progress', (progress) => {
                console.log(`Processing: ${progress.percent}% done`);
            })
            .on('end', () => {
                console.log(`✅ Successfully downloaded: ${outputFile}`);
            })
            .on('error', (err) => {
                console.error('❌ Error:', err.message);
            });
            
    } catch (error) {
        console.error('❌ Failed to download:', error.message);
    }
}

// Usage
const videoUrl = 'https://www.youtube.com/watch?v=CGrFZmOWxVw';
const outputDirectory = './downloads';

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory);
}

downloadYouTubeToMP3(videoUrl, outputDirectory);

// Install required packages:
// npm install ytdl-core fluent-ffmpeg