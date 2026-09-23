# Timi Studio · 3D 个人网站

这是 [timi.store](https://timi.store/) 当前线上版本的开源源码。你可以走进黄昏公寓，自由移动，与数字分身聊天，打开桌面项目、观星台和时间倒流小游戏。

![Timi Studio 的三维房间](public/og.png)

## 现在包含什么

- 可行走的 Blender 公寓与原创场景编排
- 带动画、碰撞和交互热点的 Three.js 角色与房间
- 项目电脑、场景编辑器与时间倒流小游戏
- 可选的数字分身聊天接口与隐私说明
- 观星台入口与独立探索页面
- 响应式界面、触屏操作和低动态效果适配

仓库里的项目封面、桌面壁纸和预览图均来自线上网站；提交前已移除相机、定位等图片元数据。仍在本地开发、尚未发布的页面不会进入这个仓库。

## 技术栈

Next.js 16、React 19、Three.js、TypeScript、Vinext、Vite。3D 资产以 glTF/GLB 为主，场景生成和质量检查脚本位于 `scripts/`。

## 本地运行

需要 Node.js 22.13 或更新版本。

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。

数字分身是可选功能。复制 `.dev.vars.example` 为 `.dev.vars`，再在本机填写 DeepSeek API Key；不要提交真实密钥。没有配置时，网站的其余部分仍可运行。

默认情况下聊天接口只接受本机请求。若要公开聊天功能，请配置精确的 `TIMI_PUBLIC_ORIGINS`，并在反向代理或边缘平台设置按 IP 限速、请求体上限和并发限制；不要直接把带模型密钥的 Node 端口暴露到公网。

## 检查与构建

```bash
npm run lint
npx tsc --noEmit
npm run build
node scripts/check-sunset-room.mjs sunset-editable-web.glb
node scripts/check-scene-editor.mjs
node scripts/check-telescope.mjs
node scripts/check-avatar-pose.mjs
node scripts/check-rewind-game.mjs
node scripts/check-timi-chat.mjs
node server/conversations.test.mjs
```

`npm run build` 会在存在已授权的 `vendor/orbit-main` 本地副本时构建完整观星台。公开仓库不会分发这份上游源码；缺少它时会生成带来源链接的说明页，网站仍能正常构建。

## 目录

```text
app/                 页面、交互和 Three.js 场景
public/              网站运行需要的模型、纹理与署名
scripts/             资产构建、优化和场景检查
server/              可选的对话记录服务
```

Blender 中间文件、下载缓存、服务器部署记录、真实环境变量和已退役的模型版本不会进入公开仓库。

公开构建使用可再分发的原创房间模型。两个未声明许可证的线上集成——AT010303 参考家具和 ORBIT 观星台源码——都不会进入 GitHub；代码会分别回退到原创房间与来源说明页。

## 授权

原创源代码使用 [MIT License](LICENSE)。模型、纹理、地形数据与角色资产使用各自的许可证，详情见 [ASSET_LICENSES.md](ASSET_LICENSES.md)。使用或再分发前请保留署名，并注意其中包含限制商业使用的第三方素材。

---

Made by Timi.
