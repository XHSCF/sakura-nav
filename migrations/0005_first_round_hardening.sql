CREATE INDEX IF NOT EXISTS idx_visitor_events_minute_bucket ON visitor_events(minute_bucket);

UPDATE sites SET description = '多地区漫画免费看，无广告。', updated_at = CURRENT_TIMESTAMP WHERE id = 'mycomic';
UPDATE sites SET description = '跨平台转换并迁移音乐歌单。', updated_at = CURRENT_TIMESTAMP WHERE id = 'gomusic';
UPDATE sites SET description = '抖音无水印视频解析快捷指令。', updated_at = CURRENT_TIMESTAMP WHERE id = 'douyin-parser';
UPDATE sites SET description = 'App Store 应用 IPA 解密下载。', updated_at = CURRENT_TIMESTAMP WHERE id = 'unfaird';
UPDATE sites SET description = '已购小火箭共享 Apple ID。', updated_at = CURRENT_TIMESTAMP WHERE id = 'shadowrocket-apple-id';
UPDATE sites SET description = '日漫追番软件，解锁会员免广告。', updated_at = CURRENT_TIMESTAMP WHERE id = 'ciyuancheng-anime';
UPDATE sites SET description = '免费开源的 BT 下载客户端。', updated_at = CURRENT_TIMESTAMP WHERE id = 'qbittorrent';
UPDATE sites SET description = '支持 BT、HTTP 与 FTP 下载。', updated_at = CURRENT_TIMESTAMP WHERE id = 'bitcomet';
UPDATE sites SET description = '支持多格式与硬件加速的播放器。', updated_at = CURRENT_TIMESTAMP WHERE id = 'potplayer';
UPDATE sites SET description = '免费开源的文件压缩与解压工具。', updated_at = CURRENT_TIMESTAMP WHERE id = '7-zip';
UPDATE sites SET description = '网红与明星黑料爆料。', updated_at = CURRENT_TIMESTAMP WHERE id = 'heiliaowang';
UPDATE sites SET description = '去广告、内容免费看的短视频应用。', updated_at = CURRENT_TIMESTAMP WHERE id = '91douyin';
UPDATE sites SET description = '去广告美化版；密码 qiuyuezt。', updated_at = CURRENT_TIMESTAMP WHERE id = 'jinman-tiantang';
