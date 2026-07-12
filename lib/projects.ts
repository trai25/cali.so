// Project registry (ported from v1's Sanity data) — edit freely.
export interface Project {
  name: string
  description: string
  descriptionEn?: string
  url: string
}

export const projects: Project[] = [
  {
    name: '佐玩官网',
    description: '为自己的公司佐玩设计开发的官网，简约的设计结合噪点材质感。',
    descriptionEn: 'Company site for Zolplay — minimal design with a grain texture.',
    url: 'https://zolplay.com',
  },
  {
    name: 'Well Word',
    description: '5×5 英语拼字游戏。',
    descriptionEn: 'A 5×5 English word game.',
    url: 'https://wellwordgame.com/zh-CN',
  },
  {
    name: 'ChatGPT Slack 机器人',
    description: '公司内部 Slack 的雏形版 ChatGPT 机器人。',
    descriptionEn: 'An early ChatGPT bot for the company Slack.',
    url: 'https://github.com/zolplay-cn/chatgpt-slack',
  },
  {
    name: 'Raycast · 苹果开发者文档',
    description: '在 Raycast 里快速搜索 Apple Developer 文档。',
    descriptionEn: 'Search Apple Developer docs from Raycast.',
    url: 'https://www.raycast.com/cali/apple-developer-docs',
  },
  {
    name: 'Raycast · 亮度调节',
    description: '第一款 Raycast 插件，调节屏幕亮度。',
    descriptionEn: 'My first Raycast extension — screen brightness control.',
    url: 'https://www.raycast.com/cali/brightness-control',
  },
  {
    name: 'BuckBank 元钞银行',
    description: 'Slack 里的虚拟经济系统：买 emoji 股份、幸运大转盘、转账。',
    descriptionEn: 'A virtual economy for Slack: emoji stocks, lucky wheel, transfers.',
    url: 'https://twitter.com/thecalicastle/status/1663601110916149251',
  },
  {
    name: 'PopMenu',
    description: '大学期间写的 iOS 弹出菜单开源库。',
    descriptionEn: 'An open-source iOS pop-up menu library from my college days.',
    url: 'https://github.com/CaliCastle/PopMenu',
  },
]
