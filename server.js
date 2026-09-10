const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8085;

// ค้นหาเพลงผ่าน YouTube Search Endpoint แบบตรง (เร็วระดับมิลลิวินาที ไม่กิน CPU)
async function searchYouTube(query) {
    return new Promise((resolve) => {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' คาราโอเกะ')}&sp=EgIQAQ%253D%253D`;
        
        https.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const match = data.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
                    if (!match) return resolve({ success: true, results: [] });

                    const json = JSON.parse(match[1]);
                    const items = json.contents?.twoColumnSearchResultsRenderer?.primaryContents
                        ?.sectionListRenderer?.contents[0]?.itemSectionRenderer?.contents || [];

                    const results = [];
                    for (const item of items) {
                        const v = item.videoRenderer;
                        if (!v || !v.videoId) continue;

                        const title = v.title?.runs?.[0]?.text || 'ไม่ทราบชื่อเพลง';
                        const uploader = v.ownerText?.runs?.[0]?.text || 'YouTube';
                        const duration = v.lengthText?.simpleText || '';
                        const thumbnail = v.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

                        results.push({
                            id: v.videoId,
                            videoId: v.videoId,
                            title: title,
                            thumbnail: thumbnail,
                            channel: uploader,
                            duration: duration
                        });

                        if (results.length >= 20) break;
                    }
                    resolve({ success: true, results: results });
                } catch (err) {
                    resolve({ success: false, error: err.message, results: [] });
                }
            });
        }).on('error', (err) => {
            resolve({ success: false, error: err.message, results: [] });
        });
    });
}

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 1. API Search สำหรับรีโมตมือถือ
    if (pathname === '/api/search' || pathname === '/functions/api/search') {
        const q = parsedUrl.query.q || '';
        const searchResults = await searchYouTube(q);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(searchResults));
        return;
    }

    // 2. Routing เข้าหน้าระบบ
    if (pathname === '/' || pathname === '/display') pathname = '/display.html';
    if (pathname === '/remote' || pathname === '/controller') pathname = '/controller.html';
    if (pathname === '/single') pathname = '/index.html';

    const safePath = path.normalize(path.join(__dirname, pathname));
    if (!safePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(safePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }
        const ext = path.extname(safePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(content);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎤 Karaoke Server running at http://0.0.0.0:${PORT}`);
});
