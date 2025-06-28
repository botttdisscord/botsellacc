const express = require('express');
const server = express();

// Phản hồi chính tại trang chủ
server.all('/', (req, res) => {
  // Trả về một trang HTML đơn giản với thời gian hiện tại
  // Điều này làm cho mỗi phản hồi trở nên độc nhất, có thể "đánh lừa" hệ thống của Replit tốt hơn
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  res.send(`
    <html>
      <head>
        <title>Bot Status</title>
      </head>
      <body>
        <h1>Bot is running!</h1>
        <p>Last ping at: ${now}</p>
      </body>
    </html>
  `);
});

function keepAlive() {
  server.listen(3000, () => {
    console.log('✅ Web server đã sẵn sàng và thông minh hơn!');
  });
}

module.exports = keepAlive;
