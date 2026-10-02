
import http from 'http';
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end('<html><body><h1>Web Works</h1></body></html>');
});
server.listen(4001, () => console.log('listening on 4001'));
  