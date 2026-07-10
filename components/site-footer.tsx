export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-[37.5rem] px-6 pb-12">
      <div className="hairline-top flex items-baseline justify-between pt-6 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Cali Castle</p>
        <div className="flex gap-4">
          <a
            href="https://x.com/thecalicastle"
            className="transition-colors duration-150 ease-[ease] hover:text-foreground"
          >
            X
          </a>
          <a
            href="https://github.com/CaliCastle"
            className="transition-colors duration-150 ease-[ease] hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}
