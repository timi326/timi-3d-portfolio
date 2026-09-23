# 素材与第三方代码授权

根目录的 `LICENSE` 只覆盖本项目原创源代码，不会改变第三方模型、纹理、地形数据和角色资产各自的授权。

## 运行时素材

- 房间中的独立模型与作者信息见 [`public/model-credits.html`](public/model-credits.html)。其中包含 CC BY、CC BY-NC 等不同授权，使用时请逐项遵守。
- 望远镜模型的署名见 [`public/models/telescope/CREDITS.md`](public/models/telescope/CREDITS.md)。
- `public/licenses/` 保存房间参考模型和纹理的原始授权文本。
- 未单独标注的原创美术资源由 Timi 保留版权。

AT010303 的 `Room_Portfolio` 仓库声明为 `UNLICENSED`。线上部署可以保留作者提供的参考家具，但公开仓库不会分发其派生几何或贴图；公开构建自动使用原创的 `sunset-editable` 房间版本。

## ORBIT 观星台

网站可以在本地接入 [ryh842487118-bot/orbit](https://github.com/ryh842487118-bot/orbit)。截至本仓库发布时，上游没有声明软件许可证，因此其源码、纹理和构建产物不随本仓库分发，也不受本项目 MIT 许可证覆盖。

若 `vendor/orbit-main` 不存在，构建脚本会生成一页来源说明和原项目入口，不会复制上游实现。
