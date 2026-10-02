import http from 'http';

const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Web</title>
</head>
<body>
  <h1 id="title">Welcome</h1>
  <button id="btn" onclick="document.getElementById('title').innerText = 'Clicked'">Click Me</button>
  <script>
    console.log("App loaded");
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(5001, () => {
  console.log('Server started on port 5001');
});
