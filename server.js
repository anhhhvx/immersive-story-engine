const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT_DIR = __dirname;
const STORY_FILE = path.join(ROOT_DIR, 'story_data.json');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

// Tự động tạo thư mục chứa media nếu chưa có
if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR);
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
};

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendJson(response, 404, { error: 'File not found' });
            return;
        }
        response.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        response.end(data);
    });
}

function safeResolve(requestUrl) {
    const cleanPath = decodeURIComponent(requestUrl.split('?')[0]);
    const relativePath = cleanPath === '/' ? '/index.html' : cleanPath;
    const resolvedPath = path.normalize(path.join(ROOT_DIR, relativePath));

    if (!resolvedPath.startsWith(ROOT_DIR)) return null;
    return resolvedPath;
}

const server = http.createServer((request, response) => {
    if (request.method === 'OPTIONS') {
        response.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        response.end();
        return;
    }

    // 1. API: Lưu Kịch Bản (story_data.json)
    if (request.method === 'POST' && request.url === '/api/save-story') {
        let body = '';
        request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 80 * 1024 * 1024) request.destroy();
        });

        request.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!payload || !Array.isArray(payload.scenes)) {
                    sendJson(response, 400, { error: 'Invalid story payload' });
                    return;
                }
                fs.writeFile(STORY_FILE, JSON.stringify(payload, null, 2), 'utf8', (error) => {
                    if (error) { sendJson(response, 500, { error: 'Failed to write json' }); return; }
                    sendJson(response, 200, { ok: true, path: STORY_FILE });
                });
            } catch (error) {
                sendJson(response, 400, { error: 'Invalid JSON body' });
            }
        });
        return;
    }

    // 2. API: Tải file Media (Ảnh, Âm thanh) lên thư mục cục bộ
    if (request.method === 'POST' && request.url === '/api/upload-media') {
        let body = '';
        request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 80 * 1024 * 1024) request.destroy(); // Cho phép 80MB
        });

        request.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!payload.name || !payload.data) {
                    sendJson(response, 400, { error: 'Thiếu thông tin file' });
                    return;
                }

                const base64Data = payload.data.split(';base64,').pop();
                const safeName = Date.now() + '_' + payload.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
                const filePath = path.join(ASSETS_DIR, safeName);

                fs.writeFile(filePath, base64Data, { encoding: 'base64' }, (error) => {
                    if (error) { sendJson(response, 500, { error: 'Không thể lưu file vật lý' }); return; }
                    sendJson(response, 200, { url: '/assets/' + safeName }); // Trả về link tương đối ngắn gọn
                });
            } catch (error) {
                sendJson(response, 400, { error: 'Lỗi parse JSON media' });
            }
        });
        return;
    }

    const filePath = safeResolve(request.url || '/');
    if (!filePath) { sendJson(response, 403, { error: 'Forbidden' }); return; }

    fs.stat(filePath, (error, stats) => {
        if (error) { sendJson(response, 404, { error: 'Not found' }); return; }
        if (stats.isDirectory()) { sendFile(response, path.join(filePath, 'index.html')); return; }
        sendFile(response, filePath);
    });
});

server.listen(PORT, () => {
    console.log(`Immersive Story Engine server running at http://localhost:${PORT}`);
});