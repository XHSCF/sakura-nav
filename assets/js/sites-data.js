window.SAKURA_DATA = Object.freeze({
  categories: [
    { id: "movies", name: "在线影视", icon: "fa-film" },
    { id: "anime", name: "动漫番剧", icon: "fa-play-circle" },
    { id: "downloads", name: "资源下载", icon: "fa-cloud-download-alt" },
    { id: "tools", name: "在线工具", icon: "fa-tools" },
    { id: "ios", name: "iOS 相关", icon: "fa-mobile-alt" },
    { id: "games", name: "游戏专区", icon: "fa-gamepad" },
    { id: "software", name: "软件专区", icon: "fa-laptop-code" }
  ],
  sites: [
    { id: "aiyingyu", name: "爱美剧网", url: "https://m.aiyingyu.net/", description: "美剧在线观看。", category: "movies", keywords: ["美剧", "英剧", "aiyingyu"], featured: true, popular: true },
    { id: "wandou", name: "豌豆Pro", url: "https://wandou.la/", description: "影视内容在线观看。", category: "movies", keywords: ["豌豆", "wandou", "影视"], featured: true, popular: true },
    { id: "libvio", name: "LIBVIO", url: "https://www.libvio.app/", description: "在线视频网站。", category: "movies", keywords: ["libvio", "影视", "视频"], featured: true, popular: true },
    { id: "gimy", name: "剧迷", url: "https://gimy.tv/", description: "简洁的影视观看网站。", category: "movies", keywords: ["剧迷", "gimy", "影视"], featured: true },
    { id: "czzy", name: "厂长影视", url: "https://www.czzy.site/", description: "高清影视内容。", category: "movies", keywords: ["厂长", "czzy", "cz4k", "1080p"], popular: true },
    { id: "zxzj", name: "在线之家", url: "https://www.zxzjhd.com/", description: "老牌影视网站。", category: "movies", keywords: ["在线之家", "zxzj", "影视"], featured: true },
    { id: "cilixiong", name: "磁力熊", url: "https://www.cilixiong.cc/", description: "高清影视资源。", category: "movies", keywords: ["磁力熊", "cilixiong", "1080p", "影视" ] },
    { id: "gaze", name: "注视影视", url: "https://gaze.run/", description: "清爽的影视观看网站。", category: "movies", keywords: ["注视", "gaze", "影视"] },

    { id: "anime1", name: "Anime1", url: "https://anime1.me/", description: "页面简洁、更新较快的动画网站。", category: "anime", keywords: ["anime1", "动漫", "动画", "番剧"], featured: true, popular: true },
    { id: "sorani", name: "青空次元", url: "https://www.sorani.net/", description: "动漫番剧内容网站。", category: "anime", keywords: ["青空次元", "sorani", "动漫", "番剧"] },

    { id: "skrbt", name: "磁力搜索", url: "https://skrdizhi.com/", description: "BT 磁力搜索。", category: "downloads", keywords: ["磁力搜索", "skrbt", "bt", "torrent"], popular: true },
    { id: "dmhy", name: "动漫花园", url: "https://share.dmhy.org/", description: "动漫资源与番剧下载。", category: "downloads", keywords: ["动漫花园", "dmhy", "bt", "番剧下载"], featured: true, popular: true },
    { id: "dmhy-mirror", name: "动漫花园镜像站", url: "https://dongmanhuayuan.myheartsite.com/", description: "动漫花园同步镜像站。", category: "downloads", keywords: ["动漫花园", "dmhy", "镜像", "番剧下载"] },
    { id: "aq-pan", name: "AQ网盘资源", url: "https://wpzy.cc/", description: "网盘资源分享。", category: "downloads", keywords: ["aq", "网盘", "资源", "wpzy"] },
    { id: "trex", name: "团长资源", url: "http://t-rex.tzfile.com/", description: "网盘资源分享。", category: "downloads", keywords: ["团长", "trex", "网盘", "资源"] },
    { id: "kkdm", name: "快快动漫", url: "https://kkdm.xyz/", description: "日韩动漫资源分享。", category: "downloads", keywords: ["快快动漫", "kkdm", "日韩动漫", "下载"] },
    { id: "vcb-studio", name: "VCB-Studio", url: "https://vcb-s.com/", description: "动漫 BDRip 压制作品发布。", category: "downloads", keywords: ["VCB-Studio", "VCB-S", "vcb-s", "VCB压制组", "动漫压制", "BDRip", "动漫资源"], addedAt: "2026-07-13" },
    { id: "yiove-resources", name: "综合资源区", url: "https://bbs.yiove.com/forum-4.htm", description: "影视网盘资源分享。", category: "downloads", keywords: ["yiove", "综合资源", "网盘", "影视"] },
    { id: "srtku", name: "字幕库", url: "https://srtku.com/", description: "字幕分享与下载。", category: "downloads", keywords: ["字幕库", "srtku", "srt", "字幕下载"] },
    { id: "assrt", name: "伪射手网", url: "https://assrt.net/", description: "影视字幕下载。", category: "downloads", keywords: ["伪射手", "assrt", "字幕", "srt"] },
    { id: "anime-subtitles", name: "Anime字幕论坛", url: "https://bbs.acgrip.com/", description: "日漫字幕分享与交流论坛。", category: "downloads", keywords: ["Anime字幕论坛", "ACG.RIP", "acgrip", "日漫字幕", "动漫字幕", "外挂字幕"], addedAt: "2026-07-13" },
    { id: "zlibrary", name: "书籍下载", url: "https://z-library.sk/", description: "书籍与小说资源。", category: "downloads", keywords: ["z-library", "zlibrary", "电子书", "小说"] },
    { id: "wallhaven", name: "壁纸下载", url: "https://wallhaven.cc/", description: "高质量壁纸浏览与下载。", category: "downloads", keywords: ["wallhaven", "壁纸", "wallpaper", "桌面"] },
    { id: "haowallpaper", name: "哲风壁纸", url: "https://haowallpaper.com/", description: "高清电脑与手机壁纸浏览下载。", category: "downloads", keywords: ["哲风壁纸", "Hao Wallpaper", "haowallpaper", "高清壁纸", "壁纸下载"], addedAt: "2026-07-13" },

    { id: "baimiao", name: "白描网页", url: "https://web.baimiaoapp.com/", description: "图片转文字与 OCR 识别。", category: "tools", keywords: ["白描", "baimiao", "ocr", "图片转文字"], featured: true, popular: true },
    { id: "waifu2x", name: "图片放大", url: "https://www.waifu2x.net/", description: "动漫图片降噪与放大工具。", category: "tools", keywords: ["waifu2x", "图片放大", "超分辨率", "降噪"] },
    { id: "petpet", name: "小工具", url: "https://benisland.neocities.org/petpet/", description: "有趣的 Petpet 图片生成工具。", category: "tools", keywords: ["petpet", "摸头", "表情包", "图片工具"] },
    { id: "zaixianps", name: "在线 PS", url: "https://zaixianps.net/", description: "在线修图与抠图工具。", category: "tools", keywords: ["在线ps", "photoshop", "修图", "抠图"], popular: true },
    { id: "fangdai", name: "房贷计算器", url: "https://fangdai.gitapp.cn", description: "房贷利率与还款计算工具。", category: "tools", keywords: ["房贷", "计算器", "利率", "还款"] },
    { id: "m3u8player", name: "M3U8 在线播放器", url: "https://m3u8player.org/", description: "M3U8/HLS 在线播放工具。", category: "tools", keywords: ["m3u8", "hls", "播放器", "视频"] },
    { id: "gitapp-tools", name: "在线工具助手", url: "https://tool.gitapp.cn", description: "常见开发与文本处理工具。", category: "tools", keywords: ["gitapp", "开发工具", "在线工具", "文本处理"], featured: true, popular: true },
    { id: "ifixit", name: "iFixit", url: "https://zh.ifixit.com/", description: "免费的设备维修指南。", category: "tools", keywords: ["ifixit", "维修", "拆机", "指南"], addedAt: "2026-07-12" },
    { id: "resizeon", name: "Resizeon", url: "https://resizeon.com/zh-cn/", description: "在线调整图片尺寸。", category: "tools", keywords: ["resizeon", "图片尺寸", "resize", "缩放"], addedAt: "2026-07-12" },
    { id: "boce", name: "拨测", url: "https://www.boce.com/", description: "网站测速与网络检测平台。", category: "tools", keywords: ["拨测", "BOCE", "boce", "网站测速", "网络检测"], addedAt: "2026-07-13" },

    { id: "appstore-price", name: "App Store 价格查询", url: "https://app.vbr.me/", description: "查询 App Store 全球应用定价。", category: "ios", keywords: ["app store", "价格查询", "应用定价", "ios"], addedAt: "2026-07-12" },
    { id: "ios-update-blocker", name: "iOS 屏蔽系统更新", url: "https://f.itsnebula.net/noota-26.mobileconfig", description: "用于屏蔽 iOS 系统更新的描述文件。", category: "ios", keywords: ["ios", "屏蔽更新", "描述文件", "mobileconfig"], addedAt: "2026-07-12" },
    { id: "applewalls", name: "iPhone 壁纸", url: "https://applewalls.com/", description: "iPhone 原图壁纸。", category: "ios", keywords: ["iphone", "applewalls", "壁纸", "wallpaper"], addedAt: "2026-07-12" },
    { id: "ios-icons", name: "图标下载", url: "https://jiejingku.net/icon/", description: "iOS 应用图标下载。", category: "ios", keywords: ["ios", "应用图标", "icon", "捷径库"], addedAt: "2026-07-12" },
    { id: "douyin-parser", name: "抖音万能解析", url: "https://www.icloud.com/shortcuts/eb7052fb90d640ccafe843419c24fa6c", description: "解析并保存抖音无水印视频的 iOS 快捷指令。", category: "ios", keywords: ["抖音万能解析", "抖音解析", "douyin", "抖音去水印", "无水印视频", "iOS快捷指令"], addedAt: "2026-07-14" },

    { id: "kaboom-trainer", name: "瞬爆修改器", url: "http://kaboomtrainer.com/", description: "GTA V 单机模式修改工具。", category: "games", keywords: ["瞬爆", "kaboom", "gta5", "修改器"], addedAt: "2026-07-12" },

    { id: "qbittorrent", name: "qBittorrent", url: "https://www.qbittorrent.org/", description: "开源、无广告的跨平台 BitTorrent 客户端。", category: "software", keywords: ["qBittorrent", "qbittorrent", "BitTorrent", "BT下载", "磁力链接", "下载工具"], addedAt: "2026-07-14" },
    { id: "bitcomet", name: "BitComet", url: "https://www.bitcomet.com/en", description: "支持 BitTorrent、HTTP 与 FTP 的下载客户端。", category: "software", keywords: ["BitComet", "bitcomet", "比特彗星", "BitTorrent", "BT下载", "磁力链接"], addedAt: "2026-07-14" },
    { id: "trackerslist", name: "TrackersList", url: "https://trackerslist.com/#/zh", description: "两款 BT 客户端配套的公共 Tracker。", category: "software", keywords: ["TrackersList", "trackerslist", "BT Tracker", "Tracker列表", "公共Tracker", "qBittorrent", "BitComet", "BT下载"], addedAt: "2026-07-14" },
    { id: "potplayer", name: "PotPlayer", url: "https://potplayer.tv/?lang=zh_CN", description: "支持多格式、字幕和硬件加速的 Windows 播放器。", category: "software", keywords: ["PotPlayer", "potplayer", "视频播放器", "影音播放", "字幕", "硬件加速"], addedAt: "2026-07-14" },
    { id: "mpc-be", name: "MPC-BE", url: "https://sourceforge.net/projects/mpcbe/", description: "轻量开源的 Windows 音视频播放器。", category: "software", keywords: ["MPC-BE", "mpcbe", "Media Player Classic", "视频播放器", "音频播放器", "开源播放器"], addedAt: "2026-07-14" },
    { id: "7-zip", name: "7-Zip", url: "https://www.7-zip.org/", description: "免费开源的高压缩率文件压缩与解压工具。", category: "software", keywords: ["7-Zip", "7zip", "压缩软件", "解压工具", "7z", "zip", "rar"], addedAt: "2026-07-14" }
  ],
  hiddenSection: {
    id: "new-world",
    name: "新世界",
    icon: "fa-door-open",
    passphrase: "开门",
    welcome: "欢迎踏入新世界的大门",
    sites: [
      { id: "jable", name: "Jable", url: "https://jable.tv/", description: "日本18+。", keywords: ["Jable", "jable", "日本", "18+"] }
    ]
  }
});
