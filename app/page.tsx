import { Button } from '~/components/ui/button'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">cali.so v2</h1>
      <Button asChild>
        <a href="https://github.com/CaliCastle/cali.so">Work in progress</a>
      </Button>
    </main>
  )
}
