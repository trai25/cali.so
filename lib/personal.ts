// The personal registry — the one file to edit when life moves on.
// Sources: v1 site resume data + posts; see docs/handoff.md.

export interface Experience {
  company: string
  role: string
  roleEn?: string
  from: number
  to?: number
  url?: string
}

export const experience: Experience[] = [
  { company: '佐玩 Zolplay', role: '创始人 & CEO', roleEn: 'Founder & CEO', from: 2021, url: 'https://zolplay.com' },
  { company: 'very very spaceship', role: 'Software Engineer II', from: 2018, to: 2020 },
  { company: '8ninths', role: 'Full-stack & AR Engineer', from: 2017, to: 2018 },
  { company: 'Abletive 电子音乐社区', role: '创始人 & 独立开发者', roleEn: 'Founder & indie dev', from: 2014, to: 2016 },
]

export interface Record_ {
  artist: string
  album: string
  year: number
  url?: string
  /** optional sleeve art dropped into public/images/records/ */
  art?: string
}

// 定番唱片 — the definitive five
export const records: Record_[] = [
  { artist: 'twenty one pilots', album: 'Breach', year: 2025, art: '/images/records/breach.jpg', url: 'https://music.apple.com/us/album/breach/1810510521' },
  { artist: 'twenty one pilots', album: 'Trench', year: 2018, art: '/images/records/trench.jpg', url: 'https://music.apple.com/us/album/trench/1422828208' },
  { artist: 'J. Cole', album: 'The Fall Off', year: 2026, art: '/images/records/the-fall-off.jpg', url: 'https://music.apple.com/us/album/the-fall-off/1846097603' },
  { artist: 'The Weeknd', album: 'After Hours', year: 2020, art: '/images/records/after-hours.jpg', url: 'https://music.apple.com/us/album/after-hours/1499378108' },
  { artist: 'Eminem', album: 'The Death of Slim Shady', year: 2024, art: '/images/records/death-of-slim-shady.jpg', url: 'https://music.apple.com/us/album/the-death-of-slim-shady-coup-de-gr%C3%A2ce/1755106421' },
]

export interface Book {
  title: string
  author: string
  /** cover image in public/images/books/ */
  art?: string
  /** spine width in px (18–38 looks right) */
  spine?: number
  /** spine tone 0-4, varies the shelf */
  tone?: number
  url?: string
}

// 书架 — 测试数据（TODO(Cali): 换成你真正的心头书；封面图放
// public/images/books/，node 脚本或手动均可）
export const books: Book[] = [
  { title: 'Identity Designed', author: 'David Airey', art: '/images/books/identity-designed.jpg', spine: 34, tone: 0 },
  { title: 'How to', author: 'Michael Bierut', art: '/images/books/how-to.jpg', spine: 30, tone: 1 },
  { title: 'The Creative Act', author: 'Rick Rubin', art: '/images/books/creative-act.jpg', spine: 24, tone: 2 },
  { title: 'Thinking with Type', author: 'Ellen Lupton', art: '/images/books/thinking-with-type.jpg', spine: 22, tone: 3 },
  { title: 'Universal Principles of UX', author: 'Irene Pereyra', art: '/images/books/universal-principles-ux.jpg', spine: 26, tone: 1 },
  { title: 'Rework', author: 'Jason Fried & DHH', art: '/images/books/rework.jpg', spine: 20, tone: 2, url: 'https://basecamp.com/books/rework' },
]

// 电影 — 测试数据（TODO(Cali): 换成你反复重看的那些）
export interface Film {
  title: string
  titleEn?: string
  year: number
  director: string
}

export const films: Film[] = [
  { title: '星际穿越', titleEn: 'Interstellar', year: 2014, director: 'Christopher Nolan' },
  { title: '她', titleEn: 'Her', year: 2013, director: 'Spike Jonze' },
  { title: '银翼杀手 2049', titleEn: 'Blade Runner 2049', year: 2017, director: 'Denis Villeneuve' },
  { title: '社交网络', titleEn: 'The Social Network', year: 2010, director: 'David Fincher' },
  { title: '爆裂鼓手', titleEn: 'Whiplash', year: 2014, director: 'Damien Chazelle' },
]
