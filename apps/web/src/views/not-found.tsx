import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function Component() {
  return (
    <section className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">There is no page at this address.</p>
      <Button asChild>
        <Link to="/stocks">Go to stocks</Link>
      </Button>
    </section>
  )
}
