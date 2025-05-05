const http = require('http');
const port = 3000;

const server = http.createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('Hello, Node.js Backend with pnpm!');
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('Not Found');
    }
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});