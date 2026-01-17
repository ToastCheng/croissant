const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const httpProxy = require('http-proxy')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = 3000
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const proxy = httpProxy.createProxyServer({
    target: 'ws://localhost:8080',
    ws: true
})

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err)
    // Check if res is a socket or a server response
    if (res.writeHead) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Proxy error')
    }
})

app.prepare().then(() => {
    const server = createServer((req, res) => {
        try {
            // Be sure to pass true to the parse function to get the query object
            const parsedUrl = parse(req.url, true)
            const { pathname } = parsedUrl

            if (pathname && pathname.startsWith('/recordings')) {
                proxy.web(req, res, { target: 'http://localhost:8080' })
                return
            }

            // Allow Next.js to handle all other credentials
            handle(req, res, parsedUrl)
        } catch (err) {
            console.error('Error occurred handling', req.url, err)
            res.statusCode = 500
            res.end('internal server error')
        }
    })

    server.on('upgrade', (req, socket, head) => {
        const { pathname } = parse(req.url || '', true)

        if (pathname === '/ws') {
            proxy.ws(req, socket, head)
        } else {
            // Allow Next.js to handle other upgrades (e.g. HMR) if applicable, 
            // though typically Next.js dev server handles this differently. 
            // In a custom server, falling through might be enough or we might need strict handling.
            // For now, we leave the socket alone if it's not our path.
            // However, if nothing handles it, the socket hangs. 
            // Ideally we check if it is hmr? 
            // But we can't easily access Next.js's upgrade handler here.
            // We'll close it if it's strictly not recognized to avoid hangs, 
            // UNLESS we think HMR needs it.
            // Let's assume HMR uses a different mechanism often (SSE) or we shouldn't close it blindly.
            // But socket.destroy() is safe if we are sure.
            // Let's rely on default behavior (doing nothing).
        }
    })

    server.listen(port, (err) => {
        if (err) throw err
        console.log(`> Ready on http://${hostname}:${port}`)
    })
})
