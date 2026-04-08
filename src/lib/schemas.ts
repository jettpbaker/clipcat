import { z } from 'zod'

const processSchema = z.object({
  key: z.string().min(1),
  start: z.coerce.number().nonnegative(),
  end: z.coerce.number().positive(),
  game: z.string().min(1),
})

export default processSchema
