const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT_DIR = __dirname;
const STORY_FILE = path.join(ROOT_DIR, 'story_data.json');

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
    '.wav': 'audio/wav'
};

// Gui response JSON kem CORS header cho API va loi server.
function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    response.end(JSON.stringify(payload));
}

// Doc file tinh trong project va tra ve dung MIME type.
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

// Chuyen URL request thanh duong dan noi bo an toan, chan truy cap ra ngoai thu muc project.
function safeResolve(requestUrl) {
    const cleanPath = decodeURIComponent(requestUrl.split('?')[0]);
    const relativePath = cleanPath === '/' ? '/index.html' : cleanPath;
    const resolvedPath = path.normalize(path.join(ROOT_DIR, relativePath));

    if (!resolvedPath.startsWith(ROOT_DIR)) {
        return null;
    }

    return resolvedPath;
}

// Server local phuc vu file tinh va endpoint luu story_data.json.
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

    if (request.method === 'POST' && request.url === '/api/save-story') {
        let body = '';

        // Gom body JSON gui len va chan payload vuot gioi han.
        request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 80 * 1024 * 1024) {
                request.destroy();
            }
        });

        // Parse va kiem tra payload truoc khi ghi vao story_data.json.
        request.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!payload || !Array.isArray(payload.scenes)) {
                    sendJson(response, 400, { error: 'Invalid story payload' });
                    return;
                }

                fs.writeFile(STORY_FILE, JSON.stringify(payload, null, 2), 'utf8', (error) => {
                    if (error) {
                        sendJson(response, 500, { error: 'Failed to write story_data.json' });
                        return;
                    }

                    sendJson(response, 200, { ok: true, path: STORY_FILE });
                });
            } catch (error) {
                sendJson(response, 400, { error: 'Invalid JSON body' });
            }
        });

        return;
    }

    const filePath = safeResolve(request.url || '/');
    if (!filePath) {
        sendJson(response, 403, { error: 'Forbidden' });
        return;
    }

    // Kiem tra file/thu muc ton tai de phuc vu noi dung phu hop.
    fs.stat(filePath, (error, stats) => {
        if (error) {
            sendJson(response, 404, { error: 'Not found' });
            return;
        }

        if (stats.isDirectory()) {
            sendFile(response, path.join(filePath, 'index.html'));
            return;
        }

        sendFile(response, filePath);
    });
});

// Khoi dong server tai cong mac dinh cua project.
server.listen(PORT, () => {
    console.log(`Immersive Story Engine server running at http://localhost:${PORT}`);
});
