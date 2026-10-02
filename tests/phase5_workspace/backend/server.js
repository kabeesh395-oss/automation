
import http from 'http';
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('{"success":true}');
});
server.listen(4000, () => console.log('listening on 4000'));
  