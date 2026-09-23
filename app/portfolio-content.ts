export type PortfolioProject = {
  id: string;
  name: string;
  category: string;
  summary: string;
  features: string[];
  tags: string[];
  status: string;
  statusNote: string;
  image?: string;
  imageCaption?: string;
  compactImage?: boolean;
  url?: string;
};

// Descriptions verified against each project's local source, September 2026.
// Local development addresses are intentionally not presented as public links.
export const projects: PortfolioProject[] = [
  {
    id: 'scenespeak',
    name: 'SceneSpeak',
    category: '场景口语练习',
    summary: '从场景原声出发，把盲听、逐句练习和角色对练连接起来。',
    features: ['场景片库与整段盲听、字幕解锁', '逐句播放、循环练习和录音回听', '原声角色对练与个人音频导入'],
    tags: ['Flutter', 'Dart', '英语学习'],
    status: 'MVP 开发中',
    statusNote: '已有电脑预览和 VOA 样例流程，Android 真机验收与更多课程校准待完成。',
    image: '/projects/scenespeak.png',
    imageCaption: '已有版本的场景片库界面',
  },
  {
    id: 'prompt-orb',
    name: '提示词悬浮球',
    category: '桌面工具',
    summary: '把常用提示词收进桌面悬浮胶囊，随时搜索、整理和复制。',
    features: ['新增、编辑、删除、收藏与分类筛选', '实时搜索与一键复制', '本地保存与 JSON 导出备份'],
    tags: ['Electron', 'React', 'TypeScript'],
    status: '本地可用版本',
    statusNote: '已有免安装版本，正式安装包与公开分发尚未完成。',
    image: '/projects/prompt-orb.png',
    imageCaption: '实际桌面悬浮胶囊截图',
    compactImage: true,
  },
  {
    id: 'ai-radar',
    name: 'AI 成果雷达',
    category: '信息工具',
    summary: '把公开来源中的 AI 工具、Agent 与开源项目整理成便于浏览的中文卡片。',
    features: ['聚合公开来源并保留缓存', '关键词搜索与分类筛选', '收藏卡片、复制摘要与打开原始链接'],
    tags: ['Node.js', 'JavaScript', '信息聚合'],
    status: '本地网页版本',
    statusNote: '已实现前后端，外部数据源的持续可用性仍需维护。',
  },

  {
    id: 'concept-lab',
    name: '奇想实验室',
    category: '互动学习',
    summary: '输入一个概念，在四次选择中观察后果，再揭开概念的解释。',
    features: ['输入概念生成带目标的学习关卡', '四次行动与三项动态状态反馈', '结尾提供定义、故事映射和检验问题'],
    tags: ['React', 'Vite', 'Node.js'],
    status: '本地原型',
    statusNote: '已实现模型路由与无 Key 演示模式，历史记录和作答反馈仍在计划中。',
    image: '/projects/concept-lab.png',
    imageCaption: '概念输入与开始实验界面；连接状态为截图时的状态',
  },
  {
    id: 'rewind-room',
    name: '房间倒带',
    category: '3D 时间解谜游戏',
    summary: '倒带碎片、恢复断桥、记录行动回声，在日落前打开房间的出口。',
    features: ['第一人称探索与三个连续时间机关', '单物体倒带、小车过桥和行动回声重演', '键盘与屏幕按键、暂停、失败重试和通关结尾'],
    tags: ['Three.js', 'TypeScript', '3D 游戏'],
    status: '可玩原型',
    statusNote: '浏览器内可玩，当前包含一个完整房间；也可从工作室的电视进入。',
    url: '/games/rewind',
  },
];
