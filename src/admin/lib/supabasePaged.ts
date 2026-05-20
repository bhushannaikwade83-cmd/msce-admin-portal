/** PostgREST returns at most 1000 rows per request; paginate with `.range()`. */
export const SUPABASE_PAGE_SIZE = 1000

export async function fetchAllPaged<T = Record<string, unknown>>(
  run: (rangeFrom: number, rangeTo: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
): Promise<T[]> {
  const out: T[] = []
  let rangeFrom = 0
  for (;;) {
    const rangeTo = rangeFrom + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await Promise.resolve(run(rangeFrom, rangeTo))
    if (error) throw new Error(error.message)
    const chunk = data ?? []
    out.push(...chunk)
    if (chunk.length < SUPABASE_PAGE_SIZE) break
    rangeFrom += SUPABASE_PAGE_SIZE
  }
  return out
}
