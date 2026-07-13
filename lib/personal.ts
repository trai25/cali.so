// The personal registry — the one file to edit when life moves on.
// Sources: v1 site resume data + posts; see docs/handoff.md.

export interface Experience {
  company: string
  companyEn: string
  role: string
  roleEn?: string
  from: number
  to?: number
  url?: string
}

export const experience: Experience[] = [
  { company: '佐玩 Zolplay', companyEn: 'Zolplay', role: '创始人 & CEO', roleEn: 'Founder & CEO', from: 2021, url: 'https://zolplay.com' },
  { company: 'very very spaceship', companyEn: 'very very spaceship', role: 'Software Engineer II', from: 2018, to: 2020 },
  { company: '8ninths', companyEn: '8ninths', role: 'Full-stack & AR Engineer', from: 2017, to: 2018 },
  { company: 'Abletive 电子音乐社区', companyEn: 'Abletive Electronic Music Community', role: '创始人 & 独立开发者', roleEn: 'Founder & indie dev', from: 2014, to: 2016 },
]

export interface Record_ {
  artist: string
  album: string
  year: number
  genre: string
  spineColor: string
  spineInk: string
  url?: string
  /** optional sleeve art dropped into public/images/records/ */
  art?: string
}

// 定番唱片 — spine colors are sampled once from the local cover art.
export const records: Record_[] = [
  { artist: 'twenty one pilots', album: 'Trench', year: 2018, genre: 'Alternative', spineColor: '#38351e', spineInk: '#f7f4ed', art: '/images/records/trench.jpg', url: 'https://music.apple.com/us/album/trench/1422828208' },
  { artist: 'Avicii', album: 'TIM', year: 2019, genre: 'Dance', spineColor: '#8f8a89', spineInk: '#171717', art: '/images/records/tim.jpg', url: 'https://music.apple.com/us/album/tim/1462628887' },
  { artist: 'J. Cole', album: 'The Fall-Off', year: 2026, genre: 'Hip-Hop/Rap', spineColor: '#a07e75', spineInk: '#171717', art: '/images/records/the-fall-off.jpg', url: 'https://music.apple.com/us/album/the-fall-off/1875080726' },
  { artist: 'NF', album: 'HOPE', year: 2023, genre: 'Hip-Hop/Rap', spineColor: '#353f3f', spineInk: '#f7f4ed', art: '/images/records/hope.jpg', url: 'https://music.apple.com/us/album/hope/1670412644' },
  { artist: 'twenty one pilots', album: 'Breach', year: 2025, genre: 'Alternative', spineColor: '#762b27', spineInk: '#f7f4ed', art: '/images/records/breach.jpg', url: 'https://music.apple.com/us/album/breach/1827507396' },
  { artist: 'CRO', album: 'Melodie', year: 2014, genre: 'Hip-Hop/Rap', spineColor: '#cac9cb', spineInk: '#171717', art: '/images/records/melodie.jpg', url: 'https://music.apple.com/us/album/melodie/1806154705' },
  { artist: 'The Weeknd', album: 'After Hours', year: 2020, genre: 'R&B/Soul', spineColor: '#423427', spineInk: '#f7f4ed', art: '/images/records/after-hours.jpg', url: 'https://music.apple.com/us/album/after-hours/1499378108' },
  { artist: 'Dr. Dre', album: '2001', year: 1999, genre: 'Hip-Hop/Rap', spineColor: '#08090a', spineInk: '#f7f4ed', art: '/images/records/2001.jpg', url: 'https://music.apple.com/us/album/2001/1440782221' },
  { artist: 'Eminem', album: 'The Death of Slim Shady (Coup De Grâce)', year: 2024, genre: 'Hip-Hop/Rap', spineColor: '#1c1420', spineInk: '#f7f4ed', art: '/images/records/death-of-slim-shady.jpg', url: 'https://music.apple.com/us/album/the-death-of-slim-shady-coup-de-gr%C3%A2ce/1755022177' },
]

export interface Book {
  title: string
  author: string
  year: number
  category: string
  spineTitle?: string
  spineAuthor?: string
  spineColor: string
  spineInk: string
  /** cover image in public/images/books/ */
  art?: string
  /** intrinsic cover dimensions; the shelf derives its uncropped display width */
  coverWidth?: number
  coverHeight?: number
  /** spine width in px (18–38 looks right) */
  spine?: number
  url?: string
}

// 书架 — ordered by relevance to Cali's design, creative, and founder work.
export const books: Book[] = [
  { title: 'Grid Systems in Graphic Design', spineTitle: 'Grid Systems', spineAuthor: 'JMB', author: 'Josef Müller-Brockmann', year: 1981, category: 'Graphic Design', spineColor: '#df6029', spineInk: '#171717', art: '/images/books/grid-systems.jpg', coverWidth: 411, coverHeight: 600, spine: 24, url: 'https://niggli.ch/en/products/rastersysteme-fur-die-visuelle-gestaltung' },
  { title: 'Refactoring UI', spineAuthor: 'AW+SS', author: 'Adam Wathan & Steve Schoger', year: 2018, category: 'UI Design', spineColor: '#2e3849', spineInk: '#f7f4ed', art: '/images/books/refactoring-ui.jpg', coverWidth: 758, coverHeight: 1014, spine: 24, url: 'https://refactoringui.com/' },
  { title: 'Universal Principles of UX', spineTitle: 'Universal UX', spineAuthor: 'IP', author: 'Irene Pereyra', year: 2023, category: 'UX Design', spineColor: '#2d292a', spineInk: '#f7f4ed', art: '/images/books/universal-principles-ux.jpg', coverWidth: 536, coverHeight: 628, spine: 24, url: 'https://www.quarto.com/books/9780760378045/universal-principles-of-ux' },
  { title: 'Just Enough Design', spineTitle: 'Just Enough', spineAuthor: 'TS', author: 'Taku Satoh', year: 2022, category: 'Design', spineColor: '#e4e3e3', spineInk: '#171717', art: '/images/books/just-enough-design.jpg', coverWidth: 714, coverHeight: 1000, spine: 24, url: 'https://www.chroniclebooks.com/products/just-enough-design-pb' },
  { title: 'The Creative Act', spineTitle: 'Creative Act', spineAuthor: 'RR', author: 'Rick Rubin', year: 2023, category: 'Creativity', spineColor: '#b8bcb4', spineInk: '#171717', art: '/images/books/creative-act.jpg', coverWidth: 306, coverHeight: 450, spine: 24, url: 'https://www.penguinrandomhouse.com/books/717356/the-creative-act-by-rick-rubin/' },
  { title: 'Steal Like an Artist', spineTitle: 'Steal Like Art', spineAuthor: 'AK', author: 'Austin Kleon', year: 2012, category: 'Creativity', spineColor: '#443b3d', spineInk: '#f7f4ed', art: '/images/books/steal-like-an-artist.jpg', coverWidth: 1200, coverHeight: 1193, spine: 22, url: 'https://workman.com/titles/austin-kleon/steal-like-an-artist/9780761169253/' },
  { title: 'Show Your Work!', spineAuthor: 'AK', author: 'Austin Kleon', year: 2014, category: 'Creativity', spineColor: '#c6a30d', spineInk: '#171717', art: '/images/books/show-your-work.jpg', coverWidth: 1200, coverHeight: 1200, spine: 22, url: 'https://workman.com/titles/austin-kleon/show-your-work/9780761178972/' },
  { title: 'Build', spineAuthor: 'TF', author: 'Tony Fadell', year: 2022, category: 'Product & Leadership', spineColor: '#d1d0d1', spineInk: '#171717', art: '/images/books/build.jpg', coverWidth: 429, coverHeight: 648, spine: 22, url: 'https://www.harpercollins.com/products/build-tony-fadell' },
  { title: 'Rework', spineAuthor: 'JF+DHH', author: 'Jason Fried & DHH', year: 2010, category: 'Business', spineColor: '#352f31', spineInk: '#f7f4ed', art: '/images/books/rework.png', coverWidth: 600, coverHeight: 905, spine: 20, url: 'https://basecamp.com/books/rework' },
  { title: 'The Great CEO Within', spineTitle: 'Great CEO', spineAuthor: 'MM', author: 'Matt Mochary', year: 2019, category: 'Leadership', spineColor: '#200f1b', spineInk: '#f7f4ed', art: '/images/books/great-ceo-within.jpg', coverWidth: 625, coverHeight: 1000, spine: 24, url: 'https://www.amazon.com/Great-CEO-Within-Tactical-Building/dp/0578599287' },
  { title: 'Make Something Wonderful: Steve Jobs in His Own Words', spineTitle: 'Make Something', spineAuthor: 'SJ', author: 'Steve Jobs', year: 2023, category: 'Biography & Memoir', spineColor: '#928c86', spineInk: '#171717', art: '/images/books/make-something-wonderful.jpg', coverWidth: 626, coverHeight: 996, spine: 26, url: 'https://book.stevejobsarchive.com/' },
  { title: 'How to American', spineAuthor: 'JOY', author: 'Jimmy O. Yang', year: 2018, category: 'Memoir', spineColor: '#4f4d50', spineInk: '#f7f4ed', art: '/images/books/how-to-american.jpg', coverWidth: 787, coverHeight: 1200, spine: 22, url: 'https://www.hachettebookgroup.com/titles/jimmy-o-yang/how-to-american/9780306903502/' },
  { title: 'Sword of Destiny', spineAuthor: 'AS', author: 'Andrzej Sapkowski', year: 1992, category: 'Fantasy', spineColor: '#b7b6ba', spineInk: '#171717', art: '/images/books/sword-of-destiny.jpg', coverWidth: 801, coverHeight: 1200, spine: 24, url: 'https://www.hachettebookgroup.com/titles/andrzej-sapkowski/sword-of-destiny/9780316389716/' },
  { title: 'Hustle Harder, Hustle Smarter', spineTitle: 'Hustle Smarter', spineAuthor: '50', author: '50 Cent', year: 2020, category: 'Business & Memoir', spineColor: '#60534c', spineInk: '#f7f4ed', art: '/images/books/hustle-harder.jpg', coverWidth: 428, coverHeight: 648, spine: 22, url: 'https://www.harpercollins.com/products/hustle-harder-hustle-smarter-curtis-50-cent-jackson' },
  { title: 'The Subtle Art of Not Giving a F*ck', spineTitle: 'The Subtle Art', spineAuthor: 'MM', author: 'Mark Manson', year: 2016, category: 'Self-Help', spineColor: '#ce470e', spineInk: '#171717', art: '/images/books/subtle-art.jpg', coverWidth: 667, coverHeight: 1000, spine: 26, url: 'https://www.harpercollins.com/products/the-subtle-art-of-not-giving-a-fck-mark-manson' },
]
