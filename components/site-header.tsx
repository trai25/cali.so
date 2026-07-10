import Link from 'next/link'

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-2xl items-baseline justify-between px-6 py-8">
      <Link href="/" className="font-medium tracking-tight">
        Cali Castle
      </Link>
      <nav className="flex gap-6 text-sm">
        <Link
          href="/blog"
          className="text-muted-foreground transition-colors duration-150 ease-[ease] hover:text-foreground"
        >
          写作
        </Link>
      </nav>
    </header>
  )
}
