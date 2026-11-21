// A page that only exists on this machine: the remote browser reaches it through TestingBot Tunnel.
require('node:http')
  .createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<!doctype html><title>Local page</title><h1>Served from localhost</h1>')
  })
  .listen(3999)
