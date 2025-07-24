// index.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // 移除开头的斜杠

    // 处理根路径请求，返回前端页面
    if (path === '' || path === 'index.html') {
      return this.serveStaticFile(request);
    }

    // 处理API请求
    if (path === 'api/create') {
      if (request.method === 'POST') {
        return this.handleCreate(request, env, ctx);
      } else {
        return new Response('Method not allowed', { status: 405 });
      }
    }

    // 处理短链接跳转
    if (path) {
      return this.handleRedirect(path, env);
    }

    // 其他情况返回404
    return new Response('Not Found', { status: 404 });
  },

  // 处理短链接跳转逻辑
  async handleRedirect(shortId, env) {
    try {
      // 从KV中获取对应的长URL
      const longUrl = await env.URL_KV.get(shortId);
      
      if (longUrl) {
        // 302临时重定向
        return Response.redirect(longUrl, 302);
      } else {
        return new Response('Short link not found', { status: 404 });
      }
    } catch (error) {
      console.error('Error fetching from KV:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  // 处理创建短链接API
  async handleCreate(request, env, ctx) {
    try {
      const { longUrl, customId } = await request.json();
      
      // 验证长URL格式
      if (!this.isValidUrl(longUrl)) {
        return new Response('Invalid URL', { status: 400 });
      }

      // 生成或验证短ID
      let shortId = customId;
      if (!shortId) {
        // 自动生成短ID
        shortId = this.generateRandomId(6);
      } else {
        // 验证自定义短ID格式
        if (!/^[a-zA-Z0-9_-]+$/.test(shortId)) {
          return new Response('Custom ID can only contain letters, numbers, hyphens, and underscores', { status: 400 });
        }
        
        // 检查自定义短ID是否已存在
        const existingUrl = await env.URL_KV.get(shortId);
        if (existingUrl) {
          return new Response('Custom ID already exists', { status: 409 });
        }
      }

      // 将映射存入KV
      ctx.waitUntil(env.URL_KV.put(shortId, longUrl));
      
      // 返回成功响应
      const shortUrl = `${new URL(request.url).origin}/${shortId}`;
      return new Response(JSON.stringify({ shortUrl, longUrl }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201
      });
    } catch (error) {
      console.error('Error creating short link:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  // 验证URL格式
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  },

  // 生成随机短ID
  generateRandomId(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // 提供静态文件服务（简化版）
  async serveStaticFile(request) {
    // 在实际应用中，你可以使用`@cloudflare/kv-asset-handler`来提供静态文件服务
    // 这里仅返回一个简单的HTML页面
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>URL Shortener</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .form-group { margin-bottom: 15px; }
    input { width: 100%; padding: 8px; margin-top: 5px; }
    button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; cursor: pointer; }
    #result { margin-top: 20px; padding: 10px; background-color: #f0f0f0; }
  </style>
</head>
<body>
  <h1>URL Shortener</h1>
  
  <form id="shortenForm">
    <div class="form-group">
      <label for="longUrl">Long URL:</label>
      <input type="url" id="longUrl" required>
    </div>
    <div class="form-group">
      <label for="customId">Custom ID (optional):</label>
      <input type="text" id="customId" pattern="[a-zA-Z0-9_-]+">
    </div>
    <button type="submit">Create Short Link</button>
  </form>
  
  <div id="result" style="display: none;">
    <h3>Short Link Created!</h3>
    <p>Short URL: <a id="shortUrl" href="#" target="_blank"></a></p>
    <p>Original URL: <span id="originalUrl"></span></p>
  </div>

  <script>
    document.getElementById('shortenForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const longUrl = document.getElementById('longUrl').value;
      const customId = document.getElementById('customId').value;
      
      try {
        const response = await fetch('/api/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ longUrl, customId })
        });
        
        if (response.ok) {
          const data = await response.json();
          document.getElementById('result').style.display = 'block';
          document.getElementById('shortUrl').href = data.shortUrl;
          document.getElementById('shortUrl').textContent = data.shortUrl;
          document.getElementById('originalUrl').textContent = data.longUrl;
        } else {
          alert('Error: ' + await response.text());
        }
      } catch (error) {
        alert('Network error occurred');
      }
    });
  </script>
</body>
</html>
    `;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};