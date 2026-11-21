import { useParams } from 'react-router'
import { PagePlaceholder } from '@/components/page-placeholder'

export function Component() {
  const { id } = useParams()

  return (
    <PagePlaceholder
      title={`Stock ${id ?? ''}`.trim()}
      description="Lens values, financials and dated thesis notes for one stock."
    />
  )
}
