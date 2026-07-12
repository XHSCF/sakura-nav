window.SAKURA_DATA = Object.freeze({
  categories: [
    { id: "movies", name: "影视在线观看", icon: "fa-film" },
    { id: "anime", name: "动漫番剧", icon: "fa-play-circle" },
    { id: "downloads", name: "资源下载", icon: "fa-cloud-download-alt" },
    { id: "tools", name: "工具相关", icon: "fa-tools" },
    { id: "ios", name: "iOS 相关", icon: "fa-mobile-alt" },
    { id: "games", name: "游戏相关", icon: "fa-gamepad" },
    { id: "ppt", name: "PPT 资源", icon: "fa-file-powerpoint" }
  ],
  sites: [
    { name: "爱美剧网", url: "https://m.aiyingyu.net/", description: "爱美剧网，在线观看。", icon: "https://m.aiyingyu.net/favicon.ico", category: "movies", featured: true, popular: true },
    { name: "豌豆Pro", url: "https://wandou.la/", description: "豌豆Pro，影视在线观看", icon: "https://wandou.la/favicon.ico", category: "movies", featured: true, popular: true },
    { name: "LIBVIO", url: "https://www.libvio.app/", description: "LIBVIO在线视频", icon: "assets/images/logos/LIBVIO.png", category: "movies", featured: true, popular: true },
    { name: "剧迷", url: "https://gimy.tv/", description: "剧迷，小而美。", icon: "https://gimy.tv/favicon.ico", category: "movies", featured: true },
    { name: "厂长影视", url: "https://www.czzy.site/", description: "质量1080P", icon: "https://www.cz4k.com/favicon.ico", category: "movies", popular: true },
    { name: "在线之家", url: "https://www.zxzjhd.com/", description: "老牌知名影视网站。", icon: "assets/images/logos/在线之家.png", category: "movies", featured: true },
    { name: "磁力熊", url: "https://www.cilixiong.cc/", description: "纯净的1080P", icon: "https://www.cilixiong.cc/favicon.ico", category: "movies" },
    { name: "注视影视", url: "https://gaze.run/", description: "小众，清爽无广告", icon: "https://gaze.run/favicon.ico", category: "movies" },

    { name: "Anime1", url: "https://anime1.me/", description: "页面简洁、更新速度快", icon: "https://anime1.me/favicon.ico", category: "anime", featured: true, popular: true },
    { name: "青空次元", url: "https://www.sorani.net/", description: "青空次元-悠于青空之上~", icon: "https://www.sorani.net/favicon.ico", category: "anime" },
    { name: "待添加", url: "https://skrto.top/", description: "待添加。", icon: "assets/images/logos/坤哥.png", category: "anime" },

    { name: "磁力搜索", url: "https://skrdizhi.com/", description: "BT磁力搜素", icon: "assets/images/logos/SkrBT.png", category: "downloads", popular: true },
    { name: "动漫花园", url: "https://share.dmhy.org/", description: "动漫资源下载", icon: "https://share.dmhy.org/favicon.ico", category: "downloads", featured: true, popular: true },
    { name: "动漫花园镜像站", url: "https://dongmanhuayuan.myheartsite.com/", description: "动漫花园同步站", icon: "assets/images/logos/花园镜像.png", category: "downloads" },
    { name: "AQ网盘资源", url: "https://wpzy.cc/", description: "分享网盘资源", icon: "assets/images/logos/AQ网盘资源.png", category: "downloads" },
    { name: "团长资源", url: "http://t-rex.tzfile.com/", description: "分享网盘资源", icon: "assets/images/logos/团长资源.png", category: "downloads" },
    { name: "快快动漫", url: "https://kkdm.xyz/", description: "专注日韩动漫分享", icon: "https://kkdm.xyz/favicon.ico", category: "downloads" },
    { name: "音范丝", url: "https://www.yinfans.me/", description: "4K蓝光圆盘下载", icon: "assets/images/logos/音范丝.png", category: "downloads" },
    { name: "综合资源区", url: "https://bbs.yiove.com/forum-4.htm", description: "影视资源网盘分享", icon: "assets/images/logos/综合资源区.png", category: "downloads" },
    { name: "字幕库", url: "https://srtku.com/", description: "字幕分享下载", icon: "assets/images/logos/字幕.png", category: "downloads" },
    { name: "伪射手网", url: "https://assrt.net/", description: "字幕下载", icon: "https://assrt.net/favicon.ico", category: "downloads" },
    { name: "书籍下载", url: "https://z-library.sk/", description: "书籍、小说下载", icon: "assets/images/logos/shuji.png", category: "downloads" },
    { name: "壁纸下载", url: "https://wallhaven.cc/", description: "海量壁纸下载", icon: "https://wallhaven.cc/favicon.ico", category: "downloads" },

    { name: "白描网页", url: "https://web.baimiaoapp.com/", description: "图片转文字、图片文字提取", icon: "assets/images/logos/白描网页.png", category: "tools", featured: true, popular: true },
    { name: "图片放大", url: "http://waifu2x.udp.jp/", description: "waifu", icon: "http://waifu2x.udp.jp/favicon.ico", category: "tools" },
    { name: "小工具", url: "https://benisland.neocities.org/petpet/", description: "一个有趣的小工具", icon: "https://benisland.neocities.org/petpet/favicon.ico", category: "tools" },
    { name: "在线ps", url: "https://zaixianps.net/", description: "一键p图抠图工具", icon: "assets/images/logos/inoreader.jpg", category: "tools", popular: true },
    { name: "房贷计算器", url: "https://fangdai.gitapp.cn", description: "房贷利率计算器", icon: "assets/images/logos/awesome_design_systems.png", category: "tools" },
    { name: "m3u8在线播放器", url: "https://m3u8player.org/", description: "m3u8/hls在线播放", icon: "assets/images/logos/Material_Design.png", category: "tools" },
    { name: "在线工具助手", url: "https://tool.gitapp.cn", description: "一些常见的开发工具", icon: "assets/images/logos/mdx.png", category: "tools", featured: true, popular: true },
    { name: "IFIXIT", url: "https://zh.ifixit.com/", description: "免费维修指南", icon: "https://zh.ifixit.com/favicon.ico", category: "tools", recent: true },
    { name: "Resizeon", url: "https://resizeon.com/zh-cn/", description: "在线图片尺寸调整工具", icon: "assets/images/logos/Resizeon.png", category: "tools", recent: true },

    { name: "App Store价格查询", url: "https://app.vbr.me/", description: "查询全球应用定价", icon: "https://app.vbr.me/favicon.ico", category: "ios", recent: true },
    { name: "IOS屏蔽系统更新", url: "https://f.itsnebula.net/noota-26.mobileconfig", description: "描述性文件。", icon: "assets/images/logos/IOS屏蔽更新.png", category: "ios", recent: true },
    { name: "iPhone壁纸", url: "https://applewalls.com/", description: "原图无损无水印", icon: "https://applewalls.com/favicon.ico", category: "ios", recent: true },
    { name: "图标下载", url: "https://jiejingku.net/icon/", description: "IOS应用图标下载", icon: "assets/images/logos/IOS图标.png", category: "ios", recent: true },

    { name: "瞬爆修改器", url: "http://kaboomtrainer.com/", description: "GTA5线下修改器", icon: "assets/images/logos/瞬爆修改器.png", category: "games", recent: true },
    { name: "5百丁", url: "http://ppt.500d.me/", description: "中国领先的PPT模板共享平台。", icon: "assets/images/logos/500d.png", category: "ppt", recent: true }
  ],
  friends: [
    { name: "CSDN", url: "https://csdn.net", description: "程序员社区" },
    { name: "程序设计网", url: "https://gitapp.cn/", description: "程序设计网" },
    { name: "掘金社区", url: "https://juejin.im", description: "掘金社区" },
    { name: "阿里云社区", url: "https://aliyun.com", description: "阿里云社区" }
  ]
});
