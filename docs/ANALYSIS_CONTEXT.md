# Majsoul Plus 检测机制分析

**日期**: 2026-04-13
**状态**: 分析中 - 等待用户提供更多信息

---

## 1. 项目概述

Majsoul Plus 是一个雀魂麻将客户端增强工具，通过本地代理服务器实现对游戏的修改。

### 核心架构

```
用户启动 → Electron窗口 → 本地代理服务器(localhost:8887)
                                              ↓
                              webview 加载 localhost URL
                                              ↓
                              所有资源请求经过代理拦截
                                              ↓
                              返回修改后的 JS + 替换的资源
                                              ↓
                              浏览器执行修改后的代码
```

### 关键文件

| 文件 | 作用 |
|------|------|
| `src/server.ts` | Koa 本地代理服务器，拦截请求 |
| `src/extension/manager.ts` | 扩展管理，生成注入的 code.js loader |
| `src/resourcepack/manager.ts` | 资源包管理，修改 resversion.json |
| `src/bin/main/mainLoader.ts` | webview 加载器，处理 URL 重定向 |
| `src/global.ts` | 远程域名配置 |
| `src/config.ts` | 用户配置 |

### 服务器域名配置

```typescript
// src/global.ts:52-56
export const RemoteDomains = [
  { id: 0, name: 'zh', domain: 'https://game.maj-soul.com/1' },
  { id: 1, name: 'jp', domain: 'https://game.mahjongsoul.com' },
  { id: 2, name: 'en', domain: 'https://mahjongsoul.game.yo-star.com' }
]
```

---

## 2. 服务器列表获取流程（官方）

```
Step 1: version.json
        GET https://game.maj-soul.com/1/version.json
        → {"version": "0.11.242.w", "code": "v0.11.242.w/code.js"}

Step 2: resversion
        GET https://game.maj-soul.com/1/resversion0.11.242.w.json
        → {"res": {"config.json": {"prefix": "v0.11.242.w"}}}

Step 3: config.json
        GET https://game.maj-soul.com/1/v0.11.242.w/config.json
        → {"ip":[{"gateways":[{"url":"https://route-2.maj-soul.com"},...]}]}

Step 4: gateway list
        GET https://route-2.maj-soul.com/?service=ws-gateway&protocol=ws&ssl=true
        → {"servers":["gateway-ip:port",...]}
```

### Route 服务器列表（从 config.json 获取）

```json
{
  "gateways": [
    {"id": "route-2", "url": "https://route-2.maj-soul.com"},
    {"id": "route-3", "url": "https://route-3.maj-soul.com:8443"},
    {"id": "route-4", "url": "https://route-4.maj-soul.com"},
    {"id": "route-5", "url": "https://route-5.maj-soul.com"},
    {"id": "route-6", "url": "https://route-6.maj-soul.com"}
  ]
}
```

---

## 3. 当前问题

### 问题描述
- 官方已禁用 Majsoul Plus 客户端
- 检测手段包括 `location.host + 固定path` 拼接获取服务器列表
- 用户已硬编码服务器列表，可正常登录
- **但游戏过程中频繁掉线**

### 已测试的请求

```bash
# 成功的请求
curl https://game.maj-soul.com/1/version.json
curl https://game.maj-soul.com/1/resversion0.11.242.w.json
curl https://game.maj-soul.com/1/v0.11.242.w/config.json

# route-2 连接测试（TLS握手成功，IP: 170.33.12.14）
curl -v https://route-2.maj-soul.com/
```

---

## 4. 检测机制分析

### location 对象差异

| 属性 | 官方预期 | localhost 代理实际值 |
|------|----------|---------------------|
| `location.host` | `game.maj-soul.com` | `localhost:8887` |
| `location.hostname` | `game.maj-soul.com` | `localhost` |
| `location.origin` | `https://game.maj-soul.com` | `https://localhost:8887` |
| `location.pathname` | `/1/` | `/` |

### 可能的检测点

1. **服务器列表请求**: 游戏代码使用 `location.host + "/固定路径"` 获取服务器列表
2. **WebSocket Origin**: 连接时携带 `origin: https://localhost:8887`，服务器可能拒绝
3. **心跳包验证**: 心跳数据包含域名指纹或客户端标识
4. **API 签名**: 某些 API 使用 `location.origin` 签名请求参数

---

## 5. 建议绕过方案

### 方案 A: location 对象伪造

在 code.js 加载前注入：

```javascript
// 在 src/extension/manager.ts loader 代码开头添加
(function() {
  const SERVER_DOMAINS = {
    0: { host: 'game.maj-soul.com', origin: 'https://game.maj-soul.com', pathname: '/1/' },
    1: { host: 'game.mahjongsoul.com', origin: 'https://game.mahjongsoul.com', pathname: '/' },
    2: { host: 'mahjongsoul.game.yo-star.com', origin: 'https://mahjongsoul.game.yo-star.com', pathname: '/' }
  };

  const serverId = /* 从配置获取 */;
  const fake = SERVER_DOMAINS[serverId];
  const real = window.location;

  const proxyLocation = new Proxy(real, {
    get(target, prop) {
      const overrides = {
        host: fake.host,
        hostname: fake.host,
        origin: fake.origin,
        pathname: fake.pathname,
        href: fake.origin + fake.pathname,
        port: ''
      };
      if (prop in overrides) return overrides[prop];
      if (typeof target[prop] === 'function') return target[prop].bind(target);
      return target[prop];
    }
  });

  Object.defineProperty(window, 'location', {
    get: () => proxyLocation,
    configurable: false
  });
})();
```

### 方案 B: 添加路由拦截

在 `src/server.ts` 中拦截服务器列表请求：

```typescript
router.get('/api/gateway', async ctx => {
  const resp = await fetch('https://route-2.maj-soul.com/?service=ws-gateway&protocol=ws&ssl=true');
  ctx.body = await resp.json();
});
```

---

## 6. 待用户提供的信息

为精确定位检测点，需要：

1. **硬编码服务器列表的代码位置**: 你在哪个文件做了什么修改？
2. **官网调试时的完整 URL**: 在官网调试时获取服务器列表的具体请求路径和响应
3. **掉线时的错误日志**: console 或 network panel 显示的错误信息

---

## 7. 下一步行动

1. 根据用户提供的信息定位具体检测代码
2. 实现完整的 location 伪造方案
3. 处理 WebSocket Origin 问题
4. 测试修复后的稳定性

---

## 附录: 相关代码位置

### code.js 注入位置

`src/extension/manager.ts:137-234` - `router.get('/:version/code.js')` 路由生成 loader

```javascript
// 生成的 loader 结构
this.codejs = `const Majsoul_Plus = {};
(async () => {
  await addScript("majsoul_plus/plugin/console.js");
  await addScript("majsoul_plus/plugin/fetch.js");
  await addScript("majsoul_plus/${version}/code.js");  // 加载官方 code.js
  await Promise.all($.pre.map(ext => addScript(...)));  // 加载扩展
  new GameMgr();  // 启动游戏
})()`;
```

### 官方 code.js 处理

`src/extension/manager.ts:283-292` - 加载官方 code.js 并禁用 `new GameMgr`

```javascript
router.get(`/majsoul_plus/:version/code.js`, async ctx => {
  const code = await getRemoteOrCachedFile(url);
  ctx.body = code.replace('new GameMgr', '()=>1');  // 禁用官方初始化
});
```