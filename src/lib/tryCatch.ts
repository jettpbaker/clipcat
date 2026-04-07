export default async function tryCatch<T>(promise: Promise<T>): Promise<[Error, null] | [null, T]> {
  try {
    return [null, await promise]
  } catch (e) {
    return [e as Error, null]
  }
}
