/** Maharashtra-only institute flow: resolve district / taluka from India Post pin data. */

const MH = 'Maharashtra'

export type PincodeLookupOk = { district: string; taluka: string; state: typeof MH }

type PostalOffice = {
  District?: string
  State?: string
  Block?: string
  Name?: string
}

export async function lookupMaharashtraFromPincode(pin: string): Promise<PincodeLookupOk> {
  const digits = pin.replace(/\D/g, '')
  if (digits.length !== 6) {
    throw new Error('Pincode must be 6 digits.')
  }

  const url = import.meta.env.DEV
    ? `/api-pincode/pincode/${digits}`
    : `https://api.postalpincode.in/pincode/${digits}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pincode lookup failed (${res.status}).`)
  const raw = (await res.json()) as unknown
  // API returns either [{ Status, PostOffice }] or a single object — normalize to one payload.
  const data = (Array.isArray(raw) ? raw[0] : raw) as {
    Status?: string
    Message?: string
    PostOffice?: PostalOffice[] | null
  }

  if (data.Status !== 'Success' || !data.PostOffice?.length) {
    throw new Error(
      data.Message && data.Message !== 'Error' ? data.Message : 'No data for this pincode.',
    )
  }

  const inMh = data.PostOffice.filter((o) => (o.State || '').trim() === MH)
  const offices = inMh.length ? inMh : data.PostOffice
  const first = offices[0]
  if ((first.State || '').trim() !== MH) {
    throw new Error('This pincode is not in Maharashtra.')
  }

  const district = (first.District || '').trim()
  const taluka = (first.Block || first.Name || '').trim()
  if (!district) throw new Error('Could not read district for this pincode.')

  return { district, taluka, state: MH }
}
