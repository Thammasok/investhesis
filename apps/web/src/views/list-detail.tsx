import { useParams } from 'react-router'
import { PagePlaceholder } from '@/components/page-placeholder'

export function Component() {
  const { id } = useParams()
  return <PagePlaceholder title={`List ${id ?? ''}`.trim()} description="The stocks in one list; add and remove them." />
}
