# 咕嘎 · gugugaga

一只住在桌面上的小企鹅，Windows / macOS / Linux 都能跑。

透明窗口、永远置顶、不占任务栏，平时待在屏幕角落自己发呆。摸它会歪头，拖着它会甩来甩去，右键能陪它玩。基于 Electron，全部逻辑在一个渲染进程里，没有服务器依赖。

<img src="assets/pet-penguin-open.png" width="170" alt="咕嘎">

## 装一个玩

不想碰代码的话，去 [Releases](https://github.com/nbspqq/gugugaga/releases/latest) 下载对应平台的包：

**Windows x64**

- **DesktopPet-Setup-1.0.1.exe** —— 安装版，可以选目录，装完桌面和开始菜单有「咕嘎」
- **DesktopPet-Portable-1.0.1.exe** —— 免安装单文件，双击直接跑

**macOS**（Intel 选 x64，Apple 芯片选 arm64）

- **DesktopPet-1.0.1-x64.dmg** / **DesktopPet-1.0.1-arm64.dmg**

没有签名和公证，第一次打开要绕一下：右键点图标 → **打开** → 再点「打开」。或者执行
`xattr -dr com.apple.quarantine /Applications/DesktopPet.app`。

**Linux x64**（Ubuntu 20.04+、Debian 11+ 之类）

- **DesktopPet-1.0.1-x86_64.AppImage** —— `chmod +x` 之后直接运行，不挑发行版
- **DesktopPet-1.0.1-amd64.deb** —— `sudo apt install ./DesktopPet-1.0.1-amd64.deb`

Linux 的托盘图标依赖桌面的 AppIndicator 支持，GNOME 上可能需要装 `gnome-shell-extension-appindicator`。

安装包没有代码签名证书，Windows 的 SmartScreen 会提示「已保护你的电脑」，点 **更多信息 → 仍要运行** 即可。

## 它能干什么

**右键它**

| 玩法 | 说明 |
|---|---|
| 打招呼 / 跳一下 / 睡一会儿 | 睡下之后就不再理你，得先叫醒 |
| 陪它玩 / 猜拳 | 猜拳会记比分 |
| 荡秋千 | 挂在鼠标上荡，甩得越急荡得越高，身子跟着绳子歪 |
| 去钓鱼 / 溜达 / 钻被窝 / 发呆 | 自己跑去干别的事，干完自己回来 |
| 小鱼干 / 布丁 / 苹果 | 吃了涨食物、心情和亲密度 |
| 喂桌上图标 | 把桌面上的文件叼进肚子，需要先确认 |
| 看看肚子里 | 列出来，随时吐回桌面 |
| 今天天气 / 念条新闻 | 走免费的公开接口，不需要申请 key |

**托盘图标**（开关类都在这里，右键菜单只放"玩"的）

跟着鼠标走 · 荡秋千 · 专注 25 分钟 · 每日天气简报 · 定时念新闻 · 喝水提醒 · 整点报时 · 关注电脑状态 · 饿了自己啃桌面 · 暂停自动活动 · 退出

**养成**

食物、心情、精力、亲密度四条状态，加上总亲密度决定的称呼：刚认识 → 有点熟 → 好朋友 → 挚友。不同阶段台词不一样。放置太久会自己睡着，饿了（开了自动啃桌面的话）会去桌上找东西吃。

## 从源码跑

需要 Node.js 18+。三个平台都能跑：

```bash
npm install
npm start
```

打包：

```bash
npm run dist:win     # Windows：NSIS 安装包 + 便携版
npm run dist:mac     # macOS：dmg + zip（x64 / arm64）
npm run dist:linux   # Linux：AppImage + deb
```

产物在 `dist/`（可以用 `--config.directories.output=xxx` 换个目录）。

**macOS 的包必须在 macOS 上打**，Windows 和 Linux 不能交叉构建；仓库里配了 GitHub Actions（`.github/workflows/build.yml`），打 tag 或手动触发就会在真机上构建三平台并附到 Release。

托盘图标可以重新生成：`npm run icon`（要 Python + Pillow）。

## 数据放在哪

养成进度存在系统的应用数据目录里，删掉等于重新认识：

| 平台 | 位置 |
|---|---|
| Windows | `%APPDATA%\DesktopPet` |
| macOS | `~/Library/Application Support/DesktopPet` |
| Linux | `~/.config/DesktopPet` |

吃掉的桌面图标在「文档」目录下的 `咕嘎的肚子`（Windows 是 `我的文档\咕嘎的肚子`）。是搬走不是删除，随时能吐回去。

## 项目结构

```
main.js            主进程：窗口、托盘、光标轮询、IPC
preload.js         contextBridge 暴露给渲染层的接口
system-monitor.js  CPU / 内存采样，按窗口算平均值
net-service.js     天气 / 新闻 / 定位，带缓存
weather.js         天气码中文对照、文案拼装
desktop-icons.js   桌面图标枚举、位置估算、搬运
src/index.html     界面结构
src/style.css      样式与 CSS 动画
src/game.js        养成数值、存档、台词、等级
src/renderer.js    渲染层：动作状态机、物理、菜单、气泡
```

## 一些实现上的坑（写给想改的人）

- **窗口是全屏透明的**，宠物靠 CSS `translate3d` 在窗口里移动，不是挪窗口。主进程每 16ms 轮询一次光标位置；窗口默认点击穿透，只有光标压在宠物身上时才 `setIgnoreMouseEvents(false)`。
- **渲染层永远拿不到焦点**，所以必须关掉 `backgroundThrottling`，不然系统把它当后台窗口，动画会被降频。
- **荡秋千是个单摆**：支点不直接用光标，而是用弹簧追光标（光标是 16ms 采一次的台阶信号，直接当支点会一格一格地跳），积分按 1/120 秒定步长补。
- **两套图层**：`#pet` 管位置，`#pet-tilt` 给 JS 每帧写形变（拖拽倾斜、落地压扁），`#pet-body` 留给 CSS 动画（呼吸、走路、跳），互不抢 transform。

## 已知限制

- Windows / macOS / Linux 都出了包，但只在 Windows 上真机跑过。macOS 和 Linux 缺签名和公证，首次打开要手动放行。
- Linux 的点击穿透靠 `setIgnoreMouseEvents`，Wayland 会话下不生效；要在 Wayland 上用，登录时切到 X11。
- 桌面图标的排列位置是按 Windows 的网格估的，macOS 和 Linux 上图标位置会有偏差（投喂功能本身可用）。
- 天气走 open-meteo、定位走 ipinfo、新闻走少数派 RSS 和 Hacker News API，都是免费接口，可能限流或连不上；连不上时会用缓存的上一条。
- 只有一张企鹅皮，换装功能还没做。

## License

Apache License 2.0，见 [LICENSE](LICENSE)。
